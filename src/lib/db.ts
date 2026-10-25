import { MongoClient, type Db } from "mongodb";
import { ensureIndexes } from "./collections";
import { seedIfEmpty } from "./seed";

const DB_NAME = "brightline";

// The connection promise is cached on globalThis because Next's dev server
// re-evaluates modules on every hot reload but keeps globalThis. Without this,
// each edit would open a new client (and start another in-memory server).
const cache = globalThis as typeof globalThis & { __brightlineDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  cache.__brightlineDb ??= connect().catch((err) => {
    // Don't keep a failed attempt around; the next call retries.
    cache.__brightlineDb = undefined;
    throw err;
  });
  return cache.__brightlineDb;
}

async function connect(): Promise<Db> {
  const client = await new MongoClient(await resolveUri()).connect();
  const db = client.db(DB_NAME);
  await ensureIndexes(db);
  await seedIfEmpty(db);
  return db;
}

async function resolveUri(): Promise<string> {
  const configured = process.env.MONGODB_URI?.trim();
  if (configured) {
    // Never log the URI itself; it can contain credentials.
    console.log("[db] Connecting to MongoDB from MONGODB_URI");
    return configured;
  }
  return startInMemoryServer();
}

async function startInMemoryServer(): Promise<string> {
  // Imported lazily so a deployment with a real MONGODB_URI never loads it.
  const { DryMongoBinary, MongoMemoryServer } = await import("mongodb-memory-server");
  console.log("[db] MONGODB_URI not set; starting an in-memory MongoDB. Data resets when the dev server stops.");

  // The binary is cached per user (~/.cache/mongodb-binaries), so this only happens once per machine.
  const cachedBinary = await DryMongoBinary.locateBinary(await DryMongoBinary.generateOptions());
  if (!cachedBinary) {
    console.log(
      "[db] Downloading MongoDB binary, up to ~800 MB, first run only. This takes about a minute. " +
        "Set MONGODB_URI in .env.local to skip it.",
    );
  }
  const server = await MongoMemoryServer.create();
  console.log("[db] In-memory MongoDB is ready.");
  return server.getUri();
}
