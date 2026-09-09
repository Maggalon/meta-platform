import { test } from "node:test";
import assert from "node:assert/strict";
import {
  hashPassword,
  verifyPassword,
  canReadFile,
  validateFile,
  tokenHash,
} from "../lib/security";
import { createSeed } from "../lib/seed";

test("passwords are salted, verified and never equal to plaintext", () => {
  const one = hashPassword("A-long-test-password"),
    two = hashPassword("A-long-test-password");
  assert.notEqual(one, two);
  assert.ok(verifyPassword("A-long-test-password", one));
  assert.equal(verifyPassword("wrong", one), false);
  assert.equal(verifyPassword("wrong", "invalid"), false);
});
test("a student cannot read another student's submission or review", () => {
  const db = createSeed(),
    owner = db.users[1],
    other = db.users[2],
    teacher = db.users[0];
  db.files.push({
    id: "private-scan",
    ownerId: owner.id,
    name: "scan.pdf",
    mime: "application/pdf",
    size: 30,
    key: "private",
    kind: "submission",
    storage: "local",
  });
  assert.ok(canReadFile(db, owner, "private-scan"));
  assert.ok(canReadFile(db, teacher, "private-scan"));
  assert.equal(canReadFile(db, other, "private-scan"), false);
  db.files.push({
    id: "review",
    ownerId: teacher.id,
    name: "review.pdf",
    mime: "application/pdf",
    size: 30,
    key: "review",
    kind: "review",
    storage: "local",
  });
  const s = db.submissions.find((s) => s.studentId === owner.id)!;
  s.reviewFileIds = ["review"];
  assert.equal(canReadFile(db, owner, "review"), false);
  s.status = "reviewed";
  assert.ok(canReadFile(db, owner, "review"));
  assert.equal(canReadFile(db, other, "review"), false);
});
test("assignment materials are visible only to assigned students and teachers", () => {
  const db = createSeed(),
    teacher = db.users[0],
    one = db.users[1],
    two = db.users[2];
  db.files.push({
    id: "material",
    ownerId: teacher.id,
    name: "task.pdf",
    mime: "application/pdf",
    size: 30,
    key: "material",
    kind: "material",
    storage: "local",
  });
  db.assignments[0].studentIds = [one.id];
  db.assignments[0].fileIds = ["material"];
  assert.ok(canReadFile(db, one, "material"));
  assert.equal(canReadFile(db, two, "material"), false);
  assert.equal(canReadFile(db, one, "unknown"), false);
});
test("file types, signatures, empty and oversized payloads are validated", () => {
  const pdf = Buffer.from("%PDF-1.4\nlocal test");
  assert.ok(validateFile(pdf, "application/pdf", pdf.length));
  assert.equal(
    validateFile(Buffer.from("<script>"), "application/pdf", 8),
    false,
  );
  assert.equal(validateFile(pdf, "text/html", pdf.length), false);
  assert.equal(validateFile(Buffer.alloc(0), "image/png", 0), false);
  assert.equal(validateFile(pdf, "application/pdf", 21 * 1024 * 1024), false);
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  assert.ok(validateFile(png, "image/png", png.length));
});
test("session token hashes are deterministic and cannot be mistaken for raw tokens", () => {
  assert.equal(tokenHash("session"), tokenHash("session"));
  assert.equal(tokenHash("session").length, 64);
  assert.notEqual(tokenHash("session"), "session");
});
