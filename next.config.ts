import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Everything here is per-request (orders, payments, ciphertext); no prerendered data.
  serverExternalPackages: ["better-sqlite3"],
  output: "standalone",
  outputFileTracingExcludes: {
    "/*": ["./data/**/*", "./wallet/**/*", "./zingo-data/**/*", "./.env*", "./**/*.db", "./**/*.db-wal", "./**/*.db-shm"],
  },
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
