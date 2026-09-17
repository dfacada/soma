import { SessionGate } from "@/components/app/Session";
import { Shell } from "@/components/app/Shell";

// Everything in this group needs a signed-in, approved user. /kit stays outside it.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <Shell>{children}</Shell>
    </SessionGate>
  );
}
