"""Unit tests — cryptographic utilities."""
import base64
import pytest
from unittest.mock import patch

from app.security import (
    decrypt,
    encrypt,
    generate_code,
    generate_salt,
    hash_code,
    mask_account,
    mask_phone,
    verify_code_hash,
)


class TestEncryption:
    def test_roundtrip(self):
        plaintext = "123456789"   # routing number
        token = encrypt(plaintext)
        assert decrypt(token) == plaintext

    def test_different_ciphertexts_same_plaintext(self):
        """Each call uses a fresh nonce — ciphertexts must differ."""
        t1 = encrypt("same")
        t2 = encrypt("same")
        assert t1 != t2

    def test_tamper_detection(self):
        token = encrypt("secret")
        raw = bytearray(base64.b64decode(token))
        raw[15] ^= 0xFF   # flip bits in ciphertext
        tampered = base64.b64encode(bytes(raw)).decode()
        with pytest.raises(ValueError, match="tampered"):
            decrypt(tampered)

    def test_wrong_key_rejected(self, monkeypatch):
        from app import security
        token = encrypt("sensitive")
        monkeypatch.setattr(
            "app.security.settings",
            type("S", (), {"encryption_key_bytes": b"\xff" * 32})(),
        )
        with pytest.raises(ValueError):
            decrypt(token)


class TestCodeHashing:
    def test_hash_and_verify(self):
        code = "483920"
        salt = generate_salt()
        h = hash_code(code, salt)
        assert verify_code_hash(code, salt, h) is True

    def test_wrong_code_rejected(self):
        salt = generate_salt()
        h = hash_code("111111", salt)
        assert verify_code_hash("222222", salt, h) is False

    def test_wrong_salt_rejected(self):
        code = "555555"
        salt1 = generate_salt()
        salt2 = generate_salt()
        h = hash_code(code, salt1)
        assert verify_code_hash(code, salt2, h) is False

    def test_code_is_6_digits(self):
        for _ in range(100):
            code = generate_code()
            assert len(code) == 6 and code.isdigit()


class TestMasking:
    def test_mask_account(self):
        assert mask_account("1234567890") == "7890"
        assert mask_account("1234") == "1234"

    def test_mask_phone(self):
        assert mask_phone("+15555550100") == "0100"
        assert mask_phone("+447911123456") == "3456"
