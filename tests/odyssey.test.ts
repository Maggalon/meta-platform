import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyOdyssey,
  newOdysseyEvent,
  odysseySchema,
  drawingSchema,
  moveOdysseyEvent,
  scenarioRequirements,
  type OdysseyDrawing,
} from "../lib/odyssey";

test("odyssey starts with three independent draft scenarios and unanswered scores", () => {
  const plan = emptyOdyssey();
  assert.ok(odysseySchema.safeParse(plan).success);
  assert.deepEqual(
    plan.scenarios.map((s) => s.id),
    ["current", "alternative", "freedom"],
  );
  plan.scenarios[0].ratings.resources.score = 0;
  assert.equal(plan.scenarios[1].ratings.resources.score, null);
  assert.ok(odysseySchema.safeParse(plan).success);
  plan.scenarios[0].status = "completed";
  assert.equal(odysseySchema.safeParse(plan).success, false);
});

test("completed scenarios require six words, two or three questions, an event and all ratings", () => {
  const plan = emptyOdyssey();
  const scenario = plan.scenarios[0];
  scenario.title = "Учусь создавать проекты помогаю людям путешествую";
  scenario.events = [{ ...newOdysseyEvent(1), title: "Поступить на курс" }];
  scenario.questions = [
    "Как выглядит рабочий день?",
    "Какие навыки проверить?",
  ];
  Object.values(scenario.ratings).forEach((rating) => {
    rating.score = 0;
  });
  scenario.status = "completed";
  assert.deepEqual(scenarioRequirements(scenario), []);
  assert.ok(odysseySchema.safeParse(plan).success);
  scenario.questions.push("");
  assert.equal(odysseySchema.safeParse(plan).success, false);
  scenario.questions[2] = "Где найти наставника?";
  assert.ok(odysseySchema.safeParse(plan).success);
  scenario.title = "Название из пяти простых слов";
  assert.equal(odysseySchema.safeParse(plan).success, false);
  scenario.status = "draft";
  assert.ok(odysseySchema.safeParse(plan).success);
});

test("odyssey rejects duplicate scenarios, duplicate events, invalid years and scores", () => {
  const plan = emptyOdyssey();
  plan.scenarios[1].id = "current";
  assert.equal(odysseySchema.safeParse(plan).success, false);
  plan.scenarios[1].id = "alternative";
  const event = { ...newOdysseyEvent(1), title: "Учиться" };
  plan.scenarios[0].events = [event, event];
  assert.equal(odysseySchema.safeParse(plan).success, false);
  plan.scenarios[0].events = [{ ...event, year: 6 }];
  assert.equal(odysseySchema.safeParse(plan).success, false);
  plan.scenarios[0].events = [event];
  plan.scenarios[0].ratings.appeal.score = 11;
  assert.equal(odysseySchema.safeParse(plan).success, false);
  plan.scenarios[0].ratings.appeal.score = 1.5;
  assert.equal(odysseySchema.safeParse(plan).success, false);
});

test("moving an event changes only its year and reopens the edited scenario", () => {
  const scenario = emptyOdyssey().scenarios[0];
  const drawing: OdysseyDrawing = [
    {
      color: "#34513a",
      width: 4,
      points: [
        [0, 0],
        [1000, 1000],
      ],
    },
  ];
  const event = {
    ...newOdysseyEvent(1),
    title: "Переехать к морю",
    assumption: true,
    drawing,
  };
  scenario.events = [event];
  scenario.status = "completed";
  const moved = moveOdysseyEvent(scenario, event.id, 5);
  assert.equal(moved.status, "draft");
  assert.equal(moved.events[0].year, 5);
  assert.deepEqual(moved.events[0], { ...event, year: 5 });
  assert.equal(scenario.events[0].year, 1);
  assert.equal(moveOdysseyEvent(scenario, event.id, 0), scenario);
  assert.equal(moveOdysseyEvent(scenario, "unknown", 3), scenario);
  assert.equal(moveOdysseyEvent(scenario, event.id, 1), scenario);
});

test("drawings accept bounded strokes and reject arbitrary SVG content and excessive coordinates", () => {
  assert.ok(
    drawingSchema.safeParse([
      {
        color: "#34513a",
        width: 4,
        points: [
          [0, 0],
          [1000, 1000],
        ],
      },
    ]).success,
  );
  assert.equal(
    drawingSchema.safeParse([
      { color: "url(javascript:alert(1))", width: 4, points: [[1, 1]] },
    ]).success,
    false,
  );
  assert.equal(
    drawingSchema.safeParse([
      { color: "#34513a", width: 4, points: [[1001, 1]] },
    ]).success,
    false,
  );
  assert.equal(
    drawingSchema.safeParse([
      {
        color: "#34513a",
        width: 4,
        points: Array.from({ length: 1201 }, () => [0, 0]),
      },
    ]).success,
    false,
  );
  assert.equal(drawingSchema.safeParse("<svg>hello</svg>").success, false);
});
