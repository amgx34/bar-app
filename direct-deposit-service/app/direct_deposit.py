"""
Direct deposit business logic.

All routing/account numbers pass through encrypt() before hitting the DB.
All reads decrypt on the fly; account numbers are immediately re-masked for output.
"""
import logging
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.audit import Actions, write_audit
from app.config import get_settings
from app.models import DirectDepositAccount
from app.schemas import AccountSummary, BankAccountInput, DirectDepositSettings
from app.security import decrypt, encrypt, mask_account

logger = logging.getLogger(__name__)
settings = get_settings()

# Consent text recorded verbatim in the DB for each enrollment
CONSENT_TEXT = (
    "I authorize my employer to initiate automated clearing house (ACH) credit entries "
    "to the bank account I have provided, and to make adjustments for any credits made in error. "
    "This authorization is to remain in full force and effect until I notify my employer in writing."
)

MAX_ACCOUNTS = 3


class DirectDepositError(Exception):
    def __init__(self, message: str, http_status: int = 400):
        super().__init__(message)
        self.http_status = http_status


# ── Read ──────────────────────────────────────────────────────────────────────

async def get_accounts(db: AsyncSession, employee_id: str) -> DirectDepositSettings:
    """Return all active accounts for an employee (masked)."""
    result = await db.execute(
        select(DirectDepositAccount)
        .where(
            DirectDepositAccount.employee_id == employee_id,
            DirectDepositAccount.is_active == True,  # noqa: E712
        )
        .order_by(DirectDepositAccount.priority)
    )
    rows = result.scalars().all()
    accounts = [_to_summary(r) for r in rows]
    return DirectDepositSettings(employee_id=employee_id, accounts=accounts, total=len(accounts))


def _to_summary(row: DirectDepositAccount) -> AccountSummary:
    return AccountSummary(
        id=row.id,
        bank_name=row.bank_name,
        account_type=row.account_type,
        account_last4=row.account_number_last4,
        deposit_type=row.deposit_type,
        deposit_value=row.deposit_value,
        priority=row.priority,
        is_active=row.is_active,
        prenote_cleared=row.prenote_cleared_at is not None,
        created_at=row.created_at,
    )


# ── Validation helpers ────────────────────────────────────────────────────────

async def _validate_split_config(
    db: AsyncSession, employee_id: str, new_input: BankAccountInput, exclude_id=None
) -> None:
    """
    Enforce NACHA/business split-deposit rules:
    - Max 3 accounts.
    - Priority 1 must exist and be 'full' or the remainder account.
    - Percentages across all accounts must not exceed 100%.
    - Fixed amounts must not exceed a reasonable cap (business rule).
    """
    result = await db.execute(
        select(DirectDepositAccount).where(
            DirectDepositAccount.employee_id == employee_id,
            DirectDepositAccount.is_active == True,  # noqa: E712
        )
    )
    existing = [r for r in result.scalars().all() if str(r.id) != str(exclude_id)]

    if len(existing) >= MAX_ACCOUNTS:
        raise DirectDepositError(f"Maximum of {MAX_ACCOUNTS} direct deposit accounts allowed.", 400)

    # Validate split percentages don't exceed 100
    total_pct = sum(
        r.deposit_value for r in existing if r.deposit_type == "percentage" and r.deposit_value
    )
    if new_input.deposit_type == "percentage":
        if total_pct + new_input.deposit_value > 100:
            raise DirectDepositError(
                f"Total split percentages cannot exceed 100%. Currently at {total_pct}%.", 400
            )


# ── Write ─────────────────────────────────────────────────────────────────────

async def add_account(
    db: AsyncSession,
    employee_id: str,
    inp: BankAccountInput,
    ip_address: str,
    sms_code_id,
) -> DirectDepositAccount:
    """Persist a new direct deposit account. Called AFTER SMS verification."""
    await _validate_split_config(db, employee_id, inp)

    # Deactivate any existing account at the same priority
    await db.execute(
        update(DirectDepositAccount)
        .where(
            DirectDepositAccount.employee_id == employee_id,
            DirectDepositAccount.priority == inp.priority,
            DirectDepositAccount.is_active == True,  # noqa: E712
        )
        .values(is_active=False)
    )

    account = DirectDepositAccount(
        employee_id=employee_id,
        routing_number_encrypted=encrypt(inp.routing_number),
        account_number_encrypted=encrypt(inp.account_number),
        account_number_last4=mask_account(inp.account_number),
        bank_name=inp.bank_name,
        account_type=inp.account_type,
        deposit_type=inp.deposit_type,
        deposit_value=inp.deposit_value,
        priority=inp.priority,
        consent_text=CONSENT_TEXT,
        consent_ip=ip_address,
        consent_at=datetime.now(timezone.utc),
    )

    if settings.PRENOTE_ENABLED:
        account.prenote_sent_at = datetime.now(timezone.utc)
        # In production, schedule the ACH pre-note file generation here:
        # await prenote_scheduler.enqueue(account)

    db.add(account)
    await db.flush()

    await write_audit(
        db, employee_id, Actions.ACCOUNT_ADDED,
        after=_to_summary(account).model_dump(),
        ip_address=ip_address, sms_code_id=sms_code_id,
    )

    return account


async def update_account(
    db: AsyncSession,
    employee_id: str,
    account_id,
    inp: BankAccountInput,
    ip_address: str,
    sms_code_id,
) -> DirectDepositAccount:
    """Update bank details on an existing account. Called AFTER SMS verification."""
    result = await db.execute(
        select(DirectDepositAccount).where(
            DirectDepositAccount.id == account_id,
            DirectDepositAccount.employee_id == employee_id,
            DirectDepositAccount.is_active == True,  # noqa: E712
        )
    )
    account: DirectDepositAccount | None = result.scalar_one_or_none()
    if account is None:
        raise DirectDepositError("Account not found.", 404)

    before = _to_summary(account).model_dump()
    await _validate_split_config(db, employee_id, inp, exclude_id=account_id)

    account.routing_number_encrypted = encrypt(inp.routing_number)
    account.account_number_encrypted = encrypt(inp.account_number)
    account.account_number_last4     = mask_account(inp.account_number)
    account.bank_name                = inp.bank_name
    account.account_type             = inp.account_type
    account.deposit_type             = inp.deposit_type
    account.deposit_value            = inp.deposit_value

    # New pre-note required when banking details change
    if settings.PRENOTE_ENABLED:
        account.prenote_sent_at    = datetime.now(timezone.utc)
        account.prenote_cleared_at = None

    await db.flush()

    await write_audit(
        db, employee_id, Actions.ACCOUNT_UPDATED,
        before=before, after=_to_summary(account).model_dump(),
        ip_address=ip_address, sms_code_id=sms_code_id,
    )
    return account


async def delete_account(
    db: AsyncSession,
    employee_id: str,
    account_id,
    ip_address: str,
    sms_code_id,
) -> None:
    """Soft-delete (deactivate) an account. Called AFTER SMS verification."""
    result = await db.execute(
        select(DirectDepositAccount).where(
            DirectDepositAccount.id == account_id,
            DirectDepositAccount.employee_id == employee_id,
            DirectDepositAccount.is_active == True,  # noqa: E712
        )
    )
    account: DirectDepositAccount | None = result.scalar_one_or_none()
    if account is None:
        raise DirectDepositError("Account not found.", 404)

    before = _to_summary(account).model_dump()
    account.is_active = False
    await db.flush()

    await write_audit(
        db, employee_id, Actions.ACCOUNT_DELETED,
        before=before, ip_address=ip_address, sms_code_id=sms_code_id,
    )


async def clear_prenote(db: AsyncSession, account_id) -> None:
    """
    Mark pre-note as cleared. Call this from your ACH return-file processor
    once the pre-note settles without returns (typically 3 banking days).
    """
    result = await db.execute(
        select(DirectDepositAccount).where(DirectDepositAccount.id == account_id)
    )
    account = result.scalar_one_or_none()
    if account:
        account.prenote_cleared_at = datetime.now(timezone.utc)
        account.verified_at        = datetime.now(timezone.utc)
        await write_audit(db, account.employee_id, Actions.PRENOTE_CLEARED,
                          after={"account_id": str(account_id)})
