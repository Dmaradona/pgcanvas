import type { Metadata } from "next";
import { jetbrains, plex, spaceGrotesk } from "@/lib/fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "pgcanvas | Modelagem PostgreSQL",
  description:
    "Construtor visual de modelos de dados PostgreSQL com geracao de DDL e simulacao de dados com integridade referencial.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${spaceGrotesk.variable} ${plex.variable} ${jetbrains.variable}`}
      suppressHydrationWarning
    >
      <body className="bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
