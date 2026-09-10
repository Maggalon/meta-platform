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
  student = new Client(),
  stranger = new Client();
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
      const invite = await teacher.request("invites", {
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
          (u: AppData["user"]) => u.id === studentId || u.role === "teacher",
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
