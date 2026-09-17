// Catalyst Web SDK access. The SDK only exists where Catalyst serves /__catalyst/sdk/init.js (Slate),
// so under `next dev` there is no session: requests run as the synthetic test member instead (see api.ts).
//
// Two SDK traps found in the spike (catalyst/SPIKE.md): isUserAuthenticated() rejects a plain 401 with the
// text "Some network issue occured!", and generateAuthToken() never settles without a session. So: any
// rejection means signed out, and the token call is only made after a session check and is raced against a timeout.

const SDK_URL = "https://static.zohocdn.com/catalyst/sdk/js/4.6.1/catalystWebSDK.js";
const INIT_URL = "/__catalyst/sdk/init.js";
const TOKEN_TTL_MS = 10 * 60 * 1000;

type CatalystUser = { user_id: string; email_id: string; first_name?: string; last_name?: string };
type CatalystAuth = {
  isUserAuthenticated(): Promise<{ content: CatalystUser }>;
  generateAuthToken(): Promise<{ access_token: string }>;
  signIn(elementId: string, config: { redirect_url: string }): void;
  signUp(details: { first_name: string; last_name: string; email_id: string; platform_type: "web"; redirect_url: string }): Promise<{ status: number; message?: string }>;
  signOut(redirectUrl: string): void;
};
declare global {
  interface Window { catalyst?: { auth: CatalystAuth } }
}

export const DEV_TEST_KEY = process.env.NEXT_PUBLIC_DEV_TEST_KEY || "";
export const isDevIdentity = DEV_TEST_KEY.length > 0;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const el = document.createElement("script");
    el.src = src;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("could not load " + src));
    document.head.appendChild(el);
  });
}

let sdk: Promise<CatalystAuth> | null = null;
/** Loads the CDN bundle, then the project init script. Order matters: init.js throws without the bundle. */
export function catalystAuth(): Promise<CatalystAuth> {
  if (!sdk) {
    sdk = (async () => {
      if (!window.catalyst) {
        await loadScript(SDK_URL);
        await loadScript(INIT_URL);
      }
      if (!window.catalyst) throw new Error("Catalyst SDK did not initialise");
      return window.catalyst.auth;
    })();
    sdk.catch(() => { sdk = null; });
  }
  return sdk;
}

/** The signed-in Catalyst user, or null. Never throws for "not signed in". */
export async function currentUser(): Promise<CatalystUser | null> {
  const auth = await catalystAuth();
  try {
    return (await auth.isUserAuthenticated()).content;
  } catch {
    return null;
  }
}

let cached: { token: string; at: number } | null = null;
export function forgetToken() { cached = null; }

/** Raw access token for the Authorization header (no "Bearer" prefix: the gateway rejects it). */
export async function authToken(): Promise<string> {
  if (cached && Date.now() - cached.at < TOKEN_TTL_MS) return cached.token;
  const auth = await catalystAuth();
  const result = await Promise.race([
    auth.generateAuthToken(),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("token request timed out")), 10000)),
  ]);
  cached = { token: result.access_token, at: Date.now() };
  return cached.token;
}
