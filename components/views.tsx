"use client";
import { useMemo, useState } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  Plus,
  Download,
  Users,
  CalendarDays,
  Clock3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Archive,
  CheckCircle2,
  FileText,
} from "lucide-react";
import type {
  AppData,
  Assignment,
  Submission,
  Group,
  SafeUser,
} from "@/lib/types";
import {
  Avatar,
  AvatarStack,
  Status,
  EmptyState,
  dateLabel,
  timeLabel,
  api,
  SubmitButton,
  taskCount,
  counted,
} from "./ui";

type Shared = { data: AppData; query: string };
export function AssignmentsView({
  data,
  query,
  onOpen,
  onCreate,
}: { onOpen: (a: Assignment) => void; onCreate: () => void } & Shared) {
  const [filter, setFilter] = useState("all"),
    [group, setGroup] = useState("all"),
    [sort, setSort] = useState("deadline");
  const teacher = data.user.role === "teacher";
  const status = (a: Assignment) =>
    data.submissions.find(
      (s) => s.assignmentId === a.id && s.studentId === data.user.id,
    )?.status || "new";
  const assignments = data.assignments
    .filter(
      (a) =>
        a.title.toLowerCase().includes(query.toLowerCase()) &&
        (filter === "archived" ? a.archived : !a.archived) &&
        (filter === "all" ||
          filter === "archived" ||
          (filter === "overdue"
            ? new Date(a.deadline) < new Date() &&
              (teacher
                ? a.studentIds.length >
                  data.submissions.filter((s) => s.assignmentId === a.id).length
                : status(a) === "new")
            : teacher
              ? data.submissions.some(
                  (s) => s.assignmentId === a.id && s.status === filter,
                )
              : status(a) === filter)) &&
        (group === "all" ||
          a.studentIds.some((id) =>
            data.groups.find((g) => g.id === group)?.studentIds.includes(id),
          )),
    )
    .sort((a, b) =>
      sort === "deadline"
        ? a.deadline.localeCompare(b.deadline)
        : b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <>
      <div className="view-toolbar">
        <div className="filter-tabs">
          {[
            ["all", "Все задания"],
            ["pending", "На проверке"],
            ["reviewed", "Проверено"],
            ["overdue", "Просрочено"],
            ["archived", "Архив"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
              {id === "all" && (
                <span>
                  {data.assignments.filter((a) => !a.archived).length}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="filter-controls">
          <select
            aria-label="Фильтр по группе"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="all">Все группы</option>
            {data.groups.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <select
            aria-label="Сортировка заданий"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="deadline">По дедлайну</option>
            <option value="newest">Сначала новые</option>
          </select>
        </div>
      </div>
      {assignments.length ? (
        <div className="assignment-grid">
          {assignments.map((a, i) => {
            const subs = data.submissions.filter(
                (s) => s.assignmentId === a.id,
              ),
              reviewed = subs.filter((s) => s.status === "reviewed").length;
            const overdue =
              new Date(a.deadline) < new Date() && status(a) === "new";
            return (
              <button
                className="assignment-card"
                key={a.id}
                onClick={() => onOpen(a)}
              >
                <div className="assignment-card-top">
                  <span className={`large-subject-icon tone-${i % 3}`}>
                    <BookOpen size={25} strokeWidth={1.5} />
                  </span>
                  {teacher ? (
                    <span className="subject-label">{a.subject}</span>
                  ) : (
                    <Status
                      status={a.archived ? "archived" : status(a)}
                      overdue={overdue && !a.archived}
                    />
                  )}
                  <ArrowUpRight size={19} />
                </div>
                <div className="assignment-card-body">
                  <p className="eyebrow">
                    {taskCount(a.questions).toUpperCase()} · ДО {a.maxScore}{" "}
                    БАЛЛОВ
                  </p>
                  <h2>{a.title}</h2>
                  <p className="assignment-excerpt">
                    {a.description.split("\n")[0]}
                  </p>
                </div>
                <div className="assignment-card-meta">
                  <span
                    className={
                      new Date(a.deadline) < new Date() ? "text-orange" : ""
                    }
                  >
                    <Clock3 size={14} />
                    {dateLabel(a.deadline)}, {timeLabel(a.deadline)}
                  </span>
                  {a.fileIds.length > 0 && (
                    <span>
                      <FileText size={14} />
                      {a.fileIds.length}
                    </span>
                  )}
                </div>
                {teacher && (
                  <div className="assignment-card-footer">
                    <AvatarStack
                      users={data.users.filter((u) =>
                        a.studentIds.includes(u.id),
                      )}
                    />
                    <span>
                      Сдали{" "}
                      <strong>
                        {subs.length}/{a.studentIds.length}
                      </strong>
                      <small>Проверено: {reviewed}</small>
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Задания не найдены"
          description="Измените фильтры или создайте новое задание."
          action={
            teacher ? (
              <button className="button primary" onClick={onCreate}>
                <Plus size={17} />
                Создать задание
              </button>
            ) : undefined
          }
        />
      )}
    </>
  );
}
export function ReviewView({
  data,
  query,
  onOpen,
}: { onOpen: (s: Submission) => void } & Shared) {
  const [filter, setFilter] = useState("pending"),
    [sort, setSort] = useState("oldest"),
    [assignment, setAssignment] = useState("all");
  const teacher = data.user.role === "teacher";
  const rows = data.submissions
    .filter(
      (s) =>
        (filter === "all" || s.status === filter) &&
        (assignment === "all" || s.assignmentId === assignment) &&
        `${data.users.find((u) => u.id === s.studentId)?.name} ${data.assignments.find((a) => a.id === s.assignmentId)?.title}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      sort === "oldest"
        ? a.submittedAt.localeCompare(b.submittedAt)
        : b.submittedAt.localeCompare(a.submittedAt),
    );
  return (
    <>
      <div className="view-toolbar">
        <div className="filter-tabs">
          {[
            ["pending", "На проверке"],
            ["reviewed", "Проверено"],
            ["all", "Все работы"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
              <span>
                {
                  data.submissions.filter(
                    (s) => id === "all" || s.status === id,
                  ).length
                }
              </span>
            </button>
          ))}
        </div>
        <div className="filter-controls">
          <select
            aria-label="Фильтр по заданию"
            value={assignment}
            onChange={(e) => setAssignment(e.target.value)}
          >
            <option value="all">Все задания</option>
            {data.assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <select
            aria-label="Порядок проверки"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
          >
            <option value="oldest">Сначала старые</option>
            <option value="newest">Сначала новые</option>
          </select>
        </div>
      </div>
      <section className="panel full-table">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{teacher ? "Ученик" : "Работа"}</th>
                {teacher && <th>Задание</th>}
                <th>Дата сдачи</th>
                <th>Статус</th>
                <th>Баллы</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => {
                const student = data.users.find((u) => u.id === s.studentId)!;
                const a = data.assignments.find(
                  (a) => a.id === s.assignmentId,
                )!;
                return (
                  <tr key={s.id}>
                    <td>
                      {teacher ? (
                        <div className="person-cell">
                          <Avatar user={student} />
                          <div>
                            <strong>{student.name}</strong>
                            <small>
                              {data.groups.find((g) =>
                                g.studentIds.includes(student.id),
                              )?.name || "Без группы"}
                            </small>
                          </div>
                        </div>
                      ) : (
                        <strong>{a.title}</strong>
                      )}
                    </td>
                    {teacher && <td className="table-title">{a.title}</td>}
                    <td>
                      {dateLabel(s.submittedAt)}
                      <small>{timeLabel(s.submittedAt)}</small>
                    </td>
                    <td>
                      <Status status={s.status} />
                    </td>
                    <td>
                      {s.status === "reviewed" ? (
                        <strong>
                          {s.score}
                          <span className="muted">/{a.maxScore}</span>
                        </strong>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>
                      <button
                        className={`button compact ${s.status === "pending" && teacher ? "primary" : "secondary"}`}
                        onClick={() => onOpen(s)}
                      >
                        {teacher && s.status === "pending"
                          ? "Проверить"
                          : "Открыть"}
                        <ArrowUpRight size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <EmptyState
            title={
              filter === "pending"
                ? "Все работы проверены"
                : "Работы не найдены"
            }
            description={
              filter === "pending"
                ? "Новые решения учеников появятся в этой очереди."
                : "Попробуйте изменить фильтры."
            }
          />
        )}
      </section>
      <p className="view-note">
        <CheckCircle2 size={15} />
        {teacher
          ? "Результаты и рецензии видны только вам и автору работы."
          : "Ваши решения и результаты доступны только вам и преподавателю."}
      </p>
    </>
  );
}
export function StudentsView({
  data,
  query,
  onInvite,
  onStudent,
}: { onInvite: () => void; onStudent: (u: SafeUser) => void } & Shared) {
  const [group, setGroup] = useState("all");
  const students = data.users.filter(
    (u) =>
      u.role === "student" &&
      `${u.name} ${u.email}`.toLowerCase().includes(query.toLowerCase()) &&
      (group === "all" ||
        data.groups.find((g) => g.id === group)?.studentIds.includes(u.id)),
  );
  return (
    <>
      <div className="view-toolbar">
        <div className="results-count">
          Всего <strong>{students.length}</strong> учеников
        </div>
        <div className="filter-controls">
          <select
            aria-label="Группа учеников"
            value={group}
            onChange={(e) => setGroup(e.target.value)}
          >
            <option value="all">Все группы</option>
            {data.groups.map((g) => (
              <option value={g.id} key={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button className="button secondary" onClick={onInvite}>
            <Plus size={17} />
            Пригласить ученика
          </button>
        </div>
      </div>
      <section className="panel full-table">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Ученик</th>
                <th>Группа</th>
                <th>Сдано работ</th>
                <th>Средний результат</th>
                <th>Ближайшее занятие</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {students.map((u) => {
                const subs = data.submissions.filter(
                    (s) => s.studentId === u.id,
                  ),
                  graded = subs.filter((s) => s.status === "reviewed");
                const avg = graded.length
                  ? Math.round(
                      graded.reduce(
                        (sum, s) =>
                          sum +
                          ((s.score || 0) /
                            (data.assignments.find(
                              (a) => a.id === s.assignmentId,
                            )?.maxScore || 10)) *
                            100,
                        0,
                      ) / graded.length,
                    )
                  : null;
                const groups = data.groups.filter((g) =>
                  g.studentIds.includes(u.id),
                );
                const lesson = data.lessons
                  .filter(
                    (l) =>
                      groups.some((g) => g.id === l.groupId) &&
                      new Date(l.startsAt) > new Date(),
                  )
                  .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
                return (
                  <tr key={u.id}>
                    <td>
                      <button
                        className="person-cell person-button"
                        onClick={() => onStudent(u)}
                      >
                        <Avatar user={u} />
                        <div>
                          <strong>{u.name}</strong>
                          <small>{u.email}</small>
                        </div>
                      </button>
                    </td>
                    <td>
                      <div className="group-labels">
                        {groups.length ? (
                          groups.map((g) => (
                            <span className={`group-tag ${g.color}`} key={g.id}>
                              {g.name}
                            </span>
                          ))
                        ) : (
                          <span className="muted">Без группы</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <strong>{subs.length}</strong>
                      <span className="muted">
                        {" "}
                        /{" "}
                        {
                          data.assignments.filter((a) =>
                            a.studentIds.includes(u.id),
                          ).length
                        }
                      </span>
                    </td>
                    <td>
                      {avg !== null ? (
                        <div className="student-average">
                          <strong>{avg}%</strong>
                          <div>
                            <i style={{ width: `${avg}%` }} />
                          </div>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>
                      {lesson ? (
                        <>
                          {dateLabel(lesson.startsAt)}
                          <small>{timeLabel(lesson.startsAt)}</small>
                        </>
                      ) : (
                        <span className="muted">Не запланировано</span>
                      )}
                    </td>
                    <td>
                      <button
                        className="icon-button"
                        aria-label={`Открыть профиль ${u.name}`}
                        onClick={() => onStudent(u)}
                      >
                        <ArrowUpRight size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!students.length && (
          <EmptyState
            title="Здесь будут ваши ученики"
            description="Отправьте пригласительную ссылку, чтобы начать."
            action={
              <button className="button primary" onClick={onInvite}>
                Создать приглашение
              </button>
            }
          />
        )}
      </section>
    </>
  );
}
export function GroupsView({
  data,
  query,
  onEdit,
  onCreate,
}: { onEdit: (g: Group) => void; onCreate: () => void } & Shared) {
  const groups = data.groups.filter((g) =>
    g.name.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="group-grid">
      {groups.map((g, i) => {
        const lesson = data.lessons
          .filter(
            (l) => l.groupId === g.id && new Date(l.startsAt) > new Date(),
          )
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
        return (
          <button
            className={`group-card group-${g.color}`}
            key={g.id}
            onClick={() => onEdit(g)}
          >
            <div className="group-art">
              <svg viewBox="0 0 240 110" aria-hidden="true">
                {i % 3 === 0 ? (
                  <g fill="currentColor">
                    <path d="M75 95V15a80 80 0 0 1 80 80Z" opacity=".7" />
                    <path d="M165 15v80a80 80 0 0 1-80-80Z" opacity=".3" />
                  </g>
                ) : i % 3 === 1 ? (
                  <g fill="none" stroke="currentColor" strokeWidth="11">
                    {[22, 38, 54].map((r) => (
                      <circle key={r} cx="120" cy="56" r={r} opacity=".5" />
                    ))}
                  </g>
                ) : (
                  <g fill="currentColor">
                    {[0, 60, 120].map((r) => (
                      <ellipse
                        key={r}
                        cx="120"
                        cy="55"
                        rx="25"
                        ry="55"
                        transform={`rotate(${r} 120 55)`}
                        opacity=".45"
                      />
                    ))}
                  </g>
                )}
              </svg>
              <span>
                <ArrowUpRight size={19} />
              </span>
            </div>
            <div className="group-card-info">
              <span className="eyebrow">
                {counted(g.studentIds.length, [
                  "ученик",
                  "ученика",
                  "учеников",
                ]).toUpperCase()}
              </span>
              <h2>{g.name}</h2>
              <p>{g.description}</p>
              <AvatarStack
                users={data.users.filter((u) => g.studentIds.includes(u.id))}
              />
              <div className="group-next">
                <CalendarDays size={15} />
                {lesson
                  ? `${dateLabel(lesson.startsAt)} в ${timeLabel(lesson.startsAt)}`
                  : "Занятия пока не запланированы"}
              </div>
            </div>
          </button>
        );
      })}
      <button className="create-group-card" onClick={onCreate}>
        <span>
          <Plus size={25} />
        </span>
        <h3>Новая группа</h3>
        <p>Учиться вместе — расти быстрее</p>
      </button>
    </div>
  );
}
export function GradebookView({
  data,
  query,
  onReview,
  onAssignment,
}: {
  onReview: (s: Submission) => void;
  onAssignment: (a: Assignment) => void;
} & Shared) {
  const [group, setGroup] = useState("all");
  const students = data.users.filter(
    (u) =>
      u.role === "student" &&
      u.name.toLowerCase().includes(query.toLowerCase()) &&
      (group === "all" ||
        data.groups.find((g) => g.id === group)?.studentIds.includes(u.id)),
  );
  const assignments = [...data.assignments]
    .filter((a) => !a.archived)
    .sort((a, b) => a.deadline.localeCompare(b.deadline));
  function exportCsv() {
    const escape = (value: string) =>
      `"${(/^[=+\-@]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const rows = [
      ["Ученик", ...assignments.map((a) => a.title)],
      ...students.map((u) => [
        u.name,
        ...assignments.map((a) => {
          const s = data.submissions.find(
            (s) => s.studentId === u.id && s.assignmentId === a.id,
          );
          return s
            ? s.status === "reviewed"
              ? `${s.score}/${a.maxScore}`
              : "На проверке"
            : a.studentIds.includes(u.id)
              ? "Не сдано"
              : "Не назначено";
        }),
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + rows.map((row) => row.map(escape).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8;" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `Журнал_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="view-toolbar">
        <div className="grade-legend">
          <span>
            <i className="green" />
            Проверено
          </span>
          <span>
            <i className="sand" />
            На проверке
          </span>
          <span>
            <i className="peach" />
            Просрочено
          </span>
        </div>
        <div className="filter-controls">
          {data.user.role === "teacher" && (
            <select
              aria-label="Группа в журнале"
              value={group}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="all">Все группы</option>
              {data.groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          )}
          <button className="button secondary" onClick={exportCsv}>
            <Download size={16} />
            Скачать CSV
          </button>
        </div>
      </div>
      <section className="panel full-table">
        <div className="table-scroll gradebook-scroll">
          <table className="gradebook">
            <thead>
              <tr>
                <th>Ученик</th>
                {assignments.map((a) => (
                  <th key={a.id}>
                    <button onClick={() => onAssignment(a)}>
                      {a.title}
                      <small>{dateLabel(a.deadline)}</small>
                    </button>
                  </th>
                ))}
                <th>Средний</th>
              </tr>
            </thead>
            <tbody>
              {students.map((u) => {
                const subs = data.submissions.filter(
                  (s) => s.studentId === u.id && s.status === "reviewed",
                );
                const avg = subs.length
                  ? Math.round(
                      subs.reduce(
                        (sum, s) =>
                          sum +
                          ((s.score || 0) /
                            (data.assignments.find(
                              (a) => a.id === s.assignmentId,
                            )?.maxScore || 10)) *
                            100,
                        0,
                      ) / subs.length,
                    )
                  : null;
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar user={u} size="small" />
                        <strong>{u.name}</strong>
                      </div>
                    </td>
                    {assignments.map((a) => {
                      const s = data.submissions.find(
                          (s) =>
                            s.studentId === u.id && s.assignmentId === a.id,
                        ),
                        assigned = a.studentIds.includes(u.id),
                        overdue = new Date(a.deadline) < new Date();
                      return (
                        <td key={a.id}>
                          {!assigned ? (
                            <span className="muted">—</span>
                          ) : (
                            <button
                              className={`grade-cell ${s?.status || (overdue ? "overdue" : "new")}`}
                              title={`${u.name}: ${a.title}`}
                              onClick={() =>
                                s ? onReview(s) : onAssignment(a)
                              }
                            >
                              {s?.status === "reviewed" ? (
                                <>
                                  {s.score}
                                  <small>/{a.maxScore}</small>
                                </>
                              ) : s ? (
                                <Clock3 size={16} />
                              ) : overdue ? (
                                "Не сдано"
                              ) : (
                                "Новое"
                              )}
                            </button>
                          )}
                        </td>
                      );
                    })}
                    <td>
                      <strong className="average-total">
                        {avg !== null ? `${avg}%` : "—"}
                      </strong>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!students.length && (
          <EmptyState
            title="Журнал пока пуст"
            description="Результаты появятся после первых работ учеников."
          />
        )}
      </section>
      <p className="view-note">
        Нажмите на балл, чтобы открыть работу и рецензию преподавателя.
      </p>
    </>
  );
}
export function ScheduleView({
  data,
  query,
  onCreate,
}: { onCreate: () => void } & Shared) {
  const [offset, setOffset] = useState(0);
  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  monday.setHours(0, 0, 0, 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(day.getDate() + i);
    return day;
  });
  return (
    <>
      <div className="view-toolbar">
        <div className="schedule-heading">
          <button
            className="icon-button bordered"
            aria-label="Предыдущая неделя"
            onClick={() => setOffset(offset - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <h2>
            {dateLabel(days[0].toISOString())} —{" "}
            {dateLabel(days[6].toISOString())}
          </h2>
          <button
            className="icon-button bordered"
            aria-label="Следующая неделя"
            onClick={() => setOffset(offset + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
        <button className="button secondary" onClick={() => setOffset(0)}>
          Сегодня
        </button>
      </div>
      <div className="schedule-grid">
        {days.map((day, i) => {
          const lessons = data.lessons
            .filter(
              (l) =>
                new Date(l.startsAt).toDateString() === day.toDateString() &&
                l.title.toLowerCase().includes(query.toLowerCase()),
            )
            .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
          return (
            <section
              className={`schedule-day ${day.toDateString() === new Date().toDateString() ? "current" : ""}`}
              key={i}
            >
              <header>
                <span>
                  {
                    [
                      "Понедельник",
                      "Вторник",
                      "Среда",
                      "Четверг",
                      "Пятница",
                      "Суббота",
                      "Воскресенье",
                    ][i]
                  }
                </span>
                <strong>{day.getDate()}</strong>
              </header>
              <div className="schedule-day-body">
                {lessons.map((l) => {
                  const group = data.groups.find((g) => g.id === l.groupId);
                  return (
                    <article
                      className={`lesson-card ${group?.color || "green"}`}
                      key={l.id}
                    >
                      <span className="lesson-time">
                        {timeLabel(l.startsAt)}–
                        {timeLabel(
                          new Date(
                            new Date(l.startsAt).getTime() + l.duration * 60000,
                          ).toISOString(),
                        )}
                      </span>
                      <h3>{l.title}</h3>
                      <p>{group?.name}</p>
                      <div>
                        <Clock3 size={12} />
                        {l.duration} мин
                      </div>
                      {/^https?:\/\//.test(l.location) ? (
                        <a
                          className="lesson-location"
                          href={l.location}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Подключиться
                          <ArrowUpRight size={12} />
                        </a>
                      ) : (
                        <small>{l.location}</small>
                      )}
                    </article>
                  );
                })}
                {!lessons.length && (
                  <span className="schedule-empty">Нет занятий</span>
                )}
              </div>
            </section>
          );
        })}
      </div>
      {data.user.role === "teacher" && (
        <button className="add-lesson-footer" onClick={onCreate}>
          <Plus size={17} />
          Запланировать занятие
        </button>
      )}
    </>
  );
}
export function SettingsView({
  data,
  onSaved,
}: {
  data: AppData;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError("");
    setSuccess(false);
    try {
      await api("profile", {
        name: f.get("name"),
        email: f.get("email"),
        currentPassword: f.get("currentPassword") || undefined,
        password: f.get("password") || undefined,
      });
      await onSaved();
      setSuccess(true);
      form
        .querySelectorAll<HTMLInputElement>('input[type="password"]')
        .forEach((el) => (el.value = ""));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel settings-panel">
      <div className="settings-profile">
        <Avatar user={data.user} size="large" />
        <div>
          <h2>{data.user.name}</h2>
          <p>{data.user.role === "teacher" ? "Преподаватель" : "Ученик"}</p>
        </div>
      </div>
      <form onSubmit={submit} className="standard-form">
        <div className="form-grid">
          <label>
            Имя и фамилия
            <input
              name="name"
              required
              maxLength={200}
              defaultValue={data.user.name}
            />
          </label>
          <label>
            Email
            <input
              name="email"
              type="email"
              required
              defaultValue={data.user.email}
            />
          </label>
        </div>
        <div className="form-section-heading">
          <h3>Безопасность</h3>
          <p>Для смены email или пароля укажите текущий пароль.</p>
        </div>
        <div className="form-grid">
          <label>
            Текущий пароль
            <input
              type="password"
              name="currentPassword"
              autoComplete="current-password"
              placeholder="Введите текущий пароль"
            />
          </label>
          <label>
            Новый пароль
            <input
              type="password"
              name="password"
              minLength={12}
              maxLength={200}
              autoComplete="new-password"
              placeholder="Не менее 12 символов"
            />
          </label>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {success && (
          <p className="form-success" role="status">
            Настройки сохранены
          </p>
        )}
        <div className="form-actions">
          <SubmitButton busy={busy}>Сохранить изменения</SubmitButton>
        </div>
      </form>
    </section>
  );
}
