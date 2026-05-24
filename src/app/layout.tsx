import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allo — Inventory & Reservations",
  description: "Multi-warehouse inventory with real-time stock reservations",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
      </head>
      <body style={{ background: "var(--bg)" }}>
        <header
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }}
          className="sticky top-0 z-40"
        >
          <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <span className="font-display text-xl" style={{ color: "var(--ink)" }}>
                Allo
              </span>
            </a>
            <nav>
              <a href="/" className="px-3 py-1.5 rounded-md text-sm" style={{ color: "var(--ink-muted)" }}>
                Products
              </a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
        <footer
          style={{ borderTop: "1px solid var(--border)", color: "var(--ink-faint)" }}
          className="mt-24 py-8 text-center text-sm"
        >
          Allo Inventory — take-home exercise
        </footer>
      </body>
    </html>
  );
}