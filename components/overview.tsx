"use client";
import { canTeach } from "@/lib/access";
import { useRef, useState } from "react";
import { lessonIncludesStudent, lessonParticipants } from "@/lib/lessons";
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
export default function Overview({
  data,
  navigate,
  openAssignment,
  openReview,
  openLesson,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const teacher = canTeach(data.user.role);
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
  const [feedbackIndex, setFeedbackIndex] = useState(0);
  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".stats-grid", {
          y: 15,
          opacity: 0,
          duration: 0.55,
          ease: "power2.out",
        });
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
    <div ref={root} className={`overview${teacher ? "" : " student-overview"}`}>
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
            action: teacher ? "review" : "assignments",
          },
          {
            icon: TrendingUp,
            label: "Средний результат",
            value: `${average}%`,
            hint: "По всем проверенным работам",
            color: "purple",
            action: teacher ? "gradebook" : "assignments",
          },
          {
            icon: teacher ? CalendarDays : CheckCheck,
            label: teacher ? "Ближайшие занятия" : "Проверено работ",
            value: teacher ? upcoming.length : reviewed.length,
            hint: teacher ? "В вашем расписании" : "Каждая работа — шаг вперёд",
            color: "blue",
            action: teacher ? "schedule" : "assignments",
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
      <div className={`focus-grid${teacher ? " teacher-focus-grid" : ""}`}>
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
                {lessonParticipants(lesson, data)}{" "}
                <span>· {lesson.duration} мин</span>
              </p>
              <div className="next-bottom">
                <AvatarStack
                  users={students.filter((u) =>
                    lessonIncludesStudent(lesson, u.id, data.groups),
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
        {teacher && (
          <section className="panel review-panel" data-reveal>
            <div className="panel-heading">
              <h2>
                {teacher ? "Ждут вашей проверки" : "Обратная связь"}{" "}
                {teacher && (
                  <span className="count-badge">{pending.length}</span>
                )}
              </h2>
              <button
                className="icon-button"
                aria-label={
                  teacher ? "Открыть очередь проверки" : "Открыть результаты"
                }
                onClick={() => navigate(teacher ? "review" : "assignments")}
              >
                <ArrowUpRight size={18} />
              </button>
            </div>
            {teacher ? (
              <>
                {pending.length ? (
                  pending.slice(0, 3).map((s) => {
                    const student = data.users.find(
                      (u) => u.id === s.studentId,
                    )!;
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
                    user={data.users.find((u) => canTeach(u.role))!}
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
        )}
      </div>
      {!teacher && (
        <div className="dashboard-grid">
          <section className="panel recent-panel" data-reveal>
            <div className="panel-heading">
              <h2>Последние задания</h2>
              <button
                className="text-button"
                onClick={() => navigate(teacher ? "gradebook" : "assignments")}
              >
                {teacher ? "К журналу" : "Все задания"}{" "}
                <ArrowUpRight size={15} />
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
                        onKeyDown={(e) =>
                          e.key === "Enter" && openAssignment(a)
                        }
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
                              overdue={
                                !sub && new Date(a.deadline) < new Date()
                              }
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
        </div>
      )}
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
