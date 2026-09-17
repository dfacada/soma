// The evening nudge, browser side: asking permission, subscribing this device, keeping the server's copy current.
// The setting (on, and the time) belongs to the account; a subscription belongs to one device, so each phone or
// computer switches itself on. Sending is the server's job (catalyst/functions/soma_jobs/nudge.js).

import { api } from "./api";

export type PushState =
  | "unsupported"   // this browser has no Web Push at all
  | "needs-install" // iPhone or iPad in a browser tab: Web Push only exists for the Home Screen app
  | "blocked"       // permission was denied; only the device's own settings can undo that
  | "off"           // supported, not subscribed on this device
  | "on";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  // The worker is only registered in production builds; `next dev` has none, and then there is nothing to wait for.
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? navigator.serviceWorker.ready : null;
}

export async function pushState(): Promise<PushState> {
  if (isIOS() && !isStandalone()) return "needs-install";
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return "unsupported";
  if (Notification.permission === "denied") return "blocked";
  const reg = await registration();
  if (!reg) return "unsupported";
  return (await reg.pushManager.getSubscription()) && Notification.permission === "granted" ? "on" : "off";
}

const keyBytes = (b64url: string) => Uint8Array.from(atob(b64url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(b64url.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

function send(sub: PushSubscription) {
  const json = sub.toJSON();
  return api("PUT", "/push/subscription", { endpoint: json.endpoint, keys: json.keys, tz: timeZone() });
}

/** Must be called from a tap: iOS only shows the permission prompt in response to one. */
export async function enablePush(): Promise<PushState> {
  const before = await pushState();
  if (before !== "off" && before !== "on") return before;
  if ((await Notification.requestPermission()) !== "granted") return Notification.permission === "denied" ? "blocked" : "off";
  const reg = await registration();
  if (!reg) return "unsupported";
  const { publicKey } = await api<{ publicKey: string | null }>("GET", "/push");
  if (!publicKey) throw new Error("Notifications are not set up on the server yet");
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
  await send(sub);
  return "on";
}

export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (!sub) return;
  await api("DELETE", "/push/subscription", { endpoint: sub.endpoint }).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/** On app open: browsers rotate subscriptions and people travel, so re-send this device's endpoint and time zone. */
export async function refreshPush(): Promise<void> {
  if ((await pushState()) !== "on") return;
  const reg = await registration();
  const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) await send(sub);
}

export const sendTest = () => api("POST", "/push/test");
