import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything here is per-request (orders, payments, ciphertext); no prerendered data.
  serverExternalPackages: ["better-sqlite3"],
  output: "standalone",
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
