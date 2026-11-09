import type { NextConfig } from "next";

// The build's name, the UTC month-day.hourminute it was made ("11-08.2342"), or "dev" under next dev. The app sends it
// with its log lines and with /me, so Soma Ops can say which build someone runs and which build a problem came with.
const BUILD = process.env.NODE_ENV === "production" ? new Date().toISOString().slice(5, 16).replace("T", ".").replace(":", "") : "dev";

const nextConfig: NextConfig = {
  // Soma deploys to Zoho Catalyst Slate as static files. No Node server at runtime;
  // all data access goes through the Catalyst Advanced I/O function in catalyst/.
  output: "export",
  env: { NEXT_PUBLIC_BUILD: BUILD },
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
