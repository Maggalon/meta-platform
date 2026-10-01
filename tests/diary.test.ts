import { test } from "node:test";
import assert from "node:assert/strict";
import {
  diaryDaySchema,
  diaryReflectionSchema,
  emptyAeiou,
  newDiaryActivity,
  reflectionUnlocked,
  gaugeAngle,
} from "../lib/diary";
import { analyzeDiary, DeepSeekError } from "../lib/deepseek";

const activity = {
  id: "one",
  activity: "Гулял в парке с другом",
  engagement: 0,
  energy: -5,
  flow: false,
};
const day = { date: "2026-09-21", activities: [activity] };

test("diary validates both signed ranges and distinguishes zero from unanswered", () => {
  for (const engagement of [0, 10])
    for (const energy of [-5, 0, 5]) {
      assert.ok(
        diaryDaySchema.safeParse({
          ...day,
          activities: [{ ...activity, engagement, energy }],
        }).success,
      );
    }
  for (const changes of [
    { engagement: null },
    { energy: null },
    { engagement: -1 },
    { engagement: 11 },
    { engagement: 0.5 },
    { energy: -6 },
    { energy: 6 },
    { energy: 1.5 },
    { activity: "   " },
  ]) {
    assert.equal(
      diaryDaySchema.safeParse({
        ...day,
        activities: [{ ...activity, ...changes }],
      }).success,
      false,
    );
  }
  assert.equal(newDiaryActivity().engagement, null);
  assert.equal(newDiaryActivity().energy, null);
});

test("diary rejects invalid dates, empty days, duplicate activity IDs and excessive entries", () => {
  assert.equal(
    diaryDaySchema.safeParse({ ...day, date: "2026-02-30" }).success,
    false,
  );
  assert.equal(
    diaryDaySchema.safeParse({ ...day, activities: [] }).success,
    false,
  );
  assert.equal(
    diaryDaySchema.safeParse({ ...day, activities: [activity, activity] })
      .success,
    false,
  );
  assert.equal(
    diaryDaySchema.safeParse({
      ...day,
      activities: Array.from({ length: 51 }, (_, i) => ({
        ...activity,
        id: String(i),
      })),
    }).success,
    false,
  );
});

test("reflection unlocks at seven days and permits partial but not empty answers", () => {
  const days = Array.from({ length: 7 }, (_, i) => ({
    ...day,
    date: `2026-09-0${i + 1}`,
    savedAt: new Date().toISOString(),
  }));
  assert.equal(reflectionUnlocked(days.slice(0, 6)), false);
  assert.equal(reflectionUnlocked(days), true);
  assert.equal(diaryReflectionSchema.safeParse(emptyAeiou()).success, false);
  assert.ok(
    diaryReflectionSchema.safeParse({
      ...emptyAeiou(),
      actions: "Прогулки придают сил",
    }).success,
  );
  assert.equal(gaugeAngle(0, 0, 10), -90);
  assert.equal(gaugeAngle(10, 0, 10), 90);
  assert.equal(gaugeAngle(-5, -5, 5), -90);
  assert.equal(gaugeAngle(0, -5, 5), 0);
  assert.equal(gaugeAngle(5, -5, 5), 90);
});

test("diary AI sends only saved observations and validates all five AEIOU suggestions", async () => {
  const suggestion = {
    actions: "Прогулки",
    environment: "Парк",
    interactions: "Беседа",
    objects: "Недостаточно данных",
    people: "Друг",
  };
  const fetcher: typeof fetch = async (_url, init) => {
    const request = JSON.parse(String(init?.body));
    assert.equal(request.model, "deepseek-flash");
    assert.deepEqual(JSON.parse(request.messages[1].content), [
      {
        date: day.date,
        activities: [
          {
            activity: activity.activity,
            engagement: 0,
            energy: -5,
            flow: false,
          },
        ],
      },
    ]);
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
    await analyzeDiary([{ ...day, savedAt: "private-time" }], {
      apiKey: "test",
      model: "deepseek-flash",
      fetcher,
    }),
    suggestion,
  );
  await assert.rejects(
    analyzeDiary([{ ...day, savedAt: "" }], {
      apiKey: "test",
      fetcher: async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: { content: '{"actions":"only one"}' },
            },
          ],
        }),
    }),
    (error: unknown) => error instanceof DeepSeekError && error.status === 502,
  );
});
