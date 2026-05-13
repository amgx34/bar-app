"""
Rate limiting for OTP issuance.
Primary: Redis sliding-window counter.
Fallback: PostgreSQL-backed counter (if Redis is unavailable).
"""
import logging
from datetime import datetime, timedelta, timezone

import redis.asyncio as aioredis
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import RateLimitRecord

logger = logging.getLogger(__name__)
settings = get_settings()

_redis: aioredis.Redis | None = None


async def _get_redis() -> aioredis.Redis | None:
    global _redis
    if _redis is None:
        try:
            _redis = await aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            await _redis.ping()
        except Exception:
            logger.warning("Redis unavailable — using DB rate limiting fallback")
            _redis = None
    return _redis


async def check_and_increment_redis(key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    """
    Redis sliding-window rate limit.
    Returns (allowed: bool, current_count: int).
    """
    r = await _get_redis()
    if r is None:
        return True, 0   # Redis down — fall through to DB fallback

    pipe = r.pipeline()
    await pipe.incr(key)
    await pipe.expire(key, window_seconds)
    results = await pipe.execute()
    count = results[0]
    return count <= limit, count


async def check_and_increment_db(
    db: AsyncSession, key: str, limit: int, window_seconds: int
) -> tuple[bool, int]:
    """PostgreSQL fallback rate limiter."""
    window_start = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)

    # Clean stale records
    await db.execute(
        delete(RateLimitRecord).where(RateLimitRecord.window_start < window_start)
    )

    result = await db.execute(
        select(func.sum(RateLimitRecord.count)).where(
            RateLimitRecord.key == key,
            RateLimitRecord.window_start >= window_start,
        )
    )
    current = result.scalar_one_or_none() or 0

    if current >= limit:
        return False, int(current)

    db.add(RateLimitRecord(key=key, count=1))
    await db.flush()
    return True, int(current) + 1


async def is_otp_issuance_allowed(
    employee_id: str, db: AsyncSession
) -> tuple[bool, str]:
    """
    Enforce: max 5 OTP codes issued per hour per employee.
    Returns (allowed, reason).
    """
    key = f"otp_issue:{employee_id}"
    limit = settings.SMS_CODES_PER_HOUR
    window = 3600

    allowed, count = await check_and_increment_redis(key, limit, window)
    if not allowed:
        return False, f"Too many verification codes requested. Try again later."

    # DB fallback path (Redis returned True but may be unavailable)
    if count == 0:
        allowed, _ = await check_and_increment_db(db, key, limit, window)
        if not allowed:
            return False, "Too many verification codes requested. Try again later."

    return True, ""


async def record_failed_attempt(employee_id: str) -> None:
    """Track consecutive failed verifications (separate from issuance limit)."""
    r = await _get_redis()
    if r:
        key = f"otp_fail:{employee_id}"
        await r.incr(key)
        await r.expire(key, 900)  # 15 min window


async def is_verification_locked(employee_id: str) -> bool:
    """Block verification if >10 consecutive failures in 15 min."""
    r = await _get_redis()
    if r is None:
        return False
    count = await r.get(f"otp_fail:{employee_id}")
    return int(count or 0) >= 10


async def clear_fail_counter(employee_id: str) -> None:
    r = await _get_redis()
    if r:
        await r.delete(f"otp_fail:{employee_id}")
