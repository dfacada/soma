import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Soma deploys to Zoho Catalyst Slate as static files. No Node server at runtime;
  // all data access goes through the Catalyst Advanced I/O function in catalyst/.
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
