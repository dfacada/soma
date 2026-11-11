// Cloud transcription. Plaintext audio leaves the device here, so it only runs when the user has switched it on:
// cloud transcription for a journal entry, Say your day for a recording made to fill in the day (ids day_…); food
// said aloud (ids food_…) is a tap of its own. The audio goes to a short-lived object, a job sends it to Groq and
// blanks it, and the transcript comes back here to be encrypted into the entry. Nothing readable is kept on the
// server afterwards.

import { api, ApiError } from "./api";
import { PUT_HEADERS } from "./journal";
import { toWav } from "./playable";

type Job = { id: string; status: "queued" | "running" | "done" | "failed"; error: string | null; result: string | null };
type Signed = { urls: { name: string; url: string }[] };

const POLL_MS = 2000;
const GIVE_UP_MS = 4 * 60 * 1000;

export class TranscribeError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

const MESSAGES: Record<string, string> = {
  not_configured: "Transcription is not set up on the server yet.",
  too_large: "This recording is over 25 MB, which is too long to transcribe.",
  rate_limited: "The transcription service is busy. Try again in a minute.",
  provider_auth: "The server's transcription key was rejected.",
  provider_unreachable: "The transcription service could not be reached.",
  timed_out: "Transcription took too long. Try again.",
};
const explain = (code: string) => MESSAGES[code] || "Transcription failed. Try again.";

function extension(mime: string) {
  if (mime.includes("mp4") || mime.includes("m4a") || mime.includes("aac")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

async function signedUrl(method: "PUT" | "GET", name: string) {
  const res = await api<Signed>("POST", "/sign", { kind: "drafts", method, names: [name] });
  return res.urls[0].url;
}

/** Overwrites an upload no job will ever read. The server shreds what it refuses, but when the request to start the
 *  job never reached it (a dropped connection), only the browser knows the audio is there, and there is no job row
 *  for the hourly sweep to find. Best effort: if this fails too, the network is down for both. */
async function blank(name: string) {
  try { await fetch(await signedUrl("PUT", name), { method: "PUT", body: " ", headers: PUT_HEADERS }); } catch { /* nothing more to try */ }
}

export async function transcribe(entryId: string, audio: Blob): Promise<string> {
  const source = `tx-${entryId}.${extension(audio.type || "")}`;
  // fetch rejects (rather than returning a status) when the network or CORS stops the request.
  // overwrite: a second attempt reuses the name, and the first attempt's blanked object can still exist for a minute.
  const put = await fetch(await signedUrl("PUT", source), { method: "PUT", body: audio, headers: PUT_HEADERS }).catch(() => null);
  if (!put || !put.ok) throw new TranscribeError("upload_failed", "The recording could not be sent for transcription.");

  let job: Job;
  try { job = await api<Job>("POST", "/jobs", { type: "transcribe", entryId, source }); }
  catch (e) {
    if (!(e instanceof ApiError)) await blank(source);
    // Two different 429s: the day's cap (the answer carries `limit`; waiting a minute won't help, so no retry) and
    // the queue being full (Journal waits and tries again).
    if (e instanceof ApiError && e.status === 429 && (e.body as { limit?: string } | null)?.limit) throw new TranscribeError("daily_limit", e.message);
    if (e instanceof ApiError && e.status === 429) throw new TranscribeError("queue_busy", "Several transcriptions are already running. Try again shortly.");
    // Each kind of recording has its own switch: a Say your day recording (ids day_…) is not held to cloud transcription.
    if (e instanceof ApiError && e.status === 403) throw new TranscribeError("switched_off", entryId.startsWith("day_") ? "Say your day is off. Turn it on in Settings → Journal and vault." : "Cloud transcription is off. Turn it on in Settings → Journal & vault.");
    throw new TranscribeError("queue_failed", "The transcription could not be started.");
  }

  try {
    const started = Date.now();
    while (job.status === "queued" || job.status === "running") {
      if (Date.now() - started > GIVE_UP_MS) throw new TranscribeError("timed_out", explain("timed_out"));
      await new Promise((r) => setTimeout(r, POLL_MS));
      job = await api<Job>("GET", `/jobs/${job.id}`);
    }
    if (job.status === "failed" || !job.result) throw new TranscribeError(job.error || "failed", explain(job.error || "failed"));
    const res = await fetch(await signedUrl("GET", job.result));
    if (!res.ok) throw new TranscribeError("result_missing", explain("failed"));
    const text = String(((await res.json()) as { text?: string }).text || "").trim();
    // Whisper answers silence or noise with a stray "." or similar; with no letter or digit in it, that is not a transcript.
    return /[\p{L}\p{N}]/u.test(text) ? text : "";
  } finally {
    // Removes the row and blanks whatever the job left behind, whether this succeeded or not.
    void api("DELETE", `/jobs/${job.id}`).catch(() => undefined);
  }
}

const MAX_BYTES = 25 * 1024 * 1024;

/** transcribe(), and when Groq refuses the file itself (it calls some iOS WebM recordings "invalid media"), once
 *  more as 16 kHz WAV: Whisper's own rate, so nothing is lost, and the WAV that fits the most minutes under 25 MB.
 *  `onStep` hears transcribe, convert:<step> and transcribe_wav as each starts, so a failure names its stage. */
export async function transcribeAudio(entryId: string, audio: Blob, onStep: (step: string) => void = () => undefined): Promise<string> {
  onStep("transcribe");
  try { return await transcribe(entryId, audio); }
  catch (e) { if (!(e instanceof TranscribeError) || e.code !== "provider_error" || audio.type.includes("wav")) throw e; }
  let wav: Blob;
  try { wav = (await toWav(audio, (step) => onStep("convert:" + step), 16000)).wav; }
  catch (e) { throw new TranscribeError("convert_failed", `This recording couldn't be converted for transcription (${(e as Error)?.message || e}).`); }
  if (wav.size > MAX_BYTES) throw new TranscribeError("too_large", explain("too_large"));
  onStep("transcribe_wav");
  return transcribe(entryId, wav);
}
