// Next.js calls register() once when the server starts.
export async function register() {
  // MongoDB is only used from the Node.js runtime. `next build` also loads this
  // file, and a build shouldn't start (or download) a database.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;

  const { getDb } = await import("./src/lib/db");
  // Connect at boot instead of on the first request. Without MONGODB_URI this
  // starts the in-memory MongoDB, downloading its binary on the first run.
  // Deliberately not awaited: Next holds every request until register()
  // returns, and pages should load meanwhile. API calls share the same pending
  // connection promise, so they just wait for it.
  getDb().catch((err) => console.error("[db] Database startup failed:", err));
}
