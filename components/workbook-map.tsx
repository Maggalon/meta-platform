"use client";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Save,
  Download,
  Shuffle,
  Sparkles,
  LoaderCircle,
  Check,
  Lightbulb,
  X,
} from "lucide-react";
import { api } from "./ui";
import MapCanvas from "./map-canvas";
import {
  emptyMindMap,
  makeBranch,
  mapComplete,
  normalizeWord,
  randomOuterWords,
  type MindMapInput,
  type MindMapResult,
  type MapNode,
  type MapSuggestion,
  type diaryMapSuggestions,
} from "@/lib/mind-map";

type DiarySuggestion = ReturnType<typeof diaryMapSuggestions>[number];
export default function WorkbookMap() {
  const [map, setMap] = useState<MindMapInput | null>(null);
  const [revision, setRevision] = useState(0);
  const [savedJson, setSavedJson] = useState("");
  const [sources, setSources] = useState<DiarySuggestion[]>([]);
  const [aiAvailable, setAiAvailable] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reload, setReload] = useState(0);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [activeId, setActiveId] = useState("root");
  const [selecting, setSelecting] = useState(false);
  const [analysisId, setAnalysisId] = useState("");
  const [hints, setHints] = useState<Record<string, MapSuggestion>>({});
  const [deleteIdea, setDeleteIdea] = useState("");
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    api<{
      result: MindMapResult | null;
      suggestions: DiarySuggestion[];
      aiAvailable: boolean;
    }>("workbook/4")
      .then((response) => {
        if (cancelled) return;
        const value = response.result
          ? {
              core: response.result.core,
              nodes: response.result.nodes,
              selected: response.result.selected,
              ideas: response.result.ideas,
              timeZone: response.result.timeZone,
            }
          : emptyMindMap();
        setMap(value);
        setSavedJson(response.result ? JSON.stringify(value) : "");
        setRevision(response.result?.revision ?? 0);
        setSources(response.suggestions);
        setAiAvailable(response.aiAvailable);
        setLoadError("");
      })
      .catch((cause) => {
        if (!cancelled) setLoadError((cause as Error).message);
      });
    return () => {
      cancelled = true;
      controller.current?.abort();
    };
  }, [reload]);
  function edit(change: (previous: MindMapInput) => MindMapInput) {
    if (busy.current) return;
    setMap((previous) => (previous ? change(previous) : previous));
    setError("");
  }
  async function persist() {
    if (!map) throw new Error("Карта не загружена");
    const response = await api<{ result: MindMapResult }>("workbook/4", {
      map,
      revision,
    });
    const value = {
      core: response.result.core,
      nodes: response.result.nodes,
      selected: response.result.selected,
      ideas: response.result.ideas,
      timeZone: response.result.timeZone,
    };
    setMap(value);
    setRevision(response.result.revision);
    setSavedJson(JSON.stringify(value));
    return response.result;
  }
  async function save(exportPdf = false) {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setError("");
    try {
      await persist();
      if (exportPdf) {
        const response = await fetch("/api/workbook/4/pdf", {
          cache: "no-store",
        });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload.error || "Не удалось экспортировать карту");
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.download = "Карта и идеи.pdf";
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }
  async function analyze(ideaId: string) {
    if (busy.current || controller.current || !aiAvailable) return;
    const abort = new AbortController();
    let savingSource = true;
    controller.current = abort;
    setAnalysisId(ideaId);
    setError("");
    busy.current = true;
    setSaving(true);
    try {
      await persist();
      busy.current = false;
      setSaving(false);
      savingSource = false;
      const response = await fetch("/api/workbook/4/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaId }),
        signal: abort.signal,
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Не удалось получить помощь ИИ");
      if (!abort.signal.aborted)
        setHints((previous) => ({ ...previous, [ideaId]: payload.suggestion }));
    } catch (cause) {
      if (!abort.signal.aborted) setError((cause as Error).message);
    } finally {
      if (controller.current === abort) {
        controller.current = null;
        setAnalysisId("");
      }
      if (savingSource) {
        busy.current = false;
        setSaving(false);
      }
    }
  }
  if (loadError)
    return (
      <div className="workbook-loading panel">
        <p role="alert">{loadError}</p>
        <button
          className="button secondary"
          onClick={() => {
            setLoadError("");
            setReload((n) => n + 1);
          }}
        >
          Повторить загрузку
        </button>
      </div>
    );
  if (!map)
    return (
      <div className="workbook-loading" role="status">
        <LoaderCircle className="spin" size={22} />
        Загружаем карту…
      </div>
    );
  const ready = mapComplete(map);
  const filled = map.nodes.filter((node) => node.word.trim()).length;
  const roots = map.nodes.filter((node) => node.level === 2);
  const active = map.nodes.find((node) => node.id === activeId);
  let branch = active;
  while (branch && branch.level > 2)
    branch = map.nodes.find((node) => node.id === branch!.parentId);
  const chosenWords = map.selected.map(
    (id) => map.nodes.find((node) => node.id === id)!.word,
  );
  function updateWord(id: string, word: string) {
    edit((previous) => ({
      ...previous,
      nodes: previous.nodes.map((node) =>
        node.id === id ? { ...node, word } : node,
      ),
      selected: [],
    }));
  }
  function addChild(parentId: string, level: 2 | 3 | 4) {
    const added = makeBranch(parentId, level);
    edit((previous) => ({
      ...previous,
      nodes: [...previous.nodes, ...added],
      selected: [],
    }));
    setActiveId(added[0].id);
  }
  function pick(id: string) {
    if (!map || !ready || busy.current) return;
    if (map.selected.includes(id)) {
      edit((previous) => ({
        ...previous,
        selected: previous.selected.filter((item) => item !== id),
      }));
      return;
    }
    if (map.selected.length >= 3) {
      setError("Уже выбраны три слова. Снимите одно, чтобы выбрать другое.");
      return;
    }
    const node = map.nodes.find((item) => item.id === id);
    if (!node || node.level !== 4) return;
    if (
      chosenWords.some(
        (word) => normalizeWord(word) === normalizeWord(node.word),
      )
    ) {
      setError("Выберите три разных слова.");
      return;
    }
    edit((previous) => ({ ...previous, selected: [...previous.selected, id] }));
  }
  function nodeSelect(id: string) {
    if (
      selecting &&
      ready &&
      map?.nodes.find((node) => node.id === id)?.level === 4
    ) {
      pick(id);
      return;
    }
    setActiveId(id);
    requestAnimationFrame(() => {
      const input = editor.current?.querySelector<
        HTMLInputElement | HTMLTextAreaElement
      >(`[data-word-id="${id}"]`);
      if (input) {
        input.focus({ preventScroll: true });
        input.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }
  const wordField = (node: MapNode, index: number) => (
    <label
      key={node.id}
      className={`map-word-field ${activeId === node.id ? "active" : ""}`}
    >
      <span>
        {node.level === 2
          ? "Слово второго уровня"
          : node.level === 3
            ? `Уровень 3 · ${index + 1}`
            : `Уровень 4 · ${index + 1}`}
      </span>
      <input
        data-word-id={node.id}
        aria-label={`Слово уровня ${node.level}, ${node.id}`}
        maxLength={80}
        value={node.word}
        disabled={saving}
        onFocus={() => setActiveId(node.id)}
        onChange={(event) => updateWord(node.id, event.target.value)}
        placeholder="Ваша ассоциация"
      />
    </label>
  );
  return (
    <div className="workbook-assessment map-workbook">
      <div className="workbook-intro">
        <div>
          <h2>От ассоциаций — к новому занятию</h2>
          <p>
            Выберите ядро, заполните слова на трёх уровнях и соедините три
            внешних слова в идею для себя.
          </p>
        </div>
        <span className="workbook-progress">
          <strong>{filled}</strong> / {map.nodes.length} слов
        </span>
      </div>
      <section className="map-core-panel" aria-labelledby="map-core-heading">
        <div>
          <span className="map-step">01 / ЯДРО</span>
          <h2 id="map-core-heading">С чего начнётся карта?</h2>
          <p>
            Возьмите занятие из дневника с максимальной энергией, вовлечённостью
            или отметкой «В потоке». Можно вписать своё.
          </p>
        </div>
        <div>
          <label htmlFor="map-core">Центральное занятие</label>
          <textarea
            id="map-core"
            rows={2}
            maxLength={1000}
            disabled={saving}
            value={map.core}
            onChange={(event) =>
              edit((previous) => ({
                ...previous,
                core: event.target.value,
                selected: [],
              }))
            }
            placeholder="Занятие, которое хочется исследовать"
          />
          {sources.length ? (
            <label className="map-source-label">
              Подставить из дневника
              <select
                disabled={saving}
                value=""
                onChange={(event) => {
                  const source = sources.find(
                    (item) => item.id === event.target.value,
                  );
                  if (source)
                    edit((previous) => ({
                      ...previous,
                      core: source.activity,
                      selected: [],
                    }));
                }}
              >
                <option value="">Выберите занятие…</option>
                {sources.map((source) => (
                  <option key={source.id} value={source.id}>
                    {source.activity} · {source.reasons.join(" / ")} ·{" "}
                    {source.date}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="map-note">
              В дневнике пока нет записей. Начните со своего занятия.
            </p>
          )}
        </div>
      </section>
      <div className="map-section-heading">
        <div>
          <span className="map-step">02 / АССОЦИАЦИИ</span>
          <h2>Дайте мысли разветвиться</h2>
        </div>
        <span>4 уровня · {roots.length} главных ветвей</span>
      </div>
      <div className="map-workspace">
        <MapCanvas
          core={map.core}
          nodes={map.nodes}
          activeId={activeId}
          selected={map.selected}
          selecting={selecting && ready}
          onSelect={nodeSelect}
        />
        <aside className="map-editor" ref={editor} aria-label="Редактор ветвей">
          <div className="map-branch-tabs" aria-label="Главные ветви">
            {roots.map((node, index) => (
              <button
                key={node.id}
                type="button"
                className={branch?.id === node.id ? "active" : ""}
                aria-label={`Редактировать ветвь ${index + 1}`}
                aria-pressed={branch?.id === node.id}
                onClick={() => setActiveId(node.id)}
              >
                {index + 1}
              </button>
            ))}
            <button
              type="button"
              disabled={saving || roots.length >= 6}
              onClick={() => addChild("root", 2)}
              aria-label="Добавить шестую ветвь"
            >
              <Plus size={16} />
            </button>
          </div>
          {branch ? (
            <>
              <h3>
                Ветвь {roots.findIndex((node) => node.id === branch.id) + 1}
              </h3>
              {wordField(branch, 0)}
              <p className="map-note">
                От этого слова придумайте 3–4 ассоциации. Каждую продолжите ещё
                3–4 словами.
              </p>
              <div className="map-branch-fields">
                {map.nodes
                  .filter((node) => node.parentId === branch.id)
                  .map((child, index) => (
                    <section key={child.id} className="map-twig">
                      {wordField(child, index)}
                      <div>
                        {map.nodes
                          .filter((leaf) => leaf.parentId === child.id)
                          .map((leaf, leafIndex) => wordField(leaf, leafIndex))}
                      </div>
                      <button
                        className="map-text-button"
                        disabled={
                          saving ||
                          map.nodes.filter((leaf) => leaf.parentId === child.id)
                            .length >= 4
                        }
                        onClick={() => addChild(child.id, 4)}
                      >
                        <Plus size={13} />
                        Четвёртое слово
                      </button>
                    </section>
                  ))}
              </div>
              <button
                className="button secondary"
                disabled={
                  saving ||
                  map.nodes.filter((node) => node.parentId === branch.id)
                    .length >= 4
                }
                onClick={() => addChild(branch!.id, 3)}
              >
                <Plus size={15} />
                Четвёртое ответвление
              </button>
            </>
          ) : (
            <div className="map-editor-start">
              <h3>Центральное занятие</h3>
              <textarea
                data-word-id="root"
                aria-label="Ядро карты"
                value={map.core}
                rows={4}
                maxLength={1000}
                disabled={saving}
                onChange={(event) =>
                  edit((previous) => ({
                    ...previous,
                    core: event.target.value,
                    selected: [],
                  }))
                }
              />
              <p>
                Нажмите на кружок карты или номер ветви. Все слова второго,
                третьего и четвёртого уровней вы придумываете сами.
              </p>
              <button
                className="button secondary"
                onClick={() => setActiveId(roots[0].id)}
              >
                Начать первую ветвь
              </button>
            </div>
          )}
        </aside>
      </div>
      <section
        className={`map-combination ${ready ? "ready" : ""}`}
        aria-labelledby="map-combination-heading"
      >
        <span className="map-step">03 / НЕОЖИДАННАЯ СВЯЗЬ</span>
        <h2 id="map-combination-heading">Три слова для новой идеи</h2>
        {!ready ? (
          <p>
            Заполните центральное занятие и все {map.nodes.length} слов карты.
            Затем можно будет выбрать три разных слова четвёртого уровня
            самостоятельно или случайно.
          </p>
        ) : (
          <>
            <p>
              Выберите внешние кружки на карте или получите случайную
              комбинацию. Правильных сочетаний здесь нет.
            </p>
            <div className="map-combination-actions">
              <button
                className="button secondary"
                disabled={saving}
                aria-pressed={selecting}
                onClick={() => setSelecting((value) => !value)}
              >
                {selecting ? <Check size={16} /> : <Plus size={16} />}Выбирать
                на карте
              </button>
              <button
                className="button secondary"
                disabled={saving}
                onClick={() => {
                  const ids = randomOuterWords(map.nodes);
                  if (ids.length < 3) {
                    setError(
                      "Для комбинации нужны хотя бы три разных слова внешнего уровня.",
                    );
                    return;
                  }
                  edit((previous) => ({ ...previous, selected: ids }));
                }}
              >
                <Shuffle size={16} />
                Случайная комбинация
              </button>
            </div>
            <details className="map-word-list">
              <summary>Выбрать из списка внешних слов</summary>
              <div>
                {map.nodes
                  .filter((node) => node.level === 4)
                  .map((node) => (
                    <button
                      key={node.id}
                      disabled={saving}
                      className={
                        map.selected.includes(node.id) ? "selected" : ""
                      }
                      aria-pressed={map.selected.includes(node.id)}
                      onClick={() => pick(node.id)}
                    >
                      {node.word}
                    </button>
                  ))}
              </div>
            </details>
          </>
        )}
        <div className="map-selected-words">
          {[0, 1, 2].map((index) => (
            <span key={index}>
              {chosenWords[index] || `Слово ${index + 1}`}
              {map.selected[index] && (
                <button
                  disabled={saving}
                  aria-label={`Убрать слово ${chosenWords[index]}`}
                  onClick={() => pick(map.selected[index])}
                >
                  <X size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
        <button
          className="button primary"
          disabled={
            !ready ||
            map.selected.length !== 3 ||
            saving ||
            map.ideas.length >= 30
          }
          onClick={() =>
            edit((previous) => ({
              ...previous,
              ideas: [
                ...previous.ideas,
                {
                  id: crypto.randomUUID(),
                  core: previous.core.trim(),
                  words: chosenWords.map((word) => word.trim()) as [
                    string,
                    string,
                    string,
                  ],
                  title: "",
                  description: "",
                },
              ],
              selected: [],
            }))
          }
        >
          <Lightbulb size={17} />
          Создать карточку идеи
        </button>
        {map.ideas.length >= 30 && (
          <p className="map-note">
            Создано 30 карточек. Дополните существующие идеи.
          </p>
        )}
      </section>
      {map.ideas.length > 0 && (
        <section className="map-ideas" aria-label="Карточки идей">
          <div className="map-section-heading">
            <div>
              <span className="map-step">04 / ИДЕИ ЗАНЯТИЙ</span>
              <h2>Что хочется попробовать?</h2>
            </div>
            <span>{map.ideas.length} / 30</span>
          </div>
          {map.ideas.map((idea, index) => (
            <article className="map-idea" key={idea.id}>
              <div className="map-idea-heading">
                <span>ИДЕЯ {index + 1}</span>
                <button
                  className="icon-button"
                  disabled={saving || analysisId === idea.id}
                  aria-label={`Удалить идею ${index + 1}`}
                  onClick={() => setDeleteIdea(idea.id)}
                >
                  <X size={17} />
                </button>
              </div>
              <p className="map-idea-core">Исходное занятие: {idea.core}</p>
              <div className="map-idea-words">
                {idea.words.map((word, index) => (
                  <span key={index}>{word}</span>
                ))}
              </div>
              <label htmlFor={`idea-title-${idea.id}`}>Название занятия</label>
              <input
                id={`idea-title-${idea.id}`}
                maxLength={160}
                disabled={saving}
                value={idea.title}
                placeholder="Как назовёте свою идею?"
                onChange={(event) =>
                  edit((previous) => ({
                    ...previous,
                    ideas: previous.ideas.map((item) =>
                      item.id === idea.id
                        ? { ...item, title: event.target.value }
                        : item,
                    ),
                  }))
                }
              />
              <label htmlFor={`idea-description-${idea.id}`}>
                Краткое описание
              </label>
              <textarea
                id={`idea-description-${idea.id}`}
                rows={4}
                maxLength={4000}
                disabled={saving}
                value={idea.description}
                placeholder="Как соединить эти три слова в занятие для себя? С чего можно начать?"
                onChange={(event) =>
                  edit((previous) => ({
                    ...previous,
                    ideas: previous.ideas.map((item) =>
                      item.id === idea.id
                        ? { ...item, description: event.target.value }
                        : item,
                    ),
                  }))
                }
              />
              <div className="map-idea-ai">
                {/* <p>
                  {aiAvailable
                    ? "DeepSeek получит только три внешних слова этой карточки."
                    : "Помощь ИИ пока не подключена. Идею можно описать самостоятельно."}
                </p> */}
                <button
                  className="button secondary"
                  disabled={!aiAvailable || saving || Boolean(analysisId)}
                  onClick={() => void analyze(idea.id)}
                >
                  {analysisId === idea.id ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <Sparkles size={16} />
                  )}{" "}
                  {analysisId === idea.id
                    ? "Придумываем идею…"
                    : "Попросить ИИ помочь"}
                </button>
              </div>
              {hints[idea.id] && (
                <aside className="compass-ai-suggestion">
                  <strong>
                    <Sparkles size={14} />
                    Вариант ИИ
                  </strong>
                  <h3>{hints[idea.id].title}</h3>
                  <p>{hints[idea.id].description}</p>
                  <button
                    className="button secondary"
                    disabled={
                      saving ||
                      idea.description.includes(hints[idea.id].description) ||
                      idea.description.length +
                        hints[idea.id].description.length +
                        2 >
                        4000
                    }
                    onClick={() =>
                      edit((previous) => ({
                        ...previous,
                        ideas: previous.ideas.map((item) =>
                          item.id === idea.id
                            ? {
                                ...item,
                                title: item.title.trim()
                                  ? item.title
                                  : hints[idea.id].title,
                                description: [
                                  item.description.trim(),
                                  hints[idea.id].description,
                                ]
                                  .filter(Boolean)
                                  .join("\n\n"),
                              }
                            : item,
                        ),
                      }))
                    }
                  >
                    <Plus size={14} />
                    Добавить к моей идее
                  </button>
                </aside>
              )}
              {deleteIdea === idea.id && (
                <div className="diary-delete-confirm">
                  <p>Удалить эту карточку идеи?</p>
                  <button
                    className="button secondary"
                    disabled={saving}
                    onClick={() => {
                      edit((previous) => ({
                        ...previous,
                        ideas: previous.ideas.filter(
                          (item) => item.id !== idea.id,
                        ),
                      }));
                      setDeleteIdea("");
                    }}
                  >
                    Удалить
                  </button>
                  <button
                    className="button secondary"
                    onClick={() => setDeleteIdea("")}
                  >
                    Отмена
                  </button>
                </div>
              )}
            </article>
          ))}
        </section>
      )}
      {error && (
        <p className="workbook-error" role="alert">
          {error}
        </p>
      )}
      <div className="map-save-bar">
        <p role="status">
          {saving
            ? "Сохраняем…"
            : savedJson === JSON.stringify(map)
              ? "Карта и идеи сохранены"
              : "Можно сохранить черновик и продолжить позже."}
        </p>
        <div>
          <button
            className="button secondary"
            disabled={saving}
            onClick={() => void save(true)}
          >
            <Download size={16} />
            Экспорт в PDF
          </button>
          <button
            className="button primary"
            disabled={saving || savedJson === JSON.stringify(map)}
            onClick={() => void save()}
          >
            {saving ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Save size={16} />
            )}
            Сохранить карту и идеи
          </button>
        </div>
      </div>
    </div>
  );
}
