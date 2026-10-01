"use client";

import { useRef, useState } from "react";
import { ChevronDown, NotebookPen } from "lucide-react";
import WorkbookAssessment from "./workbook-assessment";
import WorkbookCompass from "./workbook-compass";
import WorkbookDiary from "./workbook-diary";
import WorkbookMap from "./workbook-map";
import WorkbookOdyssey from "./workbook-odyssey";
import WorkbookFailures from "./workbook-failures";

export const workbookBlocks = [1, 2, 3, 4, 5, 6] as const;
export type WorkbookBlock = (typeof workbookBlocks)[number];

export function WorkbookNavigation({
  selectedBlock,
  onSelect,
}: {
  selectedBlock: WorkbookBlock | null;
  onSelect: (block: WorkbookBlock) => void;
}) {
  const [open, setOpen] = useState(selectedBlock !== null);
  const trigger = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="workbook-navigation"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        className={`nav-item ${selectedBlock !== null ? "active" : ""}`}
        aria-expanded={open}
        aria-controls="workbook-blocks"
        onClick={() => setOpen((expanded) => !expanded)}
      >
        <NotebookPen size={19} strokeWidth={1.65} />
        <span>Рабочая тетрадь</span>
        <ChevronDown
          size={15}
          className={`workbook-chevron ${open ? "expanded" : ""}`}
          aria-hidden="true"
        />
      </button>
      <div
        id="workbook-blocks"
        className={`workbook-collapse ${open ? "expanded" : ""}`}
        inert={!open}
        aria-hidden={!open}
      >
        <div className="workbook-collapse-inner">
          <ul className="workbook-submenu">
            {workbookBlocks.map((block) => (
              <li key={block}>
                <a
                  href={`/#design/workbook/${block}`}
                  className={`workbook-link ${selectedBlock === block ? "active" : ""}`}
                  aria-current={selectedBlock === block ? "page" : undefined}
                  onClick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey
                    )
                      return;
                    event.preventDefault();
                    onSelect(block);
                  }}
                >
                  {block === 1
                    ? "Блок 1 · Где я сейчас?"
                    : block === 2
                      ? "Блок 2 · Компас"
                      : block === 3
                        ? "Блок 3 · Дневник хорошего времени"
                        : block === 4
                          ? "Блок 4 · Карта"
                          : block === 5
                            ? "Блок 5 · Планы Одиссеи"
                            : "Блок 6 · Журнал неудач"}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function WorkbookView({ block }: { block: WorkbookBlock }) {
  if (block === 1) return <WorkbookAssessment />;
  if (block === 2) return <WorkbookCompass />;
  if (block === 3) return <WorkbookDiary />;
  if (block === 4) return <WorkbookMap />;
  if (block === 5) return <WorkbookOdyssey />;
  return <WorkbookFailures />;
}
