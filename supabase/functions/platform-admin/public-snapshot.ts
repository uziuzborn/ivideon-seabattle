/**
 * Карта сокровищ · безопасная проекция публичного снимка игры.
 *
 * НАЗНАЧЕНИЕ
 * Функция превращает приватное состояние игры (games.state) в public_state,
 * который читает анонимный посетитель публичного табло.
 *
 * Она добавляет к снимку безопасную информацию о НАЙДЕННОЙ неожиданной находке,
 * чтобы результат «фрагмент сокровища + находка» отображался на публичном табло
 * полностью, а не только как результат сокровища.
 *
 * ЧТО НИКОГДА НЕ ПОПАДАЕТ В СНИМОК
 *   - cells (полная карта размещения);
 *   - координаты и существование ещё не найденных находок;
 *   - effectConfig, remainingUses и прочая механика эффектов;
 *   - bonusGrants, findLog, scenarios, metrics-роли;
 *   - salt, ownerEmail, _meta, любые токены;
 *   - cells конкретного сокровища и награда незавершённого сокровища.
 *
 * СОВМЕСТИМОСТЬ
 * Все прежние поля снимка сохранены с прежними именами и семантикой,
 * поэтому старый клиент продолжает работать. Новые поля (findLabel, findDesc,
 * findIcon, findEffectPublic, findPrize, shipSize, scenarioName, periodStart,
 * periodEnd) — строго дополнительные; клиент, который их не знает, их игнорирует.
 *
 * Функция чистая, без внешних зависимостей и без обращения к БД.
 */

type Json = Record<string, any>;

/** Человекочитаемое описание эффекта. Внутренние коды наружу не отдаём. */
const PUBLIC_EFFECT_LABEL: Record<string, string> = {
  none: "",
  extra_opening: "Дополнительное открытие сектора",
  instant_prize: "Мгновенная награда",
  adjacent_hint: "Подсказка о соседних секторах",
  row_hint: "Подсказка по строке",
  column_hint: "Подсказка по столбцу",
  inspect_without_open: "Проверка сектора без открытия",
  manual_effect: "Награда от администратора",
};

/** Разрешённые идентификаторы иконок (защита от инъекции произвольной строки). */
const ALLOWED_ICONS = new Set([
  "i-find", "i-compass", "i-shovel", "i-key", "i-coin",
  "i-mapfrag", "i-lantern", "i-cache", "i-scroll", "i-chest", "i-gem", "i-map",
]);

const str = (v: unknown, max = 300): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t.slice(0, max) : null;
};
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Находка раскрывается только тогда, когда она действительно найдена:
 * сектор открыт (в snapshot попадают только открытые секторы) и у находки
 * проставлен consumedAt/foundAt. Скрытые находки не раскрываются никогда.
 */
export function buildPublicFind(cell: Json | undefined, shot: Json): Json | null {
  const find = cell && typeof cell === "object"
    ? (cell.find && typeof cell.find === "object" ? cell.find : null)
    : null;

  // Старый формат: клетка типа perk без вложенного объекта find.
  if (!find) {
    if (shot?.result === "perk") {
      const legacy = str(shot.perkLabel) ?? str(cell?.perkLabel);
      if (!legacy) return null;
      return { findLabel: legacy, findDesc: null, findIcon: "i-find", findEffectPublic: null, findPrize: null };
    }
    return null;
  }

  const wasFound = !!(find.consumedAt || find.foundAt) || shot?.result === "perk";
  if (!wasFound) return null;
  if (find.enabled === false) return null;

  const icon = typeof find.findIcon === "string" && ALLOWED_ICONS.has(find.findIcon)
    ? find.findIcon
    : "i-find";
  const effectPublic = PUBLIC_EFFECT_LABEL[String(find.effectType ?? "")] ?? null;

  return {
    findLabel: str(find.findName) ?? "Неожиданная находка",
    findDesc: str(find.findDesc, 400),
    findIcon: icon,
    findEffectPublic: effectPublic || null,
    // Награда за находку — уже раскрытая ценность, её показывать можно.
    findPrize: str(find.prize, 200),
  };
}

export function buildPublicState(rawState: unknown): Json {
  const state: Json = (rawState && typeof rawState === "object") ? rawState as Json : {};
  const size = Math.min(Math.max(Number(state.size) || 8, 4), 16);
  const shots: Json[] = Array.isArray(state.shots) ? state.shots : [];
  const ships: Json[] = Array.isArray(state.ships) ? state.ships : [];
  const cells: Json = (state.cells && typeof state.cells === "object") ? state.cells : {};
  const managers: string[] = Array.isArray(state.managers)
    ? state.managers.filter((m) => typeof m === "string").slice(0, 500)
    : [];

  const openedKeys = new Set(shots.map((s) => `${s?.r},${s?.c}`));
  const shipById = new Map<unknown, Json>(ships.map((s) => [s?.id, s]));
  const isShipFound = (sh: Json | undefined): boolean =>
    !!sh && Array.isArray(sh.cells) && sh.cells.length > 0 &&
    sh.cells.every((k: string) => openedKeys.has(k));

  // Показатели — только включённые, без внутренних заметок.
  const metrics = (Array.isArray(state.metrics) ? state.metrics : [])
    .filter((m: Json) => m && m.enabled !== false)
    .map((m: Json) => ({
      id: String(m.id ?? ""),
      label: str(m.label, 120) ?? "Показатель",
      unit: str(m.unit, 40) ?? "",
      enabled: true,
      required: m.required !== false,
      thresholdEnabled: !!m.thresholdEnabled,
      threshold: num(m.threshold) ?? 0,
    }))
    .filter((m) => m.id);
  const metricIds = new Set(metrics.map((m) => m.id));

  const publicShots = shots.map((s) => {
    const key = `${s?.r},${s?.c}`;
    const cell = cells[key] && typeof cells[key] === "object" ? cells[key] : null;
    const hasStructuredFind = !!(cell?.find && typeof cell.find === "object");
    const sh = s?.result === "hit" ? shipById.get(s?.shipId) : undefined;
    const complete = isShipFound(sh);
    const find = buildPublicFind(cell ?? undefined, s);
    const publicResult = s?.result === "hit"
      ? "hit"
      : s?.result === "perk" && (!hasStructuredFind || !!find)
        ? "perk"
        : "miss";

    const metricValues: Json = {};
    const src = (s?.metricValues && typeof s.metricValues === "object") ? s.metricValues : {};
    for (const id of Object.keys(src)) {
      if (metricIds.has(id)) metricValues[id] = num(src[id]);
    }
    const weeklyResults = (Array.isArray(s?.weeklyResults) ? s.weeklyResults : []).map((r: Json) => ({
      name: str(r?.name, 200), workedDays: num(r?.workedDays), personalTarget: num(r?.personalTarget),
      calls: num(r?.calls), revenue: num(r?.revenue), attainment: num(r?.attainment), eligible: !!r?.eligible,
    })).filter((r: Json) => r.name).slice(0, 500);

    return {
      // --- прежние поля снимка (без изменений) ---
      r: num(s?.r), c: num(s?.c),
      week: num(s?.week),
      manager: str(s?.manager, 200),
      result: publicResult,
      finalBlow: !!s?.sunk,
      inSunkShip: s?.result === "hit" && complete,
      shipName: sh ? (str(sh.name, 160) ?? null) : null,
      prize: complete && sh ? str(sh.prize, 200) : null,
      // Для структурированной находки fallback на старый perkLabel запрещён:
      // выключенная/просроченная находка не должна снова стать публичной.
      perkLabel: publicResult === "perk" ? (find?.findLabel ?? str(s?.perkLabel, 200)) : null,
      calls: num(s?.calls),
      revenue: num(s?.revenue),
      passedGate: typeof s?.passedGate === "boolean" ? s.passedGate : null,
      ts: num(s?.ts),
      metricValues,
      // --- дополнительные безопасные поля ---
      shipSize: sh ? num(sh.size) : null,
      scenarioName: str(s?.scenarioName, 160),
      periodStart: str(s?.periodStart, 20),
      periodEnd: str(s?.periodEnd, 20),
      weeklyResults,
      // найденная неожиданная находка (в т.ч. поверх фрагмента сокровища)
      findLabel: find?.findLabel ?? null,
      findDesc: find?.findDesc ?? null,
      findIcon: find?.findIcon ?? null,
      findEffectPublic: find?.findEffectPublic ?? null,
      findPrize: find?.findPrize ?? null,
    };
  });

  const secretsRevealed = !!state.secretsRevealed;

  // Коллекция сокровищ: без координат. Награда — только у полностью найденного
  // сокровища (или после явного раскрытия администратором на финале).
  const publicShips = ships.slice()
    .sort((a, b) => (Number(a?.size) || 0) - (Number(b?.size) || 0))
    .map((sh) => {
      const hits = Array.isArray(sh?.cells)
        ? sh.cells.filter((k: string) => openedKeys.has(k)).length : 0;
      const found = isShipFound(sh);
      let by = "";
      if (found) {
        const last = shots.filter((s) => s?.shipId === sh?.id && s?.result === "hit").pop();
        by = str(last?.manager, 200) ?? "";
      }
      return {
        name: str(sh?.name, 160) ?? "Сокровище",
        size: num(sh?.size) ?? 1,
        hits,
        sunk: found,
        by,
        prize: (found || secretsRevealed) ? str(sh?.prize, 200) : null,
      };
    });

  return {
    schemaVersion: num(state.schemaVersion) ?? 4,
    name: str(state.name, 200) ?? "Карта сокровищ",
    banner: str(state.banner, 400) ?? "",
    size,
    week: num(state.week) ?? 1,
    sealed: !!state.sealed,
    secretsRevealed,
    hash: str(state.hash, 128),
    finalPrizeSunk: secretsRevealed ? str(state.finalPrizeSunk, 200) : null,
    finalPrizeShots: secretsRevealed ? str(state.finalPrizeShots, 200) : null,
    threshold: num(state.threshold) ?? 0,
    managers,
    metrics,
    ships: publicShips,
    shots: publicShots,
  };
}
