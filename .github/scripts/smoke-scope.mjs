#!/usr/bin/env node
/**
 * Какие сценарии smoke запускать (быстрая проверка, ступень 1: решение владельца 18 октября 2026, ответ 3; docs/process-speedup-2026-10-18.md, раздел 2).
 *
 *   SCOPE=full                  — все группы (.github/smoke-groups.json), как раньше;
 *   SCOPE="almanac merge"       — только эти сценарии или группы (имена сценариев — SCENARIOS в qa/smoke.mjs, группы — поле key);
 *   SCOPE=auto                  — по изменениям BASE..HEAD: если изменён только qa/smoke.mjs, запускаются сценарии, которые доходят (по вызовам функций)
 *                                 до изменённых строк; любое другое изменение или неясность (строка вне функции, файл игры) — полный набор.
 * BASE — коммит, с которым сравнивать (пусто — общий предок с origin/main), HEAD — проверяемый коммит.
 * Пишет в $GITHUB_OUTPUT: matrix (JSON для strategy.matrix), any (true/false); причину выбора — в журнал и $GITHUB_STEP_SUMMARY.
 * Локально: SCOPE=auto BASE=<хеш> node .github/scripts/smoke-scope.mjs — печатает выбор.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const SMOKE = 'qa/smoke.mjs';
const groups = JSON.parse(fs.readFileSync('.github/smoke-groups.json', 'utf8'));
const allScenarios = [...new Set(groups.flatMap((g) => g.scenarios.split(/\s+/).filter(Boolean)))];
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** Изменения, которые на проверки не влияют (как paths-ignore в checks.yml). */
const IGNORED = [/^docs\//, /\.md$/, /^\.github\/workflows\/(preview|pages)\.yml$/, /^\.github\/scripts\/publish-pages\.sh$/];

function decide() {
  const scope = String(process.env.SCOPE ?? 'full').trim() || 'full';
  if (scope === 'full') return { set: allScenarios, reason: 'полный набор (scope full)' };
  if (scope !== 'auto') {
    const items = scope.split(/[\s,]+/).filter(Boolean);
    const set = new Set();
    for (const item of items) {
      const group = groups.find((g) => g.key === item);
      if (group) group.scenarios.split(/\s+/).forEach((x) => set.add(x));
      else if (allScenarios.includes(item)) set.add(item);
      else return { set: allScenarios, reason: `неизвестное имя «${item}» — полный набор` };
    }
    return { set: [...set], reason: `заданный список: ${items.join(', ')}` };
  }
  const head = process.env.HEAD || 'HEAD';
  let base = process.env.BASE;
  try {
    if (!base) base = git('merge-base', 'origin/main', head).trim();
  } catch {
    return { set: allScenarios, reason: 'нет общего предка с origin/main — полный набор' };
  }
  let files;
  try {
    files = git('diff', '--name-only', base, head).split('\n').filter(Boolean).filter((f) => !IGNORED.some((re) => re.test(f)));
  } catch (e) {
    return { set: allScenarios, reason: `не удалось сравнить ${base}..${head} — полный набор` };
  }
  if (files.length === 0) return { set: [], reason: `изменены только документы (${base.slice(0, 7)}..${head.slice(0, 7)}) — проверять нечего` };
  if (files.some((f) => f !== SMOKE)) return { set: allScenarios, reason: `изменены файлы игры или проверок кроме ${SMOKE}: ${files.slice(0, 6).join(', ')}${files.length > 6 ? ', …' : ''} — полный набор` };
  const changed = changedLines(git('diff', '-U0', base, head, '--', SMOKE));
  const src = git('show', `${head}:${SMOKE}`).split('\n');
  const picked = scenariosForLines(src, changed);
  if (picked.full) return { set: allScenarios, reason: `${picked.full} — полный набор` };
  return { set: picked.set, reason: `изменён только ${SMOKE} (${changed.length} строк): функции ${picked.functions.join(', ') || '—'}` };
}

/** Номера строк нового файла, затронутые diff (удалённые строки — по месту, где они были). */
function changedLines(diff) {
  const out = [];
  for (const m of diff.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = Number(m[1]);
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count === 0) out.push(Math.max(1, start));
    for (let i = 0; i < count; i++) out.push(start + i);
  }
  return out;
}

/**
 * Делит файл на верхнеуровневые блоки (функция или объявление с колонки 0; комментарий над ним — часть блока), строит граф «какой блок упоминает какой»
 * и находит сценарии, чьи корневые функции (вызовы в строках `if (wants('имя'))`) доходят до блоков с изменёнными строками.
 */
function scenariosForLines(lines, changed) {
  const blocks = [];
  let pendingStart = null;
  const DECL = /^(?:export\s+)?(?:async\s+function\*?|function\*?)\s+([A-Za-z_$][\w$]*)|^(?:export\s+)?(?:const|let|var|class)\s+([A-Za-z_$][\w$]*)/;
  lines.forEach((line, i) => {
    if (/^\/\*\*|^\/\//.test(line) && pendingStart === null) pendingStart = i;
    const m = DECL.exec(line);
    if (m) {
      blocks.push({ name: m[1] ?? m[2], start: pendingStart ?? i, decl: i });
      pendingStart = null;
    } else if (line.length > 0 && !/^[\s/*]/.test(line) && !/^[)}\]]/.test(line)) {
      pendingStart = null;
    }
  });
  blocks.forEach((b, k) => (b.end = k + 1 < blocks.length ? blocks[k + 1].start - 1 : lines.length - 1));
  // область вызова сценариев: от `const needQa` до конца — каждая строка с wants('…') — корень своего сценария
  const dispatchStart = lines.findIndex((l) => l.startsWith('const needQa'));
  if (dispatchStart < 0) return { full: 'не найдено место вызова сценариев (const needQa)' };
  const names = new Set(blocks.map((b) => b.name));
  const body = (b) => lines.slice(b.decl, b.end + 1).join('\n');
  const refs = new Map(blocks.map((b) => [b.name, new Set([...body(b).matchAll(/[A-Za-z_$][\w$]*/g)].map((x) => x[0]).filter((x) => names.has(x) && x !== b.name))]));
  const rootsOf = new Map(); // сценарий → функции
  for (let i = dispatchStart; i < lines.length; i++) {
    const line = lines[i];
    const called = [...line.matchAll(/\b(run[A-Z]\w*)\(/g)].map((x) => x[1]);
    if (!called.length) continue;
    let scen = [...line.matchAll(/wants\('([\w-]+)'\)/g)].map((x) => x[1]);
    if (!scen.length && /wants\(key\)/.test(line)) {
      // цикл по сценариям-экранам: имена — в строке заголовка цикла выше
      const header = lines.slice(Math.max(0, i - 2), i).join(' ');
      scen = [...header.matchAll(/'([\w-]+)'/g)].map((x) => x[1]).filter((x) => allScenarios.includes(x));
    }
    for (const s of scen) rootsOf.set(s, [...(rootsOf.get(s) ?? []), ...called]);
  }
  const reach = (root) => {
    const seen = new Set();
    const stack = [root];
    while (stack.length) {
      const n = stack.pop();
      if (seen.has(n)) continue;
      seen.add(n);
      for (const r of refs.get(n) ?? []) stack.push(r);
    }
    return seen;
  };
  const reachOf = new Map([...rootsOf].map(([s, roots]) => [s, new Set(roots.flatMap((r) => [...reach(r)]))]));
  const set = new Set();
  const functions = new Set();
  for (const ln of changed) {
    const i = ln - 1;
    if (i >= dispatchStart) {
      const scen = [...(lines[i] ?? '').matchAll(/wants\('([\w-]+)'\)/g)].map((x) => x[1]);
      if (!scen.length) return { full: `изменена строка ${ln} в месте вызова сценариев без wants('…')` };
      scen.forEach((s) => set.add(s));
      continue;
    }
    const block = blocks.find((b) => i >= b.start && i <= b.end);
    if (!block) return { full: `строка ${ln} вне функций и объявлений` };
    // объявление не функции (константа, таблица): его читают по имени функции сценариев; если имя встречается в месте вызова сценариев — оно влияет на всё
    const isFunction = /function/.test(lines[block.decl]) || /=\s*(?:async\s*)?\(?[\w$,\s{}]*\)?\s*=>/.test(lines[block.decl]);
    if (!isFunction && new RegExp(`\\b${block.name.replace(/\$/g, '\\$')}\\b`).test(lines.slice(dispatchStart).join('\n'))) return { full: `изменено объявление «${block.name}» (строка ${ln}), его читает место вызова сценариев` };
    functions.add(block.name);
    const users = [...reachOf].filter(([, r]) => r.has(block.name)).map(([s]) => s);
    if (!users.length) continue; // функция не вызывается ни одним сценарием
    users.forEach((s) => set.add(s));
  }
  return { set: allScenarios.filter((s) => set.has(s)), functions: [...functions] };
}

const { set, reason } = decide();
const chosen = new Set(set);
const include = groups
  .map((g) => ({ ...g, scenarios: g.scenarios.split(/\s+/).filter((s) => chosen.has(s)).join(' ') }))
  .filter((g) => g.scenarios.length > 0);
const line = `Сценарии: ${set.length} из ${allScenarios.length} (${reason})${set.length && set.length < allScenarios.length ? ` — ${set.join(', ')}` : ''}`;
console.log(line);
if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify({ include })}\nany=${include.length > 0}\n`);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### План проверок\n\n${line}\n\n`);
