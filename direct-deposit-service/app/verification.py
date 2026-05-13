"""
SMS 2FA verification service.

Flow:
  1. initiate_verification()   — generate code, store hash, send SMS
  2. verify_and_return_intent() — validate code, return encrypted intent
  3. (caller commits the intent to the DB)
"""
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import Actions, write_audit
from app.config import get_settings
from app.models import SMSVerificationCode
from app.rate_limit import (
    clear_fail_counter,
    is_otp_issuance_allowed,
    is_verification_locked,
    record_failed_attempt,
)
from app.schemas import TokenData
from app.security import (
    encrypt_json,
    generate_code,
    generate_salt,
    hash_code,
    mask_phone,
    verify_code_hash,
)
from app.sms import SMSStatus, send_verification_sms

logger = logging.getLogger(__name__)
settings = get_settings()


class VerificationError(Exception):
    """Raised when verification fails; message is safe to surface to the user."""
    def __init__(self, message: str, http_status: int = 400):
        super().__init__(message)
        self.http_status = http_status


async def initiate_verification(
    db: AsyncSession,
    employee: TokenData,
    action: str,
    intent: dict,
    ip_address: str | None = None,
    user_agent: str | None = None,
) -> SMSVerificationCode:
    """
    Issue an OTP and return the pending SMSVerificationCode record.

    Raises VerificationError if:
      - rate limit exceeded
      - employee has no phone number
      - SMS delivery fails
    """
    # 1. Check phone
    if not employee.phone:
        raise VerificationError(
            "No phone number on file. Contact payroll to add a mobile number before enabling direct deposit.",
            http_status=422,
        )

    # 2. Rate limit
    allowed, reason = await is_otp_issuance_allowed(employee.employee_id, db)
    if not allowed:
        await write_audit(db, employee.employee_id, Actions.ACCESS_DENIED,
                          after={"reason": reason}, ip_address=ip_address)
        raise VerificationError(reason, http_status=429)

    # 3. Invalidate any existing unused codes for this employee+action
    existing = await db.execute(
        select(SMSVerificationCode).where(
            SMSVerificationCode.employee_id == employee.employee_id,
            SMSVerificationCode.action == action,
            SMSVerificationCode.is_used == False,  # noqa: E712
        )
    )
    for code_row in existing.scalars().all():
        code_row.is_used = True   # superseded

    # 4. Generate and hash the code
    raw_code = generate_code()
    salt     = generate_salt()
    code_hash = hash_code(raw_code, salt)

    # 5. Encrypt the intent payload
    intent_encrypted = encrypt_json(intent)

    # 6. Persist the verification record
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=settings.SMS_CODE_TTL_SECONDS)
    record = SMSVerificationCode(
        employee_id=employee.employee_id,
        code_hash=code_hash,
        code_salt=salt,
        action=action,
        intent_encrypted=intent_encrypted,
        phone_last4=mask_phone(employee.phone),
        expires_at=expires_at,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    db.add(record)
    await db.flush()   # get the UUID before sending SMS

    # 7. Send SMS
    result = send_verification_sms(
        phone_e164=employee.phone,
        code=raw_code,
        employee_name=(employee.full_name or "").split()[0] or "Employee",
    )

    if result.status == SMSStatus.FAILED:
        # Roll back — don't persist a code that was never delivered
        await db.rollback()
        raise VerificationError("Failed to send SMS. Please try again.", http_status=503)

    if result.status == SMSStatus.INVALID:
        await db.rollback()
        raise VerificationError(
            "The phone number on file is not SMS-capable. Contact payroll to update it.",
            http_status=422,
        )

    # 8. Audit
    await write_audit(
        db, employee.employee_id, Actions.OTP_ISSUED,
        after={"action": action, "phone_last4": record.phone_last4},
        ip_address=ip_address, user_agent=user_agent,
    )

    return record


async def verify_and_return_intent(
    db: AsyncSession,
    employee_id: str,
    verification_id: UUID,
    submitted_code: str,
    ip_address: str | None = None,
) -> dict:
    """
    Validate the submitted OTP and return the decrypted intent dict.

    Raises VerificationError on any failure.
    """
    # 1. Brute-force lock check
    if await is_verification_locked(employee_id):
        raise VerificationError(
            "Too many failed attempts. Your account is temporarily locked. Contact payroll.",
            http_status=429,
        )

    # 2. Fetch the record
    result = await db.execute(
        select(SMSVerificationCode).where(
            SMSVerificationCode.id == verification_id,
            SMSVerificationCode.employee_id == employee_id,
        )
    )
    record: SMSVerificationCode | None = result.scalar_one_or_none()

    if record is None:
        await write_audit(db, employee_id, Actions.OTP_FAILED,
                          after={"reason": "verification_id not found"}, ip_address=ip_address)
        raise VerificationError("Verification session not found.", http_status=404)

    # 3. Already used?
    if record.is_used:
        raise VerificationError("This code has already been used.", http_status=400)

    # 4. Expired?
    if datetime.now(timezone.utc) > record.expires_at:
        record.is_used = True
        await write_audit(db, employee_id, Actions.OTP_EXPIRED,
                          after={"verification_id": str(verification_id)}, ip_address=ip_address)
        raise VerificationError("Verification code has expired. Please request a new one.", http_status=400)

    # 5. Max attempts?
    if record.attempts >= settings.SMS_CODE_MAX_ATTEMPTS:
        record.is_used = True
        await write_audit(db, employee_id, Actions.OTP_FAILED,
                          after={"reason": "max_attempts_exceeded"}, ip_address=ip_address)
        raise VerificationError(
            f"Maximum attempts ({settings.SMS_CODE_MAX_ATTEMPTS}) exceeded. Request a new code.",
            http_status=400,
        )

    # 6. Verify the code (constant-time comparison)
    record.attempts += 1
    if not verify_code_hash(submitted_code, record.code_salt, record.code_hash):
        await record_failed_attempt(employee_id)
        remaining = settings.SMS_CODE_MAX_ATTEMPTS - record.attempts
        await write_audit(db, employee_id, Actions.OTP_FAILED,
                          after={"attempts": record.attempts, "remaining": remaining},
                          ip_address=ip_address)
        raise VerificationError(
            f"Incorrect code. {remaining} attempt{'s' if remaining != 1 else ''} remaining.",
            http_status=400,
        )

    # 7. Mark used, record verify timestamp
    record.is_used = True
    record.verified_at = datetime.now(timezone.utc)
    record.verified_ip = ip_address
    await clear_fail_counter(employee_id)

    # 8. Decrypt and return intent
    from app.security import decrypt_json
    intent = decrypt_json(record.intent_encrypted)

    await write_audit(
        db, employee_id, Actions.OTP_VERIFIED,
        after={"action": record.action, "verification_id": str(verification_id)},
        ip_address=ip_address, sms_code_id=record.id,
    )

    return intent
