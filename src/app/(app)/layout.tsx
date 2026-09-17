import { JournalProvider } from "@/components/app/Journal";
import { SessionGate } from "@/components/app/Session";
import { Shell } from "@/components/app/Shell";

// Everything in this group needs a signed-in, approved user. /kit stays outside it.
// The journal provider sits above the screens so a recording keeps going while you change tabs.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <JournalProvider>
        <Shell>{children}</Shell>
      </JournalProvider>
    </SessionGate>
  );
}
