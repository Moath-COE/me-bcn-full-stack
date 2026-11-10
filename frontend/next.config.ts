import type { NextConfig } from "next";

const backendUrl = process.env.BACKEND_URL?.trim().replace(/\/+$/, "");

if (process.env.NODE_ENV === "production" && !backendUrl) {
  throw new Error("BACKEND_URL is required in production");
}

const backend = backendUrl || "http://localhost:3000";

/* The browser only ever talks to this app. Auth and API requests are proxied to the Express
   backend, so the session cookie is first-party and no CORS preflight is involved. */
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/auth/:path*", destination: `${backend}/api/auth/:path*` },
      { source: "/api/v1/:path*", destination: `${backend}/api/v1/:path*` },
    ];
  },
};

export default nextConfig;
