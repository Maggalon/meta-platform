import { z } from "zod";
import { workbookSchema } from "./workbook";

export const compassSpaces = [
  {
    id: "work",
    title: "Работа",
    description: "Ваше личное определение и философия хорошей, стоящей работы.",
    questions: [
      "Зачем работать?",
      "Для чего нужна работа?",
      "Что означает работа лично для вас?",
      "Как работа связана с человеком, другими людьми и обществом?",
      "Что определяет хорошую или стоящую работу?",
      "Какое отношение к работе имеют деньги?",
      "Какова роль опыта, личного роста и чувства удовлетворения?",
    ],
  },
  {
    id: "life",
    title: "Жизнь",
    description:
      "Ваш манифест о том, как устроен мир, что придаёт жизни ценность и смысл. Главные ориентиры и фундаментальные ценности.",
    questions: [
      "Зачем мы здесь?",
      "В чём смысл или предназначение жизни?",
      "Каковы отношения между отдельным человеком и остальным обществом?",
      "Какое место в вашей жизни занимают семья, страна и мир в целом?",
      "Что такое добро и что такое зло?",
      "Существует ли высшая сила, Бог или что-то трансцендентное, и как это влияет на вашу жизнь?",
      "Какова роль радости, печали, справедливости, любви, мира и борьбы в жизни?",
    ],
  },
] as const;
export const alignmentQuestions = [
  {
    id: "complement",
    title: "Где ваши взгляды на работу и на жизнь дополняют друг друга?",
  },
  {
    id: "conflict",
    title: "Где они вступают в конфликт или противоречат друг другу?",
  },
  {
    id: "direction",
    title: "Направляет ли одно другое? И если да, то как именно?",
  },
] as const;
export type AlignmentId = (typeof alignmentQuestions)[number]["id"];
// A generous technical limit; the 250-word guide is never a validation rule.
export const compassTextLimit = 12000;
const text = z
  .string()
  .trim()
  .max(compassTextLimit, "Текст слишком длинный. Максимум 12 000 символов.");
export const alignmentSchema = z.object({
  complement: text,
  conflict: text,
  direction: text,
});
export const compassSchema = z
  .object({
    work: text,
    life: text,
    alignment: alignmentSchema,
    status: z.enum(["draft", "completed"]),
    timeZone: workbookSchema.shape.timeZone,
  })
  .superRefine((value, context) => {
    if (
      ![value.work, value.life, ...Object.values(value.alignment)].some(Boolean)
    )
      context.addIssue({
        code: "custom",
        message: "Напишите хотя бы несколько слов, чтобы сохранить черновик.",
      });
    if (
      value.status === "completed" &&
      ![value.work, value.life, ...Object.values(value.alignment)].every(
        Boolean,
      )
    )
      context.addIssue({
        code: "custom",
        message: "Заполните Работу, Жизнь и три ответа о согласованности.",
      });
  });
export const compassAnalysisSchema = z.object({
  work: text.min(1, "Заполните пространство «Работа»"),
  life: text.min(1, "Заполните пространство «Жизнь»"),
});
export const compassSuggestionSchema = z.object({
  complement: z.string().trim().min(1).max(6000),
  conflict: z.string().trim().min(1).max(6000),
  direction: z.string().trim().min(1).max(6000),
});
export type CompassSuggestion = z.infer<typeof compassSuggestionSchema>;
export type CompassInput = z.infer<typeof compassSchema>;
export type CompassResult = CompassInput & {
  id: string;
  studentId: string;
  savedAt: string;
};
export type CompassDraft = Pick<CompassInput, "work" | "life" | "alignment">;
export function emptyCompass(): CompassDraft {
  return {
    work: "",
    life: "",
    alignment: { complement: "", conflict: "", direction: "" },
  };
}
export function countWords(value: string) {
  return value.match(/[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}
export function compassComplete(value: CompassDraft) {
  return [value.work, value.life, ...Object.values(value.alignment)].every(
    (text) => text.trim().length > 0,
  );
}

export type AiUsage = {
  id: string;
  count: number;
  resetAt: string;
  lastRequestedAt: string;
};
export function reserveAiRequest(
  records: AiUsage[],
  userId: string,
  now = Date.now(),
) {
  const active = records.filter((item) => Date.parse(item.resetAt) > now);
  const existing = active.find((item) => item.id === userId);
  if (
    existing &&
    (existing.count >= 20 || now - Date.parse(existing.lastRequestedAt) < 10000)
  )
    return null;
  if (existing) {
    existing.count += 1;
    existing.lastRequestedAt = new Date(now).toISOString();
  } else
    active.push({
      id: userId,
      count: 1,
      resetAt: new Date(now + 3600000).toISOString(),
      lastRequestedAt: new Date(now).toISOString(),
    });
  return active;
}
