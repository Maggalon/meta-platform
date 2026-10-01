"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Plus,
  Save,
  Check,
  LoaderCircle,
  GitCompareArrows,
  Pencil,
  GripVertical,
  Trash2,
  Compass,
  ArrowLeft,
  HelpCircle,
} from "lucide-react";
import { api, Modal } from "./ui";
import {
  countWords,
  alignmentQuestions,
  type CompassResult,
} from "@/lib/compass";
import {
  odysseyScenarios,
  odysseyIndicators,
  eventCategories,
  emptyOdyssey,
  newOdysseyEvent,
  odysseyEventSchema,
  scenarioRequirements,
  moveOdysseyEvent,
  type OdysseyInput,
  type OdysseyResult,
  type OdysseyScenario,
  type OdysseyScenarioId,
  type OdysseyEvent,
} from "@/lib/odyssey";
import OdysseyDrawingEditor, { DrawingPreview } from "./odyssey-drawing";

type CompassGuides = Pick<
  CompassResult,
  "work" | "life" | "alignment" | "savedAt"
>;
const years = [1, 2, 3, 4, 5];
export default function WorkbookOdyssey() {
  const [plan, setPlan] = useState<OdysseyInput | null>(null);
  const [revision, setRevision] = useState(0);
  const [saved, setSaved] = useState("");
  const [guides, setGuides] = useState<CompassGuides | null>(null);
  const [loadingError, setLoadingError] = useState("");
  const [reload, setReload] = useState(0);
  const [active, setActive] = useState<OdysseyScenarioId>("current");
  const [compare, setCompare] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState<{
    scenarioId: OdysseyScenarioId;
    event: OdysseyEvent;
    isNew: boolean;
  } | null>(null);
  const [editorError, setEditorError] = useState("");
  const [deleteId, setDeleteId] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [dragging, setDragging] = useState<{
    id: string;
    title: string;
    x: number;
    y: number;
  } | null>(null);
  const [dropYear, setDropYear] = useState<number | null>(null);
  const busy = useRef(false);
  const timeline = useRef<HTMLDivElement>(null);
  const errorMessage = useRef<HTMLParagraphElement>(null);
  const dragId = useRef<string | null>(null);
  const closeEditor = useCallback(() => {
    setEditor(null);
    setEditorError("");
    setDeleteId("");
  }, []);
  useEffect(() => {
    if (error) errorMessage.current?.scrollIntoView({ block: "center" });
  }, [error]);
  useEffect(() => {
    let cancelled = false;
    api<{ result: OdysseyResult | null; compass: CompassGuides | null }>(
      "workbook/5",
    )
      .then((response) => {
        if (cancelled) return;
        const value = response.result
          ? {
              startYear: response.result.startYear,
              scenarios: response.result.scenarios,
            }
          : emptyOdyssey();
        setPlan(value);
        setRevision(response.result?.revision ?? 0);
        setSaved(response.result ? JSON.stringify(value) : "");
        setGuides(response.compass);
        setLoadingError("");
      })
      .catch((cause) => {
        if (!cancelled) setLoadingError((cause as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [reload]);
  function changeScenario(
    id: OdysseyScenarioId,
    change: (scenario: OdysseyScenario) => OdysseyScenario,
  ) {
    if (busy.current) return;
    setPlan((previous) =>
      previous
        ? {
            ...previous,
            scenarios: previous.scenarios.map((scenario) =>
              scenario.id === id
                ? { ...change(scenario), status: "draft" }
                : scenario,
            ),
          }
        : previous,
    );
    setError("");
  }
  async function save(completeId?: OdysseyScenarioId) {
    if (!plan || busy.current) return;
    const next = {
      ...plan,
      scenarios: plan.scenarios.map((scenario) =>
        scenario.id === completeId
          ? { ...scenario, status: "completed" as const }
          : scenario,
      ),
    };
    if (completeId) {
      const missing = scenarioRequirements(
        next.scenarios.find((scenario) => scenario.id === completeId)!,
      );
      if (missing.length) {
        setError(`Для завершения нужны: ${missing.join(", ")}.`);
        return;
      }
    }
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await api<{ result: OdysseyResult }>("workbook/5", {
        plan: next,
        revision,
      });
      const value = {
        startYear: response.result.startYear,
        scenarios: response.result.scenarios,
      };
      setPlan(value);
      setRevision(response.result.revision);
      setSaved(JSON.stringify(value));
      setAnnouncement(
        completeId
          ? "Сценарий завершён и сохранён"
          : "Все три сценария сохранены",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  function moveEvent(eventId: string, year: number) {
    if (!plan || busy.current) return;
    const scenario = plan.scenarios.find((item) => item.id === active)!;
    const changed = moveOdysseyEvent(scenario, eventId, year);
    if (changed === scenario) return;
    changeScenario(active, () => changed);
    setAnnouncement(`Событие перенесено в год ${year}. Сохраните изменения.`);
  }
  function commitEvent() {
    if (!editor) return;
    const parsed = odysseyEventSchema.safeParse(editor.event);
    if (!parsed.success) {
      setEditorError(
        parsed.error.issues[0]?.message || "Проверьте поля события",
      );
      return;
    }
    changeScenario(editor.scenarioId, (scenario) => ({
      ...scenario,
      events: editor.isNew
        ? [...scenario.events, parsed.data]
        : scenario.events.map((event) =>
            event.id === parsed.data.id ? parsed.data : event,
          ),
    }));
    closeEditor();
  }
  const editEvent = (change: Partial<OdysseyEvent>) => {
    setEditor((current) =>
      current
        ? { ...current, event: { ...current.event, ...change } }
        : current,
    );
    setEditorError("");
  };
  function openEvent(event: OdysseyEvent, isNew = false) {
    setEditor({ scenarioId: active, event: structuredClone(event), isNew });
    setEditorError("");
    setDeleteId("");
  }
  function compassPanel() {
    return (
      <aside className="odyssey-compass">
        <div>
          <Compass size={18} />
          <h4>Ориентиры из «Компаса»</h4>
        </div>
        {guides ? (
          <>
            <p className="odyssey-note">
              Сохранённые взгляды на работу и жизнь. Сопоставьте с ними этот
              сценарий.
            </p>
            {[
              { title: "Работа", text: guides.work },
              { title: "Жизнь", text: guides.life },
              ...alignmentQuestions.map((question) => ({
                title: question.title,
                text: guides.alignment[question.id],
              })),
            ]
              .filter((item) => item.text.trim())
              .map((item, index) => (
                <details key={index} open={index < 2}>
                  <summary>{item.title}</summary>
                  <p>{item.text}</p>
                </details>
              ))}
          </>
        ) : (
          <p>
            Вы ещё не сохранили «Компас». Оценку можно поставить сейчас или
            сначала <a href="/#workbook/2">сформулировать свои ориентиры</a>.
          </p>
        )}
      </aside>
    );
  }
  if (loadingError)
    return (
      <div className="workbook-loading panel">
        <p role="alert">{loadingError}</p>
        <button
          className="button secondary"
          onClick={() => {
            setLoadingError("");
            setReload((n) => n + 1);
          }}
        >
          Повторить загрузку
        </button>
      </div>
    );
  if (!plan)
    return (
      <div className="workbook-loading" role="status">
        <LoaderCircle className="spin" size={22} />
        Загружаем планы…
      </div>
    );
  const scenario = plan.scenarios.find((item) => item.id === active)!;
  const definition = odysseyScenarios.find((item) => item.id === active)!;
  const unchanged = saved === JSON.stringify(plan);
  const titleCount = countWords(scenario.title);
  const eventSummary = (event: OdysseyEvent) => (
    <div
      className={`odyssey-event-summary category-${event.category}`}
      key={event.id}
    >
      <small>
        {
          eventCategories.find((category) => category.id === event.category)!
            .title
        }
        {event.assumption ? " · Предположение" : ""}
      </small>
      <strong>{event.title}</strong>
      {event.drawing.length > 0 && <DrawingPreview drawing={event.drawing} />}
      <p>{event.description}</p>
    </div>
  );
  return (
    <div className="workbook-assessment odyssey-workbook">
      <div className="workbook-intro">
        <div>
          <h2>Три возможные жизни</h2>
          <p>
            Исследуйте разные пути на ближайшие пять лет. Это версии будущего,
            которые можно уточнять и пересматривать.
          </p>
        </div>
        <span className="workbook-progress">
          <strong>
            {
              plan.scenarios.filter((item) => item.status === "completed")
                .length
            }
          </strong>{" "}
          / 3 сценария
        </span>
      </div>
      <div className="odyssey-toolbar">
        <label>
          Первый год
          <select
            value={plan.startYear}
            disabled={saving}
            onChange={(event) => {
              setPlan({
                ...plan,
                startYear: Number(event.target.value),
                scenarios: plan.scenarios.map((item) => ({
                  ...item,
                  status: "draft",
                })),
              });
              setError("");
            }}
          >
            {Array.from(
              new Set([
                plan.startYear,
                ...Array.from(
                  { length: 11 },
                  (_, i) => new Date().getFullYear() - 1 + i,
                ),
              ]),
            )
              .sort((a, b) => a - b)
              .map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
          </select>
        </label>
        <div>
          <button
            className="button secondary"
            onClick={() => setCompare((value) => !value)}
          >
            {compare ? <ArrowLeft size={16} /> : <GitCompareArrows size={16} />}{" "}
            {compare ? "К редактированию" : "Сравнить сценарии"}
          </button>
          <button
            className="button primary"
            disabled={saving || unchanged}
            onClick={() => void save()}
          >
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            Сохранить планы
          </button>
        </div>
      </div>
      <p className="odyssey-save-status" role="status">
        {saving
          ? "Сохраняем…"
          : unchanged
            ? "Все изменения сохранены"
            : "Черновики всех сценариев можно сохранить на любом этапе."}
      </p>
      {error && (
        <p className="workbook-error" role="alert" ref={errorMessage}>
          {error}
        </p>
      )}
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {compare ? (
        <section aria-label="Сравнение сценариев">
          <p className="odyssey-note">
            Смотрите на различия по годам и по четырём оценкам. Здесь не нужно
            выбирать единственный «правильный» план.
          </p>
          <div
            className="odyssey-comparison-scroll"
            tabIndex={0}
            aria-label="Таблица сравнения: прокрутите по горизонтали"
          >
            <table className="odyssey-comparison">
              <thead>
                <tr>
                  <th scope="col">Ориентир</th>
                  {odysseyScenarios.map((item, index) => {
                    const s = plan.scenarios.find(
                      (scenario) => scenario.id === item.id,
                    )!;
                    return (
                      <th scope="col" key={item.id}>
                        <span>СЦЕНАРИЙ {index + 1}</span>
                        <h3>{s.title || item.title}</h3>
                        <p>{item.prompt}</p>
                        <small>
                          {s.status === "completed" ? "Завершён" : "Черновик"}
                        </small>
                        <button
                          className="button secondary"
                          onClick={() => {
                            setActive(item.id);
                            setCompare(false);
                          }}
                        >
                          Редактировать
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {years.map((year) => (
                  <tr key={year}>
                    <th scope="row">
                      Год {year}
                      <small>{plan.startYear + year - 1}</small>
                    </th>
                    {odysseyScenarios.map(({ id }) => (
                      <td key={id}>
                        {plan.scenarios
                          .find((scenario) => scenario.id === id)!
                          .events.filter((event) => event.year === year)
                          .map(eventSummary)}
                        {!plan.scenarios
                          .find((scenario) => scenario.id === id)!
                          .events.some((event) => event.year === year) && (
                          <span className="odyssey-note">Пока нет событий</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr>
                  <th scope="row">Исследовательские вопросы</th>
                  {odysseyScenarios.map(({ id }) => (
                    <td key={id}>
                      <ol>
                        {plan.scenarios
                          .find((scenario) => scenario.id === id)!
                          .questions.map((question, index) => (
                            <li key={index}>
                              {question || "Пока не сформулирован"}
                            </li>
                          ))}
                      </ol>
                    </td>
                  ))}
                </tr>
                {odysseyIndicators.map((indicator) => (
                  <tr key={indicator.id}>
                    <th scope="row">{indicator.title}</th>
                    {odysseyScenarios.map(({ id }) => {
                      const rating = plan.scenarios.find(
                        (scenario) => scenario.id === id,
                      )!.ratings[indicator.id];
                      return (
                        <td key={id}>
                          <div className="odyssey-compare-score">
                            <strong>
                              {rating.score === null
                                ? "—"
                                : `${rating.score} / 10`}
                            </strong>
                            <div aria-hidden="true">
                              <i
                                style={{
                                  width: `${(rating.score ?? 0) * 10}%`,
                                }}
                              />
                            </div>
                          </div>
                          <p>{rating.why || "Пояснение пока не добавлено"}</p>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {compassPanel()}
        </section>
      ) : (
        <>
          <div
            className="odyssey-tabs"
            role="tablist"
            aria-label="Сценарии будущего"
          >
            {odysseyScenarios.map((item, index) => (
              <button
                key={item.id}
                id={`odyssey-tab-${item.id}`}
                role="tab"
                aria-selected={active === item.id}
                aria-controls={`odyssey-panel-${item.id}`}
                tabIndex={active === item.id ? 0 : -1}
                onClick={() => setActive(item.id)}
                onKeyDown={(event) => {
                  const step =
                    event.key === "ArrowRight"
                      ? 1
                      : event.key === "ArrowLeft"
                        ? -1
                        : 0;
                  if (!step) return;
                  event.preventDefault();
                  const next = odysseyScenarios[(index + step + 3) % 3].id;
                  setActive(next);
                  document.getElementById(`odyssey-tab-${next}`)?.focus();
                }}
              >
                <span>0{index + 1}</span>
                <strong>{item.title}</strong>
                {plan.scenarios.find((scenario) => scenario.id === item.id)!
                  .status === "completed" && <Check size={16} />}
              </button>
            ))}
          </div>
          <section
            role="tabpanel"
            id={`odyssey-panel-${active}`}
            aria-labelledby={`odyssey-tab-${active}`}
          >
            <div className="odyssey-scenario-intro">
              <p>{definition.prompt}</p>
              <span>
                {scenario.status === "completed"
                  ? "Сценарий завершён"
                  : "Черновик сценария"}
              </span>
            </div>
            <div className="odyssey-title-field">
              <label htmlFor={`odyssey-title-${active}`}>
                Название вашей жизни из шести слов
              </label>
              <input
                id={`odyssey-title-${active}`}
                value={scenario.title}
                maxLength={250}
                disabled={saving}
                placeholder="Шесть слов, которые передают смысл этого пути"
                onChange={(event) =>
                  changeScenario(active, (s) => ({
                    ...s,
                    title: event.target.value,
                  }))
                }
              />
              <p className={titleCount === 6 ? "complete" : ""}>
                {titleCount} / 6 слов
                {titleCount === 6
                  ? " · Название готово"
                  : " · Черновик можно сохранить с любым названием"}
              </p>
            </div>
            <div className="odyssey-section-heading">
              <h3>Пять лет в событиях</h3>
              <p>
                Перетаскивайте карточки за ручку. Год также можно выбрать в
                самой карточке.
              </p>
            </div>
            <div className="odyssey-timeline" ref={timeline}>
              {years.map((year) => (
                <section
                  key={year}
                  className={`odyssey-year ${dropYear === year ? "drop-target" : ""}`}
                  data-odyssey-year={year}
                  aria-label={`Год ${year}, ${plan.startYear + year - 1}`}
                  onDragOver={(event) => {
                    if (busy.current || !dragId.current) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropYear(year);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (dragId.current) moveEvent(dragId.current, year);
                    dragId.current = null;
                    setDropYear(null);
                  }}
                >
                  <header>
                    <span>ГОД {year}</span>
                    <strong>{plan.startYear + year - 1}</strong>
                  </header>
                  <div className="odyssey-year-events">
                    {scenario.events
                      .filter((event) => event.year === year)
                      .map((event) => (
                        <article
                          key={event.id}
                          className={`odyssey-event category-${event.category}`}
                          draggable={!saving}
                          onDragStart={(dragEvent) => {
                            if (
                              (dragEvent.target as Element).closest(
                                "button,input,select",
                              )
                            ) {
                              dragEvent.preventDefault();
                              return;
                            }
                            dragId.current = event.id;
                            dragEvent.dataTransfer.effectAllowed = "move";
                            dragEvent.dataTransfer.setData(
                              "text/plain",
                              event.id,
                            );
                          }}
                          onDragEnd={() => {
                            dragId.current = null;
                            setDropYear(null);
                          }}
                        >
                          <div className="odyssey-event-top">
                            <small>
                              {
                                eventCategories.find(
                                  (category) => category.id === event.category,
                                )!.title
                              }
                            </small>
                            <button
                              className="odyssey-drag-handle"
                              type="button"
                              disabled={saving}
                              aria-label={`Перетащить событие «${event.title}»`}
                              onPointerDown={(e) => {
                                if (e.button !== 0 || saving) return;
                                e.preventDefault();
                                e.currentTarget.setPointerCapture(e.pointerId);
                                dragId.current = event.id;
                                setDragging({
                                  id: event.id,
                                  title: event.title,
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                              }}
                              onPointerMove={(e) => {
                                if (
                                  !e.currentTarget.hasPointerCapture(
                                    e.pointerId,
                                  )
                                )
                                  return;
                                setDragging({
                                  id: event.id,
                                  title: event.title,
                                  x: e.clientX,
                                  y: e.clientY,
                                });
                                const bounds =
                                  timeline.current?.getBoundingClientRect();
                                if (bounds && timeline.current) {
                                  if (e.clientX > bounds.right - 40)
                                    timeline.current.scrollLeft += 16;
                                  if (e.clientX < bounds.left + 40)
                                    timeline.current.scrollLeft -= 16;
                                }
                                const target = document
                                  .elementFromPoint(e.clientX, e.clientY)
                                  ?.closest<HTMLElement>("[data-odyssey-year]");
                                setDropYear(
                                  target && timeline.current?.contains(target)
                                    ? Number(target.dataset.odysseyYear)
                                    : null,
                                );
                              }}
                              onPointerUp={(e) => {
                                if (
                                  !e.currentTarget.hasPointerCapture(
                                    e.pointerId,
                                  )
                                )
                                  return;
                                const target = document
                                  .elementFromPoint(e.clientX, e.clientY)
                                  ?.closest<HTMLElement>("[data-odyssey-year]");
                                if (
                                  target &&
                                  timeline.current?.contains(target)
                                )
                                  moveEvent(
                                    event.id,
                                    Number(target.dataset.odysseyYear),
                                  );
                                dragId.current = null;
                                setDragging(null);
                                setDropYear(null);
                                e.currentTarget.releasePointerCapture(
                                  e.pointerId,
                                );
                              }}
                              onPointerCancel={() => {
                                dragId.current = null;
                                setDragging(null);
                                setDropYear(null);
                              }}
                            >
                              <GripVertical size={18} />
                            </button>
                          </div>
                          <button
                            className="odyssey-event-open"
                            disabled={saving}
                            onClick={() => openEvent(event)}
                          >
                            <strong>{event.title}</strong>
                            {event.drawing.length > 0 && (
                              <DrawingPreview drawing={event.drawing} />
                            )}
                            <p>{event.description}</p>
                          </button>
                          {event.assumption && (
                            <span className="odyssey-assumption">
                              <HelpCircle size={12} />
                              Предположение
                            </span>
                          )}
                          <label className="odyssey-move-label">
                            Перенести в
                            <select
                              aria-label={`Год события «${event.title}»`}
                              disabled={saving}
                              value={year}
                              onChange={(e) =>
                                moveEvent(event.id, Number(e.target.value))
                              }
                            >
                              {years.map((y) => (
                                <option key={y} value={y}>
                                  Год {y}
                                </option>
                              ))}
                            </select>
                          </label>
                          <button
                            className="odyssey-edit-event"
                            disabled={saving}
                            onClick={() => openEvent(event)}
                          >
                            <Pencil size={12} />
                            Изменить
                          </button>
                        </article>
                      ))}
                  </div>
                  <button
                    className="odyssey-add-event"
                    disabled={saving || scenario.events.length >= 40}
                    onClick={() => openEvent(newOdysseyEvent(year), true)}
                  >
                    <Plus size={16} />
                    Добавить событие
                  </button>
                </section>
              ))}
            </div>
            {scenario.events.length >= 40 && (
              <p className="odyssey-note">
                В сценарии уже 40 событий. Можно редактировать существующие.
              </p>
            )}
            <section className="odyssey-questions">
              <div className="odyssey-section-heading">
                <h3>Что нужно исследовать?</h3>
                <p>
                  Два-три вопроса, ответы на которые помогут проверить этот
                  путь. Например: «Как выглядит обычный день в этой профессии?»
                </p>
              </div>
              {scenario.questions.map((question, index) => (
                <label key={index}>
                  Вопрос {index + 1}
                  <textarea
                    rows={2}
                    maxLength={500}
                    disabled={saving}
                    value={question}
                    onChange={(event) =>
                      changeScenario(active, (s) => ({
                        ...s,
                        questions: s.questions.map((value, i) =>
                          i === index ? event.target.value : value,
                        ),
                      }))
                    }
                  />
                </label>
              ))}
              {scenario.questions.length === 2 ? (
                <button
                  className="button secondary"
                  disabled={saving}
                  onClick={() =>
                    changeScenario(active, (s) => ({
                      ...s,
                      questions: [...s.questions, ""],
                    }))
                  }
                >
                  <Plus size={15} />
                  Третий вопрос
                </button>
              ) : (
                <button
                  className="button secondary"
                  disabled={saving || Boolean(scenario.questions[2].trim())}
                  onClick={() =>
                    changeScenario(active, (s) => ({
                      ...s,
                      questions: s.questions.slice(0, 2),
                    }))
                  }
                >
                  Убрать пустой третий вопрос
                </button>
              )}
            </section>
            <div className="odyssey-section-heading">
              <h3>Как вы чувствуете этот план?</h3>
              <p>
                Оцените каждый показатель от 0 до 10. Пояснение «Почему так?»
                поможет вернуться к своим выводам.
              </p>
            </div>
            <div className="odyssey-ratings">
              {odysseyIndicators.map((indicator) => {
                const rating = scenario.ratings[indicator.id];
                return (
                  <section
                    className={`odyssey-rating rating-${indicator.id}`}
                    key={indicator.id}
                  >
                    <div>
                      <h3>{indicator.title}</h3>
                      <output htmlFor={`odyssey-${active}-${indicator.id}`}>
                        {rating.score === null
                          ? "Не оценено"
                          : `${rating.score} / 10`}
                      </output>
                    </div>
                    <p>{indicator.question}</p>
                    <input
                      id={`odyssey-${active}-${indicator.id}`}
                      type="range"
                      min={0}
                      max={10}
                      step={1}
                      disabled={saving}
                      value={rating.score ?? 0}
                      aria-label={indicator.title}
                      aria-valuetext={
                        rating.score === null
                          ? "Не оценено"
                          : `${rating.score} из 10`
                      }
                      style={
                        {
                          "--rating-fill": `${(rating.score ?? 0) * 10}%`,
                        } as React.CSSProperties
                      }
                      onChange={(event) =>
                        changeScenario(active, (s) => ({
                          ...s,
                          ratings: {
                            ...s.ratings,
                            [indicator.id]: {
                              ...rating,
                              score: Number(event.target.value),
                            },
                          },
                        }))
                      }
                    />
                    <div className="odyssey-rating-ends">
                      <span>0 · {indicator.low}</span>
                      <span>10 · {indicator.high}</span>
                    </div>
                    {rating.score === null && (
                      <button
                        className="odyssey-zero"
                        disabled={saving}
                        onClick={() =>
                          changeScenario(active, (s) => ({
                            ...s,
                            ratings: {
                              ...s.ratings,
                              [indicator.id]: { ...rating, score: 0 },
                            },
                          }))
                        }
                      >
                        Выбрать 0
                      </button>
                    )}
                    <label>
                      Почему так?
                      <textarea
                        rows={3}
                        maxLength={1500}
                        disabled={saving}
                        value={rating.why}
                        placeholder="На что вы опираетесь в этой оценке?"
                        onChange={(event) =>
                          changeScenario(active, (s) => ({
                            ...s,
                            ratings: {
                              ...s.ratings,
                              [indicator.id]: {
                                ...rating,
                                why: event.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                    {indicator.id === "alignment" && compassPanel()}
                  </section>
                );
              })}
            </div>
            <div className="odyssey-finish">
              <p>
                {scenario.status === "completed"
                  ? "Сценарий завершён. После правок его можно завершить ещё раз."
                  : "Не обязательно знать все ответы сразу. Сохраняйте черновик и возвращайтесь к плану."}
              </p>
              <button
                className="button primary"
                disabled={saving || scenario.status === "completed"}
                onClick={() => void save(active)}
              >
                <Check size={16} />
                Завершить сценарий
              </button>
            </div>
          </section>
        </>
      )}
      <div className="odyssey-bottom-save">
        <button
          className="button primary"
          disabled={saving || unchanged}
          onClick={() => void save()}
        >
          <Save size={16} />
          Сохранить все три плана
        </button>
      </div>
      {dragging && (
        <div
          className="odyssey-drag-preview"
          style={{ left: dragging.x + 12, top: dragging.y + 12 }}
        >
          {dragging.title}
        </div>
      )}
      {editor && (
        <Modal
          title={editor.isNew ? "Новое событие" : "Событие сценария"}
          subtitle="Добавьте то, что хотите увидеть в своей жизни"
          wide
          onClose={closeEditor}
        >
          <form
            className="odyssey-event-editor"
            onSubmit={(event) => {
              event.preventDefault();
              commitEvent();
            }}
          >
            <div className="odyssey-event-fields">
              <label>
                Категория
                <select
                  value={editor.event.category}
                  onChange={(event) =>
                    editEvent({
                      category: event.target.value as OdysseyEvent["category"],
                    })
                  }
                >
                  {eventCategories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.title}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Год
                <select
                  value={editor.event.year}
                  onChange={(event) =>
                    editEvent({ year: Number(event.target.value) })
                  }
                >
                  {years.map((year) => (
                    <option key={year} value={year}>
                      Год {year} · {plan.startYear + year - 1}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Название события
              <input
                required
                maxLength={160}
                value={editor.event.title}
                onChange={(event) => editEvent({ title: event.target.value })}
              />
            </label>
            <label>
              Описание
              <textarea
                rows={3}
                maxLength={2000}
                value={editor.event.description}
                onChange={(event) =>
                  editEvent({ description: event.target.value })
                }
              />
            </label>
            <label className="odyssey-assumption-check">
              <input
                type="checkbox"
                checked={editor.event.assumption}
                onChange={(event) =>
                  editEvent({ assumption: event.target.checked })
                }
              />
              Это предположение, которое ещё нужно проверить
            </label>
            <details
              className="odyssey-sketch"
              open={editor.event.drawing.length > 0 || undefined}
            >
              <summary>Рисунок к событию (необязательно)</summary>
              <OdysseyDrawingEditor
                value={editor.event.drawing}
                onChange={(drawing) => editEvent({ drawing })}
              />
            </details>
            {editorError && (
              <p className="workbook-error" role="alert">
                {editorError}
              </p>
            )}
            <p className="odyssey-note">
              После добавления события сохраните планы, чтобы вернуться к ним
              позже.
            </p>
            <div className="odyssey-editor-actions">
              {!editor.isNew && (
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setDeleteId(editor.event.id)}
                >
                  <Trash2 size={15} />
                  Удалить событие
                </button>
              )}
              <button type="submit" className="button primary">
                <Check size={16} />
                {editor.isNew ? "Добавить в план" : "Применить изменения"}
              </button>
            </div>
            {deleteId === editor.event.id && (
              <div className="diary-delete-confirm">
                <p>Удалить событие вместе с рисунком из этого сценария?</p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => {
                    changeScenario(editor.scenarioId, (s) => ({
                      ...s,
                      events: s.events.filter(
                        (item) => item.id !== editor.event.id,
                      ),
                    }));
                    closeEditor();
                  }}
                >
                  Удалить
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setDeleteId("")}
                >
                  Отмена
                </button>
              </div>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
