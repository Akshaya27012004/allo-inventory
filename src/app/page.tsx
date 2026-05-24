// src/app/page.tsx
import { prisma } from "@/lib/prisma";
import type { ProductWithStock } from "@/lib/schemas";
import ProductGrid from "@/components/ProductGrid";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function getProducts(): Promise<ProductWithStock[]> {
  const products = await prisma.product.findMany({
    include: {
      stocks: {
        include: {
          warehouse: { select: { name: true, location: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return products.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    sku: p.sku,
    price: p.price,
    imageUrl: p.imageUrl,
    stocks: p.stocks.map((s) => ({
      warehouseId: s.warehouseId,
      warehouseName: s.warehouse.name,
      warehouseLocation: s.warehouse.location,
      total: s.total,
      reserved: s.reserved,
      available: s.total - s.reserved,
    })),
  }));
}

export default async function HomePage() {
  const products = await getProducts();
  const totalAvailable = products.reduce(
    (sum, p) => sum + p.stocks.reduce((s2, st) => s2 + st.available, 0),
    0
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      {/* Hero */}
      <div className="mb-12">
        <div className="flex items-end justify-between gap-4 mb-2 flex-wrap">
          <h1
            className="font-display text-5xl leading-tight"
            style={{ color: "var(--ink)", letterSpacing: "-0.03em" }}
          >
            Catalogue
          </h1>
          <p
            className="text-sm mb-2"
            style={{ color: "var(--ink-faint)" }}
          >
            {totalAvailable} units across {products.length} products
          </p>
        </div>
        <p style={{ color: "var(--ink-muted)" }} className="text-base max-w-xl">
          Reserve stock and complete checkout — your hold is guaranteed for{" "}
          <strong style={{ color: "var(--ink)" }}>10 minutes</strong>.
        </p>
        <div
          className="mt-4 h-px"
          style={{ background: "var(--border)" }}
        />
      </div>

      <ProductGrid products={products} />
    </div>
  );
}
