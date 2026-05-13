"""
Immutable audit trail for all direct deposit changes.
Account numbers are masked to last-4 BEFORE writing to the log.
"""
import json
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuditLog

logger = logging.getLogger(__name__)

_SENSITIVE_KEYS = {"routing_number", "account_number", "routing_number_encrypted", "account_number_encrypted"}


def _mask_sensitive(obj: Any, depth: int = 0) -> Any:
    """Recursively mask sensitive fields before logging."""
    if depth > 5:
        return obj
    if isinstance(obj, dict):
        return {
            k: ("****" if k in _SENSITIVE_KEYS else _mask_sensitive(v, depth + 1))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_mask_sensitive(i, depth + 1) for i in obj]
    return obj


async def write_audit(
    db: AsyncSession,
    employee_id: str,
    action: str,
    before: Any = None,
    after: Any = None,
    ip_address: str | None = None,
    user_agent: str | None = None,
    sms_code_id: UUID | None = None,
) -> None:
    """
    Persist an audit record.

    Actions (use these constants):
        ACCOUNT_ADDED, ACCOUNT_UPDATED, ACCOUNT_DELETED,
        OTP_ISSUED, OTP_VERIFIED, OTP_FAILED, OTP_EXPIRED,
        PRENOTE_SENT, PRENOTE_CLEARED,
        ACCESS_DENIED
    """
    entry = AuditLog(
        employee_id=employee_id,
        action=action,
        before_state=json.dumps(_mask_sensitive(before)) if before else None,
        after_state=json.dumps(_mask_sensitive(after)) if after else None,
        ip_address=ip_address,
        user_agent=user_agent,
        sms_code_id=sms_code_id,
    )
    db.add(entry)
    await db.flush()

    logger.info(
        "Audit: %s employee=%s ip=%s",
        action,
        employee_id,
        ip_address or "unknown",
    )


# ── Action constants ──────────────────────────────────────────────────────────

class Actions:
    ACCOUNT_ADDED    = "ACCOUNT_ADDED"
    ACCOUNT_UPDATED  = "ACCOUNT_UPDATED"
    ACCOUNT_DELETED  = "ACCOUNT_DELETED"
    OTP_ISSUED       = "OTP_ISSUED"
    OTP_VERIFIED     = "OTP_VERIFIED"
    OTP_FAILED       = "OTP_FAILED"
    OTP_EXPIRED      = "OTP_EXPIRED"
    PRENOTE_SENT     = "PRENOTE_SENT"
    PRENOTE_CLEARED  = "PRENOTE_CLEARED"
    ACCESS_DENIED    = "ACCESS_DENIED"
    SETTINGS_VIEWED  = "SETTINGS_VIEWED"
