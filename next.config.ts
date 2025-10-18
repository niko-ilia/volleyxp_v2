import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // In dev, proxy API to local backend; in prod, optionally proxy to external backend
    const isDev = process.env.NODE_ENV !== "production";
    if (isDev) {
      return [
        {
          source: "/api/:path*",
          destination: "http://localhost:3000/api/:path*",
        },
      ];
    }

    // If NEXT_PUBLIC_API_BASE is set (e.g., https://backend.example.com),
    // proxy all /api/* requests in production to that backend. This allows
    // OAuth callbacks like /api/auth/google/callback to resolve on the same
    // origin (volleyxp.com) while being handled by Express.
    const apiBase = process.env.NEXT_PUBLIC_API_BASE;
    if (apiBase) {
      return [
        {
          source: "/api/:path*",
          destination: `${apiBase}/api/:path*`,
        },
      ];
    }

    return [];
  },
};

export default nextConfig;
