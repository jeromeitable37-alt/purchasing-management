import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Purchasing Management System",
  description: "Complete purchasing management, routing, delivery, document and supplier evaluation system.",
  applicationName: "Purchasing Management System",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}