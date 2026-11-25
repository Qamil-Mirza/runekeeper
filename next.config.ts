import type { NextConfig } from "next";
import { securityHeaders } from "./src/lib/security-headers";

const isDev = process.env.NODE_ENV !== "production";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["pino", "pino-pretty"],
  async headers() {
    return securityHeaders(isDev);
  },
};

export default nextConfig;
