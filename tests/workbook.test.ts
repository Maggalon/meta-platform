import { test } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument } from "pdf-lib";
import {
  emptyWorkbookDraft,
  sphereComplete,
  workbookDate,
  workbookSchema,
  type WorkbookResult,
} from "../lib/workbook";
import { createWorkbookPdf } from "../lib/workbook-pdf";

const input = {
  answers: {
    health: { score: 0, explanation: " Хочу больше отдыхать. " },
    work: { score: 25, explanation: "Учёба занимает много времени." },
    hobbies: { score: 75, explanation: "Рисование приносит радость." },
    love: { score: 100, explanation: "Чувствую поддержку близких." },
  },
  priority: "health",
  timeZone: "Asia/Vladivostok",
};

test("unanswered scales differ from an explicit zero, and explanations are required", () => {
  const draft = emptyWorkbookDraft();
  assert.equal(sphereComplete(draft.health), false);
  assert.equal(sphereComplete({ score: 0, explanation: "Причина" }), true);
  assert.equal(sphereComplete({ score: 50, explanation: "   " }), false);
  const parsed = workbookSchema.parse(input);
  assert.equal(parsed.answers.health.score, 0);
  assert.equal(parsed.answers.health.explanation, "Хочу больше отдыхать.");
});

test("workbook rejects missing scales, invalid scores, empty explanations and invalid priorities", () => {
  for (const score of [null, -1, 101, 25.5, "50"]) {
    assert.equal(
      workbookSchema.safeParse({
        ...input,
        answers: {
          ...input.answers,
          health: { ...input.answers.health, score },
        },
      }).success,
      false,
    );
  }
  for (const explanation of ["", "   ", "a".repeat(601)]) {
    assert.equal(
      workbookSchema.safeParse({
        ...input,
        answers: { ...input.answers, work: { score: 50, explanation } },
      }).success,
      false,
    );
  }
  assert.equal(
    workbookSchema.safeParse({
      ...input,
      answers: { health: input.answers.health },
    }).success,
    false,
  );
  assert.equal(
    workbookSchema.safeParse({ ...input, priority: "" }).success,
    false,
  );
  assert.equal(
    workbookSchema.safeParse({ ...input, priority: ["health", "work"] })
      .success,
    false,
  );
  assert.equal(
    workbookSchema.safeParse({ ...input, timeZone: "invalid" }).success,
    false,
  );
});

test("completion date retains the learner's timezone even after the export date changes", () => {
  assert.equal(
    workbookDate({
      savedAt: "2026-09-20T18:00:00Z",
      timeZone: "Asia/Vladivostok",
    }),
    "21.09.2026",
  );
});

test("PDF embeds Cyrillic text and paginates maximum length explanations", async () => {
  const result: WorkbookResult = {
    ...workbookSchema.parse(input),
    id: "workbook-1:test",
    studentId: "test",
    savedAt: "2026-09-20T18:00:00Z",
  };
  const short = await PDFDocument.load(await createWorkbookPdf(result));
  assert.equal(short.getPageCount(), 1);
  assert.match(short.getTitle()!, /Где я сейчас/);
  for (const answer of Object.values(result.answers))
    answer.explanation = "Длинноесловобезпробелов".repeat(28).slice(0, 600);
  const long = await PDFDocument.load(await createWorkbookPdf(result));
  assert.ok(long.getPageCount() > 1);
  assert.ok(
    long.getPages().every((page) => page.getHeight() > page.getWidth()),
  );
});
