"""
FastAPI router — all endpoints require a valid JWT (Supabase or payroll-system issued).
The two-step SMS flow is enforced at the service layer, not just the router.
"""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import Actions, write_audit
from app.database import get_db
from app.direct_deposit import (
    DirectDepositError,
    add_account,
    delete_account,
    get_accounts,
    update_account,
)
from app.schemas import (
    AccountSummary,
    DirectDepositSettings,
    InitiateChangeRequest,
    InitiateChangeResponse,
    InitiateDeleteRequest,
    TokenData,
    VerifyAndCommitRequest,
    VerifyResponse,
)
from app.security import verify_jwt
from app.sms import send_confirmation_sms
from app.verification import VerificationError, initiate_verification, verify_and_return_intent
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/api/v1/direct-deposit", tags=["direct-deposit"])
bearer = HTTPBearer()


# ── Auth dependency ───────────────────────────────────────────────────────────

async def get_current_employee(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
) -> TokenData:
    try:
        return verify_jwt(creds.credentials)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc))


def _ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    return forwarded.split(",")[0].strip() if forwarded else (request.client.host or "unknown")


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/", response_model=DirectDepositSettings, summary="View current direct deposit settings")
async def view_settings(
    employee: TokenData = Depends(get_current_employee),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    await write_audit(db, employee.employee_id, Actions.SETTINGS_VIEWED, ip_address=_ip(request))
    return await get_accounts(db, employee.employee_id)


@router.post(
    "/initiate",
    response_model=InitiateChangeResponse,
    summary="Step 1 — submit bank details and trigger SMS verification",
)
async def initiate_add_or_update(
    body: InitiateChangeRequest,
    account_id: UUID | None = None,
    employee: TokenData = Depends(get_current_employee),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """
    Accepts new bank details and sends a 6-digit SMS code.
    Optionally accepts `account_id` query param to indicate an update vs add.

    The bank details are encrypted and held as 'intent' inside the verification
    record until the code is confirmed in the /verify endpoint.
    """
    action = "update" if account_id else "add"
    intent = {
        "action": action,
        "account_id": str(account_id) if account_id else None,
        "account": body.account.model_dump(),
    }

    try:
        record = await initiate_verification(
            db=db,
            employee=employee,
            action=action,
            intent=intent,
            ip_address=_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    except VerificationError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc))

    return InitiateChangeResponse(
        verification_id=record.id,
        phone_last4=record.phone_last4,
        expires_in_sec=settings.SMS_CODE_TTL_SECONDS,
        message=f"A 6-digit code has been sent to your phone ending in {record.phone_last4}.",
    )


@router.post(
    "/verify",
    response_model=VerifyResponse,
    summary="Step 2 — enter SMS code to commit changes",
)
async def verify_and_commit(
    body: VerifyAndCommitRequest,
    employee: TokenData = Depends(get_current_employee),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    """
    Validates the SMS code.  On success, commits the pending bank account
    add/update to the database and sends a confirmation SMS.
    """
    try:
        intent = await verify_and_return_intent(
            db=db,
            employee_id=employee.employee_id,
            verification_id=body.verification_id,
            submitted_code=body.code,
            ip_address=_ip(request),
        )
    except VerificationError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc))

    try:
        action     = intent["action"]
        account_id = intent.get("account_id")

        from app.schemas import BankAccountInput
        inp = BankAccountInput(**intent["account"])

        if action == "add":
            account = await add_account(
                db, employee.employee_id, inp, _ip(request), body.verification_id
            )
        elif action == "update":
            account = await update_account(
                db, employee.employee_id, UUID(account_id), inp, _ip(request), body.verification_id
            )
        else:
            raise DirectDepositError("Unknown action in intent.", 400)

    except DirectDepositError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc))

    # Non-blocking confirmation SMS
    if employee.phone:
        send_confirmation_sms(employee.phone, action, account.account_number_last4)

    return VerifyResponse(
        success=True,
        message="Direct deposit account saved successfully.",
        account=AccountSummary(
            id=account.id,
            bank_name=account.bank_name,
            account_type=account.account_type,
            account_last4=account.account_number_last4,
            deposit_type=account.deposit_type,
            deposit_value=account.deposit_value,
            priority=account.priority,
            is_active=account.is_active,
            prenote_cleared=account.prenote_cleared_at is not None,
            created_at=account.created_at,
        ),
    )


@router.post(
    "/delete/initiate",
    response_model=InitiateChangeResponse,
    summary="Step 1 — trigger SMS before deleting an account",
)
async def initiate_delete(
    body: InitiateDeleteRequest,
    employee: TokenData = Depends(get_current_employee),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    intent = {"action": "delete", "account_id": str(body.account_id)}

    try:
        record = await initiate_verification(
            db=db,
            employee=employee,
            action="delete",
            intent=intent,
            ip_address=_ip(request),
            user_agent=request.headers.get("User-Agent"),
        )
    except VerificationError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc))

    return InitiateChangeResponse(
        verification_id=record.id,
        phone_last4=record.phone_last4,
        expires_in_sec=settings.SMS_CODE_TTL_SECONDS,
        message=f"Enter the code sent to your phone ending in {record.phone_last4} to confirm removal.",
    )


@router.post(
    "/delete/verify",
    response_model=VerifyResponse,
    summary="Step 2 — confirm account deletion with SMS code",
)
async def verify_and_delete(
    body: VerifyAndCommitRequest,
    employee: TokenData = Depends(get_current_employee),
    db: AsyncSession = Depends(get_db),
    request: Request = None,
):
    try:
        intent = await verify_and_return_intent(
            db=db,
            employee_id=employee.employee_id,
            verification_id=body.verification_id,
            submitted_code=body.code,
            ip_address=_ip(request),
        )
    except VerificationError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc))

    try:
        await delete_account(
            db, employee.employee_id, UUID(intent["account_id"]),
            _ip(request), body.verification_id,
        )
    except DirectDepositError as exc:
        raise HTTPException(status_code=exc.http_status, detail=str(exc))

    if employee.phone:
        send_confirmation_sms(employee.phone, "delete", "****")

    return VerifyResponse(success=True, message="Direct deposit account removed.")


# ── Internal / admin endpoints ────────────────────────────────────────────────

@router.post(
    "/internal/prenote-cleared/{account_id}",
    summary="[Internal] Mark pre-note as cleared after ACH return window",
    include_in_schema=not settings.is_production,
)
async def mark_prenote_cleared(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    # Add admin auth check here in production
):
    from app.direct_deposit import clear_prenote
    await clear_prenote(db, account_id)
    return {"status": "prenote_cleared", "account_id": str(account_id)}
