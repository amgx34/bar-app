"""
Twilio SMS service with structured error handling and logging.
Never log the OTP code itself — only log delivery status.
"""
import logging
from dataclasses import dataclass
from enum import Enum

from twilio.base.exceptions import TwilioRestException
from twilio.rest import Client

from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class SMSStatus(str, Enum):
    SENT    = "sent"
    FAILED  = "failed"
    INVALID = "invalid_number"


@dataclass
class SMSResult:
    status:  SMSStatus
    sid:     str | None = None
    error:   str | None = None


_client: Client | None = None


def _get_client() -> Client:
    global _client
    if _client is None:
        _client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    return _client


def send_verification_sms(phone_e164: str, code: str, employee_name: str) -> SMSResult:
    """
    Send a 6-digit OTP via SMS.

    Args:
        phone_e164: Verified E.164 phone number, e.g. +15555550100
        code:       6-digit OTP (DO NOT log this)
        employee_name: First name for personalisation

    Returns:
        SMSResult with status and optional SID or error.
    """
    if not phone_e164.startswith("+"):
        logger.error("Phone number not in E.164 format for employee (number masked)")
        return SMSResult(status=SMSStatus.INVALID, error="Phone number not in E.164 format")

    body = (
        f"Rail Payroll: Your direct deposit verification code is {code}. "
        f"It expires in 10 minutes. Never share this code. "
        f"If you did not request this, contact your payroll administrator immediately."
    )

    try:
        message = _get_client().messages.create(
            body=body,
            from_=settings.TWILIO_FROM_NUMBER,
            to=phone_e164,
        )
        logger.info(
            "SMS OTP sent",
            extra={"sid": message.sid, "status": message.status, "phone_last4": phone_e164[-4:]},
        )
        return SMSResult(status=SMSStatus.SENT, sid=message.sid)

    except TwilioRestException as exc:
        # 21211 = invalid 'To' number; 21614 = not SMS-capable
        if exc.code in (21211, 21614, 21610):
            logger.warning("SMS delivery failed — invalid/unroutable number", extra={"twilio_code": exc.code})
            return SMSResult(status=SMSStatus.INVALID, error=str(exc.msg))

        logger.error("Twilio error sending OTP", extra={"twilio_code": exc.code, "error": str(exc.msg)})
        return SMSResult(status=SMSStatus.FAILED, error=str(exc.msg))

    except Exception as exc:
        logger.exception("Unexpected error sending SMS OTP")
        return SMSResult(status=SMSStatus.FAILED, error="SMS service unavailable")


def send_confirmation_sms(phone_e164: str, action: str, account_last4: str) -> None:
    """
    Non-critical confirmation SMS after a successful direct deposit change.
    Fires-and-forgets; failure does not block the main flow.
    """
    action_text = {
        "add":    f"A new bank account ending in {account_last4} has been added",
        "update": f"Your bank account ending in {account_last4} has been updated",
        "delete": f"Your bank account ending in {account_last4} has been removed",
    }.get(action, "Your direct deposit settings have been changed")

    body = (
        f"Rail Payroll: {action_text} for direct deposit. "
        f"If this was not you, contact your payroll administrator immediately."
    )
    try:
        _get_client().messages.create(body=body, from_=settings.TWILIO_FROM_NUMBER, to=phone_e164)
    except Exception:
        logger.warning("Failed to send confirmation SMS (non-critical)", exc_info=True)
