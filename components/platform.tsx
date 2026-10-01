"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  BookOpen,
  NotebookPen,
  ClipboardCheck,
  Users,
  Layers3,
  ChartNoAxesCombined,
  CalendarDays,
  Settings2,
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
  ShieldCheck,
} from "lucide-react";
import type {
  AppData,
  View,
  Assignment,
  Submission,
  Group,
  SafeUser,
  Role,
} from "@/lib/types";
import {
  availableWorkspaces,
  canOpenView,
  canTeach,
  canManage,
  hasWorkspace,
  roleNames,
} from "@/lib/access";
import AccessManagement from "./access-management";
import { api, Avatar, Logo, Modal, dateLabel, EmptyState } from "./ui";
import Overview from "./overview";
import { GradebookView } from "./gradebook";
import {
  AssignmentsView,
  ReviewView,
  StudentsView,
  GroupsView,
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
import WorkspaceSwitcher from "./workspace-switcher";
import {
  workspaceLocation,
  workspaceHref,
  workspaceNames,
  type Workspace,
} from "@/lib/workspace";
import {
  WorkbookNavigation,
  WorkbookView,
  workbookBlocks,
  type WorkbookBlock,
} from "./workbook";

const navigation = [
  { id: "overview", label: "Обзор", icon: LayoutDashboard },
  { id: "assignments", label: "Задания", icon: BookOpen },
  { id: "workbook", label: "Рабочая тетрадь", icon: NotebookPen },
  { id: "review", label: "На проверке", icon: ClipboardCheck },
  { id: "students", label: "Ученики", icon: Users },
  { id: "groups", label: "Группы", icon: Layers3 },
  { id: "gradebook", label: "Журнал успеваемости", icon: ChartNoAxesCombined },
  { id: "schedule", label: "Расписание", icon: CalendarDays },
  { id: "access", label: "Доступ и приглашения", icon: ShieldCheck },
] as const;
const descriptions: Record<View, string> = {
  overview: "Каждый маленький шаг приближает к большому результату.",
  assignments: "Всё, что помогает двигаться вперёд. В одном месте.",
  workbook: "Материалы для самостоятельной работы по блокам.",
  review: "Ваши комментарии помогают ученикам расти.",
  students: "Разные пути. Общая цель — уверенный результат.",
  groups: "Объединяйте учеников и двигайтесь к цели вместе.",
  gradebook: "У каждого свой темп. Задания и результаты каждого ученика.",
  schedule: "У каждого важного шага есть своё время.",
  settings: "Пусть ваше пространство будет удобным.",
  access: "Пользователи, приглашения и учебные пространства.",
};
function readLocation() {
  return workspaceLocation(window.location.hash);
}
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
    [selectedWorkspace, setWorkspace] = useState<Workspace>("math"),
    [workbookBlock, setWorkbookBlock] = useState<WorkbookBlock>(1),
    [query, setQuery] = useState(""),
    [modal, setModal] = useState<ModalState | null>(null),
    [mobile, setMobile] = useState(false),
    [notifications, setNotifications] = useState(false),
    [toast, setToast] = useState(""),
    [switching, setSwitching] = useState(false),
    [searchFocused, setSearchFocused] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const spaces = data ? availableWorkspaces(data.user) : [];
  const workspace = spaces.includes(selectedWorkspace)
    ? selectedWorkspace
    : (spaces[0] ?? "math");
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
    const location = readLocation();
    setView(location.view);
    setWorkspace(location.workspace);
    setWorkbookBlock(location.block);
    refresh()
      .catch((e) => {
        if (e.message.includes("Войдите")) setAuth(true);
        else setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [refresh]);
  useEffect(() => {
    if (auth || !data) return;
    const sync = () => {
      if (document.visibilityState === "visible")
        void refresh().catch(() => {});
    };
    window.addEventListener("focus", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      window.removeEventListener("focus", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [auth, data?.user.id, refresh]);
  useEffect(() => {
    const handler = () => {
      const location = readLocation();
      setView(location.view);
      setWorkspace(location.workspace);
      setWorkbookBlock(location.block);
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
  function navigate(
    next: View,
    block: WorkbookBlock = 1,
    space: Workspace = workspace,
  ) {
    const href = workspaceHref(next, space, block);
    setWorkspace(workspaceLocation(href.slice(1)).workspace);
    setView(next);
    setWorkbookBlock(block);
    window.history.pushState({}, "", href);
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
  async function switchRole(role: Role) {
    setSwitching(true);
    try {
      await api("auth/demo", { role });
      await refresh();
      navigate("overview", 1, "math");
      setModal(null);
      setToast(`Вы вошли в деморежим: ${roleNames[role]}`);
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
          navigate("overview", 1, "math");
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
  const teacher = canTeach(data.user.role);
  const management = canManage(data.user.role);
  const workspaceAvailable = hasWorkspace(data.user, workspace);
  const currentView = canOpenView(data.user, view, workspace)
    ? view
    : management
      ? "access"
      : "overview";
  const pending = data.submissions.filter((s) => s.status === "pending");
  const firstName = data.user.name.split(" ")[0];
  const title =
    currentView === "overview" && !workspaceAvailable
      ? "Нет доступных пространств"
      : currentView === "overview"
        ? workspace === "design"
          ? "Проектирование"
          : `Хорошего дня, ${firstName}`
        : currentView === "settings"
          ? "Настройки профиля"
          : currentView === "workbook"
            ? workbookBlock === 1
              ? "Где я сейчас?"
              : workbookBlock === 2
                ? "Компас"
                : workbookBlock === 3
                  ? "Дневник хорошего времени"
                  : workbookBlock === 4
                    ? "Карта"
                    : workbookBlock === 5
                      ? "Планы Одиссеи"
                      : "Журнал неудач"
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
    if (currentView === "students" && management) setModal({ type: "invite" });
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
          href={workspaceHref("overview", workspace)}
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
          aria-label="Meta Education, главная"
        >
          <Logo />
        </a>
        <p className="brand-caption">Платформа для подготовки к ЕГЭ</p>
        {spaces.length > 0 && (
          <WorkspaceSwitcher
            value={workspace}
            available={spaces}
            onChange={(space) => {
              if (space !== workspace)
                navigate(
                  space === "design" && !teacher ? "workbook" : "overview",
                  1,
                  space,
                );
            }}
          />
        )}
        <div className="nav-label">ВАШЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Главная навигация">
          {navigation
            .filter((n) => canOpenView(data.user, n.id, workspace))
            .map((n) =>
              n.id === "workbook" ? (
                <WorkbookNavigation
                  key={n.id}
                  selectedBlock={
                    currentView === "workbook" ? workbookBlock : null
                  }
                  onSelect={(block) => navigate("workbook", block)}
                />
              ) : (
                <a
                  href={workspaceHref(n.id, workspace)}
                  key={n.id}
                  className={`nav-item ${currentView === n.id ? "active" : ""}`}
                  aria-current={currentView === n.id ? "page" : undefined}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(n.id);
                  }}
                >
                  <n.icon size={19} strokeWidth={1.65} />
                  <span>{n.label}</span>
                  {n.id === "review" && pending.length > 0 && (
                    <b>{pending.length}</b>
                  )}
                </a>
              ),
            )}
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
          <div className="sidebar-profile">
            <button onClick={() => navigate("settings")}>
              <Avatar user={data.user} />
              <span>
                <strong title={data.user.name}>{data.user.name}</strong>
                <small>{roleNames[data.user.role]}</small>
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
            <span>
              {currentView === "access" || !workspaceAvailable
                ? "Платформа"
                : workspaceNames[workspace]}
            </span>
            <ChevronRight size={13} />
            <strong>
              {currentView === "settings"
                ? "Настройки"
                : navigation.find((n) => n.id === currentView)?.label}
            </strong>
          </div>
          <div className="topbar-right">
            {workspaceAvailable &&
              workspace === "math" &&
              currentView !== "access" && (
                <div className="global-search">
                  <Search size={17} />
                  <input
                    ref={search}
                    aria-label="Поиск по платформе"
                    placeholder="Найти в пространстве…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() =>
                      setTimeout(() => setSearchFocused(false), 180)
                    }
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
              )}
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
                  <span>{roleNames[data.user.role].toUpperCase()}</span>
                )}
              </div>
              <h1>
                {title}
                {currentView === "overview" && workspace === "math" && (
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
                {currentView === "workbook" && workbookBlock <= 6
                  ? `Рабочая тетрадь · Блок ${workbookBlock}`
                  : currentView === "overview" && workspace === "design"
                    ? "Исследуйте себя и пробуйте новые варианты жизни."
                    : descriptions[currentView]}
              </p>
            </div>
            {teacher &&
              workspaceAvailable &&
              workspace === "math" &&
              !["settings", "access"].includes(currentView) &&
              (currentView !== "students" || management) && (
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
            {data.user.role === "student" &&
              workspaceAvailable &&
              workspace === "math" &&
              currentView === "overview" && (
                <button
                  className="button primary"
                  onClick={() => navigate("assignments")}
                >
                  К моим заданиям
                  <ArrowRight size={17} />
                </button>
              )}
          </div>
          {currentView === "access" && management && (
            <AccessManagement
              data={data}
              onRefresh={refresh}
              onInvite={() => setModal({ type: "invite" })}
            />
          )}
          {currentView === "overview" && !workspaceAvailable && (
            <EmptyState
              title="Доступ пока не открыт"
              description="Обратитесь к менеджеру или администратору, чтобы подключить учебное пространство. Ваши сохранённые работы останутся в платформе."
            />
          )}
          {currentView === "overview" &&
            workspaceAvailable &&
            workspace === "design" && (
              <section className="panel design-home">
                <p>
                  {teacher
                    ? "Рабочая тетрадь доступна в личном кабинете ученика. Каждый ученик самостоятельно заполняет шесть блоков; его записи остаются личными."
                    : "Рабочая тетрадь — шесть блоков для исследования своих ориентиров, идей и планов. Выберите блок, чтобы продолжить."}
                </p>
                {!teacher && (
                  <ol className="design-blocks">
                    {[
                      "Где я сейчас?",
                      "Компас",
                      "Дневник хорошего времени",
                      "Карта",
                      "Планы Одиссеи",
                      "Журнал неудач",
                    ].map((name, index) => (
                      <li key={name}>
                        <a
                          href={workspaceHref("workbook", "design", index + 1)}
                          onClick={(event) => {
                            if (
                              event.ctrlKey ||
                              event.metaKey ||
                              event.shiftKey ||
                              event.altKey
                            )
                              return;
                            event.preventDefault();
                            navigate("workbook", workbookBlocks[index]);
                          }}
                        >
                          <span>0{index + 1}</span>
                          <strong>{name}</strong>
                          <ArrowUpRight size={16} />
                        </a>
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            )}
          {currentView === "overview" &&
            workspaceAvailable &&
            workspace === "math" && (
              <Overview
                data={data}
                navigate={navigate}
                openAssignment={openAssignment}
                openReview={openReview}
                openLesson={() => setModal({ type: "lesson" })}
              />
            )}{" "}
          {currentView === "assignments" && !teacher && (
            <AssignmentsView
              {...common}
              onOpen={openAssignment}
              onCreate={() => setModal({ type: "createAssignment" })}
            />
          )}{" "}
          {currentView === "workbook" && !teacher && (
            <WorkbookView
              key={`${data.user.id}-${workbookBlock}`}
              block={workbookBlock}
            />
          )}
          {currentView === "review" && teacher && (
            <ReviewView {...common} onOpen={openReview} />
          )}{" "}
          {currentView === "students" && teacher && (
            <StudentsView
              {...common}
              onInvite={
                management ? () => setModal({ type: "invite" }) : undefined
              }
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
          {currentView === "gradebook" && teacher && (
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
              onChange={(e) => switchRole(e.target.value as Role)}
            >
              <option value="teacher">Преподаватель</option>
              <option value="student">Ученик</option>
              <option value="manager">Менеджер</option>
              <option value="admin">Администратор</option>
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
      {modal?.type === "createAssignment" &&
        teacher &&
        hasWorkspace(data.user, "math") && (
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
      {modal?.type === "invite" && management && (
        <Modal title="Пригласить пользователя" onClose={closeModal}>
          <InviteForm data={data} />
        </Modal>
      )}
      {modal?.type === "group" &&
        teacher &&
        hasWorkspace(data.user, "math") && (
          <Modal
            title={group ? "Настройки группы" : "Новая группа"}
            onClose={closeModal}
          >
            <GroupForm group={group} data={data} onDone={done} />
          </Modal>
        )}
      {modal?.type === "lesson" &&
        teacher &&
        hasWorkspace(data.user, "math") && (
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
          subtitle="Ответы на частые вопросы о Мете"
          onClose={closeModal}
        >
          <div className="help-content">
            {[
              [
                "Как начать работу?",
                "Менеджер или администратор приглашает учеников и открывает учебные пространства в разделе «Доступ и приглашения». Преподаватель создаёт группы и задания, выбирает получателей и проверяет работы.",
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
                "Регистрация возможна по приглашению менеджера или администратора. Если вы забыли пароль, обратитесь к администратору вашей платформы.",
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
