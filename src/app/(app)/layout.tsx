import { DaysProvider } from "@/components/app/Days";
import { JournalProvider } from "@/components/app/Journal";
import { RoundsProvider } from "@/components/app/Rounds";
import { SessionGate } from "@/components/app/Session";
import { Shell } from "@/components/app/Shell";

// Everything in this group needs a signed-in, approved user. /kit stays outside it.
// The journal provider sits above the screens so a recording keeps going while you change tabs.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <DaysProvider>
        <RoundsProvider>
          <JournalProvider>
            <Shell>{children}</Shell>
          </JournalProvider>
        </RoundsProvider>
      </DaysProvider>
    </SessionGate>
  );
}
