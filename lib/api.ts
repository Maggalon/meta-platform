import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { withDb, isDemo } from "./db";
import { lessonIncludesStudent } from "./lessons";
import { workbookSchema, type WorkbookResult } from "./workbook";
import { odysseySchema, type OdysseyResult } from "./odyssey";
import {
  failureEntrySchema,
  sortFailureEntries,
  type FailureEntry,
} from "./failure-journal";
import {
  compassSchema,
  compassAnalysisSchema,
  reserveAiRequest,
  type CompassResult,
} from "./compass";
import {
  analyzeCompass,
  analyzeDiary,
  suggestMapIdea,
  deepseekAvailable,
  DeepSeekError,
} from "./deepseek";
import {
  diaryDaySchema,
  diaryDateSchema,
  diaryReflectionSchema,
  newDiary,
  maxDiaryDays,
  reflectionUnlocked,
} from "./diary";
import {
  mindMapSchema,
  diaryMapSuggestions,
  type MindMapResult,
} from "./mind-map";
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
import {
  canTeach,
  canManage,
  canManageAccess,
  hasWorkspace,
  inviteRoles,
} from "./access";
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
  if (!canTeach(user.role))
    fail(403, "Доступно только преподавателю или администратору");
}
const workspaceIdsSchema = z
  .array(z.enum(["math", "design"]))
  .max(2)
  .refine(
    (values) => new Set(values).size === values.length,
    "Пространства не должны повторяться",
  );
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
  const teaching = canTeach(user.role);
  const management = canManage(user.role);
  const math = hasWorkspace(user, "math");
  const groups = db.groups.filter(
    (g) => management || (math && (teaching || g.studentIds.includes(user.id))),
  );
  return {
    user: safeUser(user),
    users: db.users
      .filter(
        (u) =>
          u.id === user.id ||
          user.role === "admin" ||
          (management && canManageAccess(u.role)) ||
          (teaching && math && u.role === "student") ||
          (user.role === "student" &&
            canTeach(u.role) &&
            user.workspaceIds.some((space) => hasWorkspace(u, space))),
      )
      .map(safeUser),
    groups: groups.map((g) =>
      teaching || management ? g : { ...g, studentIds: [user.id] },
    ),
    assignments: db.assignments
      .filter((a) => math && (teaching || a.studentIds.includes(user.id)))
      .map((a) => (teaching ? a : { ...a, studentIds: [user.id] })),
    submissions: db.submissions.filter(
      (s) => math && (teaching || s.studentId === user.id),
    ),
    files: db.files
      .filter((f) => canReadFile(db, user, f.id))
      .map(({ key: _, storage: __, ...f }) => f),
    lessons: db.lessons.filter(
      (l) => math && (teaching || lessonIncludesStudent(l, user.id, groups)),
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
async function body(request: Request, limit = 256 * 1024) {
  try {
    return JSON.parse((await limitedBody(request, limit)).toString());
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return fail(400, "Некорректный запрос");
  }
}

export async function handleApi(request: Request, route: string[]) {
  try {
    const endpoint = route.join("/");
    // Resolve current permissions from the database, including for existing sessions.
    const endpointUser = async (db: Database, bootstrap = false) => {
      const user = await getUser(db, bootstrap);
      if (route[0] === "workbook") {
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        if (!hasWorkspace(user, "design"))
          fail(403, "Доступ к пространству «Проектирование» закрыт");
      }
      if (
        [
          "assignments",
          "submissions",
          "reviews",
          "groups",
          "lessons",
          "files",
        ].includes(route[0]) &&
        !hasWorkspace(user, "math")
      )
        fail(403, "Доступ к пространству «Математика» закрыт");
      return user;
    };
    if (request.method !== "GET") {
      const origin = request.headers.get("origin");
      const allowed = originFor(request);
      if (!origin || origin !== allowed)
        fail(403, "Запрос с другого сайта отклонён");
    }
    if (endpoint === "data" && request.method === "GET")
      return await withDb(async (db) =>
        json(appData(db, await endpointUser(db, true))),
      );
    if (
      (endpoint === "workbook/1" || endpoint === "workbook/1/pdf") &&
      request.method === "GET"
    ) {
      const result = await withDb(async (db) => {
        const user = await endpointUser(db);
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        return (
          db.workbookResults.find((item) => item.studentId === user.id) ?? null
        );
      }, false);
      if (endpoint === "workbook/1") return json({ result });
      if (!result) return fail(404, "Сначала заполните и сохраните блок");
      const { createWorkbookPdf } = await import("./workbook-pdf");
      const pdf = await createWorkbookPdf(result);
      return new Response(new Uint8Array(pdf), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="workbook-block-1.pdf"',
          "Cache-Control": "no-store",
        },
      });
    }
    if (
      (endpoint === "workbook/2" || endpoint === "workbook/2/pdf") &&
      request.method === "GET"
    ) {
      const result = await withDb(async (db) => {
        const user = await endpointUser(db);
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        return (
          db.compassResults.find((item) => item.studentId === user.id) ?? null
        );
      }, false);
      if (endpoint === "workbook/2")
        return json({ result, aiAvailable: deepseekAvailable() });
      if (!result)
        return fail(404, "Сначала сохраните компас или его черновик");
      const { createCompassPdf } = await import("./compass-pdf");
      return new Response(new Uint8Array(await createCompassPdf(result)), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": 'attachment; filename="workbook-compass.pdf"',
          "Cache-Control": "no-store",
        },
      });
    }
    if (endpoint === "workbook/6" && request.method === "GET") {
      return await withDb(async (db) => {
        const user = await endpointUser(db);
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        return json({
          entries: sortFailureEntries(
            db.failureEntries.filter((item) => item.studentId === user.id),
          ),
        });
      }, false);
    }
    if (endpoint === "workbook/5" && request.method === "GET") {
      return await withDb(async (db) => {
        const user = await endpointUser(db);
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        const compass = db.compassResults.find(
          (item) => item.studentId === user.id,
        );
        return json({
          result:
            db.odysseyPlans.find((item) => item.studentId === user.id) ?? null,
          compass: compass
            ? {
                work: compass.work,
                life: compass.life,
                alignment: compass.alignment,
                savedAt: compass.savedAt,
              }
            : null,
        });
      }, false);
    }
    if (
      ["workbook/4", "workbook/4/pdf"].includes(endpoint) &&
      request.method === "GET"
    ) {
      const source = await withDb(async (db) => {
        const user = await endpointUser(db);
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        return {
          result:
            db.mindMaps.find((item) => item.studentId === user.id) ?? null,
          suggestions:
            endpoint === "workbook/4"
              ? diaryMapSuggestions(
                  db.timeDiaries.find((item) => item.studentId === user.id)
                    ?.days ?? [],
                )
              : [],
        };
      }, false);
      if (endpoint === "workbook/4")
        return json({ ...source, aiAvailable: deepseekAvailable() });
      if (!source.result) return fail(404, "Сначала сохраните карту");
      const { createMindMapPdf } = await import("./mind-map-pdf");
      return new Response(
        new Uint8Array(await createMindMapPdf(source.result)),
        {
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": 'attachment; filename="workbook-map.pdf"',
            "Cache-Control": "no-store",
          },
        },
      );
    }
    if (endpoint === "workbook/4/analyze" && request.method === "POST") {
      const { ideaId } = z
        .object({ ideaId: z.string().min(1).max(100) })
        .parse(await body(request));
      const idea = await withDb(async (db) => {
        const user = await endpointUser(db);
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        const item = db.mindMaps
          .find((map) => map.studentId === user.id)
          ?.ideas.find((idea) => idea.id === ideaId);
        if (!item) return fail(404, "Карточка идеи не найдена");
        if (!deepseekAvailable())
          throw new DeepSeekError(
            503,
            "Помощь ИИ пока не подключена. Сформулируйте идею самостоятельно.",
          );
        const usage = reserveAiRequest(db.aiUsage, user.id);
        if (!usage)
          return fail(429, "Слишком много запросов к ИИ. Попробуйте позже.");
        db.aiUsage = usage;
        return item;
      });
      return json({
        suggestion: await suggestMapIdea(idea.words, {
          signal: request.signal,
        }),
      });
    }
    if (endpoint === "workbook/3" && request.method === "GET") {
      return await withDb(async (db) => {
        const user = await endpointUser(db);
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        return json({
          result:
            db.timeDiaries.find((item) => item.studentId === user.id) ??
            newDiary(user.id),
          aiAvailable: deepseekAvailable(),
        });
      }, false);
    }
    if (endpoint === "workbook/3/analyze" && request.method === "POST") {
      const source = await withDb(async (db) => {
        const user = await endpointUser(db);
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        const diary = db.timeDiaries.find((item) => item.studentId === user.id);
        if (!diary || !reflectionUnlocked(diary.days))
          return fail(400, "Для рефлексии сохраните минимум 7 дней дневника");
        if (!deepseekAvailable())
          throw new DeepSeekError(
            503,
            "Помощь ИИ пока не подключена. Вы можете заполнить рефлексию самостоятельно.",
          );
        const usage = reserveAiRequest(db.aiUsage, user.id);
        if (!usage)
          return fail(429, "Слишком много запросов к ИИ. Попробуйте позже.");
        db.aiUsage = usage;
        return { days: diary.days, revision: diary.revision };
      });
      const suggestion = await analyzeDiary(source.days, {
        signal: request.signal,
      });
      return json({ suggestion, revision: source.revision });
    }
    if (endpoint === "workbook/2/analyze" && request.method === "POST") {
      const user = await withDb((db) => endpointUser(db), false);
      if (user.role !== "student")
        fail(403, "Рабочая тетрадь доступна ученику");
      const input = compassAnalysisSchema.parse(await body(request));
      if (!deepseekAvailable())
        throw new DeepSeekError(
          503,
          "Помощь ИИ пока не подключена. Вы можете заполнить ответы самостоятельно.",
        );
      await withDb((db) => {
        const usage = reserveAiRequest(db.aiUsage, user.id);
        if (!usage)
          return fail(429, "Слишком много запросов к ИИ. Попробуйте позже.");
        db.aiUsage = usage;
      });
      // Release the database transaction before waiting on the external service.
      const suggestion = await analyzeCompass(input.work, input.life, {
        signal: request.signal,
      });
      return json({ suggestion });
    }
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
          role: invite.role,
          workspaceIds: invite.workspaceIds,
          group: db.groups.find((g) => g.id === invite.groupId)?.name,
        });
      }, false);
    }
    if (endpoint === "auth/login" && request.method === "POST") {
      const input = loginSchema.parse(await body(request));
      return await withDb(async (db) => {
        const email = input.email.trim().toLowerCase();
        const keys = [`email:${tokenHash(email)}`];
        // Trust exactly one proxy hop. NPM appends the real client address;
        // earlier values can be supplied by the client and must not affect limits.
        if (process.env.TRUST_PROXY === "true")
          keys.push(
            `ip:${tokenHash(request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() || "unknown")}`,
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
          role: invite.role,
          workspaceIds: [...invite.workspaceIds],
          passwordHash: hashPassword(input.password),
          color: "sage",
          createdAt: new Date().toISOString(),
        };
        db.users.push(user);
        invite.usedAt = new Date().toISOString();
        const group = db.groups.find((g) => g.id === invite.groupId);
        if (group && user.role === "student") group.studentIds.push(user.id);
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
        .object({ role: z.enum(["teacher", "student", "manager", "admin"]) })
        .parse(await body(request));
      return await withDb(async (db) => {
        const user =
          db.users.find(
            (u) =>
              u.id ===
              {
                teacher: "teacher",
                student: "student-1",
                manager: "demo-manager",
                admin: "demo-admin",
              }[input.role],
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
        const user = await endpointUser(db);
        if (!canReadFile(db, user, route[1])) fail(404, "Файл не найден");
        return db.files.find((f) => f.id === route[1])!;
      }, false);
      return await downloadFile(file);
    }
    if (endpoint === "files" && request.method === "POST") {
      const user = await withDb((db) => endpointUser(db), false);
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
      else if (user.role !== "student")
        fail(403, "Сдавать работы могут только ученики");
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
      await withDb(async (db) => {
        await endpointUser(db);
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
    const input = await body(
      request,
      endpoint === "workbook/5"
        ? 4 * 1024 * 1024
        : endpoint === "workbook/4"
          ? 1024 * 1024
          : 256 * 1024,
    );
    return await withDb(async (db) => {
      const user = await endpointUser(db);
      if (endpoint === "workbook/6") {
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        const parsed = z
          .object({
            id: z.string().uuid(),
            revision: z.number().int().nonnegative(),
            entry: failureEntrySchema,
          })
          .parse(input);
        const previous = db.failureEntries.find(
          (item) => item.id === parsed.id,
        );
        if (previous && previous.studentId !== user.id)
          fail(404, "Запись не найдена");
        if ((previous?.revision ?? 0) !== parsed.revision)
          fail(
            409,
            "Запись изменена в другой вкладке. Скопируйте новые тексты перед обновлением страницы.",
          );
        const now = new Date().toISOString();
        const result: FailureEntry = {
          ...parsed.entry,
          id: parsed.id,
          studentId: user.id,
          revision: parsed.revision + 1,
          createdAt: previous?.createdAt ?? now,
          savedAt: now,
        };
        db.failureEntries = db.failureEntries.filter(
          (item) => item.id !== result.id,
        );
        db.failureEntries.push(result);
        return json({ result });
      }
      if (endpoint === "workbook/5") {
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        const parsed = z
          .object({
            plan: odysseySchema,
            revision: z.number().int().nonnegative(),
          })
          .parse(input);
        const previous = db.odysseyPlans.find(
          (item) => item.studentId === user.id,
        );
        if ((previous?.revision ?? 0) !== parsed.revision)
          return fail(
            409,
            "Планы изменились в другой вкладке. Скопируйте новые тексты перед обновлением страницы.",
          );
        const result: OdysseyResult = {
          ...parsed.plan,
          id: `workbook-5:${user.id}`,
          studentId: user.id,
          revision: parsed.revision + 1,
          savedAt: new Date().toISOString(),
        };
        db.odysseyPlans = db.odysseyPlans.filter(
          (item) => item.studentId !== user.id,
        );
        db.odysseyPlans.push(result);
        return json({ result });
      }
      if (endpoint === "workbook/4") {
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        const parsed = z
          .object({
            map: mindMapSchema,
            revision: z.number().int().nonnegative(),
          })
          .parse(input);
        const previous = db.mindMaps.find((item) => item.studentId === user.id);
        if ((previous?.revision ?? 0) !== parsed.revision)
          fail(
            409,
            "Карта изменена в другой вкладке. Сохраните свой текст и обновите страницу.",
          );
        const result: MindMapResult = {
          ...parsed.map,
          id: `workbook-4:${user.id}`,
          studentId: user.id,
          revision: parsed.revision + 1,
          savedAt: new Date().toISOString(),
        };
        db.mindMaps = db.mindMaps.filter((item) => item.studentId !== user.id);
        db.mindMaps.push(result);
        return json({ result });
      }
      if (
        [
          "workbook/3/day",
          "workbook/3/day/delete",
          "workbook/3/reflection",
        ].includes(endpoint)
      ) {
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        let diary = db.timeDiaries.find((item) => item.studentId === user.id);
        if (!diary) {
          diary = newDiary(user.id);
          db.timeDiaries.push(diary);
        }
        if (endpoint === "workbook/3/day") {
          const { day, mode } = z
            .object({ day: diaryDaySchema, mode: z.enum(["create", "update"]) })
            .parse(input);
          const existing = diary.days.find((item) => item.date === day.date);
          if (mode === "create" && existing)
            fail(
              409,
              "Дневник на эту дату уже существует. Откройте его для редактирования.",
            );
          if (mode === "update" && !existing)
            fail(404, "Этот день больше не существует. Обновите дневник.");
          if (!existing && diary.days.length >= maxDiaryDays)
            fail(400, "В дневнике может быть не больше 21 дня");
          diary.days = diary.days.filter((item) => item.date !== day.date);
          diary.days.push({ ...day, savedAt: new Date().toISOString() });
          diary.days.sort((a, b) => b.date.localeCompare(a.date));
          diary.revision++;
        } else if (endpoint === "workbook/3/day/delete") {
          const { date } = z.object({ date: diaryDateSchema }).parse(input);
          if (!diary.days.some((day) => day.date === date))
            fail(404, "День не найден");
          diary.days = diary.days.filter((day) => day.date !== date);
          diary.revision++;
        } else {
          if (!reflectionUnlocked(diary.days))
            fail(400, "Для рефлексии сохраните минимум 7 дней дневника");
          const { answers, revision } = z
            .object({
              answers: diaryReflectionSchema,
              revision: z.number().int().nonnegative(),
            })
            .parse(input);
          if (revision !== diary.revision)
            fail(
              409,
              "Дневник изменился. Обновите страницу перед сохранением рефлексии.",
            );
          diary.reflection = {
            answers,
            savedAt: new Date().toISOString(),
            basedOnRevision: diary.revision,
          };
        }
        return json({ result: diary });
      }
      if (endpoint === "workbook/2") {
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        const values = compassSchema.parse(input);
        const result: CompassResult = {
          ...values,
          id: `workbook-2:${user.id}`,
          studentId: user.id,
          savedAt: new Date().toISOString(),
        };
        db.compassResults = db.compassResults.filter(
          (item) => item.studentId !== user.id,
        );
        db.compassResults.push(result);
        return json({ result });
      }
      if (endpoint === "workbook/1") {
        if (user.role !== "student")
          fail(403, "Рабочая тетрадь доступна ученику");
        const values = workbookSchema.parse(input);
        const result: WorkbookResult = {
          ...values,
          id: `workbook-1:${user.id}`,
          studentId: user.id,
          savedAt: new Date().toISOString(),
        };
        db.workbookResults = db.workbookResults.filter(
          (item) => item.studentId !== user.id,
        );
        db.workbookResults.push(result);
        return json({ result });
      }
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
        if (!canManage(user.role))
          fail(403, "Приглашать пользователей могут менеджер и администратор");
        const data = z
          .object({
            email: z.union([z.email().max(254), z.literal("")]),
            role: z.enum(["student", "teacher", "manager"]),
            workspaceIds: workspaceIdsSchema,
            groupId: z.string().optional(),
          })
          .parse(input);
        if (!inviteRoles(user.role).includes(data.role))
          fail(403, "Приглашать менеджеров может только администратор");
        if (data.role === "manager" && data.workspaceIds.length)
          fail(400, "Менеджеру не назначаются учебные пространства");
        if (data.role !== "manager" && !data.workspaceIds.length)
          fail(400, "Выберите хотя бы одно учебное пространство");
        if (
          data.groupId &&
          (data.role !== "student" || !data.workspaceIds.includes("math"))
        )
          fail(400, "Группу можно назначить ученику с доступом к математике");
        if (data.groupId && !db.groups.some((g) => g.id === data.groupId))
          fail(400, "Группа не найдена");
        const token = newToken();
        db.invites.push({
          id: id(),
          tokenHash: tokenHash(token),
          email: data.email.toLowerCase(),
          role: data.role,
          workspaceIds: data.workspaceIds,
          groupId: data.groupId,
          expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
        });
        const base = originFor(request);
        return json({ url: `${base}/?invite=${token}` }, 201);
      }
      if (endpoint === "access") {
        if (!canManage(user.role))
          fail(403, "Управление доступом доступно менеджеру и администратору");
        const data = z
          .object({ userId: nonempty, workspaceIds: workspaceIdsSchema })
          .strict()
          .parse(input);
        const target =
          db.users.find((item) => item.id === data.userId) ||
          fail(404, "Пользователь не найден");
        if (!canManageAccess(target.role))
          fail(403, "Можно менять доступ только учеников и преподавателей");
        target.workspaceIds = data.workspaceIds;
        return json({ user: safeUser(target) });
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
            groupId: nonempty.optional(),
            studentId: nonempty.optional(),
            startsAt: z.iso.datetime({ offset: true }),
            duration: z.number().int().min(15).max(360),
            location: z.string().trim().max(300),
          })
          .refine(
            (lesson) => Boolean(lesson.groupId) !== Boolean(lesson.studentId),
            {
              message:
                "Выберите группу или ученика для индивидуального занятия",
            },
          )
          .parse(input);
        if (data.groupId && !db.groups.some((g) => g.id === data.groupId))
          fail(400, "Группа не найдена");
        if (data.studentId) studentsExist(db, [data.studentId]);
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
    if (error instanceof DeepSeekError)
      return json({ error: error.message }, error.status);
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
