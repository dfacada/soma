import { LOOK_SCRIPT } from "@/lib/look";
import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import { RegisterSW } from "@/components/app/RegisterSW";
import "./globals.css";

// Display: dates, titles, the one number a screen is about. opsz keeps it crisp from 22px to 64px; wdth gives the
// condensed hero numbers (.dc).
const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin"],
  axes: ["opsz", "wdth"],
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
  title: "Dayhub",
  description: "Journal, food and push-ups in one place.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "Dayhub", statusBarStyle: "black" },
  robots: { index: false, follow: false },
};

// maximumScale is deliberately left alone: inputs are 16px so iOS Safari never zooms, and pinch-zoom stays available.
export const viewport: Viewport = {
  // Night's page colour; applyLook sets the live one from --bone once the theme is known.
  themeColor: "#0B0A09",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets data-theme / data-palette before first paint, so the server HTML and the live DOM differ on <html> by design.
    <html lang="en" suppressHydrationWarning className={`${bricolage.variable} ${figtree.variable} ${jetbrains.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: LOOK_SCRIPT }} />
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
