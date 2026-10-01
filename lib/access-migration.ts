import { allWorkspaces } from "./access";
import type { Database } from "./types";

// Legacy accounts had both spaces. An explicitly empty list means access was
// revoked and must never be replaced with defaults on subsequent requests.
export function migrateAccess(db: Database, adminEmail?: string): boolean {
  let changed = false;
  const administrator = db.users.find((user) => user.role === "admin");
  const legacyAdmin =
    !administrator && adminEmail
      ? db.users.find(
          (user) =>
            user.role === "teacher" &&
            user.workspaceIds === undefined &&
            user.email.toLowerCase() === adminEmail.trim().toLowerCase(),
        )
      : undefined;
  if (legacyAdmin) {
    legacyAdmin.role = "admin";
    changed = true;
  }
  for (const user of db.users) {
    if (user.workspaceIds === undefined) {
      user.workspaceIds = user.role === "manager" ? [] : [...allWorkspaces];
      changed = true;
    }
  }
  for (const invite of db.invites) {
    if (invite.role === undefined) {
      invite.role = "student";
      changed = true;
    }
    if (invite.workspaceIds === undefined) {
      invite.workspaceIds = invite.role === "manager" ? [] : [...allWorkspaces];
      changed = true;
    }
  }
  return changed;
}
