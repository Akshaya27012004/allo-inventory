// prisma/seed.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean existing data
  await prisma.reservation.deleteMany();
  await prisma.stock.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();
  await prisma.idempotencyRecord.deleteMany();

  // Create warehouses
  const [mumbai, delhi, bangalore] = await Promise.all([
    prisma.warehouse.create({
      data: { name: "Mumbai Hub", location: "Mumbai, Maharashtra" },
    }),
    prisma.warehouse.create({
      data: { name: "Delhi Central", location: "New Delhi, Delhi" },
    }),
    prisma.warehouse.create({
      data: { name: "Bangalore Tech Park", location: "Bangalore, Karnataka" },
    }),
  ]);

  // Create products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Sony WH-1000XM5 Headphones",
        description:
          "Industry-leading noise cancelling wireless headphones with Auto NC Optimizer",
        sku: "SONY-WH1000XM5-BLK",
        price: 29990,
        imageUrl:
          "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?w=400&q=80",
      },
    }),
    prisma.product.create({
      data: {
        name: "Apple AirPods Pro (2nd Gen)",
        description:
          "Active Noise Cancellation, Adaptive Transparency, Personalised Spatial Audio",
        sku: "APPLE-AIRPODSPRO-2",
        price: 24900,
        imageUrl:
          "https://images.unsplash.com/photo-1600294037681-c80b4cb5b434?w=400&q=80",
      },
    }),
    prisma.product.create({
      data: {
        name: "Samsung Galaxy S24 Ultra",
        description:
          "200MP camera, S Pen included, Titanium frame, 12GB RAM",
        sku: "SAMSUNG-S24ULTRA-256",
        price: 129999,
        imageUrl:
          "https://images.unsplash.com/photo-1610945415295-d9bbf067e59c?w=400&q=80",
      },
    }),
    prisma.product.create({
      data: {
        name: "MacBook Air M3",
        description:
          "13-inch MacBook Air with M3 chip, 8GB unified memory, 256GB SSD",
        sku: "APPLE-MBA-M3-256",
        price: 114900,
        imageUrl:
          "https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=400&q=80",
      },
    }),
    prisma.product.create({
      data: {
        name: "Logitech MX Master 3S",
        description:
          "Advanced wireless mouse with ultra-fast MagSpeed scrolling",
        sku: "LOGI-MX3S-GRAPHITE",
        price: 9995,
        imageUrl:
          "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?w=400&q=80",
      },
    }),
    prisma.product.create({
      data: {
        name: "Kindle Paperwhite (11th Gen)",
        description:
          "6.8\" display, adjustable warm light, 8 weeks of battery, waterproof",
        sku: "AMAZON-KPW11-16GB",
        price: 13999,
        imageUrl:
          "https://images.unsplash.com/photo-1592496431122-2349e0fbc666?w=400&q=80",
      },
    }),
  ]);

  // Create stock levels
  const stockData = [
    // Sony Headphones
    { productId: products[0].id, warehouseId: mumbai.id, total: 12, reserved: 0 },
    { productId: products[0].id, warehouseId: delhi.id, total: 8, reserved: 0 },
    { productId: products[0].id, warehouseId: bangalore.id, total: 3, reserved: 0 },
    // AirPods Pro
    { productId: products[1].id, warehouseId: mumbai.id, total: 2, reserved: 0 },
    { productId: products[1].id, warehouseId: delhi.id, total: 5, reserved: 0 },
    { productId: products[1].id, warehouseId: bangalore.id, total: 1, reserved: 0 },
    // Samsung S24 Ultra
    { productId: products[2].id, warehouseId: mumbai.id, total: 7, reserved: 0 },
    { productId: products[2].id, warehouseId: delhi.id, total: 4, reserved: 0 },
    { productId: products[2].id, warehouseId: bangalore.id, total: 6, reserved: 0 },
    // MacBook Air M3
    { productId: products[3].id, warehouseId: mumbai.id, total: 1, reserved: 0 },
    { productId: products[3].id, warehouseId: delhi.id, total: 3, reserved: 0 },
    { productId: products[3].id, warehouseId: bangalore.id, total: 2, reserved: 0 },
    // Logitech MX Master
    { productId: products[4].id, warehouseId: mumbai.id, total: 20, reserved: 0 },
    { productId: products[4].id, warehouseId: delhi.id, total: 15, reserved: 0 },
    { productId: products[4].id, warehouseId: bangalore.id, total: 10, reserved: 0 },
    // Kindle
    { productId: products[5].id, warehouseId: mumbai.id, total: 9, reserved: 0 },
    { productId: products[5].id, warehouseId: delhi.id, total: 6, reserved: 0 },
    { productId: products[5].id, warehouseId: bangalore.id, total: 4, reserved: 0 },
  ];

  await prisma.stock.createMany({ data: stockData });

  console.log(
    `✅ Seeded: ${products.length} products, 3 warehouses, ${stockData.length} stock records`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
