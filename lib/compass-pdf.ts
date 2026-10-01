import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { alignmentQuestions, type CompassResult } from "./compass";
import { workbookDate } from "./workbook";
import { wrapText } from "./workbook-pdf";

export async function createCompassPdf(result: CompassResult) {
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
  document.setTitle("Компас - Рабочая тетрадь, блок 2");
  document.setCreator("Meta Education");
  document.setCreationDate(new Date(result.savedAt));
  const ink = rgb(0.15, 0.22, 0.18);
  const muted = rgb(0.35, 0.4, 0.34);
  let page = document.addPage([595.28, 841.89]);
  let y = 793;
  const width = 499;
  function text(value: string, size: number, color = ink) {
    page.drawText(value, { x: 48, y, size, font, color });
  }
  function nextPage() {
    page = document.addPage([595.28, 841.89]);
    y = 793;
    text("КОМПАС / РАБОЧАЯ ТЕТРАДЬ / БЛОК 2", 9, muted);
    y -= 36;
  }
  function ensureSpace(height: number) {
    if (y - height < 60) nextPage();
  }
  text("META EDUCATION / РАБОЧАЯ ТЕТРАДЬ / БЛОК 2", 9, muted);
  y -= 43;
  text("Компас", 29);
  y -= 27;
  text(`Дата сохранения: ${workbookDate(result)}`, 11, muted);
  y -= 21;
  text(
    result.status === "completed" ? "Завершённый компас" : "Черновик",
    11,
    muted,
  );
  y -= 37;

  function section(title: string, body: string) {
    const heading = wrapText(title, font, 16, width);
    ensureSpace(heading.length * 23 + 48);
    for (const line of heading) {
      text(line, 16);
      y -= 23;
    }
    y -= 5;
    const paragraphs = (body.trim() || "Не заполнено.")
      .replace(/\r\n?/g, "\n")
      .replace(/\n\s*\n/g, "\n")
      .split("\n");
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) continue;
      for (const line of wrapText(paragraph, font, 11, width)) {
        ensureSpace(17);
        text(line, 11);
        y -= 17;
      }
      y -= 8;
    }
    y -= 19;
  }
  section("Работа", result.work);
  section("Жизнь", result.life);
  ensureSpace(150);
  text("Согласованность", 21);
  y -= 34;
  alignmentQuestions.forEach((question, index) =>
    section(`${index + 1}. ${question.title}`, result.alignment[question.id]),
  );
  const pages = document.getPages();
  pages.forEach((item, index) => {
    item.drawText(
      `Компас · ${workbookDate(result)}${result.status === "draft" ? " · Черновик" : ""}`,
      { x: 48, y: 32, size: 9, font, color: muted },
    );
    item.drawText(`${index + 1} / ${pages.length}`, {
      x: 510,
      y: 32,
      size: 9,
      font,
      color: muted,
    });
  });
  return document.save();
}
