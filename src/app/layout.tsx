import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "OrderAI", template: "%s · OrderAI" },
  description: "Confirm orders and fix unclear addresses by voice, before they ship.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
