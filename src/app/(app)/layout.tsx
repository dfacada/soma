import { DaysProvider } from "@/components/app/Days";
import { HealthProvider } from "@/components/app/Health";
import { JournalProvider } from "@/components/app/Journal";
import { Opening } from "@/components/app/Opening";
import { RoundsProvider } from "@/components/app/Rounds";
import { SessionGate } from "@/components/app/Session";
import { Shell } from "@/components/app/Shell";

// Everything in this group needs a signed-in, approved user. /kit stays outside it.
// The journal provider sits above the screens so a recording keeps going while you change tabs.
// Health sits inside it: the Google Health token is vault ciphertext, and its steps go into the day map.
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGate>
      <Opening />
      <DaysProvider>
        <RoundsProvider>
          <JournalProvider>
            <HealthProvider>
              <Shell>{children}</Shell>
            </HealthProvider>
          </JournalProvider>
        </RoundsProvider>
      </DaysProvider>
    </SessionGate>
  );
}
