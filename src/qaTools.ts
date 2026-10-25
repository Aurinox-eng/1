/**
 * Код режима проверки, вынесенный из GameScene: снимок состояния для ботов и проверок (`qaSnapshot`), журнал событий (`qaLog`) и стресс-сценарии замера скорости (`?qa&stress`).
 * GameScene вызывает эти функции только под условиями `QA_MODE` / `STRESS` / внутри `exposeDebug`: в игровой сборке эти условия всегда ложны, и сборщик убирает функции из `dist`
 * (методы класса он бы оставил). Функции читают внутренности сцены, которые в TypeScript `private`, поэтому сцена здесь — `any`: правка имени поля в GameScene ломает снимок, и проверки `smoke`
 * это сразу покажут.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import Phaser from 'phaser';
import { CONFIG } from './config';
import { QA_EVENTS_MAX, QA_MODE, STRESS_FIZZ, STRESS_HIGH, type DebugSnapshot, type QaEvent } from './debug';
import { refundBonus } from './meta';
import { BLOCKED_TILES, EDGES, LEVEL, MAP_ID, PATH_TILES, WORLD, cellKey } from './level';
import { Bacterium, type BacteriumKind } from './objects/Bacterium';
import { Tower, type TowerId } from './objects/Tower';
import { pointAt, tileCenter } from './pathing';
import { currentLevel } from './progress';
import { sfx } from './sound';
import { MAX_TOWER_LEVEL, towerPrice } from './towerStats';
import { VIEW } from './ui/Panel';

type GameSceneInternals = any;

const { width: W, height: H } = CONFIG.screen;
/** Самое сильное отдаление камеры (то же число, что `ZOOM_MIN` в GameScene). */
const ZOOM_MIN = Math.min(VIEW.w / WORLD.w, VIEW.h / WORLD.h);
const KINDS = Object.keys(CONFIG.types) as BacteriumKind[];

/** Стресс-сценарий (`?qa&stress`; второй — `?qa&stress=fizz`, см. ниже): сколько башен, сколько бактерий держится на карте, скорость игры, во сколько раз прочнее бактерии (чтобы жили дольше). */
const STRESS_TOWERS = 40;
const STRESS_BACTERIA = 200;
const STRESS_SPEED = 3;
const STRESS_HP_MUL = 3;
/** Сколько бактерий стресс-сценарий добавляет за кадр взамен погибших. */
const STRESS_REFILL_PER_FRAME = 20;
/** Новые бактерии стресс-сценария появляются не ближе стольких клеток к организму. */
const STRESS_ORGANISM_GAP_TILES = 3;
/** Второй стресс-сценарий (`?qa&stress=fizz`): сколько Шипучек 4-го уровня, во сколько раз прочнее бактерии (Шипучки бьют по площади и сильно — иначе бактерии гибли бы с одного-двух взрывов). */
const STRESS_FIZZ_TOWERS = 12;
const STRESS_FIZZ_HP_MUL = 40;

/** Запись в журнал событий игры (только режим проверки; вызывать как `if (QA_MODE) s.qa(...)`, чтобы в игровой сборке не собирался и сам объект). */
export function qaLog(s: GameSceneInternals, type: QaEvent['type'], data: Record<string, unknown>): void {
  if (QA_MODE && s.qaEvents.length < QA_EVENTS_MAX) s.qaEvents.push({ type, t: s.elapsed, ...data });
}

export function qaSnapshot(s: GameSceneInternals): DebugSnapshot {
  return {
    state: s.state,
    coins: s.coins,
    lives: s.lives,
    maxLives: s.maxLives(),
    wave: s.waveIdx,
    waveTotal: s.waveTotal(),
    plannedTotal: s.plannedTotal,
    plannedHp: s.plannedHp,
    wavePhase: s.phase,
    waveSpawned: s.waveSpawned,
    waveCount: s.waveCount,
    firstWaves: { ...s.firstWaves },
    spawned: s.spawned,
    kills: s.kills,
    leaked: s.leaked,
    shieldLeft: s.shieldLeft,
    shieldAbsorbed: s.shieldAbsorbed,
    towerPrices: Object.fromEntries(Object.keys(CONFIG.towers).map((id) => [id, towerPrice(id as TowerId)])),
    sellRefundShare: CONFIG.economy.sellRefund + refundBonus(),
    introduced: [...s.introduced],
    splits: s.splits,
    disables: s.disables,
    slows: s.slows,
    poisons: s.poisons,
    absorbs: s.absorbs,
    leaps: s.leaps,
    cloudsMade: s.cloudsMade,
    freezes: s.freezes,
    trapsMade: s.trapsMade,
    latches: s.latches,
    shots: s.shots,
    speed: s.userSpeed,
    elapsed: s.elapsed,
    clock: { frames: s.qaFrames, baseSec: s.qaBaseSec },
    chip: s.panel.chipState(),
    events: s.qaEvents.length,
    lang: document.documentElement.lang,
    renderer: s.game.renderer.type === Phaser.WEBGL ? 'webgl' : 'canvas',
    width: W,
    height: H,
    viewW: VIEW.w,
    view: { ...VIEW },
    map: {
      cols: LEVEL.cols,
      rows: LEVEL.rows,
      tile: CONFIG.map.tile,
      orgW: CONFIG.map.orgW,
      worldW: WORLD.w,
      worldH: WORLD.h,
    },
    camera: { zoom: s.rig.zoom, cx: s.rig.cx, cy: s.rig.cy, zoomMin: ZOOM_MIN, zoomMax: CONFIG.camera.zoomMax },
    level: currentLevel(),
    endButton: s.endButton ? { ...s.endButton } : null,
    upgradesButton: s.upgradesButton ? { ...s.upgradesButton } : null,
    nextButton: s.nextButton ? { ...s.nextButton } : null,
    menuButton: s.menuButton ? { ...s.menuButton } : null,
    copyButton: s.copyButton ? { ...s.copyButton } : null,
    pauseResumeButton: s.pauseResumeButton ? { ...s.pauseResumeButton } : null,
    pauseMenuButton: s.pauseMenuButton ? { ...s.pauseMenuButton } : null,
    pauseAlmanacButton: s.pauseAlmanacButton ? { ...s.pauseAlmanacButton } : null,
    pauseSoundButton: s.pauseSoundButton ? { ...s.pauseSoundButton } : null,
    pauseRestartButton: s.pauseRestartButton ? { ...s.pauseRestartButton } : null,
    levelGrowth: { level: currentLevel(), ...s.params.growth, hpFactor: s.params.hpFactor, hpScale: CONFIG.waves.hpScale },
    // сцена могла уже закрыться (снимок запрашивают и после перехода на другой экран): тогда у неё нет камер
    shake: { ...s.rig.shakeInfo(), cameraShaking: s.cameras?.main?.shakeEffect?.isRunning ?? false, cameraScroll: { x: s.cameras?.main?.scrollX ?? 0, y: s.cameras?.main?.scrollY ?? 0 } },
    dnaGained: s.dnaGained,
    stars: s.stars,
    starDna: s.starDna,
    dnaParts: { ...s.dnaParts },
    coinsLeft: s.coinsLeft,
    overlayBox: { ...s.overlayBox },
    endDnaLines: [...s.endDnaLines],
    attemptLine: s.attemptText,
    toast: s.panel.toastInfo(),
    selected: s.selected,
    towers: s.towers.map((tw: any) => ({
      id: tw.id,
      col: tw.col,
      row: tw.row,
      x: tw.x,
      y: tw.y,
      disabled: tw.isDisabled,
      remaining: tw.remaining,
      aim: tw.aim,
      level: tw.level,
      picks: [...tw.picks],
      pending: tw.pendingTier,
      xp: tw.xp,
      suppressed: tw.isSuppressed,
      auraMul: tw.auraMul,
      latchMul: tw.latchMul,
      stats: {
        damage: tw.stats.damage,
        cooldownMs: tw.stats.cooldownMs,
        range: tw.stats.range,
        beamPulses: tw.stats.beamPulses,
        blastRadius: tw.stats.blastRadius,
        blastFullTargets: tw.stats.blastFullTargets,
        blastRestMul: tw.stats.blastRestMul,
        puddleRadius: tw.stats.puddleRadius,
        puddleSec: tw.stats.puddleSec,
        slowFactor: tw.stats.slowFactor,
        beamHalfWidthPx: tw.stats.beamHalfWidthPx,
        dotPerSec: tw.stats.dotPerSec,
        dotSec: tw.stats.dotSec,
        coneDeg: tw.stats.coneDeg,
        auraMul: tw.stats.auraMul,
        freezeSec: tw.stats.freezeSec,
        trapSec: tw.stats.trapSec,
        trapDps: tw.stats.trapDps,
        spiral: tw.stats.spiral,
      },
    })),
    selectedTower: s.selectedTower ? { col: s.selectedTower.col, row: s.selectedTower.row } : null,
    mergeMode: s.mergeMode,
    mergeHint: s.mergeHintTowers.map((tower: any) => ({ col: tower.col, row: tower.row })),
    maxTowerLevel: MAX_TOWER_LEVEL,
    mergeRadiusPx: CONFIG.mergeRadiusPx,
    merges: s.merges,
    sells: s.sells,
    mutationsPicked: s.mutationsPicked,
    puddles: s.puddles.map((p: any) => ({ x: p.x, y: p.y, r: p.radius, left: p.left })),
    clouds: s.clouds.map((c: any) => ({ x: c.x, y: c.y, r: c.radius, left: c.left })),
    traps: s.traps.map((tr: any) => ({ x: tr.target.x, y: tr.target.y, left: tr.target.trapLeft })),
    lifePool: s.lifePool,
    bacteria: s.bacteria.map((b: any) => ({
      id: b.id,
      x: b.x,
      y: b.y,
      r: b.radius,
      kind: b.kind,
      hp: b.hp,
      maxHp: b.maxHp,
      edge: b.edge.id,
      s: b.s,
      dashing: b.dashing,
      slowed: b.slowed,
      lit: b.lit,
      remaining: b.remaining,
      poisonLeft: b.poisonLeft,
      hits: b.hits,
      absorbed: b.absorbed,
      leaps: b.leaps,
      bodyKey: b.bodyKey,
      freezeLeft: b.frozenFor,
      trapLeft: b.trapLeft,
      memory: b.memory,
      latchedTo: b.latchedTo ? { col: b.latchedTo.col, row: b.latchedTo.row } : null,
      boss: b.bossId,
      armor: b.armor,
      reward: b.reward,
      shielded: b.shielded,
      phase: b.phaseIndex,
    })),
    plan: s.params.plan ? { waves: s.params.plan.waves.length, startCoins: s.params.plan.startCoins, pauseSec: s.params.plan.pauseSec } : null,
    mapId: MAP_ID,
    bossBits: s.bossBits,
    fever: { owned: s.feverGfx !== null, left: s.feverLeft, wait: s.feverWait, uses: s.feverUses },
    needLine: s.needLine,
    phase: s.phase,
    phaseTimer: s.phaseTimer,
    projectiles: s.projectiles.length + s.groundShots.length + s.bursts.length,
    ui: s.panel.geometry(),
    pointerListeners: s.input.listenerCount('pointerdown'),
    effects: {
      flashes: s.effects.flashes,
      bursts: s.effects.bursts,
      popups: s.effects.popups,
      damageNumbers: s.effects.damageNumbers,
      placements: s.effects.placements,
      lifeLosses: s.effects.lifeLosses,
      lifeFlashes: s.effects.lifeFlashes,
      zaps: s.effects.zaps,
      blasts: s.effects.blasts,
      beams: s.effects.beams,
      splats: s.effects.splats,
      frosts: s.effects.frosts,
    },
    sound: { state: sfx.state, played: sfx.played, muted: sfx.muted },
  };
}

/** Ставит одну башню нужного вида и уровня без оплаты (снимки qa/art-shots.mjs); клетка должна быть свободной, не дорожкой и не закрытой. */
export function placeTowerQa(s: GameSceneInternals, id: TowerId, col: number, row: number, level: number): boolean {
  const key = cellKey(col, row);
  if (!(id in CONFIG.towers) || PATH_TILES.has(key) || BLOCKED_TILES.has(key) || s.occupied.has(key)) return false;
  const center = tileCenter(col, row);
  const tower = new Tower(s, s.towerLayer, id, col, row, center.x, center.y);
  for (let lv = 1; lv < Math.min(level, MAX_TOWER_LEVEL); lv++) tower.upgrade();
  while (tower.pendingTier !== null) tower.pickMutation(0);
  s.occupied.add(key);
  s.towers.push(tower);
  s.placedAny = true;
  s.updateHint();
  return true;
}

/** 40 башен всех видов (уровни 1–4, мутации выбраны) по свободным клеткам, ≈200 бактерий всех типов по всей сети, скорость ×3. */
export function setupStress(s: GameSceneInternals): void {
  s.userSpeed = STRESS_SPEED;
  s.panel.setSpeed(s.userSpeed);
  const ids = STRESS_HIGH ? (['pill', 'syrup', 'syringe'] as TowerId[]) : (Object.keys(CONFIG.towers) as TowerId[]);
  const free: [number, number][] = [];
  for (let row = 0; row < LEVEL.rows; row++) {
    for (let col = 0; col < LEVEL.cols; col++) {
      const key = cellKey(col, row);
      if (!PATH_TILES.has(key) && !BLOCKED_TILES.has(key)) free.push([col, row]);
    }
  }
  if (STRESS_FIZZ) {
    setupStressFizz(s, free);
    return;
  }
  // Клетки берутся равномерно по всему списку, чтобы башни стояли по всей карте
  const count = Math.min(STRESS_TOWERS, free.length);
  for (let i = 0; i < count; i++) {
    const [col, row] = free[Math.floor((i * free.length) / count)];
    const center = tileCenter(col, row);
    const tower = new Tower(s, s.towerLayer, ids[i % ids.length], col, row, center.x, center.y);
    const levels = STRESS_HIGH ? 1 + (Math.floor(i / ids.length) % 8) : 1 + (Math.floor(i / ids.length) % 4);
    for (let level = 1; level < levels; level++) tower.upgrade(); // стресс-сценарий: уровни I–IV, как до слияния до VIII (замеры скорости сравнимы)
    while (tower.pendingTier !== null) tower.pickMutation(i % 2);
    s.occupied.add(cellKey(col, row));
    s.towers.push(tower);
  }
  s.updateHint();
  refillStress(s, STRESS_BACTERIA);
}

/**
 * Сценарий «Шипучки»: 12 Шипучек 4-го уровня на свободных клетках вплотную к дорожкам (равномерно по их списку — по всей карте), у каждой три мутации: «Быстрая» (чаще взрывы),
 * «Цепная» (второй взрыв) и «Кислота» (как после слияния: мутации сливаемой башни переходят к новой). Взрывы идут часто и по кучкам бактерий.
 */
function setupStressFizz(s: GameSceneInternals, free: [number, number][]): void {
  const nearPath = free.filter(([col, row]) => {
    for (let dc = -1; dc <= 1; dc++) for (let dr = -1; dr <= 1; dr++) if (PATH_TILES.has(cellKey(col + dc, row + dr))) return true;
    return false;
  });
  const cells = nearPath.length >= STRESS_FIZZ_TOWERS ? nearPath : free;
  const count = Math.min(STRESS_FIZZ_TOWERS, cells.length);
  for (let i = 0; i < count; i++) {
    const [col, row] = cells[Math.floor((i * cells.length) / count)];
    const center = tileCenter(col, row);
    const tower = new Tower(s, s.towerLayer, 'fizz', col, row, center.x, center.y);
    tower.upgrade();
    tower.upgrade();
    tower.upgrade(['fizzAcid']);
    tower.pickMutation(1); // порог 1: «Быстрая» (fizzFast)
    tower.pickMutation(0); // порог 2: «Цепная» (fizzChain); «Кислота» уже пришла при слиянии
    s.occupied.add(cellKey(col, row));
    s.towers.push(tower);
  }
  s.updateHint();
  refillStress(s, STRESS_BACTERIA);
}

/** Добавляет бактерий случайных типов в случайные места сети (не больше `limit` за раз), пока их меньше STRESS_BACTERIA. */
function refillStress(s: GameSceneInternals, limit: number): void {
  for (let n = 0; n < limit && s.bacteria.length < STRESS_BACTERIA; n++) {
    const kind = KINDS[Math.floor(Math.random() * KINDS.length)];
    // Место — случайная точка сети не ближе STRESS_ORGANISM_GAP_TILES клеток к организму (иначе потеря жизни шла бы каждый кадр)
    let edge = EDGES[0];
    let along = 0;
    for (let attempt = 0; attempt < 20; attempt++) {
      edge = EDGES[Math.floor(Math.random() * EDGES.length)];
      along = Math.random() * edge.length;
      if (pointAt(edge, along).x > CONFIG.map.orgW + STRESS_ORGANISM_GAP_TILES * CONFIG.map.tile) break;
    }
    s.bacteria.push(new Bacterium(s, s.bacteriaLayer, kind, edge, along, STRESS_FIZZ ? STRESS_FIZZ_HP_MUL : STRESS_HP_MUL));
    s.spawned++;
  }
}

/** Один кадр стресс-сценария: добавляет бактерий взамен погибших. */
export function stressFrame(s: GameSceneInternals): void {
  refillStress(s, STRESS_REFILL_PER_FRAME);
}
