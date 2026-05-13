"""Unit tests — bank account validation and business logic."""
import pytest
from pydantic import ValidationError

from app.schemas import BankAccountInput


class TestBankAccountInput:
    def _valid(self, **overrides):
        data = dict(
            routing_number="021000021",   # valid ABA checksum
            account_number="123456789",
            account_type="checking",
            bank_name="Test Bank",
            deposit_type="full",
            consent_given=True,
        )
        data.update(overrides)
        return data

    def test_valid_account(self):
        acc = BankAccountInput(**self._valid())
        assert acc.account_number_last4 if hasattr(acc, "account_number_last4") else True

    def test_invalid_routing_checksum(self):
        with pytest.raises(ValidationError, match="checksum"):
            BankAccountInput(**self._valid(routing_number="123456789"))

    def test_routing_non_digits(self):
        with pytest.raises(ValidationError):
            BankAccountInput(**self._valid(routing_number="02100002A"))

    def test_routing_wrong_length(self):
        with pytest.raises(ValidationError):
            BankAccountInput(**self._valid(routing_number="0210000210"))

    def test_account_number_too_long(self):
        with pytest.raises(ValidationError):
            BankAccountInput(**self._valid(account_number="1" * 18))

    def test_percentage_requires_value(self):
        with pytest.raises(ValidationError, match="Percentage"):
            BankAccountInput(**self._valid(deposit_type="percentage", deposit_value=None))

    def test_percentage_over_100(self):
        with pytest.raises(ValidationError):
            BankAccountInput(**self._valid(deposit_type="percentage", deposit_value=101))

    def test_fixed_amount_zero_rejected(self):
        with pytest.raises(ValidationError, match="at least 1 cent"):
            BankAccountInput(**self._valid(deposit_type="fixed_amount", deposit_value=0))

    def test_no_consent_rejected(self):
        with pytest.raises(ValidationError, match="consent"):
            BankAccountInput(**self._valid(consent_given=False))

    def test_savings_account(self):
        acc = BankAccountInput(**self._valid(account_type="savings"))
        assert acc.account_type == "savings"

    def test_full_clears_deposit_value(self):
        acc = BankAccountInput(**self._valid(deposit_type="full", deposit_value=50))
        assert acc.deposit_value is None   # full overrides any value


class TestRoutingValidation:
    """Test the ABA checksum against known-good routing numbers."""

    VALID_ROUTING = [
        "021000021",   # JP Morgan Chase (NY)
        "021200339",   # Citibank (NY)
        "267084131",   # Bank of America (FL)
        "325070760",   # Bank of America (WA)
    ]

    INVALID_ROUTING = [
        "123456789",   # fails checksum
        "000000000",   # all zeros
        "999999999",   # all nines
    ]

    @pytest.mark.parametrize("routing", VALID_ROUTING)
    def test_valid_routing(self, routing):
        from app.schemas import _validate_routing
        assert _validate_routing(routing) == routing

    @pytest.mark.parametrize("routing", INVALID_ROUTING)
    def test_invalid_routing(self, routing):
        from app.schemas import _validate_routing
        with pytest.raises(ValueError):
            _validate_routing(routing)
