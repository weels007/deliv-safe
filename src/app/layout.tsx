import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DelivSafe — Verified Delivery on GenLayer",
  description: "Lock delivery terms, record role-bound checkpoints, and release payment without trusting a single platform operator.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
