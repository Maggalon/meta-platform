"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  Plus,
  Trash2,
  Check,
  LoaderCircle,
  Sparkles,
  Save,
  ArrowUpRight,
  Leaf,
  BookOpen,
} from "lucide-react";
import { api, counted, Modal } from "./ui";
import DiaryGauge from "./diary-gauge";
import {
  aeiouCategories,
  emptyAeiou,
  newDiaryActivity,
  localDiaryDate,
  diaryDateLabel,
  diaryDaySchema,
  maxDiaryDays,
  maxDayActivities,
  reflectionMinimumDays,
  reflectionUnlocked,
  type TimeDiary,
  type DiaryDayDraft,
  type DiaryActivityDraft,
  type AeiouAnswers,
  type AeiouId,
} from "@/lib/diary";

export default function WorkbookDiary() {
  const [data, setData] = useState<TimeDiary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [aiAvailable, setAiAvailable] = useState(false);
  const [editor, setEditor] = useState<{
    day: DiaryDayDraft;
    mode: "create" | "update";
  } | null>(null);
  const [editorError, setEditorError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteDate, setDeleteDate] = useState("");
  const [reflection, setReflection] = useState<AeiouAnswers>(emptyAeiou);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState("");
  const [suggestion, setSuggestion] = useState<{
    answers: AeiouAnswers;
    revision: number;
  } | null>(null);
  const busy = useRef(false);
  const closeEditor = useCallback(() => {
    if (!busy.current) setEditor(null);
  }, []);
  const analysis = useRef<AbortController | null>(null);
  const revision = useRef(data?.revision ?? 0);
  revision.current = data?.revision ?? 0;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    api<{ result: TimeDiary; aiAvailable: boolean }>("workbook/3")
      .then((response) => {
        if (cancelled) return;
        setData(response.result);
        setReflection(response.result.reflection?.answers ?? emptyAeiou());
        setAiAvailable(response.aiAvailable);
      })
      .catch((cause) => {
        if (!cancelled) setLoadError((cause as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      analysis.current?.abort();
    };
  }, [reload]);

  function updateActivity(id: string, changes: Partial<DiaryActivityDraft>) {
    setEditor((current) =>
      current
        ? {
            ...current,
            day: {
              ...current.day,
              activities: current.day.activities.map((item) =>
                item.id === id ? { ...item, ...changes } : item,
              ),
            },
          }
        : null,
    );
    setEditorError("");
  }
  async function saveDay() {
    if (!editor || busy.current) return;
    const parsed = diaryDaySchema.safeParse(editor.day);
    if (!parsed.success) {
      setEditorError(
        "Для каждого занятия заполните описание и обе шкалы. Проверьте дату.",
      );
      return;
    }
    busy.current = true;
    setSaving(true);
    setEditorError("");
    try {
      const response = await api<{ result: TimeDiary }>("workbook/3/day", {
        day: parsed.data,
        mode: editor.mode,
      });
      setData(response.result);
      setEditor(null);
      setError("");
    } catch (cause) {
      setEditorError((cause as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function removeDay(date: string) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await api<{ result: TimeDiary }>(
        "workbook/3/day/delete",
        { date },
      );
      setData(response.result);
      setDeleteDate("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function saveReflection() {
    if (!data || !reflectionUnlocked(data.days) || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await api<{ result: TimeDiary }>(
        "workbook/3/reflection",
        { answers: reflection, revision: data.revision },
      );
      setData(response.result);
      setReflection(response.result.reflection!.answers);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function analyze() {
    if (
      !data ||
      !reflectionUnlocked(data.days) ||
      !aiAvailable ||
      analysis.current
    )
      return;
    const controller = new AbortController();
    analysis.current = controller;
    setAnalyzing(true);
    setAiError("");
    try {
      const response = await fetch("/api/workbook/3/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Не удалось получить помощь ИИ");
      if (payload.revision !== revision.current) {
        setAiError(
          "Дневник изменился во время анализа. Запросите помощь ещё раз.",
        );
        return;
      }
      setSuggestion({
        answers: payload.suggestion,
        revision: payload.revision,
      });
    } catch (cause) {
      if (!controller.signal.aborted) setAiError((cause as Error).message);
    } finally {
      if (analysis.current === controller) {
        analysis.current = null;
        setAnalyzing(false);
      }
    }
  }
  function updateReflection(id: AeiouId, value: string) {
    setReflection((previous) => ({ ...previous, [id]: value }));
    setError("");
  }

  if (loading)
    return (
      <div className="workbook-loading" role="status">
        <LoaderCircle className="spin" size={22} /> Загружаем дневник…
      </div>
    );
  if (loadError || !data)
    return (
      <div className="workbook-loading panel">
        <p role="alert">{loadError || "Не удалось загрузить дневник"}</p>
        <button
          className="button secondary"
          onClick={() => setReload((value) => value + 1)}
        >
          Повторить загрузку
        </button>
      </div>
    );
  const unlocked = reflectionUnlocked(data.days);
  const unchanged =
    data.reflection !== null &&
    aeiouCategories.every(
      ({ id }) => reflection[id].trim() === data.reflection!.answers[id],
    );
  const stale =
    data.reflection !== null &&
    data.reflection.basedOnRevision !== data.revision;
  const currentSuggestion =
    suggestion?.revision === data.revision ? suggestion.answers : null;

  return (
    <div className="workbook-assessment diary-workbook">
      <div className="workbook-intro">
        <div>
          <h2>Замечайте, что даёт вам силы</h2>
          <p>
            Записывайте занятия, оценивайте вовлечённость и энергию. Отмечайте
            моменты, когда были полностью поглощены делом.
          </p>
        </div>
        <span className="workbook-progress">
          <strong>{data.days.length}</strong> / {maxDiaryDays} · дней
        </span>
      </div>
      <div className="diary-toolbar">
        <p>
          {unlocked
            ? "Лист рефлексии AEIOU открыт ниже."
            : `Для рефлексии сохраните ещё ${counted(Math.max(0, reflectionMinimumDays - data.days.length), ["день", "дня", "дней"])}.`}
        </p>
        <button
          className="button primary"
          disabled={data.days.length >= maxDiaryDays || saving}
          onClick={() => {
            setEditor({
              mode: "create",
              day: { date: localDiaryDate(), activities: [newDiaryActivity()] },
            });
            setEditorError("");
          }}
        >
          <Plus size={17} />
          Добавить день
        </button>
      </div>
      {data.days.length === maxDiaryDays && (
        <p className="diary-limit" role="status">
          Все 21 день добавлены. Можно редактировать записи и возвращаться к
          рефлексии.
        </p>
      )}
      {data.days.length ? (
        <div className="diary-days">
          {data.days.map((day) => (
            <article className="diary-day-card" key={day.date}>
              <div className="diary-day-heading">
                <CalendarDays size={19} />
                <h3>{diaryDateLabel(day.date)}</h3>
              </div>
              <p className="diary-day-count">
                {counted(day.activities.length, [
                  "занятие",
                  "занятия",
                  "занятий",
                ])}
              </p>
              <ul>
                {day.activities.slice(0, 3).map((item) => (
                  <li key={item.id}>
                    <p>{item.activity}</p>
                    <div>
                      <span>Вовл. {item.engagement}/10</span>
                      <span>
                        Энергия {item.energy > 0 ? "+" : ""}
                        {item.energy}
                      </span>
                      {item.flow && (
                        <span className="diary-flow">
                          <Leaf size={12} />В потоке
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {day.activities.length > 3 && (
                <p className="diary-day-more">
                  Ещё{" "}
                  {counted(day.activities.length - 3, [
                    "занятие",
                    "занятия",
                    "занятий",
                  ])}
                </p>
              )}
              <div className="diary-card-actions">
                <button
                  className="button secondary"
                  disabled={saving}
                  onClick={() => {
                    setEditor({
                      mode: "update",
                      day: {
                        date: day.date,
                        activities: day.activities.map((item) => ({ ...item })),
                      },
                    });
                    setEditorError("");
                  }}
                >
                  Открыть дневник
                  <ArrowUpRight size={15} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Удалить дневник за ${diaryDateLabel(day.date)}`}
                  disabled={saving}
                  onClick={() => setDeleteDate(day.date)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              {deleteDate === day.date && (
                <div className="diary-delete-confirm">
                  <p>Удалить этот день и все его записи?</p>
                  <button
                    className="button secondary"
                    disabled={saving}
                    onClick={() => void removeDay(day.date)}
                  >
                    Удалить
                  </button>
                  <button
                    className="button secondary"
                    disabled={saving}
                    onClick={() => setDeleteDate("")}
                  >
                    Отмена
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="diary-empty">
          <BookOpen size={36} strokeWidth={1.4} />
          <h3>С какого занятия начнём?</h3>
          <p>
            Добавьте первый день и запишите то, чем занимались. В одной карточке
            может быть несколько занятий.
          </p>
        </div>
      )}
      {!unlocked && !data.reflection && (
        <div className="diary-reflection-locked">
          <span>AEIOU</span>
          <h2>От наблюдений к выводам</h2>
          <p>
            После 7 сохранённых дней здесь откроется лист рефлексии: Действия,
            Окружение, Взаимодействия, Предметы и Люди.
          </p>
        </div>
      )}
      {(unlocked || data.reflection) && (
        <section
          className="compass-alignment diary-reflection"
          aria-labelledby="aeiou-heading"
        >
          <div className="compass-alignment-intro">
            <span className="sphere-icon">
              <Leaf size={23} />
            </span>
            <div>
              <h2 id="aeiou-heading">Лист рефлексии · AEIOU</h2>
              <p>
                Перечитайте дневники и найдите закономерности. Рассмотрите
                занятия с пяти сторон самостоятельно или с помощью ИИ.
              </p>
            </div>
          </div>
          {!unlocked && (
            <p className="diary-limit">
              Рефлексия сохранена. Чтобы продолжить её редактировать, снова
              добавьте минимум 7 дней.
            </p>
          )}
          {stale && (
            <p className="diary-limit" role="status">
              Дневник изменился после сохранения рефлексии. Перечитайте выводы с
              учётом новых записей.
            </p>
          )}
          <div className="compass-ai-tools">
            {/* <div>
              <p>Помочь заметить закономерности</p>
              <span>
                {aiAvailable
                  ? "DeepSeek получит только сохранённые даты, описания занятий, оценки и отметки «В потоке»."
                  : "Помощь ИИ пока не подключена. Рефлексию можно заполнить самостоятельно."}
              </span>
            </div> */}
            <button
              className="button secondary"
              disabled={!unlocked || !aiAvailable || analyzing || saving}
              onClick={() => void analyze()}
            >
              {analyzing ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {analyzing ? "Анализируем дневники…" : "Попросить ИИ помочь"}
            </button>
          </div>
          {analyzing && (
            <p className="compass-ai-status" role="status">
              ИИ сопоставляет ваши занятия. Можно продолжать писать собственные
              выводы.
            </p>
          )}
          {aiError && (
            <p className="workbook-error" role="alert">
              {aiError}
            </p>
          )}
          {suggestion && !currentSuggestion && (
            <p className="compass-ai-status">
              Дневник изменился. Обновите помощь ИИ для актуальных записей.
            </p>
          )}
          {currentSuggestion && (
            <p className="compass-ai-status" role="status">
              Подсказки готовы. Добавляйте в ответы только те наблюдения, с
              которыми согласны.
            </p>
          )}
          <div className="compass-alignment-fields">
            {aeiouCategories.map(({ id, letter, title, question }) => {
              const hint = currentSuggestion?.[id];
              const added = Boolean(hint && reflection[id].includes(hint));
              return (
                <div className="compass-alignment-field" key={id}>
                  <label htmlFor={`aeiou-${id}`}>
                    <span className="aeiou-letter">{letter}</span>
                    {title}
                  </label>
                  <p className="aeiou-question" id={`aeiou-${id}-hint`}>
                    {question}
                  </p>
                  <textarea
                    id={`aeiou-${id}`}
                    aria-describedby={`aeiou-${id}-hint`}
                    rows={4}
                    maxLength={12000}
                    disabled={!unlocked || saving}
                    value={reflection[id]}
                    onChange={(event) =>
                      updateReflection(id, event.target.value)
                    }
                    placeholder="Какие закономерности я замечаю…"
                  />
                  {hint && (
                    <aside className="compass-ai-suggestion">
                      <strong>
                        <Sparkles size={14} />
                        Подсказка ИИ
                      </strong>
                      <p>{hint}</p>
                      <button
                        className="button secondary"
                        disabled={
                          !unlocked ||
                          saving ||
                          added ||
                          reflection[id].length + hint.length + 2 > 12000
                        }
                        onClick={() =>
                          updateReflection(
                            id,
                            [reflection[id].trim(), hint]
                              .filter(Boolean)
                              .join("\n\n"),
                          )
                        }
                      >
                        {added ? <Check size={14} /> : <Plus size={14} />}
                        {added
                          ? "Добавлено в ответ"
                          : "Добавить к моему ответу"}
                      </button>
                    </aside>
                  )}
                </div>
              );
            })}
          </div>
          <div className="compass-save-bar">
            <p className="workbook-save-status" role="status">
              {unchanged && !stale
                ? "Рефлексия сохранена"
                : "Можно сохранить ответы и дополнить их позже."}
            </p>
            <button
              className="button primary"
              disabled={
                !unlocked ||
                saving ||
                !Object.values(reflection).some((value) => value.trim()) ||
                (unchanged && !stale)
              }
              onClick={() => void saveReflection()}
            >
              {saving ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Save size={17} />
              )}
              Сохранить рефлексию
            </button>
          </div>
        </section>
      )}
      {error && (
        <p className="workbook-error" role="alert">
          {error}
        </p>
      )}
      {editor && (
        <Modal
          title={
            editor.mode === "create"
              ? "Новый день дневника"
              : diaryDateLabel(editor.day.date)
          }
          subtitle="Оцените каждое занятие по двум шкалам"
          wide
          onClose={closeEditor}
        >
          <form
            className="diary-editor"
            onSubmit={(event) => {
              event.preventDefault();
              void saveDay();
            }}
          >
            <label className="diary-date-label" htmlFor="diary-date">
              Дата дня
              <input
                id="diary-date"
                type="date"
                required
                disabled={saving || editor.mode === "update"}
                value={editor.day.date}
                onChange={(event) =>
                  setEditor((current) =>
                    current
                      ? {
                          ...current,
                          day: { ...current.day, date: event.target.value },
                        }
                      : null,
                  )
                }
              />
            </label>
            <p className="diary-scale-guide">
              Вовлечённость: 0 — совсем не увлечён, 10 — полностью поглощён.
              Энергия: −5 — занятие забирает силы, +5 — наполняет энергией.
              Нажмите на шкалу или переместите стрелку.
            </p>
            <div className="diary-activities">
              {editor.day.activities.map((item, index) => (
                <article className="diary-activity" key={item.id}>
                  <div className="diary-activity-heading">
                    <h3>Занятие {index + 1}</h3>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Удалить занятие ${index + 1}`}
                      disabled={saving || editor.day.activities.length === 1}
                      onClick={() =>
                        setEditor((current) =>
                          current
                            ? {
                                ...current,
                                day: {
                                  ...current.day,
                                  activities: current.day.activities.filter(
                                    (entry) => entry.id !== item.id,
                                  ),
                                },
                              }
                            : null,
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <div className="diary-activity-body">
                    <div className="diary-activity-text">
                      <label htmlFor={`activity-${item.id}`}>
                        Чем занимался
                      </label>
                      <textarea
                        id={`activity-${item.id}`}
                        rows={4}
                        maxLength={1000}
                        required
                        disabled={saving}
                        value={item.activity}
                        placeholder="Например: готовил проект, гулял, общался с друзьями…"
                        onChange={(event) =>
                          updateActivity(item.id, {
                            activity: event.target.value,
                          })
                        }
                      />
                      <label className="diary-flow-checkbox">
                        <input
                          type="checkbox"
                          checked={item.flow}
                          disabled={saving}
                          onChange={(event) =>
                            updateActivity(item.id, {
                              flow: event.target.checked,
                            })
                          }
                        />
                        <Leaf size={16} />В потоке
                      </label>
                    </div>
                    <div className="diary-gauges">
                      <DiaryGauge
                        label={`Вовлечённость · занятие ${index + 1}`}
                        min={0}
                        max={10}
                        value={item.engagement}
                        disabled={saving}
                        onChange={(engagement) =>
                          updateActivity(item.id, { engagement })
                        }
                      />
                      <DiaryGauge
                        label={`Энергия · занятие ${index + 1}`}
                        min={-5}
                        max={5}
                        value={item.energy}
                        disabled={saving}
                        onChange={(energy) =>
                          updateActivity(item.id, { energy })
                        }
                      />
                    </div>
                  </div>
                </article>
              ))}
            </div>
            <div className="diary-editor-actions">
              <button
                type="button"
                className="button secondary"
                disabled={
                  saving || editor.day.activities.length >= maxDayActivities
                }
                onClick={() =>
                  setEditor((current) =>
                    current
                      ? {
                          ...current,
                          day: {
                            ...current.day,
                            activities: [
                              ...current.day.activities,
                              newDiaryActivity(),
                            ],
                          },
                        }
                      : null,
                  )
                }
              >
                <Plus size={16} />
                Добавить занятие
              </button>
              <button
                type="submit"
                className="button primary"
                disabled={saving}
              >
                {saving ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Save size={17} />
                )}
                Сохранить день
              </button>
            </div>
            {editorError && (
              <p className="workbook-error" role="alert">
                {editorError}
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
