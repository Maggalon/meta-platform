"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, Compass } from "lucide-react";
import { workspaceNames, type Workspace } from "@/lib/workspace";

export default function WorkspaceSwitcher({
  value,
  available,
  onChange,
}: {
  value: Workspace;
  available: Workspace[];
  onChange: (value: Workspace) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const Icon = value === "math" ? BookOpen : Compass;
  return (
    <div
      className="workspace-picker"
      ref={root}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className="workspace-switch"
        aria-label={`Учебное пространство: ${workspaceNames[value]}`}
        aria-expanded={open}
        aria-controls="workspace-options"
        onClick={() => setOpen((previous) => !previous)}
      >
        <span className="workspace-icon">
          <Icon size={18} />
        </span>
        <span>
          <strong>{workspaceNames[value]}</strong>
          <small>Учебное пространство</small>
        </span>
        <ChevronDown size={15} />
      </button>
      {open && (
        <div
          id="workspace-options"
          className="workspace-options"
          role="group"
          aria-label="Выбор пространства"
        >
          {available.map((space) => (
            <button
              key={space}
              type="button"
              aria-pressed={space === value}
              onClick={() => {
                onChange(space);
                setOpen(false);
                trigger.current?.focus();
              }}
            >
              {space === "math" ? (
                <BookOpen size={17} />
              ) : (
                <Compass size={17} />
              )}
              <span>{workspaceNames[space]}</span>
              {space === value && <Check size={15} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
