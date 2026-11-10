import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eventos | Doorlist",
  description: "Descubre los eventos publicados en Doorlist y sus tipos de entrada.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
