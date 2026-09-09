"use client";
import { useEffect, useRef, useState } from "react";
import {
  X,
  UploadCloud,
  FileText,
  ArrowUpRight,
  Check,
  LoaderCircle,
  Image as ImageIcon,
  SearchX,
} from "lucide-react";
import type { AppData, SafeUser } from "@/lib/types";

export const dateLabel = (
  value: string,
  options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) => new Date(value).toLocaleDateString("ru-RU", options);
export const timeLabel = (value: string) =>
  new Date(value).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
export const initials = (name: string) =>
  name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("");
export function counted(count: number, forms: [string, string, string]) {
  const last = count % 10,
    lastTwo = count % 100;
  return `${count} ${forms[lastTwo >= 11 && lastTwo <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2]}`;
}
export const taskCount = (count: number) =>
  counted(count, ["задание", "задания", "заданий"]);
export function Avatar({
  user,
  size = "",
  className = "",
}: {
  user: Pick<SafeUser, "name" | "color">;
  size?: string;
  className?: string;
}) {
  return (
    <span
      className={`avatar ${user.color} ${size} ${className}`}
      title={user.name}
    >
      {initials(user.name)}
    </span>
  );
}
export function AvatarStack({ users }: { users: SafeUser[] }) {
  return (
    <div className="avatar-stack">
      {users.slice(0, 3).map((u) => (
        <Avatar key={u.id} user={u} size="small" />
      ))}
      {users.length > 3 && (
        <span className="avatar extra small">+{users.length - 3}</span>
      )}
    </div>
  );
}
export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <div
      className={`brand ${dark ? "brand-dark" : ""}`}
      aria-label="Meta Education"
    >
      <svg viewBox="0 0 40 40" aria-hidden="true">
        <path
          d="M20 0C6 0 0 8 0 20h20V0zm0 20v20c14 0 20-8 20-20H20z"
          fill="currentColor"
        />
        <path
          d="M20 0v20h20C40 6 32 0 20 0zM0 20c0 14 8 20 20 20V20H0z"
          fill="currentColor"
          opacity=".55"
        />
      </svg>
      <span className="brand-wordmark">
        <span>Meta</span> <span>Education</span>
      </span>
    </div>
  );
}
export function Status({
  status,
  overdue = false,
}: {
  status: string;
  overdue?: boolean;
}) {
  const label = overdue
    ? "Просрочено"
    : status === "reviewed"
      ? "Проверено"
      : status === "pending"
        ? "На проверке"
        : status === "archived"
          ? "В архиве"
          : "Новое";
  return (
    <span className={`status ${overdue ? "overdue" : status}`}>
      <i />
      {label}
    </span>
  );
}
export function EmptyState({
  title = "Пока ничего нет",
  description = "Здесь появятся ваши данные",
  action,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <SearchX size={28} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const node = ref.current;
    node?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const items = Array.from(
          node?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
          ) || [],
        );
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === node)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", key);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export async function api<T = Record<string, unknown>>(
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `/api/${path}`,
    body === undefined
      ? { cache: "no-store" }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error || "Не удалось выполнить действие");
  return result;
}
export function SubmitButton({
  busy,
  children,
}: {
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <button type="submit" className="button primary" disabled={busy}>
      {busy ? <LoaderCircle size={17} className="spin" /> : <Check size={17} />}{" "}
      {busy ? "Сохраняем…" : children}
    </button>
  );
}
export function FileLinks({ ids, data }: { ids: string[]; data: AppData }) {
  return (
    <div className="file-links">
      {ids.map((id) => {
        const file = data.files.find((f) => f.id === id);
        return file ? (
          <a
            href={`/api/files/${id}`}
            target="_blank"
            rel="noreferrer"
            className="file-link"
            key={id}
          >
            <span className="file-type">
              {file.mime === "application/pdf" ? (
                <FileText size={19} />
              ) : (
                <ImageIcon size={19} />
              )}
            </span>
            <span>
              <strong>{file.name}</strong>
              <small>{(file.size / 1024 / 1024).toFixed(1)} МБ</small>
            </span>
            <ArrowUpRight size={16} />
          </a>
        ) : null;
      })}
    </div>
  );
}
export type Uploaded = { id: string; name: string; size: number; mime: string };
export function UploadZone({
  kind,
  onChange,
  onBusy,
}: {
  kind: "material" | "submission" | "review";
  onChange: (files: Uploaded[]) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [files, setFiles] = useState<Uploaded[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function upload(list: FileList | File[]) {
    if (busy) return;
    setError("");
    setBusy(true);
    onBusy?.(true);
    const next = [...files];
    try {
      for (const file of Array.from(list)) {
        if (
          !["image/jpeg", "image/png", "application/pdf"].includes(file.type) ||
          file.size > 20 * 1024 * 1024 ||
          file.size === 0
        )
          throw new Error("Выберите JPG, PNG или PDF размером до 20 МБ");
        if (next.length >= 10) throw new Error("Можно прикрепить до 10 файлов");
        const form = new FormData();
        form.set("file", file);
        form.set("kind", kind);
        const response = await fetch("/api/files", {
          method: "POST",
          body: form,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        next.push(result);
        setFiles([...next]);
        onChange([...next]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy?.(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div>
      <input
        ref={input}
        type="file"
        hidden
        multiple
        accept="image/jpeg,image/png,application/pdf"
        onChange={(e) => e.target.files && upload(e.target.files)}
      />
      <button
        type="button"
        className={`upload-zone ${drag ? "dragging" : ""}`}
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          upload(e.dataTransfer.files);
        }}
      >
        {busy ? (
          <LoaderCircle size={27} className="spin" />
        ) : (
          <UploadCloud size={27} />
        )}
        <strong>
          {busy
            ? "Загружаем файлы…"
            : "Перетащите файлы или нажмите для загрузки"}
        </strong>
        <span>JPG, PNG, PDF · до 20 МБ каждый</span>
      </button>
      {files.map((file) => (
        <div className="uploaded-file" key={file.id}>
          <FileText size={17} />
          <span>{file.name}</span>
          <button
            className="icon-button"
            type="button"
            aria-label={`Убрать ${file.name}`}
            onClick={() => {
              const next = files.filter((f) => f.id !== file.id);
              setFiles(next);
              onChange(next);
            }}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
