import type { Assignment, Submission } from "./types";

export type ProgressStatus =
  "new" | "overdue" | "pending" | "reviewed" | "archived";
export const progressLabels: Record<ProgressStatus, string> = {
  new: "Не сдано",
  overdue: "Просрочено",
  pending: "На проверке",
  reviewed: "Проверено",
  archived: "В архиве",
};

export function studentProgress(
  assignments: Assignment[],
  submissions: Submission[],
  studentId: string,
  includeArchived = false,
  now = Date.now(),
) {
  const ownSubmissions = new Map(
    submissions
      .filter((s) => s.studentId === studentId)
      .map((s) => [s.assignmentId, s]),
  );
  const rows = assignments
    .filter(
      (a) =>
        a.studentIds.includes(studentId) && (includeArchived || !a.archived),
    )
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .map((assignment) => {
      const submission = ownSubmissions.get(assignment.id);
      const status: ProgressStatus =
        submission?.status ??
        (assignment.archived
          ? "archived"
          : new Date(assignment.deadline).getTime() < now
            ? "overdue"
            : "new");
      return { assignment, submission, status };
    });
  const reviewed = rows.filter((r) => r.status === "reviewed");
  const graded = reviewed.filter((r) => r.submission?.score !== undefined);
  const submitted = rows.filter((r) => r.submission).length;
  return {
    rows,
    total: rows.length,
    submitted,
    reviewed: reviewed.length,
    pending: rows.filter((r) => r.status === "pending").length,
    overdue: rows.filter((r) => r.status === "overdue").length,
    completion: rows.length ? Math.round((submitted / rows.length) * 100) : 0,
    average: graded.length
      ? Math.round(
          graded.reduce(
            (sum, r) =>
              sum + (r.submission!.score! / r.assignment.maxScore) * 100,
            0,
          ) / graded.length,
        )
      : null,
  };
}
