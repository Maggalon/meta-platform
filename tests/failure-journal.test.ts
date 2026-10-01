import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyFailureEntry,
  failureEntrySchema,
  failureStepError,
  sortFailureEntries,
  type FailureEntry,
} from "../lib/failure-journal";

test("failure journal requires an intentional category and complete event context", () => {
  const draft = emptyFailureEntry();
  assert.equal(draft.category, null);
  assert.ok(failureStepError(draft, 0));
  Object.assign(draft, {
    event: "Выступление",
    expected: "Объяснить идею",
    actual: "Не уложился во время",
  });
  assert.equal(failureStepError(draft, 0), "");
  assert.ok(failureStepError(draft, 1));
  draft.category = "slip";
  assert.equal(failureStepError(draft, 1), "");
  assert.ok(failureStepError(draft, 2));
  draft.responses.slip = "Репетиция с таймером";
  assert.equal(failureStepError(draft, 2), "");
  assert.ok(failureStepError(draft, 3));
});

test("reclassification requires the new answer and preserves earlier answers; next step is optional", () => {
  const draft = {
    ...emptyFailureEntry(),
    date: "2026-09-24",
    event: "Выступление",
    expected: "Объяснить идею",
    actual: "Не хватило времени",
    category: "slip" as const,
    conclusion: " Нужен запас времени ",
    responses: { slip: "Репетиция", difficulty: "", growth: "" },
  };
  assert.equal(
    failureEntrySchema.parse(draft).conclusion,
    "Нужен запас времени",
  );
  assert.equal(
    failureEntrySchema.safeParse({ ...draft, category: "growth" }).success,
    false,
  );
  const changed = failureEntrySchema.parse({
    ...draft,
    category: "growth",
    responses: { ...draft.responses, growth: "Проверить длину вступления" },
  });
  assert.equal(changed.responses.slip, "Репетиция");
  assert.equal(changed.nextStep, "");
  assert.equal(
    failureEntrySchema.safeParse({ ...draft, date: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    failureEntrySchema.safeParse({ ...draft, conclusion: "  " }).success,
    false,
  );
  assert.equal(
    failureEntrySchema.safeParse({ ...draft, event: "я".repeat(4001) }).success,
    false,
  );
});

test("journal history sorts by event date without mutating its input", () => {
  const record = {
    ...emptyFailureEntry(),
    category: "slip",
    id: "one",
    studentId: "student",
    revision: 1,
    date: "2026-09-20",
    createdAt: "2026-09-24T00:00:00Z",
    savedAt: "2026-09-24T00:00:00Z",
  } as FailureEntry;
  const input = [
    record,
    { ...record, id: "two", date: "2026-09-24" },
    { ...record, id: "three", createdAt: "2026-09-24T01:00:00Z" },
  ];
  assert.deepEqual(
    sortFailureEntries(input).map((item) => item.id),
    ["two", "three", "one"],
  );
  assert.equal(input[0].id, "one");
});
