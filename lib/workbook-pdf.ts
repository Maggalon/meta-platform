import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { spheres, workbookDate, type WorkbookResult } from "./workbook";

export function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  width: number,
) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.replace(/\s+/g, " ").trim().split(" ")) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    line = "";
    for (const character of word) {
      if (line && font.widthOfTextAtSize(line + character, size) > width) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function createWorkbookPdf(result: WorkbookResult) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const font = await document.embedFont(
    await readFile(
      path.join(
        process.cwd(),
        "public/fonts/xn7_YHE41ni1AdIRqAuZuw1Bx9mbZk79FO_F.ttf",
      ),
    ),
    { subset: true },
  );
  document.setTitle("Где я сейчас? - Рабочая тетрадь, блок 1");
  document.setCreator("Meta Education");
  document.setCreationDate(new Date(result.savedAt));
  const ink = rgb(0.15, 0.22, 0.18);
  const muted = rgb(0.35, 0.4, 0.34);
  const border = rgb(0.86, 0.89, 0.83);
  const paper = rgb(0.97, 0.98, 0.95);
  const width = 499;
  let page = document.addPage([595.28, 841.89]);
  let y = 795;
  const drawText = (
    text: string,
    x: number,
    baseline: number,
    size = 11,
    color = ink,
  ) => page.drawText(text, { x, y: baseline, size, font, color });
  function header(continued = false) {
    drawText("META EDUCATION / РАБОЧАЯ ТЕТРАДЬ / БЛОК 1", 48, y, 9, muted);
    y -= 40;
    drawText(
      continued ? "Где я сейчас? (продолжение)" : "Где я сейчас?",
      48,
      y,
      25,
    );
    y -= 25;
    drawText(`Дата заполнения: ${workbookDate(result)}`, 48, y, 11, muted);
    y -= 21;
    drawText(
      `Мой приоритет: ${spheres.find((sphere) => sphere.id === result.priority)!.title}`,
      48,
      y,
      12,
    );
    y -= 30;
  }
  header();
  for (const sphere of spheres) {
    const answer = result.answers[sphere.id];
    const lines = wrapText(answer.explanation, font, 11, width - 36);
    const height = 116 + lines.length * 15;
    if (y - height < 60) {
      page = document.addPage([595.28, 841.89]);
      y = 795;
      header(true);
    }
    page.drawRectangle({
      x: 48,
      y: y - height,
      width,
      height,
      color: paper,
      borderColor: border,
      borderWidth: 0.7,
    });
    drawText(sphere.title, 66, y - 27, 16);
    const priorityLabel = sphere.id === result.priority ? "ПРИОРИТЕТ · " : "";
    const value = `${priorityLabel}${answer.score}%`;
    drawText(value, 529 - font.widthOfTextAtSize(value, 11), y - 25, 11);
    const barWidth = width - 36;
    page.drawRectangle({
      x: 66,
      y: y - 52,
      width: barWidth,
      height: 9,
      color: border,
    });
    // Same red-to-green hue progression as the on-screen scale.
    const hue = (answer.score * 1.2) / 60;
    const chroma = (1 - Math.abs(2 * 0.42 - 1)) * 0.48;
    const secondary = chroma * (1 - Math.abs((hue % 2) - 1));
    const base = 0.42 - chroma / 2;
    const [red, green] = hue <= 1 ? [chroma, secondary] : [secondary, chroma];
    page.drawRectangle({
      x: 66,
      y: y - 52,
      width: (barWidth * answer.score) / 100,
      height: 9,
      color: rgb(red + base, green + base, base),
    });
    for (const tick of [0, 25, 50, 75, 100]) {
      const x = 66 + (barWidth * tick) / 100;
      if (tick > 0 && tick < 100)
        page.drawLine({
          start: { x, y: y - 52 },
          end: { x, y: y - 43 },
          thickness: 1.5,
          color: rgb(1, 1, 1),
        });
      const label = `${tick}%`;
      const offset = font.widthOfTextAtSize(label, 8) * (tick / 100);
      drawText(label, x - offset, y - 67, 8, muted);
    }
    drawText("Почему я так оцениваю эту сферу:", 66, y - 91, 10, muted);
    lines.forEach((line, index) => drawText(line, 66, y - 110 - index * 15));
    y -= height + 16;
  }
  const pages = document.getPages();
  pages.forEach((item, index) => {
    page = item;
    drawText("Моя субъективная оценка на дату заполнения", 48, 32, 9, muted);
    drawText(`${index + 1} / ${pages.length}`, 518, 32, 9, muted);
  });
  return document.save();
}
