// The calls the week in review makes. Kept apart from review.ts so the week maths stays import-free and testable.

import { api, API_BASE, identity } from "./api";
import type { StoredReview, WeekNumbers } from "./review";

export type Written = { synopsis: string; remember: string[]; threads: string[]; noticed: string[] };

export const writeReview = (entries: { day: string; text: string; mood?: string | null }[], numbers: WeekNumbers) =>
  api<Written>("POST", "/review/write", { entries, numbers });

export const listReviews = () => api<{ reviews: StoredReview[] }>("GET", "/reviews");

export const putReview = (weekStart: string, ciphertext: string, hasAudio = false) =>
  api("PUT", `/reviews/${weekStart}`, { ciphertext, hasAudio });

export const sendToTelegram = (text: string, speak: boolean) =>
  api<{ sent: boolean; spoke: boolean }>("POST", "/telegram/send", { text, speak, title: "Week in review" });

/** The review read aloud, a piece at a time. Audio, not JSON, so this one call is made by hand. */
export async function speak(text: string): Promise<Blob> {
  const res = await fetch(API_BASE + "/review/speak", {
    method: "POST",
    headers: { ...(await identity()), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("speak " + res.status);
  return res.blob();
}
