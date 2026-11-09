// ─────────────────────────────────────────────────────────────────────────────
// parking.js — 부설주차장: ① 법정 필요 대수 ② 대지 안 배치(구획 좌표) ③ 판정
//
// ① 필요 대수
//   · 주차장법 시행령 별표1 — 용도별 "시설면적 ○㎡당 1대". 지자체 조례는 시행령 기준의 1/2 범위에서 강화·완화(시행령 제6조②)
//   · 다가구주택·공동주택(기숙사 제외)·오피스텔 → 「주택건설기준 등에 관한 규정」 제27조제1항
//       세대당 1대(전용 60㎡ 이하 0.7대) 이상  AND  주거전용면적 합계 ÷ 지역별 기준면적  중 큰 값
//   · 임대형·일반기숙사 → 별표1 "그 밖의 건축물" (학생용 기숙사만 400㎡당 1대)
//   · 비고: 용도별로 소수점 첫째자리까지 구해 합산 → 끝수 0.5 이상은 1대 → 총계 1대 미만이면 0대
// ② 배치 (근사)
//   · 필로티: 전면 기둥 사이 베이에 직각주차 2.5×5.0m. 총 8대 이하 + 보·차도 구분 없는 12m 미만 도로 → 도로를 차로로 사용,
//     총 5대 이하면 세로 2대 직렬 허용 (주차장법 시행규칙 제11조⑤ 소규모 특례 — 검증 필요)
//   · 지하: 작은 대지는 램프를 둘 수 없어 카리프트 + 2단 퍼즐(기계식)로 가정, 대당 약 14㎡
//   · 전원주택: 앞마당 옥외 주차
// ※ 수치는 RULES/SOURCES 한 곳에. 법령 MCP 연결 후 1차 원문으로 검증해 status를 올린다.
// ─────────────────────────────────────────────────────────────────────────────

export const STALL = { w: 2.5, l: 5.0, wx: 2.6, lx: 5.2, aisle: 6.0 };   // 일반형·확장형 구획(m), 직각주차 차로 폭

// 지역 구분 — 별표1 값(조례)과 주택건설기준 제27조 지역 구분을 함께 정한다
export const REGIONS = {
  seoul: { name: '서울특별시', ord: '서울시 주차장 설치 및 관리 조례', house: [75, 65] },
  metro: { name: '광역시·수도권 시', ord: '시행령 기본값 (해당 조례 확인)', house: [85, 70] },
  city:  { name: '그 밖의 시·수도권 군', ord: '시행령 기본값 (해당 조례 확인)', house: [95, 75] },
  other: { name: '그 밖의 지역 (군 등)', ord: '시행령 기본값 (해당 조례 확인)', house: [110, 85] },
};

// 별표1 용도별 기준면적(㎡당 1대): seoul = 서울 조례, base = 시행령
const RATE = {
  neighborhood: { label: '제1·2종 근린생활시설', base: 200, seoul: 134 },
  office:       { label: '업무시설',            base: 150, seoul: 100 },
  other:        { label: '그 밖의 건축물 (기숙사 등)', base: 300, seoul: 200 },
};

export const PARK_SOURCES = {
  rate:  { law: '주차장법 시행령 별표1 (근생 200㎡·업무 150㎡·그 밖 300㎡당 1대) · 서울시 조례 별표2 (134·100·200㎡)', status: '시행령 그 밖 300㎡·비고 끝수 규칙: 2차자료 일치 / 서울값: 검증 필요' },
  house: { law: '주택건설기준 등에 관한 규정 제27조제1항 (세대당 1대, 전용 60㎡ 이하 0.7대 · 지역별 전용면적 기준)', status: '검증 필요' },
  dorm:  { law: '주차장법 시행령 별표1 제11호 그 밖의 건축물 (학생용 기숙사 외 기숙사)', status: '2차자료 일치(질의회신)' },
  acc:   { law: '주차장법 시행령 별표1 비고 · 장애인등편의법 시행령 별표2 (설치기준 10대 이상: 2~4% 범위에서 조례 비율, 3.3×5.0m)', status: '범위 2차자료 일치 / 서울 비율(기본 3%): 검증 필요' },
  ext:   { law: '주차장법 시행규칙 제11조④ → 제6조①14호 (50대 이상 부설주차장: 구획 총수의 30% 이상 확장형 2.6×5.2m)', status: '2차자료 일치(법제처 해석 17-0656 인용)' },
  cap:   { law: '주차장법 제19조⑩ · 시행규칙 제7조의2 · 서울시 주차장 조례 제21조·별표3 (상업·준주거 10개 설치제한 지역, 주택·오피스텔 제외)', status: '지역·대상 2차자료 일치(서울시 교통 누리집) / 상한 비율: 검증 필요(기본 50% 가정)' },
  small: { law: '주차장법 시행규칙 제11조⑤ (8대 이하 소규모 부설주차장: 도로를 차로로, 5대 이하 직렬 2대)', status: '검증 필요' },
  size:  { law: '주차장법 시행규칙 제3조 (일반형 2.5×5.0m · 확장형 2.6×5.2m · 장애인 3.3×5.0m)', status: '2차자료 일치' },
};

const trunc1 = v => Math.floor(v * 10 + 1e-9) / 10;
// 별표1 비고: 끝수 0.5 이상은 1대, 총계 1대 미만이면 0대
export const roundPark = v => (v < 1 ? 0 : (v % 1 >= 0.5 - 1e-9 ? Math.ceil(v) : Math.floor(v)));

// ── ① 필요 대수 ─────────────────────────────────────────────────────────────
// m = law.metricsFor 결과 (plate·farArea·units·rooms·houseFloors…), coreA = 층당 코어 면적
export function parkingRequired(T, m, law = {}) {
  const region = law.region || 'seoul';
  const R = REGIONS[region] || REGIONS.seoul, isSeoul = region === 'seoul';
  const rate = k => (isSeoul ? RATE[k].seoul : RATE[k].base);
  const parts = [];
  const area = (k, A, note) => parts.push({ use: RATE[k].label, basis: `${A.toFixed(0)}㎡ ÷ ${rate(k)}㎡`, raw: trunc1(A / rate(k)), note, src: 'rate' });
  switch (T.use) {
    case 'neighborhood': area('neighborhood', m.farArea, '지하층은 주차·기계실로 보고 제외'); break;
    case 'office':
      if (T.f1 > 0) { area('neighborhood', m.plate, '1층 근린생활시설'); area('office', m.farArea - m.plate, '2층 이상 업무시설'); }
      else area('office', m.farArea);
      break;
    case 'dormitory': area('other', m.farArea, `임대 ${m.rooms}실`); parts[parts.length - 1].src = 'dorm'; break;
    case 'house': {                                                      // 단독주택(다가구 제외)
      const A = m.farArea, v = A <= 50 ? 0 : A <= 150 ? 1 : 1 + (A - 150) / 100;
      parts.push({ use: '단독주택', basis: A <= 150 ? `${A.toFixed(0)}㎡ (50~150㎡ → 1대)` : `1 + (${A.toFixed(0)} − 150) ÷ 100`, raw: trunc1(v), src: 'rate' });
      break;
    }
    case 'dasedae': case 'dagagu': {                                     // 주택건설기준 제27조①
      const ex = m.exclusive, units = m.units, sum = ex * units;
      const perUnit = units * (ex <= 60 ? 0.7 : 1.0);
      const byArea = sum / (ex <= 85 ? R.house[0] : R.house[1]);
      const v = Math.max(perUnit, byArea);
      parts.push({ use: T.use === 'dasedae' ? '다세대주택 (공동주택)' : '다가구주택',
        basis: `max(${units}세대 × ${ex <= 60 ? 0.7 : 1.0}, 전용 ${sum.toFixed(0)}㎡ ÷ ${ex <= 85 ? R.house[0] : R.house[1]}㎡)`,
        raw: trunc1(v), note: `세대당 전용 약 ${ex.toFixed(1)}㎡ (전용률 가정)`, src: 'house' });
      break;
    }
    default: break;
  }
  const sum = Math.round(parts.reduce((a, p) => a + p.raw, 0) * 10) / 10;
  const std = roundPark(sum);                                            // 별표1(2) 기준 대수
  // 서울 주차상한제: 설치제한 지역(상업·준주거, 10개 지역) 안의 주택·오피스텔 외 시설은 '최고한도'로 바뀐다.
  //   상한 비율은 조례 별표3 값을 확인해 넣어야 한다 (기본 50%는 학습용 가정). 최소 1대.
  const housing = T.use === 'dasedae' || T.use === 'dagagu' || T.use === 'house';
  const capOn = !!(law.capZone && region === 'seoul' && CAP_ZONES.includes(law.zone) && !housing);
  const capMax = capOn ? Math.max(1, roundPark(sum * (law.capRatio ?? 50) / 100)) : null;
  const req = capOn ? capMax : std;                                      // 설계 목표 대수 (상한제면 최고한도까지만)
  // 장애인 전용: 설치기준 대수 10대 이상이면 2~4% 범위에서 조례 비율 이상 (별표1 비고 · 장애인등편의법 시행령 별표2)
  const accRatio = law.accRatio ?? 3;
  const acc = req >= 10 ? Math.max(1, Math.ceil(req * accRatio / 100 - 1e-9)) : 0;
  // 확장형: 50대 이상 부설주차장은 주차단위구획 총수(평행 제외)의 30% 이상 (시행규칙 제11조④ → 제6조①14호)
  const ext = req >= 50 ? Math.ceil(req * 0.3 - 1e-9) : 0;
  return { parts, sum, std, req, capOn, capMax, capRatio: law.capRatio ?? 50, acc, accRatio, ext, region: R.name, ord: R.ord };
}
export const CAP_ZONES = ['sr', 'cn', 'cg'];   // 준주거·근린상업·일반상업 (실제 적용은 10개 설치제한 지역 안일 때만)

// ── ② 배치 ──────────────────────────────────────────────────────────────────
// 건물 좌표계(원점 = 평면 중심, +z = 남·도로). s배된 치수 기준. 반환 stalls = [{x0,z0,x1,z1,tandem}]
export function parkingLayout(T, m, law, req, acc = 0) {
  const W = m.W, D = m.D, hw = W / 2, hd = D / 2, s = W / T.W;
  const sb = T.setback || { front: 1, side: 0.5 };
  const front = sb.front + (law.road < 4 ? (4 - law.road) / 2 : 0);
  const zEdge = hd + front;                                              // 대지 전면 경계
  const stalls = [];
  if (T.piloti) {
    const n = W > 12.5 ? 4 : 3, colS = 0.62;
    const xs = Array.from({ length: n }, (_, i) => -hw + 0.3 + (W - 0.6) * i / (n - 1));
    const core = T.core && { x0: T.core.x0 * s, x1: T.core.x1 * s, z1: T.core.z1 * s };
    const door = T.core && (T.core.frontDoor1 || T.core.frontDoor);
    const walk = door ? [door[0] * s - 0.35, door[1] * s + 0.35] : null;    // 현관 보행로 (폭 1.2m 내외)
    const z0 = zEdge - STALL.l;
    const bays = [];
    for (let i = 0; i < n - 1; i++) {
      const a = xs[i] + colS / 2, b = xs[i + 1] - colS / 2;
      const segs = walk && walk[1] > a && walk[0] < b ? [[a, walk[0]], [walk[1], b]] : [[a, b]];
      for (const [p, q] of segs) {
        const k = Math.floor((q - p + 1e-6) / STALL.w);
        const pad = (q - p - k * STALL.w) / 2;
        for (let j = 0; j < k; j++) {
          const x0 = p + pad + j * STALL.w, x1 = x0 + STALL.w;
          if (core && z0 < core.z1 + 0.2 && x1 > core.x0 && x0 < core.x1) continue;   // 코어와 겹침
          stalls.push({ x0, z0, x1, z1: zEdge, tandem: false });
        }
      }
    }
    // 소규모 특례: 총 5대 이하면 세로 2대 직렬 (코어·후면과 겹치지 않는 베이만)
    for (const st of [...stalls]) {
      if (stalls.length >= Math.min(5, req)) break;
      const tz0 = st.z0 - STALL.l;
      const hitCore = core && tz0 < core.z1 + 0.2 && st.x1 > core.x0 && st.x0 < core.x1;
      if (!hitCore && tz0 > -hd + 0.6) stalls.push({ x0: st.x0, z0: tz0, x1: st.x1, z1: st.z0, tandem: true });
    }
    const n8 = stalls.length <= 8 && law.road < 12;
    return { kind: 'piloti', label: '필로티 직각주차 (도로를 차로로)', stalls, provided: stalls.length,
      note: !n8 ? '8대 초과 → 대지 안 차로 6m 필요 (이 평면에서는 불가)' : stalls.some(t => t.tandem) ? '직렬 2대 포함 (5대 이하 특례)' : '', ok8: n8 };
  }
  if (T.basement) {
    // v4.1: the basement is designed to meet the legal count. Levels are added (up to T.maxBasement, default 3)
    // until puzzle stalls + self-park accessible stalls cover the requirement. Accessible stalls cannot be
    // mechanical: they are self-park bays on B1 next to the lift, reached by the car lift (3.3 × 5.0 m + 6 m aisle).
    const coreA = T.core ? (T.core.x1 - T.core.x0) * (T.core.z1 - T.core.z0) * s * s : 0;
    const perLevel = Math.max(0, Math.floor((m.plate - coreA - 30) / 14));   // 카리프트 30㎡, 2단 퍼즐 대당 14㎡
    const accSlots = acc ? Math.ceil((acc * 3.3 * 5 + 6 * 3.3 * Math.min(acc, 2)) / 14) : 0;   // 장애인 자주식이 차지하는 퍼즐 자리
    const maxB = T.maxBasement ?? 3, cap = L => Math.max(0, perLevel * L - accSlots) + acc;
    let levels = 1; while (levels < maxB && cap(levels) < req) levels++;
    const provided = perLevel ? Math.min(req, cap(levels)) : 0;
    return { kind: 'mech', label: `지하 ${levels}개층 기계식 (카리프트 + 2단 퍼즐)`, stalls: [], provided, perLevel, levels, acc, maxB, ok: perLevel > 0 && cap(levels) >= req,
      note: `층당 ${perLevel}대 × ${levels}개층${acc ? ` · 장애인 전용 ${acc}대는 지하 1층 자주식(승강기 옆)` : ''}${cap(levels) < req ? ` · 지하 ${maxB}개층으로도 ${req - cap(levels)}대 부족` : ''} · 기계식 설비는 전문업체 검토` };
  }
  // 전원주택 등: 앞마당 옥외 주차 (서쪽부터, 대문·진입로 x≈+2.2 피함)
  const room = front - 0.3;
  if (room >= STALL.l) {
    const sx0 = T.parkYard?.x0 ?? (-hw - sb.side + 0.6), k = Math.min(Math.max(req, 2), 3);
    for (let j = 0; j < k; j++) { const x0 = sx0 + j * STALL.w; if (x0 + STALL.w > (T.parkYard?.xMax ?? 0.4)) break; stalls.push({ x0, z0: zEdge - 0.3 - STALL.l, x1: x0 + STALL.w, z1: zEdge - 0.3, tandem: false }); }
  }
  return { kind: 'yard', label: '앞마당 옥외 주차', stalls, provided: stalls.length, note: '' };
}

// ── ③ 판정 행 (law.check에 들어간다) ───────────────────────────────────────
// hard = true면 필수 항목(매스 탐색이 이 조건까지 만족해야 함). v4.1부터 지하 기계식도 필수 — 지하층을 늘려 충족.
export function parkingCheck(T, m, law) {
  const R = parkingRequired(T, m, law);
  const L = parkingLayout(T, m, law, R.req, R.acc || 0);
  // v4.1: every layout, including the mechanical basement, must meet the legal count (no 'advisory' pass).
  const hard = law.parkHard !== false;
  const ok = L.kind === 'mech' ? L.ok : (L.provided >= R.req && L.ok8 !== false);
  const accNote = R.acc ? (L.kind === 'mech' ? '' : `장애인 전용 ${R.acc}대 (3.3m 폭) 포함`) : '';
  const row = { k: 'park', name: `주차 (${L.label})`, plan: L.provided, max: R.req, unit: '대', ok, minRule: true, advisory: !hard,
    note: [R.capOn ? `주차상한제: 최고한도 ${R.capMax}대 (기준 ${R.std}대의 ${R.capRatio}%)` : '', L.note, accNote, R.ext ? `확장형 ${R.ext}대 이상` : '',
      ok ? '' : L.kind === 'mech' ? '매스를 줄이거나 인근 부설주차장 검토' : '세대·실 수를 줄이거나 대지를 넓혀야 함'].filter(Boolean).join(' · ') };
  return { R, L, row };
}
