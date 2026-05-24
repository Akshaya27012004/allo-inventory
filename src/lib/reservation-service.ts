// src/lib/reservation-service.ts
/**
 * Reservation Service
 *
 * Concurrency strategy:
 *   1. Optimistic approach using a Postgres SELECT ... FOR UPDATE row-level lock
 *      inside a transaction. This guarantees that two simultaneous requests for
 *      the same (product, warehouse) row will serialize — exactly one will
 *      decrement stock, and the other will see 0 available and get a 409.
 *   2. When Redis is available we additionally take a short-lived distributed
 *      lock BEFORE entering the transaction. This is belt-and-suspenders for
 *      multi-process / multi-replica deployments and also prevents the DB from
 *      being hammered with concurrent transactions during a spike.
 *
 * The FOR UPDATE lock is the correctness guarantee.
 * The Redis lock is a performance optimisation.
 */

import { prisma } from "@/lib/prisma";
import { acquireLock } from "@/lib/redis";
import type { ReservationDetail } from "@/lib/schemas";

const RESERVATION_MINUTES = parseInt(
  process.env.RESERVATION_MINUTES ?? "10",
  10
);

function formatReservation(r: {
  id: string;
  productId: string;
  product: { name: string; sku: string; price: number };
  warehouseId: string;
  warehouse: { name: string };
  quantity: number;
  status: string;
  expiresAt: Date;
  confirmedAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
}): ReservationDetail {
  return {
    id: r.id,
    productId: r.productId,
    productName: r.product.name,
    productSku: r.product.sku,
    productPrice: r.product.price,
    warehouseId: r.warehouseId,
    warehouseName: r.warehouse.name,
    quantity: r.quantity,
    status: r.status as ReservationDetail["status"],
    expiresAt: r.expiresAt.toISOString(),
    confirmedAt: r.confirmedAt?.toISOString() ?? null,
    releasedAt: r.releasedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

const reservationInclude = {
  product: { select: { name: true, sku: true, price: true } },
  warehouse: { select: { name: true } },
};

// ─── Create Reservation ───────────────────────────────────────────────────────

export type CreateResult =
  | { ok: true; reservation: ReservationDetail }
  | { ok: false; status: 409 | 404 | 500; message: string };

export async function createReservation(
  productId: string,
  warehouseId: string,
  quantity: number,
  idempotencyKey?: string
): Promise<CreateResult> {
  // Check idempotency first (outside transaction — fast path)
  if (idempotencyKey) {
    const existing = await prisma.reservation.findUnique({
      where: { idempotencyKey },
      include: reservationInclude,
    });
    if (existing) return { ok: true, reservation: formatReservation(existing) };
  }

  const lockKey = `reservation:${productId}:${warehouseId}`;
  const releaseLock = await acquireLock(lockKey, 8000);

  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Lock the stock row for this product+warehouse
        const stock = await tx.$queryRaw<
          { id: string; total: number; reserved: number }[]
        >`
          SELECT id, total, reserved
          FROM "Stock"
          WHERE "productId" = ${productId}
            AND "warehouseId" = ${warehouseId}
          FOR UPDATE
        `;

        if (stock.length === 0) {
          return {
            ok: false as const,
            status: 404 as const,
            message: "Stock record not found for this product and warehouse.",
          };
        }

        const { id: stockId, total, reserved } = stock[0];
        const available = total - reserved;

        if (available < quantity) {
          return {
            ok: false as const,
            status: 409 as const,
            message: `Only ${available} unit(s) available, but ${quantity} requested.`,
          };
        }

        // Increment reserved
        await tx.$executeRaw`
          UPDATE "Stock"
          SET reserved = reserved + ${quantity},
              "updatedAt" = NOW()
          WHERE id = ${stockId}
        `;

        const expiresAt = new Date(
          Date.now() + RESERVATION_MINUTES * 60 * 1000
        );

        const reservation = await tx.reservation.create({
          data: {
            productId,
            warehouseId,
            quantity,
            status: "PENDING",
            expiresAt,
            idempotencyKey: idempotencyKey ?? null,
          },
          include: reservationInclude,
        });

        return { ok: true as const, reservation: formatReservation(reservation) };
      },
      {
        maxWait: 5000,
        timeout: 10000,
        isolationLevel: "ReadCommitted",
      }
    );

    return result;
  } catch (err) {
    console.error("[createReservation]", err);
    return { ok: false, status: 500, message: "Internal server error." };
  } finally {
    await releaseLock?.();
  }
}

// ─── Confirm Reservation ──────────────────────────────────────────────────────

export type ConfirmResult =
  | { ok: true; reservation: ReservationDetail }
  | { ok: false; status: 404 | 409 | 410 | 500; message: string };

export async function confirmReservation(
  id: string,
  idempotencyKey?: string
): Promise<ConfirmResult> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id },
        include: reservationInclude,
      });

      if (!reservation) {
        return {
          ok: false as const,
          status: 404 as const,
          message: "Reservation not found.",
        };
      }

      if (reservation.status === "CONFIRMED") {
        return { ok: true as const, reservation: formatReservation(reservation) };
      }

      if (reservation.status === "RELEASED") {
        return {
          ok: false as const,
          status: 409 as const,
          message: "Reservation has already been released.",
        };
      }

      if (reservation.expiresAt < new Date()) {
        // Lazy cleanup: release it now
        await tx.reservation.update({
          where: { id },
          data: { status: "RELEASED", releasedAt: new Date() },
        });
        await tx.$executeRaw`
          UPDATE "Stock"
          SET reserved = GREATEST(reserved - ${reservation.quantity}, 0),
              "updatedAt" = NOW()
          WHERE "productId" = ${reservation.productId}
            AND "warehouseId" = ${reservation.warehouseId}
        `;
        return {
          ok: false as const,
          status: 410 as const,
          message: "Reservation has expired.",
        };
      }

      // Confirm: decrement total stock (reserved already counted)
      await tx.$executeRaw`
        UPDATE "Stock"
        SET total    = GREATEST(total - ${reservation.quantity}, 0),
            reserved = GREATEST(reserved - ${reservation.quantity}, 0),
            "updatedAt" = NOW()
        WHERE "productId" = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `;

      const updated = await tx.reservation.update({
        where: { id },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
        include: reservationInclude,
      });

      return { ok: true as const, reservation: formatReservation(updated) };
    });

    return result;
  } catch (err) {
    console.error("[confirmReservation]", err);
    return { ok: false, status: 500, message: "Internal server error." };
  }
}

// ─── Release Reservation ──────────────────────────────────────────────────────

export type ReleaseResult =
  | { ok: true; reservation: ReservationDetail }
  | { ok: false; status: 404 | 409 | 500; message: string };

export async function releaseReservation(id: string): Promise<ReleaseResult> {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({
        where: { id },
        include: reservationInclude,
      });

      if (!reservation) {
        return {
          ok: false as const,
          status: 404 as const,
          message: "Reservation not found.",
        };
      }

      if (reservation.status !== "PENDING") {
        return {
          ok: false as const,
          status: 409 as const,
          message: `Cannot release a reservation with status "${reservation.status}".`,
        };
      }

      await tx.$executeRaw`
        UPDATE "Stock"
        SET reserved = GREATEST(reserved - ${reservation.quantity}, 0),
            "updatedAt" = NOW()
        WHERE "productId" = ${reservation.productId}
          AND "warehouseId" = ${reservation.warehouseId}
      `;

      const updated = await tx.reservation.update({
        where: { id },
        data: { status: "RELEASED", releasedAt: new Date() },
        include: reservationInclude,
      });

      return { ok: true as const, reservation: formatReservation(updated) };
    });

    return result;
  } catch (err) {
    console.error("[releaseReservation]", err);
    return { ok: false, status: 500, message: "Internal server error." };
  }
}

// ─── Expire Stale Reservations (called by cron) ───────────────────────────────

export async function expireStaleReservations(): Promise<number> {
  const stale = await prisma.reservation.findMany({
    where: { status: "PENDING", expiresAt: { lt: new Date() } },
  });

  if (stale.length === 0) return 0;

  await prisma.$transaction(
    stale.map((r) =>
      prisma.$executeRaw`
        UPDATE "Stock"
        SET reserved = GREATEST(reserved - ${r.quantity}, 0),
            "updatedAt" = NOW()
        WHERE "productId" = ${r.productId}
          AND "warehouseId" = ${r.warehouseId}
      `
    )
  );

  await prisma.reservation.updateMany({
    where: { id: { in: stale.map((r) => r.id) } },
    data: { status: "RELEASED", releasedAt: new Date() },
  });

  return stale.length;
}
