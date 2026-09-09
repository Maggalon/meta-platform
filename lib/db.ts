import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import { createSeed, emptyDatabase } from "./seed";
import { hashPassword } from "./security";
import type { Database } from "./types";

export const isDemo = () =>
  process.env.DEMO_MODE === "true" ||
  (process.env.NODE_ENV !== "production" &&
    process.env.DEMO_MODE !== "false" &&
    !process.env.DATABASE_URL);
const tables: (keyof Database)[] = [
  "users",
  "groups",
  "assignments",
  "submissions",
  "files",
  "lessons",
  "invites",
  "sessions",
  "loginAttempts",
];
// Persisted SQL names are retained so a branding change cannot create an empty database.
export const TABLE_PREFIX = "tochka_";
const globals = globalThis as unknown as {
  metaEducationPool?: Pool;
  metaEducationQueue?: Promise<unknown>;
};
// Runtime data must never be included in the standalone application bundle.
export const dataDirectory = () =>
  path.resolve(
    /* turbopackIgnore: true */ process.cwd(),
    process.env.META_EDUCATION_DATA_DIR ||
      process.env.TOCHKA_DATA_DIR ||
      ".data",
  );
const dataPath = path.join(dataDirectory(), "database.json");

function initialDatabase() {
  if (isDemo()) return createSeed();
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL is required with DEMO_MODE=false");
  const db = emptyDatabase();
  const { ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 12)
    throw new Error(
      "Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters) to initialize the database",
    );
  db.users.push({
    id: "teacher",
    name: ADMIN_NAME || "Преподаватель",
    email: ADMIN_EMAIL.toLowerCase(),
    passwordHash: hashPassword(ADMIN_PASSWORD),
    role: "teacher",
    color: "green",
    createdAt: new Date().toISOString(),
  });
  return db;
}

// One transaction spans validation and the write, preventing duplicate submissions,
// double-use invitations, and lost updates. The local queue is development-only.
export async function withDb<T>(
  operation: (db: Database) => T | Promise<T>,
  write = true,
): Promise<T> {
  if (process.env.DATABASE_URL) {
    const pool = (globals.metaEducationPool ??= new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
    }));
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(84720119)");
      for (const table of tables)
        await client.query(
          `CREATE TABLE IF NOT EXISTS "${TABLE_PREFIX}${table}" (id TEXT PRIMARY KEY, data JSONB NOT NULL)`,
        );
      const db = emptyDatabase();
      for (const table of tables) {
        const result = await client.query(
          `SELECT data FROM "${TABLE_PREFIX}${table}" ORDER BY id`,
        );
        (db[table] as unknown[]) = result.rows.map((r) => r.data);
      }
      const initialize = db.users.length === 0;
      const active = initialize ? initialDatabase() : db;
      const result = await operation(active);
      if (write || initialize) {
        for (const table of tables) {
          const rows = active[table];
          await client.query(
            `DELETE FROM "${TABLE_PREFIX}${table}" WHERE NOT (id = ANY($1::text[]))`,
            [rows.map((r) => r.id)],
          );
          for (const row of rows)
            await client.query(
              `INSERT INTO "${TABLE_PREFIX}${table}" (id, data) VALUES ($1, $2::jsonb) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
              [row.id, JSON.stringify(row)],
            );
        }
      }
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  if (!isDemo())
    throw new Error("Configure DATABASE_URL before running in production");
  const previous = globals.metaEducationQueue ?? Promise.resolve();
  const current = previous
    .catch(() => {})
    .then(async () => {
      let db: Database;
      let initialize = false;
      try {
        db = JSON.parse(await readFile(dataPath, "utf8"));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        db = initialDatabase();
        initialize = true;
      }
      const result = await operation(db);
      if (write || initialize) {
        await mkdir(path.dirname(dataPath), { recursive: true });
        const temporary = `${dataPath}.${process.pid}.tmp`;
        await writeFile(temporary, JSON.stringify(db, null, 2));
        await rename(temporary, dataPath);
      }
      return result;
    });
  globals.metaEducationQueue = current;
  return current;
}
