// Where an open vault's key waits between reloads, and how it is thrown away.
//
// The key lives in sessionStorage for the life of the tab (as in Glimpse), under one name per person, so a reload
// does not lock the journal. Signing out has to remove it: Catalyst's sign-out ends the session, but sessionStorage
// outlives a sign-out in the same tab, so the next person at that browser would find the key still there (found
// 2026-11-10). No React and no imports, so scripts/test-security.mjs runs this file as it is.

export const SESSION_KEY = "soma-ck-v1.";

type KeyStore = Pick<Storage, "length" | "key" | "removeItem">;

/** Forget every vault key this tab is holding, whoever's it is. Returns how many went. Safe when there is none,
 *  and where sessionStorage cannot be used at all (a private window): then there was nothing to forget. */
export function forgetVaultKeys(store?: KeyStore | null): number {
  let gone = 0;
  try {
    const s = store === undefined ? sessionStorage : store;
    if (!s) return 0;
    const names: string[] = [];
    for (let i = 0; i < s.length; i++) { const name = s.key(i); if (name && name.startsWith(SESSION_KEY)) names.push(name); }
    for (const name of names) { s.removeItem(name); gone++; }
  } catch { /* storage is unavailable */ }
  return gone;
}
