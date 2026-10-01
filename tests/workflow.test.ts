import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import {
  S3Client,
  CreateBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  DeleteBucketCommand,
} from "@aws-sdk/client-s3";
import { Pool } from "pg";
import type { AppData, Assignment, Submission } from "../lib/types";
import { emptyMindMap, randomOuterWords } from "../lib/mind-map";
import { emptyOdyssey, newOdysseyEvent } from "../lib/odyssey";
import { randomUUID } from "node:crypto";

const base = "http://localhost:3100",
  run = Date.now().toString();
let server: ChildProcess,
  logs = "",
  pool: Pool | undefined,
  s3: S3Client | undefined;
const bucket = `meta-education-test-${run}`;
class Client {
  cookies = new Map<string, string>();
  async request(
    path: string,
    body?: unknown,
    options: { origin?: string; raw?: boolean; forwardedFor?: string } = {},
  ) {
    const form = body instanceof FormData;
    const response = await fetch(`${base}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(options.forwardedFor
          ? { "X-Forwarded-For": options.forwardedFor }
          : {}),
        Cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        ...(body === undefined
          ? {}
          : {
              Origin: options.origin ?? base,
              ...(form ? {} : { "Content-Type": "application/json" }),
            }),
      },
      body: body === undefined ? undefined : form ? body : JSON.stringify(body),
      redirect: "manual",
    });
    for (const cookie of response.headers.getSetCookie()) {
      const [pair] = cookie.split(";");
      const split = pair.indexOf("=");
      this.cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    const data = options.raw ? null : await response.json();
    return { response, data };
  }
}
const teacher = new Client(),
  manager = new Client(),
  student = new Client(),
  stranger = new Client();

test("four roles enforce invitations, workspace access and existing-session revocation", async () => {
  const admin = new Client(),
    manager = new Client(),
    teacher = new Client(),
    pupil = new Client();
  for (const [client, role] of [
    [admin, "admin"],
    [manager, "manager"],
    [teacher, "teacher"],
    [pupil, "student"],
  ] as const)
    assert.equal(
      (await client.request("auth/demo", { role })).response.status,
      200,
    );
  const invitation = {
    email: "",
    role: "student",
    workspaceIds: ["math", "design"],
  };
  const pupilInvite = await manager.request("invites", invitation);
  const registeredPupil = await pupil.request("auth/register", {
    email: `pupil-access-${run}@example.test`,
    name: "Ученик для проверки доступа",
    password: "AccessTestPassword2026!",
    token: new URL(pupilInvite.data.url).searchParams.get("invite"),
  });
  assert.equal(registeredPupil.response.status, 201);
  const pupilId = registeredPupil.data.user.id as string;
  for (const client of [pupil, teacher]) {
    assert.equal(
      (await client.request("invites", invitation)).response.status,
      403,
    );
    assert.equal(
      (await client.request("access", { userId: pupilId, workspaceIds: [] }))
        .response.status,
      403,
    );
  }
  for (const endpoint of [
    "assignments",
    "assignments/archive",
    "groups",
    "lessons",
    "reviews",
    "submissions",
    "files",
  ])
    assert.equal(
      (await manager.request(endpoint, {})).response.status,
      403,
      endpoint,
    );
  const managerData = (await manager.request("data")).data as AppData;
  assert.ok(managerData.users.some((user) => user.role === "teacher"));
  for (const collection of [
    managerData.assignments,
    managerData.submissions,
    managerData.files,
    managerData.lessons,
  ])
    assert.deepEqual(collection, []);
  assert.equal(
    (
      await manager.request("invites", {
        ...invitation,
        role: "manager",
        workspaceIds: [],
      })
    ).response.status,
    403,
  );
  assert.equal(
    (await admin.request("invites", { ...invitation, role: "admin" })).response
      .status,
    400,
  );
  assert.equal(
    (
      await manager.request("invites", {
        ...invitation,
        workspaceIds: ["unknown"],
      })
    ).response.status,
    400,
  );
  assert.equal(
    (await manager.request("invites", { ...invitation, workspaceIds: [] }))
      .response.status,
    400,
  );
  assert.equal(
    (
      await admin.request("invites", {
        ...invitation,
        role: "manager",
        groupId: "group-1",
        workspaceIds: [],
      })
    ).response.status,
    400,
  );
  for (const [issuer, role, workspaceIds] of [
    [manager, "teacher", ["design"]],
    [admin, "manager", []],
    [manager, "student", ["design"]],
  ] as const) {
    const issued = await issuer.request("invites", {
      email: "",
      role,
      workspaceIds,
    });
    assert.equal(issued.response.status, 201);
    const token = new URL(issued.data.url).searchParams.get("invite");
    const recipient = new Client();
    const preview = await recipient.request(`auth/invite?token=${token}`);
    assert.equal(preview.data.role, role);
    assert.deepEqual(preview.data.workspaceIds, workspaceIds);
    const registration = await recipient.request("auth/register", {
      email: `${role}-access-${run}@example.test`,
      name: `Новый ${role}`,
      password: "AccessTestPassword2026!",
      token,
      role: "admin",
      workspaceIds: ["math", "design"],
    });
    assert.equal(registration.response.status, 201);
    assert.equal(registration.data.user.role, role);
    assert.deepEqual(registration.data.user.workspaceIds, workspaceIds);
    assert.equal(
      (
        await recipient.request("auth/register", {
          email: `replay-${role}@example.test`,
          name: "Повтор",
          password: "AccessTestPassword2026!",
          token,
        })
      ).response.status,
      400,
    );
    if (role === "teacher") {
      assert.equal(
        (await recipient.request("assignments", {})).response.status,
        403,
      );
      assert.equal(
        (await recipient.request("data")).data.assignments.length,
        0,
      );
      assert.equal(
        (
          await manager.request("access", {
            userId: registration.data.user.id,
            workspaceIds: ["math", "design"],
          })
        ).response.status,
        200,
      );
      assert.ok((await recipient.request("data")).data.assignments.length > 0);
    }
  }
  for (const userId of ["demo-admin", "demo-manager"])
    assert.equal(
      (await manager.request("access", { userId, workspaceIds: [] })).response
        .status,
      403,
    );
  assert.equal(
    (
      await manager.request("access", {
        userId: pupilId,
        workspaceIds: ["math"],
        role: "admin",
      })
    ).response.status,
    400,
  );
  assert.equal(
    (
      await admin.request("access", {
        userId: "teacher",
        workspaceIds: ["design"],
      })
    ).response.status,
    200,
  );
  assert.equal((await teacher.request("groups", {})).response.status, 403);
  assert.equal(
    (
      await admin.request("access", {
        userId: "teacher",
        workspaceIds: ["math", "design"],
      })
    ).response.status,
    200,
  );
  const group = await admin.request("groups", {
    name: "Администратор преподаёт",
    description: "",
    studentIds: [],
  });
  assert.equal(group.response.status, 201);
  const assignment = await admin.request("assignments", {
    title: "Задание администратора",
    description: "Ответьте на вопрос",
    deadline: new Date(Date.now() + 86400000).toISOString(),
    studentIds: [pupilId],
    maxScore: 10,
  });
  assert.equal(assignment.response.status, 201);
  const submission = await pupil.request("submissions", {
    assignmentId: assignment.data.id,
    answers: "Ответ",
    fileIds: [],
  });
  assert.equal(submission.response.status, 201);
  assert.equal(
    (
      await admin.request("reviews", {
        submissionId: submission.data.id,
        score: 9,
        feedback: "Проверено администратором",
        fileIds: [],
      })
    ).response.status,
    200,
  );
  assert.equal((await admin.request("workbook/1")).response.status, 403);
  const saved = await pupil.request("workbook/2", {
    work: "Сохранить при закрытии",
    life: "",
    alignment: { complement: "", conflict: "", direction: "" },
    timeZone: "Europe/Moscow",
    status: "draft",
  });
  assert.equal(saved.response.status, 200);
  assert.equal(
    (
      await manager.request("access", {
        userId: pupilId,
        workspaceIds: ["math"],
      })
    ).response.status,
    200,
  );
  for (const endpoint of [
    "workbook/1",
    "workbook/1/pdf",
    "workbook/2",
    "workbook/2/pdf",
    "workbook/3",
    "workbook/4",
    "workbook/4/pdf",
    "workbook/5",
    "workbook/6",
  ])
    assert.equal(
      (await pupil.request(endpoint)).response.status,
      403,
      endpoint,
    );
  for (const endpoint of [
    "workbook/1",
    "workbook/2",
    "workbook/3",
    "workbook/4",
    "workbook/5",
    "workbook/6",
    "workbook/6/delete",
    "workbook/2/analyze",
    "workbook/3/analyze",
    "workbook/4/analyze",
  ])
    assert.equal(
      (await pupil.request(endpoint, { ideaId: "test" })).response.status,
      403,
      endpoint,
    );
  assert.equal(
    (
      await manager.request("access", {
        userId: pupilId,
        workspaceIds: ["math", "design"],
      })
    ).response.status,
    200,
  );
  assert.equal(
    (await pupil.request("workbook/2")).data.result.work,
    "Сохранить при закрытии",
  );
  const form = new FormData();
  form.set("kind", "submission");
  form.set(
    "file",
    new Blob(["%PDF-1.4\naccess"], { type: "application/pdf" }),
    "private.pdf",
  );
  const file = await pupil.request("files", form);
  assert.equal(file.response.status, 201);
  assert.equal(
    (await manager.request(`files/${file.data.id}`)).response.status,
    403,
  );
  assert.equal(
    (await manager.request("access", { userId: pupilId, workspaceIds: [] }))
      .response.status,
    200,
  );
  const closed = (await pupil.request("data")).data as AppData;
  assert.deepEqual(closed.user.workspaceIds, []);
  for (const collection of [
    closed.groups,
    closed.assignments,
    closed.submissions,
    closed.files,
    closed.lessons,
  ])
    assert.deepEqual(collection, []);
  assert.equal(
    (await pupil.request(`files/${file.data.id}`)).response.status,
    403,
  );
  assert.equal((await pupil.request("files", form)).response.status, 403);
  assert.equal((await pupil.request("submissions", {})).response.status, 403);
  assert.equal(
    (
      await manager.request("access", {
        userId: pupilId,
        workspaceIds: ["math", "design"],
      })
    ).response.status,
    200,
  );
  assert.equal(
    (await pupil.request(`files/${file.data.id}`, undefined, { raw: true }))
      .response.status,
    200,
  );
});

test("workbook saves only complete personal results and exports the saved version", async () => {
  const owner = new Client(),
    other = new Client(),
    admin = new Client(),
    anonymous = new Client();
  const input = {
    answers: {
      health: { score: 0, explanation: "Хочу наладить сон." },
      work: { score: 25, explanation: "Учёба требует внимания." },
      hobbies: { score: 75, explanation: "Нравится рисовать." },
      love: { score: 100, explanation: "Близкие поддерживают." },
    },
    priority: "health",
    timeZone: "Asia/Vladivostok",
  };
  assert.equal((await anonymous.request("workbook/1")).response.status, 401);
  assert.equal(
    (await anonymous.request("workbook/1", input)).response.status,
    401,
  );
  await owner.request("auth/demo", { role: "student" });
  await admin.request("auth/demo", { role: "teacher" });
  await other.request("auth/login", {
    email: "misha@meta-education.demo",
    password: "MetaEducation2026!",
  });
  assert.equal((await admin.request("workbook/1")).response.status, 403);
  assert.equal((await admin.request("workbook/1", input)).response.status, 403);
  assert.equal((await owner.request("workbook/1")).data.result, null);
  assert.equal((await owner.request("workbook/1/pdf")).response.status, 404);
  assert.equal(
    (await owner.request("workbook/1", { ...input, priority: "" })).response
      .status,
    400,
  );
  assert.equal(
    (
      await owner.request("workbook/1", {
        ...input,
        answers: {
          ...input.answers,
          health: { score: null, explanation: "Причина" },
        },
      })
    ).response.status,
    400,
  );
  const response = await owner.request("workbook/1", {
    ...input,
    studentId: "student-2",
    savedAt: "2000-01-01",
  });
  assert.equal(response.response.status, 200);
  assert.equal(response.data.result.studentId, "student-1");
  assert.ok(Date.now() - Date.parse(response.data.result.savedAt) < 60000);
  const restored = await owner.request("workbook/1");
  assert.deepEqual(restored.data.result.answers, input.answers);
  assert.equal((await other.request("workbook/1")).data.result, null);
  assert.equal((await other.request("workbook/1/pdf")).response.status, 404);
  assert.equal((await admin.request("workbook/1/pdf")).response.status, 403);
  const pdf = await owner.request("workbook/1/pdf", undefined, { raw: true });
  assert.equal(pdf.response.status, 200);
  assert.equal(pdf.response.headers.get("content-type"), "application/pdf");
  assert.equal(
    Buffer.from(await pdf.response.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    "%PDF",
  );
  input.answers.health.score = 50;
  await owner.request("workbook/1", input);
  assert.equal(
    (await owner.request("workbook/1")).data.result.answers.health.score,
    50,
  );
  assert.equal(
    JSON.stringify((await admin.request("data")).data).includes(
      "Хочу наладить сон",
    ),
    false,
  );
});
test("compass persists drafts and completed answers privately without enforcing 250 words", async () => {
  const owner = new Client(),
    other = new Client(),
    admin = new Client(),
    anonymous = new Client();
  const input = {
    work: "Для меня работа имеет смысл.",
    life: "",
    alignment: { complement: "", conflict: "", direction: "" },
    timeZone: "Asia/Vladivostok",
    status: "draft",
  };
  assert.equal((await anonymous.request("workbook/2")).response.status, 401);
  assert.equal(
    (await anonymous.request("workbook/2", input)).response.status,
    401,
  );
  assert.equal(
    (
      await anonymous.request("workbook/2/analyze", {
        work: "Работа",
        life: "Жизнь",
      })
    ).response.status,
    401,
  );
  await owner.request("auth/demo", { role: "student" });
  await admin.request("auth/demo", { role: "teacher" });
  await other.request("auth/login", {
    email: "misha@meta-education.demo",
    password: "MetaEducation2026!",
  });
  const initial = await owner.request("workbook/2");
  assert.equal(initial.data.result, null);
  assert.equal(initial.data.aiAvailable, false);
  assert.equal((await owner.request("workbook/2/pdf")).response.status, 404);
  assert.equal(
    (await anonymous.request("workbook/2/pdf")).response.status,
    401,
  );
  assert.equal((await admin.request("workbook/2/pdf")).response.status, 403);
  assert.equal((await admin.request("workbook/2")).response.status, 403);
  assert.equal((await admin.request("workbook/2", input)).response.status, 403);
  assert.equal(
    (
      await admin.request("workbook/2/analyze", {
        work: "Работа",
        life: "Жизнь",
      })
    ).response.status,
    403,
  );
  assert.equal(
    (await owner.request("workbook/2", { ...input, status: "completed" }))
      .response.status,
    400,
  );
  assert.equal(
    (
      await owner.request("workbook/2", input, {
        origin: "https://other.example",
      })
    ).response.status,
    403,
  );
  const draft = await owner.request("workbook/2", {
    ...input,
    studentId: "student-2",
  });
  assert.equal(draft.response.status, 200);
  assert.equal(draft.data.result.studentId, "student-1");
  const draftPdf = await owner.request("workbook/2/pdf", undefined, {
    raw: true,
  });
  assert.equal(draftPdf.response.status, 200);
  assert.equal(
    Buffer.from(await draftPdf.response.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    "%PDF",
  );
  assert.equal(
    (await owner.request("workbook/2")).data.result.work,
    input.work,
  );
  assert.equal((await other.request("workbook/2")).data.result, null);
  assert.equal(
    (await owner.request("workbook/2/analyze", { work: input.work, life: " " }))
      .response.status,
    400,
  );
  const ai = await owner.request("workbook/2/analyze", {
    work: input.work,
    life: "Мои близкие важны.",
  });
  assert.equal(ai.response.status, 503);
  assert.ok(ai.data.error);
  input.work = "работа ".repeat(300).trim();
  input.life = "Мои близкие важны.";
  input.alignment = {
    complement: "Забота о людях.",
    conflict: "Баланс времени.",
    direction: "Жизнь задаёт приоритеты.",
  };
  input.status = "completed";
  assert.equal((await owner.request("workbook/2", input)).response.status, 200);
  const restored = (await owner.request("workbook/2")).data.result;
  assert.deepEqual(restored.alignment, input.alignment);
  assert.equal(restored.status, "completed");
  assert.equal(restored.work, input.work);
  const compassPdf = await owner.request("workbook/2/pdf", undefined, {
    raw: true,
  });
  assert.equal(compassPdf.response.status, 200);
  assert.equal(
    compassPdf.response.headers.get("content-type"),
    "application/pdf",
  );
  assert.equal(compassPdf.response.headers.get("cache-control"), "no-store");
  assert.equal(
    Buffer.from(await compassPdf.response.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    "%PDF",
  );
  assert.equal((await other.request("workbook/2/pdf")).response.status, 404);
  assert.equal(
    JSON.stringify((await admin.request("data")).data).includes(
      "Жизнь задаёт приоритеты",
    ),
    false,
  );
  assert.equal(
    (await owner.request("workbook/1")).data.result.answers.health.score,
    50,
  );
});

test("time diary enforces ownership, seven-day reflection, revisions and the 21-day limit", async () => {
  const owner = new Client(),
    other = new Client(),
    admin = new Client(),
    anonymous = new Client();
  await owner.request("auth/demo", { role: "student" });
  await admin.request("auth/demo", { role: "teacher" });
  await other.request("auth/login", {
    email: "misha@meta-education.demo",
    password: "MetaEducation2026!",
  });
  const answers = {
    actions: "Прогулки придают сил",
    environment: "",
    interactions: "",
    objects: "",
    people: "",
  };
  const makeDay = (index: number) => ({
    date: `2026-09-${String(index).padStart(2, "0")}`,
    activities: [
      {
        id: "activity",
        activity: "Прогулка в парке",
        engagement: 0,
        energy: -5,
        flow: false,
      },
    ],
  });
  assert.equal((await anonymous.request("workbook/3")).response.status, 401);
  assert.equal((await admin.request("workbook/3")).response.status, 403);
  assert.equal(
    (await admin.request("workbook/3/day", { day: makeDay(1), mode: "create" }))
      .response.status,
    403,
  );
  assert.equal(
    (await admin.request("workbook/3/analyze", {})).response.status,
    403,
  );
  assert.deepEqual((await owner.request("workbook/3")).data.result.days, []);
  assert.equal(
    (await owner.request("workbook/3/analyze", {})).response.status,
    400,
  );
  assert.equal(
    (
      await owner.request("workbook/3/day", {
        day: { ...makeDay(1), activities: [] },
        mode: "create",
      })
    ).response.status,
    400,
  );
  for (let i = 1; i <= 6; i++) {
    const saved = await owner.request("workbook/3/day", {
      day: makeDay(i),
      mode: "create",
      studentId: "student-2",
    });
    assert.equal(saved.response.status, 200);
    assert.equal(saved.data.result.studentId, "student-1");
    assert.equal(saved.data.result.days.length, i);
  }
  assert.equal(
    (await owner.request("workbook/3/reflection", { answers, revision: 6 }))
      .response.status,
    400,
  );
  const seventh = await owner.request("workbook/3/day", {
    day: makeDay(7),
    mode: "create",
  });
  assert.equal(seventh.data.result.revision, 7);
  assert.equal(
    (await owner.request("workbook/3/reflection", { answers, revision: 6 }))
      .response.status,
    409,
  );
  assert.equal(
    (await owner.request("workbook/3/reflection", { answers, revision: 7 }))
      .response.status,
    200,
  );
  assert.equal(
    (await owner.request("workbook/3/analyze", {})).response.status,
    503,
  );
  assert.equal(
    (await owner.request("workbook/3/day", { day: makeDay(7), mode: "create" }))
      .response.status,
    409,
  );
  assert.equal(
    (await owner.request("workbook/3/day", { day: makeDay(8), mode: "update" }))
      .response.status,
    404,
  );
  assert.deepEqual((await other.request("workbook/3")).data.result.days, []);
  assert.equal(
    (await other.request("workbook/3/day/delete", { date: makeDay(7).date }))
      .response.status,
    404,
  );
  assert.equal(
    (await other.request("workbook/3/reflection", { answers, revision: 7 }))
      .response.status,
    400,
  );
  assert.equal(
    JSON.stringify((await admin.request("data")).data).includes(
      "Прогулка в парке",
    ),
    false,
  );
  for (let i = 8; i <= 21; i++)
    assert.equal(
      (
        await owner.request("workbook/3/day", {
          day: makeDay(i),
          mode: "create",
        })
      ).response.status,
      200,
    );
  assert.equal(
    (
      await owner.request("workbook/3/day", {
        day: makeDay(22),
        mode: "create",
      })
    ).response.status,
    400,
  );
  const updated = await owner.request("workbook/3/day", {
    day: {
      ...makeDay(21),
      activities: [
        { ...makeDay(21).activities[0], engagement: 10, energy: 5, flow: true },
      ],
    },
    mode: "update",
  });
  assert.equal(updated.data.result.days.length, 21);
  assert.equal(updated.data.result.days[0].activities[0].flow, true);
  assert.equal(updated.data.result.reflection.basedOnRevision, 7);
  assert.equal(updated.data.result.revision, 22);
  for (let i = 21; i > 6; i--)
    assert.equal(
      (await owner.request("workbook/3/day/delete", { date: makeDay(i).date }))
        .response.status,
      200,
    );
  const restored = (await owner.request("workbook/3")).data.result;
  assert.equal(restored.days.length, 6);
  assert.deepEqual(restored.reflection.answers, answers);
  assert.equal(
    (
      await owner.request("workbook/3/reflection", {
        answers,
        revision: restored.revision,
      })
    ).response.status,
    400,
  );
  assert.equal(
    (await owner.request("workbook/3/analyze", {})).response.status,
    400,
  );
});

test("mind map privately persists drafts, ideas, revisions and exports saved results", async () => {
  const owner = new Client(),
    other = new Client(),
    admin = new Client(),
    anonymous = new Client();
  await owner.request("auth/demo", { role: "student" });
  await admin.request("auth/demo", { role: "teacher" });
  await other.request("auth/login", {
    email: "misha@meta-education.demo",
    password: "MetaEducation2026!",
  });
  const map = emptyMindMap();
  map.core = "Рисование в мастерской";
  assert.equal((await anonymous.request("workbook/4")).response.status, 401);
  assert.equal((await admin.request("workbook/4")).response.status, 403);
  assert.equal(
    (await admin.request("workbook/4", { map, revision: 0 })).response.status,
    403,
  );
  assert.equal((await owner.request("workbook/4/pdf")).response.status, 404);
  const saved = await owner.request("workbook/4", {
    map,
    revision: 0,
    studentId: "student-2",
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.result.studentId, "student-1");
  assert.equal(
    (await owner.request("workbook/4", { map, revision: 0 })).response.status,
    409,
  );
  assert.equal((await other.request("workbook/4")).data.result, null);
  assert.deepEqual((await other.request("workbook/4")).data.suggestions, []);
  assert.ok((await owner.request("workbook/4")).data.suggestions.length > 0);
  const invalid = {
    ...map,
    selected: [map.nodes.find((node) => node.level === 4)!.id],
  };
  assert.equal(
    (await owner.request("workbook/4", { map: invalid, revision: 1 })).response
      .status,
    400,
  );
  map.nodes.forEach((node, index) => {
    node.word = `Слово ${index}`;
  });
  map.selected = randomOuterWords(map.nodes);
  map.ideas = [
    {
      id: "idea",
      core: map.core,
      words: map.selected.map(
        (id) => map.nodes.find((node) => node.id === id)!.word,
      ) as [string, string, string],
      title: "Идея ученика",
      description: "Личное описание идеи",
    },
  ];
  assert.equal(
    (await owner.request("workbook/4", { map, revision: 1 })).response.status,
    200,
  );
  assert.deepEqual(
    (await owner.request("workbook/4")).data.result.ideas,
    map.ideas,
  );
  assert.equal(
    (await other.request("workbook/4/analyze", { ideaId: "idea" })).response
      .status,
    404,
  );
  assert.equal(
    (await owner.request("workbook/4/analyze", { ideaId: "idea" })).response
      .status,
    503,
  );
  assert.equal(
    (await admin.request("workbook/4/analyze", { ideaId: "idea" })).response
      .status,
    403,
  );
  assert.equal((await other.request("workbook/4/pdf")).response.status, 404);
  assert.equal((await admin.request("workbook/4/pdf")).response.status, 403);
  const pdf = await owner.request("workbook/4/pdf", undefined, { raw: true });
  assert.equal(pdf.response.status, 200);
  assert.equal(pdf.response.headers.get("content-type"), "application/pdf");
  assert.equal(
    Buffer.from(await pdf.response.arrayBuffer())
      .subarray(0, 4)
      .toString(),
    "%PDF",
  );
  assert.equal(
    JSON.stringify((await admin.request("data")).data).includes(
      "Личное описание идеи",
    ),
    false,
  );
});

test("odyssey saves independent plans and drawings privately, checks completion and revisions", async () => {
  const owner = new Client(),
    other = new Client(),
    admin = new Client(),
    anonymous = new Client();
  await owner.request("auth/demo", { role: "student" });
  await admin.request("auth/demo", { role: "teacher" });
  await other.request("auth/login", {
    email: "misha@meta-education.demo",
    password: "MetaEducation2026!",
  });
  const plan = emptyOdyssey();
  assert.equal((await anonymous.request("workbook/5")).response.status, 401);
  assert.equal(
    (await anonymous.request("workbook/5", { plan, revision: 0 })).response
      .status,
    401,
  );
  assert.equal((await admin.request("workbook/5")).response.status, 403);
  assert.equal(
    (await admin.request("workbook/5", { plan, revision: 0 })).response.status,
    403,
  );
  const initial = await owner.request("workbook/5");
  assert.equal(initial.data.result, null);
  const ownCompass = (await owner.request("workbook/2")).data.result;
  assert.equal(initial.data.compass.work, ownCompass.work);
  assert.equal((await other.request("workbook/5")).data.compass, null);
  plan.scenarios[0].events = [
    {
      ...newOdysseyEvent(1),
      title: "Личный план Одиссеи",
      category: "projects",
      assumption: true,
      drawing: [
        {
          color: "#34513a",
          width: 4,
          points: [
            [50, 50],
            [100, 200],
          ],
        },
      ],
    },
  ];
  plan.scenarios[1].events = [
    { ...newOdysseyEvent(3), title: "Другой путь", category: "learning" },
  ];
  const saved = await owner.request("workbook/5", {
    plan,
    revision: 0,
    studentId: "student-2",
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.result.studentId, "student-1");
  assert.equal(saved.data.result.revision, 1);
  assert.equal(
    (await owner.request("workbook/5", { plan, revision: 0 })).response.status,
    409,
  );
  assert.deepEqual(
    (await owner.request("workbook/5")).data.result.scenarios,
    plan.scenarios,
  );
  assert.equal((await other.request("workbook/5")).data.result, null);
  plan.scenarios[0].status = "completed";
  assert.equal(
    (await owner.request("workbook/5", { plan, revision: 1 })).response.status,
    400,
  );
  plan.scenarios[0].title = "Учусь создавать проекты помогаю людям путешествую";
  plan.scenarios[0].questions = ["Что хочу проверить?", "Кто сможет помочь?"];
  Object.values(plan.scenarios[0].ratings).forEach((rating) => {
    rating.score = 0;
    rating.why = "Моя причина";
  });
  const completed = await owner.request("workbook/5", { plan, revision: 1 });
  assert.equal(completed.response.status, 200);
  assert.equal(completed.data.result.scenarios[0].status, "completed");
  assert.equal(completed.data.result.scenarios[1].status, "draft");
  plan.scenarios[0].events[0].year = 5;
  plan.scenarios[0].status = "draft";
  assert.equal(
    (await owner.request("workbook/5", { plan, revision: 2 })).response.status,
    200,
  );
  const restored = (await owner.request("workbook/5")).data.result;
  assert.equal(restored.scenarios[0].events[0].year, 5);
  assert.deepEqual(
    restored.scenarios[0].events[0].drawing,
    plan.scenarios[0].events[0].drawing,
  );
  assert.equal(restored.scenarios[1].events[0].year, 3);
  assert.equal(
    JSON.stringify((await admin.request("data")).data).includes(
      "Личный план Одиссеи",
    ),
    false,
  );
});

test("failure journal is private, validates category answers and revises individual entries safely", async () => {
  const owner = new Client(),
    other = new Client(),
    admin = new Client(),
    anonymous = new Client();
  const id = randomUUID();
  const entry = {
    date: "2026-09-24",
    event: "Личный разбор неудачного выступления",
    expected: "Убедить слушателей",
    actual: "Остались вопросы",
    category: "slip",
    responses: { slip: "Репетиция с коллегой", difficulty: "", growth: "" },
    conclusion: "Добавлю время для вопросов",
    nextStep: "",
  };
  const input = { id, revision: 0, entry };
  assert.equal((await anonymous.request("workbook/6")).response.status, 401);
  assert.equal(
    (await anonymous.request("workbook/6", input)).response.status,
    401,
  );
  await owner.request("auth/demo", { role: "student" });
  await admin.request("auth/demo", { role: "teacher" });
  await other.request("auth/login", {
    email: "misha@meta-education.demo",
    password: "MetaEducation2026!",
  });
  assert.equal((await admin.request("workbook/6")).response.status, 403);
  assert.equal((await admin.request("workbook/6", input)).response.status, 403);
  assert.deepEqual((await owner.request("workbook/6")).data.entries, []);
  for (const patch of [
    { expected: " " },
    { actual: "" },
    { conclusion: "" },
    { category: "unknown" },
    { date: "2026-02-30" },
    { category: "growth" },
  ]) {
    assert.equal(
      (
        await owner.request("workbook/6", {
          ...input,
          entry: { ...entry, ...patch },
        })
      ).response.status,
      400,
    );
  }
  const saved = await owner.request("workbook/6", {
    ...input,
    entry: { ...entry, studentId: "student-2" },
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.result.studentId, "student-1");
  assert.equal(saved.data.result.revision, 1);
  assert.ok(saved.data.result.createdAt);
  assert.deepEqual((await other.request("workbook/6")).data.entries, []);
  assert.equal(
    (await other.request("workbook/6", { ...input, revision: 1 })).response
      .status,
    404,
  );
  assert.equal((await owner.request("workbook/6", input)).response.status, 409);
  const changed = {
    ...entry,
    category: "growth",
    responses: { ...entry.responses, growth: "Проверю понятность примеров" },
    nextStep: "Покажу черновик коллеге",
  };
  const updated = await owner.request("workbook/6", {
    id,
    revision: 1,
    entry: changed,
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.data.result.createdAt, saved.data.result.createdAt);
  assert.equal(updated.data.result.revision, 2);
  assert.deepEqual(updated.data.result.responses, changed.responses);
  const secondId = randomUUID();
  assert.equal(
    (
      await owner.request("workbook/6", {
        id: secondId,
        revision: 0,
        entry: {
          ...entry,
          date: "2026-09-23",
          category: "difficulty",
          responses: { ...entry.responses, difficulty: "Тихое помещение" },
        },
      })
    ).response.status,
    200,
  );
  const history = (await owner.request("workbook/6")).data.entries;
  assert.equal(history.length, 2);
  assert.equal(history[0].id, id);
  assert.equal(history[0].category, "growth");
  assert.equal(history[1].id, secondId);
  assert.equal(history[1].revision, 1);
  assert.equal(
    JSON.stringify((await admin.request("data")).data).includes(entry.event),
    false,
  );
  assert.equal(
    JSON.stringify((await other.request("data")).data).includes(entry.event),
    false,
  );
});

before(async () => {
  const env = {
    ...process.env,
    DEMO_MODE: "true",
    TRUST_PROXY: "true",
    NEXT_DIST_DIR: ".next-test",
    META_EDUCATION_DATA_DIR: `.data/test-${run}`,
    APP_URL: base,
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: process.env.TEST_DATABASE_URL || "",
    S3_ENDPOINT: process.env.TEST_S3_ENDPOINT || "",
    S3_BUCKET: "",
    S3_ACCESS_KEY_ID: "",
    S3_SECRET_ACCESS_KEY: "",
    DEEPSEEK_API_KEY: "",
    DEEPSEEK_MODEL: "deepseek-flash",
  };
  if (process.env.TEST_DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await pool.query(`CREATE SCHEMA "test_${run}"`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set("options", `-c search_path=test_${run}`);
    env.DATABASE_URL = url.toString();
  }
  if (process.env.TEST_S3_ENDPOINT) {
    Object.assign(env, {
      S3_BUCKET: bucket,
      S3_ACCESS_KEY_ID:
        process.env.TEST_S3_ACCESS_KEY_ID || "meta-education-local",
      S3_SECRET_ACCESS_KEY:
        process.env.TEST_S3_SECRET_ACCESS_KEY ||
        "meta-education-local-dev-storage",
      S3_REGION: "us-east-1",
      S3_FORCE_PATH_STYLE: "true",
    });
    s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY,
      },
    });
    await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  }
  server = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "dev",
      "--port",
      "3100",
      "--hostname",
      "127.0.0.1",
    ],
    {
      cwd: process.cwd(),
      env,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  server.stdout?.on("data", (d) => (logs += d.toString()));
  server.stderr?.on("data", (d) => (logs += d.toString()));
  for (let i = 0; i < 90; i++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      const r = await fetch(base);
      if (r.ok) return;
    } catch {}
    await delay(500);
  }
  throw new Error(`Test server did not start: ${logs}`);
});
after(async () => {
  if (server && !server.killed) {
    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const stop = spawn(
          "taskkill",
          ["/pid", String(server.pid), "/T", "/F"],
          { windowsHide: true },
        );
        stop.on("exit", () => resolve());
      });
    } else server.kill("SIGTERM");
  }
  if (pool) {
    await pool.query(`DROP SCHEMA "test_${run}" CASCADE`);
    await pool.end();
  }
  if (s3) {
    const objects = await s3.send(new ListObjectsV2Command({ Bucket: bucket }));
    if (objects.Contents?.length)
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: objects.Contents.map((o) => ({ Key: o.Key })) },
        }),
      );
    await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    s3.destroy();
  }
});

test("complete workflow: invitation, assignment, private file, submission, grading and permissions", async (t) => {
  let studentId = "",
    assignment: Assignment,
    submission: Submission,
    uploadedId = "",
    reviewId = "";
  await t.test("teacher demo session uses an HTTP-only cookie", async () => {
    const result = await teacher.request("data");
    assert.equal(result.response.status, 200);
    assert.equal(result.data.user.role, "teacher");
    assert.ok(
      result.response.headers
        .getSetCookie()
        .some((c) => c.includes("HttpOnly")),
    );
    assert.equal(JSON.stringify(result.data).includes("passwordHash"), false);
  });
  await t.test(
    "invitation can be redeemed only once and email is enforced",
    async () => {
      await manager.request("auth/demo", { role: "manager" });
      const invite = await manager.request("invites", {
        role: "student",
        workspaceIds: ["math", "design"],
        email: "acceptance@meta-education.test",
        groupId: "group-1",
      });
      assert.equal(invite.response.status, 201);
      const token = new URL(invite.data.url).searchParams.get("invite");
      const rejected = await student.request("auth/register", {
        name: "Тестовый ученик",
        email: "wrong@meta-education.test",
        password: "TestPassword2026!",
        token,
      });
      assert.equal(rejected.response.status, 400);
      const result = await student.request("auth/register", {
        name: "Тестовый ученик",
        email: "acceptance@meta-education.test",
        password: "TestPassword2026!",
        token,
      });
      assert.equal(result.response.status, 201);
      studentId = result.data.user.id;
      const duplicate = await stranger.request("auth/register", {
        name: "Другой ученик",
        email: "acceptance@meta-education.test",
        password: "TestPassword2026!",
        token,
      });
      assert.equal(duplicate.response.status, 400);
      await stranger.request("auth/login", {
        email: "misha@meta-education.demo",
        password: "MetaEducation2026!",
      });
    },
  );
  await t.test(
    "teacher assigns work and student sees only their own information",
    async () => {
      const created = await teacher.request("assignments", {
        title: "Приёмочный тест",
        description: "Вычислите 6 × 7. Приложите решение.",
        deadline: new Date(Date.now() + 86400000).toISOString(),
        studentIds: [studentId],
        questions: 1,
        maxScore: 10,
        fileIds: [],
      });
      assert.equal(created.response.status, 201);
      assignment = created.data;
      const mine = await student.request("data");
      assert.equal(mine.data.assignments.length, 1);
      assert.equal(mine.data.assignments[0].id, assignment.id);
      assert.ok(
        mine.data.users.every(
          (u: AppData["user"]) =>
            u.id === studentId || u.role === "teacher" || u.role === "admin",
        ),
      );
      assert.equal(mine.data.groups[0].studentIds.length, 1);
      assert.equal(
        (await student.request("assignments", { title: "forbidden" })).response
          .status,
        403,
      );
      assert.equal(
        (
          await teacher.request(
            "groups",
            { name: "CSRF", description: "", studentIds: [] },
            { origin: "https://untrusted.test" },
          )
        ).response.status,
        403,
      );
    },
  );
  await t.test(
    "upload rejects mismatched content and accepts a private PNG",
    async () => {
      const bad = new FormData();
      bad.set("kind", "submission");
      bad.set(
        "file",
        new File(["<html>not an image</html>"], "fake.png", {
          type: "image/png",
        }),
      );
      assert.equal((await student.request("files", bad)).response.status, 400);
      const bytes = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6SFcAAAAASUVORK5CYII=",
        "base64",
      );
      const form = new FormData();
      form.set("kind", "submission");
      form.set(
        "file",
        new File([bytes], "solution.png", { type: "image/png" }),
      );
      const result = await student.request("files", form);
      assert.equal(result.response.status, 201);
      uploadedId = result.data.id;
      assert.equal(
        (
          await stranger.request(`files/${uploadedId}`, undefined, {
            raw: true,
          })
        ).response.status,
        404,
      );
      const read = await student.request(`files/${uploadedId}`, undefined, {
        raw: true,
      });
      assert.equal(read.response.status, s3 ? 307 : 200);
      if (s3) {
        const signed = read.response.headers.get("location")!;
        assert.ok(signed.includes("X-Amz-Expires=60"));
        assert.equal((await fetch(signed)).status, 200);
        const anonymous = await fetch(
          `${process.env.TEST_S3_ENDPOINT}/${bucket}/${uploadedId}`,
        );
        assert.equal(anonymous.status, 403);
      }
    },
  );
  await t.test("submission is atomic and cannot be duplicated", async () => {
    const results = await Promise.all([
      student.request("submissions", {
        assignmentId: assignment.id,
        answers: "42",
        fileIds: [uploadedId],
      }),
      student.request("submissions", {
        assignmentId: assignment.id,
        answers: "42",
        fileIds: [uploadedId],
      }),
    ]);
    assert.deepEqual(results.map((r) => r.response.status).sort(), [201, 409]);
    submission = results.find((r) => r.response.status === 201)!.data;
    const teacherData = await teacher.request("data");
    assert.ok(
      teacherData.data.submissions.some(
        (s: Submission) => s.id === submission.id && s.status === "pending",
      ),
    );
  });
  await t.test(
    "review validates maximum score and publishes feedback with a private file",
    async () => {
      assert.equal(
        (
          await teacher.request("reviews", {
            submissionId: submission.id,
            score: 11,
            feedback: "Great",
            fileIds: [],
          })
        ).response.status,
        400,
      );
      assert.equal(
        (
          await student.request("reviews", {
            submissionId: submission.id,
            score: 10,
            feedback: "Great",
            fileIds: [],
          })
        ).response.status,
        403,
      );
      const file = new FormData();
      file.set("kind", "review");
      file.set(
        "file",
        new File(["%PDF-1.4\nTest checked solution\n%%EOF"], "checked.pdf", {
          type: "application/pdf",
        }),
      );
      const uploaded = await teacher.request("files", file);
      assert.equal(uploaded.response.status, 201);
      reviewId = uploaded.data.id;
      assert.equal(
        (await student.request(`files/${reviewId}`, undefined, { raw: true }))
          .response.status,
        404,
      );
      const published = await teacher.request("reviews", {
        submissionId: submission.id,
        score: 10,
        feedback: "Верно! Отличная работа.",
        fileIds: [reviewId],
      });
      assert.equal(published.response.status, 200);
      const mine = await student.request("data");
      const result = mine.data.submissions.find(
        (s: Submission) => s.id === submission.id,
      );
      assert.equal(result.status, "reviewed");
      assert.equal(result.score, 10);
      assert.equal(result.feedback, "Верно! Отличная работа.");
      assert.equal(
        (await student.request(`files/${reviewId}`, undefined, { raw: true }))
          .response.status,
        s3 ? 307 : 200,
      );
      assert.equal(
        (await stranger.request(`files/${reviewId}`, undefined, { raw: true }))
          .response.status,
        404,
      );
    },
  );
  await t.test(
    "individual lessons are visible only to the selected student and teacher",
    async () => {
      const payload = {
        title: "Индивидуальный разбор",
        studentId,
        startsAt: new Date(Date.now() + 86400000).toISOString(),
        duration: 60,
        location: "https://example.com/private-lesson",
      };
      const result = await teacher.request("lessons", payload);
      assert.equal(result.response.status, 201);
      assert.equal(result.data.studentId, studentId);
      assert.equal(result.data.groupId, undefined);
      const otherStudent = new Client();
      await otherStudent.request("auth/demo", { role: "student" });
      assert.equal(
        (await student.request("data")).data.lessons.some(
          (l: { id: string }) => l.id === result.data.id,
        ),
        true,
      );
      assert.equal(
        (await teacher.request("data")).data.lessons.some(
          (l: { id: string }) => l.id === result.data.id,
        ),
        true,
      );
      assert.equal(
        (await otherStudent.request("data")).data.lessons.some(
          (l: { id: string }) => l.id === result.data.id,
        ),
        false,
      );
      assert.equal(
        (await student.request("lessons", payload)).response.status,
        403,
      );
      for (const target of [
        { studentId: undefined },
        { studentId: "missing-student" },
        { studentId: "teacher" },
        { groupId: "group-1" },
      ]) {
        assert.equal(
          (await teacher.request("lessons", { ...payload, ...target })).response
            .status,
          400,
        );
      }
      const invite = await manager.request("invites", {
        role: "student",
        workspaceIds: ["math", "design"],
        email: "individual@meta-education.test",
      });
      assert.equal(invite.response.status, 201);
      const solo = new Client();
      const registration = await solo.request("auth/register", {
        name: "Ученик без группы",
        email: "individual@meta-education.test",
        password: "TestPassword2026!",
        token: new URL(invite.data.url).searchParams.get("invite"),
      });
      assert.equal(registration.response.status, 201);
      const soloData = (await solo.request("data")).data as AppData;
      assert.equal(soloData.groups.length, 0);
      const soloLesson = await teacher.request("lessons", {
        ...payload,
        studentId: soloData.user.id,
      });
      assert.equal(soloLesson.response.status, 201);
      assert.equal(
        (await solo.request("data")).data.lessons.some(
          (l: { id: string }) => l.id === soloLesson.data.id,
        ),
        true,
      );
      assert.equal(
        (await student.request("data")).data.lessons.some(
          (l: { id: string }) => l.id === soloLesson.data.id,
        ),
        false,
      );
    },
  );
  await t.test("groups, lessons and archive operations persist", async () => {
    const group = await teacher.request("groups", {
      name: "Тестовая группа",
      description: "Приёмочное тестирование",
      studentIds: [studentId],
      color: "blue",
    });
    assert.equal(group.response.status, 201);
    const lesson = await teacher.request("lessons", {
      title: "Разбор",
      groupId: group.data.id,
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      duration: 60,
      location: "Онлайн",
    });
    assert.equal(lesson.response.status, 201);
    assert.equal(
      (await student.request("data")).data.lessons.some(
        (l: { id: string }) => l.id === lesson.data.id,
      ),
      true,
    );
    await teacher.request("assignments/archive", {
      id: assignment.id,
      archived: true,
    });
    assert.equal(
      (await student.request("data")).data.assignments[0].archived,
      true,
    );
  });
  await t.test(
    "logout invalidates session and password login restores it",
    async () => {
      // A session issued before the product rename must still work and log out.
      const existingSession = student.cookies.get("meta_education_session");
      assert.ok(existingSession);
      student.cookies.delete("meta_education_session");
      student.cookies.set("tochka_session", existingSession);
      assert.equal((await student.request("data")).data.user.id, studentId);
      await student.request("auth/logout", {});
      assert.equal((await student.request("data")).response.status, 401);
      assert.equal(
        (
          await student.request("auth/login", {
            email: "acceptance@meta-education.test",
            password: "wrong",
          })
        ).response.status,
        401,
      );
      assert.equal(
        (
          await student.request("auth/login", {
            email: "acceptance@meta-education.test",
            password: "TestPassword2026!",
          })
        ).response.status,
        200,
      );
      assert.equal((await student.request("data")).data.user.id, studentId);
    },
  );
  await t.test("repeated incorrect logins are rate limited", async () => {
    const attacker = new Client();
    for (let i = 0; i < 10; i++)
      assert.equal(
        (
          await attacker.request("auth/login", {
            email: "missing@meta-education.test",
            password: "wrong",
          })
        ).response.status,
        401,
      );
    assert.equal(
      (
        await attacker.request("auth/login", {
          email: "missing@meta-education.test",
          password: "wrong",
        })
      ).response.status,
      429,
    );
  });
  await t.test(
    "NPM client IP cannot be spoofed to bypass login limits",
    async () => {
      const attacker = new Client();
      for (let i = 0; i < 11; i++) {
        const result = await attacker.request(
          "auth/login",
          { email: `missing-${i}@meta-education.test`, password: "wrong" },
          { forwardedFor: `203.0.113.${i + 1}, 198.51.100.10` },
        );
        assert.equal(result.response.status, i < 10 ? 401 : 429);
      }
      // A different client still gets an ordinary authentication response.
      const other = await attacker.request(
        "auth/login",
        { email: "other-client@meta-education.test", password: "wrong" },
        { forwardedFor: "203.0.113.1, 198.51.100.11" },
      );
      assert.equal(other.response.status, 401);
    },
  );
});
