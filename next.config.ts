import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build autonome pour l'image Docker (server.js + dépendances minimales).
  output: "standalone",
};

export default nextConfig;
