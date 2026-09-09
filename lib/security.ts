import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import type { Database, User } from "./types";

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, hash: string): boolean {
  const [salt, digest] = hash.split(":");
  if (!salt || !digest) return false;
  const expected = Buffer.from(digest, "hex");
  const actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export const safeUser = ({ passwordHash: _, ...user }: User) => user;
export function canReadFile(db: Database, user: User, fileId: string): boolean {
  const file = db.files.find((f) => f.id === fileId);
  if (!file) return false;
  if (user.role === "teacher" || file.ownerId === user.id) return true;
  return (
    db.assignments.some(
      (a) => a.studentIds.includes(user.id) && a.fileIds.includes(fileId),
    ) ||
    db.submissions.some(
      (s) =>
        s.studentId === user.id &&
        (s.fileIds.includes(fileId) ||
          (s.status === "reviewed" && s.reviewFileIds.includes(fileId))),
    )
  );
}
export function validateFile(
  bytes: Uint8Array,
  mime: string,
  size: number,
): boolean {
  if (size === 0 || size > 20 * 1024 * 1024 || bytes.length !== size)
    return false;
  if (mime === "application/pdf")
    return Buffer.from(bytes.subarray(0, 5)).toString() === "%PDF-";
  if (mime === "image/jpeg")
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png")
    return Buffer.from(bytes.subarray(0, 8)).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
  return false;
}
