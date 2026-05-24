// src/app/api/reservations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { CreateReservationSchema } from "@/lib/schemas";
import { createReservation } from "@/lib/reservation-service";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = CreateReservationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const idempotencyKey =
      req.headers.get("Idempotency-Key") ?? undefined;

    const { productId, warehouseId, quantity } = parsed.data;
    const result = await createReservation(
      productId,
      warehouseId,
      quantity,
      idempotencyKey
    );

    if (!result.ok) {
      return NextResponse.json(
        { error: result.message },
        { status: result.status }
      );
    }

    return NextResponse.json(result.reservation, { status: 201 });
  } catch (err) {
    console.error("[POST /api/reservations]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
