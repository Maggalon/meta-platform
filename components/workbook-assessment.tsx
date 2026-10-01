"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import {
  Activity,
  BriefcaseBusiness,
  Palette,
  Heart,
  CircleHelp,
  Check,
  Download,
  Save,
  LoaderCircle,
  ArrowRight,
} from "lucide-react";
import { api } from "./ui";
import {
  spheres,
  emptyWorkbookDraft,
  explanationLimit,
  sphereComplete,
  scoreColor,
  workbookDate,
  type SphereId,
  type WorkbookDraft,
  type WorkbookResult,
} from "@/lib/workbook";

const sphereIcons = {
  health: Activity,
  work: BriefcaseBusiness,
  hobbies: Palette,
  love: Heart,
};

function SphereHelp({ sphere }: { sphere: (typeof spheres)[number] }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="sphere-help"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="sphere-help-button"
        aria-label={`Что входит в сферу «${sphere.title}»`}
        aria-describedby={open ? `help-${sphere.id}` : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setOpen(false);
          }
        }}
      >
        <CircleHelp size={17} />
      </button>
      {open && (
        <span
          role="tooltip"
          id={`help-${sphere.id}`}
          className="sphere-tooltip"
        >
          {sphere.description}
        </span>
      )}
    </span>
  );
}

export default function WorkbookAssessment() {
  const [answers, setAnswers] = useState<WorkbookDraft>(emptyWorkbookDraft);
  const [priority, setPriority] = useState<SphereId | "">("");
  const [saved, setSaved] = useState<WorkbookResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reload, setReload] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    api<{ result: WorkbookResult | null }>("workbook/1")
      .then(({ result }) => {
        if (cancelled) return;
        setSaved(result);
        setAnswers(result?.answers ?? emptyWorkbookDraft());
        setPriority(result?.priority ?? "");
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

  const completed = spheres.filter(({ id }) =>
    sphereComplete(answers[id]),
  ).length;
  const ready = completed === spheres.length;
  const unchanged =
    saved !== null &&
    priority === saved.priority &&
    spheres.every(
      ({ id }) =>
        answers[id].score === saved.answers[id].score &&
        answers[id].explanation.trim() === saved.answers[id].explanation,
    );
  function update(id: SphereId, value: Partial<WorkbookDraft[SphereId]>) {
    setAnswers((previous) => ({
      ...previous,
      [id]: { ...previous[id], ...value },
    }));
    setError("");
  }

  async function save() {
    if (!ready || !priority || busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const { result } = await api<{ result: WorkbookResult }>("workbook/1", {
        answers,
        priority,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      setSaved(result);
      setAnswers(result.answers);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }

  async function exportPdf() {
    if (!saved || !unchanged || busy.current) return;
    busy.current = true;
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/api/workbook/1/pdf", {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error || "Не удалось создать PDF. Попробуйте ещё раз.",
        );
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `Где я сейчас - ${workbookDate(saved)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      busy.current = false;
      setExporting(false);
    }
  }

  if (loading)
    return (
      <div className="workbook-loading" role="status">
        <LoaderCircle size={22} className="spin" /> Загружаем вашу тетрадь…
      </div>
    );
  if (loadError)
    return (
      <div className="panel workbook-loading">
        <p role="alert">{loadError}</p>
        <button
          className="button secondary"
          onClick={() => setReload((value) => value + 1)}
        >
          Повторить загрузку
        </button>
      </div>
    );

  return (
    <form
      className="workbook-assessment"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <div className="workbook-intro">
        <div>
          <h2>Посмотрите на свою жизнь сейчас</h2>
          <p>
            По очереди оцените, насколько наполнена каждая сфера, и кратко
            объясните почему. Здесь нет правильных ответов.
          </p>
        </div>
        <span className="workbook-progress" role="status">
          <strong>{completed}</strong> / 4 сферы
        </span>
      </div>
      <div className="sphere-grid">
        {spheres.map((sphere, index) => {
          const answer = answers[sphere.id];
          const complete = sphereComplete(answer);
          const unlocked = spheres
            .slice(0, index)
            .every(({ id }) => sphereComplete(answers[id]));
          const Icon = sphereIcons[sphere.id];
          return (
            <section
              key={sphere.id}
              className={`sphere-card ${complete ? "complete" : ""} ${!unlocked ? "locked" : ""}`}
              aria-labelledby={`sphere-${sphere.id}`}
            >
              <div className="sphere-heading">
                <span className="sphere-icon">
                  <Icon size={22} strokeWidth={1.6} />
                </span>
                <h3 id={`sphere-${sphere.id}`}>{sphere.title}</h3>
                <SphereHelp sphere={sphere} />
                <span
                  className="sphere-step"
                  aria-label={
                    complete ? "Сфера заполнена" : `Сфера ${index + 1} из 4`
                  }
                >
                  {complete ? <Check size={17} /> : `0${index + 1}`}
                </span>
              </div>
              <fieldset disabled={!unlocked || saving || exporting}>
                <legend className="sr-only">
                  Оценка сферы «{sphere.title}»
                </legend>
                <div className="sphere-score-label">
                  <label htmlFor={`score-${sphere.id}`}>
                    Насколько наполнена эта сфера?
                  </label>
                  <output
                    htmlFor={`score-${sphere.id}`}
                    className={answer.score === null ? "unanswered" : ""}
                  >
                    {answer.score === null ? "Не оценено" : `${answer.score}%`}
                  </output>
                </div>
                <div
                  className={`sphere-range ${answer.score === null ? "unanswered" : ""}`}
                  style={
                    {
                      "--score": `${answer.score ?? 0}%`,
                      "--score-color": scoreColor(answer.score ?? 0),
                    } as CSSProperties
                  }
                >
                  <div className="sphere-track" aria-hidden="true">
                    <span />
                    <i />
                    <i />
                    <i />
                  </div>
                  <input
                    id={`score-${sphere.id}`}
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={answer.score ?? 0}
                    aria-valuetext={
                      answer.score === null
                        ? "Не оценено. Выберите значение от 0 до 100 процентов"
                        : `${answer.score}%`
                    }
                    onChange={(event) =>
                      update(sphere.id, { score: Number(event.target.value) })
                    }
                    onPointerUp={(event) =>
                      update(sphere.id, {
                        score: Number(event.currentTarget.value),
                      })
                    }
                    onKeyDown={(event) => {
                      if (
                        answer.score === null &&
                        ["Home", "ArrowLeft", "ArrowDown"].includes(event.key)
                      )
                        update(sphere.id, { score: 0 });
                    }}
                  />
                </div>
                <div className="sphere-ticks" aria-hidden="true">
                  <span>0%</span>
                  <span>25%</span>
                  <span>50%</span>
                  <span>75%</span>
                  <span>100%</span>
                </div>
                <div className="sphere-scale-hints">
                  <span>Совсем не наполнена</span>
                  <span>Полностью наполнена</span>
                </div>
                <label
                  className="sphere-explanation-label"
                  htmlFor={`explanation-${sphere.id}`}
                >
                  Почему вы так оцениваете эту сферу?
                </label>
                <textarea
                  id={`explanation-${sphere.id}`}
                  rows={3}
                  maxLength={explanationLimit}
                  disabled={
                    !unlocked || answer.score === null || saving || exporting
                  }
                  value={answer.explanation}
                  placeholder="Что сейчас радует, а чего не хватает?"
                  onChange={(event) =>
                    update(sphere.id, { explanation: event.target.value })
                  }
                  aria-describedby={`hint-${sphere.id}`}
                />
                <div className="sphere-field-hint" id={`hint-${sphere.id}`}>
                  <span>
                    {!unlocked
                      ? "Сначала заполните предыдущую сферу"
                      : answer.score === null
                        ? "Сначала выберите значение на шкале"
                        : "Достаточно нескольких предложений"}
                  </span>
                  <span>
                    {answer.explanation.length}/{explanationLimit}
                  </span>
                </div>
              </fieldset>
            </section>
          );
        })}
      </div>
      {ready ? (
        <section
          className="workbook-priority"
          aria-labelledby="priority-heading"
        >
          <div className="workbook-priority-heading">
            <span className="sphere-icon">
              <ArrowRight size={21} />
            </span>
            <div>
              <h2 id="priority-heading">Что сейчас требует вашего внимания?</h2>
              <p>Выберите одну сферу, на которой хотите сосредоточиться.</p>
            </div>
          </div>
          <fieldset
            className="sphere-priorities"
            disabled={saving || exporting}
          >
            <legend className="sr-only">Приоритетная сфера</legend>
            {spheres.map(({ id, title }) => (
              <label key={id} className={priority === id ? "selected" : ""}>
                <input
                  type="radio"
                  name="priority"
                  value={id}
                  checked={priority === id}
                  onChange={() => {
                    setPriority(id);
                    setError("");
                  }}
                  required
                />
                {title}
              </label>
            ))}
          </fieldset>
          <div className="workbook-actions">
            <div role="status" className="workbook-save-status">
              {unchanged && saved ? (
                <>
                  <Check size={17} /> Сохранено · {workbookDate(saved)}
                </>
              ) : saved ? (
                "Есть несохранённые изменения"
              ) : (
                "Сохраните результат, чтобы скачать PDF с датой заполнения."
              )}
            </div>
            <div className="workbook-action-buttons">
              <button
                type="submit"
                className="button primary"
                disabled={!priority || saving || exporting || unchanged}
              >
                {saving ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Save size={17} />
                )}
                {saving ? "Сохраняем…" : "Сохранить результат"}
              </button>
              <button
                type="button"
                className="button secondary"
                disabled={!unchanged || saving || exporting}
                onClick={() => void exportPdf()}
              >
                {exporting ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Download size={17} />
                )}
                {exporting ? "Готовим PDF…" : "Скачать PDF"}
              </button>
            </div>
          </div>
        </section>
      ) : (
        <p className="workbook-next-hint">
          Заполните четыре сферы, чтобы выбрать приоритет и сохранить результат.
        </p>
      )}
      {error && (
        <p className="workbook-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
