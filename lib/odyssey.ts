import { z } from "zod";
import { countWords } from "./compass";

export const odysseyScenarios = [
  {
    id: "current",
    title: "Продолжить свой путь",
    prompt:
      "Как могут выглядеть следующие пять лет, если вы продолжите нынешний путь и дадите ему развиться?",
  },
  {
    id: "alternative",
    title: "Найти другой путь",
    prompt:
      "Представьте, что привычный вариант стал недоступен. Какую другую жизнь вы могли бы построить?",
  },
  {
    id: "freedom",
    title: "Дать себе больше свободы",
    prompt:
      "Что вы попробовали бы, если бы меньше зависели от чужих ожиданий, статуса и необходимости что-то доказывать?",
  },
] as const;
export const eventCategories = [
  { id: "work", title: "Работа" },
  { id: "learning", title: "Обучение" },
  { id: "relationships", title: "Отношения" },
  { id: "home", title: "Место жизни" },
  { id: "projects", title: "Личные проекты" },
] as const;
export const odysseyIndicators = [
  {
    id: "resources",
    title: "Ресурсы",
    question:
      "Насколько вам доступны время, деньги, навыки и поддержка для этого сценария?",
    low: "Пока не хватает",
    high: "Достаточно",
  },
  {
    id: "appeal",
    title: "Симпатия",
    question:
      "Насколько вам нравится эта версия жизни и хочется её попробовать?",
    low: "Не привлекает",
    high: "Очень нравится",
  },
  {
    id: "confidence",
    title: "Уверенность",
    question: "Насколько вы уверены, что сможете воплотить этот план?",
    low: "Много сомнений",
    high: "Уверен в себе",
  },
  {
    id: "alignment",
    title: "Согласованность",
    question:
      "Насколько этот путь согласуется с вашими взглядами на работу и жизнь?",
    low: "Есть противоречия",
    high: "В полном согласии",
  },
] as const;
export type OdysseyScenarioId = (typeof odysseyScenarios)[number]["id"];
export type OdysseyIndicatorId = (typeof odysseyIndicators)[number]["id"];
export const drawingColors = [
  "#34513a",
  "#b16f59",
  "#6d83aa",
  "#b69850",
] as const;
export const maxDrawingPoints = 1200;
export const drawingSchema = z
  .array(
    z.object({
      color: z.enum(drawingColors),
      width: z.union([z.literal(2), z.literal(4), z.literal(7)]),
      points: z
        .array(
          z.tuple([
            z.number().int().min(0).max(1000),
            z.number().int().min(0).max(1000),
          ]),
        )
        .min(1)
        .max(maxDrawingPoints),
    }),
  )
  .max(80)
  .refine(
    (strokes) =>
      strokes.reduce((sum, stroke) => sum + stroke.points.length, 0) <=
      maxDrawingPoints,
    "Рисунок слишком подробный. Удалите часть штрихов.",
  );
export type OdysseyDrawing = z.infer<typeof drawingSchema>;
export const odysseyEventSchema = z.object({
  id: z.string().min(1).max(100),
  year: z.number().int().min(1).max(5),
  category: z.enum(["work", "learning", "relationships", "home", "projects"]),
  title: z.string().trim().min(1, "Назовите событие").max(160),
  description: z.string().trim().max(2000),
  assumption: z.boolean(),
  drawing: drawingSchema,
});
export type OdysseyEvent = z.infer<typeof odysseyEventSchema>;
const rating = z.object({
  score: z.number().int().min(0).max(10).nullable(),
  why: z.string().trim().max(1500),
});
const scenarioBase = z.object({
  id: z.enum(["current", "alternative", "freedom"]),
  title: z.string().trim().max(250),
  questions: z.array(z.string().trim().max(500)).min(2).max(3),
  ratings: z.object({
    resources: rating,
    appeal: rating,
    confidence: rating,
    alignment: rating,
  }),
  events: z.array(odysseyEventSchema).max(40),
  status: z.enum(["draft", "completed"]),
});
export type OdysseyScenario = z.infer<typeof scenarioBase>;
export function scenarioRequirements(scenario: OdysseyScenario) {
  const missing: string[] = [];
  if (countWords(scenario.title) !== 6) missing.push("название из шести слов");
  if (!scenario.events.length) missing.push("хотя бы одно событие на шкале");
  if (!scenario.questions.every((question) => question.trim()))
    missing.push("два или три исследовательских вопроса");
  if (odysseyIndicators.some(({ id }) => scenario.ratings[id].score === null))
    missing.push("все четыре оценки");
  return missing;
}
export const odysseyScenarioSchema = scenarioBase.superRefine(
  (scenario, context) => {
    if (
      new Set(scenario.events.map((event) => event.id)).size !==
      scenario.events.length
    )
      context.addIssue({
        code: "custom",
        message: "События должны иметь уникальные идентификаторы",
      });
    if (scenario.status === "completed") {
      const missing = scenarioRequirements(scenario);
      if (missing.length)
        context.addIssue({
          code: "custom",
          message: `Для завершения нужны: ${missing.join(", ")}.`,
        });
    }
  },
);
export const odysseySchema = z.object({
  startYear: z.number().int().min(1900).max(2200),
  scenarios: z
    .array(odysseyScenarioSchema)
    .length(3)
    .refine(
      (scenarios) =>
        new Set(scenarios.map((scenario) => scenario.id)).size === 3,
      "Нужны три разных сценария",
    ),
});
export type OdysseyInput = z.infer<typeof odysseySchema>;
export type OdysseyResult = OdysseyInput & {
  id: string;
  studentId: string;
  revision: number;
  savedAt: string;
};
export function emptyOdyssey(): OdysseyInput {
  return {
    startYear: new Date().getFullYear(),
    scenarios: odysseyScenarios.map(({ id }) => ({
      id,
      title: "",
      questions: ["", ""],
      ratings: {
        resources: { score: null, why: "" },
        appeal: { score: null, why: "" },
        confidence: { score: null, why: "" },
        alignment: { score: null, why: "" },
      },
      events: [],
      status: "draft",
    })),
  };
}
export function newOdysseyEvent(year: number): OdysseyEvent {
  return {
    id: crypto.randomUUID(),
    year,
    category: "work",
    title: "",
    description: "",
    assumption: false,
    drawing: [],
  };
}
export function moveOdysseyEvent(
  scenario: OdysseyScenario,
  eventId: string,
  year: number,
): OdysseyScenario {
  if (
    !Number.isInteger(year) ||
    year < 1 ||
    year > 5 ||
    !scenario.events.some(
      (event) => event.id === eventId && event.year !== year,
    )
  )
    return scenario;
  return {
    ...scenario,
    status: "draft",
    events: scenario.events.map((event) =>
      event.id === eventId ? { ...event, year } : event,
    ),
  };
}
