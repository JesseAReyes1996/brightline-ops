import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // mongodb-memory-server spawns a mongod child process and locates its binary
  // at runtime, so it must be loaded from node_modules rather than bundled.
  // (The `mongodb` driver is already on Next's built-in external list.)
  serverExternalPackages: ["mongodb-memory-server", "mongodb-memory-server-core"],
};

export default nextConfig;
