import type { InviteRole, Role, SafeUser, View } from "./types";
import { type Workspace } from "./workspace";

export const allWorkspaces: Workspace[] = ["math", "design"];
export const roleNames: Record<Role, string> = {
  student: "Ученик",
  teacher: "Преподаватель",
  manager: "Менеджер",
  admin: "Администратор",
};
export const canTeach = (role: Role) => role === "teacher" || role === "admin";
export const canManage = (role: Role) => role === "manager" || role === "admin";
export const canManageAccess = (role: Role) =>
  role === "student" || role === "teacher";
export const inviteRoles = (role: Role): InviteRole[] =>
  role === "admin"
    ? ["student", "teacher", "manager"]
    : role === "manager"
      ? ["student", "teacher"]
      : [];
export const availableWorkspaces = (
  user: Pick<SafeUser, "role" | "workspaceIds">,
): Workspace[] =>
  user.role === "admin"
    ? allWorkspaces
    : user.role === "manager"
      ? []
      : user.workspaceIds;
export const hasWorkspace = (
  user: Pick<SafeUser, "role" | "workspaceIds">,
  workspace: Workspace,
) => availableWorkspaces(user).includes(workspace);

export function canOpenView(user: SafeUser, view: View, workspace: Workspace) {
  if (view === "settings") return true;
  if (view === "access") return canManage(user.role);
  if (!hasWorkspace(user, workspace)) return false;
  if (workspace === "design")
    return (
      view === "overview" || (view === "workbook" && user.role === "student")
    );
  if (view === "overview" || view === "schedule") return true;
  if (view === "assignments") return user.role === "student";
  return (
    canTeach(user.role) &&
    ["review", "students", "groups", "gradebook"].includes(view)
  );
}
