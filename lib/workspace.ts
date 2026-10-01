import type { View } from "./types";

export type Workspace = "math" | "design";
export const workspaceNames = {
  math: "Математика",
  design: "Проектирование",
} as const;
const views: View[] = [
  "overview",
  "assignments",
  "workbook",
  "review",
  "students",
  "groups",
  "gradebook",
  "schedule",
  "settings",
  "access",
];
export function workspaceLocation(hash: string): {
  view: View;
  workspace: Workspace;
  block: 1 | 2 | 3 | 4 | 5 | 6;
} {
  const parts = hash.replace(/^#/, "").split("/");
  const designPrefix = parts[0] === "design";
  if (designPrefix) parts.shift();
  const section = parts[0] as View;
  const view = views.includes(section) ? section : "overview";
  const workspace = designPrefix || view === "workbook" ? "design" : "math";
  const block = Number(parts[1]);
  return {
    view:
      workspace === "design" &&
      !["overview", "workbook", "settings"].includes(view)
        ? "overview"
        : view,
    workspace,
    block: [1, 2, 3, 4, 5, 6].includes(block)
      ? (block as 1 | 2 | 3 | 4 | 5 | 6)
      : 1,
  };
}
export function workspaceHref(view: View, workspace: Workspace, block = 1) {
  const design =
    view === "workbook" ||
    (workspace === "design" && ["overview", "settings"].includes(view));
  return `/#${design ? "design/" : ""}${view}${view === "workbook" ? `/${block}` : ""}`;
}
