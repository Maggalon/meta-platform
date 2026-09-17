import type { AppData, Group, Lesson } from "./types";

export function lessonIncludesStudent(
  lesson: Lesson,
  studentId: string,
  groups: Group[],
) {
  return lesson.studentId
    ? lesson.studentId === studentId
    : groups.some(
        (g) => g.id === lesson.groupId && g.studentIds.includes(studentId),
      );
}

export function lessonParticipants(
  lesson: Lesson,
  data: Pick<AppData, "users" | "groups">,
) {
  if (lesson.studentId) {
    return `Индивидуально · ${data.users.find((u) => u.id === lesson.studentId)?.name ?? "Ученик"}`;
  }
  return data.groups.find((g) => g.id === lesson.groupId)?.name ?? "Группа";
}
