"use client";

import { useId, useRef, type PointerEvent } from "react";
import { Minus, Plus } from "lucide-react";
import { gaugeAngle } from "@/lib/diary";

export default function DiaryGauge({
  label,
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  min: number;
  max: number;
  disabled: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const signed = min < 0;
  const format = (number: number) =>
    signed && number > 0 ? `+${number}` : String(number).replace("-", "−");
  function select(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !svg.current) return;
    const bounds = svg.current.getBoundingClientRect();
    const dx = ((event.clientX - bounds.left) * 200) / bounds.width - 100;
    const dy = 100 - ((event.clientY - bounds.top) * 130) / bounds.height;
    const angle = Math.max(
      -90,
      Math.min(90, (Math.atan2(dx, dy) * 180) / Math.PI),
    );
    onChange(Math.round(min + ((angle + 90) / 180) * (max - min)));
  }
  return (
    <div className="diary-gauge">
      <span className="diary-gauge-label" id={id}>
        {label}
      </span>
      <div
        role="slider"
        aria-labelledby={id}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? min}
        aria-valuetext={value === null ? "Не оценено" : format(value)}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        className="diary-gauge-control"
        onPointerDown={(event) => {
          if (disabled || event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          select(event);
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId))
            select(event);
        }}
        onPointerUp={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            select(event);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onKeyDown={(event) => {
          if (disabled) return;
          let next: number;
          if (event.key === "Home") next = min;
          else if (event.key === "End") next = max;
          else if (["ArrowRight", "ArrowUp"].includes(event.key))
            next = Math.min(max, (value ?? min) + 1);
          else if (["ArrowLeft", "ArrowDown"].includes(event.key))
            next = Math.max(min, (value ?? min) - 1);
          else return;
          event.preventDefault();
          onChange(next);
        }}
      >
        <svg ref={svg} viewBox="0 0 200 130" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-gradient`}>
              <stop offset="0%" stopColor={signed ? "#b97361" : "#c8d2af"} />
              <stop offset="50%" stopColor="#d4c995" />
              <stop offset="100%" stopColor="#6d9560" />
            </linearGradient>
          </defs>
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={value === null ? "#e1e6d9" : `url(#${id}-gradient)`}
            strokeWidth="10"
            strokeLinecap="round"
          />
          {Array.from({ length: 11 }, (_, index) => {
            const angle = Math.PI - (index * Math.PI) / 10;
            return (
              <line
                key={index}
                x1={100 + 66 * Math.cos(angle)}
                y1={100 - 66 * Math.sin(angle)}
                x2={100 + (index % 5 === 0 ? 55 : 60) * Math.cos(angle)}
                y2={100 - (index % 5 === 0 ? 55 : 60) * Math.sin(angle)}
                stroke="#8a997d"
                strokeWidth={index % 5 === 0 ? 1.5 : 1}
              />
            );
          })}
          {value !== null && (
            <g transform={`rotate(${gaugeAngle(value, min, max)} 100 100)`}>
              <path d="M 97 100 L 100 38 L 103 100 Z" fill="#34513a" />
            </g>
          )}
          <circle
            cx="100"
            cy="100"
            r="6"
            fill={value === null ? "#cad3c0" : "#34513a"}
          />
          <text x="20" y="124" textAnchor="middle">
            {format(min)}
          </text>
          <text x="100" y="10" textAnchor="middle">
            {format((min + max) / 2)}
          </text>
          <text x="180" y="124" textAnchor="middle">
            {format(max)}
          </text>
        </svg>
      </div>
      <div className="diary-gauge-value">
        <button
          type="button"
          aria-label={`Уменьшить: ${label}`}
          disabled={disabled || value === min}
          onClick={() => onChange(Math.max(min, (value ?? 0) - 1))}
        >
          <Minus size={14} />
        </button>
        <output>{value === null ? "Не оценено" : format(value)}</output>
        <button
          type="button"
          aria-label={`Увеличить: ${label}`}
          disabled={disabled || value === max}
          onClick={() => onChange(Math.min(max, (value ?? 0) + 1))}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}
