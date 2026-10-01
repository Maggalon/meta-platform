import { z } from "zod";

export const failureCategories = [
  {
    id: "slip",
    title: "Разовый промах",
    explanation:
      "Обычно вы справляетесь с этой задачей, но в этот раз что-то упустили или ошиблись. Можно подумать о простой страховке на будущее.",
    example: "Забыл приложить файл к письму, хотя обычно проверяю вложения.",
    question: "Что поможет снизить вероятность повторения?",
  },
  {
    id: "difficulty",
    title: "Устойчивая трудность",
    explanation:
      "Похожая ситуация повторяется. Возможно, стоит учесть свои ограничения, найти поддержку или изменить условия выполнения задачи.",
    example:
      "Регулярно не успеваю сосредоточиться на сложной задаче в шумном пространстве.",
    question: "Какая поддержка или изменение условий поможет?",
  },
  {
    id: "growth",
    title: "Возможность роста",
    explanation:
      "Опыт подсветил навык, который можно развить, или предположение, которое стоит проверить новым экспериментом.",
    example:
      "Первая презентация не убедила слушателей: хочу проверить, помогут ли конкретные примеры.",
    question: "Какой навык или предположение стоит проверить?",
  },
] as const;
export type FailureCategory = (typeof failureCategories)[number]["id"];
export const failureTextLimit = 4000;
const text = z.string().trim().max(failureTextLimit);
const requiredText = text.min(1, "Заполните поле");
export const failureEntrySchema = z
  .object({
    date: z.iso.date(),
    event: requiredText,
    expected: requiredText,
    actual: requiredText,
    category: z.enum(["slip", "difficulty", "growth"]),
    responses: z.object({ slip: text, difficulty: text, growth: text }),
    conclusion: requiredText,
    nextStep: text,
  })
  .superRefine((entry, context) => {
    if (!entry.responses[entry.category])
      context.addIssue({
        code: "custom",
        path: ["responses", entry.category],
        message: "Ответьте на вопрос выбранной категории",
      });
  });
export type FailureEntryInput = z.infer<typeof failureEntrySchema>;
export type FailureEntryDraft = Omit<FailureEntryInput, "category"> & {
  category: FailureCategory | null;
};
export type FailureEntry = FailureEntryInput & {
  id: string;
  studentId: string;
  revision: number;
  createdAt: string;
  savedAt: string;
};
export function emptyFailureEntry(): FailureEntryDraft {
  const now = new Date();
  return {
    date: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
    event: "",
    expected: "",
    actual: "",
    category: null,
    responses: { slip: "", difficulty: "", growth: "" },
    conclusion: "",
    nextStep: "",
  };
}
export function failureStepError(
  entry: FailureEntryDraft,
  step: number,
): string {
  if (step === 0) {
    if (!z.iso.date().safeParse(entry.date).success)
      return "Укажите корректную дату события.";
    if (
      ![entry.event, entry.expected, entry.actual].every((value) =>
        value.trim(),
      )
    )
      return "Опишите событие, ожидание и фактический результат.";
  }
  if (step === 1 && !entry.category)
    return "Выберите категорию. Позже её можно изменить.";
  if (
    step === 2 &&
    (!entry.category || !entry.responses[entry.category].trim())
  )
    return "Ответьте на вопрос выбранной категории.";
  if (step === 3 && !entry.conclusion.trim())
    return "Сформулируйте конкретный вывод.";
  return "";
}
export function sortFailureEntries(entries: FailureEntry[]): FailureEntry[] {
  return [...entries].sort(
    (a, b) =>
      b.date.localeCompare(a.date) ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.id.localeCompare(b.id),
  );
}
