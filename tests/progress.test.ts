import { test } from "node:test";
import assert from "node:assert/strict";
import { studentProgress } from "../lib/progress";
import type { Assignment, Submission } from "../lib/types";

const assignment = (
  id: string,
  studentIds = ["alice"],
  extra: Partial<Assignment> = {},
): Assignment => ({
  id,
  studentIds,
  title: id,
  description: "",
  subject: "Математика",
  deadline: "2026-09-20T10:00:00Z",
  createdAt: "2026-09-01T10:00:00Z",
  maxScore: 10,
  questions: 1,
  archived: false,
  fileIds: [],
  ...extra,
});
const submission = (
  assignmentId: string,
  score?: number,
  studentId = "alice",
): Submission => ({
  id: `${assignmentId}-${studentId}`,
  assignmentId,
  studentId,
  answers: "Ответ",
  submittedAt: "2026-09-10T10:00:00Z",
  status: score === undefined ? "pending" : "reviewed",
  score,
  fileIds: [],
  reviewFileIds: [],
});
const now = Date.parse("2026-09-17T10:00:00Z");

test("individual progress uses only assigned work and the selected student's submissions", () => {
  const result = studentProgress(
    [
      assignment("shared", ["alice", "bob"]),
      assignment("personal"),
      assignment("other", ["bob"]),
    ],
    [
      submission("shared", 0),
      submission("shared", 10, "bob"),
      submission("other", 10),
    ],
    "alice",
    false,
    now,
  );
  assert.equal(result.total, 2);
  assert.equal(result.submitted, 1);
  assert.equal(result.average, 0);
  assert.equal(result.completion, 50);
  assert.deepEqual(
    result.rows.map((r) => r.assignment.id),
    ["shared", "personal"],
  );
});

test("average normalizes different maximum scores and excludes pending and unsubmitted work", () => {
  const result = studentProgress(
    [
      assignment("one"),
      assignment("two", ["alice"], { maxScore: 40 }),
      assignment("pending"),
      assignment("new"),
    ],
    [submission("one", 5), submission("two", 40), submission("pending")],
    "alice",
    false,
    now,
  );
  assert.equal(result.average, 75);
  assert.equal(result.pending, 1);
  assert.equal(result.reviewed, 2);
  assert.equal(result.completion, 75);
});

test("overdue means an active unsubmitted assignment; archive is optional", () => {
  const old = { deadline: "2026-09-01T10:00:00Z" };
  const assignments = [
    assignment("late", ["alice"], old),
    assignment("pending", ["alice"], old),
    assignment("archive", ["alice"], { ...old, archived: true }),
  ];
  const submissions = [submission("pending")];
  assert.equal(
    studentProgress(assignments, submissions, "alice", false, now).total,
    2,
  );
  const result = studentProgress(assignments, submissions, "alice", true, now);
  assert.equal(result.total, 3);
  assert.equal(result.overdue, 1);
  assert.deepEqual(
    result.rows.map((r) => r.status),
    ["overdue", "pending", "archived"],
  );
});

test("archived grades count only when archive is included; no grades is not zero percent", () => {
  const assignments = [assignment("archive", ["alice"], { archived: true })];
  const submissions = [submission("archive", 8)];
  const empty = studentProgress(assignments, submissions, "alice", false, now);
  assert.equal(empty.total, 0);
  assert.equal(empty.average, null);
  assert.equal(empty.completion, 0);
  assert.equal(
    studentProgress(assignments, submissions, "alice", true, now).average,
    80,
  );
  assert.equal(
    studentProgress(assignments, submissions, "bob", true, now).total,
    0,
  );
});
