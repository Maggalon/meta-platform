import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { mapComplete, mapPositions, type MindMapResult } from "./mind-map";
import { workbookDate } from "./workbook";
import { wrapText } from "./workbook-pdf";

export async function createMindMapPdf(result: MindMapResult) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(
    await readFile(
      path.join(
        process.cwd(),
        "public/fonts/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk79FO_F.ttf",
      ),
    ),
    { subset: true },
  );
  doc.setTitle("Карта — Рабочая тетрадь, блок 4");
  doc.setCreator("Meta Education");
  doc.setCreationDate(new Date(result.savedAt));
  const ink = rgb(0.16, 0.25, 0.19),
    muted = rgb(0.39, 0.45, 0.37),
    lineColor = rgb(0.7, 0.76, 0.65);
  let page = doc.addPage([595.28, 841.89]),
    y = 789;
  function nextPage() {
    page = doc.addPage([595.28, 841.89]);
    y = 789;
  }
  function text(value: string, size = 11, indent = 0) {
    for (const line of wrapText(
      value || "Не заполнено",
      font,
      size,
      499 - indent,
    )) {
      if (y < 65) nextPage();
      page.drawText(line, { x: 48 + indent, y, size, font, color: ink });
      y -= size * 1.6;
    }
  }
  function section(title: string, body: string) {
    if (y < 140) nextPage();
    text(title, 16);
    y -= 8;
    for (const paragraph of body.split(/\r?\n/)) {
      text(paragraph);
      y -= 5;
    }
    y -= 17;
  }
  text("META EDUCATION / РАБОЧАЯ ТЕТРАДЬ / БЛОК 4", 9);
  y -= 25;
  text("Карта", 29);
  y -= 10;
  text(`Дата сохранения: ${workbookDate(result)}`, 11);
  text(
    mapComplete(result) ? "Все слова карты заполнены" : "Черновик карты",
    10,
  );
  y -= 24;
  section("Центральное занятие", result.core);
  if (!result.ideas.length)
    section("Карточки идей", "Карточки идей пока не созданы.");
  result.ideas.forEach((idea, index) => {
    section(
      `Идея ${index + 1}: ${idea.title || "Без названия (черновик)"}`,
      `Исходное занятие: ${idea.core}\nТри слова: ${idea.words.join(" · ")}\n\n${idea.description || "Описание пока не заполнено."}`,
    );
  });
  if (result.selected.length)
    section(
      "Текущая комбинация",
      result.selected
        .map((id) => result.nodes.find((node) => node.id === id)!.word)
        .join(" · "),
    );

  const graph = doc.addPage([1600, 1660]);
  graph.drawText("Карта ассоциаций", {
    x: 50,
    y: 1610,
    size: 24,
    font,
    color: ink,
  });
  graph.drawText("Полные подписи приведены на следующих страницах.", {
    x: 50,
    y: 1580,
    size: 12,
    font,
    color: muted,
  });
  const positions = mapPositions(result.nodes);
  const point = (x: number, y: number) => ({
    x: 50 + x * 0.5,
    y: 1540 - y * 0.5,
  });
  for (const node of result.nodes) {
    const p = positions.get(node.id)!;
    const parent = positions.get(node.parentId) ?? { x: 1500, y: 1500 };
    graph.drawLine({
      start: point(parent.x, parent.y),
      end: point(p.x, p.y),
      thickness: 1,
      color: lineColor,
    });
  }
  for (const node of [{ id: "root", word: result.core }, ...result.nodes]) {
    const position = positions.get(node.id) ?? { x: 1500, y: 1500 };
    const p = point(position.x, position.y),
      radius = node.id === "root" ? 60 : 21;
    graph.drawCircle({
      ...p,
      size: radius,
      color: result.selected.includes(node.id)
        ? rgb(0.83, 0.9, 0.66)
        : rgb(0.96, 0.98, 0.92),
      borderColor: lineColor,
      borderWidth: 1,
    });
    const label = node.word
      ? node.word.length > 30
        ? node.word.slice(0, 29) + "…"
        : node.word
      : "…";
    const size = node.id === "root" ? 10 : 5.5;
    const lines = wrapText(label, font, size, radius * 1.6);
    lines.forEach((line, index) =>
      graph.drawText(line, {
        x: p.x - font.widthOfTextAtSize(line, size) / 2,
        y:
          p.y +
          (lines.length - 1) * size * 0.65 -
          index * size * 1.3 -
          size * 0.3,
        size,
        font,
        color: ink,
      }),
    );
  }
  nextPage();
  text("Слова карты", 23);
  y -= 20;
  const roots = result.nodes.filter((node) => node.level === 2);
  roots.forEach((root, index) => {
    if (y < 145) nextPage();
    text(`Ветвь ${index + 1} · ${root.word || "Не заполнено"}`, 16);
    y -= 7;
    result.nodes
      .filter((node) => node.parentId === root.id)
      .forEach((child) => {
        if (y < 115) nextPage();
        text(`Уровень 3: ${child.word || "Не заполнено"}`, 12, 12);
        result.nodes
          .filter((node) => node.parentId === child.id)
          .forEach((leaf) => text(`• ${leaf.word || "Не заполнено"}`, 11, 28));
        y -= 12;
      });
    y -= 15;
  });
  const pages = doc.getPages();
  pages.forEach((page, index) => {
    page.drawText(`Карта · ${workbookDate(result)}`, {
      x: 48,
      y: 30,
      size: 9,
      font,
      color: muted,
    });
    page.drawText(`${index + 1} / ${pages.length}`, {
      x: page.getWidth() - 85,
      y: 30,
      size: 9,
      font,
      color: muted,
    });
  });
  return doc.save();
}
