"use client";

// Settings → Your data: download everything, or delete the account (src/lib/account.ts). Both are the person's own
// doing, with no admin in the way. The download is made first and saved with a second tap, so the browser treats
// the save as the person's own tap (an iPhone will not save a file that a long wait started).

import { useState } from "react";
import { buildExport, deleteAccount, recordingBytes, saveFile, type ExportStep } from "@/lib/account";
import { haptic } from "@/lib/haptics";
import { report } from "@/lib/log";
import { Button, Field, Input, Sheet, Switch } from "@/components/ui";
import { useJournal } from "./Journal";
import { useSession } from "./Session";
import a from "./app.module.css";

const mb = (bytes: number) => (bytes < 1e6 ? "under 1 MB" : `about ${Math.round(bytes / 1e6)} MB`);

export function DataSettings({ say }: { say: (m: string) => void }) {
  const { me } = useSession();
  const journal = useJournal();
  const open = journal.vault === "open";
  const items = open ? journal.items : null;
  const [withAudio, setWithAudio] = useState(false);
  const [step, setStep] = useState<ExportStep | null>(null);
  const [ready, setReady] = useState<{ file: Blob; name: string; missed: number } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const audioBytes = items ? recordingBytes(items) : 0;
  const waitingForJournal = open && !items;

  async function make() {
    haptic();
    setFailed(null); setReady(null);
    try {
      const vault = items ? { items, unseal: journal.unseal, audioFor: journal.audioFor } : null;
      setReady(await buildExport(vault, withAudio && Boolean(items), setStep));
    } catch (e) {
      report("account", "export_failed", e);
      setFailed("The export couldn't be made. Check your connection and try again.");
    } finally { setStep(null); }
  }

  function save() {
    if (!ready) return;
    haptic("done");
    saveFile(ready.file, ready.name);
    say(ready.missed ? `Saved. ${ready.missed} recording${ready.missed === 1 ? "" : "s"} couldn't be added` : "Saved");
  }

  return (
    <>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
        Download everything Dayhub keeps for you: your days, meals, weight, activity, check-ins, recipes and settings,
        and with your vault unlocked, your journal, weekly reviews and sleep.
      </p>
      {!open && (
        <Field name="Journal, reviews and sleep" help="They're encrypted with your passphrase, so they can only be added while your vault is unlocked.">
          <Button size="sm" variant="journal" onClick={journal.openVault}>{journal.vault === "none" ? "No vault" : "Unlock"}</Button>
        </Field>
      )}
      {open && (
        <Field name="Include recordings" help={waitingForJournal ? "Your journal is still loading." : audioBytes ? `Adds every voice recording, ${mb(audioBytes)}. The download becomes a .zip.` : "You have no recordings yet."}>
          <Switch checked={withAudio} label="Include recordings" onChange={(v) => { haptic(); setWithAudio(v); }} />
        </Field>
      )}
      {ready ? (
        <div className={a.rowButtons}>
          <Button onClick={save}>Save {ready.name.endsWith(".zip") ? "the .zip" : "the file"} ({mb(ready.file.size)})</Button>
          <Button variant="secondary" onClick={() => setReady(null)}>Done</Button>
        </div>
      ) : (
        <Button variant="secondary" disabled={Boolean(step) || waitingForJournal} onClick={() => void make()}>
          {step ? `${step.label}${step.total ? ` · ${step.done} of ${step.total}` : "…"}` : "Download my data"}
        </Button>
      )}
      {failed && <p role="status" className={a.noteBad}>{failed}</p>}

      <span className="eb" style={{ paddingTop: 10 }}>Delete account</span>
      <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Deletes your account and everything in it, for good.</p>
      {/* Quiet here, in red words; the filled red button is kept for the last step, inside the sheet. */}
      <Button variant="secondary" style={{ color: "var(--critical)" }} onClick={() => { haptic(); setAsking(true); }}>Delete my account…</Button>
      <DeleteSheet open={asking} onClose={() => setAsking(false)} admin={me.profile.role === "admin"} userId={me.id} />
    </>
  );
}

function DeleteSheet({ open, onClose, admin, userId }: { open: boolean; onClose: () => void; admin: boolean; userId: string }) {
  const { signOut } = useSession();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const confirmed = typed.trim().toUpperCase() === "DELETE";

  async function go() {
    if (!confirmed || busy) return;
    haptic("done");
    setBusy(true); setFailed(null);
    try {
      await deleteAccount(userId);
      setDone(true);
    } catch (e) {
      report("account", "delete_failed", e);
      setFailed("Your account couldn't be deleted just now. Nothing was removed. Try again in a moment.");
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <Sheet open={open} title="Account deleted" onClose={signOut}>
        <p className="muted" style={{ lineHeight: 1.5 }}>
          Your sign-in is gone, and everything Dayhub kept for you is being deleted now. It takes a few minutes and can&apos;t be undone.
        </p>
        <Button block onClick={signOut}>Done</Button>
      </Sheet>
    );
  }
  return (
    <Sheet open={open} title="Delete your account" onClose={() => { if (!busy) { setTyped(""); setFailed(null); onClose(); } }}>
      {admin ? (
        <p className="muted" style={{ lineHeight: 1.5 }}>An admin account can&apos;t be deleted from the app.</p>
      ) : (
        <>
          <p style={{ lineHeight: 1.5 }}>
            This deletes everything Dayhub keeps for you: your journal and recordings, your days, meals, weight, activity
            and check-ins, weekly reviews, sleep, your place in any rounds, and your sign-in. A group you started passes to
            the next person in it.
          </p>
          <p className="muted" style={{ lineHeight: 1.5 }}>It can&apos;t be undone, and nobody can bring it back. Download your data first if you want to keep it.</p>
          <Input aria-label="Type DELETE to confirm" placeholder="Type DELETE" autoCapitalize="characters" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <Button variant="danger" block disabled={!confirmed || busy} onClick={() => void go()}>{busy ? "Deleting…" : "Delete my account"}</Button>
          {failed && <p role="status" className={a.noteBad}>{failed}</p>}
        </>
      )}
    </Sheet>
  );
}
