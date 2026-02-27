import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["sqlite-vec", "better-sqlite3"],
};

export default nextConfig;
