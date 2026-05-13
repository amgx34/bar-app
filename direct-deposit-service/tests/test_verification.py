"""Integration tests — SMS 2FA verification flow."""
import pytest
import pytest_asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas import TokenData
from app.verification import VerificationError, initiate_verification, verify_and_return_intent
from app.sms import SMSResult, SMSStatus


EMPLOYEE = TokenData(
    employee_id="emp_001",
    email="test@bar.com",
    phone="+15555550100",
    full_name="Test Employee",
)

INTENT = {"action": "add", "account_id": None, "account": {"routing_number": "021000021"}}


@pytest.fixture
def mock_db():
    db = AsyncMock(spec=AsyncSession)
    db.execute = AsyncMock(return_value=MagicMock(scalars=lambda: MagicMock(all=lambda: [])))
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.rollback = AsyncMock()
    return db


@pytest.mark.asyncio
async def test_initiate_sends_sms(mock_db):
    with patch("app.verification.is_otp_issuance_allowed", return_value=(True, "")), \
         patch("app.verification.send_verification_sms", return_value=SMSResult(status=SMSStatus.SENT, sid="SM123")), \
         patch("app.verification.write_audit", AsyncMock()):
        record = await initiate_verification(mock_db, EMPLOYEE, "add", INTENT, "1.2.3.4")
        assert record.employee_id == "emp_001"
        assert record.phone_last4 == "0100"
        assert record.is_used is False


@pytest.mark.asyncio
async def test_initiate_raises_on_rate_limit(mock_db):
    with patch("app.verification.is_otp_issuance_allowed", return_value=(False, "Too many codes")), \
         patch("app.verification.write_audit", AsyncMock()):
        with pytest.raises(VerificationError) as exc_info:
            await initiate_verification(mock_db, EMPLOYEE, "add", INTENT)
        assert exc_info.value.http_status == 429


@pytest.mark.asyncio
async def test_initiate_raises_without_phone(mock_db):
    employee_no_phone = TokenData(employee_id="emp_002", email="x@x.com")
    with pytest.raises(VerificationError) as exc_info:
        await initiate_verification(mock_db, employee_no_phone, "add", INTENT)
    assert exc_info.value.http_status == 422


@pytest.mark.asyncio
async def test_initiate_rolls_back_on_sms_failure(mock_db):
    with patch("app.verification.is_otp_issuance_allowed", return_value=(True, "")), \
         patch("app.verification.send_verification_sms", return_value=SMSResult(status=SMSStatus.FAILED)), \
         patch("app.verification.write_audit", AsyncMock()):
        with pytest.raises(VerificationError):
            await initiate_verification(mock_db, EMPLOYEE, "add", INTENT)
        mock_db.rollback.assert_called_once()


@pytest.mark.asyncio
async def test_verify_correct_code_returns_intent():
    from app.security import encrypt_json, generate_salt, hash_code

    salt = generate_salt()
    raw  = "481920"
    code_hash = hash_code(raw, salt)
    intent = {"action": "add", "test": True}

    mock_record = MagicMock()
    mock_record.employee_id = "emp_001"
    mock_record.is_used     = False
    mock_record.expires_at  = datetime.now(timezone.utc) + timedelta(minutes=5)
    mock_record.attempts    = 0
    mock_record.code_hash   = code_hash
    mock_record.code_salt   = salt
    mock_record.intent_encrypted = encrypt_json(intent)
    mock_record.id          = uuid4()

    db = AsyncMock(spec=AsyncSession)
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=lambda: mock_record))
    db.flush   = AsyncMock()

    with patch("app.verification.is_verification_locked", return_value=False), \
         patch("app.verification.clear_fail_counter", AsyncMock()), \
         patch("app.verification.write_audit", AsyncMock()):
        result = await verify_and_return_intent(db, "emp_001", mock_record.id, raw)
    assert result["action"] == "add"


@pytest.mark.asyncio
async def test_verify_wrong_code_increments_attempts():
    from app.security import generate_salt, hash_code

    salt = generate_salt()
    mock_record = MagicMock()
    mock_record.employee_id = "emp_001"
    mock_record.is_used     = False
    mock_record.expires_at  = datetime.now(timezone.utc) + timedelta(minutes=5)
    mock_record.attempts    = 0
    mock_record.code_hash   = hash_code("111111", salt)
    mock_record.code_salt   = salt
    mock_record.id          = uuid4()

    db = AsyncMock(spec=AsyncSession)
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=lambda: mock_record))
    db.flush   = AsyncMock()

    from app.config import get_settings
    s = get_settings()

    with patch("app.verification.is_verification_locked", return_value=False), \
         patch("app.verification.record_failed_attempt", AsyncMock()), \
         patch("app.verification.write_audit", AsyncMock()):
        with pytest.raises(VerificationError) as exc_info:
            await verify_and_return_intent(db, "emp_001", mock_record.id, "999999")
        assert "Incorrect code" in str(exc_info.value)
        assert mock_record.attempts == 1


@pytest.mark.asyncio
async def test_expired_code_rejected():
    mock_record = MagicMock()
    mock_record.employee_id = "emp_001"
    mock_record.is_used     = False
    mock_record.expires_at  = datetime.now(timezone.utc) - timedelta(minutes=1)  # expired
    mock_record.attempts    = 0
    mock_record.id          = uuid4()

    db = AsyncMock(spec=AsyncSession)
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=lambda: mock_record))
    db.flush   = AsyncMock()

    with patch("app.verification.is_verification_locked", return_value=False), \
         patch("app.verification.write_audit", AsyncMock()):
        with pytest.raises(VerificationError) as exc_info:
            await verify_and_return_intent(db, "emp_001", mock_record.id, "123456")
        assert "expired" in str(exc_info.value).lower()
