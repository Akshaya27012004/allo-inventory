# Allo — Inventory & Reservation Platform

A Next.js inventory and order-fulfillment platform with real-time stock reservations, race-condition-safe concurrency, and a live countdown checkout flow.

---

## Live Demo

**URL:** `https://allo-inventory.vercel.app` _(replace after deployment)_

Seeded with 6 products across 3 warehouses. Some have intentionally low stock (1–3 units) to demonstrate the race condition protection.

---

## Local Setup

### Prerequisites

- Node.js 18+
- A hosted PostgreSQL database (Supabase, Neon, Railway — all have free tiers)
- Redis (optional but recommended — Upstash has a free tier)

### 1. Clone and install

```bash
git clone https://github.com/your-username/allo-inventory
cd allo-inventory
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in your `.env.local`:

```env
# PostgreSQL — get from Supabase/Neon/Railway
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"

# Redis — get from Upstash (optional; set USE_REDIS=false to skip)
REDIS_URL="rediss://default:pass@host:port"
USE_REDIS="true"

# Reservation window in minutes
RESERVATION_MINUTES="10"

# Cron job secret (can be anything for local dev)
CRON_SECRET="dev-secret"
```

### 3. Database setup

```bash
# Push schema to your hosted DB
npm run db:push

# Seed with sample data
npm run db:seed
```

### 4. Run locally

```bash
npm run dev
# → http://localhost:3000
```

---

## How the Concurrency Works

This is the core of the exercise. The race condition is:

> Two users simultaneously reach checkout for the last unit of a product. Both see "1 available". Who gets it?

### Solution: PostgreSQL row-level locking + Redis distributed lock

**Layer 1 — `SELECT ... FOR UPDATE` (correctness guarantee)**

When `POST /api/reservations` is called, the service opens a Postgres transaction and immediately locks the `Stock` row for the specific `(productId, warehouseId)` pair:

```sql
SELECT id, total, reserved
FROM "Stock"
WHERE "productId" = $1 AND "warehouseId" = $2
FOR UPDATE
```

`FOR UPDATE` acquires an exclusive row lock. If a second concurrent transaction tries to lock the same row, it blocks until the first transaction commits or rolls back. This means:

- Transaction A reads `available = 1`, decrements → commits.
- Transaction B finally gets the lock, re-reads `available = 0` → returns 409.

Exactly one succeeds. This is a correctness guarantee at the database level — it works regardless of deployment topology.

**Layer 2 — Redis distributed lock (performance optimisation)**

Before entering the Postgres transaction we try to acquire a Redis `SET NX PX` lock on `lock:{productId}:{warehouseId}`. This:

- Reduces database contention during traffic spikes (losing requests fail fast at Redis rather than queuing up in Postgres)
- Provides a second line of defense in multi-replica environments

If Redis is unavailable (network blip, free tier cold start), we fall through gracefully — the Postgres lock is sufficient on its own.

**Why not optimistic locking / version counters?**

Optimistic locking (compare-and-swap on a version column) would work but creates a retry loop in application code. Under high contention it performs worse than pessimistic locking and the code is harder to reason about. For inventory — where contention on a specific SKU/warehouse combination is the common case — pessimistic locking is the right choice.

---

## Reservation Expiry

### Production approach: Vercel Cron (1-minute cadence)

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/expire-reservations",
      "schedule": "* * * * *"
    }
  ]
}
```

Every minute, `GET /api/cron/expire-reservations` runs `expireStaleReservations()`:

1. Find all `PENDING` reservations where `expiresAt < NOW()`
2. For each: restore reserved units with `GREATEST(reserved - qty, 0)` (guards against double-release)
3. Mark all as `RELEASED` in a single `updateMany`

Steps 2 and 3 are wrapped in a Prisma transaction, so a partial failure doesn't leave reserved units orphaned.

### Lazy expiry on read (belt-and-suspenders)

`POST /api/reservations/:id/confirm` also checks expiry inside its transaction. If the reservation has expired by the time a user clicks "Confirm", it gets cleaned up immediately and returns `410 Gone`. This means the system is correct even if the cron job has a gap.

### Trade-off: eventual consistency window

There's up to a 1-minute window where an expired reservation's units are still technically locked in the DB. In practice this is fine — it's a very short window and `available` already reflects the true state once the cron runs. A tighter SLA would require a background worker (e.g. BullMQ on a long-running Node process) rather than serverless cron.

---

## Idempotency

The `POST /api/reservations` and `POST /api/reservations/:id/confirm` endpoints support the `Idempotency-Key` header.

**How it works:**

- For `POST /api/reservations`: the key is stored on the `Reservation` row via the `idempotencyKey` unique field. On retry, `findUnique({ where: { idempotencyKey } })` returns the existing reservation before any locking or transaction overhead.
- For confirm: the function checks if the reservation is already `CONFIRMED` and returns it immediately — making the operation naturally idempotent.
- The frontend generates a UUID per reserve attempt (not per page load) using `uuid`, so network retries from the same action won't double-book.

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/products` | All products with available stock per warehouse |
| `GET` | `/api/warehouses` | All warehouses |
| `POST` | `/api/reservations` | Reserve units; `409` if insufficient stock |
| `GET` | `/api/reservations/:id` | Reservation details |
| `POST` | `/api/reservations/:id/confirm` | Confirm; `410` if expired |
| `POST` | `/api/reservations/:id/release` | Release early |
| `GET` | `/api/cron/expire-reservations` | Expire stale reservations (cron) |

---

## Tech Stack

- **Next.js 14** (App Router, Server Components)
- **Prisma** — ORM + `$queryRaw` for `SELECT ... FOR UPDATE`
- **PostgreSQL** (Supabase / Neon / Railway)
- **Redis** (Upstash) — distributed locking
- **Zod** — shared validation schemas
- **Tailwind CSS** — styling
- **TypeScript** — end-to-end types

---

## Trade-offs & What I'd Do Differently

### What I'd improve with more time

1. **Auth** — reservations are currently anonymous. In production each would be tied to a user session/JWT. The checkout page should verify ownership before showing confirm/cancel.

2. **Payment integration** — the "Confirm" button currently just marks the reservation CONFIRMED immediately. In a real system this would initiate a payment flow (Razorpay, Stripe) and the confirmation would happen via a webhook callback, not a synchronous button press.

3. **Optimistic UI on the product listing** — after reserving, the product grid still shows the old stock count until the next server render. A SWR/React Query layer would fix this.

4. **Database indices** — the `Stock` table should have a composite index on `(productId, warehouseId)`. Prisma creates one automatically for the `@@unique` constraint, which doubles as the index we need for `FOR UPDATE` lookups.

5. **Redis lock TTL tuning** — currently hardcoded at 8 seconds. This should be slightly longer than the Postgres transaction timeout to avoid releasing the lock while the transaction is still in-flight.

6. **Connection pooling** — for production, PgBouncer (built into Supabase) or `@prisma/connection-pool` should be used to avoid exhausting Postgres connection limits under load.

7. **Observability** — structured logging (Pino), error tracking (Sentry), and a dashboard showing reservation funnel metrics.

### Conscious simplifications

- No user accounts — reservations are identified by URL only
- No email notifications
- No address/shipping fields
- Single quantity increment (no bulk add from cart)
- Cron runs every 1 min (free tier limit) vs. a proper job queue for sub-minute accuracy
