"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minus, Plus, LocateFixed } from "lucide-react";
import { mapPositions, type MapNode } from "@/lib/mind-map";

const colors = [
  "#7f946a",
  "#b29a65",
  "#76978d",
  "#b48977",
  "#8c8dad",
  "#a18e9c",
];
export default function MapCanvas({
  core,
  nodes,
  activeId,
  selected,
  selecting,
  onSelect,
}: {
  core: string;
  nodes: MapNode[];
  activeId: string;
  selected: string[];
  selecting: boolean;
  onSelect: (id: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 800, height: 620 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);
  const positions = useMemo(() => mapPositions(nodes), [nodes]);
  const scale = (Math.min(size.width, size.height) / 3060) * zoom;
  useEffect(() => {
    const node = container.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      }),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  function focusActive() {
    const p = positions.get(activeId) ?? { x: 1500, y: 1500 };
    const next = 3;
    const nextScale = (Math.min(size.width, size.height) / 3060) * next;
    setZoom(next);
    setPan({ x: -(p.x - 1500) * nextScale, y: -(p.y - 1500) * nextScale });
  }
  function changeZoom(factor: number) {
    const next = Math.min(7, Math.max(1, zoom * factor));
    setPan((p) => ({ x: (p.x * next) / zoom, y: (p.y * next) / zoom }));
    setZoom(next);
  }
  return (
    <div className="map-canvas-shell">
      <div className="map-canvas-tools">
        <span>
          {selecting
            ? "Выберите 3 кружка внешнего уровня"
            : "Нажмите на узел, чтобы ввести слово"}
        </span>
        <div>
          <button
            type="button"
            className="icon-button"
            aria-label="Уменьшить карту"
            disabled={zoom <= 1}
            onClick={() => changeZoom(1 / 1.4)}
          >
            <Minus size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Увеличить карту"
            disabled={zoom >= 7}
            onClick={() => changeZoom(1.4)}
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Приблизить выбранный узел"
            onClick={focusActive}
          >
            <LocateFixed size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Показать всю карту"
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
          >
            <Maximize2 size={17} />
          </button>
        </div>
      </div>
      <div className="map-canvas" ref={container}>
        <svg
          width="100%"
          height="100%"
          aria-label="Карта ассоциаций. Перетаскивайте свободное поле для перемещения."
          onPointerDown={(event) => {
            if (
              event.button !== 0 ||
              (event.target as Element).closest("[data-map-node]")
            )
              return;
            event.currentTarget.setPointerCapture(event.pointerId);
            drag.current = {
              x: event.clientX,
              y: event.clientY,
              panX: pan.x,
              panY: pan.y,
            };
          }}
          onPointerMove={(event) => {
            if (drag.current)
              setPan({
                x: drag.current.panX + event.clientX - drag.current.x,
                y: drag.current.panY + event.clientY - drag.current.y,
              });
          }}
          onPointerUp={(event) => {
            drag.current = null;
            if (event.currentTarget.hasPointerCapture(event.pointerId))
              event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <g
            transform={`translate(${size.width / 2 + pan.x} ${size.height / 2 + pan.y}) scale(${scale}) translate(-1500 -1500)`}
          >
            {nodes.map((node) => {
              const p = positions.get(node.id)!;
              const parent = positions.get(node.parentId) ?? {
                x: 1500,
                y: 1500,
              };
              return (
                <line
                  key={`line-${node.id}`}
                  x1={parent.x}
                  y1={parent.y}
                  x2={p.x}
                  y2={p.y}
                  stroke={colors[p.branch]}
                  strokeOpacity=".48"
                strokeWidth={node.level === 2 ? 1.2 : 0.8}
                vectorEffect="non-scaling-stroke"
                />
              );
            })}
            {[{ id: "root", word: core, level: 1 }, ...nodes].map((node) => {
              const p = positions.get(node.id) ?? {
                x: 1500,
                y: 1500,
                branch: 0,
              };
              const radius =
                node.level === 1
                  ? 140
                  : node.level === 2
                    ? 75
                    : node.level === 3
                      ? 58
                      : 40;
              const chosen = selected.includes(node.id);
              const active = activeId === node.id;
              const label =
                node.word.trim() ||
                (node.level === 1 ? "Ваше занятие" : `Уровень ${node.level}`);
              const chunks =
                label.match(/.{1,10}/gu)?.slice(0, node.level === 1 ? 4 : 3) ??
                [];
              if (label.length > (node.level === 1 ? 40 : 30))
                chunks[chunks.length - 1] =
                  chunks[chunks.length - 1].slice(0, 8) + "…";
              return (
                <g
                  key={node.id}
                  data-map-node={node.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${node.level === 1 ? "Центр" : `Уровень ${node.level}`}: ${label}${chosen ? ", выбрано" : ""}`}
                  aria-pressed={
                    selecting && node.level === 4 ? chosen : undefined
                  }
                  className="map-node"
                  onClick={() => onSelect(node.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      onSelect(node.id);
                    }
                  }}
                >
                  <title>{label}</title>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={radius}
                    fill={
                      chosen
                        ? "#dce9a8"
                        : node.level === 1
                          ? "#2f4b3c"
                          : node.word.trim()
                            ? "#f8faf1"
                            : "#fff"
                    }
                    stroke={active ? "#243f30" : colors[p.branch]}
                  strokeWidth={active ? 2 : chosen ? 2 : 1}
                  vectorEffect="non-scaling-stroke"
                    strokeDasharray={
                      !node.word.trim() && node.level > 1 ? "7 6" : undefined
                    }
                  />
                  <text
                    x={p.x}
                    y={p.y}
                    textAnchor="middle"
                    fill={node.level === 1 ? "#fff" : "#3e513c"}
                    fontSize={
                      node.level === 1
                        ? 26
                        : node.level === 2
                          ? 20
                          : node.level === 3
                            ? 16
                            : 12
                    }
                    aria-hidden="true"
                  >
                    {chunks.map((chunk, index) => (
                      <tspan
                        key={index}
                        x={p.x}
                        dy={
                          index === 0
                            ? `${-(chunks.length - 1) * 0.6}em`
                            : "1.2em"
                        }
                      >
                        {chunk}
                      </tspan>
                    ))}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <p className="map-canvas-help">
        Перетаскивайте фон для перемещения. Кнопки + и − меняют масштаб. Все
        слова также доступны в редакторе ветвей.
      </p>
    </div>
  );
}
