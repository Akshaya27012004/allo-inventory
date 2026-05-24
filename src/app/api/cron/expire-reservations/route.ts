// src/app/api/cron/expire-reservations/route.ts
import { NextRequest, NextResponse } from "next/server";
import { expireStaleReservations } from "@/lib/reservation-service";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Vercel Cron sends this header; validate it in production
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (
    cronSecret &&
    authHeader !== `Bearer ${cronSecret}`
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const released = await expireStaleReservations();
    console.log(`[cron] Released ${released} expired reservation(s)`);
    return NextResponse.json({ released, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error("[cron/expire-reservations]", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
