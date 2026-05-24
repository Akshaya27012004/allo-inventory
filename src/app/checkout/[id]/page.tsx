// src/app/checkout/[id]/page.tsx
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import type { ReservationDetail } from "@/lib/schemas";
import CheckoutClient from "@/components/CheckoutClient";

export const dynamic = "force-dynamic";

async function getReservation(id: string): Promise<ReservationDetail | null> {
  const r = await prisma.reservation.findUnique({
    where: { id },
    include: {
      product: { select: { name: true, sku: true, price: true } },
      warehouse: { select: { name: true } },
    },
  });
  if (!r) return null;
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

export default async function CheckoutPage({
  params,
}: {
  params: { id: string };
}) {
  const reservation = await getReservation(params.id);
  if (!reservation) notFound();
  return <CheckoutClient initialReservation={reservation} />;
}
