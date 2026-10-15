/**
 * Сторож мест на сервере. На аккаунте 20 мест для задач GitHub Actions на все запуски сразу, а набор проверок `smoke` (checks.yml) занимает 10 задач;
 * чтобы для него всегда оставалось не меньше 6 свободных мест, длинные серии (лестница ladder.yml, замер баланса balance.yml) вместе занимают не больше 14:
 *  1) в одной серии одновременно идёт не больше 7 задач (strategy.max-parallel; у лестницы значение зажато скриптом ladder-plan.mjs до 7);
 *  2) этот скрипт считает задачи, которые сейчас выполняют другие запуски ladder.yml и balance.yml (статус in_progress), прибавляет задачи, которые займёт этот запуск
 *     (число дорожек или задач замера, но не больше 7), и если сумма больше 14, завершает задачу «Список …» ошибкой — серия не стартует.
 * Ограничения: считаются только эти два workflow (perf.yml и pages.yml занимают по одной задаче); два запуска, начатые в одну секунду, могут не увидеть друг друга.
 * Переменные окружения: GH_TOKEN (права actions: read), GITHUB_REPOSITORY, GITHUB_RUN_ID; сколько задач займёт этот запуск — PLANNED (замер баланса) или LANES_JSON и MAX_PARALLEL (лестница); SLOT_LIMIT (по умолчанию 14).
 */
const token = process.env.GH_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
const self = String(process.env.GITHUB_RUN_ID ?? '');
const limit = Number(process.env.SLOT_LIMIT || 14);
const lanesCount = process.env.LANES_JSON ? JSON.parse(process.env.LANES_JSON).length : Number.NaN;
const maxParallel = Number(process.env.MAX_PARALLEL || 7);
const plannedRaw = process.env.PLANNED ? Number(process.env.PLANNED) : Number.isFinite(lanesCount) ? Math.min(lanesCount, maxParallel) : 7;
const planned = Math.max(1, Math.min(7, plannedRaw));
if (!token || !repo) {
  console.log('Сторож мест пропущен: нет GH_TOKEN или GITHUB_REPOSITORY (локальный запуск).');
  process.exit(0);
}
const api = async (url) => {
  const response = await fetch(`https://api.github.com${url}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!response.ok) {
    console.error(`❌ Сторож мест: запрос ${url} не удался: ${response.status}`);
    process.exit(1);
  }
  return response.json();
};
const active = new Map(); // id запуска → название
for (const file of ['ladder.yml', 'balance.yml']) {
  for (const status of ['in_progress', 'queued']) {
    const data = await api(`/repos/${repo}/actions/workflows/${file}/runs?status=${status}&per_page=100`);
    for (const run of data.workflow_runs ?? []) if (String(run.id) !== self) active.set(run.id, `${file} #${run.id}`);
  }
}
let busy = 0;
const parts = [];
for (const [id, title] of active) {
  const data = await api(`/repos/${repo}/actions/runs/${id}/jobs?filter=latest&per_page=100`);
  const running = Math.min(7, (data.jobs ?? []).filter((job) => job.status === 'in_progress').length);
  busy += running;
  parts.push(`${title}: ${running}`);
}
console.log(`Занято задачами других серий: ${busy}${parts.length ? ` (${parts.join('; ')})` : ''}; этот запуск займёт до ${planned}; предел ${limit} мест из 20 (для smoke остаётся не меньше ${20 - limit})`);
if (busy + planned > limit) {
  console.error(`❌ ${busy} + ${planned} > ${limit}: запуск отклонён, чтобы для smoke оставалось не меньше ${20 - limit} свободных мест из 20. Дождитесь, пока освободятся места.`);
  process.exit(1);
}
