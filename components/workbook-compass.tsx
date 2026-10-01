"use client";

import { useEffect, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Sun,
  Compass,
  CircleHelp,
  ChevronDown,
  Sparkles,
  Save,
  Check,
  LoaderCircle,
  Plus,
  Download,
} from "lucide-react";
import { api, counted } from "./ui";
import { workbookDate } from "@/lib/workbook";
import {
  compassSpaces,
  alignmentQuestions,
  emptyCompass,
  countWords,
  compassComplete,
  compassTextLimit,
  type CompassDraft,
  type CompassResult,
  type CompassSuggestion,
  type AlignmentId,
} from "@/lib/compass";

export default function WorkbookCompass() {
  const [draft, setDraft] = useState<CompassDraft>(emptyCompass);
  const [saved, setSaved] = useState<CompassResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reload, setReload] = useState(0);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiError, setAiError] = useState("");
  const [suggestion, setSuggestion] = useState<CompassSuggestion | null>(null);
  const [suggestionSource, setSuggestionSource] = useState("");
  const savingRef = useRef(false);
  const exportingRef = useRef(false);
  const analysisController = useRef<AbortController | null>(null);
  const sources = JSON.stringify({
    work: draft.work.trim(),
    life: draft.life.trim(),
  });
  const latestSources = useRef(sources);
  latestSources.current = sources;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError("");
    api<{ result: CompassResult | null; aiAvailable: boolean }>("workbook/2")
      .then(({ result, aiAvailable }) => {
        if (cancelled) return;
        setSaved(result);
        setDraft(
          result
            ? {
                work: result.work,
                life: result.life,
                alignment: result.alignment,
              }
            : emptyCompass(),
        );
        setAiAvailable(aiAvailable);
      })
      .catch((cause) => {
        if (!cancelled) setLoadError((cause as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      analysisController.current?.abort();
    };
  }, [reload]);

  const ready = Boolean(draft.work.trim() && draft.life.trim());
  const complete = compassComplete(draft);
  const hasText = [
    draft.work,
    draft.life,
    ...Object.values(draft.alignment),
  ].some((value) => value.trim());
  const unchanged =
    saved !== null &&
    draft.work.trim() === saved.work &&
    draft.life.trim() === saved.life &&
    alignmentQuestions.every(
      ({ id }) => draft.alignment[id].trim() === saved.alignment[id],
    );
  const suggestionsCurrent =
    suggestion !== null && suggestionSource === sources;

  function updateSpace(id: "work" | "life", value: string) {
    setDraft((previous) => ({ ...previous, [id]: value }));
    setError("");
  }
  function updateAlignment(id: AlignmentId, value: string) {
    setDraft((previous) => ({
      ...previous,
      alignment: { ...previous.alignment, [id]: value },
    }));
    setError("");
  }
  async function save(status: "draft" | "completed") {
    if (
      savingRef.current ||
      exportingRef.current ||
      !hasText ||
      (status === "completed" && !complete)
    )
      return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const { result } = await api<{ result: CompassResult }>("workbook/2", {
        ...draft,
        status,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
      });
      setSaved(result);
      setDraft({
        work: result.work,
        life: result.life,
        alignment: result.alignment,
      });
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  async function exportPdf() {
    if (!saved || !unchanged || savingRef.current || exportingRef.current)
      return;
    exportingRef.current = true;
    setExporting(true);
    setError("");
    try {
      const response = await fetch("/api/workbook/2/pdf", {
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
      link.download = `Компас - ${workbookDate(saved)}${saved.status === "draft" ? " - черновик" : ""}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  }
  async function analyze() {
    if (!ready || !aiAvailable || analysisController.current) return;
    const controller = new AbortController();
    analysisController.current = controller;
    const source = sources;
    setAnalyzing(true);
    setAiError("");
    try {
      const response = await fetch("/api/workbook/2/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: source,
        signal: controller.signal,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Не удалось получить помощь ИИ.");
      if (latestSources.current !== source) {
        setAiError(
          "Вы изменили тексты во время анализа. Запросите помощь ещё раз для новой версии.",
        );
        return;
      }
      setSuggestion(payload.suggestion);
      setSuggestionSource(source);
    } catch (cause) {
      if (!controller.signal.aborted) setAiError((cause as Error).message);
    } finally {
      if (analysisController.current === controller) {
        analysisController.current = null;
        setAnalyzing(false);
      }
    }
  }

  if (loading)
    return (
      <div className="workbook-loading" role="status">
        <LoaderCircle size={22} className="spin" /> Загружаем ваш компас…
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
      className="workbook-assessment compass-workbook"
      onSubmit={(event) => {
        event.preventDefault();
        void save(complete ? "completed" : "draft");
      }}
    >
      <div className="workbook-intro compass-intro">
        <div>
          <h2>Сформулируйте свои ориентиры</h2>
          <p>
            Опишите, что для вас важно в работе и в жизни. Затем посмотрите, как
            эти взгляды сочетаются друг с другом.
          </p>
        </div>
        <Compass size={35} strokeWidth={1.2} aria-hidden="true" />
      </div>
      <div className="compass-spaces">
        {compassSpaces.map((space) => {
          const Icon = space.id === "work" ? BriefcaseBusiness : Sun;
          return (
            <section
              className="compass-space"
              key={space.id}
              aria-labelledby={`compass-${space.id}-heading`}
            >
              <div className="compass-space-heading">
                <span className="sphere-icon">
                  <Icon size={22} strokeWidth={1.6} />
                </span>
                <h2 id={`compass-${space.id}-heading`}>{space.title}</h2>
              </div>
              <p className="compass-description">{space.description}</p>
              <details className="compass-questions">
                <summary>
                  <CircleHelp size={16} />
                  Вопросы для размышления
                  <ChevronDown size={15} />
                </summary>
                <p>
                  Можно опираться на эти вопросы. Отвечать на каждый по
                  отдельности необязательно.
                </p>
                <ul>
                  {space.questions.map((question) => (
                    <li key={question}>{question}</li>
                  ))}
                </ul>
              </details>
              <div className="compass-writing">
                <label htmlFor={`compass-${space.id}`}>
                  {space.id === "work"
                    ? "Моя философия работы"
                    : "Мои взгляды на жизнь"}
                </label>
                <textarea
                  id={`compass-${space.id}`}
                  value={draft[space.id]}
                  disabled={saving}
                  maxLength={compassTextLimit}
                  onChange={(event) =>
                    updateSpace(space.id, event.target.value)
                  }
                  placeholder={
                    space.id === "work"
                      ? "Для меня хорошая работа — это…"
                      : "Я считаю, что в жизни важно…"
                  }
                  aria-describedby={`compass-${space.id}-count`}
                  rows={12}
                />
                <div
                  className="compass-word-count"
                  id={`compass-${space.id}-count`}
                >
                  <strong>
                    {counted(countWords(draft[space.id]), [
                      "слово",
                      "слова",
                      "слов",
                    ])}
                  </strong>
                  <span>Ориентир: около 250 слов</span>
                </div>
              </div>
            </section>
          );
        })}
      </div>
      <p className="compass-length-note">
        Пишите столько, сколько нужно. Объём текста не влияет на возможность
        сохранить ответы.
      </p>
      {ready ? (
        <section
          className="compass-alignment"
          aria-labelledby="compass-alignment-heading"
        >
          <div className="compass-alignment-intro">
            <span className="sphere-icon">
              <Compass size={23} strokeWidth={1.5} />
            </span>
            <div>
              <h2 id="compass-alignment-heading">Согласованность</h2>
              <p>
                Внимательно перечитайте «Работу» и «Жизнь», затем ответьте на
                три вопроса. Можно размышлять самостоятельно или попросить ИИ
                помочь.
              </p>
            </div>
          </div>
          {/* <details className="compass-reread">
            <summary>
              Перечитать Работу и Жизнь
              <ChevronDown size={16} />
            </summary>
            <div>
              {compassSpaces.map(({ id, title }) => (
                <article key={id}>
                  <h3>{title}</h3>
                  <p>{draft[id]}</p>
                </article>
              ))}
            </div>
          </details> */}
          <div className="compass-ai-tools">
            {/* <div>
              <p>Свежий взгляд на ваши ориентиры</p>
              <span>
                {aiAvailable
                  ? "Для анализа DeepSeek получит только тексты «Работа» и «Жизнь»."
                  : "Помощь ИИ пока не подключена. Вы можете заполнить ответы самостоятельно."}
              </span>
            </div> */}
            <button
              type="button"
              className="button secondary"
              disabled={!aiAvailable || analyzing || saving}
              onClick={() => void analyze()}
            >
              {analyzing ? (
                <LoaderCircle className="spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {analyzing
                ? "ИИ читает ваши тексты…"
                : suggestion
                  ? "Обновить помощь ИИ"
                  : "Попросить ИИ помочь"}
            </button>
          </div>
          {analyzing && (
            <p className="compass-ai-status" role="status">
              Сопоставляем ваши взгляды. Пока можно продолжать писать
              собственные ответы.
            </p>
          )}
          {aiError && (
            <p className="workbook-error" role="alert">
              {aiError}
            </p>
          )}
          {suggestion && !suggestionsCurrent && (
            <p className="compass-ai-status" role="status">
              Тексты изменились. Обновите помощь ИИ, чтобы анализ учитывал новую
              версию.
            </p>
          )}
          {suggestionsCurrent && (
            <p className="compass-ai-status" role="status">
              Подсказки готовы. Выберите, что вам откликается; ваши ответы не
              заменяются автоматически.
            </p>
          )}
          <div className="compass-alignment-fields">
            {alignmentQuestions.map(({ id, title }, index) => {
              const hint = suggestionsCurrent ? suggestion![id] : null;
              const alreadyAdded =
                hint !== null && draft.alignment[id].includes(hint);
              const canAppend =
                hint !== null &&
                draft.alignment[id].length + hint.length + 2 <=
                  compassTextLimit;
              return (
                <div key={id} className="compass-alignment-field">
                  <label htmlFor={`compass-${id}`}>
                    <span>{index + 1}</span>
                    {title}
                  </label>
                  <textarea
                    id={`compass-${id}`}
                    rows={4}
                    maxLength={compassTextLimit}
                    disabled={saving}
                    value={draft.alignment[id]}
                    placeholder="Мои мысли…"
                    onChange={(event) =>
                      updateAlignment(id, event.target.value)
                    }
                  />
                  {hint && (
                    <aside
                      className="compass-ai-suggestion"
                      aria-label={`Подсказка ИИ к вопросу ${index + 1}`}
                    >
                      <strong>
                        <Sparkles size={14} />
                        Подсказка ИИ
                      </strong>
                      <p>{hint}</p>
                      <button
                        type="button"
                        className="button secondary"
                        disabled={saving || alreadyAdded || !canAppend}
                        onClick={() =>
                          updateAlignment(
                            id,
                            [draft.alignment[id].trim(), hint]
                              .filter(Boolean)
                              .join("\n\n"),
                          )
                        }
                      >
                        {alreadyAdded ? (
                          <Check size={15} />
                        ) : (
                          <Plus size={15} />
                        )}
                        {alreadyAdded
                          ? "Добавлено в ответ"
                          : draft.alignment[id].trim()
                            ? "Добавить к моему ответу"
                            : "Использовать в ответе"}
                      </button>
                    </aside>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="workbook-next-hint">
          Когда оба пространства будут заполнены, здесь откроется
          «Согласованность».
        </p>
      )}
      <div className="compass-save-bar">
        <p className="workbook-save-status" role="status">
          {saving ? (
            "Сохраняем…"
          ) : unchanged && saved ? (
            <>
              <Check size={17} />
              {saved.status === "completed"
                ? "Компас сохранён"
                : "Черновик сохранён"}{" "}
              · {workbookDate(saved)}
            </>
          ) : saved ? (
            "Есть несохранённые изменения"
          ) : (
            "Черновик можно сохранить на любом этапе."
          )}
        </p>
        <div className="workbook-action-buttons">
          <button
            type="button"
            className="button secondary"
            disabled={!hasText || saving || exporting || unchanged}
            onClick={() => void save("draft")}
          >
            <Save size={16} />
            Сохранить черновик
          </button>
          {ready && (
            <button
              type="submit"
              className="button primary"
              disabled={
                !complete ||
                saving ||
                exporting ||
                (unchanged && saved?.status === "completed")
              }
            >
              {saving ? (
                <LoaderCircle size={17} className="spin" />
              ) : (
                <Check size={17} />
              )}
              Сохранить компас
            </button>
          )}
          <button
            type="button"
            className="button secondary"
            disabled={!unchanged || saving || exporting}
            aria-describedby="compass-export-hint"
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
      <p className="compass-length-note" id="compass-export-hint">
        {unchanged
          ? "В PDF войдут сохранённые тексты, ответы о согласованности и дата сохранения."
          : "Перед скачиванием PDF сохраните компас или его черновик."}
      </p>
      {error && (
        <p className="workbook-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
