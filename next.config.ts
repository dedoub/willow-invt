import type { NextConfig } from "next";

/** @see https://nextjs.org/docs/app/api-reference/config/next-config-js */
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
};

export default nextConfig;
