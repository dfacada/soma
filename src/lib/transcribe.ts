// Cloud transcription. This is the one place plaintext leaves the device, so it only runs when the user has
// switched it on. The audio goes to a short-lived object, a job sends it to Groq and blanks it, and the transcript
// comes back here to be encrypted into the entry. Nothing readable is kept on the server afterwards.

import { api, ApiError } from "./api";

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

export async function transcribe(entryId: string, audio: Blob): Promise<string> {
  const source = `tx-${entryId}.${extension(audio.type || "")}`;
  // fetch rejects (rather than returning a status) when the network or CORS stops the request.
  const put = await fetch(await signedUrl("PUT", source), { method: "PUT", body: audio, headers: { "Content-Type": "application/octet-stream" } }).catch(() => null);
  if (!put || !put.ok) throw new TranscribeError("upload_failed", "The recording could not be sent for transcription.");

  let job: Job;
  try { job = await api<Job>("POST", "/jobs", { type: "transcribe", entryId, source }); }
  catch (e) { throw new TranscribeError("queue_failed", e instanceof ApiError && e.status === 429 ? "Several transcriptions are already running. Try again shortly." : "The transcription could not be started."); }

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
