import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countWords,
  compassSchema,
  compassAnalysisSchema,
  compassComplete,
  emptyCompass,
  reserveAiRequest,
} from "../lib/compass";
import { analyzeCompass, DeepSeekError } from "../lib/deepseek";
import { createCompassPdf } from "../lib/compass-pdf";
import { PDFDocument } from "pdf-lib";

const base = {
  ...emptyCompass(),
  timeZone: "Asia/Vladivostok",
  status: "draft" as const,
};
const suggestion = {
  complement: "В обоих текстах важна забота о людях.",
  conflict: "Работа занимает время, которое вы хотели бы уделять семье.",
  direction: "Ценности жизни помогают выбирать работу.",
};

test("compass PDF exports drafts and paginates long saved texts", async () => {
  const result = {
    ...base,
    work: "Работа даёт смысл.\n\nВторой абзац.",
    id: "test",
    studentId: "student-test",
    savedAt: "2026-09-20T18:00:00Z",
  };
  const draft = await PDFDocument.load(await createCompassPdf(result));
  assert.match(draft.getTitle()!, /Компас/);
  assert.equal(draft.getPageCount(), 1);
  assert.equal(
    draft.getCreationDate()?.toISOString(),
    result.savedAt.replace("Z", ".000Z"),
  );
  const long = await PDFDocument.load(
    await createCompassPdf({
      ...result,
      status: "completed",
      work: "Длинный текст о работе. ".repeat(500).slice(0, 12000),
      life: "Оченьдлинноесловобезпробелов".repeat(450).slice(0, 12000),
      alignment: suggestion,
    }),
  );
  assert.ok(long.getPageCount() > 2);
  assert.ok(long.getPages().every((page) => page.getSize().height === 841.89));
});

test("word count handles Cyrillic, whitespace, hyphenation and punctuation", () => {
  assert.equal(countWords("  \n\t "), 0);
  assert.equal(countWords("Работа — это рост. Жизнь: близкие, смысл!"), 6);
  assert.equal(countWords("кто-то\nпо-настоящему\tважен"), 3);
});

test("250 words is guidance; short and longer drafts can be saved", () => {
  assert.ok(compassSchema.safeParse({ ...base, work: "Смысл." }).success);
  assert.ok(
    compassSchema.safeParse({
      ...base,
      work: "слово ".repeat(500),
      life: "Мои ценности.",
    }).success,
  );
  assert.equal(compassSchema.safeParse(base).success, false);
  assert.equal(
    compassSchema.safeParse({ ...base, work: "a".repeat(12001) }).success,
    false,
  );
});

test("completion requires both spaces and all three alignment answers", () => {
  const draft = { ...emptyCompass(), work: "Работа", life: "Жизнь" };
  assert.equal(compassComplete(draft), false);
  assert.equal(
    compassSchema.safeParse({ ...base, ...draft, status: "completed" }).success,
    false,
  );
  assert.ok(
    compassSchema.safeParse({
      ...base,
      ...draft,
      alignment: suggestion,
      status: "completed",
    }).success,
  );
  assert.equal(
    compassAnalysisSchema.safeParse({ work: "  ", life: "Жизнь" }).success,
    false,
  );
});

test("AI quotas are per user, reject rapid repeats and expire after one hour", () => {
  const now = Date.now();
  const first = reserveAiRequest([], "one", now)!;
  assert.equal(reserveAiRequest(first, "one", now + 1000), null);
  assert.ok(reserveAiRequest(first, "two", now + 1000));
  const exhausted = [{ ...first[0], count: 20 }];
  assert.equal(reserveAiRequest(exhausted, "one", now + 11000), null);
  assert.equal(reserveAiRequest(exhausted, "one", now + 3600001)?.[0].count, 1);
});

test("DeepSeek receives only the two texts and returns validated suggestions", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, "https://api.deepseek.com/chat/completions");
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, "deepseek-flash");
    assert.deepEqual(request.thinking, { type: "disabled" });
    assert.deepEqual(request.response_format, { type: "json_object" });
    assert.deepEqual(JSON.parse(request.messages[1].content), {
      work: "Моя работа",
      life: "Моя жизнь",
    });
    assert.equal(request.messages.length, 2);
    assert.ok(init?.signal);
    return Response.json({
      choices: [
        {
          finish_reason: "stop",
          message: { content: JSON.stringify(suggestion) },
        },
      ],
    });
  };
  assert.deepEqual(
    await analyzeCompass("Моя работа", "Моя жизнь", {
      apiKey: "test-key",
      model: "deepseek-flash",
      fetcher,
    }),
    suggestion,
  );
  assert.equal(calls, 1);
});

test("DeepSeek missing key never makes a request; upstream errors are not exposed", async () => {
  const unreachable: typeof fetch = async () => {
    throw new Error("Should never reach the network");
  };
  await assert.rejects(
    analyzeCompass("Работа", "Жизнь", { apiKey: "", fetcher: unreachable }),
    (error: unknown) => error instanceof DeepSeekError && error.status === 503,
  );
  for (const status of [401, 402, 429, 500]) {
    const fetcher: typeof fetch = async () =>
      new Response("private-upstream-details", { status });
    await assert.rejects(
      analyzeCompass("Работа", "Жизнь", { apiKey: "test", fetcher }),
      (error: unknown) =>
        error instanceof DeepSeekError &&
        error.status === (status === 429 ? 429 : 503) &&
        !error.message.includes("private-upstream-details"),
    );
  }
});

test("malformed, truncated or incomplete AI output is rejected without fake fallback text", async () => {
  for (const choice of [
    {
      finish_reason: "length",
      message: { content: JSON.stringify(suggestion) },
    },
    { finish_reason: "stop", message: { content: "not json" } },
    {
      finish_reason: "stop",
      message: { content: JSON.stringify({ complement: "Один ответ" }) },
    },
    { finish_reason: "stop", message: { content: "" } },
  ]) {
    const fetcher: typeof fetch = async () =>
      Response.json({ choices: [choice] });
    await assert.rejects(
      analyzeCompass("Работа", "Жизнь", { apiKey: "test", fetcher }),
      (error: unknown) =>
        error instanceof DeepSeekError && error.status === 502,
    );
  }
});

test("aborted AI calls return a recoverable timeout message", async () => {
  const controller = new AbortController();
  controller.abort();
  const fetcher: typeof fetch = async (_url, init) => {
    init?.signal?.throwIfAborted();
    throw new Error("unreachable");
  };
  await assert.rejects(
    analyzeCompass("Работа", "Жизнь", {
      apiKey: "test",
      fetcher,
      signal: controller.signal,
    }),
    (error: unknown) => error instanceof DeepSeekError && error.status === 504,
  );
});
