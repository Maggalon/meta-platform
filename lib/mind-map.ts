import { z } from "zod";
import type { DiaryDay } from "./diary";

export type MapNode = {
  id: string;
  parentId: string;
  level: 2 | 3 | 4;
  word: string;
};
const word = z.string().trim().max(80);
export const mapIdeaSchema = z.object({
  id: z.string().min(1).max(100),
  core: z.string().trim().min(1).max(1000),
  words: z
    .tuple([word.min(1), word.min(1), word.min(1)])
    .refine(
      (words) => new Set(words.map(normalizeWord)).size === 3,
      "Нужны три разных слова",
    ),
  title: z.string().trim().max(160),
  description: z.string().trim().max(4000),
});
export type MapIdea = z.infer<typeof mapIdeaSchema>;
export const mapSuggestionSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().min(1).max(4000),
});
export type MapSuggestion = z.infer<typeof mapSuggestionSchema>;
export const mindMapSchema = z
  .object({
    core: z.string().trim().max(1000),
    nodes: z
      .array(
        z.object({
          id: z
            .string()
            .min(1)
            .max(100)
            .refine((id) => id !== "root"),
          parentId: z.string().min(1).max(100),
          level: z.union([z.literal(2), z.literal(3), z.literal(4)]),
          word,
        }),
      )
      .min(65)
      .max(126),
    selected: z.array(z.string().min(1).max(100)).max(3),
    ideas: z.array(mapIdeaSchema).max(30),
    timeZone: z
      .string()
      .max(100)
      .refine((value) => {
        try {
          new Intl.DateTimeFormat("ru", { timeZone: value });
          return true;
        } catch {
          return false;
        }
      }),
  })
  .superRefine((map, context) => {
    const invalid = (message: string) =>
      context.addIssue({ code: "custom", message });
    const byId = new Map(map.nodes.map((node) => [node.id, node]));
    if (byId.size !== map.nodes.length)
      invalid("Узлы карты должны иметь уникальные идентификаторы");
    const roots = map.nodes.filter((node) => node.level === 2);
    if (roots.length < 5 || roots.length > 6)
      invalid("У ядра должно быть 5–6 ветвей");
    for (const node of map.nodes) {
      if (
        node.level === 2
          ? node.parentId !== "root"
          : byId.get(node.parentId)?.level !== node.level - 1
      )
        invalid("Неверная структура уровней карты");
      if (node.level < 4) {
        const count = map.nodes.filter(
          (child) => child.parentId === node.id,
        ).length;
        if (count < 3 || count > 4)
          invalid("У каждой ветви должно быть 3–4 ответвления");
      }
    }
    if (new Set(map.selected).size !== map.selected.length)
      invalid("Слово уже выбрано");
    const selected = map.selected.map((id) => byId.get(id));
    if (selected.some((node) => !node || node.level !== 4))
      invalid("Выберите слова внешнего, четвёртого уровня");
    if (map.selected.length && !mapComplete(map))
      invalid("Сначала заполните все слова карты");
    if (
      new Set(selected.map((node) => normalizeWord(node?.word ?? ""))).size !==
      selected.length
    )
      invalid("Выберите разные слова");
    if (new Set(map.ideas.map((idea) => idea.id)).size !== map.ideas.length)
      invalid("Карточки идей должны иметь уникальные идентификаторы");
  });
export type MindMapInput = z.infer<typeof mindMapSchema>;
export type MindMapResult = MindMapInput & {
  id: string;
  studentId: string;
  revision: number;
  savedAt: string;
};
export function normalizeWord(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU");
}
export function mapComplete(map: Pick<MindMapInput, "core" | "nodes">) {
  return (
    Boolean(map.core.trim()) &&
    map.nodes.length > 0 &&
    map.nodes.every((node) => node.word.trim())
  );
}
export function makeBranch(parentId: string, level: 2 | 3 | 4): MapNode[] {
  const node: MapNode = { id: crypto.randomUUID(), parentId, level, word: "" };
  return [
    node,
    ...(level < 4
      ? Array.from({ length: 3 }, () =>
          makeBranch(node.id, (level + 1) as 3 | 4),
        ).flat()
      : []),
  ];
}
export function emptyMindMap(): MindMapInput {
  return {
    core: "",
    nodes: Array.from({ length: 5 }, () => makeBranch("root", 2)).flat(),
    selected: [],
    ideas: [],
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  };
}
export function randomOuterWords(
  nodes: MapNode[],
  random = Math.random,
): string[] {
  const unique = new Map<string, string>();
  nodes
    .filter((node) => node.level === 4 && node.word.trim())
    .forEach((node) => {
      if (!unique.has(normalizeWord(node.word)))
        unique.set(normalizeWord(node.word), node.id);
    });
  const ids = [...unique.values()];
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, 3);
}
export function diaryMapSuggestions(days: DiaryDay[]) {
  const entries = days.flatMap((day) =>
    day.activities.map((item) => ({ ...item, date: day.date })),
  );
  const maxEnergy = Math.max(...entries.map((item) => item.energy));
  const maxEngagement = Math.max(...entries.map((item) => item.engagement));
  return entries
    .filter(
      (item) =>
        item.energy === maxEnergy ||
        item.engagement === maxEngagement ||
        item.flow,
    )
    .map((item) => ({
      id: `${item.date}:${item.id}`,
      activity: item.activity,
      date: item.date,
      reasons: [
        item.energy === maxEnergy
          ? `Энергия ${item.energy > 0 ? "+" : ""}${item.energy}`
          : "",
        item.engagement === maxEngagement
          ? `Вовлечённость ${item.engagement}/10`
          : "",
        item.flow ? "В потоке" : "",
      ].filter(Boolean),
    }));
}
export type MapPosition = {
  x: number;
  y: number;
  angle: number;
  branch: number;
};
export function mapPositions(nodes: MapNode[]) {
  const positions = new Map<string, MapPosition>();
  const leaves = nodes.filter((node) => node.level === 4);
  let cursor = 0;
  function visit(node: MapNode, branch: number): number {
    const children = nodes.filter((child) => child.parentId === node.id);
    const angle = children.length
      ? children
          .map((child) => visit(child, branch))
          .reduce((a, b) => a + b, 0) / children.length
      : (cursor++ / leaves.length) * Math.PI * 2 - Math.PI / 2;
    const radius = node.level === 2 ? 380 : node.level === 3 ? 810 : 1390;
    positions.set(node.id, {
      x: 1500 + Math.cos(angle) * radius,
      y: 1500 + Math.sin(angle) * radius,
      angle,
      branch,
    });
    return angle;
  }
  nodes
    .filter((node) => node.level === 2)
    .forEach((node, index) => visit(node, index));
  return positions;
}
