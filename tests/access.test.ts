import { test } from "node:test";
import assert from "node:assert/strict";
import { createSeed } from "../lib/seed";
import { canOpenView, hasWorkspace, inviteRoles } from "../lib/access";
import { migrateAccess } from "../lib/access-migration";
import { canReadFile } from "../lib/security";
import type { Database } from "../lib/types";

test("legacy users and invitations keep spaces; only the configured legacy teacher becomes administrator", () => {
  const db = createSeed();
  db.users = db.users.filter(
    (user) => user.role === "teacher" || user.role === "student",
  );
  const password = db.users[0].passwordHash;
  const legacy = JSON.parse(JSON.stringify(db)) as Database;
  for (const user of legacy.users) Reflect.deleteProperty(user, "workspaceIds");
  legacy.invites.push({
    id: "old",
    tokenHash: "hashed",
    email: "",
    expiresAt: "2030-01-01",
  } as Database["invites"][number]);
  legacy.sessions.push({
    id: "session",
    userId: "teacher",
    expiresAt: "2030-01-01",
  });
  assert.equal(migrateAccess(legacy, " TEACHER@META-EDUCATION.DEMO "), true);
  assert.equal(legacy.users[0].role, "admin");
  assert.equal(legacy.users[0].passwordHash, password);
  assert.equal(legacy.sessions[0].userId, legacy.users[0].id);
  assert.equal(legacy.users.filter((user) => user.role === "admin").length, 1);
  assert.deepEqual(legacy.users[1].workspaceIds, ["math", "design"]);
  assert.equal(legacy.invites[0].role, "student");
  assert.deepEqual(legacy.invites[0].workspaceIds, ["math", "design"]);
  legacy.users[1].workspaceIds = [];
  legacy.users[0].email = "renamed@example.test";
  assert.equal(migrateAccess(legacy, "teacher@meta-education.demo"), false);
  assert.deepEqual(legacy.users[1].workspaceIds, []);
  assert.equal(legacy.users[0].role, "admin");
  assert.deepEqual(legacy.assignments, db.assignments);
  assert.deepEqual(legacy.submissions, db.submissions);
});

test("new accounts matching ADMIN_EMAIL cannot promote themselves through migration", () => {
  const db = createSeed();
  db.users = db.users.filter((user) => user.role !== "admin");
  assert.equal(migrateAccess(db, "teacher@meta-education.demo"), false);
  assert.equal(db.users[0].role, "teacher");
  const student = db.users[1];
  Reflect.deleteProperty(student, "workspaceIds");
  migrateAccess(db, student.email);
  assert.equal(student.role, "student");
});

test("navigation and downloads honor each role and explicit space revocation", () => {
  const db = createSeed();
  const teacher = db.users[0],
    student = db.users[1];
  const manager = db.users.find((user) => user.role === "manager")!;
  const admin = db.users.find((user) => user.role === "admin")!;
  assert.deepEqual(inviteRoles(teacher.role), []);
  assert.deepEqual(inviteRoles(student.role), []);
  assert.deepEqual(inviteRoles(manager.role), ["student", "teacher"]);
  assert.deepEqual(inviteRoles(admin.role), ["student", "teacher", "manager"]);
  assert.equal(canOpenView(manager, "review", "math"), false);
  assert.equal(canOpenView(manager, "access", "math"), true);
  assert.equal(canOpenView(teacher, "access", "math"), false);
  assert.equal(canOpenView(admin, "review", "math"), true);
  assert.equal(canOpenView(admin, "workbook", "design"), false);
  assert.equal(canOpenView(student, "workbook", "design"), true);
  student.workspaceIds = [];
  assert.equal(canOpenView(student, "settings", "math"), true);
  assert.equal(canOpenView(student, "workbook", "design"), false);
  assert.equal(hasWorkspace(student, "math"), false);
  db.files.push({
    id: "private",
    ownerId: student.id,
    name: "solution.pdf",
    mime: "application/pdf",
    size: 20,
    key: "key",
    kind: "submission",
    storage: "local",
  });
  assert.equal(canReadFile(db, student, "private"), false);
  assert.equal(canReadFile(db, manager, "private"), false);
  assert.equal(canReadFile(db, admin, "private"), true);
  teacher.workspaceIds = ["design"];
  assert.equal(canReadFile(db, teacher, "private"), false);
  assert.equal(canOpenView(teacher, "review", "math"), false);
  assert.equal(canOpenView(teacher, "overview", "design"), true);
  student.workspaceIds = ["math"];
  assert.equal(canReadFile(db, student, "private"), true);
});
