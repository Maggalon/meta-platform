import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isDemo, dataDirectory } from "./db";
import type { Attachment } from "./types";

function s3() {
  if (
    !process.env.S3_BUCKET ||
    !process.env.S3_ACCESS_KEY_ID ||
    !process.env.S3_SECRET_ACCESS_KEY
  )
    throw new Error("S3 storage is not configured");
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION || "ru-central1",
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
}
export async function storeFile(
  key: string,
  bytes: Buffer,
  mime: string,
): Promise<"local" | "s3"> {
  if (process.env.S3_BUCKET) {
    await s3().send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: mime,
      }),
    );
    return "s3";
  }
  if (!isDemo())
    throw new Error("Настройте закрытое S3-хранилище для загрузки файлов");
  const dir = path.join(dataDirectory(), "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, key), bytes);
  return "local";
}
export async function downloadFile(file: Attachment) {
  const disposition = `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`;
  if (file.storage === "s3") {
    const url = await getSignedUrl(
      s3(),
      new GetObjectCommand({
        Bucket: process.env.S3_BUCKET,
        Key: file.key,
        ResponseContentType: file.mime,
        ResponseContentDisposition: disposition,
      }),
      { expiresIn: 60 },
    );
    return new Response(null, {
      status: 307,
      headers: { Location: url, "Cache-Control": "private, no-store" },
    });
  }
  const bytes = await readFile(path.join(dataDirectory(), "uploads", file.key));
  return new Response(bytes, {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": disposition,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "sandbox",
    },
  });
}
