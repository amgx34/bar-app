"""
Cryptographic utilities and JWT validation.

AES-256-GCM authenticated encryption.
Never raises on decrypt without authentication — GCM's AEAD provides integrity.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
from datetime import datetime, timezone
from typing import Any

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from jose import JWTError, jwt

from app.config import get_settings
from app.schemas import TokenData

settings = get_settings()


# ── AES-256-GCM encryption ────────────────────────────────────────────────────

def encrypt(plaintext: str) -> str:
    """
    Encrypt a string with AES-256-GCM.
    Returns base64(12-byte nonce || ciphertext+tag).
    """
    key = settings.encryption_key_bytes
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)                          # 96-bit nonce — never reuse
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt(token: str) -> str:
    """
    Decrypt an AES-256-GCM ciphertext produced by encrypt().
    Raises ValueError if the ciphertext is tampered or the key is wrong.
    """
    key = settings.encryption_key_bytes
    raw = base64.b64decode(token)
    if len(raw) < 28:   # 12 nonce + 16 GCM tag minimum
        raise ValueError("Ciphertext too short")
    nonce, ciphertext = raw[:12], raw[12:]
    aesgcm = AESGCM(key)
    try:
        return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")
    except Exception as exc:
        raise ValueError("Decryption failed — ciphertext may be tampered") from exc


def encrypt_json(obj: Any) -> str:
    """Encrypt a JSON-serialisable object."""
    return encrypt(json.dumps(obj, default=str))


def decrypt_json(token: str) -> Any:
    """Decrypt and parse JSON from an encrypted token."""
    return json.loads(decrypt(token))


# ── SMS code hashing (HMAC-SHA256) ───────────────────────────────────────────

def generate_code() -> str:
    """Return a cryptographically random 6-digit string."""
    return f"{secrets.randbelow(1_000_000):06d}"


def generate_salt() -> str:
    """32-hex-char random salt for per-code HMAC."""
    return secrets.token_hex(16)


def hash_code(code: str, salt: str) -> str:
    """HMAC-SHA256(code, salt) — safe for DB storage."""
    return hmac.new(
        salt.encode("utf-8"),
        code.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def verify_code_hash(code: str, salt: str, stored_hash: str) -> bool:
    """Constant-time comparison to prevent timing attacks."""
    expected = hash_code(code, salt)
    return hmac.compare_digest(expected, stored_hash)


# ── JWT validation ────────────────────────────────────────────────────────────

def verify_jwt(token: str) -> TokenData:
    """
    Validate a JWT issued by Supabase (or your payroll system).
    Supabase JWTs carry user metadata in the `user_metadata` claim.
    Adjust field mapping to match your actual JWT shape.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_aud": False},
        )
    except JWTError as exc:
        raise ValueError(f"Invalid token: {exc}") from exc

    # Supabase places custom claims in 'app_metadata' or 'user_metadata'
    meta = payload.get("user_metadata", {}) or {}
    sub  = payload.get("sub") or payload.get("employee_id") or meta.get("employee_id")
    if not sub:
        raise ValueError("Token missing subject/employee_id")

    return TokenData(
        employee_id=str(sub),
        email=payload.get("email") or meta.get("email"),
        phone=meta.get("phone") or meta.get("phone_number"),
        full_name=meta.get("full_name") or meta.get("name"),
        role=meta.get("role"),
    )


# ── Masking helpers ───────────────────────────────────────────────────────────

def mask_account(account_number: str) -> str:
    """Return last 4 digits for display — never log full number."""
    return account_number[-4:] if len(account_number) >= 4 else "****"


def mask_phone(phone: str) -> str:
    """Return last 4 digits of an E.164 phone for display."""
    digits = "".join(c for c in phone if c.isdigit())
    return digits[-4:] if len(digits) >= 4 else "****"


# ── CSRF token ────────────────────────────────────────────────────────────────

def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)
