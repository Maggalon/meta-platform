import { z } from "zod";

export const maxDiaryDays = 21;
export const reflectionMinimumDays = 7;
export const maxDayActivities = 50;
export const aeiouCategories = [
  {
    id: "actions",
    letter: "A",
    title: "Действия",
    question:
      "Какие занятия вовлекают вас, дают энергию или помогают войти в поток? Какие, наоборот, утомляют?",
  },
  {
    id: "environment",
    letter: "E",
    title: "Окружение",
    question:
      "Где и в какой обстановке вы чувствуете себя лучше? Как на вас влияют место, шум, свет и темп происходящего?",
  },
  {
    id: "interactions",
    letter: "I",
    title: "Взаимодействия",
    question:
      "Какие взаимодействия с людьми и процессами вас поддерживают? Какие форматы общения и совместной работы забирают силы?",
  },
  {
    id: "objects",
    letter: "O",
    title: "Предметы",
    question:
      "Какие предметы, инструменты и технологии помогают вам увлечься занятием, а какие мешают?",
  },
  {
    id: "people",
    letter: "U",
    title: "Люди",
    question:
      "С кем вы чувствуете вовлечённость и прилив энергии? С кем вам сложнее и какие закономерности вы замечаете?",
  },
] as const;
export type AeiouId = (typeof aeiouCategories)[number]["id"];
export type AeiouAnswers = Record<AeiouId, string>;
export const diaryDateSchema = z.iso.date();
export const diaryDaySchema = z
  .object({
    date: diaryDateSchema,
    activities: z
      .array(
        z.object({
          id: z.string().min(1).max(100),
          activity: z
            .string()
            .trim()
            .min(1, "Опишите, чем занимались")
            .max(1000),
          engagement: z.number().int().min(0).max(10),
          energy: z.number().int().min(-5).max(5),
          flow: z.boolean(),
        }),
      )
      .min(1, "Добавьте хотя бы одно занятие")
      .max(maxDayActivities),
  })
  .refine(
    (day) =>
      new Set(day.activities.map((item) => item.id)).size ===
      day.activities.length,
    "Записи дня не должны повторяться",
  );
const reflectionText = z.string().trim().max(12000);
export const aeiouSchema = z.object({
  actions: reflectionText,
  environment: reflectionText,
  interactions: reflectionText,
  objects: reflectionText,
  people: reflectionText,
});
export const diaryReflectionSchema = aeiouSchema.refine(
  (answers) => Object.values(answers).some(Boolean),
  "Заполните хотя бы одну категорию рефлексии",
);
const suggestionText = z.string().trim().min(1).max(6000);
export const diarySuggestionSchema = z.object({
  actions: suggestionText,
  environment: suggestionText,
  interactions: suggestionText,
  objects: suggestionText,
  people: suggestionText,
});
export type DiaryDayInput = z.infer<typeof diaryDaySchema>;
export type DiaryDay = DiaryDayInput & { savedAt: string };
export type DiaryActivityDraft = {
  id: string;
  activity: string;
  engagement: number | null;
  energy: number | null;
  flow: boolean;
};
export type DiaryDayDraft = { date: string; activities: DiaryActivityDraft[] };
export type TimeDiary = {
  id: string;
  studentId: string;
  days: DiaryDay[];
  revision: number;
  reflection: {
    answers: AeiouAnswers;
    savedAt: string;
    basedOnRevision: number;
  } | null;
};
export function emptyAeiou(): AeiouAnswers {
  return {
    actions: "",
    environment: "",
    interactions: "",
    objects: "",
    people: "",
  };
}
export function newDiary(studentId: string): TimeDiary {
  return {
    id: `workbook-3:${studentId}`,
    studentId,
    days: [],
    revision: 0,
    reflection: null,
  };
}
export function newDiaryActivity(): DiaryActivityDraft {
  return {
    id: crypto.randomUUID(),
    activity: "",
    engagement: null,
    energy: null,
    flow: false,
  };
}
export function localDiaryDate() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function diaryDateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
export function reflectionUnlocked(days: DiaryDay[]) {
  return days.length >= reflectionMinimumDays;
}
export function gaugeAngle(value: number, min: number, max: number) {
  return ((value - min) / (max - min)) * 180 - 90;
}
