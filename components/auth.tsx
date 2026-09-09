"use client";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { api, Logo } from "./ui";

export default function AuthScreen({
  invite,
  onLogin,
  demo,
}: {
  invite: string;
  onLogin: () => Promise<void>;
  demo: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [visible, setVisible] = useState(false),
    [invitation, setInvitation] = useState<{
      email: string;
      group?: string;
    } | null>(null),
    [validating, setValidating] = useState(!!invite);
  useEffect(() => {
    if (invite) {
      api<{ email: string; group?: string }>(
        `auth/invite?token=${encodeURIComponent(invite)}`,
      )
        .then(setInvitation)
        .catch((e) => setError(e.message))
        .finally(() => setValidating(false));
    }
  }, [invite]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api(invite ? "auth/register" : "auth/login", {
        email: f.get("email"),
        password: f.get("password"),
        ...(invite ? { name: f.get("name"), token: invite } : {}),
      });
      window.history.replaceState({}, "", "/");
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function demoLogin(role: "teacher" | "student") {
    setBusy(true);
    setError("");
    try {
      await api("auth/demo", { role });
      await onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Logo />
        <div>
          <span className="auth-eyebrow">ПРОСТРАНСТВО ДЛЯ РОСТА</span>
          <h1>
            У больших
            <br />
            результатов
            <br />
            есть начало<span>.</span>
          </h1>
          <p>
            Знания, поддержка и немного упорства.
            <br />
            Всё остальное мы собрали в Точке.
          </p>
          <div className="auth-art" aria-hidden="true">
            <div />
            <div />
            <div />
          </div>
        </div>
        <footer>Учиться. Пробовать. Расти.</footer>
      </section>
      <section className="auth-content">
        <Logo dark />
        <div className="auth-form-wrap">
          <span className="eyebrow">ВАШ СЛЕДУЮЩИЙ ШАГ</span>
          <h2>{invite ? "Добро пожаловать" : "Рады видеть вас снова"}</h2>
          <p>
            {invite
              ? invitation?.group
                ? `Вас пригласили в группу «${invitation.group}»`
                : "Создайте аккаунт и начните подготовку к ЕГЭ."
              : "Войдите, чтобы продолжить с того места, где остановились."}
          </p>
          {validating ? (
            <div className="loading-inline">
              <LoaderCircle className="spin" />
              Проверяем приглашение…
            </div>
          ) : (
            <form className="standard-form" onSubmit={submit}>
              {invite && (
                <label>
                  Имя и фамилия
                  <input
                    name="name"
                    required
                    autoComplete="name"
                    placeholder="Как к вам обращаться?"
                  />
                </label>
              )}
              <label>
                Email
                <input
                  key={invitation?.email}
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  defaultValue={invitation?.email || ""}
                  readOnly={!!invitation?.email}
                  placeholder="you@example.ru"
                />
              </label>
              <label>
                Пароль
                <div className="password-field">
                  <input
                    type={visible ? "text" : "password"}
                    name="password"
                    required
                    minLength={invite ? 12 : 1}
                    maxLength={200}
                    autoComplete={invite ? "new-password" : "current-password"}
                    placeholder={
                      invite ? "Не менее 12 символов" : "Введите пароль"
                    }
                  />
                  <button
                    type="button"
                    aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="button primary"
                disabled={busy || (!!invite && !invitation)}
                type="submit"
              >
                {busy ? (
                  <LoaderCircle className="spin" size={18} />
                ) : (
                  <>
                    {invite ? "Создать аккаунт" : "Войти в Meta Education"}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          )}
          {!invite && (
            <p className="auth-invite-note">
              Впервые здесь? Получите пригласительную ссылку у своего
              преподавателя.
            </p>
          )}
          {demo && !invite && (
            <div className="demo-login">
              <span>Попробовать платформу</span>
              <div>
                <button onClick={() => demoLogin("teacher")} disabled={busy}>
                  Я преподаватель
                  <ArrowUpRightIcon />
                </button>
                <button onClick={() => demoLogin("student")} disabled={busy}>
                  Я ученик
                  <ArrowUpRightIcon />
                </button>
              </div>
            </div>
          )}
        </div>
        <footer>Meta Education · Подготовка с заботой о результате</footer>
      </section>
    </main>
  );
}
function ArrowUpRightIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path d="M4 12 12 4M4 4h8v8" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
