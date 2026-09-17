import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";

// Display: dates, titles, the one number a screen is about. opsz keeps it crisp from 22px to 64px.
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
});

const figtree = Figtree({
  variable: "--font-figtree",
  subsets: ["latin"],
  display: "swap",
});

// Labels and every number, tabular.
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Soma",
  description: "Journal, food and push-ups in one place.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Soma", statusBarStyle: "default" },
  robots: { index: false, follow: false },
};

// maximumScale is deliberately left alone: inputs are 16px so iOS Safari never zooms, and pinch-zoom stays available.
export const viewport: Viewport = {
  themeColor: "#F4F3EF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${bricolage.variable} ${figtree.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
