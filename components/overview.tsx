"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  Users,
  ClipboardCheck,
  ArrowUpRight,
  ArrowRight,
  CalendarDays,
  Clock3,
  MoreHorizontal,
  BookOpen,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  CheckCheck,
} from "lucide-react";
import type { AppData, View, Assignment, Submission } from "@/lib/types";
import {
  Avatar,
  AvatarStack,
  dateLabel,
  timeLabel,
  EmptyState,
  Status,
  taskCount,
} from "./ui";
gsap.registerPlugin(useGSAP, ScrollTrigger);

type Props = {
  data: AppData;
  navigate: (view: View) => void;
  openAssignment: (a: Assignment) => void;
  openReview: (s: Submission) => void;
  openLesson: () => void;
};
export function ProgressChart({ data }: { data: AppData }) {
  const [period, setPeriod] = useState(30),
    [active, setActive] = useState<number | null>(null);
  const days = Array.from({ length: 6 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - Math.round((period * (5 - i)) / 5));
    return d;
  });
  const values = days.map((day, i) => {
    const before = new Date(day);
    before.setHours(23, 59, 59, 999);
    const start =
      i === 0 ? new Date(day.getTime() - 7 * 86400000) : days[i - 1];
    const subs = data.submissions.filter(
      (s) =>
        s.status === "reviewed" &&
        s.reviewedAt &&
        new Date(s.reviewedAt) <= before &&
        new Date(s.reviewedAt) >= start,
    );
    return subs.length
      ? Math.round(
          subs.reduce(
            (sum, s) =>
              sum +
              (100 * (s.score || 0)) /
                (data.assignments.find((a) => a.id === s.assignmentId)
                  ?.maxScore || 10),
            0,
          ) / subs.length,
        )
      : null;
  });
  const points = values.map((v, i) => ({
    x: 35 + i * 108,
    y: 150 - (v ?? 0) * 1.2,
    value: v,
  }));
  const actual = points.filter((p) => p.value !== null);
  const line = actual
    .map((p, i) =>
      i === 0
        ? `M ${p.x} ${p.y}`
        : `C ${actual[i - 1].x + 48} ${actual[i - 1].y}, ${p.x - 48} ${p.y}, ${p.x} ${p.y}`,
    )
    .join(" ");
  const last = actual.at(-1)?.value ?? 0;
  const first = actual[0]?.value ?? 0;
  return (
    <section className="panel progress-panel" data-reveal>
      <div className="panel-heading">
        <div>
          <h2>
            Прогресс {data.user.role === "teacher" ? "учеников" : "подготовки"}
          </h2>
          <p>Маленькие шаги. Большие результаты.</p>
        </div>
        <select
          className="small-select"
          aria-label="Период прогресса"
          value={period}
          onChange={(e) => setPeriod(Number(e.target.value))}
        >
          <option value={30}>За месяц</option>
          <option value={7}>За неделю</option>
          <option value={90}>За 3 месяца</option>
        </select>
      </div>
      <div className="chart-summary">
        <strong>
          {last}
          <span>%</span>
        </strong>
        <span className="trend">
          <TrendingUp size={13} />
          {last - first >= 0 ? "+" : ""}
          {last - first}%
        </span>
        <small>средний результат</small>
      </div>
      <div className="chart-container">
        <div className="chart-y">
          <span>100%</span>
          <span>75%</span>
          <span>50%</span>
          <span>25%</span>
        </div>
        <svg
          className="progress-chart"
          viewBox="0 0 620 184"
          role="img"
          aria-label={`Средний результат за ${period} дней: ${last} процентов`}
        >
          <defs>
            <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b5cbb2" stopOpacity=".45" />
              <stop offset="100%" stopColor="#dae6d3" stopOpacity=".04" />
            </linearGradient>
          </defs>
          {[30, 60, 90, 120].map((y) => (
            <line
              key={y}
              x1="16"
              x2="606"
              y1={y}
              y2={y}
              stroke="#e9ece4"
              strokeDasharray="3 4"
            />
          ))}
          {actual.length > 0 && (
            <>
              <path
                d={`${line} L ${actual.at(-1)!.x} 160 L ${actual[0].x} 160 Z`}
                fill="url(#chart-fill)"
              />
              <path
                d={line}
                fill="none"
                stroke="#547b58"
                strokeWidth="2.5"
                strokeLinecap="round"
              />
            </>
          )}
          {points.map((p, i) => (
            <g
              key={i}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
            >
              {p.value !== null && (
                <>
                  <circle cx={p.x} cy={p.y} r="15" fill="transparent" />
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={i === points.length - 1 ? 5 : 3.5}
                    stroke="white"
                    strokeWidth="2.5"
                    fill="#547b58"
                  />
                  {active === i && (
                    <g>
                      <rect
                        x={p.x - 22}
                        y={p.y - 29}
                        width="44"
                        height="21"
                        rx="6"
                        fill="#243f32"
                      />
                      <text
                        x={p.x}
                        y={p.y - 15}
                        textAnchor="middle"
                        fill="white"
                        fontSize="10"
                      >
                        {p.value}%
                      </text>
                    </g>
                  )}
                </>
              )}
              <text
                x={p.x}
                y="181"
                textAnchor="middle"
                fill="#969c92"
                fontSize="10"
              >
                {dateLabel(days[i].toISOString())}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <div className="chart-legend">
        <i /> Средний балл по проверенным работам <span>из 100%</span>
      </div>
    </section>
  );
}
function OrbitArt() {
  return (
    <svg className="orbit-art" viewBox="0 0 370 230" aria-hidden="true">
      <defs>
        <radialGradient id="sphere" cx="32%" cy="25%" r="80%">
          <stop offset="0" stopColor="#e9f6b5" />
          <stop offset=".55" stopColor="#c9df88" />
          <stop offset="1" stopColor="#7d985b" />
        </radialGradient>
        <linearGradient id="orbit-band" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#7d9d7c" />
          <stop offset=".5" stopColor="#d0dcb4" />
          <stop offset="1" stopColor="#5b7c60" />
        </linearGradient>
        <filter id="ball-shadow">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>
      <g transform="translate(203 116) rotate(-30)">
        {Array.from({ length: 11 }, (_, i) => (
          <ellipse
            key={i}
            rx={85 + i * 5.9}
            ry={29 + i * 5.8}
            fill="none"
            stroke="#b6c9a0"
            strokeOpacity={0.1 + i * 0.012}
            strokeWidth=".8"
          />
        ))}
        <ellipse
          cx="0"
          cy="38"
          rx="53"
          ry="20"
          fill="#16271b"
          opacity=".3"
          filter="url(#ball-shadow)"
        />
        <circle cx="0" cy="-6" r="51" fill="url(#sphere)" />
        <path
          d="M -114 0 C -120 65, 129 68, 116 -2"
          fill="none"
          stroke="url(#orbit-band)"
          strokeWidth="15"
        />
        <path
          d="M -114 0 C -120 65, 129 68, 116 -2"
          fill="none"
          stroke="#e2ebc8"
          strokeWidth=".7"
          transform="translate(0 -7)"
        />
      </g>
      <circle cx="294" cy="31" r="4" fill="#cee597" />
      <circle cx="80" cy="175" r="2" fill="#d5e3bd" />
      <path d="M 289 175v12m-6-6h12" stroke="#c9d5ab" strokeWidth="1.3" />
    </svg>
  );
}
export default function Overview({
  data,
  navigate,
  openAssignment,
  openReview,
  openLesson,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const teacher = data.user.role === "teacher";
  const students = data.users.filter((u) => u.role === "student");
  const pending = data.submissions
    .filter((s) => s.status === "pending")
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
  const reviewed = data.submissions.filter((s) => s.status === "reviewed");
  const average = reviewed.length
    ? Math.round(
        reviewed.reduce(
          (total, s) =>
            total +
            ((s.score || 0) /
              (data.assignments.find((a) => a.id === s.assignmentId)
                ?.maxScore || 10)) *
              100,
          0,
        ) / reviewed.length,
      )
    : 0;
  const active = data.assignments.filter((a) => !a.archived);
  const upcoming = data.lessons
    .filter(
      (l) => new Date(l.startsAt).getTime() + l.duration * 60000 > Date.now(),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const lesson = upcoming[0];
  const [weekOffset, setWeekOffset] = useState(0),
    [selectedDay, setSelectedDay] = useState(new Date().toDateString());
  const monday = new Date();
  monday.setDate(
    monday.getDate() - ((monday.getDay() + 6) % 7) + weekOffset * 7,
  );
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const daily = data.lessons
    .filter((l) => new Date(l.startsAt).toDateString() === selectedDay)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const [feedbackIndex, setFeedbackIndex] = useState(0);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".stat-card", {
          y: 15,
          opacity: 0,
          duration: 0.55,
          stagger: 0.08,
          ease: "power2.out",
        });
        gsap.from(".focus-card", {
          y: 14,
          opacity: 0,
          duration: 0.65,
          delay: 0.15,
        });
        gsap.to(".orbit-art", {
          y: -7,
          rotation: 2,
          duration: 4,
          yoyo: true,
          repeat: -1,
          ease: "sine.inOut",
        });
        gsap.fromTo(
          ".focus-copy p span",
          { opacity: 0.4 },
          {
            opacity: 1,
            stagger: 0.07,
            scrollTrigger: {
              trigger: ".focus-card",
              start: "top 85%",
              end: "top 20%",
              scrub: 1,
            },
          },
        );
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) =>
          gsap.fromTo(
            el,
            { scale: 0.985, opacity: 0.7 },
            {
              scale: 1,
              opacity: 1,
              duration: 0.7,
              scrollTrigger: {
                trigger: el,
                start: "top 96%",
                end: "top 78%",
                scrub: 1,
              },
            },
          ),
        );
      });
      return () => mm.revert();
    },
    { scope: root },
  );
  const nextAssignments = [...active]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 4);
  const feedback = reviewed.filter((s) => s.feedback)[
    feedbackIndex % Math.max(reviewed.length, 1)
  ];
  return (
    <div ref={root} className="overview">
      <div className="stats-grid">
        {[
          {
            icon: teacher ? Users : BookOpen,
            label: teacher ? "Всего учеников" : "Мои задания",
            value: teacher ? students.length : active.length,
            hint: teacher
              ? `${data.groups.length} учебные группы`
              : "Всё для уверенного результата",
            color: "sage",
            action: teacher ? "students" : "assignments",
          },
          {
            icon: ClipboardCheck,
            label: "Ожидают проверки",
            value: pending.length,
            hint: teacher
              ? "Ваше внимание меняет многое"
              : "Скоро будет обратная связь",
            color: "peach",
            action: "review",
          },
          {
            icon: TrendingUp,
            label: "Средний результат",
            value: `${average}%`,
            hint: "По всем проверенным работам",
            color: "purple",
            action: "gradebook",
          },
          {
            icon: teacher ? CalendarDays : CheckCheck,
            label: teacher ? "Ближайшие занятия" : "Проверено работ",
            value: teacher ? upcoming.length : reviewed.length,
            hint: teacher ? "В вашем расписании" : "Каждая работа — шаг вперёд",
            color: "blue",
            action: teacher ? "schedule" : "gradebook",
          },
        ].map((stat, i) => (
          <button
            key={i}
            className="stat-card"
            onClick={() => navigate(stat.action as View)}
          >
            <div className="stat-top">
              <span>{stat.label}</span>
              <span className={`stat-icon ${stat.color}`}>
                <stat.icon size={18} strokeWidth={1.7} />
              </span>
            </div>
            <div className="stat-value">
              {stat.value}
              <ArrowUpRight size={19} />
            </div>
            <div className="stat-hint">
              {i === 2 && <span className="tiny-green-dot" />}
              {stat.hint}
            </div>
          </button>
        ))}
      </div>
      <div className="focus-grid">
        <section className="focus-card">
          <div className="focus-copy">
            <div className="focus-eyebrow">
              <span /> ПРОСТРАНСТВО ДЛЯ РОСТА
            </div>
            <h2>
              Большой результат.
              <br />
              Начинается с малого.
            </h2>
            <p>
              {(teacher
                ? "Вы рядом с учениками. Мы рядом с вами."
                : "Ваш темп. Ваша цель. Мы рядом."
              )
                .split(" ")
                .map((w, i) => (
                  <span key={i}>{w} </span>
                ))}
            </p>
            <button onClick={() => navigate("gradebook")}>
              К результатам <ArrowUpRight size={16} />
            </button>
          </div>
          <OrbitArt />
        </section>
        <section className="next-lesson">
          <div className="next-heading">
            <span className="eyebrow">БЛИЖАЙШЕЕ ЗАНЯТИЕ</span>
            <CalendarDays size={17} />
          </div>
          {lesson ? (
            <>
              <div className="next-time">
                {timeLabel(lesson.startsAt)}{" "}
                <span>· {dateLabel(lesson.startsAt)}</span>
              </div>
              <h3>{lesson.title}</h3>
              <p>
                {data.groups.find((g) => g.id === lesson.groupId)?.name}{" "}
                <span>· {lesson.duration} мин</span>
              </p>
              <div className="next-bottom">
                <AvatarStack
                  users={students.filter((u) =>
                    data.groups
                      .find((g) => g.id === lesson.groupId)
                      ?.studentIds.includes(u.id),
                  )}
                />
                <button
                  className="round-button"
                  aria-label="Открыть расписание"
                  onClick={() => navigate("schedule")}
                >
                  <ArrowUpRight size={18} />
                </button>
              </div>
            </>
          ) : (
            <div className="no-lesson">
              <h3>Время для новых планов</h3>
              <button
                className="text-button"
                onClick={teacher ? openLesson : () => navigate("schedule")}
              >
                {teacher ? "Добавить занятие" : "Открыть расписание"}
                <ArrowRight size={16} />
              </button>
            </div>
          )}
        </section>
      </div>
      <div className="dashboard-grid">
        <ProgressChart data={data} />
        <section className="panel review-panel" data-reveal>
          <div className="panel-heading">
            <h2>
              {teacher ? "Ждут вашей проверки" : "Обратная связь"}{" "}
              {teacher && <span className="count-badge">{pending.length}</span>}
            </h2>
            <button
              className="icon-button"
              aria-label={
                teacher ? "Открыть очередь проверки" : "Открыть результаты"
              }
              onClick={() => navigate(teacher ? "review" : "gradebook")}
            >
              <ArrowUpRight size={18} />
            </button>
          </div>
          {teacher ? (
            <>
              {pending.length ? (
                pending.slice(0, 3).map((s) => {
                  const student = data.users.find((u) => u.id === s.studentId)!;
                  const a = data.assignments.find(
                    (a) => a.id === s.assignmentId,
                  )!;
                  return (
                    <button
                      className="review-preview-row"
                      key={s.id}
                      onClick={() => openReview(s)}
                    >
                      <Avatar user={student} />
                      <div>
                        <strong>{student.name}</strong>
                        <p>{a.title}</p>
                        <small>
                          <Clock3 size={11} />
                          {dateLabel(s.submittedAt)} в{" "}
                          {timeLabel(s.submittedAt)}
                        </small>
                      </div>
                      <ArrowUpRight size={16} className="row-arrow" />
                    </button>
                  );
                })
              ) : (
                <EmptyState
                  title="Всё проверено"
                  description="Можно выдохнуть. Новые работы появятся здесь."
                />
              )}
              <button
                className="panel-footer-button"
                onClick={() => navigate("review")}
              >
                Перейти к проверке <ArrowRight size={15} />
              </button>
            </>
          ) : feedback ? (
            <div className="feedback-preview">
              <span className="quote-mark">“</span>
              <p>{feedback.feedback}</p>
              <div className="feedback-author">
                <Avatar
                  user={data.users.find((u) => u.role === "teacher")!}
                  size="small"
                />
                <span>Ваш преподаватель</span>
                <button
                  className="icon-button"
                  aria-label="Предыдущая рецензия"
                  onClick={() =>
                    setFeedbackIndex(Math.max(0, feedbackIndex - 1))
                  }
                >
                  <ChevronLeft size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Следующая рецензия"
                  onClick={() => setFeedbackIndex(feedbackIndex + 1)}
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Всё впереди"
              description="После проверки здесь появится рецензия."
            />
          )}
        </section>
        <section className="panel recent-panel" data-reveal>
          <div className="panel-heading">
            <h2>Последние задания</h2>
            <button
              className="text-button"
              onClick={() => navigate("assignments")}
            >
              Все задания <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="table-scroll">
            <table className="assignment-table">
              <thead>
                <tr>
                  <th>Задание</th>
                  <th>Дедлайн</th>
                  <th>{teacher ? "Прогресс" : "Статус"}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {nextAssignments.map((a, i) => {
                  const total = data.submissions.filter(
                    (s) => s.assignmentId === a.id,
                  ).length;
                  const sub = data.submissions.find(
                    (s) =>
                      s.assignmentId === a.id && s.studentId === data.user.id,
                  );
                  return (
                    <tr
                      key={a.id}
                      onClick={() => openAssignment(a)}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === "Enter" && openAssignment(a)}
                    >
                      <td>
                        <div className="assignment-name">
                          <span className={`assignment-icon tone-${i % 3}`}>
                            <BookOpen size={17} />
                          </span>
                          <div>
                            <strong>{a.title}</strong>
                            <small>
                              {a.subject} · {taskCount(a.questions)}
                            </small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span
                          className={
                            !total && new Date(a.deadline) < new Date()
                              ? "text-orange"
                              : ""
                          }
                        >
                          {dateLabel(a.deadline)}
                        </span>
                        <small>до {timeLabel(a.deadline)}</small>
                      </td>
                      <td>
                        {teacher ? (
                          <div className="mini-progress">
                            <div>
                              <i
                                style={{
                                  width: `${(total / Math.max(a.studentIds.length, 1)) * 100}%`,
                                }}
                              />
                            </div>
                            <span>
                              {total}/{a.studentIds.length}
                            </span>
                          </div>
                        ) : (
                          <Status
                            status={sub?.status || "new"}
                            overdue={!sub && new Date(a.deadline) < new Date()}
                          />
                        )}
                      </td>
                      <td>
                        <ArrowUpRight size={16} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!nextAssignments.length && (
            <EmptyState
              title="Начнём с первого задания"
              description="Созданные задания появятся здесь."
            />
          )}
        </section>
        <section className="panel week-panel" data-reveal>
          <div className="panel-heading">
            <h2>На этой неделе</h2>
            <div className="week-arrows">
              <button
                className="icon-button"
                aria-label="Предыдущая неделя"
                onClick={() => {
                  setWeekOffset(weekOffset - 1);
                  const d = new Date(monday);
                  d.setDate(d.getDate() - 7);
                  setSelectedDay(d.toDateString());
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="icon-button"
                aria-label="Следующая неделя"
                onClick={() => {
                  setWeekOffset(weekOffset + 1);
                  const d = new Date(monday);
                  d.setDate(d.getDate() + 7);
                  setSelectedDay(d.toDateString());
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="week-strip">
            {week.map((d, i) => (
              <button
                key={i}
                className={`${d.toDateString() === selectedDay ? "selected" : ""} ${d.toDateString() === new Date().toDateString() ? "today" : ""}`}
                onClick={() => setSelectedDay(d.toDateString())}
              >
                <span>{["пн", "вт", "ср", "чт", "пт", "сб", "вс"][i]}</span>
                <strong>{d.getDate()}</strong>
                <i
                  className={
                    data.lessons.some(
                      (l) =>
                        new Date(l.startsAt).toDateString() ===
                        d.toDateString(),
                    )
                      ? "has-lesson"
                      : ""
                  }
                />
              </button>
            ))}
          </div>
          <div className="daily-lessons">
            {daily.length ? (
              daily.slice(0, 2).map((l, i) => (
                <button
                  key={l.id}
                  className={`daily-lesson tone-${i}`}
                  onClick={() => navigate("schedule")}
                >
                  <div>
                    <h4>{l.title}</h4>
                    <p>{data.groups.find((g) => g.id === l.groupId)?.name}</p>
                  </div>
                  <span>{timeLabel(l.startsAt)}</span>
                </button>
              ))
            ) : (
              <p className="day-off">Занятий нет. Время для себя.</p>
            )}
          </div>
          <button
            className="panel-footer-button"
            onClick={() => navigate("schedule")}
          >
            Открыть расписание <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <footer className="workspace-footer">
        <span>Meta Education · Учимся двигаться вперёд.</span>
        <span>
          Учиться. Пробовать. Расти.
          <span className="footer-flower" aria-hidden="true">
            <svg width="17" height="17" viewBox="0 0 20 20">
              <path
                d="M10 0v20M0 10h20M3 3l14 14M3 17 17 3"
                stroke="currentColor"
                strokeWidth="2"
              />
            </svg>
          </span>
        </span>
      </footer>
    </div>
  );
}
