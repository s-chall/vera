import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // Lead images are referenced from the outlet that published them rather
    // than copied into this repository.
    remotePatterns: [{ protocol: "https", hostname: "elpitazo.net" }],
  },
  agentRules: false,
  experimental: {
    optimizePackageImports: ["lucide-react"],
  },
};

export default nextConfig;
