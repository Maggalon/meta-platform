"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  ClipboardCheck,
  Users,
  Layers3,
  ChartNoAxesCombined,
  CalendarDays,
  Settings2,
  CircleHelp,
  ArrowUpRight,
  Plus,
  Search,
  Bell,
  ChevronDown,
  Menu,
  X,
  ArrowRight,
  LogOut,
  Check,
  LoaderCircle,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import type {
  AppData,
  View,
  Assignment,
  Submission,
  Group,
  SafeUser,
} from "@/lib/types";
import { api, Avatar, Logo, Modal, dateLabel, EmptyState } from "./ui";
import Overview from "./overview";
import {
  AssignmentsView,
  ReviewView,
  StudentsView,
  GroupsView,
  GradebookView,
  ScheduleView,
  SettingsView,
} from "./views";
import {
  AssignmentForm,
  AssignmentDetails,
  ReviewForm,
  InviteForm,
  GroupForm,
  LessonForm,
  StudentProfile,
} from "./forms";
import AuthScreen from "./auth";

const navigation = [
  { id: "overview", label: "Обзор", icon: LayoutDashboard },
  { id: "assignments", label: "Задания", icon: BookOpen },
  { id: "review", label: "На проверке", icon: ClipboardCheck },
  { id: "students", label: "Ученики", icon: Users },
  { id: "groups", label: "Группы", icon: Layers3 },
  { id: "gradebook", label: "Журнал успеваемости", icon: ChartNoAxesCombined },
  { id: "schedule", label: "Расписание", icon: CalendarDays },
] as const;
const descriptions: Record<View, string> = {
  overview: "Каждый маленький шаг приближает к большому результату.",
  assignments: "Всё, что помогает двигаться вперёд. В одном месте.",
  review: "Ваши комментарии помогают ученикам расти.",
  students: "Разные пути. Общая цель — уверенный результат.",
  groups: "Объединяйте учеников и двигайтесь к цели вместе.",
  gradebook: "Весь путь к результату — в одной таблице.",
  schedule: "У каждого важного шага есть своё время.",
  settings: "Пусть ваше пространство будет удобным.",
};
type ModalState =
  | { type: "createAssignment" }
  | { type: "assignment"; id: string }
  | { type: "review"; id: string }
  | { type: "invite" }
  | { type: "group"; id?: string }
  | { type: "lesson" }
  | { type: "student"; id: string }
  | { type: "help" };

export default function Platform({ demoEnabled }: { demoEnabled: boolean }) {
  const [data, setData] = useState<AppData | null>(null),
    [loading, setLoading] = useState(true),
    [auth, setAuth] = useState(false),
    [error, setError] = useState(""),
    [invite, setInvite] = useState(""),
    [view, setView] = useState<View>("overview"),
    [query, setQuery] = useState(""),
    [modal, setModal] = useState<ModalState | null>(null),
    [mobile, setMobile] = useState(false),
    [notifications, setNotifications] = useState(false),
    [toast, setToast] = useState(""),
    [switching, setSwitching] = useState(false),
    [searchFocused, setSearchFocused] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const refresh = useCallback(async () => {
    const next = await api<AppData>("data");
    setData(next);
    setAuth(false);
    setInvite("");
  }, []);
  useEffect(() => {
    const token =
      new URLSearchParams(window.location.search).get("invite") || "";
    if (token) {
      setInvite(token);
      setAuth(true);
      setLoading(false);
      return;
    }
    const hash = window.location.hash.slice(1) as View;
    if ([...navigation.map((n) => n.id), "settings"].includes(hash))
      setView(hash);
    refresh()
      .catch((e) => {
        if (e.message.includes("Войдите")) setAuth(true);
        else setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.slice(1) as View;
      setView(
        [...navigation.map((n) => n.id), "settings"].includes(hash)
          ? hash
          : "overview",
      );
      setQuery("");
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        search.current?.focus();
      }
      if (e.key === "Escape") {
        setNotifications(false);
        setSearchFocused(false);
        setMobile(false);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  function navigate(next: View) {
    setView(next);
    window.history.pushState({}, "", `/#${next}`);
    setQuery("");
    setMobile(false);
    setNotifications(false);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  const closeModal = useCallback(() => setModal(null), []);
  const openAssignment = (a: Assignment) =>
    setModal({ type: "assignment", id: a.id });
  const openReview = (s: Submission) => setModal({ type: "review", id: s.id });
  const done = async (message: string) => {
    await refresh();
    setModal(null);
    setToast(message);
  };
  async function switchRole(role: "teacher" | "student") {
    setSwitching(true);
    try {
      await api("auth/demo", { role });
      await refresh();
      navigate("overview");
      setToast(
        role === "teacher"
          ? "Открыт кабинет преподавателя"
          : "Открыт кабинет ученика",
      );
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setSwitching(false);
    }
  }
  async function logout() {
    try {
      await api("auth/logout", {});
      setAuth(true);
      setModal(null);
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  if (loading)
    return (
      <div className="app-loading">
        <Logo dark />
        <div className="loading-orbit">
          <i />
          <i />
          <i />
        </div>
        <p>Собираем ваше пространство…</p>
      </div>
    );
  if (auth)
    return (
      <AuthScreen
        invite={invite}
        onLogin={async () => {
          await refresh();
          navigate("overview");
        }}
        demo={demoEnabled}
      />
    );
  if (!data)
    return (
      <div className="app-loading">
        <Logo dark />
        <h2>Не удалось открыть платформу</h2>
        <p>{error || "Проверьте соединение и попробуйте ещё раз"}</p>
        <button
          className="button primary"
          onClick={() => window.location.reload()}
        >
          Повторить
        </button>
      </div>
    );
  const teacher = data.user.role === "teacher";
  const currentView =
    !teacher && ["students", "groups"].includes(view) ? "overview" : view;
  const pending = data.submissions.filter((s) => s.status === "pending");
  const firstName = data.user.name.split(" ")[0];
  const title =
    currentView === "overview"
      ? `Хорошего дня, ${firstName}`
      : currentView === "settings"
        ? "Настройки профиля"
        : navigation.find((n) => n.id === currentView)?.label || "Обзор";
  const common = { data, query };
  const a =
    modal?.type === "assignment"
      ? data.assignments.find((a) => a.id === modal.id)
      : undefined;
  const s =
    modal?.type === "review"
      ? data.submissions.find((s) => s.id === modal.id)
      : undefined;
  const group =
    modal?.type === "group"
      ? data.groups.find((g) => g.id === modal.id)
      : undefined;
  const student =
    modal?.type === "student"
      ? data.users.find((u) => u.id === modal.id)
      : undefined;
  const searchAssignments = data.assignments
    .filter((a) => a.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 4);
  const searchStudents = teacher
    ? data.users
        .filter(
          (u) =>
            u.role === "student" &&
            u.name.toLowerCase().includes(query.toLowerCase()),
        )
        .slice(0, 3)
    : [];
  function primaryAction() {
    if (currentView === "students") setModal({ type: "invite" });
    else if (currentView === "groups") setModal({ type: "group" });
    else if (currentView === "schedule") setModal({ type: "lesson" });
    else setModal({ type: "createAssignment" });
  }
  return (
    <div className="app-shell">
      {mobile && (
        <button
          className="sidebar-scrim"
          aria-label="Закрыть меню"
          onClick={() => setMobile(false)}
        />
      )}
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand-link"
          href="/#overview"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
          aria-label="Meta Education, главная"
        >
          <Logo />
        </a>
        <p className="brand-caption">Платформа для подготовки к ЕГЭ</p>
        <button className="workspace-switch" onClick={() => navigate("groups")}>
          <span className="workspace-icon">
            <BookOpen size={18} />
          </span>
          <span>
            <strong>Математика</strong>
            <small>Учебное пространство</small>
          </span>
          {teacher && <ChevronDown size={15} />}
        </button>
        <div className="nav-label">ВАШЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Главная навигация">
          {navigation
            .filter((n) => teacher || !["students", "groups"].includes(n.id))
            .map((n) => (
              <a
                href={`/#${n.id}`}
                key={n.id}
                className={`nav-item ${currentView === n.id ? "active" : ""}`}
                aria-current={currentView === n.id ? "page" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  navigate(n.id);
                }}
              >
                <n.icon size={19} strokeWidth={1.65} />
                <span>
                  {n.id === "review" && !teacher ? "Мои работы" : n.label}
                </span>
                {n.id === "review" && pending.length > 0 && (
                  <b>{pending.length}</b>
                )}
              </a>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <div className="note-spark">
              <Sparkles size={17} />
            </div>
            <p>
              Большие цели.
              <br />
              <strong>Маленькие шаги.</strong>
            </p>
            <div className="note-line" />
          </div>
          <button
            className={`nav-item ${currentView === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} />
            <span>Настройки</span>
          </button>
          <button
            className="nav-item"
            onClick={() => setModal({ type: "help" })}
          >
            <CircleHelp size={19} />
            <span>Помощь и поддержка</span>
            <ArrowUpRight size={15} />
          </button>
          <div className="sidebar-profile">
            <button onClick={() => navigate("settings")}>
              <Avatar user={data.user} />
              <span>
                <strong>{data.user.name}</strong>
                <small>{teacher ? "Преподаватель" : "Ученик"}</small>
              </span>
            </button>
            <button
              className="logout-button"
              onClick={logout}
              aria-label="Выйти из аккаунта"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              aria-label="Открыть меню"
              onClick={() => setMobile(true)}
            >
              <Menu size={21} />
            </button>
            <span>Моё пространство</span>
            <ChevronRight size={13} />
            <strong>
              {currentView === "settings"
                ? "Настройки"
                : navigation.find((n) => n.id === currentView)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            <div className="global-search">
              <Search size={17} />
              <input
                ref={search}
                aria-label="Поиск по платформе"
                placeholder="Найти в пространстве…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setTimeout(() => setSearchFocused(false), 180)}
              />
              {query ? (
                <button
                  aria-label="Очистить поиск"
                  onClick={() => setQuery("")}
                >
                  <X size={13} />
                </button>
              ) : (
                <kbd>⌘ K</kbd>
              )}
              {searchFocused && query && (
                <div className="search-results">
                  <p>Результаты поиска</p>
                  {searchAssignments.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => {
                        openAssignment(a);
                        setSearchFocused(false);
                      }}
                    >
                      <BookOpen size={16} />
                      <span>{a.title}</span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                  {searchStudents.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => {
                        setModal({ type: "student", id: u.id });
                        setSearchFocused(false);
                      }}
                    >
                      <Avatar user={u} size="tiny" />
                      <span>{u.name}</span>
                      <ArrowUpRight size={14} />
                    </button>
                  ))}
                  {!searchAssignments.length && !searchStudents.length && (
                    <p className="muted">Ничего не найдено</p>
                  )}
                </div>
              )}
            </div>
            <span className="topbar-divider" />
            <div className="notification-wrap">
              <button
                className={`notification-button ${notifications ? "selected" : ""}`}
                aria-label="Уведомления"
                aria-expanded={notifications}
                onClick={() => setNotifications(!notifications)}
              >
                <Bell size={19} />
                {pending.length > 0 && <i />}
              </button>
              {notifications && (
                <div className="notifications-panel">
                  <div>
                    <h3>Что нового</h3>
                    <button
                      className="icon-button"
                      aria-label="Закрыть уведомления"
                      onClick={() => setNotifications(false)}
                    >
                      <X size={16} />
                    </button>
                  </div>
                  {pending.length ? (
                    pending.slice(0, 4).map((s) => (
                      <button
                        key={s.id}
                        onClick={() => {
                          openReview(s);
                          setNotifications(false);
                        }}
                      >
                        <span className="notification-dot" />
                        <span>
                          <strong>
                            {teacher
                              ? `${data.users.find((u) => u.id === s.studentId)?.name} отправил(а) работу`
                              : "Работа ожидает проверки"}
                          </strong>
                          <small>
                            {
                              data.assignments.find(
                                (a) => a.id === s.assignmentId,
                              )?.title
                            }
                          </small>
                        </span>
                      </button>
                    ))
                  ) : (
                    <p>Все работы проверены. Вы ничего не пропустили.</p>
                  )}
                </div>
              )}
            </div>
            <button
              className="topbar-avatar"
              onClick={() => navigate("settings")}
              aria-label="Мой профиль"
            >
              <Avatar user={data.user} size="small" />
            </button>
          </div>
        </header>
        <div className="page-content">
          <div className="page-heading">
            <div>
              <div className="page-eyebrow">
                {currentView === "overview" ? (
                  <>
                    <span className="tiny-green-dot" />
                    {dateLabel(new Date().toISOString(), {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </>
                ) : (
                  <span>
                    {teacher ? "КАБИНЕТ ПРЕПОДАВАТЕЛЯ" : "КАБИНЕТ УЧЕНИКА"}
                  </span>
                )}
              </div>
              <h1>
                {title}
                {currentView === "overview" && (
                  <span className="greeting-spark" aria-hidden="true">
                    <svg viewBox="0 0 35 35">
                      <path
                        d="M17.5 0v35M0 17.5h35M5 5l25 25M5 30 30 5"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                    </svg>
                  </span>
                )}
              </h1>
              <p>
                {!teacher && currentView === "review"
                  ? "Ваши решения и комментарии преподавателя."
                  : descriptions[currentView]}
              </p>
            </div>
            {teacher && currentView !== "settings" && (
              <button
                className="button primary create-button"
                onClick={primaryAction}
              >
                <Plus size={18} />
                {currentView === "students"
                  ? "Пригласить ученика"
                  : currentView === "groups"
                    ? "Создать группу"
                    : currentView === "schedule"
                      ? "Добавить занятие"
                      : "Создать задание"}
              </button>
            )}
            {!teacher && currentView === "overview" && (
              <button
                className="button primary"
                onClick={() => navigate("assignments")}
              >
                К моим заданиям
                <ArrowRight size={17} />
              </button>
            )}
          </div>
          {currentView === "overview" && (
            <Overview
              data={data}
              navigate={navigate}
              openAssignment={openAssignment}
              openReview={openReview}
              openLesson={() => setModal({ type: "lesson" })}
            />
          )}{" "}
          {currentView === "assignments" && (
            <AssignmentsView
              {...common}
              onOpen={openAssignment}
              onCreate={() => setModal({ type: "createAssignment" })}
            />
          )}{" "}
          {currentView === "review" && (
            <ReviewView {...common} onOpen={openReview} />
          )}{" "}
          {currentView === "students" && teacher && (
            <StudentsView
              {...common}
              onInvite={() => setModal({ type: "invite" })}
              onStudent={(u) => setModal({ type: "student", id: u.id })}
            />
          )}{" "}
          {currentView === "groups" && teacher && (
            <GroupsView
              {...common}
              onEdit={(g) => setModal({ type: "group", id: g.id })}
              onCreate={() => setModal({ type: "group" })}
            />
          )}{" "}
          {currentView === "gradebook" && (
            <GradebookView
              {...common}
              onReview={openReview}
              onAssignment={openAssignment}
            />
          )}{" "}
          {currentView === "schedule" && (
            <ScheduleView
              {...common}
              onCreate={() => setModal({ type: "lesson" })}
            />
          )}{" "}
          {currentView === "settings" && (
            <SettingsView data={data} onSaved={refresh} />
          )}
        </div>
        {data.demo && (
          <div className="demo-switcher">
            <span>
              <i />
              Деморежим
            </span>
            <select
              aria-label="Переключить демо-роль"
              value={data.user.role}
              disabled={switching}
              onChange={(e) =>
                switchRole(e.target.value as "teacher" | "student")
              }
            >
              <option value="teacher">Преподаватель</option>
              <option value="student">Ученик</option>
            </select>
          </div>
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={19} />
          {toast}
          <button aria-label="Скрыть сообщение" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal?.type === "createAssignment" && (
        <Modal
          title="Новое задание"
          subtitle="Ещё один шаг к уверенному результату"
          onClose={closeModal}
        >
          <AssignmentForm data={data} onDone={done} />
        </Modal>
      )}
      {modal?.type === "assignment" && a && (
        <Modal title={a.title} onClose={closeModal}>
          <AssignmentDetails
            assignment={a}
            data={data}
            onDone={done}
            onReview={openReview}
          />
        </Modal>
      )}
      {modal?.type === "review" && s && (
        <Modal
          title={teacher ? "Проверка работы" : "Моя работа"}
          subtitle="Внимание к деталям помогает расти"
          onClose={closeModal}
          wide
        >
          <ReviewForm submission={s} data={data} onDone={done} />
        </Modal>
      )}
      {modal?.type === "invite" && (
        <Modal title="Пригласить ученика" onClose={closeModal}>
          <InviteForm data={data} />
        </Modal>
      )}
      {modal?.type === "group" && (
        <Modal
          title={group ? "Настройки группы" : "Новая группа"}
          onClose={closeModal}
        >
          <GroupForm group={group} data={data} onDone={done} />
        </Modal>
      )}
      {modal?.type === "lesson" && (
        <Modal title="Новое занятие" onClose={closeModal}>
          <LessonForm data={data} onDone={done} />
        </Modal>
      )}
      {modal?.type === "student" && student && (
        <Modal title="Профиль ученика" onClose={closeModal}>
          <StudentProfile student={student} data={data} onReview={openReview} />
        </Modal>
      )}
      {modal?.type === "help" && (
        <Modal
          title="Мы рядом"
          subtitle="Ответы на частые вопросы о Точке"
          onClose={closeModal}
        >
          <div className="help-content">
            {[
              [
                "Как начать работу?",
                "Создайте группы и пригласите учеников. В разделе «Задания» добавьте условия, дедлайн и выберите получателей. Задание сразу появится в их кабинетах.",
              ],
              [
                "Как ученику сдать решение?",
                "Откройте задание, введите краткие ответы и при необходимости приложите JPG, PNG или PDF. Нажмите «Отправить на проверку». Каждый файл может весить до 20 МБ.",
              ],
              [
                "Как проверить работу?",
                "Откройте раздел «На проверке». Работы по умолчанию отсортированы от старых к новым. Выставьте баллы, напишите рецензию и нажмите «Опубликовать результат».",
              ],
              [
                "Кто видит решения и рецензии?",
                "Решения и рецензии доступны только автору работы и преподавателю. Ссылки на файлы требуют авторизации. Ссылки S3 действуют одну минуту.",
              ],
              [
                "Как получить доступ к аккаунту?",
                "Регистрация возможна по приглашению преподавателя. Если вы забыли пароль, обратитесь к преподавателю или администратору вашей платформы.",
              ],
            ].map(([q, a], i) => (
              <details key={q} open={i === 0}>
                <summary>
                  {q}
                  <Plus size={17} />
                </summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
