"use client";
import { useRef, useState, type PointerEvent } from "react";
import { Undo2, Eraser } from "lucide-react";
import {
  drawingColors,
  maxDrawingPoints,
  type OdysseyDrawing,
} from "@/lib/odyssey";

export function DrawingPreview({ drawing }: { drawing: OdysseyDrawing }) {
  return (
    <svg
      className="odyssey-drawing-preview"
      viewBox="0 0 600 240"
      role="img"
      aria-label="Рисунок к событию"
    >
      <rect width="600" height="240" rx="12" fill="#fcfaf3" />
      {drawing.map((stroke, index) => (
        <polyline
          key={index}
          points={stroke.points
            .map(([x, y]) => `${x * 0.6},${y * 0.24}`)
            .join(" ")}
          fill="none"
          stroke={stroke.color}
          strokeWidth={stroke.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
export default function OdysseyDrawingEditor({
  value,
  onChange,
}: {
  value: OdysseyDrawing;
  onChange: (drawing: OdysseyDrawing) => void;
}) {
  const [color, setColor] = useState<(typeof drawingColors)[number]>(
    drawingColors[0],
  );
  const [width, setWidth] = useState<2 | 4 | 7>(4);
  const [stroke, setStroke] = useState<OdysseyDrawing[number] | null>(null);
  const [notice, setNotice] = useState("");
  const current = useRef<OdysseyDrawing[number] | null>(null);
  const total = value.reduce((count, item) => count + item.points.length, 0);
  function point(event: PointerEvent<SVGSVGElement>): [number, number] {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.round(
        Math.max(
          0,
          Math.min(1000, ((event.clientX - rect.left) / rect.width) * 1000),
        ),
      ),
      Math.round(
        Math.max(
          0,
          Math.min(1000, ((event.clientY - rect.top) / rect.height) * 1000),
        ),
      ),
    ];
  }
  function finish() {
    if (!current.current) return;
    const completed = current.current;
    if (completed.points.length === 1)
      completed.points.push([...completed.points[0]]);
    onChange([...value, completed]);
    current.current = null;
    setStroke(null);
  }
  return (
    <div className="odyssey-drawing-editor">
      <div className="odyssey-drawing-tools">
        <div aria-label="Цвет пера">
          {drawingColors.map((item, index) => (
            <button
              key={item}
              type="button"
              className="odyssey-pen"
              style={{ background: item }}
              aria-label={`Цвет пера: ${["зелёный", "терракотовый", "синий", "охра"][index]}`}
              aria-pressed={color === item}
              onClick={() => setColor(item)}
            />
          ))}
        </div>
        <label>
          Толщина
          <select
            value={width}
            onChange={(event) =>
              setWidth(Number(event.target.value) as 2 | 4 | 7)
            }
          >
            <option value={2}>Тонкая</option>
            <option value={4}>Средняя</option>
            <option value={7}>Толстая</option>
          </select>
        </label>
        <button
          type="button"
          className="icon-button"
          aria-label="Отменить последний штрих"
          disabled={!value.length}
          onClick={() => {
            onChange(value.slice(0, -1));
            setNotice("");
          }}
        >
          <Undo2 size={17} />
        </button>
        <button
          type="button"
          className="icon-button"
          aria-label="Очистить рисунок в редакторе"
          disabled={!value.length}
          onClick={() => {
            onChange([]);
            setNotice("");
          }}
        >
          <Eraser size={17} />
        </button>
      </div>
      <svg
        className="odyssey-drawing-pad"
        viewBox="0 0 600 240"
        preserveAspectRatio="none"
        role="img"
        aria-label="Поле для рисунка: рисуйте мышью или пальцем"
        onPointerDown={(event) => {
          if (event.button !== 0 || current.current) return;
          if (total >= maxDrawingPoints - 1 || value.length >= 80) {
            setNotice(
              "Достигнут лимит рисунка. Отмените часть штрихов, чтобы продолжить.",
            );
            return;
          }
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          current.current = { color, width, points: [point(event)] };
          setStroke(current.current);
        }}
        onPointerMove={(event) => {
          if (
            !current.current ||
            !event.currentTarget.hasPointerCapture(event.pointerId)
          )
            return;
          const next = point(event);
          const last = current.current.points.at(-1)!;
          if (Math.hypot(next[0] - last[0], next[1] - last[1]) < 4) return;
          if (total + current.current.points.length >= maxDrawingPoints) {
            setNotice(
              "Достигнут лимит рисунка. Отмените часть штрихов, чтобы продолжить.",
            );
            return;
          }
          current.current = {
            ...current.current,
            points: [...current.current.points, next],
          };
          setStroke(current.current);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            finish();
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => {
          current.current = null;
          setStroke(null);
        }}
      >
        {[...value, ...(stroke ? [stroke] : [])].map((item, index) => (
          <polyline
            key={index}
            points={item.points
              .map(([x, y]) => `${x * 0.6},${y * 0.24}`)
              .join(" ")}
            fill="none"
            stroke={item.color}
            strokeWidth={item.width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      </svg>
      <p className="odyssey-note">
        Небольшой набросок мышью или пальцем. Вместо рисунка можно описать образ
        в тексте события.
      </p>
      {notice && (
        <p className="odyssey-note" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}
