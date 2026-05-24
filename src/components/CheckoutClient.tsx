"use client";

// src/components/CheckoutClient.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import type { ReservationDetail } from "@/lib/schemas";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

function useCountdown(expiresAt: string, status: string) {
  const [secondsLeft, setSecondsLeft] = useState(() => {
    return Math.max(
      0,
      Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
    );
  });

  useEffect(() => {
    if (status !== "PENDING") return;

    const tick = () => {
      const remaining = Math.max(
        0,
        Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000)
      );
      setSecondsLeft(remaining);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, status]);

  return secondsLeft;
}

function CountdownRing({ secondsLeft, totalSeconds }: { secondsLeft: number; totalSeconds: number }) {
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = secondsLeft / totalSeconds;
  const strokeDashoffset = circumference * (1 - progress);

  const color =
    secondsLeft <= 60
      ? "var(--danger)"
      : secondsLeft <= 180
      ? "var(--warning)"
      : "var(--success)";

  const minutes = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;

  return (
    <div className="relative flex items-center justify-center" style={{ width: 100, height: 100 }}>
      <svg width="100" height="100" style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth="5"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.3s" }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span
          className="font-display text-xl tabular-nums"
          style={{ color, lineHeight: 1 }}
        >
          {minutes}:{secs.toString().padStart(2, "0")}
        </span>
        <span className="text-xs" style={{ color: "var(--ink-faint)" }}>
          remaining
        </span>
      </div>
    </div>
  );
}

function StatusBanner({
  status,
  error,
}: {
  status: ReservationDetail["status"] | "EXPIRED";
  error?: string | null;
}) {
  if (error) {
    return (
      <div
        className="rounded-xl p-4 text-sm flex gap-3"
        style={{
          background: "var(--danger-light)",
          border: "1px solid #f5c6c4",
          color: "var(--danger)",
        }}
      >
        <span className="text-lg">⚠️</span>
        <div>
          <strong className="block">Action failed</strong>
          {error}
        </div>
      </div>
    );
  }

  if (status === "CONFIRMED") {
    return (
      <div
        className="rounded-xl p-4 text-sm flex gap-3"
        style={{
          background: "var(--success-light)",
          border: "1px solid #b8dfca",
          color: "var(--success)",
        }}
      >
        <span className="text-2xl">✓</span>
        <div>
          <strong className="block text-base">Purchase confirmed!</strong>
          Your order has been placed. You'll receive a confirmation shortly.
        </div>
      </div>
    );
  }

  if (status === "RELEASED" || status === "EXPIRED") {
    return (
      <div
        className="rounded-xl p-4 text-sm flex gap-3"
        style={{
          background: "var(--bg-muted)",
          border: "1px solid var(--border)",
          color: "var(--ink-muted)",
        }}
      >
        <span className="text-lg">○</span>
        <div>
          <strong className="block" style={{ color: "var(--ink)" }}>
            {status === "EXPIRED" ? "Reservation expired" : "Reservation cancelled"}
          </strong>
          {status === "EXPIRED"
            ? "Your hold has expired and the stock has been released."
            : "You cancelled this reservation. The units have been released."}
        </div>
      </div>
    );
  }

  return null;
}

export default function CheckoutClient({
  initialReservation,
}: {
  initialReservation: ReservationDetail;
}) {
  const router = useRouter();
  const [reservation, setReservation] =
    useState<ReservationDetail>(initialReservation);
  const [loading, setLoading] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  const TOTAL_SECONDS = 10 * 60; // 10 min window
  const secondsLeft = useCountdown(reservation.expiresAt, reservation.status);

  // Detect expiry
  const wasExpiredRef = useRef(false);
  useEffect(() => {
    if (
      secondsLeft === 0 &&
      reservation.status === "PENDING" &&
      !wasExpiredRef.current
    ) {
      wasExpiredRef.current = true;
      setExpired(true);
    }
  }, [secondsLeft, reservation.status]);

  // Poll for status changes (e.g. server-side expiry)
  useEffect(() => {
    if (reservation.status !== "PENDING") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/reservations/${reservation.id}`);
        if (res.ok) {
          const data: ReservationDetail = await res.json();
          if (data.status !== "PENDING") {
            setReservation(data);
          }
        }
      } catch {}
    }, 15000);
    return () => clearInterval(interval);
  }, [reservation.id, reservation.status]);

  const handleConfirm = useCallback(async () => {
    setLoading("confirm");
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
        headers: { "Idempotency-Key": `confirm-${reservation.id}` },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 410) {
          setExpired(true);
          setError(data.error ?? "Reservation expired before confirmation.");
        } else {
          setError(data.error ?? "Confirmation failed. Please try again.");
        }
        return;
      }
      setReservation(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }, [reservation.id]);

  const handleCancel = useCallback(async () => {
    setLoading("cancel");
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Cancellation failed. Please try again.");
        return;
      }
      setReservation(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }, [reservation.id]);

  const displayStatus = expired ? "EXPIRED" : reservation.status;
  const isPending = reservation.status === "PENDING" && !expired;

  return (
    <div className="max-w-xl mx-auto px-4 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-8 text-sm" style={{ color: "var(--ink-faint)" }}>
        <a
          href="/"
          className="hover:underline"
          style={{ color: "var(--ink-muted)" }}
        >
          Products
        </a>
        <span>/</span>
        <span>Checkout</span>
      </div>

      <h1
        className="font-display text-4xl mb-2"
        style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
      >
        Checkout
      </h1>
      <p className="text-sm mb-8" style={{ color: "var(--ink-muted)" }}>
        Reservation #{reservation.id.slice(-8).toUpperCase()}
      </p>

      {/* Status banner */}
      <div className="mb-6">
        <StatusBanner status={displayStatus} error={error} />
      </div>

      {/* Main card */}
      <div
        className="rounded-2xl overflow-hidden mb-6"
        style={{ border: "1px solid var(--border)", background: "var(--bg-card)" }}
      >
        {/* Product row */}
        <div
          className="p-6"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <p className="text-xs mb-1" style={{ color: "var(--ink-faint)" }}>
                {reservation.productSku}
              </p>
              <h2
                className="font-display text-xl leading-tight"
                style={{ color: "var(--ink)" }}
              >
                {reservation.productName}
              </h2>
              <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
                {reservation.warehouseName} · Qty {reservation.quantity}
              </p>
            </div>
            <p
              className="font-display text-2xl flex-shrink-0"
              style={{ color: "var(--accent)", letterSpacing: "-0.02em" }}
            >
              {fmt(reservation.productPrice * reservation.quantity)}
            </p>
          </div>
        </div>

        {/* Timer + Status */}
        <div className="p-6 flex items-center gap-6">
          {isPending ? (
            <>
              <CountdownRing
                secondsLeft={secondsLeft}
                totalSeconds={TOTAL_SECONDS}
              />
              <div>
                <p
                  className="font-medium text-sm mb-1"
                  style={{ color: "var(--ink)" }}
                >
                  Hold active
                </p>
                <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                  Your stock is reserved. Complete your purchase before the
                  timer runs out.
                </p>
                <p className="text-xs mt-2" style={{ color: "var(--ink-faint)" }}>
                  Expires at{" "}
                  {new Date(reservation.expiresAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                style={{
                  background:
                    reservation.status === "CONFIRMED"
                      ? "var(--success-light)"
                      : "var(--bg-muted)",
                }}
              >
                {reservation.status === "CONFIRMED" ? "✓" : "○"}
              </div>
              <div>
                <p
                  className="font-medium"
                  style={{ color: "var(--ink)" }}
                >
                  {reservation.status === "CONFIRMED"
                    ? "Order confirmed"
                    : "Reservation ended"}
                </p>
                <p className="text-sm" style={{ color: "var(--ink-muted)" }}>
                  {reservation.confirmedAt
                    ? `Confirmed at ${new Date(reservation.confirmedAt).toLocaleTimeString()}`
                    : reservation.releasedAt
                    ? `Released at ${new Date(reservation.releasedAt).toLocaleTimeString()}`
                    : ""}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div
          className="px-6 pb-6"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          <table className="w-full text-sm mt-4">
            <tbody>
              <tr>
                <td className="py-1.5" style={{ color: "var(--ink-muted)" }}>
                  Unit price
                </td>
                <td
                  className="py-1.5 text-right"
                  style={{ color: "var(--ink)" }}
                >
                  {fmt(reservation.productPrice)}
                </td>
              </tr>
              <tr>
                <td className="py-1.5" style={{ color: "var(--ink-muted)" }}>
                  Quantity
                </td>
                <td
                  className="py-1.5 text-right"
                  style={{ color: "var(--ink)" }}
                >
                  {reservation.quantity}
                </td>
              </tr>
              <tr>
                <td
                  className="py-2 font-semibold"
                  style={{ color: "var(--ink)", borderTop: "1px solid var(--border)" }}
                >
                  Total
                </td>
                <td
                  className="py-2 text-right font-semibold"
                  style={{
                    color: "var(--accent)",
                    borderTop: "1px solid var(--border)",
                  }}
                >
                  {fmt(reservation.productPrice * reservation.quantity)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Action buttons */}
      {isPending && (
        <div className="flex gap-3">
          <button
            onClick={handleConfirm}
            disabled={loading !== null}
            className="flex-1 py-3.5 rounded-xl font-semibold text-sm transition-all"
            style={{
              background: loading ? "var(--bg-muted)" : "var(--accent)",
              color: loading ? "var(--ink-faint)" : "white",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading === "confirm" ? "Processing…" : "Confirm purchase"}
          </button>
          <button
            onClick={handleCancel}
            disabled={loading !== null}
            className="px-6 py-3.5 rounded-xl font-medium text-sm transition-all"
            style={{
              border: "1px solid var(--border)",
              color: loading ? "var(--ink-faint)" : "var(--ink-muted)",
              cursor: loading ? "not-allowed" : "pointer",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              if (!loading)
                (e.currentTarget as HTMLElement).style.background =
                  "var(--bg-muted)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
          >
            {loading === "cancel" ? "Cancelling…" : "Cancel"}
          </button>
        </div>
      )}

      {(reservation.status === "CONFIRMED" ||
        reservation.status === "RELEASED" ||
        expired) && (
        <button
          onClick={() => router.push("/")}
          className="w-full py-3.5 rounded-xl font-medium text-sm transition-colors"
          style={{
            border: "1px solid var(--border)",
            color: "var(--ink-muted)",
          }}
          onMouseEnter={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "var(--bg-muted)")
          }
          onMouseLeave={(e) =>
            ((e.currentTarget as HTMLElement).style.background = "transparent")
          }
        >
          ← Back to products
        </button>
      )}
    </div>
  );
}
