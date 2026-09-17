import Link from "next/link";

// Placeholder until the Today screen lands (docs/HANDOFF.md §4.3).
export default function Home() {
  return (
    <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, padding: 24, textAlign: "center" }}>
      <span className="eb">Journal · Food · Activity</span>
      <span className="d" style={{ fontSize: 64, letterSpacing: "-0.02em" }}>Soma</span>
      <p className="muted" style={{ maxWidth: 320 }}>One day, one page. The app is being built; the component kit is live.</p>
      <Link href="/kit/" style={{ color: "var(--ink)", fontWeight: 600 }}>Open the component kit</Link>
    </main>
  );
}
