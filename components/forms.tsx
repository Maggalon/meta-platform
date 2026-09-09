"use client";
import { useState } from "react";
import {
  ArrowUpRight,
  Copy,
  Check,
  Link2,
  Archive,
  BookOpen,
  Clock3,
  Users,
  Send,
  ChevronRight,
} from "lucide-react";
import type {
  AppData,
  Assignment,
  Submission,
  Group,
  SafeUser,
} from "@/lib/types";
import {
  api,
  Avatar,
  FileLinks,
  UploadZone,
  SubmitButton,
  Status,
  dateLabel,
  timeLabel,
  type Uploaded,
} from "./ui";

type FormProps = { data: AppData; onDone: (message: string) => Promise<void> };
const localDateTime = (offset = 1) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  d.setHours(18, 0, 0, 0);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
};
export function AssignmentForm({ data, onDone }: FormProps) {
  const [selected, setSelected] = useState<string[]>([]),
    [files, setFiles] = useState<Uploaded[]>([]),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const students = data.users.filter((u) => u.role === "student");
  function toggle(id: string) {
    setSelected(
      selected.includes(id)
        ? selected.filter((s) => s !== id)
        : [...selected, id],
    );
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!selected.length) {
      setError("Выберите хотя бы одного ученика");
      return;
    }
    const f = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api("assignments", {
        title: f.get("title"),
        description: f.get("description"),
        subject: f.get("subject"),
        deadline: new Date(f.get("deadline") as string).toISOString(),
        questions: Number(f.get("questions")),
        maxScore: Number(f.get("maxScore")),
        studentIds: selected,
        fileIds: files.map((f) => f.id),
      });
      await onDone("Задание создано и назначено ученикам");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="standard-form" onSubmit={submit}>
      <label>
        Название задания
        <input
          name="title"
          required
          maxLength={200}
          placeholder="Например, Производная и её применение"
          autoFocus
        />
      </label>
      <label>
        Описание и условия
        <textarea
          name="description"
          required
          maxLength={20000}
          rows={5}
          placeholder="Что нужно сделать? Добавьте условия, пояснения и рекомендации."
        />
      </label>
      <div className="form-grid">
        <label>
          Предмет
          <input name="subject" defaultValue="Математика" required />
        </label>
        <label>
          Дедлайн
          <input
            name="deadline"
            type="datetime-local"
            required
            defaultValue={localDateTime(3)}
          />
        </label>
        <label>
          Количество заданий
          <input
            name="questions"
            type="number"
            min={1}
            max={100}
            defaultValue={8}
            required
          />
        </label>
        <label>
          Максимальный балл
          <input
            name="maxScore"
            type="number"
            min={1}
            max={100}
            defaultValue={10}
            required
          />
        </label>
      </div>
      <div className="field-group">
        <label>Материалы к заданию</label>
        <UploadZone kind="material" onChange={setFiles} onBusy={setUploading} />
      </div>
      <div className="field-group">
        <div className="field-heading">
          <label>
            Кому назначить{" "}
            <span className="count-badge">{selected.length}</span>
          </label>
          <button
            className="text-button"
            type="button"
            onClick={() =>
              setSelected(
                selected.length === students.length
                  ? []
                  : students.map((u) => u.id),
              )
            }
          >
            {selected.length === students.length
              ? "Снять выбор"
              : "Выбрать всех"}
          </button>
        </div>
        <div className="group-select-chips">
          {data.groups.map((g) => (
            <button
              type="button"
              key={g.id}
              className={
                g.studentIds.every((id) => selected.includes(id)) &&
                g.studentIds.length
                  ? "selected"
                  : ""
              }
              onClick={() => {
                const all = g.studentIds.every((id) => selected.includes(id));
                setSelected(
                  all
                    ? selected.filter((id) => !g.studentIds.includes(id))
                    : [...new Set([...selected, ...g.studentIds])],
                );
              }}
            >
              <Users size={13} />
              {g.name}
            </button>
          ))}
        </div>
        <div className="student-picker">
          {students.map((u) => (
            <label className="student-option" key={u.id}>
              <input
                type="checkbox"
                checked={selected.includes(u.id)}
                onChange={() => toggle(u.id)}
              />
              <Avatar user={u} size="small" />
              <span>{u.name}</span>
            </label>
          ))}
        </div>
        {!students.length && (
          <p className="muted">
            Сначала пригласите ученика в разделе «Ученики».
          </p>
        )}
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <span>Ученики увидят задание в своём кабинете</span>
        <SubmitButton busy={busy || uploading}>Создать задание</SubmitButton>
      </div>
    </form>
  );
}
function SubmissionResult({
  submission,
  data,
}: {
  submission: Submission;
  data: AppData;
}) {
  const a = data.assignments.find((a) => a.id === submission.assignmentId)!;
  return (
    <div className="submission-result">
      <div className="result-heading">
        <div>
          <span className="eyebrow">ВАШ РЕЗУЛЬТАТ</span>
          <h3>
            {submission.score}
            <span> / {a.maxScore} баллов</span>
          </h3>
        </div>
        <Status status="reviewed" />
      </div>
      <h4>Комментарий преподавателя</h4>
      <p className="preserve-lines">{submission.feedback}</p>
      <FileLinks ids={submission.reviewFileIds} data={data} />
      {submission.reviewedAt && (
        <small className="muted">
          Проверено {dateLabel(submission.reviewedAt)} в{" "}
          {timeLabel(submission.reviewedAt)}
        </small>
      )}
    </div>
  );
}
export function AssignmentDetails({
  assignment: a,
  data,
  onDone,
  onReview,
}: FormProps & { assignment: Assignment; onReview: (s: Submission) => void }) {
  const [files, setFiles] = useState<Uploaded[]>([]),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const teacher = data.user.role === "teacher",
    submission = data.submissions.find(
      (s) => s.assignmentId === a.id && s.studentId === data.user.id,
    );
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("submissions", {
        assignmentId: a.id,
        answers: f.get("answers") || "",
        fileIds: files.map((f) => f.id),
      });
      await onDone("Работа отправлена на проверку");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    setBusy(true);
    setError("");
    try {
      await api("assignments/archive", { id: a.id, archived: !a.archived });
      await onDone(
        a.archived ? "Задание восстановлено" : "Задание перенесено в архив",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="assignment-details">
      <div className="detail-meta">
        <span>
          <BookOpen size={15} />
          {a.subject}
        </span>
        <span>
          <Clock3 size={15} />
          До {dateLabel(a.deadline)}, {timeLabel(a.deadline)}
        </span>
        <span>{a.maxScore} баллов</span>
      </div>
      <div className="assignment-description preserve-lines">
        {a.description}
      </div>
      <FileLinks ids={a.fileIds} data={data} />
      {teacher ? (
        <div className="assignment-students">
          <div className="field-heading">
            <h3>Работы учеников</h3>
            <span className="muted">
              {data.submissions.filter((s) => s.assignmentId === a.id).length}{" "}
              из {a.studentIds.length} сдано
            </span>
          </div>
          {a.studentIds.map((id) => {
            const u = data.users.find((u) => u.id === id)!;
            const s = data.submissions.find(
              (s) => s.assignmentId === a.id && s.studentId === id,
            );
            return (
              <div className="assignment-student-row" key={id}>
                <Avatar user={u} size="small" />
                <strong>{u.name}</strong>
                <Status
                  status={s?.status || "new"}
                  overdue={!s && new Date(a.deadline) < new Date()}
                />
                {s && (
                  <button
                    className="icon-button"
                    onClick={() => onReview(s)}
                    aria-label={`Открыть работу ${u.name}`}
                  >
                    <ArrowUpRight size={17} />
                  </button>
                )}
              </div>
            );
          })}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={archive}
            >
              <Archive size={15} />
              {a.archived ? "Восстановить из архива" : "В архив"}
            </button>
          </div>
        </div>
      ) : submission ? (
        <>
          <div className="submitted-work">
            <div className="field-heading">
              <h3>Ваше решение</h3>
              <Status status={submission.status} />
            </div>
            <p className="preserve-lines">{submission.answers}</p>
            <FileLinks ids={submission.fileIds} data={data} />
            <small className="muted">
              Отправлено {dateLabel(submission.submittedAt)} в{" "}
              {timeLabel(submission.submittedAt)}
            </small>
          </div>
          {submission.status === "reviewed" ? (
            <SubmissionResult submission={submission} data={data} />
          ) : (
            <div className="soft-notice">
              <Clock3 size={19} />
              <div>
                <strong>Преподаватель скоро проверит вашу работу</strong>
                <p>Результат и комментарий появятся здесь.</p>
              </div>
            </div>
          )}
        </>
      ) : a.archived ? (
        <div className="soft-notice">
          Это задание в архиве. Приём решений завершён.
        </div>
      ) : (
        <form className="standard-form submission-form" onSubmit={submit}>
          <h3>Ваше решение</h3>
          {new Date(a.deadline) < new Date() && (
            <p className="late-notice">
              Дедлайн уже прошёл, но вы ещё можете сдать работу.
            </p>
          )}
          <label>
            Краткие ответы и пояснения
            <textarea
              name="answers"
              rows={6}
              maxLength={30000}
              placeholder={
                "1. Ответ на первое задание\n2. Ответ на второе задание\n\nПри необходимости поясните ход решения."
              }
            />
          </label>
          <div className="field-group">
            <label>Файлы решения</label>
            <UploadZone
              kind="submission"
              onChange={setFiles}
              onBusy={setUploading}
            />
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <span>Проверьте ответы перед отправкой</span>
            <SubmitButton busy={busy || uploading}>
              Отправить на проверку
            </SubmitButton>
          </div>
        </form>
      )}
      {teacher && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
export function ReviewForm({
  submission: s,
  data,
  onDone,
}: FormProps & { submission: Submission }) {
  const [files, setFiles] = useState<Uploaded[]>([]),
    [busy, setBusy] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const assignment = data.assignments.find((a) => a.id === s.assignmentId)!,
    student = data.users.find((u) => u.id === s.studentId)!;
  const teacher = data.user.role === "teacher";
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("reviews", {
        submissionId: s.id,
        score: Number(f.get("score")),
        feedback: f.get("feedback"),
        fileIds: [...s.reviewFileIds, ...files.map((f) => f.id)],
      });
      await onDone("Результат опубликован и доступен ученику");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="review-work">
      <div className="review-person">
        <Avatar user={student} />
        <div>
          <strong>{student.name}</strong>
          <small>
            Сдано {dateLabel(s.submittedAt)} в {timeLabel(s.submittedAt)}
          </small>
        </div>
        <Status status={s.status} />
      </div>
      <div className="review-work-grid">
        <div className="work-content">
          <h3>{assignment.title}</h3>
          <details className="task-conditions">
            <summary>
              Условия задания
              <ChevronRight size={16} />
            </summary>
            <p className="preserve-lines">{assignment.description}</p>
            <FileLinks ids={assignment.fileIds} data={data} />
          </details>
          <h4>Ответы ученика</h4>
          <div className="answer-paper preserve-lines">
            {s.answers || "Решение прикреплено в файлах ниже."}
          </div>
          <FileLinks ids={s.fileIds} data={data} />
          {s.fileIds.map((id) => {
            const f = data.files.find((f) => f.id === id);
            return f?.mime.startsWith("image/") ? (
              <a
                href={`/api/files/${id}`}
                target="_blank"
                rel="noreferrer"
                key={id}
              >
                <img
                  className="solution-image"
                  src={`/api/files/${id}`}
                  alt={f.name}
                  loading="lazy"
                />
              </a>
            ) : f?.mime === "application/pdf" ? (
              <iframe
                key={id}
                title={f.name}
                className="solution-pdf"
                src={`/api/files/${id}`}
              />
            ) : null;
          })}
        </div>
        {teacher ? (
          <form
            onSubmit={submit}
            className="standard-form review-feedback-form"
          >
            <h3>
              {s.status === "reviewed"
                ? "Опубликованная рецензия"
                : "Обратная связь"}
            </h3>
            <label>
              Баллы
              <div className="score-input">
                <input
                  name="score"
                  type="number"
                  min={0}
                  max={assignment.maxScore}
                  defaultValue={s.score ?? ""}
                  required
                  placeholder="0"
                />
                <span>из {assignment.maxScore}</span>
              </div>
            </label>
            <label>
              Рецензия
              <textarea
                name="feedback"
                required
                maxLength={20000}
                rows={8}
                defaultValue={s.feedback || ""}
                placeholder="Отметьте, что получилось, и подскажите, над чем стоит поработать."
              />
            </label>
            <div className="field-group">
              <label>Проверенный файл с замечаниями</label>
              <FileLinks ids={s.reviewFileIds} data={data} />
              <UploadZone
                kind="review"
                onChange={setFiles}
                onBusy={setUploading}
              />
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <SubmitButton busy={busy || uploading}>
              {s.status === "reviewed"
                ? "Обновить результат"
                : "Опубликовать результат"}
            </SubmitButton>
            <p className="muted centered">
              Ученик увидит баллы, рецензию и ваши файлы.
            </p>
          </form>
        ) : s.status === "reviewed" ? (
          <SubmissionResult submission={s} data={data} />
        ) : (
          <div className="soft-notice">
            <Clock3 size={22} />
            <p>Работа на проверке. Здесь скоро появится обратная связь.</p>
          </div>
        )}
      </div>
    </div>
  );
}
export function InviteForm({ data }: Pick<FormProps, "data">) {
  const [url, setUrl] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const result = await api<{ url: string }>("invites", {
        email: f.get("email") || "",
        groupId: f.get("groupId") || undefined,
      });
      setUrl(result.url);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setError(
        "Не удалось скопировать автоматически. Выделите и скопируйте ссылку ниже.",
      );
    }
  }
  return url ? (
    <div className="invite-result">
      <div className="invite-symbol">
        <Link2 size={31} />
      </div>
      <h3>Первый шаг к большим результатам</h3>
      <p>
        Передайте ссылку ученику. По ней он создаст аккаунт и получит доступ к
        платформе.
      </p>
      <label>
        Персональная пригласительная ссылка
        <input readOnly value={url} onFocus={(e) => e.target.select()} />
      </label>
      <button className="button primary" onClick={copy}>
        {copied ? <Check size={16} /> : <Copy size={16} />}{" "}
        {copied ? "Ссылка скопирована" : "Скопировать ссылку"}
      </button>
      <small>Одно приглашение — один ученик. Срок действия: 7 дней.</small>
      {error && <p className="form-error">{error}</p>}
    </div>
  ) : (
    <form className="standard-form" onSubmit={submit}>
      <div className="soft-notice">
        <Users size={23} />
        <p>
          Вход на платформу — только по вашему приглашению. Ученик сам задаст
          пароль при регистрации.
        </p>
      </div>
      <label>
        Email ученика <span className="optional">необязательно</span>
        <input type="email" name="email" placeholder="student@example.ru" />
        <small>Регистрация будет доступна только с указанным email.</small>
      </label>
      <label>
        Добавить в группу
        <select name="groupId">
          <option value="">Без группы</option>
          {data.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <SubmitButton busy={busy}>Создать приглашение</SubmitButton>
      </div>
    </form>
  );
}
export function GroupForm({
  data,
  onDone,
  group,
}: FormProps & { group?: Group }) {
  const [selected, setSelected] = useState(group?.studentIds || []),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("groups", {
        id: group?.id,
        name: f.get("name"),
        description: f.get("description"),
        color: f.get("color"),
        studentIds: selected,
      });
      await onDone(group ? "Группа обновлена" : "Группа создана");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="standard-form" onSubmit={submit}>
      <label>
        Название группы
        <input
          name="name"
          required
          maxLength={200}
          defaultValue={group?.name}
          placeholder="Например, Профиль · 90+"
        />
      </label>
      <label>
        Описание
        <textarea
          name="description"
          rows={3}
          maxLength={1000}
          defaultValue={group?.description}
          placeholder="Направление подготовки, цели и особенности группы"
        />
      </label>
      <label>
        Цвет группы
        <select name="color" defaultValue={group?.color || "green"}>
          <option value="green">Шалфей</option>
          <option value="peach">Тёплый персик</option>
          <option value="purple">Лаванда</option>
          <option value="blue">Небесный</option>
        </select>
      </label>
      <div className="field-group">
        <label>Ученики в группе</label>
        <div className="student-picker">
          {data.users
            .filter((u) => u.role === "student")
            .map((u) => (
              <label className="student-option" key={u.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(u.id)}
                  onChange={() =>
                    setSelected(
                      selected.includes(u.id)
                        ? selected.filter((id) => id !== u.id)
                        : [...selected, u.id],
                    )
                  }
                />
                <Avatar user={u} size="small" />
                <span>{u.name}</span>
              </label>
            ))}
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <SubmitButton busy={busy}>
          {group ? "Сохранить изменения" : "Создать группу"}
        </SubmitButton>
      </div>
    </form>
  );
}
export function LessonForm({ data, onDone }: FormProps) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("lessons", {
        title: f.get("title"),
        groupId: f.get("groupId"),
        startsAt: new Date(f.get("startsAt") as string).toISOString(),
        duration: Number(f.get("duration")),
        location: f.get("location"),
      });
      await onDone("Занятие добавлено в расписание");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="standard-form" onSubmit={submit}>
      <label>
        Тема занятия
        <input
          name="title"
          required
          maxLength={200}
          placeholder="Например, Разбор пробного варианта"
        />
      </label>
      <label>
        Группа
        <select name="groupId" required>
          <option value="">Выберите группу</option>
          {data.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </label>
      <div className="form-grid">
        <label>
          Дата и время
          <input
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={localDateTime()}
          />
        </label>
        <label>
          Длительность, мин
          <input
            type="number"
            name="duration"
            min={15}
            max={360}
            step={15}
            defaultValue={90}
            required
          />
        </label>
      </div>
      <label>
        Место или ссылка на встречу
        <input
          name="location"
          maxLength={300}
          placeholder="https://… или адрес учебной комнаты"
          defaultValue="Онлайн · учебная комната"
        />
      </label>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <div className="form-actions">
        <SubmitButton busy={busy}>Добавить занятие</SubmitButton>
      </div>
    </form>
  );
}
export function StudentProfile({
  student: u,
  data,
  onReview,
}: Pick<FormProps, "data"> & {
  student: SafeUser;
  onReview: (s: Submission) => void;
}) {
  const submissions = data.submissions
    .filter((s) => s.studentId === u.id)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const groups = data.groups.filter((g) => g.studentIds.includes(u.id));
  const lessons = data.lessons
    .filter(
      (l) =>
        groups.some((g) => g.id === l.groupId) &&
        new Date(l.startsAt) > new Date(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  return (
    <div className="student-profile">
      <div className="student-profile-heading">
        <Avatar user={u} size="large" />
        <div>
          <h3>{u.name}</h3>
          <p>{u.email}</p>
          <div className="group-labels">
            {groups.map((g) => (
              <span key={g.id} className={`group-tag ${g.color}`}>
                {g.name}
              </span>
            ))}
          </div>
        </div>
      </div>
      <h3>Ближайшие занятия</h3>
      {lessons.length ? (
        lessons.slice(0, 3).map((l) => (
          <div className="profile-lesson" key={l.id}>
            <Clock3 size={17} />
            <div>
              <strong>{l.title}</strong>
              <small>
                {dateLabel(l.startsAt)} в {timeLabel(l.startsAt)} · {l.duration}{" "}
                мин
              </small>
            </div>
          </div>
        ))
      ) : (
        <p className="muted">Занятия пока не запланированы</p>
      )}
      <h3>Сданные работы</h3>
      {submissions.length ? (
        submissions.map((s) => (
          <button
            className="profile-submission"
            key={s.id}
            onClick={() => onReview(s)}
          >
            <div>
              <strong>
                {data.assignments.find((a) => a.id === s.assignmentId)?.title}
              </strong>
              <small>{dateLabel(s.submittedAt)}</small>
            </div>
            <Status status={s.status} />
            <ArrowUpRight size={17} />
          </button>
        ))
      ) : (
        <p className="muted">Ученик ещё не сдавал работы</p>
      )}
    </div>
  );
}
