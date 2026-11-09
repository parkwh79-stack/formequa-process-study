// ─────────────────────────────────────────────────────────────────────────────
// law.js — 법규 검토 + 자동 최대 매스 산출
//
// 대지(폭·깊이·전면도로)와 용도지역을 넣으면
//   ① 건폐율 ② 용적률 ③ 정북방향 일조 이격 ④ 대지 안의 공지 ⑤ 유형 요건(다세대·다가구·임대형기숙사)
//   을 동시에 만족하는 "층수 × 평면 크기"를 찾아 건물에 적용한다 (auto=true).
// auto=false면 템플릿 설계를 그대로 두고 충족/초과만 판정한다.
//
// ※ 법규 값은 아래 RULES 표 한 곳에 모았고, 항목마다 출처와 '검증 상태'를 달았다.
//   법령 MCP(국가법령정보센터 Open API)로 조문·조례를 조회해 이 표를 갱신하는 것이 전제다.
//   (docs/LAW_MCP_SETUP.md 참고) — 실제 인허가 검토를 대신하지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

import { parkingCheck } from './parking.js';

export const RULES_ASOF = '2026-11-09';
// 검증 단계: '확인'(1차 원문 대조) > '2차자료 일치'(공공기관 문서·보도와 일치) > '검증 필요'. 법령 MCP 연결 후 1차 원문으로 올린다.

// 용도지역별 건폐율·용적률 (%)  — bcr/far: 서울특별시 도시계획 조례 제54조·제55조 기준,
// lawBcr/lawFar: 국토의 계획 및 이용에 관한 법률 시행령 제84조·제85조 상한.  sun: 정북 일조 적용 지역
export const ZONES = [
  { id: 'r1x', name: '제1종전용주거지역', bcr: 50, far: 100, lawBcr: 50, lawFar: 100, sun: true },
  { id: 'r2x', name: '제2종전용주거지역', bcr: 40, far: 120, lawBcr: 50, lawFar: 150, sun: true },
  { id: 'r1',  name: '제1종일반주거지역', bcr: 60, far: 150, lawBcr: 60, lawFar: 200, sun: true, v: '2차자료 일치(서울시 특별건축구역 지침 별표)' },
  { id: 'r2',  name: '제2종일반주거지역', bcr: 60, far: 200, lawBcr: 60, lawFar: 250, sun: true, v: '2차자료 일치(서울시 특별건축구역 지침 별표: 조례 54·55조 60%/200%)' },
  { id: 'r3',  name: '제3종일반주거지역', bcr: 50, far: 250, lawBcr: 50, lawFar: 300, sun: true, v: '2차자료 일치(조례 용적률 250%, 2024 보도)' },
  { id: 'sr',  name: '준주거지역',       bcr: 60, far: 400, lawBcr: 70, lawFar: 500, sun: false, note: '주거복합 용적률 완화 특례(2019~) 별도 확인' },
  { id: 'cn',  name: '근린상업지역',     bcr: 60, far: 600, lawBcr: 70, lawFar: 900, sun: false },
  { id: 'cg',  name: '일반상업지역',     bcr: 60, far: 800, lawBcr: 80, lawFar: 1300, sun: false, v: '2차자료 일치(조례 800%, 지구단위계획구역 인센티브 시 최대 960%)' },
  { id: 'ci',  name: '준공업지역',       bcr: 60, far: 400, lawBcr: 70, lawFar: 400, sun: false },
  { id: 'gn',  name: '자연녹지지역',     bcr: 20, far: 50,  lawBcr: 20, lawFar: 100, sun: false },
  { id: 'mp',  name: '계획관리지역',     bcr: 40, far: 100, lawBcr: 40, lawFar: 100, sun: false, note: '관리지역은 해당 시·군 조례 확인' },
];
export const zoneById = id => ZONES.find(z => z.id === id) || ZONES[3];

// 근거 조문 목록 — 화면의 '근거' 열과 MCP 검증 체크리스트에 그대로 쓰인다
export const SOURCES = {
  bcr:   { law: '국토계획법 시행령 제84조 · 서울시 도시계획 조례 제54조', status: '검증 필요' },
  far:   { law: '국토계획법 시행령 제85조 · 서울시 도시계획 조례 제55조', status: '검증 필요' },
  sun:   { law: '건축법 시행령 제86조제1항 (정북방향: 높이 10m 이하 1.5m, 10m 초과 높이의 1/2 — 범위 안에서 건축조례로 정함)', status: '확인: 조문 일치 (시행 2024.5.17, 2026-11-09 웹 대조)' },
  area:  { law: '건축법 시행령 제119조 (바닥면적: 승강기탑·계단탑 제외, 필로티 주차 제외)', status: '검증 필요' },
  open:  { law: '건축법 제58조 · 서울시 건축 조례 (대지 안의 공지) — 본 앱은 단순화한 값', status: '근사' },
  road:  { law: '건축법 제46조 (도로 폭 4m 미만 시 건축선 후퇴)', status: '검증 필요' },
  park:  { law: '주차장법 시행령 별표1·비고 · 서울시 주차장 조례 · 주택건설기준 제27조① · 시행규칙 제11조⑤ — 산식은 js/parking.js', status: '용도별 근거와 검증 상태는 산정 패널 주차 표 참고' },
  dasedae: { law: '건축법 시행령 별표1 제2호다목 (주택 층수 4개 층 이하 · 바닥면적 합계 660㎡ 이하)', status: '확인(2024 법령 본문)' },
  dagagu:  { law: '건축법 시행령 별표1 제1호다목 (주택 층수 3개 층 이하 · 660㎡ 이하 · 19세대 이하)', status: '검증 필요' },
  dormitory: { law: '건축법 시행령 별표1 제2호라목2) 임대형기숙사 (임대 20실 이상 · 공동취사 이용 50% 이상)', status: '확인(2024 법령 본문)' },
};

// ── 형상 계산 도우미 ───────────────────────────────────────────────────────
const fY = (T, n) => (T.structure === 'timber' ? 0.3 : 0) + (n <= 1 ? 0 : T.f1 + (n - 2) * T.ft);
export function metricsFor(T, s, n) {
  const W = T.W * s, D = T.D * s, plate = W * D + (T.wingArea || 0) * s * s;   // 윙(전원주택) 포함
  const coreA = T.core ? (T.core.x1 - T.core.x0) * (T.core.z1 - T.core.z0) * s * s : 0;
  const farArea = T.piloti ? (n - 1) * plate + coreA : n * plate;   // 필로티 주차 제외, 옥탑 제외
  const below = T.basement ? plate : 0;
  const height = fY(T, n + 1);                                        // 지표~최상층 슬래브 (난간·옥탑 제외)
  const houseFloors = T.piloti ? n - 1 : n;
  const units = T.unitsPerFloor ? T.unitsPerFloor * houseFloors : 0;
  const rooms = T.roomsPerFloor ? T.roomsPerFloor * houseFloors : 0;
  const exclusive = T.unitsPerFloor ? (plate - coreA) / T.unitsPerFloor * 0.85 : 0;   // 세대당 전용면적 (전용률 85% 가정)
  return { W, D, plate, coreA, farArea, below, gfa: farArea + below, height, houseFloors, units, rooms, exclusive };
}
export const sunReq = h => (h <= 10 ? 1.5 : h / 2);

// ── 검토 ─────────────────────────────────────────────────────────────────
export function check(T, law, s, n) {
  const z = zoneById(law.zone), site = law.siteW * law.siteD;
  const m = metricsFor(T, s, n);
  const sb = T.setback || { front: 1, side: 0.5 };
  const roadSet = law.road < 4 ? (4 - law.road) / 2 : 0;
  const front = sb.front + roadSet;
  const north = z.sun ? sunReq(m.height) : sb.side;
  const needD = front + m.D + north, needW = m.W + 2 * sb.side;
  const park = parkingCheck(T, m, law);
  const rows = [
    { k: 'bcr', name: '건폐율', plan: m.plate / site * 100, max: z.bcr, unit: '%', ok: m.plate / site * 100 <= z.bcr + 1e-6 },
    { k: 'far', name: '용적률', plan: m.farArea / site * 100, max: z.far, unit: '%', ok: m.farArea / site * 100 <= z.far + 1e-6 },
    { k: 'sun', name: z.sun ? '정북 일조 이격' : '후면 이격', plan: law.siteD - front - m.D, max: north, unit: 'm', ok: needD <= law.siteD + 1e-6, minRule: true },
    { k: 'open', name: '대지 폭 (측면 공지 포함)', plan: law.siteW, max: needW, unit: 'm', ok: needW <= law.siteW + 1e-6, minRule: true },
  ];
  // 주차 (parking.js): 필로티·옥외는 필수, 지하 기계식은 층 추가로 해결 가능해 '권고'
  rows.push(park.row);
  if (T.use === 'dasedae') rows.push(
    { k: 'dasedae', name: '주택 층수', plan: m.houseFloors, max: 4, unit: '개층', ok: m.houseFloors <= 4 },
    { k: 'dasedae', name: '주택 바닥면적 합계', plan: m.houseFloors * m.plate, max: 660, unit: '㎡', ok: m.houseFloors * m.plate <= 660 });
  if (T.use === 'dagagu') rows.push(
    { k: 'dagagu', name: '주택 층수', plan: m.houseFloors, max: 3, unit: '개층', ok: m.houseFloors <= 3 },
    { k: 'dagagu', name: '주택 바닥면적 합계', plan: m.houseFloors * m.plate, max: 660, unit: '㎡', ok: m.houseFloors * m.plate <= 660 },
    { k: 'dagagu', name: '세대 수', plan: m.units, max: 19, unit: '세대', ok: m.units <= 19 });
  if (T.use === 'dormitory') rows.push(
    { k: 'dormitory', name: '임대 객실 수', plan: m.rooms, max: 20, unit: '실', ok: m.rooms >= 20, minRule: true },
    { k: 'dormitory', name: '공동취사 이용 비율', plan: 100, max: 50, unit: '%', ok: true, minRule: true });
  return { z, site, m, rows, ok: rows.every(r => r.advisory || r.ok !== false), front, north, park };
}

// ── 자동 최대 매스: 모든 조건을 만족하는 (층수, 평면 배율) 중 지상 연면적 최대 ──
export function fit(T, law) {
  if (!law.auto) return { s: 1, n: T.floors, ...check(T, law, 1, T.floors), auto: false };
  const [nMin, nMax] = T.floorRange || [T.floors, T.floors];
  let best = null;
  for (let n = nMin; n <= nMax; n++) {
    for (let s = 0.9; s <= 1.2001; s += 0.01) {
      const c = check(T, law, s, n);
      if (!c.ok) continue;
      const score = c.m.farArea - Math.abs(s - 1) * 5;                // 같은 면적이면 템플릿 크기에 가깝게
      if (!best || score > best.score) best = { s, n, score, ...c };
    }
  }
  if (best) return { ...best, auto: true, feasible: true };
  const c = check(T, law, 0.9, nMin);                                   // 불가능: 가장 작은 매스로 두고 위반 표시
  return { s: 0.9, n: nMin, ...c, auto: true, feasible: false };
}

// ── 평면 배율 적용: 좌표(방·벽·가구 위치·개구부·투어·코어)를 s배, 부재 크기(가구·문 폭·계단 폭)는 유지 ──
export function scaleType(T, s, n, law) {
  const X = v => v * s;
  const sc4 = r => r.map(X);
  const out = { ...T, W: T.W * s, D: T.D * s, floors: n };
  // Building extensions share the same horizontal scale as rooms and the main shell.
  for (const key of ['wing', 'porch']) if (T[key]) out[key] = { ...T[key], x0: X(T[key].x0), x1: X(T[key].x1), depth: X(T[key].depth) };
  if (T.wingArea) out.wingArea = T.wingArea * s * s;
  if (T.chimney) out.chimney = { ...T.chimney, z: X(T.chimney.z) };
  if (T.planShiftZ) out.planShiftZ = X(T.planShiftZ);
  if (T.core) {
    const k = T.core, st = k.stair;
    out.core = { ...k, x0: X(k.x0), x1: X(k.x1), z0: X(k.z0), z1: X(k.z1), hole: sc4(k.hole), ev: sc4(k.ev),
      doorEast: k.doorEast && sc4(k.doorEast), frontDoor: k.frontDoor && sc4(k.frontDoor), frontDoor1: k.frontDoor1 && sc4(k.frontDoor1),
      stair: { ...st, xa: X(st.xa), xb: X(st.xb), zLow: X(st.zLow), zHigh: X(st.zHigh), landing: sc4(st.landing) } };
  }
  out.openings = T.openings.map(o => ({ ...o, u: X(o.u) }));
  out.floorsPlan = {};
  for (const [f, fp] of Object.entries(T.floorsPlan || {})) {
    out.floorsPlan[f] = { ...fp,
      rooms: fp.rooms.map(r => ({ ...r, r: sc4(r.r) })),
      walls: (fp.walls || []).map(([a, b, c, d, o]) => [X(a), X(b), X(c), X(d), o && { ...o, gaps: o.gaps && o.gaps.map(([g0, g1]) => { const m = X((g0 + g1) / 2), h = (g1 - g0) / 2; return [m - h, m + h]; }) }]),
      furniture: fp.furniture.map(([k, x, z, r, o]) => [k, X(x), X(z), r, o]),
      lights: (fp.lights || []).map(([x, y, z]) => [X(x), y, X(z)]) };
  }
  out.tour = T.tour.map(k => ({ ...k, pos: [X(k.pos[0]), k.pos[1], X(k.pos[2])], look: [X(k.look[0]), k.look[1], X(k.look[2])] }));
  if (T.stairTimber) out.stairTimber = { ...T.stairTimber, x: X(T.stairTimber.x), zLow: X(T.stairTimber.zLow), zHigh: X(T.stairTimber.zHigh) };
  if (T.hole2) out.hole2 = sc4(T.hole2);
  if (T.parkLines) out.parkLines = T.parkLines.map(X);
  if (T.frontDoors) out.frontDoors = T.frontDoors.map(X);
  // 대지: 건물 중심 기준. 전면(남측) = 건물 앞면 + 전면 공지, 후면(북측)까지 대지 깊이
  const sb = T.setback || { front: 1, side: 0.5 };
  const front = sb.front + (law.road < 4 ? (4 - law.road) / 2 : 0);
  const z1 = out.D / 2 + front;
  out.site = { x0: -law.siteW / 2, x1: law.siteW / 2, z0: z1 - law.siteD, z1 };
  return out;
}
