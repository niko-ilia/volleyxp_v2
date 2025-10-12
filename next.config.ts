import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    // In dev, proxy API to backend server
    const isDev = process.env.NODE_ENV !== "production";
    if (!isDev) return [];
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3000/api/:path*",
      },
    ];
  },
};

export default nextConfig;
