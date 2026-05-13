"""Initial direct deposit schema

Revision ID: 001
Revises:
Create Date: 2025-01-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\"")

    op.execute("""
        DO $$ BEGIN
            CREATE TYPE account_type_enum AS ENUM ('checking', 'savings');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE deposit_type_enum AS ENUM ('full', 'percentage', 'fixed_amount');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)
    op.execute("""
        DO $$ BEGIN
            CREATE TYPE dd_action_enum AS ENUM ('add', 'update', 'delete');
        EXCEPTION WHEN duplicate_object THEN NULL;
        END $$;
    """)

    op.create_table(
        "direct_deposit_accounts",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("employee_id", sa.String(64), nullable=False),
        sa.Column("routing_number_encrypted", sa.Text, nullable=False),
        sa.Column("account_number_encrypted", sa.Text, nullable=False),
        sa.Column("account_number_last4", sa.String(4), nullable=False),
        sa.Column("bank_name", sa.String(120), nullable=False),
        sa.Column("account_type", sa.Enum("checking", "savings", name="account_type_enum"), nullable=False),
        sa.Column("deposit_type", sa.Enum("full", "percentage", "fixed_amount", name="deposit_type_enum"), nullable=False, server_default="full"),
        sa.Column("deposit_value", sa.Integer, nullable=True),
        sa.Column("priority", sa.Integer, nullable=False, server_default="1"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("prenote_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("prenote_cleared_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("consent_text", sa.Text, nullable=False),
        sa.Column("consent_ip", sa.String(45), nullable=False),
        sa.Column("consent_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_dd_employee_id", "direct_deposit_accounts", ["employee_id"])
    op.create_index(
        "ix_dd_employee_priority",
        "direct_deposit_accounts",
        ["employee_id", "priority"],
        unique=True,
        postgresql_where=sa.text("is_active = true"),
    )

    op.create_table(
        "sms_verification_codes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("employee_id", sa.String(64), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("code_salt", sa.String(32), nullable=False),
        sa.Column("action", sa.Enum("add", "update", "delete", name="dd_action_enum"), nullable=False),
        sa.Column("intent_encrypted", sa.Text, nullable=True),
        sa.Column("phone_last4", sa.String(4), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("attempts", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_used", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("verified_ip", sa.String(45), nullable=True),
    )
    op.create_index("ix_sms_employee_id", "sms_verification_codes", ["employee_id"])

    op.create_table(
        "direct_deposit_audit_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("employee_id", sa.String(64), nullable=False),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("before_state", sa.Text, nullable=True),
        sa.Column("after_state", sa.Text, nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.String(512), nullable=True),
        sa.Column("sms_code_id", UUID(as_uuid=True), sa.ForeignKey("sms_verification_codes.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_audit_employee_created", "direct_deposit_audit_log", ["employee_id", "created_at"])

    op.create_table(
        "rate_limit_records",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("key", sa.String(256), nullable=False),
        sa.Column("count", sa.Integer, nullable=False, server_default="1"),
        sa.Column("window_start", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("NOW()")),
    )
    op.create_index("ix_rate_limit_key", "rate_limit_records", ["key"])


def downgrade() -> None:
    op.drop_table("rate_limit_records")
    op.drop_table("direct_deposit_audit_log")
    op.drop_table("sms_verification_codes")
    op.drop_table("direct_deposit_accounts")
    op.execute("DROP TYPE IF EXISTS dd_action_enum")
    op.execute("DROP TYPE IF EXISTS deposit_type_enum")
    op.execute("DROP TYPE IF EXISTS account_type_enum")
