// src/lib/schemas.ts
import { z } from "zod";

export const CreateReservationSchema = z.object({
  productId: z.string().min(1, "Product ID is required"),
  warehouseId: z.string().min(1, "Warehouse ID is required"),
  quantity: z.number().int().positive("Quantity must be a positive integer"),
});

export type CreateReservationInput = z.infer<typeof CreateReservationSchema>;

export const ReservationIdSchema = z.object({
  id: z.string().min(1),
});

// API response shapes
export interface ProductWithStock {
  id: string;
  name: string;
  description: string | null;
  sku: string;
  price: number;
  imageUrl: string | null;
  stocks: {
    warehouseId: string;
    warehouseName: string;
    warehouseLocation: string;
    total: number;
    reserved: number;
    available: number;
  }[];
}

export interface ReservationDetail {
  id: string;
  productId: string;
  productName: string;
  productSku: string;
  productPrice: number;
  warehouseId: string;
  warehouseName: string;
  quantity: number;
  status: "PENDING" | "CONFIRMED" | "RELEASED";
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
}
