import { readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";
import {
  S3Client,
  CreateBucketCommand,
  HeadBucketCommand,
} from "@aws-sdk/client-s3";
import { withDb, TABLE_PREFIX } from "../lib/db";
import type { Database } from "../lib/types";

async function setup() {
  if (process.env.DEMO_MODE !== "true")
    throw new Error("Local setup requires DEMO_MODE=true");
  const databaseUrl = new URL(process.env.DATABASE_URL || "");
  const endpoint = new URL(process.env.S3_ENDPOINT || "");
  if (
    !["localhost", "127.0.0.1"].includes(databaseUrl.hostname) ||
    !["localhost", "127.0.0.1"].includes(endpoint.hostname)
  )
    throw new Error("Local setup accepts only localhost services");
  const pool = new Pool({ connectionString: databaseUrl.toString() });
  try {
    const existing = await pool.query("SELECT to_regclass($1) AS table_name", [
      `public.${TABLE_PREFIX}users`,
    ]);
    const isEmpty = !existing.rows[0].table_name;
    let prior: Database | undefined;
    const importDemo = process.argv.includes("--import-demo");
    if (isEmpty || importDemo) {
      try {
        prior = JSON.parse(
          await readFile(
            path.join(process.cwd(), ".data", "database.json"),
            "utf8",
          ),
        );
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    await withDb((db) => {
      if (isEmpty && prior) {
        if (prior.files.some((f) => f.storage === "local"))
          throw new Error(
            "Local files need to be migrated before importing their records",
          );
        Object.assign(db, prior);
      } else if (importDemo && prior) {
        const demoEmails = [
          "teacher@meta-education.demo",
          "teacher@tochka.demo",
        ];
        if (
          !demoEmails.includes(
            db.users.find((u) => u.id === "teacher")?.email || "",
          ) ||
          !demoEmails.includes(
            prior.users.find((u) => u.id === "teacher")?.email || "",
          )
        )
          throw new Error("Only the local demonstration can be imported");
        if (prior.files.some((f) => f.storage === "local"))
          throw new Error(
            "Local files need to be migrated before importing their records",
          );
        for (const key of Object.keys(prior) as (keyof Database)[]) {
          const target = db[key] as { id: string }[];
          for (const row of prior[key])
            if (!target.some((existing) => existing.id === row.id))
              target.push(row);
        }
      }
      console.log(
        `Postgres ready: ${db.users.length} users, ${db.assignments.length} assignments.`,
      );
    });
    const s3 = new S3Client({
      endpoint: endpoint.toString(),
      region: process.env.S3_REGION || "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error("S3_BUCKET is required");
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (error) {
      if (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode !== 404
      )
        throw error;
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    s3.destroy();
    console.log("Private local S3 bucket ready.");
  } finally {
    await pool.end();
  }
}
setup()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
