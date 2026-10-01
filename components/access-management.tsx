"use client";

import { useState } from "react";
import { Plus, Search, LoaderCircle } from "lucide-react";
import type { AppData, SafeUser } from "@/lib/types";
import { allWorkspaces, canManageAccess, roleNames } from "@/lib/access";
import { workspaceNames, type Workspace } from "@/lib/workspace";
import { api, Avatar, EmptyState } from "./ui";

export default function AccessManagement({
  data,
  onRefresh,
  onInvite,
}: {
  data: AppData;
  onRefresh: () => Promise<void>;
  onInvite: () => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const people = data.users.filter(
    (user) =>
      user.id !== data.user.id &&
      user.role !== "admin" &&
      (role === "all" || user.role === role) &&
      `${user.name} ${user.email}`.toLowerCase().includes(query.toLowerCase()),
  );

  async function toggle(user: SafeUser, workspace: Workspace) {
    setBusy(user.id);
    setError("");
    setNotice("");
    const opening = !user.workspaceIds.includes(workspace);
    try {
      await api("access", {
        userId: user.id,
        workspaceIds: opening
          ? [...user.workspaceIds, workspace]
          : user.workspaceIds.filter((value) => value !== workspace),
      });
      await onRefresh();
      setNotice(
        `${user.name}: доступ к пространству «${workspaceNames[workspace]}» ${opening ? "открыт" : "закрыт"}.`,
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="access-management">
      <div className="access-intro">
        <p>
          Приглашайте учеников и преподавателей и выбирайте доступные им
          пространства.
          {data.user.role === "admin" &&
            " Вы также можете приглашать менеджеров."}{" "}
          Изменения применяются сразу. Сохранённые работы остаются в платформе.
        </p>
        <button className="button primary" onClick={onInvite}>
          <Plus size={18} />
          Пригласить пользователя
        </button>
      </div>
      <div className="view-toolbar access-toolbar">
        <label className="access-search">
          <Search size={17} />
          <input
            aria-label="Найти пользователя"
            placeholder="Имя или email"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          aria-label="Роль пользователя"
          value={role}
          onChange={(event) => setRole(event.target.value)}
        >
          <option value="all">Все роли</option>
          <option value="student">Ученики</option>
          <option value="teacher">Преподаватели</option>
          {data.user.role === "admin" && (
            <option value="manager">Менеджеры</option>
          )}
        </select>
        <span className="results-count">
          Пользователей: <strong>{people.length}</strong>
        </span>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <p className="access-notice" role="status">
        {busy ? "Сохраняем доступ…" : notice}
      </p>
      <section className="panel full-table">
        <div className="table-scroll">
          <table className="access-table">
            <thead>
              <tr>
                <th>Пользователь</th>
                <th>Роль</th>
                {allWorkspaces.map((space) => (
                  <th key={space}>{workspaceNames[space]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((user) => (
                <tr key={user.id}>
                  <td>
                    <div className="access-person">
                      <Avatar user={user} />
                      <span>
                        <strong>{user.name}</strong>
                        <small>{user.email}</small>
                      </span>
                      {busy === user.id && (
                        <LoaderCircle className="spin" size={16} />
                      )}
                    </div>
                  </td>
                  <td>{roleNames[user.role]}</td>
                  {allWorkspaces.map((space) => (
                    <td key={space}>
                      {canManageAccess(user.role) ? (
                        <label className="access-toggle">
                          <input
                            type="checkbox"
                            checked={user.workspaceIds.includes(space)}
                            disabled={!!busy}
                            aria-label={`${workspaceNames[space]} — ${user.name}`}
                            onChange={() => void toggle(user, space)}
                          />
                          <span>
                            {user.workspaceIds.includes(space)
                              ? "Открыт"
                              : "Закрыт"}
                          </span>
                        </label>
                      ) : (
                        <span className="muted">Не требуется</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!people.length && (
          <EmptyState
            title="Пользователи не найдены"
            description="Измените фильтры или создайте приглашение для нового пользователя."
          />
        )}
      </section>
    </div>
  );
}
