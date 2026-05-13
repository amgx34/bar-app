import base64
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Database
    DATABASE_URL: str

    # Encryption key — 32 raw bytes stored as base64
    ENCRYPTION_KEY: str

    # JWT
    SUPABASE_JWT_SECRET: str
    JWT_ALGORITHM: str = "HS256"

    # Twilio
    TWILIO_ACCOUNT_SID: str
    TWILIO_AUTH_TOKEN: str
    TWILIO_FROM_NUMBER: str

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # App
    APP_ENV: str = "development"
    APP_SECRET_KEY: str
    ALLOWED_ORIGINS: str = "http://localhost:3000"

    # SMS verification
    SMS_CODE_TTL_SECONDS: int = 600
    SMS_CODE_MAX_ATTEMPTS: int = 3
    SMS_CODES_PER_HOUR: int = 5

    # Pre-note
    PRENOTE_ENABLED: bool = True
    PRENOTE_WAIT_DAYS: int = 3

    @property
    def encryption_key_bytes(self) -> bytes:
        """Decode base64-encoded 32-byte AES key."""
        raw = base64.b64decode(self.ENCRYPTION_KEY)
        if len(raw) != 32:
            raise ValueError("ENCRYPTION_KEY must be exactly 32 bytes (256-bit)")
        return raw

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]

    @property
    def is_production(self) -> bool:
        return self.APP_ENV == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
