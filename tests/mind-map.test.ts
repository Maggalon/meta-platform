import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import {
  emptyMindMap,
  makeBranch,
  mindMapSchema,
  mapComplete,
  randomOuterWords,
  diaryMapSuggestions,
  mapPositions,
  type MindMapResult,
} from "../lib/mind-map";
import { suggestMapIdea, DeepSeekError } from "../lib/deepseek";
import { createMindMapPdf } from "../lib/mind-map-pdf";

test("mind map preserves the full 4-level tree and enforces branch bounds", () => {
  const map = emptyMindMap();
  assert.equal(map.nodes.length, 65);
  assert.ok(mindMapSchema.safeParse(map).success);
  assert.equal(mapComplete(map), false);
  map.nodes.push(...makeBranch("root", 2));
  assert.ok(mindMapSchema.safeParse(map).success);
  map.nodes.push(...makeBranch("root", 2));
  assert.equal(mindMapSchema.safeParse(map).success, false);
  const invalid = emptyMindMap();
  invalid.nodes[1].parentId = invalid.nodes[1].id;
  assert.equal(mindMapSchema.safeParse(invalid).success, false);
  const missing = emptyMindMap();
  missing.nodes.pop();
  assert.equal(mindMapSchema.safeParse(missing).success, false);
  const duplicate = emptyMindMap();
  duplicate.nodes[1].id = duplicate.nodes[0].id;
  assert.equal(mindMapSchema.safeParse(duplicate).success, false);
});

test("selection requires a complete map and three distinct outer-level words", () => {
  const map = emptyMindMap();
  map.core = "Рисование";
  map.nodes.forEach((node, index) => {
    node.word = `Слово ${index}`;
  });
  assert.equal(mapComplete(map), true);
  map.selected = randomOuterWords(map.nodes, () => 0.5);
  assert.equal(map.selected.length, 3);
  assert.equal(new Set(map.selected).size, 3);
  assert.ok(
    map.selected.every(
      (id) => map.nodes.find((node) => node.id === id)?.level === 4,
    ),
  );
  assert.ok(mindMapSchema.safeParse(map).success);
  map.selected = [map.nodes[0].id];
  assert.equal(mindMapSchema.safeParse(map).success, false);
  map.nodes
    .filter((node) => node.level === 4)
    .forEach((node, index) => {
      node.word = index % 2 === 0 ? " Слово " : "слово";
    });
  assert.equal(randomOuterWords(map.nodes).length, 1);
  map.selected = map.nodes
    .filter((node) => node.level === 4)
    .slice(0, 3)
    .map((node) => node.id);
  assert.equal(mindMapSchema.safeParse(map).success, false);
  map.selected = [];
  map.nodes[0].word = " ";
  assert.equal(mapComplete(map), false);
});

test("diary suggestions use maximum signed energy, engagement ties and flow", () => {
  const suggestion = diaryMapSuggestions([
    {
      date: "2026-09-21",
      savedAt: "",
      activities: [
        {
          id: "1",
          activity: "Максимум энергии",
          engagement: 2,
          energy: -1,
          flow: false,
        },
        {
          id: "2",
          activity: "Максимум вовлечённости",
          engagement: 10,
          energy: -5,
          flow: false,
        },
        {
          id: "3",
          activity: "Ещё максимум",
          engagement: 10,
          energy: -3,
          flow: false,
        },
        { id: "4", activity: "Поток", engagement: 8, energy: -4, flow: true },
        {
          id: "5",
          activity: "Обычное",
          engagement: 1,
          energy: -2,
          flow: false,
        },
      ],
    },
  ]);
  assert.equal(suggestion.length, 4);
  assert.equal(suggestion[0].reasons[0], "Энергия -1");
  assert.deepEqual(diaryMapSuggestions([]), []);
});

test("maximum-size map layout produces non-overlapping external circles", () => {
  const map = emptyMindMap();
  map.nodes.push(...makeBranch("root", 2));
  for (const root of map.nodes.filter((node) => node.level === 2))
    map.nodes.push(...makeBranch(root.id, 3));
  for (const child of map.nodes.filter((node) => node.level === 3))
    map.nodes.push(...makeBranch(child.id, 4));
  assert.equal(map.nodes.length, 126);
  assert.ok(mindMapSchema.safeParse(map).success);
  const positions = mapPositions(map.nodes);
  const leaves = map.nodes
    .filter((node) => node.level === 4)
    .map((node) => positions.get(node.id)!);
  for (let i = 0; i < leaves.length; i++)
    for (let j = i + 1; j < leaves.length; j++)
      assert.ok(
        Math.hypot(leaves[i].x - leaves[j].x, leaves[i].y - leaves[j].y) > 80,
      );
});

test("idea assistance sends only the three outer words, checks structured output", async () => {
  const words = ["Вода", "Свет", "Город"] as [string, string, string];
  const suggestion = {
    title: "Городские отражения",
    description:
      "Попробуйте зарисовать отражения города в воде при вечернем свете.",
  };
  const fetcher: typeof fetch = async (_url, init) => {
    const payload = JSON.parse(String(init?.body));
    assert.deepEqual(JSON.parse(payload.messages[1].content), { words });
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
    await suggestMapIdea(words, { apiKey: "test", fetcher }),
    suggestion,
  );
  await assert.rejects(
    suggestMapIdea(words, {
      apiKey: "test",
      fetcher: async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: { content: '{"title":"Only title"}' },
            },
          ],
        }),
    }),
    (error: unknown) => error instanceof DeepSeekError && error.status === 502,
  );
});

test("map PDF contains ideas, vector map and a paginated full word outline", async () => {
  const map = emptyMindMap();
  map.core = "Рисовать городские пейзажи";
  map.nodes.forEach((node, index) => {
    node.word = `Ассоциация ${index + 1}: свет и пространство`;
  });
  const result: MindMapResult = {
    ...map,
    id: "test",
    studentId: "test",
    revision: 1,
    savedAt: "2026-09-21T02:00:00Z",
    timeZone: "Asia/Vladivostok",
    ideas: [
      {
        id: "idea",
        core: map.core,
        words: ["Вода", "Свет", "Город"],
        title: "Городские отражения",
        description:
          "Зарисовать отражения города в воде при вечернем свете.\nНачать с одной прогулки и небольшого скетча.",
      },
    ],
  };
  const bytes = await createMindMapPdf(result);
  const doc = await PDFDocument.load(bytes);
  assert.match(doc.getTitle()!, /Карта/);
  assert.ok(doc.getPages().some((page) => page.getWidth() === 1600));
  assert.ok(doc.getPageCount() >= 3);
  await mkdir("test-results/map", { recursive: true });
  await writeFile("test-results/map/preview.pdf", bytes);
  const long = await PDFDocument.load(
    await createMindMapPdf({
      ...result,
      ideas: [
        {
          ...result.ideas[0],
          description: "Оченьдлинноесловобезпробелов"
            .repeat(150)
            .slice(0, 4000),
        },
      ],
    }),
  );
  assert.ok(long.getPageCount() > doc.getPageCount());
});
