import type { Metadata } from "next";
import { LogKeeper } from "@/components/app/Nudge";
import { SessionGate } from "@/components/app/Session";
import { OpsShell } from "@/components/ops/OpsShell";

// Soma Ops: running Soma for many people (David, 2026-11-08). Outside the app's tab group: its own frame, none of the
// day, journal or round providers. Signed in and approved like the app; OpsShell lets only admins further.
export const metadata: Metadata = { title: "Soma Ops", description: "Running Soma." };

export default function OpsLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <LogKeeper />
      <OpsShell>{children}</OpsShell>
    </SessionGate>
  );
}
