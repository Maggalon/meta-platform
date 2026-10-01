"use client";
import { canTeach } from "@/lib/access";

import { useState } from "react";
import { ArrowUpRight, Download } from "lucide-react";
import type { AppData, Assignment, Submission } from "@/lib/types";
import {
  studentProgress,
  progressLabels,
  type ProgressStatus,
} from "@/lib/progress";
import { Avatar, EmptyState, Status, dateLabel, taskCount } from "./ui";
import { ClassGradebookView } from "./views";

type Props = {
  data: AppData;
  query: string;
  onReview: (submission: Submission) => void;
  onAssignment: (assignment: Assignment) => void;
};

export function GradebookView(props: Props) {
  const { data, query, onReview, onAssignment } = props;
  const teacher = canTeach(data.user.role);
  const [mode, setMode] = useState<"individual" | "class">("individual");
  const [studentId, setStudentId] = useState("");
  const [group, setGroup] = useState("all");
  const [includeArchived, setIncludeArchived] = useState(false);
  const [status, setStatus] = useState<"all" | ProgressStatus>("all");
  const students = data.users.filter(
    (u) =>
      u.role === "student" &&
      (!teacher
        ? u.id === data.user.id
        : u.name.toLowerCase().includes(query.trim().toLowerCase()) &&
          (group === "all" ||
            data.groups
              .find((g) => g.id === group)
              ?.studentIds.includes(u.id))),
  );
  const student = students.find((u) => u.id === studentId) ?? students[0];
  const progress = studentProgress(
    data.assignments,
    data.submissions,
    student?.id ?? "",
    includeArchived,
  );
  const rows = progress.rows.filter(
    (r) => status === "all" || r.status === status,
  );
  const fullDate = (value: string) =>
    dateLabel(value, { day: "numeric", month: "short", year: "numeric" });

  function exportCsv() {
    if (!student) return;
    const values = [
      [
        "Ученик",
        "Задание",
        "Предмет",
        "Срок сдачи",
        "Статус",
        "Балл",
        "Максимум",
        "Дата сдачи",
        "Комментарий",
        "Архив",
      ],
      ...rows.map(({ assignment: a, submission: s, status }) => [
        student.name,
        a.title,
        a.subject,
        fullDate(a.deadline),
        progressLabels[status],
        s?.score === undefined ? "" : String(s.score),
        String(a.maxScore),
        s ? fullDate(s.submittedAt) : "",
        s?.feedback ?? "",
        a.archived ? "Да" : "Нет",
      ]),
    ];
    const escape = (value: string) =>
      `"${(/^[\s]*[=+\-@]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;
    const url = URL.createObjectURL(
      new Blob(
        ["\ufeff" + values.map((r) => r.map(escape).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8;" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `Прогресс_${student.name.replace(/[<>:"/\\|?*]/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="individual-gradebook">
      {teacher && (
        <div
          className="gradebook-modes"
          role="group"
          aria-label="Режим журнала"
        >
          <button
            aria-pressed={mode === "individual"}
            onClick={() => setMode("individual")}
          >
            По ученику
          </button>
          <button
            aria-pressed={mode === "class"}
            onClick={() => setMode("class")}
          >
            Общая таблица
          </button>
        </div>
      )}
      {teacher && mode === "class" ? (
        <ClassGradebookView
          {...props}
          onStudent={(id) => {
            setStudentId(id);
            setGroup("all");
            setStatus("all");
            setMode("individual");
          }}
        />
      ) : (
        <>
          <div className="progress-controls">
            {teacher && (
              <>
                <label>
                  Группа
                  <select
                    value={group}
                    onChange={(e) => {
                      setGroup(e.target.value);
                      setStatus("all");
                    }}
                  >
                    <option value="all">Все группы</option>
                    {data.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="progress-student-select">
                  Ученик
                  <select
                    value={student?.id ?? ""}
                    disabled={!students.length}
                    onChange={(e) => {
                      setStudentId(e.target.value);
                      setStatus("all");
                    }}
                  >
                    {!students.length && (
                      <option value="">Ученики не найдены</option>
                    )}
                    {students.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}
            <label className="progress-archive">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => {
                  setIncludeArchived(e.target.checked);
                  setStatus("all");
                }}
              />
              Включить архив
            </label>
            <button
              className="button secondary"
              onClick={exportCsv}
              disabled={!rows.length}
            >
              <Download size={16} />
              Скачать CSV
            </button>
          </div>
          {!student ? (
            <section className="panel">
              <EmptyState
                title="Ученики не найдены"
                description="Измените поиск или выберите другую группу. Если учеников ещё нет, попросите менеджера или администратора пригласить их."
              />
            </section>
          ) : (
            <>
              <section
                className="panel progress-summary"
                aria-label={`Прогресс: ${student.name}`}
              >
                <div className="progress-identity">
                  <Avatar user={student} />
                  <div>
                    <span className="progress-eyebrow">
                      Индивидуальный прогресс
                    </span>
                    <h2>{student.name}</h2>
                    <p>
                      {data.groups
                        .filter((g) => g.studentIds.includes(student.id))
                        .map((g) => g.name)
                        .join(" · ") || "Без группы"}
                    </p>
                  </div>
                </div>
                <div className="progress-completion">
                  <div>
                    <strong>
                      Сдано {progress.submitted} из {progress.total}
                    </strong>
                    <span>{progress.completion}%</span>
                  </div>
                  <progress
                    aria-label="Доля сданных заданий"
                    value={progress.submitted}
                    max={progress.total || 1}
                  />
                  <p>
                    {includeArchived
                      ? "Все назначенные задания, включая архив"
                      : "Назначенные задания без архива"}
                  </p>
                </div>
                <dl className="progress-metrics">
                  <div>
                    <dt>Проверено</dt>
                    <dd>
                      {progress.reviewed}
                      <small>из {progress.total}</small>
                    </dd>
                  </div>
                  <div>
                    <dt>На проверке</dt>
                    <dd>{progress.pending}</dd>
                  </div>
                  <div>
                    <dt>Просрочено</dt>
                    <dd>{progress.overdue}</dd>
                  </div>
                  <div>
                    <dt>Средний результат</dt>
                    <dd>
                      {progress.average === null ? "—" : `${progress.average}%`}
                    </dd>
                  </div>
                </dl>
                <p className="progress-explanation">
                  Средний результат — среднее процентов по проверенным работам.
                  Несданные задания не снижают оценку.
                </p>
              </section>
              <section
                className="panel progress-assignments"
                aria-labelledby="individual-assignments-title"
              >
                <header>
                  <div>
                    <h2 id="individual-assignments-title">Личные задания</h2>
                    <p>
                      {taskCount(progress.total)} · только назначенные{" "}
                      {teacher ? "этому ученику" : "вам"}
                    </p>
                  </div>
                  <label>
                    Статус
                    <select
                      value={status}
                      onChange={(e) =>
                        setStatus(e.target.value as typeof status)
                      }
                    >
                      <option value="all">Все статусы</option>
                      {Object.entries(progressLabels)
                        .filter(
                          ([key]) => key !== "archived" || includeArchived,
                        )
                        .map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                    </select>
                  </label>
                </header>
                {!rows.length ? (
                  <EmptyState
                    title={
                      progress.total
                        ? "Нет заданий с таким статусом"
                        : "Заданий пока нет"
                    }
                    description={
                      progress.total
                        ? "Выберите другой статус, чтобы увидеть остальные работы."
                        : "Здесь появятся задания, назначенные этому ученику. Архивные работы можно включить выше."
                    }
                  />
                ) : (
                  <div className="table-scroll">
                    <table className="individual-assignments-table">
                      <thead>
                        <tr>
                          <th scope="col">Задание</th>
                          <th scope="col">Срок / сдача</th>
                          <th scope="col">Статус</th>
                          <th scope="col">Результат</th>
                          <th scope="col">Комментарий</th>
                          <th scope="col">
                            <span className="sr-only">Открыть</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map(
                          ({ assignment: a, submission: s, status }) => (
                            <tr key={a.id}>
                              <td>
                                <button
                                  className="progress-assignment-title"
                                  onClick={() =>
                                    s ? onReview(s) : onAssignment(a)
                                  }
                                >
                                  {a.title}
                                </button>
                                <small>
                                  {a.subject}
                                  {a.archived ? " · В архиве" : ""}
                                </small>
                              </td>
                              <td>
                                <span>{fullDate(a.deadline)}</span>
                                <small>
                                  {s
                                    ? `Сдано ${fullDate(s.submittedAt)}`
                                    : "Ещё не сдано"}
                                </small>
                              </td>
                              <td>
                                {status === "new" ? (
                                  <span className="status new">
                                    <i />
                                    Не сдано
                                  </span>
                                ) : (
                                  <Status
                                    status={status}
                                    overdue={status === "overdue"}
                                  />
                                )}
                              </td>
                              <td>
                                <strong>
                                  {s?.status === "reviewed" &&
                                  s.score !== undefined
                                    ? `${s.score} / ${a.maxScore}`
                                    : "—"}
                                </strong>
                                {s?.status === "reviewed" &&
                                  s.score !== undefined && (
                                    <small>
                                      {Math.round((s.score / a.maxScore) * 100)}
                                      %
                                    </small>
                                  )}
                              </td>
                              <td>
                                <p className="progress-feedback">
                                  {s?.feedback ||
                                    (s?.status === "pending"
                                      ? "Ожидает проверки"
                                      : "—")}
                                </p>
                              </td>
                              <td>
                                <button
                                  className="icon-button"
                                  aria-label={`${s ? "Открыть работу" : "Открыть задание"}: ${a.title}`}
                                  onClick={() =>
                                    s ? onReview(s) : onAssignment(a)
                                  }
                                >
                                  <ArrowUpRight size={18} />
                                </button>
                              </td>
                            </tr>
                          ),
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
