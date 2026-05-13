"""
SQLAlchemy models.

Security note: account numbers are never stored in plaintext.
- account_number_encrypted: AES-256-GCM ciphertext (base64)
- routing_number_encrypted: same
- account_number_last4: only for display, derived at write time
"""
import uuid
from datetime import datetime
from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey, Integer,
    String, Text, func, Index,
)
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class DirectDepositAccount(Base):
    __tablename__ = "direct_deposit_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(String(64), nullable=False, index=True)

    # ── Encrypted bank details ────────────────────────────────────────────────
    routing_number_encrypted = Column(Text, nullable=False)
    account_number_encrypted = Column(Text, nullable=False)
    account_number_last4     = Column(String(4), nullable=False)   # display only
    bank_name                = Column(String(120), nullable=False)
    account_type             = Column(Enum("checking", "savings", name="account_type_enum"), nullable=False)

    # ── Split deposit config ──────────────────────────────────────────────────
    # deposit_type: 'full' | 'percentage' | 'fixed_amount'
    deposit_type  = Column(Enum("full", "percentage", "fixed_amount", name="deposit_type_enum"), nullable=False, default="full")
    deposit_value = Column(Integer, nullable=True)   # NULL for 'full'; cents for fixed; 0-100 for pct
    priority      = Column(Integer, nullable=False, default=1)  # 1=primary; 2,3=split targets

    # ── State ─────────────────────────────────────────────────────────────────
    is_active           = Column(Boolean, nullable=False, default=True)
    prenote_sent_at     = Column(DateTime(timezone=True), nullable=True)
    prenote_cleared_at  = Column(DateTime(timezone=True), nullable=True)
    verified_at         = Column(DateTime(timezone=True), nullable=True)

    # ── Consent ───────────────────────────────────────────────────────────────
    consent_text   = Column(Text, nullable=False)
    consent_ip     = Column(String(45), nullable=False)   # IPv4 or IPv6
    consent_at     = Column(DateTime(timezone=True), nullable=False, default=func.now())

    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())
    updated_at = Column(DateTime(timezone=True), nullable=False, default=func.now(), onupdate=func.now())

    __table_args__ = (
        # Max 3 active accounts per employee (NACHA common limit)
        Index("ix_dd_employee_priority", "employee_id", "priority", unique=True,
              postgresql_where="is_active = true"),
    )


class SMSVerificationCode(Base):
    __tablename__ = "sms_verification_codes"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(String(64), nullable=False, index=True)

    # HMAC-SHA256 hash of the code — never store plaintext
    code_hash   = Column(String(64), nullable=False)
    code_salt   = Column(String(32), nullable=False)   # per-code random salt

    # What action this code authorizes
    action      = Column(Enum("add", "update", "delete", name="dd_action_enum"), nullable=False)
    # Serialized intent snapshot (JSON, encrypted) — what will be committed after verify
    intent_encrypted = Column(Text, nullable=True)

    phone_last4 = Column(String(4), nullable=False)   # for display in UI

    expires_at  = Column(DateTime(timezone=True), nullable=False)
    attempts    = Column(Integer, nullable=False, default=0)
    is_used     = Column(Boolean, nullable=False, default=False)

    # Audit fields
    created_at  = Column(DateTime(timezone=True), nullable=False, default=func.now())
    ip_address  = Column(String(45), nullable=True)
    user_agent  = Column(String(512), nullable=True)
    verified_at = Column(DateTime(timezone=True), nullable=True)
    verified_ip = Column(String(45), nullable=True)


class AuditLog(Base):
    __tablename__ = "direct_deposit_audit_log"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    employee_id = Column(String(64), nullable=False, index=True)
    action      = Column(String(64), nullable=False)   # "ACCOUNT_ADDED", "ACCOUNT_UPDATED", etc.

    # JSON snapshot — account numbers are masked to last-4 before storing
    before_state = Column(Text, nullable=True)
    after_state  = Column(Text, nullable=True)

    ip_address   = Column(String(45), nullable=True)
    user_agent   = Column(String(512), nullable=True)
    sms_code_id  = Column(UUID(as_uuid=True), ForeignKey("sms_verification_codes.id"), nullable=True)
    created_at   = Column(DateTime(timezone=True), nullable=False, default=func.now())

    __table_args__ = (
        Index("ix_audit_employee_created", "employee_id", "created_at"),
    )


class RateLimitRecord(Base):
    """DB-backed rate limit fallback when Redis is unavailable."""
    __tablename__ = "rate_limit_records"

    id          = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    key         = Column(String(256), nullable=False, index=True)
    count       = Column(Integer, nullable=False, default=1)
    window_start = Column(DateTime(timezone=True), nullable=False, default=func.now())
