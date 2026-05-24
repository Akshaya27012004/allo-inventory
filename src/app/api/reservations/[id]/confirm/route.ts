// src/app/api/reservations/[id]/confirm/route.ts
import { NextRequest, NextResponse } from "next/server";
import { confirmReservation } from "@/lib/reservation-service";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const idempotencyKey = req.headers.get("Idempotency-Key") ?? undefined;

  const result = await confirmReservation(params.id, idempotencyKey);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.message },
      { status: result.status }
    );
  }

  return NextResponse.json(result.reservation);
}
