# Rail — Direct Deposit Service

Standalone FastAPI microservice providing secure direct deposit enrollment with mandatory SMS two-step verification.

## Architecture

```
Next.js frontend  ──JWT──►  FastAPI service  ──►  PostgreSQL
                                │
                                ├──► Redis (rate limiting)
                                └──► Twilio (SMS OTP)
```

### Two-Step Flow

```
1. POST /api/v1/direct-deposit/initiate        ← employee submits bank details
   └─ validates input, encrypts intent, sends SMS OTP
   └─ returns { verification_id, phone_last4, expires_in_sec }

2. POST /api/v1/direct-deposit/verify          ← employee submits OTP code
   └─ validates code (hash compare, TTL, attempt limit)
   └─ decrypts intent, commits account to DB
   └─ sends confirmation SMS
```

## Quick Start

```bash
cd direct-deposit-service

# 1. Copy and fill in env vars
cp .env.example .env

# 2. Install deps
pip install -r requirements.txt

# 3. Run DB migrations
alembic upgrade head

# 4. Start service
uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 5. Run tests
pytest tests/ -v --cov=app
```

## Environment Variables

See `.env.example` — all required vars are documented there.

**Generate the encryption key:**
```bash
python -c "import secrets,base64; print(base64.b64encode(secrets.token_bytes(32)).decode())"
```

## Security Properties

| Property | Implementation |
|---|---|
| Data at rest | AES-256-GCM per field (routing, account number) |
| Data in transit | TLS 1.3 (upstream proxy) |
| OTP storage | HMAC-SHA256 hash + per-code salt — never plaintext |
| OTP TTL | 10 minutes (configurable) |
| Max OTP attempts | 3 per code |
| OTP issuance rate | 5 per hour per employee |
| Brute-force lock | 10 failures → 15-min lockout |
| Account numbers in logs | Never — last-4 only |
| Audit trail | Immutable, IP + user-agent + before/after |
| Consent | Recorded verbatim with IP and timestamp |
| Pre-note | Zero-dollar test deposit before live ACH |

## Calling From Next.js

```typescript
// Step 1 — submit bank details
const r1 = await fetch('http://direct-deposit-service:8000/api/v1/direct-deposit/initiate', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${supabaseJWT}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ account: { routing_number, account_number, account_type, bank_name, deposit_type: 'full', consent_given: true } }),
});
const { verification_id, phone_last4 } = await r1.json();

// Step 2 — submit OTP
const r2 = await fetch('http://direct-deposit-service:8000/api/v1/direct-deposit/verify', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${supabaseJWT}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ verification_id, code: userEnteredCode }),
});
const { success, account } = await r2.json();
```

## NACHA Compliance Notes

- **Routing numbers**: validated against ABA checksum algorithm
- **Account numbers**: 1–17 digits (NACHA maximum)
- **Pre-note**: zero-dollar entry sent before first live deposit (`PRENOTE_ENABLED=true`)
- **Pre-note clearance**: call `POST /api/v1/direct-deposit/internal/prenote-cleared/{id}` from your ACH return-file processor after 3 banking days with no returns
- **Split deposits**: up to 3 accounts; percentage splits cannot exceed 100%
- **ACH file generation**: hook your ACH origination library to `add_account()` / `clear_prenote()`

## Deployment

- Run behind nginx or AWS ALB for TLS termination
- Set `APP_ENV=production` to disable `/docs`, `/redoc`, and stack traces
- Use Alembic for migrations; never `Base.metadata.create_all` in production
- Redis is required in production for reliable rate limiting
- Rotate `ENCRYPTION_KEY` via a key versioning strategy (store key version ID alongside ciphertexts if needed)
