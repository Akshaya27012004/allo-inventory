// src/app/api/reservations/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ReservationDetail } from "@/lib/schemas";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id: params.id },
      include: {
        product: { select: { name: true, sku: true, price: true } },
        warehouse: { select: { name: true } },
      },
    });

    if (!reservation) {
      return NextResponse.json(
        { error: "Reservation not found" },
        { status: 404 }
      );
    }

    const detail: ReservationDetail = {
      id: reservation.id,
      productId: reservation.productId,
      productName: reservation.product.name,
      productSku: reservation.product.sku,
      productPrice: reservation.product.price,
      warehouseId: reservation.warehouseId,
      warehouseName: reservation.warehouse.name,
      quantity: reservation.quantity,
      status: reservation.status as ReservationDetail["status"],
      expiresAt: reservation.expiresAt.toISOString(),
      confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
      releasedAt: reservation.releasedAt?.toISOString() ?? null,
      createdAt: reservation.createdAt.toISOString(),
    };

    return NextResponse.json(detail);
  } catch (err) {
    console.error("[GET /api/reservations/:id]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
