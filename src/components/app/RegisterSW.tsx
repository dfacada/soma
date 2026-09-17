"use client";

import { useEffect } from "react";

/** Registers public/sw.js in production builds only; `next dev` serves unhashed assets that must not be cached. */
export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
