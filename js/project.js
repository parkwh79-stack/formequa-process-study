// ─────────────────────────────────────────────────────────────────────────────
// project.js — 현재 프로젝트 상태 + 공사비 산정 + 공기 산정(선후행) + 자금 흐름
//
// 원본 05의 원리 "PHASES 표 하나가 간트와 3D를 함께 구동"을 확장했습니다.
//   1) estimate() : 연면적(형상에서 자동 계산) × 평당 단가 × 공종 비율 × 마감 등급 → 공종별 공사비
//   2) schedule() : 공종별 기간 산정 규칙 + 선후행(FS/SS·lag) → 각 공정의 시작·종료 주
//                   지연 시나리오(공정 + N주)를 넣으면 후속 공정·준공·이자가 자동으로 밀린다
//   3) cashflow() : 주간 기성 + 간접비 → 자기자본 선투입 → 대출 인출 → 이자유보
// 이 파일은 화면을 모릅니다. main.js가 recompute() 후 결과(PRJ)를 읽어 그립니다.
// ─────────────────────────────────────────────────────────────────────────────
import { TYPES, expandOpenings } from './types.js';
import { fit, scaleType } from './law.js';
import { resolveEntrances } from './access.js';

export const C = {
  // FORMEQUA 톤: 웜 페이퍼 · 잉크 · 브론즈
  paper: 0xf5f3ee, ink: 0x242622, accent: 0xb45309, asphalt: 0x56575a, glass: 0x9fb8c0,
  frame: 0x2b2b2b, steel: 0x565b60, waterproof: 0x6f8577, fence: 0xdad6cc, cabin: 0xc2c8c9, plant: 0x5f7148,
};
export const clamp01 = v => Math.min(1, Math.max(0, v));
export const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
export const lerp = (a, b, t) => a + (b - a) * t;
export const PYEONG = 3.3058;

// 공정 목록(코드·이름) — 유형에 없는 공정은 only()로 빠진다
const PHASE_DEFS = [
  { key: 'site',      code: 'A01', name: '가설공사' },
  { key: 'earth',     code: 'B01', name: P => P.T.basement ? '흙막이·토공사' : (P.T.structure === 'rc' ? '토공사' : '토목·정지') },
  { key: 'found',     code: 'B02', name: P => P.T.structure === 'rc' ? '기초공사' : '기초 (온통기초)' },
  { key: 'sub',       code: 'C01', name: '지하골조', only: P => P.T.basement > 0 },
  { key: 'frame',     code: 'C02', name: P => P.T.structure === 'rc' ? `골조 1~${P.T.floors}F` : '골조 (경량목구조)' },
  { key: 'roof',      code: 'C03', name: P => P.T.roof === 'flat' ? '옥탑·옥상방수' : '지붕' },
  { key: 'masonry',   code: 'D01', name: '조적·미장·방수', only: P => P.T.structure === 'rc' },
  { key: 'window',    code: 'D02', name: '창호·유리' },
  { key: 'facade',    code: 'D03', name: P => ({ granite: '외장 (화강석)', brick: '외장 (치장벽돌)', curtain: '외장 (커튼월)', stone: '외장 (석재·적삼목·스타코)', stucco: P.T.structure === 'rc' ? '외장 (외단열 스타코)' : '외장 (스타코·사이딩)' }[P.T.facade]) },
  { key: 'mep',       code: 'E01', name: '기계·전기 설비' },
  { key: 'interior',  code: 'D04', name: '내장·인테리어' },
  { key: 'landscape', code: 'F01', name: P => P.T.structure === 'rc' ? '부대토목·조경' : '조경·데크·담장' },
  { key: 'handover',  code: 'G01', name: '사용승인·준공' },
];

// 공종 비율 (직접공사비 = 100%) — 구조별
const SHARES = {
  rc:     { site: .04, earth: .03, found: .05, frame: .24, roof: .03, masonry: .07, window: .08, facade: .08, mep: .20, interior: .14, landscape: .02, handover: .02 },
  timber: { site: .03, earth: .04, found: .08, frame: .20, roof: .09, window: .10, facade: .09, mep: .15, interior: .17, landscape: .04, handover: .01 },
};
export const GRADES = { basic: { name: '기본', k: 0.85, t: 0.9 }, std: { name: '표준', k: 1.0, t: 1.0 }, premium: { name: '고급', k: 1.35, t: 1.2 } };
const FINISH_KEYS = ['window', 'facade', 'interior'];

// ── 현재 프로젝트 (main.js가 읽는 단일 객체) ────────────────────────────────
export const PRJ = { key: null, T0: null, T: null, law: null, fit: null, park: null, opts: {}, openings: [], PHASES: [], WEEKS: 0, est: null, CASH: [] };

// 유형 + 대지·용도지역 → 법규 자동 매스(law.js fit) → 배율·층수를 적용한 실제 설계 T
export function loadType(key, lawOverride = null, keepOpts = false) {
  if (key === 'dagagu') key = 'dasedae'; // Old bookmarks open the retained residential study.
  if (key === 'geunsaeng') key = 'midsize'; // v4.1: the neighbourhood building was merged into the mid-size building.
  PRJ.key = TYPES[key] ? key : 'midsize';
  const T0 = PRJ.T0 = TYPES[PRJ.key];
  PRJ.law = { ...T0.law, ...(lawOverride || {}) };
  PRJ.fit = fit(T0, PRJ.law);
  const T = PRJ.T = resolveEntrances(scaleType(T0, PRJ.fit.s, PRJ.fit.n, PRJ.law));
  PRJ.park = PRJ.fit.park;                                   // 주차: 필요 대수(R) · 배치(L) — parking.js
  // v4.1: the basement gets as many parking levels as the legal count needs (3D pit, frame and schedule follow).
  if (T.basement && PRJ.park?.L?.kind === 'mech') { T.basementLevel = T.basement; T.basementLevels = PRJ.park.L.levels; T.basement = T.basement * PRJ.park.L.levels; }
  PRJ.openings = expandOpenings(T);
  if (keepOpts && PRJ.opts.unit) return recompute();
  PRJ.opts = {
    grade: 'std', unit: T.cost.unit, indirect: T.cost.indirect, frameDays: T.cost.frameDays, wdays: 6,
    delayKey: 'frame', delayWeeks: 0, parkUnit: 2500,          // 기계식 주차설비 대당 단가(만원, 가정)
    land: T.fin.land, equity: T.fin.equity, limit: T.fin.limit, rate: T.fin.rate * 100,
  };
  return recompute();
}

// 층별 실내 계획: types.js에 있는 층은 그대로, 없는 위층은 바로 아래 정의층(기준층)을 복제한다
// (단면 장면에서 위층이 빈 껍데기로 보이지 않게). 반환: [[층, 계획, 복제 여부], ...]
export function plansByFloor() {
  const T = PRJ.T, fp = T.floorsPlan || {}, out = [];
  let last = null;
  for (let n = 1; n <= T.floors; n++) {
    if (fp[n]) { out.push([n, fp[n], false]); if (n >= 2) last = fp[n]; }
    else if (last && n >= 2) out.push([n, last, true]);
  }
  return out;
}

// ── 형상 ────────────────────────────────────────────────────────────────────
export const base = () => (PRJ.T.structure === 'timber' ? 0.3 : 0);
export const floorY = n => base() + (n <= 1 ? 0 : PRJ.T.f1 + (n - 2) * PRJ.T.ft);
export const roofY = () => floorY(PRJ.T.floors + 1);

// 연면적(㎡): 필로티 주차는 바닥면적에서 제외, 지하층·옥탑 포함
export function areas() {
  const T = PRJ.T, plate = T.W * T.D + (T.wingArea || 0);       // 전원주택 윙 바닥면적 포함
  const coreA = T.core ? (T.core.x1 - T.core.x0) * (T.core.z1 - T.core.z0) : 0;
  const above = T.piloti ? (T.floors - 1) * plate + coreA : T.floors * plate;
  const below = T.basement ? plate * (T.basementLevels || 1) : 0;   // 지하 주차층 수만큼. 옥탑은 바닥면적 제외 (건축법 시행령 제119조)
  const siteA = (T.site.x1 - T.site.x0) * (T.site.z1 - T.site.z0);
  return { plate, above, below, gfa: above + below, site: siteA, far: above / siteA * 100, bcr: plate / siteA * 100 };
}

// ── 1) 공사비 산정 ──────────────────────────────────────────────────────────
export function estimate() {
  const T = PRJ.T, o = PRJ.opts, A = areas(), g = GRADES[o.grade];
  const sh = SHARES[T.structure];
  const abovePy = A.above / PYEONG, belowPy = A.below / PYEONG;
  const baseAbove = abovePy * o.unit / 1e4;            // 억원 (단가: 만원/평)
  const baseBelow = belowPy * o.unit * 1.6 / 1e4;      // 지하층 할증 1.6배
  const lines = {};
  for (const k in sh) lines[k] = baseAbove * sh[k] * (FINISH_KEYS.includes(k) ? g.k : 1);
  if (baseBelow) { lines.earth = (lines.earth || 0) + baseBelow * 0.55; lines.sub = baseBelow * 0.45; }
  // 주차: 기계식이면 설비비(대당 단가) + 부족분을 채우는 추가 지하층(지하 할증 단가)
  const PL = PRJ.park?.L, park = { equip: 0, extraLevels: 0, extraCost: 0 };
  if (PL?.kind === 'mech') {
    const req = PRJ.park.R.req, levels = Math.max(1, PL.levels || 1);
    park.extraLevels = levels - 1;
    park.equip = Math.min(req, PL.perLevel * levels) * (o.parkUnit ?? 2500) / 1e4;
    park.extraCost = park.extraLevels * belowPy / levels * o.unit * 1.6 / 1e4;   // 표시용: 추가 층 몫 (지하 연면적에 이미 포함)
    lines.mep = (lines.mep || 0) + park.equip;
  }
  const direct = Object.values(lines).reduce((a, b) => a + b, 0);
  const indirect = direct * o.indirect / 100;
  const total = direct + indirect;
  return { lines, direct, indirect, total, A, park, perPy: total * 1e4 / (A.gfa / PYEONG), perM2: total * 1e8 / A.gfa / 1e4 };
}

// ── 2) 공기 산정 (선후행) ───────────────────────────────────────────────────
// dur: 주 단위 기간 규칙 · deps: [선행공정, 'FS'(종료→시작) | 'SS'(시작→시작), lag(주)]
function rules(P) {
  const T = P.T, o = P.opts, A = areas(), rc = T.structure === 'rc';
  const g = GRADES[o.grade];
  const perFloor = rc ? o.frameDays / o.wdays : 1.8;                        // 골조 층당 주
  const frameDur = T.floors * perFloor + (rc && T.f1 > 4 ? 3 / o.wdays : 0);
  const pitVol = T.basement ? (T.W + 2.4) * (T.D + 2.4) * (T.basement + 1) : 0;
  return {
    site:      { dur: T.basement ? 1.5 : 1, deps: [] },
    earth:     { dur: T.basement ? 2 + pitVol / 400 : (rc ? 2 : 1.5), deps: [['site', 'FS', -0.5]] },
    found:     { dur: rc ? 2.5 : 2, deps: [['earth', 'FS', -0.3]] },
    sub:       { dur: 4, deps: [['found', 'FS', 0]] },
    frame:     { dur: frameDur, deps: [[T.basement ? 'sub' : 'found', 'FS', 0]] },
    roof:      { dur: 2.5, deps: [['frame', 'FS', -0.5]] },
    masonry:   { dur: Math.max(T.floors * 1.1, frameDur - perFloor * 0.8), deps: [['frame', 'SS', perFloor * 2]] },   // 골조를 2개층 뒤따라감
    window:    { dur: rc ? Math.max(T.floors * 0.9 + 1, frameDur - perFloor * 0.5) : T.floors * 0.9 + 1, deps: rc ? [['masonry', 'SS', 2]] : [['roof', 'SS', 1]] },
    facade:    { dur: T.floors * 1.3 + 1, deps: [['window', 'SS', 1.5], ['frame', 'FS', rc ? 1 : 0]] },
    mep:       { dur: 0, deps: [['frame', 'SS', frameDur * 0.4]], until: ['interior', -1] },
    interior:  { dur: (2 + A.gfa / PYEONG / 55) * g.t, deps: [['facade', 'SS', 2], ['window', 'FS', 0]] },
    landscape: { dur: 2.5, deps: [['facade', 'FS', -0.5]] },
    handover:  { dur: 1, deps: [['interior', 'FS', 0], ['landscape', 'FS', 0], ['mep', 'FS', 0]] },
  };
}

export function schedule() {
  const P = PRJ, R = rules(P), out = [], at = {};
  const resolveUntil = ph => {
    if (!ph?.until || !at[ph.until[0]]) return;
    const delay = P.opts.delayKey === ph.key ? +P.opts.delayWeeks || 0 : 0;
    ph.w1 = Math.max(ph.w0 + 2, at[ph.until[0]].w1 + ph.until[1]) + delay;
  };
  for (const d of PHASE_DEFS) {
    if (d.only && !d.only(P)) continue;
    const r = R[d.key];
    let w0 = 0;
    for (const [k, type, lag] of r.deps) {
      const pr = at[k]; if (!pr) continue;
      resolveUntil(pr);
      w0 = Math.max(w0, (type === 'FS' ? pr.w1 : pr.w0) + lag);
    }
    let dur = r.dur + (P.opts.delayKey === d.key ? +P.opts.delayWeeks || 0 : 0);
    const ph = { key: d.key, code: d.code, name: typeof d.name === 'function' ? d.name(P) : d.name,
                 spec: P.T.spec[d.key] || '', w0: Math.max(0, w0), w1: Math.max(0, w0) + dur, until: r.until };
    out.push(ph); at[d.key] = ph;
  }
  // '까지' 공정(설비): 다른 공정 종료에 맞춰 끝냄
  out.forEach(resolveUntil);
  out.forEach((p, i) => { p.n = i; p.w0 = Math.round(p.w0 * 10) / 10; p.w1 = Math.round(p.w1 * 10) / 10; });
  return out;
}

// ── 달력: 작업일 = 일요일·공휴일 제외 (공휴일은 예시 — 매년 확인) ─────────────
export const HOLIDAYS = new Set([
  '2027-03-01', '2027-05-05', '2027-05-13', '2027-06-06', '2027-08-15', '2027-08-16',
  '2027-09-14', '2027-09-15', '2027-09-16', '2027-10-03', '2027-10-04', '2027-10-09',
  '2027-10-11', '2027-12-25', '2027-12-27', '2028-01-01', '2028-01-26', '2028-01-27', '2028-01-28',
  '2028-03-01', '2028-05-05',
]);
const DAY = 864e5;
const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const dateAt = w => new Date(PRJ.T.start.getTime() + Math.floor(Math.max(0, w) * 7) * DAY);
export function workDaysTo(w) {
  let n = 0; const end = dateAt(w);
  for (let d = new Date(PRJ.T.start); d < end; d = new Date(d.getTime() + DAY)) if (d.getDay() !== 0 && !(PRJ.opts.wdays === 5 && d.getDay() === 6) && !HOLIDAYS.has(ymd(d))) n++;
  return n;
}
export const fmtDate = d => `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

// ── 3) 자금 흐름 ────────────────────────────────────────────────────────────
export function cashflow() {
  const { PHASES, WEEKS, est, opts: o } = PRJ;
  const rows = [];
  let eqLeft = o.equity, loan = 0, cumCost = 0, cumInt = 0, eqUsed = 0;
  const spend = need => { const e = Math.min(eqLeft, need); eqLeft -= e; eqUsed += e; loan += need - e; };
  spend(o.land);
  rows.push({ w: 0, cumCost, cumInt, eqUsed, loan, total: o.land });
  const steps = Math.ceil(WEEKS);
  for (let w = 0; w < steps; w++) {
    let cost = est.indirect * Math.min(1, WEEKS - w) / WEEKS;
    for (const p of PHASES) {
      const ov = Math.max(0, Math.min(w + 1, p.w1) - Math.max(w, p.w0));
      cost += (est.lines[p.key] || 0) * ov / Math.max(0.1, p.w1 - p.w0);
    }
    const end = Math.min(w + 1, WEEKS);
    const interest = loan * (o.rate / 100) / 52 * (end - w);
    cumCost += cost; cumInt += interest;
    spend(cost + interest);
    rows.push({ w: end, cumCost, cumInt, eqUsed, loan, total: o.land + cumCost + cumInt });
  }
  return rows;
}
export function cashAt(w) {
  const C2 = PRJ.CASH, i = Math.min(C2.length - 2, Math.max(0, Math.floor(w)));
  const a = C2[i], b = C2[i + 1], o = {};
  const f = clamp01((w - a.w) / (b.w - a.w));
  for (const k in a) o[k] = lerp(a[k], b[k], f);
  return o;
}

export function recompute() {
  PRJ.PHASES = schedule();
  PRJ.WEEKS = Math.max(...PRJ.PHASES.map(p => p.w1));
  PRJ.est = estimate();
  PRJ.CASH = cashflow();
  return PRJ;
}
export const phaseByKey = k => PRJ.PHASES.find(p => p.key === k);
