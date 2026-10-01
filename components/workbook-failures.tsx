"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  Plus,
  Save,
} from "lucide-react";
import { api, counted } from "./ui";
import {
  emptyFailureEntry,
  failureCategories,
  failureEntrySchema,
  failureStepError,
  failureTextLimit,
  sortFailureEntries,
  type FailureCategory,
  type FailureEntry,
  type FailureEntryDraft,
} from "@/lib/failure-journal";

const steps = ["Событие", "Категория", "Разбор", "Вывод"];
const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00`).toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export default function WorkbookFailures() {
  const [entries, setEntries] = useState<FailureEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [editor, setEditor] = useState<{
    id: string;
    revision: number;
    initial: string;
  } | null>(null);
  const [draft, setDraft] = useState<FailureEntryDraft>(emptyFailureEntry);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [notice, setNotice] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<FailureCategory | "all">("all");
  const heading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const newButton = useRef<HTMLButtonElement>(null);
  const category = failureCategories.find((item) => item.id === draft.category);
  const dirty = editor !== null && JSON.stringify(draft) !== editor.initial;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    api<{ entries: FailureEntry[] }>("workbook/6")
      .then((result) => {
        if (!cancelled) setEntries(result.entries);
      })
      .catch((cause) => {
        if (!cancelled) setLoadError((cause as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);

  useEffect(() => {
    if (editor) heading.current?.focus();
  }, [editor, step]);
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function begin(entry?: FailureEntry) {
    const value: FailureEntryDraft = entry
      ? {
          date: entry.date,
          event: entry.event,
          expected: entry.expected,
          actual: entry.actual,
          category: entry.category,
          responses: { ...entry.responses },
          conclusion: entry.conclusion,
          nextStep: entry.nextStep,
        }
      : emptyFailureEntry();
    setDraft(value);
    setEditor({
      id: entry?.id ?? crypto.randomUUID(),
      revision: entry?.revision ?? 0,
      initial: JSON.stringify(value),
    });
    setStep(0);
    setError("");
    setNotice("");
    setConfirmCancel(false);
  }
  function update(patch: Partial<FailureEntryDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
    setError("");
    setConfirmCancel(false);
  }
  function closeEditor() {
    setEditor(null);
    setError("");
    setConfirmCancel(false);
    requestAnimationFrame(() => newButton.current?.focus());
  }
  function goTo(next: number) {
    if (next > step) {
      for (let index = 0; index < next; index++) {
        const message = failureStepError(draft, index);
        if (message) {
          setStep(index);
          setError(message);
          return;
        }
      }
    }
    setStep(next);
    setError("");
    setConfirmCancel(false);
  }
  async function save() {
    if (!editor || savingRef.current) return;
    for (let index = 0; index < steps.length; index++) {
      const message = failureStepError(draft, index);
      if (message) {
        setStep(index);
        setError(message);
        return;
      }
    }
    const parsed = failureEntrySchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "Проверьте поля записи.");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const { result } = await api<{ result: FailureEntry }>("workbook/6", {
        id: editor.id,
        revision: editor.revision,
        entry: parsed.data,
      });
      setEntries((previous) =>
        sortFailureEntries([
          ...previous.filter((item) => item.id !== result.id),
          result,
        ]),
      );
      setExpanded(result.id);
      setFilter("all");
      setNotice(
        editor.revision
          ? "Изменения сохранены."
          : "Запись сохранена в журнале.",
      );
      closeEditor();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  if (loading)
    return (
      <section className="panel workbook-content" role="status">
        Загружаем журнал…
      </section>
    );
  if (loadError)
    return (
      <section className="panel workbook-content">
        <p role="alert">{loadError}</p>
        <button
          type="button"
          className="button secondary"
          onClick={() => setReload((value) => value + 1)}
        >
          Попробовать снова
        </button>
      </section>
    );
  const visibleEntries = entries.filter(
    (entry) => filter === "all" || entry.category === filter,
  );

  return (
    <section
      className="workbook-assessment failure-workbook"
      aria-label="Журнал неудач"
    >
      <div className="workbook-intro">
        <div>
          <h2>Опыт, из которого можно учиться</h2>
          <p>
            Разберите, что произошло, и найдите полезный вывод. К любой записи
            можно вернуться и пересмотреть её категорию.
          </p>
        </div>
        <button
          ref={newButton}
          type="button"
          className="button primary"
          disabled={editor !== null}
          onClick={() => begin()}
        >
          <Plus size={16} />
          Новая запись
        </button>
      </div>
      {notice && (
        <p className="failure-notice" role="status">
          <Check size={16} />
          {notice}
        </p>
      )}
      {editor && (
        <form
          className="failure-editor"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (step < 3) goTo(step + 1);
            else void save();
          }}
        >
          <fieldset disabled={saving} className="failure-fieldset">
            <legend className="sr-only">
              {editor.revision ? "Редактирование записи" : "Новая запись"}
            </legend>
            <ol className="failure-steps" aria-label="Шаги записи">
              {steps.map((title, index) => (
                <li key={title}>
                  <button
                    type="button"
                    aria-current={index === step ? "step" : undefined}
                    onClick={() => goTo(index)}
                  >
                    <span>{index + 1}</span>
                    {title}
                  </button>
                </li>
              ))}
            </ol>
            <div className="failure-step-heading">
              <p>
                {editor.revision ? "Редактирование записи" : "Новая запись"} ·
                Шаг {step + 1} из 4
              </p>
              <h3 ref={heading} tabIndex={-1}>
                {
                  [
                    "Что произошло?",
                    "Как вы понимаете эту неудачу?",
                    "Что может помочь?",
                    "Что вы берёте из этого опыта?",
                  ][step]
                }
              </h3>
            </div>
            {error && (
              <p
                ref={errorRef}
                tabIndex={-1}
                className="failure-error"
                role="alert"
              >
                {error}
              </p>
            )}
            {step === 0 && (
              <div className="failure-fields">
                <label className="failure-date">
                  Дата события
                  <input
                    type="date"
                    value={draft.date}
                    required
                    onChange={(event) => update({ date: event.target.value })}
                  />
                </label>
                <TextField
                  label="Событие"
                  value={draft.event}
                  onChange={(event) => update({ event })}
                  placeholder="Кратко опишите ситуацию: что и при каких обстоятельствах произошло?"
                />
                <div className="failure-expectations">
                  <TextField
                    label="Чего я ожидал(а)?"
                    value={draft.expected}
                    onChange={(expected) => update({ expected })}
                    placeholder="Какого результата вы хотели?"
                  />
                  <TextField
                    label="Что получилось на самом деле?"
                    value={draft.actual}
                    onChange={(actual) => update({ actual })}
                    placeholder="Чем фактический результат отличается от ожидаемого?"
                  />
                </div>
              </div>
            )}
            {step === 1 && (
              <fieldset className="failure-categories">
                <legend>Выберите наиболее подходящую категорию</legend>
                {failureCategories.map((item) => (
                  <label
                    key={item.id}
                    className={`failure-category ${draft.category === item.id ? "selected" : ""}`}
                  >
                    <span className="failure-category-title">
                      <input
                        type="radio"
                        name="failure-category"
                        value={item.id}
                        checked={draft.category === item.id}
                        onChange={() => update({ category: item.id })}
                        required
                      />
                      <strong>{item.title}</strong>
                    </span>
                    <span>{item.explanation}</span>
                    <span className="failure-example">
                      <b>Например:</b> {item.example}
                    </span>
                  </label>
                ))}
                <p className="failure-hint">
                  Это ваша текущая трактовка. Выбор можно изменить сейчас или
                  после сохранения.
                </p>
              </fieldset>
            )}
            {step === 2 && category && (
              <div className="failure-fields">
                <div className="failure-context">
                  <strong>{category.title}</strong>
                  <p>{category.explanation}</p>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => goTo(1)}
                  >
                    Изменить категорию
                  </button>
                </div>
                <TextField
                  label={category.question}
                  value={draft.responses[category.id]}
                  onChange={(value) =>
                    update({
                      responses: { ...draft.responses, [category.id]: value },
                    })
                  }
                  placeholder="Запишите, что могло бы помочь именно в этой ситуации."
                  rows={6}
                />
                <p className="failure-hint">
                  При смене категории ваш ответ останется сохранён в форме. Он
                  появится, если вы вернётесь к этой категории.
                </p>
              </div>
            )}
            {step === 3 && (
              <div className="failure-fields">
                <details className="failure-review">
                  <summary>Перечитать событие и разбор</summary>
                  <EntryDetails entry={draft} />
                </details>
                <TextField
                  label="Конкретный вывод"
                  value={draft.conclusion}
                  onChange={(conclusion) => update({ conclusion })}
                  placeholder="Что вы поняли и что хотите учесть в следующий раз?"
                />
                <TextField
                  label="Следующий шаг (необязательно)"
                  value={draft.nextStep}
                  onChange={(nextStep) => update({ nextStep })}
                  placeholder="Например: перед следующей презентацией проведу короткую репетицию с коллегой."
                  optional
                />
                <p className="failure-hint">
                  Следующий шаг можно оставить пустым, если сейчас достаточно
                  вывода.
                </p>
              </div>
            )}
            <div className="failure-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => (dirty ? setConfirmCancel(true) : closeEditor())}
              >
                Отменить
              </button>
              <div>
                {step > 0 && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => goTo(step - 1)}
                  >
                    <ArrowLeft size={15} />
                    Назад
                  </button>
                )}
                <button type="submit" className="button primary">
                  {step < 3 ? (
                    <>
                      Далее
                      <ArrowRight size={15} />
                    </>
                  ) : (
                    <>
                      <Save size={15} />
                      {saving ? "Сохраняем…" : "Сохранить запись"}
                    </>
                  )}
                </button>
              </div>
            </div>
            {confirmCancel && (
              <div className="failure-discard" role="alert">
                <p>Отменить изменения? Несохранённый текст будет потерян.</p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setConfirmCancel(false)}
                >
                  Продолжить запись
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={closeEditor}
                >
                  Отменить изменения
                </button>
              </div>
            )}
          </fieldset>
        </form>
      )}

      <section
        className="failure-history"
        aria-labelledby="failure-history-title"
      >
        <div className="failure-history-heading">
          <div>
            <h3 id="failure-history-title">История записей</h3>
            <p>{counted(entries.length, ["запись", "записи", "записей"])}</p>
          </div>
          {entries.length > 0 && (
            <label>
              Категория
              <select
                value={filter}
                onChange={(event) =>
                  setFilter(event.target.value as FailureCategory | "all")
                }
              >
                <option value="all">Все категории</option>
                {failureCategories.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {entries.length === 0 ? (
          <div className="failure-empty">
            <h4>Здесь появится ваш опыт</h4>
            <p>
              Начните с одной ситуации. Не обязательно ждать большого провала —
              повседневные промахи тоже помогают лучше понять себя.
            </p>
            {!editor && (
              <button
                type="button"
                className="button secondary"
                onClick={() => begin()}
              >
                Добавить первую запись
              </button>
            )}
          </div>
        ) : visibleEntries.length === 0 ? (
          <p className="failure-empty">В этой категории пока нет записей.</p>
        ) : (
          <div
            className="failure-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="История журнала, таблицу можно прокручивать горизонтально"
          >
            <table className="failure-table">
              <caption className="sr-only">
                Журнал неудач: от новых событий к более ранним
              </caption>
              <thead>
                <tr>
                  <th scope="col">Дата</th>
                  <th scope="col">Событие</th>
                  <th scope="col">Категория</th>
                  <th scope="col">Вывод</th>
                  <th scope="col">
                    <span className="sr-only">Действия</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleEntries.map((entry) => (
                  <Fragment key={entry.id}>
                    <tr>
                      <td>{dateLabel(entry.date)}</td>
                      <td>
                        <p className="failure-cell-text">{entry.event}</p>
                      </td>
                      <td>
                        <span className={`failure-badge ${entry.category}`}>
                          {
                            failureCategories.find(
                              (item) => item.id === entry.category,
                            )?.title
                          }
                        </span>
                      </td>
                      <td>
                        <p className="failure-cell-text">{entry.conclusion}</p>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="button secondary"
                          aria-expanded={expanded === entry.id}
                          aria-controls={`failure-detail-${entry.id}`}
                          aria-label={`${expanded === entry.id ? "Скрыть" : "Открыть"} запись от ${dateLabel(entry.date)}`}
                          onClick={() =>
                            setExpanded(expanded === entry.id ? null : entry.id)
                          }
                        >
                          {expanded === entry.id ? "Скрыть" : "Открыть"}
                          <ChevronDown size={14} />
                        </button>
                      </td>
                    </tr>
                    {expanded === entry.id && (
                      <tr
                        id={`failure-detail-${entry.id}`}
                        className="failure-detail-row"
                      >
                        <td colSpan={5}>
                          <EntryDetails entry={entry} full />
                          <div className="failure-detail-footer">
                            <p>
                              Сохранено{" "}
                              {new Date(entry.savedAt).toLocaleString("ru-RU")}
                            </p>
                            <button
                              type="button"
                              className="button secondary"
                              disabled={editor !== null}
                              onClick={() => begin(entry)}
                            >
                              Редактировать запись
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  optional = false,
  rows = 4,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  optional?: boolean;
  rows?: number;
}) {
  return (
    <label className="failure-text-field">
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={!optional}
        maxLength={failureTextLimit}
        rows={rows}
      />
    </label>
  );
}
function EntryDetails({
  entry,
  full = false,
}: {
  entry: FailureEntryDraft;
  full?: boolean;
}) {
  const category = failureCategories.find((item) => item.id === entry.category);
  return (
    <dl className="failure-details">
      <div>
        <dt>Событие</dt>
        <dd>{entry.event}</dd>
      </div>
      <div>
        <dt>Ожидание</dt>
        <dd>{entry.expected}</dd>
      </div>
      <div>
        <dt>Результат</dt>
        <dd>{entry.actual}</dd>
      </div>
      {category && (
        <>
          <div>
            <dt>Категория</dt>
            <dd>{category.title}</dd>
          </div>
          <div>
            <dt>{category.question}</dt>
            <dd>{entry.responses[category.id]}</dd>
          </div>
        </>
      )}
      {full && (
        <>
          <div>
            <dt>Конкретный вывод</dt>
            <dd>{entry.conclusion}</dd>
          </div>
          <div>
            <dt>Следующий шаг</dt>
            <dd>{entry.nextStep || "Не указан"}</dd>
          </div>
        </>
      )}
    </dl>
  );
}
