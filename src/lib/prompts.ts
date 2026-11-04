// A question for the journal, one a day and the same on every device, for the evenings when nothing comes to mind
// (David, 2026-11-03: "a unique experience that's efficient"). Always offered, never asked: "Not sure where to
// start?" comes before it. No React and no imports, so scripts/test-journal-days.mjs runs it as it is.

export const PROMPTS = [
  "What gave you energy today?",
  "What are you glad you did today?",
  "Who made today better?",
  "What took more out of you than it should have?",
  "What went better than you expected?",
  "What's on your mind that you haven't said out loud?",
  "What did your body need today?",
  "What's one small win from today?",
  "What would you do differently if you had today again?",
  "What are you looking forward to tomorrow?",
  "What did you learn today?",
  "Where did your time go today?",
  "What's been worrying you, and how big is it really?",
  "What would make tomorrow a good day?",
];

/** Today's question: it changes at midnight, in order, and comes round again every two weeks. */
export function promptFor(d: Date): string {
  const days = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  return PROMPTS[((days % PROMPTS.length) + PROMPTS.length) % PROMPTS.length];
}
