import { z } from "zod";

export const spheres = [
  {
    id: "health",
    title: "Здоровье",
    description:
      "Самочувствие, сон, энергия, движение и забота о своём физическом и эмоциональном состоянии.",
  },
  {
    id: "work",
    title: "Работа",
    description:
      "Учёба, работа, домашний труд и другие значимые занятия, в которых вы вкладываете силы и развиваетесь.",
  },
  {
    id: "hobbies",
    title: "Хобби",
    description:
      "Увлечения, творчество, отдых и занятия для удовольствия, которые дают вам вдохновение.",
  },
  {
    id: "love",
    title: "Любовь",
    description:
      "Близость, поддержка и тепло в отношениях с партнёром, семьёй, друзьями и с самим собой.",
  },
] as const;

export type SphereId = (typeof spheres)[number]["id"];
export const explanationLimit = 600;
const answerSchema = z.object({
  score: z.number().int().min(0).max(100),
  explanation: z
    .string()
    .trim()
    .min(1, "Кратко поясните свою оценку")
    .max(explanationLimit),
});
export const workbookSchema = z.object({
  answers: z.object({
    health: answerSchema,
    work: answerSchema,
    hobbies: answerSchema,
    love: answerSchema,
  }),
  priority: z.enum(["health", "work", "hobbies", "love"]),
  timeZone: z
    .string()
    .max(100)
    .refine((value) => {
      try {
        new Intl.DateTimeFormat("ru-RU", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Не удалось определить часовой пояс"),
});
export type WorkbookInput = z.infer<typeof workbookSchema>;
export type WorkbookResult = WorkbookInput & {
  id: string;
  studentId: string;
  savedAt: string;
};
export type WorkbookDraft = Record<
  SphereId,
  { score: number | null; explanation: string }
>;
export function emptyWorkbookDraft(): WorkbookDraft {
  return {
    health: { score: null, explanation: "" },
    work: { score: null, explanation: "" },
    hobbies: { score: null, explanation: "" },
    love: { score: null, explanation: "" },
  };
}
export function sphereComplete(answer: WorkbookDraft[SphereId]) {
  return answer.score !== null && answer.explanation.trim().length > 0;
}
export function scoreColor(score: number) {
  return `hsl(${Math.round(score * 1.2)}, 48%, 42%)`;
}
export function workbookDate(
  result: Pick<WorkbookResult, "savedAt" | "timeZone">,
) {
  return new Date(result.savedAt).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: result.timeZone,
  });
}
