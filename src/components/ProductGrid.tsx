"use client";

// src/components/ProductGrid.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProductWithStock } from "@/lib/schemas";
import { v4 as uuidv4 } from "uuid";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

function StockBadge({ available }: { available: number }) {
  if (available === 0)
    return (
      <span
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ background: "var(--danger-light)", color: "var(--danger)" }}
      >
        Out of stock
      </span>
    );
  if (available <= 3)
    return (
      <span
        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
        style={{ background: "var(--warning-light)", color: "var(--warning)" }}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
        Only {available} left
      </span>
    );
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
      style={{ background: "var(--success-light)", color: "var(--success)" }}
    >
      {available} available
    </span>
  );
}

function ReserveModal({
  product,
  onClose,
}: {
  product: ProductWithStock;
  onClose: () => void;
}) {
  const router = useRouter();
  const [selectedWarehouseId, setSelectedWarehouseId] = useState(
    product.stocks.find((s) => s.available > 0)?.warehouseId ?? ""
  );
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStock = product.stocks.find(
    (s) => s.warehouseId === selectedWarehouseId
  );

  const handleReserve = async () => {
    if (!selectedWarehouseId || !selectedStock) return;
    setLoading(true);
    setError(null);

    const idempotencyKey = uuidv4();

    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          productId: product.id,
          warehouseId: selectedWarehouseId,
          quantity,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setError(
            data.error ?? "Not enough stock. Another shopper may have just grabbed the last unit."
          );
        } else {
          setError(data.error ?? "Reservation failed. Please try again.");
        }
        return;
      }

      // Navigate to checkout page
      router.push(`/checkout/${data.id}`);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: "rgba(20,17,14,0.5)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl animate-slide-up"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {/* Product header */}
        <div
          className="flex items-start gap-4 p-6"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {product.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={product.imageUrl}
              alt={product.name}
              className="w-16 h-16 rounded-lg object-cover flex-shrink-0"
              style={{ border: "1px solid var(--border)" }}
            />
          )}
          <div className="flex-1 min-w-0">
            <h2
              className="font-display text-xl leading-tight"
              style={{ color: "var(--ink)" }}
            >
              {product.name}
            </h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--ink-faint)" }}>
              SKU: {product.sku}
            </p>
            <p
              className="text-lg font-semibold mt-1"
              style={{ color: "var(--accent)" }}
            >
              {fmt(product.price)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors"
            style={{ color: "var(--ink-muted)" }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "var(--bg-muted)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.background = "transparent")
            }
          >
            ✕
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Warehouse selector */}
          <div>
            <label
              className="block text-xs font-medium mb-2 uppercase tracking-wider"
              style={{ color: "var(--ink-muted)" }}
            >
              Select Warehouse
            </label>
            <div className="space-y-2">
              {product.stocks.map((stock) => (
                <button
                  key={stock.warehouseId}
                  onClick={() => {
                    setSelectedWarehouseId(stock.warehouseId);
                    setQuantity(1);
                  }}
                  disabled={stock.available === 0}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all text-left"
                  style={{
                    border:
                      selectedWarehouseId === stock.warehouseId
                        ? "2px solid var(--accent)"
                        : "1px solid var(--border)",
                    background:
                      selectedWarehouseId === stock.warehouseId
                        ? "var(--accent-light)"
                        : stock.available === 0
                        ? "var(--bg-muted)"
                        : "var(--bg-card)",
                    opacity: stock.available === 0 ? 0.5 : 1,
                    cursor: stock.available === 0 ? "not-allowed" : "pointer",
                  }}
                >
                  <div>
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--ink)" }}
                    >
                      {stock.warehouseName}
                    </p>
                    <p className="text-xs" style={{ color: "var(--ink-faint)" }}>
                      {stock.warehouseLocation}
                    </p>
                  </div>
                  <StockBadge available={stock.available} />
                </button>
              ))}
            </div>
          </div>

          {/* Quantity */}
          {selectedStock && selectedStock.available > 0 && (
            <div>
              <label
                className="block text-xs font-medium mb-2 uppercase tracking-wider"
                style={{ color: "var(--ink-muted)" }}
              >
                Quantity
              </label>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-light transition-colors"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--ink)",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "var(--bg-muted)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "transparent")
                  }
                >
                  −
                </button>
                <span
                  className="text-xl font-semibold w-8 text-center"
                  style={{ color: "var(--ink)" }}
                >
                  {quantity}
                </span>
                <button
                  onClick={() =>
                    setQuantity((q) =>
                      Math.min(selectedStock.available, q + 1)
                    )
                  }
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-lg font-light transition-colors"
                  style={{
                    border: "1px solid var(--border)",
                    color: "var(--ink)",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "var(--bg-muted)")
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget as HTMLElement).style.background =
                      "transparent")
                  }
                >
                  +
                </button>
                <span className="text-sm" style={{ color: "var(--ink-faint)" }}>
                  of {selectedStock.available} available
                </span>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              className="rounded-xl p-4 text-sm"
              style={{
                background: "var(--danger-light)",
                color: "var(--danger)",
                border: "1px solid #f5c6c4",
              }}
            >
              <strong>Could not reserve:</strong> {error}
            </div>
          )}

          {/* CTA */}
          <button
            onClick={handleReserve}
            disabled={
              loading ||
              !selectedWarehouseId ||
              !selectedStock ||
              selectedStock.available === 0
            }
            className="w-full py-3.5 rounded-xl text-sm font-semibold transition-all"
            style={{
              background:
                loading ||
                !selectedWarehouseId ||
                !selectedStock ||
                selectedStock.available === 0
                  ? "var(--bg-muted)"
                  : "var(--accent)",
              color:
                loading ||
                !selectedWarehouseId ||
                !selectedStock ||
                selectedStock.available === 0
                  ? "var(--ink-faint)"
                  : "white",
              cursor:
                loading ||
                !selectedWarehouseId ||
                !selectedStock ||
                selectedStock.available === 0
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {loading ? "Reserving…" : `Reserve · ${fmt(product.price * quantity)}`}
          </button>

          <p className="text-center text-xs" style={{ color: "var(--ink-faint)" }}>
            Your hold is guaranteed for 10 minutes.
            <br />
            No payment charged until you confirm.
          </p>
        </div>
      </div>
    </div>
  );
}

function ProductCard({
  product,
  onReserve,
}: {
  product: ProductWithStock;
  onReserve: () => void;
}) {
  const totalAvailable = product.stocks.reduce(
    (sum, s) => sum + s.available,
    0
  );

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col transition-shadow hover:shadow-md"
      style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
      }}
    >
      {/* Image */}
      {product.imageUrl && (
        <div
          className="relative overflow-hidden"
          style={{ height: 220, background: "var(--bg-muted)" }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={product.imageUrl}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
          />
          <div
            className="absolute top-3 right-3"
          >
            <StockBadge available={totalAvailable} />
          </div>
        </div>
      )}

      {/* Body */}
      <div className="p-5 flex flex-col flex-1">
        <p className="text-xs mb-1" style={{ color: "var(--ink-faint)" }}>
          {product.sku}
        </p>
        <h3
          className="font-display text-lg leading-snug mb-2"
          style={{ color: "var(--ink)" }}
        >
          {product.name}
        </h3>
        {product.description && (
          <p
            className="text-sm leading-relaxed mb-4 flex-1"
            style={{ color: "var(--ink-muted)" }}
          >
            {product.description}
          </p>
        )}

        {/* Warehouse mini-list */}
        <div className="space-y-1.5 mb-5">
          {product.stocks.map((s) => (
            <div key={s.warehouseId} className="flex items-center justify-between text-xs">
              <span style={{ color: "var(--ink-muted)" }}>{s.warehouseName}</span>
              <span
                style={{
                  color:
                    s.available === 0
                      ? "var(--danger)"
                      : s.available <= 3
                      ? "var(--warning)"
                      : "var(--success)",
                  fontWeight: 500,
                }}
              >
                {s.available === 0 ? "Sold out" : `${s.available} units`}
              </span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <span
            className="font-display text-xl"
            style={{ color: "var(--ink)", letterSpacing: "-0.02em" }}
          >
            {fmt(product.price)}
          </span>
          <button
            onClick={onReserve}
            disabled={totalAvailable === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
            style={{
              background:
                totalAvailable === 0 ? "var(--bg-muted)" : "var(--accent)",
              color: totalAvailable === 0 ? "var(--ink-faint)" : "white",
              cursor: totalAvailable === 0 ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (totalAvailable > 0)
                (e.currentTarget as HTMLElement).style.background =
                  "var(--accent-hover)";
            }}
            onMouseLeave={(e) => {
              if (totalAvailable > 0)
                (e.currentTarget as HTMLElement).style.background =
                  "var(--accent)";
            }}
          >
            {totalAvailable === 0 ? "Unavailable" : "Reserve"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductGrid({
  products,
}: {
  products: ProductWithStock[];
}) {
  const [reservingProduct, setReservingProduct] =
    useState<ProductWithStock | null>(null);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product, i) => (
          <div
            key={product.id}
            className="animate-fade-in"
            style={{ animationDelay: `${i * 60}ms`, animationFillMode: "both" }}
          >
            <ProductCard
              product={product}
              onReserve={() => setReservingProduct(product)}
            />
          </div>
        ))}
      </div>

      {reservingProduct && (
        <ReserveModal
          product={reservingProduct}
          onClose={() => setReservingProduct(null)}
        />
      )}
    </>
  );
}
