"""Pydantic v2 schemas for request/response validation."""
import re
from datetime import datetime
from typing import Literal, Optional
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, model_validator


# ── Shared validators ─────────────────────────────────────────────────────────

def _validate_routing(v: str) -> str:
    v = v.strip()
    if not re.fullmatch(r"\d{9}", v):
        raise ValueError("Routing number must be exactly 9 digits")
    # ABA checksum (NACHA-mandated mod-10 calculation)
    d = [int(c) for c in v]
    checksum = (3*(d[0]+d[3]+d[6]) + 7*(d[1]+d[4]+d[7]) + (d[2]+d[5]+d[8])) % 10
    if checksum != 0:
        raise ValueError("Invalid ABA routing number (checksum failed)")
    return v


def _validate_account(v: str) -> str:
    v = re.sub(r"\s", "", v)
    if not re.fullmatch(r"\d{1,17}", v):
        raise ValueError("Account number must be 1–17 digits (NACHA limit)")
    return v


# ── Request schemas ───────────────────────────────────────────────────────────

class BankAccountInput(BaseModel):
    routing_number: str = Field(..., min_length=9, max_length=9)
    account_number: str = Field(..., min_length=1, max_length=17)
    account_type:   Literal["checking", "savings"]
    bank_name:      str = Field(..., min_length=1, max_length=120)
    deposit_type:   Literal["full", "percentage", "fixed_amount"] = "full"
    deposit_value:  Optional[int] = Field(None, ge=1)  # cents for fixed, 1-100 for pct
    priority:       int = Field(1, ge=1, le=3)
    consent_given:  bool = Field(..., description="Employee must explicitly consent")

    @field_validator("routing_number")
    @classmethod
    def validate_routing(cls, v: str) -> str:
        return _validate_routing(v)

    @field_validator("account_number")
    @classmethod
    def validate_account(cls, v: str) -> str:
        return _validate_account(v)

    @model_validator(mode="after")
    def validate_deposit_config(self) -> "BankAccountInput":
        if self.deposit_type == "percentage":
            if self.deposit_value is None or not (1 <= self.deposit_value <= 100):
                raise ValueError("Percentage must be 1–100")
        elif self.deposit_type == "fixed_amount":
            if self.deposit_value is None or self.deposit_value < 1:
                raise ValueError("Fixed amount must be at least 1 cent")
        elif self.deposit_type == "full":
            self.deposit_value = None
        if not self.consent_given:
            raise ValueError("Employee consent is required")
        return self


class InitiateChangeRequest(BaseModel):
    """Step 1 — employee submits new bank info; triggers SMS."""
    account: BankAccountInput


class VerifyAndCommitRequest(BaseModel):
    """Step 2 — employee enters the SMS code to commit the pending change."""
    verification_id: UUID
    code:            str = Field(..., min_length=6, max_length=6)

    @field_validator("code")
    @classmethod
    def validate_code_digits(cls, v: str) -> str:
        if not v.isdigit():
            raise ValueError("Code must be 6 digits")
        return v


class InitiateDeleteRequest(BaseModel):
    account_id: UUID


# ── Response schemas ──────────────────────────────────────────────────────────

class AccountSummary(BaseModel):
    """Never includes routing or full account number."""
    id:              UUID
    bank_name:       str
    account_type:    str
    account_last4:   str
    deposit_type:    str
    deposit_value:   Optional[int]
    priority:        int
    is_active:       bool
    prenote_cleared: bool
    created_at:      datetime


class InitiateChangeResponse(BaseModel):
    verification_id: UUID
    phone_last4:     str
    expires_in_sec:  int
    message:         str


class VerifyResponse(BaseModel):
    success:   bool
    message:   str
    account:   Optional[AccountSummary] = None


class DirectDepositSettings(BaseModel):
    employee_id: str
    accounts:    list[AccountSummary]
    total:       int


# ── Internal ──────────────────────────────────────────────────────────────────

class TokenData(BaseModel):
    """Claims extracted from the Supabase/payroll JWT."""
    employee_id: str
    email:       Optional[str] = None
    phone:       Optional[str] = None   # E.164
    full_name:   Optional[str] = None
    role:        Optional[str] = None
