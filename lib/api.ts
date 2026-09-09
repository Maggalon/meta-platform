import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { withDb, isDemo } from "./db";
import {
  canReadFile,
  hashPassword,
  verifyPassword,
  newToken,
  tokenHash,
  safeUser,
  validateFile,
} from "./security";
import { storeFile, downloadFile } from "./storage";
import type { Database, User, AppData, Attachment } from "./types";
z.config(z.locales.ru());

const COOKIE = "meta_education_session";
const LEGACY_COOKIE = "tochka_session";
const LOGGED_OUT = "meta_education_logged_out";
const LEGACY_LOGGED_OUT = "tochka_logged_out";
async function sessionToken() {
  const jar = await cookies();
  return jar.get(COOKIE)?.value || jar.get(LEGACY_COOKIE)?.value;
}
async function clearLoggedOut() {
  const jar = await cookies();
  jar.delete(LOGGED_OUT);
  jar.delete(LEGACY_LOGGED_OUT);
}
class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const fail = (status: number, message: string): never => {
  throw new HttpError(status, message);
};
const id = () => randomUUID();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const originFor = (request: Request) => {
  const url = new URL(request.url);
  return process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : `${url.protocol}//${request.headers.get("host") || url.host}`;
};
const nonempty = z.string().trim().min(1).max(200);
const ids = z.array(z.string().max(100)).max(200);
const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(200),
});
const assignmentSchema = z.object({
  title: nonempty,
  description: z.string().trim().min(1).max(20000),
  subject: nonempty.default("Математика"),
  deadline: z.iso.datetime({ offset: true }),
  studentIds: ids.min(1),
  fileIds: ids.default([]),
  maxScore: z.number().int().min(1).max(100),
  questions: z.number().int().min(1).max(100).default(1),
});

async function createSession(db: Database, userId: string) {
  const token = newToken();
  const expires = new Date(Date.now() + 7 * 86400000);
  db.sessions = db.sessions.filter(
    (s) => new Date(s.expiresAt).getTime() > Date.now(),
  );
  db.sessions.push({
    id: tokenHash(token),
    userId,
    expiresAt: expires.toISOString(),
  });
  (await cookies()).delete(LEGACY_COOKIE);
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production" && !isDemo(),
    sameSite: "lax",
    path: "/",
    expires,
  });
}
async function getUser(db: Database, bootstrap = false): Promise<User> {
  const token = await sessionToken();
  const session =
    token &&
    db.sessions.find(
      (s) =>
        s.id === tokenHash(token) &&
        new Date(s.expiresAt).getTime() > Date.now(),
    );
  let user = session
    ? db.users.find((u) => u.id === session.userId)
    : undefined;
  if (
    !user &&
    bootstrap &&
    isDemo() &&
    (await cookies()).get(LOGGED_OUT)?.value !== "1" &&
    (await cookies()).get(LEGACY_LOGGED_OUT)?.value !== "1"
  ) {
    user = db.users.find((u) => u.role === "teacher");
    if (user) await createSession(db, user.id);
  }
  return user || fail(401, "Войдите в аккаунт, чтобы продолжить");
}
function teacher(user: User) {
  if (user.role !== "teacher") fail(403, "Доступно только преподавателю");
}
function studentsExist(db: Database, values: string[]) {
  if (
    new Set(values).size !== values.length ||
    values.some(
      (s) => !db.users.some((u) => u.id === s && u.role === "student"),
    )
  )
    fail(400, "Проверьте список учеников");
}
function validateAttachments(
  db: Database,
  user: User,
  fileIds: string[],
  kind: Attachment["kind"],
) {
  if (
    fileIds.some(
      (id) =>
        !db.files.some(
          (f) => f.id === id && f.ownerId === user.id && f.kind === kind,
        ),
    )
  )
    fail(403, "Нет доступа к одному из вложений");
}
function appData(db: Database, user: User): AppData {
  const admin = user.role === "teacher";
  const groups = db.groups.filter(
    (g) => admin || g.studentIds.includes(user.id),
  );
  return {
    user: safeUser(user),
    users: db.users
      .filter((u) => admin || u.id === user.id || u.role === "teacher")
      .map(safeUser),
    groups: groups.map((g) => (admin ? g : { ...g, studentIds: [user.id] })),
    assignments: db.assignments
      .filter((a) => admin || a.studentIds.includes(user.id))
      .map((a) => (admin ? a : { ...a, studentIds: [user.id] })),
    submissions: db.submissions.filter((s) => admin || s.studentId === user.id),
    files: db.files
      .filter((f) => canReadFile(db, user, f.id))
      .map(({ key: _, storage: __, ...f }) => f),
    lessons: db.lessons.filter(
      (l) => admin || groups.some((g) => g.id === l.groupId),
    ),
    demo: isDemo(),
  };
}
async function limitedBody(request: Request, limit: number): Promise<Buffer> {
  if (Number(request.headers.get("content-length")) > limit)
    fail(413, "Файл слишком большой. Максимум — 20 МБ");
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const parts: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel();
      fail(413, "Превышен допустимый размер запроса");
    }
    parts.push(value);
  }
  return Buffer.concat(parts);
}
async function body(request: Request) {
  try {
    return JSON.parse((await limitedBody(request, 256 * 1024)).toString());
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return fail(400, "Некорректный запрос");
  }
}

export async function handleApi(request: Request, route: string[]) {
  try {
    const endpoint = route.join("/");
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      const allowed = originFor(request);
      if (!origin || origin !== allowed)
        fail(403, "Запрос с другого сайта отклонён");
    }
    if (endpoint === "data" && request.method === "GET")
      return await withDb(async (db) =>
        json(appData(db, await getUser(db, true))),
      );
    if (endpoint === "auth/invite" && request.method === "GET") {
      const token = new URL(request.url).searchParams.get("token") || "";
      return await withDb((db) => {
        const invite = db.invites.find(
          (i) =>
            i.tokenHash === tokenHash(token) &&
            !i.usedAt &&
            new Date(i.expiresAt).getTime() > Date.now(),
        );
        if (!invite)
          return json(
            {
              error: "Приглашение недействительно или срок его действия истёк",
            },
            400,
          );
        return json({
          email: invite.email,
          group: db.groups.find((g) => g.id === invite.groupId)?.name,
        });
      }, false);
    }
    if (endpoint === "auth/login" && request.method === "POST") {
      const input = loginSchema.parse(await body(request));
      return await withDb(async (db) => {
        const email = input.email.trim().toLowerCase();
        const keys = [`email:${tokenHash(email)}`];
        if (process.env.TRUST_PROXY === "true")
          keys.push(
            `ip:${tokenHash(request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown")}`,
          );
        db.loginAttempts = db.loginAttempts.filter(
          (a) => new Date(a.resetAt).getTime() > Date.now(),
        );
        if (
          keys.some((key) =>
            db.loginAttempts.some((a) => a.id === key && a.count >= 10),
          )
        )
          return json(
            { error: "Слишком много попыток. Попробуйте через 15 минут" },
            429,
          );
        const user = db.users.find((u) => u.email.toLowerCase() === email);
        // Always compute a password hash to avoid a fast unknown-account branch.
        const valid = user
          ? verifyPassword(input.password, user.passwordHash)
          : (hashPassword(input.password), false);
        if (!valid || !user) {
          for (const key of keys) {
            const attempt = db.loginAttempts.find((a) => a.id === key);
            if (attempt) attempt.count++;
            else
              db.loginAttempts.push({
                id: key,
                count: 1,
                resetAt: new Date(Date.now() + 900000).toISOString(),
              });
          }
          return json({ error: "Неверный email или пароль" }, 401);
        }
        db.loginAttempts = db.loginAttempts.filter((a) => !keys.includes(a.id));
        await clearLoggedOut();
        await createSession(db, user.id);
        return json({ user: safeUser(user) });
      });
    }
    if (endpoint === "auth/register" && request.method === "POST") {
      const input = loginSchema
        .extend({
          name: nonempty,
          token: z.string().min(20).max(200),
          password: z
            .string()
            .min(12, "Пароль должен содержать минимум 12 символов")
            .max(200),
        })
        .parse(await body(request));
      return await withDb(async (db) => {
        const email = input.email.trim().toLowerCase();
        const invite = db.invites.find(
          (i) =>
            i.tokenHash === tokenHash(input.token) &&
            !i.usedAt &&
            new Date(i.expiresAt).getTime() > Date.now(),
        );
        if (!invite)
          return fail(400, "Приглашение недействительно или уже использовано");
        if (invite.email && invite.email.toLowerCase() !== email)
          fail(400, "Приглашение предназначено для другого email");
        if (db.users.some((u) => u.email.toLowerCase() === email))
          fail(409, "Аккаунт с таким email уже существует");
        const user: User = {
          id: id(),
          name: input.name,
          email,
          role: "student",
          passwordHash: hashPassword(input.password),
          color: "sage",
          createdAt: new Date().toISOString(),
        };
        db.users.push(user);
        invite.usedAt = new Date().toISOString();
        const group = db.groups.find((g) => g.id === invite.groupId);
        if (group) group.studentIds.push(user.id);
        await clearLoggedOut();
        await createSession(db, user.id);
        return json({ user: safeUser(user) }, 201);
      });
    }
    if (endpoint === "auth/logout" && request.method === "POST")
      return await withDb(async (db) => {
        const token = await sessionToken();
        if (token)
          db.sessions = db.sessions.filter((s) => s.id !== tokenHash(token));
        (await cookies()).delete(COOKIE);
        (await cookies()).delete(LEGACY_COOKIE);
        (await cookies()).delete(LEGACY_LOGGED_OUT);
        (await cookies()).set(LOGGED_OUT, "1", {
          httpOnly: true,
          sameSite: "lax",
          path: "/",
        });
        return json({ ok: true });
      });
    if (endpoint === "auth/demo" && request.method === "POST") {
      if (!isDemo()) fail(404, "Страница не найдена");
      const input = z
        .object({ role: z.enum(["teacher", "student"]) })
        .parse(await body(request));
      return await withDb(async (db) => {
        const user =
          db.users.find(
            (u) =>
              u.id === (input.role === "teacher" ? "teacher" : "student-1"),
          ) || fail(404, "Демоаккаунт не найден");
        await clearLoggedOut();
        await createSession(db, user.id);
        return json({ user: safeUser(user) });
      });
    }
    if (
      route[0] === "files" &&
      route.length === 2 &&
      request.method === "GET"
    ) {
      const file = await withDb(async (db) => {
        const user = await getUser(db);
        if (!canReadFile(db, user, route[1])) fail(404, "Файл не найден");
        return db.files.find((f) => f.id === route[1])!;
      }, false);
      return await downloadFile(file);
    }
    if (endpoint === "files" && request.method === "POST") {
      const user = await withDb((db) => getUser(db), false);
      const bytes = await limitedBody(request, 21 * 1024 * 1024);
      const form = await new Request(request.url, {
        method: "POST",
        headers: { "content-type": request.headers.get("content-type") || "" },
        body: new Uint8Array(bytes),
      }).formData();
      const file = form.get("file");
      if (!(file instanceof File)) fail(400, "Выберите файл");
      const upload = file as File;
      const kind = z
        .enum(["material", "submission", "review"])
        .parse(form.get("kind"));
      if (kind !== "submission") teacher(user);
      const buffer = Buffer.from(await upload.arrayBuffer());
      if (!validateFile(buffer, upload.type, upload.size))
        fail(400, "Допустимы настоящие JPG, PNG и PDF до 20 МБ");
      const fileId = id();
      const storage = await storeFile(fileId, buffer, upload.type);
      const record: Attachment = {
        id: fileId,
        ownerId: user.id,
        name: upload.name.replace(/[\r\n]/g, "").slice(0, 200),
        mime: upload.type,
        size: upload.size,
        key: fileId,
        kind,
        storage,
      };
      await withDb((db) => {
        db.files.push(record);
      });
      return json(
        {
          id: record.id,
          name: record.name,
          size: record.size,
          mime: record.mime,
        },
        201,
      );
    }
    if (request.method !== "POST") fail(404, "Страница не найдена");
    const input = await body(request);
    return await withDb(async (db) => {
      const user = await getUser(db);
      if (endpoint === "assignments") {
        teacher(user);
        const data = assignmentSchema.parse(input);
        studentsExist(db, data.studentIds);
        validateAttachments(db, user, data.fileIds, "material");
        const assignment = {
          ...data,
          id: id(),
          createdAt: new Date().toISOString(),
          archived: false,
        };
        db.assignments.unshift(assignment);
        return json(assignment, 201);
      }
      if (endpoint === "assignments/archive") {
        teacher(user);
        const data = z
          .object({ id: nonempty, archived: z.boolean() })
          .parse(input);
        const assignment =
          db.assignments.find((a) => a.id === data.id) ||
          fail(404, "Задание не найдено");
        assignment.archived = data.archived;
        return json({ ok: true });
      }
      if (endpoint === "submissions") {
        if (user.role !== "student")
          fail(403, "Сдавать работы могут только ученики");
        const data = z
          .object({
            assignmentId: nonempty,
            answers: z.string().trim().max(30000),
            fileIds: ids.default([]),
          })
          .parse(input);
        if (!data.answers && !data.fileIds.length)
          fail(400, "Введите ответ или приложите решение");
        const assignment =
          db.assignments.find(
            (a) =>
              a.id === data.assignmentId &&
              a.studentIds.includes(user.id) &&
              !a.archived,
          ) || fail(404, "Задание не найдено");
        if (
          db.submissions.some(
            (s) => s.assignmentId === assignment.id && s.studentId === user.id,
          )
        )
          fail(409, "Работа уже отправлена на проверку");
        validateAttachments(db, user, data.fileIds, "submission");
        const submission = {
          ...data,
          id: id(),
          studentId: user.id,
          submittedAt: new Date().toISOString(),
          status: "pending" as const,
          reviewFileIds: [],
        };
        db.submissions.push(submission);
        return json(submission, 201);
      }
      if (endpoint === "reviews") {
        teacher(user);
        const data = z
          .object({
            submissionId: nonempty,
            score: z.number().int().min(0),
            feedback: z.string().trim().min(1, "Напишите рецензию").max(20000),
            fileIds: ids.default([]),
          })
          .parse(input);
        const submission =
          db.submissions.find((s) => s.id === data.submissionId) ||
          fail(404, "Работа не найдена");
        const assignment = db.assignments.find(
          (a) => a.id === submission.assignmentId,
        )!;
        if (data.score > assignment.maxScore)
          fail(400, `Максимальный балл — ${assignment.maxScore}`);
        validateAttachments(db, user, data.fileIds, "review");
        Object.assign(submission, {
          score: data.score,
          feedback: data.feedback,
          reviewFileIds: data.fileIds,
          status: "reviewed",
          reviewedAt: new Date().toISOString(),
        });
        return json(submission);
      }
      if (endpoint === "invites") {
        teacher(user);
        const data = z
          .object({
            email: z.union([z.email().max(254), z.literal("")]),
            groupId: z.string().optional(),
          })
          .parse(input);
        if (data.groupId && !db.groups.some((g) => g.id === data.groupId))
          fail(400, "Группа не найдена");
        const token = newToken();
        db.invites.push({
          id: id(),
          tokenHash: tokenHash(token),
          email: data.email,
          groupId: data.groupId,
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        });
        const base = originFor(request);
        return json({ url: `${base}/?invite=${token}` }, 201);
      }
      if (endpoint === "groups") {
        teacher(user);
        const data = z
          .object({
            id: z.string().optional(),
            name: nonempty,
            description: z.string().max(1000),
            color: z
              .enum(["green", "peach", "purple", "blue"])
              .default("green"),
            studentIds: ids,
          })
          .parse(input);
        studentsExist(db, data.studentIds);
        const existing = data.id
          ? db.groups.find((g) => g.id === data.id)
          : undefined;
        if (data.id && !existing) fail(404, "Группа не найдена");
        const group = { ...data, id: existing?.id || id() };
        if (existing) Object.assign(existing, group);
        else db.groups.push(group);
        return json(group, 201);
      }
      if (endpoint === "lessons") {
        teacher(user);
        const data = z
          .object({
            title: nonempty,
            groupId: nonempty,
            startsAt: z.iso.datetime({ offset: true }),
            duration: z.number().int().min(15).max(360),
            location: z.string().trim().max(300),
          })
          .parse(input);
        if (!db.groups.some((g) => g.id === data.groupId))
          fail(400, "Группа не найдена");
        const lesson = { ...data, id: id() };
        db.lessons.push(lesson);
        return json(lesson, 201);
      }
      if (endpoint === "profile") {
        const data = z
          .object({
            name: nonempty,
            email: z.email().max(254),
            currentPassword: z.string().max(200).optional(),
            password: z.string().min(12).max(200).optional(),
          })
          .parse(input);
        if (
          db.users.some(
            (u) => u.id !== user.id && u.email === data.email.toLowerCase(),
          )
        )
          fail(409, "Этот email уже используется");
        if (
          (data.password || data.email.toLowerCase() !== user.email) &&
          (!data.currentPassword ||
            !verifyPassword(data.currentPassword, user.passwordHash))
        )
          fail(400, "Укажите верный текущий пароль");
        user.name = data.name;
        user.email = data.email.toLowerCase();
        if (data.password) {
          user.passwordHash = hashPassword(data.password);
          db.sessions = db.sessions.filter((s) => s.userId !== user.id);
          await createSession(db, user.id);
        }
        return json({ user: safeUser(user) });
      }
      return fail(404, "Страница не найдена");
    });
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        { error: error.issues.map((i) => i.message).join(". ") },
        400,
      );
    console.error("API error:", error);
    return json(
      { error: "Не удалось выполнить действие. Попробуйте ещё раз" },
      500,
    );
  }
}
