import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { buildPublicState } from "../supabase/functions/platform-admin/public-snapshot.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const editorPath = path.join(here, "..", "editor.html");
const html = fs.readFileSync(editorPath, "utf8").replace(/\r\n/g, "\n");
const start = html.indexOf("<script>\n'use strict';");
const end = html.indexOf("</script>", start);
assert.ok(start >= 0 && end > start, "editor inline script was not found");

function element() {
  const classes = new Set();
  const el = {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      toggle: (name, force) => force === undefined
        ? (classes.has(name) ? (classes.delete(name), false) : (classes.add(name), true))
        : (force ? classes.add(name) : classes.delete(name), !!force),
      contains: (name) => classes.has(name),
    },
    style: { setProperty() {} }, dataset: {}, value: "", checked: false,
    disabled: false, innerHTML: "", textContent: "", childNodes: [], options: [],
    addEventListener() {}, removeEventListener() {}, setAttribute() {}, removeAttribute() {},
    appendChild() {}, focus() {}, contains() { return false; }, matches() { return false; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; },
  };
  return el;
}

const elements = new Map();
const document = {
  body: element(),
  getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
  querySelector() { return null; }, querySelectorAll() { return []; },
  createElement() { return element(); }, addEventListener() {}, contains() { return true; },
};
const context = {
  document,
  location: { search: "", hash: "", href: "http://localhost/editor.html", origin: "http://localhost", pathname: "/editor.html", replace() {} },
  history: { replaceState() {} }, navigator: { clipboard: { writeText: async () => {} } },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  MutationObserver: class { observe() {} disconnect() {} },
  URL, URLSearchParams, Blob, TextEncoder, TextDecoder, crypto,
  alert() {}, confirm() { return true; }, prompt() { return null; },
  setTimeout() { return 1; }, clearTimeout() {}, setInterval() { return 1; }, clearInterval() {},
  addEventListener() {}, innerWidth: 1200, console,
};
context.window = context;
context.globalThis = context;
context.IVIDEON_SEABATTLE_CONFIG = {};

const hooks = [
  "safeIconId", "icon", "normalizeGame", "canonicalLegacy", "canonicalV2", "canonical",
  "sealGameState",
  "scenarioIsPaused", "scenarioMetricsFor", "scenarioOpeningState", "scenarioIsCompleted",
  "classifySectorForOpening", "applyImmediateGrant", "weeklyResult", "rankWeeklyResults", "effectiveGateValue", "businessDaysInPeriod",
];
const script = html.slice(start + "<script>\n".length, end)
  + `\nglobalThis.__treasureHooks={${hooks.join(",")}};`;
vm.runInNewContext(script, context, { filename: editorPath });
const h = context.__treasureHooks;
const clone = (value) => structuredClone(value);

// Stored icon values must never become SVG/HTML attributes.
assert.equal(h.safeIconId('i-find" onerror="alert(1)'), "i-find");
assert.doesNotMatch(h.icon('x"><script>alert(1)</script>'), /script|onerror/i);
assert.match(h.icon('x"><script>alert(1)</script>'), /href="#i-find"/);

// Reading a sealed v1 map must preserve the exact historic commitment.
for (const perkLabel of ["Повторный выстрел", ""]) {
  const legacy = {
    size: 8, salt: "legacy-salt", sealed: true, hashVersion: null,
    cells: { "1,1": { type: "perk", perkLabel } }, ships: [], shots: [], managers: [],
    scenarios: [], bonusGrants: [], findLog: [], metrics: [],
  };
  const before = h.canonicalLegacy(legacy);
  h.normalizeGame(legacy);
  assert.equal(h.canonical(legacy), before);
  assert.equal(legacy.cells["1,1"].perkLabel, perkLabel);
}

// v2 covers find configuration and prizes, but intentionally ignores progress.
const v2 = h.normalizeGame({
  size: 8, salt: "v2-salt", sealed: true, hashVersion: 2,
  cells: { "2,2": { type: "ship", shipId: "s1", find: {
    findId: "f1", findName: "Компас", findDesc: "Подсказка", findIcon: "i-compass",
    template: "compass", effectType: "adjacent_hint", effectConfig: { uses: 1 },
    prize: "", enabled: true, expiresAt: null, immediate: true,
    foundAt: null, foundBy: null, consumedAt: null,
  } } },
  ships: [{ id: "s1", size: 1, name: "Клад", prize: "Приз", cells: ["2,2"] }],
  shots: [], managers: [], scenarios: [], bonusGrants: [], findLog: [], metrics: [],
});
const committed = h.canonicalV2(v2);
const progressOnly = clone(v2); progressOnly.cells["2,2"].find.consumedAt = 123;
assert.equal(h.canonicalV2(progressOnly), committed);
const changedEffect = clone(v2); changedEffect.cells["2,2"].find.effectType = "row_hint";
assert.notEqual(h.canonicalV2(changedEffect), committed);
const changedPrize = clone(v2); changedPrize.ships[0].prize = "Другой приз";
assert.notEqual(h.canonicalV2(changedPrize), committed);
assert.throws(() => h.canonical({ hashVersion: 99 }), /Неподдерживаемая версия/);

// Sealing normalizes hash-covered legacy defaults before committing v2.
const dirtySeal = {
  size: 8, sealed: false, salt: null, hash: null, hashVersion: null,
  cells: { "0,0": { type: "perk", perkLabel: "Плюшка" } },
  ships: [{ id: "legacy", size: 1, name: "Катер", prize: "Книга от Али", cells: ["1,1"] }],
  shots: [], managers: ["Али"], scenarios: [], bonusGrants: [], findLog: [], metrics: [],
};
h.sealGameState(dirtySeal, "fixed-salt");
const sealedHash = dirtySeal.hash;
const reloadedSeal = clone(dirtySeal);
h.normalizeGame(reloadedSeal);
assert.equal(h.canonicalV2(reloadedSeal), h.canonicalV2(dirtySeal));
assert.equal(context.sha256(h.canonicalV2(reloadedSeal)), sealedHash);
assert.match(html, /sealGameState\(g\);[\s\S]*?save\('Карта запечатана'\);[\s\S]*?renderMapTab\(\);/);
assert.match(html, /nameInput\.onchange=\(\)=>\{if\(g\.sealed\|\|!canEditCurrent\(\)\)return;/);
assert.match(html, /function editFindModal\(entry\)\{[\s\S]*?if\(g\.sealed\|\|!canEditCurrent\(\)\)return;/);

// A normal hit over a find does not backfill consumption; an actual find does.
const overlay = clone(v2);
overlay.cells["2,2"].find.consumedAt = null;
overlay.shots = [{ r: 2, c: 2, result: "hit", ts: 100, manager: "Али" }];
h.normalizeGame(overlay);
assert.equal(overlay.cells["2,2"].find.consumedAt, null);
overlay.shots[0].findLabel = "Компас";
h.normalizeGame(overlay);
assert.equal(overlay.cells["2,2"].find.consumedAt, 100);

// Pause is inclusive and independent of UTC conversion at midnight.
assert.equal(h.scenarioIsPaused({ pausedUntil: "2026-08-10" }, "2026-08-10"), true);
assert.equal(h.scenarioIsPaused({ pausedUntil: "2026-08-10" }, "2026-08-11"), false);

// Manual events inherit configured global thresholds.
const metricGame = { metrics: [{ id: "calls", label: "Звонки", unit: "шт.", enabled: true, required: true, thresholdEnabled: true, threshold: 100 }] };
const manualMetric = h.scenarioMetricsFor(metricGame, null)[0];
assert.equal(manualMetric.role, "threshold");
assert.equal(manualMetric.value, 100);

// Weekly admission scales with worked days; ranking is revenue, then call-target attainment.
const weekly = h.rankWeeklyResults([
  { name: "Пять дней", workedDays: 5, calls: 250, revenue: 500000 },
  { name: "Четыре дня", workedDays: 4, calls: 210, revenue: 700000 },
  { name: "Не допущен", workedDays: 5, calls: 249, revenue: 900000 },
  { name: "Тай-брейк", workedDays: 4, calls: 220, revenue: 700000 },
]);
assert.equal(weekly[0].name, "Тай-брейк");
assert.equal(weekly[1].name, "Четыре дня");
assert.equal(weekly.at(-1).eligible, false);
assert.equal(h.weeklyResult({workedDays:0,calls:100,revenue:1}).eligible, false);
const callsGate = { metric: { id: "calls" }, value: 100 };
assert.equal(h.effectiveGateValue(callsGate, { workedDays: 1, calls: 50 }), 50);
assert.equal(h.effectiveGateValue(callsGate, { workedDays: 2, calls: 100 }), 100);
assert.equal(h.businessDaysInPeriod("2026-08-19", "2026-08-20"), 2);
assert.equal(h.businessDaysInPeriod("2026-08-17", "2026-08-21"), 5);
assert.equal(h.businessDaysInPeriod("2026-08-22", "2026-08-23"), 0);

// Bonus openings do not consume the ordinary quota; one-time completion is derived.
const scenario = { id: "once", oneTime: true, defaultOpenings: 2 };
const quotaGame = { shots: [
  { scenarioId: "once", openingSource: "scenario", eventDate: "2026-08-10", periodStart: "2026-08-01", periodEnd: "2026-08-09" },
  { scenarioId: "once", openingSource: "bonus", eventDate: "2026-08-10", periodStart: "2026-08-01", periodEnd: "2026-08-09" },
] };
const quota = h.scenarioOpeningState(quotaGame, scenario, "2026-08-10", "2026-08-01", "2026-08-09");
assert.equal(quota.used, 1);
assert.equal(quota.total, 2);
assert.equal(quota.remaining, 1);
assert.equal(h.scenarioIsCompleted(quotaGame, scenario), false);
quotaGame.shots.push({ scenarioId: "once", openingSource: "scenario", eventDate: "2026-08-10" });
assert.equal(h.scenarioIsCompleted(quotaGame, scenario), true);
quotaGame.shots.pop(); // same transition as Undo
assert.equal(h.scenarioIsCompleted(quotaGame, scenario), false);

// Disabled/expired structured finds behave as empty sectors, including overlays.
const disabledFind = { findName: "Ключ", enabled: false, consumedAt: null, expiresAt: null };
const findGame = { cells: { "0,0": { type: "perk", perkLabel: "Ключ", find: disabledFind } } };
assert.equal(h.classifySectorForOpening(findGame, 0, 0, "2026-08-10").result, "miss");
findGame.cells["0,0"].find.enabled = true;
findGame.cells["0,0"].find.expiresAt = "2026-08-09";
assert.equal(h.classifySectorForOpening(findGame, 0, 0, "2026-08-10").result, "miss");
findGame.cells["0,0"] = { type: "ship", shipId: "s1", find: disabledFind };
assert.equal(h.classifySectorForOpening(findGame, 0, 0, "2026-08-10").result, "hit");
assert.equal(h.classifySectorForOpening(findGame, 0, 0, "2026-08-10").find, null);

// Immediate effects consume only effects that can resolve at the found coordinate.
const immediateGame = { size: 8, cells: {}, findLog: [] };
const instant = { participant: "Али", findName: "Ключ", effectType: "instant_prize", prize: "Кофе", description: "", immediate: true, remainingUses: 2 };
assert.match(h.applyImmediateGrant(immediateGame, instant, 0, 0), /Кофе/);
assert.equal(instant.remainingUses, 1);
const inspect = { participant: "Али", findName: "Фонарь", effectType: "inspect_without_open", prize: "", description: "", immediate: true, remainingUses: 1 };
assert.equal(h.applyImmediateGrant(immediateGame, inspect, 0, 0), null);
assert.equal(inspect.remainingUses, 1);
const extra = { participant: "Али", findName: "Лопата", effectType: "extra_opening", prize: "", description: "", immediate: true, remainingUses: 1 };
assert.equal(h.applyImmediateGrant(immediateGame, extra, 0, 0), null);
assert.equal(extra.remainingUses, 1);
const manual = { participant: "Али", findName: "Свой эффект", effectType: "manual_effect", prize: "", description: "Решает администратор", immediate: true, remainingUses: 1 };
assert.equal(h.applyImmediateGrant(immediateGame, manual, 0, 0), null);
assert.equal(manual.remainingUses, 1);

// The public projection must downgrade a disabled structured perk to a miss.
const publicState = buildPublicState({
  size: 8, managers: ["Али"], metrics: [], ships: [],
  cells: { "0,0": { type: "perk", perkLabel: "Секрет", find: { findName: "Секрет", enabled: false, consumedAt: 1 } } },
  shots: [{ r: 0, c: 0, manager: "Али", result: "perk", perkLabel: "Секрет", ts: 1,
    weeklyResults: [{ name: "Али", workedDays: 4, personalTarget: 200, calls: 210, revenue: 700000, attainment: 105, eligible: true, privateNote: "hidden" }] }],
});
assert.equal(publicState.shots[0].result, "miss");
assert.equal(publicState.shots[0].perkLabel, null);
assert.equal(publicState.shots[0].findLabel, null);
assert.deepEqual(Object.keys(publicState.shots[0].weeklyResults[0]).sort(), ["attainment", "calls", "eligible", "name", "personalTarget", "revenue", "workedDays"]);
assert.equal(publicState.shots[0].weeklyResults[0].personalTarget, 200);
assert.equal("cells" in publicState, false);

console.log("treasure regression checks passed");
