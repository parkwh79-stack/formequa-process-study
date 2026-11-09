// ─────────────────────────────────────────────────────────────────────────────
// building.js — 대지·구조·외피를 부재 단위로 만들고 공정에 붙인다
//
// v2 변경점
//  · 외벽을 "개구부가 뚫린 벽"(ExtrudeGeometry + holes)으로 → 실내에서 창밖이 보인다
//  · 조적벽·외장재·창호가 같은 개구부 표(types.js openings)에서 만들어져 항상 일치
//  · 슬래브에 계단 구멍, 코어 벽에 출입문, 코어 계단(병합 메시)
//  · 공정표가 바뀌어도 형상은 그대로, kit.retime()으로 시점만 갱신
// 좌표: x 동(+)/서(-), z 남(+, 전면도로)/북(-), y 위. 건물 중심이 원점.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PRJ, phaseByKey, floorY, roofY, base, lerp, C, plansByFloor } from './project.js';
import { zoneById, sunReq } from './law.js';
import { makeKit } from './kit.js';
import { metricUV } from './textures.js';
import { buildInterior } from './interior.js';
import { createElevator } from './elevator.js';
import { columnAxes, ENTRANCE_WIDTH, DOOR_FRAME, DOOR_OPEN_ANGLE } from './access.js';

const ROT = { S: 0, N: Math.PI, E: Math.PI / 2, W: -Math.PI / 2 };
const lu = (side, u) => (side === 'S' || side === 'W' ? u : -u);       // 월드 u → 벽 로컬 u
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * i / (n - 1));
const V2 = (x, y) => new THREE.Vector2(x, y);

// 개구부 있는 벽 단면 → 압출. 바닥에 닿는 문은 외곽선을 파내고, 창은 구멍(hole)으로
export function wallGeo(len, h, t, holes) {
  const doors = holes.filter(o => o.y <= 0.01).sort((a, b) => a.u - b.u);
  const pts = [[-len / 2, 0]];
  for (const d of doors) {
    const u0 = Math.max(-len / 2 + 0.05, d.u - d.w / 2), u1 = Math.min(len / 2 - 0.05, d.u + d.w / 2), y1 = Math.min(h - 0.05, d.h);
    pts.push([u0, 0], [u0, y1], [u1, y1], [u1, 0]);
  }
  pts.push([len / 2, 0], [len / 2, h], [-len / 2, h]);
  const s = new THREE.Shape(pts.map(([x, y]) => V2(x, y)));
  for (const o of holes) {
    if (o.y <= 0.01) continue;
    const u0 = o.u - o.w / 2, u1 = o.u + o.w / 2, y0 = o.y, y1 = Math.min(h - 0.05, o.y + o.h);
    if (y1 <= y0 || u0 < -len / 2 || u1 > len / 2) continue;
    s.holes.push(new THREE.Path([V2(u0, y0), V2(u1, y0), V2(u1, y1), V2(u0, y1)]));
  }
  return new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }).translate(0, 0, -t / 2);
}
// 구멍 뚫린 슬래브 (x0..x1, z0..z1) — 윗면이 y=0, 두께 t (아래로)
export function slabGeo(x0, z0, x1, z1, t, holes = []) {
  const s = new THREE.Shape([V2(x0, -z1), V2(x1, -z1), V2(x1, -z0), V2(x0, -z0)]);
  for (const [hx0, hz0, hx1, hz1] of holes) s.holes.push(new THREE.Path([V2(hx0, -hz1), V2(hx1, -hz1), V2(hx1, -hz0), V2(hx0, -hz0)]));
  return new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false }).rotateX(-Math.PI / 2).translate(0, -t, 0);
}

export function buildAll() {
  const T = PRJ.T, S = T.site, W = T.W, D = T.D, hw = W / 2, hd = D / 2;
  const K = makeKit(k => !!phaseByKey(k));
  const { mat, solid, box, cbox, cyl, merged, add, root } = K;
  const RC = T.structure === 'rc', BASE = base(), ROOF_Y = roofY();
  const slabT = RC ? 0.25 : 0.3;
  const nF = T.floors;
  const elevator = createElevator(K, T, floorY);
  const siteEnd = ['landscape', 0.3];

  // 벽·창 배치 도우미
  function place(g, side, u, y, off) {
    if (side === 'S') g.position.set(u, y, off);
    else if (side === 'N') g.position.set(u, y, -off);
    else if (side === 'E') g.position.set(off, y, u);
    else g.position.set(-off, y, u);
    g.rotation.y = ROT[side];
    return g;
  }
  const ops = (floor, side) => PRJ.openings.filter(o => o.floor === floor && o.side === side).map(o => ({ u: o.u, y: o.sill, w: o.w, h: o.h, door: !!o.door }));
  function sideWall(side, y0, h, t, off, m, holes, len) {
    const g = solid(wallGeo(len, h, t, holes.map(o => ({ ...o, u: lu(side, o.u) }))), m);
    return place(g, side, 0, y0, off);
  }
  // 창(유리+프레임) 또는 문(프레임+열린 문짝) — 바닥 중심 원점, +z가 바깥
  function win(w, h, { door = false, mullion = w > 1.5, leaf = 'oak', glassDoor = false } = {}) {
    const g = new THREE.Group();
    const f = DOOR_FRAME, dp = 0.09;
    if (!door) g.add(box(w - 0.04, h - 0.04, 0.03, 'glass', 0, 0.02, 0, { edges: false, cast: false }));
    g.add(box(w, f, dp, 'frame', 0, 0, 0), box(w, f, dp, 'frame', 0, h - f, 0));
    g.add(box(f, h, dp, 'frame', -w / 2 + f / 2, 0, 0), box(f, h, dp, 'frame', w / 2 - f / 2, 0, 0));
    if (!door && mullion) { const k = Math.max(1, Math.round(w / 1.6) - 1); for (let i = 1; i <= k; i++) g.add(box(f * 0.8, h, dp * 0.8, 'frame', -w / 2 + i * w / (k + 1), 0, 0)); }
    if (door) {                                  // 안쪽으로 80° 열린 문짝
      const hinge = new THREE.Group(); hinge.position.set(-w / 2 + f, 0, -0.02);
      const lw = w - 2 * f;
      hinge.add(glassDoor ? box(lw, h - f, 0.03, 'glass', lw / 2, 0, 0, { edges: false }) : box(lw, h - f, 0.045, leaf, lw / 2, 0, 0));
      hinge.rotation.y = DOOR_OPEN_ANGLE; g.add(hinge);
    }
    return g;
  }
  // 축 정렬 벽 + 문 구멍(gaps) → 벽 토막 + 문 위 인방 + 열린 문짝
  function segWall(x0, z0, x1, z1, y0, h, { t = 0.12, m = 'paint', gaps = [], doorH = 2.1, glass = false, leaves = true } = {}) {
    const alongX = Math.abs(z1 - z0) < 1e-6;
    const a0 = alongX ? Math.min(x0, x1) : Math.min(z0, z1), a1 = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
    const c = alongX ? z0 : x0;
    const out = [];
    const piece = (u0, u1, y, hh, mm, opts) => {
      const len = u1 - u0; if (len < 0.02 || hh < 0.02) return;
      const g = alongX ? box(len, hh, t, mm, (u0 + u1) / 2, y, c, opts) : box(t, hh, len, mm, c, y, (u0 + u1) / 2, opts);
      out.push(g);
    };
    const gs = gaps.map(([a, b]) => [Math.max(a0, Math.min(a, b)), Math.min(a1, Math.max(a, b))])
      .filter(([a, b]) => b - a > 0.02).sort((p, q) => p[0] - q[0]);
    let cur = a0;
    const wm = glass ? 'glass' : m;
    for (const [g0, g1] of gs) {
      piece(cur, g0, y0, h, wm, glass ? { edges: false, cast: false } : undefined);
      if (h > doorH + 0.05) piece(g0, g1, y0 + doorH, h - doorH, glass ? 'frame' : m);
      if (leaves && !glass) {
        const hinge = new THREE.Group(), lw = g1 - g0 - 0.04;
        hinge.add(box(lw, doorH - 0.02, 0.04, 'lacquer', lw / 2, 0, 0));
        if (alongX) { hinge.position.set(g0 + 0.02, y0, c); hinge.rotation.y = -1.45; }
        else { hinge.position.set(c, y0, g0 + 0.02); hinge.rotation.y = -Math.PI / 2 + 1.45; }
        out.push(hinge);
      }
      cur = g1;
    }
    piece(cur, a1, y0, h, wm, glass ? { edges: false, cast: false } : undefined);
    if (glass) {                                  // 유리벽 멀리언
      for (let u = a0; u <= a1 + 1e-6; u += 1.2) out.push(alongX ? box(0.05, h, 0.06, 'frame', u, y0, c) : box(0.06, h, 0.05, 'frame', c, y0, u));
      if (glass) out.push(alongX ? box(a1 - a0, 0.05, 0.06, 'frame', (a0 + a1) / 2, y0 + h - 0.05, c) : box(0.06, 0.05, a1 - a0, 'frame', c, y0 + h - 0.05, (a0 + a1) / 2));
    }
    return out;
  }

  // ════════════════════════════════════════════════════════════════════════
  // 0. 주변 (공정 무관): 지반·도로·인접 건물
  // ════════════════════════════════════════════════════════════════════════
  const pit = T.basement ? { x: hw + 1.2, z: hd + 1.2, depth: T.basement + 1.0 }
    : RC ? { x: hw + 0.8, z: hd + 0.8, depth: 1.5 } : { x: hw + 0.6, z: hd + 0.6, depth: 0.5 };
  const groundMat = mat(T.structure === 'timber' ? 'lawn' : 'earth', { noPoche: true });
  {
    const s = new THREE.Shape([V2(-150, -150), V2(150, -150), V2(150, 150), V2(-150, 150)]);
    s.holes.push(new THREE.Path([V2(-pit.x, -pit.z), V2(pit.x, -pit.z), V2(pit.x, pit.z), V2(-pit.x, pit.z)]));
    const ground = new THREE.Mesh(new THREE.ShapeGeometry(s).rotateX(-Math.PI / 2), groundMat);
    ground.receiveShadow = true; root.add(ground);
  }
  const cap = new THREE.Mesh(metricUV(new THREE.PlaneGeometry(pit.x * 2, pit.z * 2).rotateX(-Math.PI / 2)), groundMat);
  cap.receiveShadow = true; root.add(cap);
  const pitMesh = new THREE.Mesh(metricUV(new THREE.BoxGeometry(pit.x * 2, 1, pit.z * 2).translate(0, -0.5, 0)), mat('earth', { side: THREE.BackSide, noPoche: true }));
  pitMesh.receiveShadow = true; root.add(pitMesh);
  // 단면 장면용 지반 블록 (평소엔 숨김): 절단면에서 속이 보이도록 양면 + 흙 해칭 재질
  const earthCut = new THREE.Mesh(metricUV(new THREE.BoxGeometry(S.x1 - S.x0 + 60, 9, S.z1 - S.z0 + 40).translate(0, -4.52, (S.z0 + S.z1) / 2)), mat('earthCut', { side: THREE.DoubleSide, noPoche: true }));
  earthCut.visible = false; root.add(earthCut);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(300, 8).rotateX(-Math.PI / 2), mat('asphalt', { noPoche: true }));
  road.position.set(0, 0.01, S.z1 + 7); road.receiveShadow = true; root.add(road);
  for (const x of lin(-60, 60, 25)) {
    const ln = new THREE.Mesh(new THREE.PlaneGeometry(2.5, 0.15).rotateX(-Math.PI / 2), mat('line'));
    ln.position.set(x, 0.02, S.z1 + 7); root.add(ln);
  }
  if (T.structure === 'rc') {
    const nb = mat('white', { noPoche: true });
    [[S.x0 - 6.5, 11, 9.5], [S.x1 + 6.5, 11, 11], [S.x0 - 18, 10, 7], [S.x1 + 17.5, 9, 8.5]].forEach(([x, w, h]) => root.add(box(w, h, 12, nb, x, 0, -1.5)));
  }

  // ════════════════════════════════════════════════════════════════════════
  // A. 가설 — 울타리, 현장사무실 (조경 시작 무렵 철거)
  // ════════════════════════════════════════════════════════════════════════
  {
    const segs = [];
    const edge = (ax, az, bx, bz) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 3));
      for (let i = 0; i < n; i++) segs.push([ax + (bx - ax) * (i + 0.5) / n, az + (bz - az) * (i + 0.5) / n, L / n, Math.atan2(bz - az, bx - ax)]);
    };
    edge(S.x0, S.z1, S.x1, S.z1); edge(S.x1, S.z1, S.x1, S.z0); edge(S.x1, S.z0, S.x0, S.z0); edge(S.x0, S.z0, S.x0, S.z1);
    segs.forEach(([x, z, len, ang], i) => {
      if (Math.abs(z - S.z1) < 0.01 && x > -4 && x < 0.5) return;
      const g = box(len - 0.05, 2.0, 0.05, 'fence', x, 0, z, { cast: false });
      g.rotation.y = -ang;
      add(g, 'site', i / segs.length, 'rise', { until: siteEnd, ghost: false, hot: false, d: 0.2 });
    });
    add(box(6, 2.6, 2.4, 'cabin', S.x0 + 4, 0, S.z1 + 1.6), 'site', 0.7, 'drop', { h: 1.5, until: siteEnd, ghost: false });
  }

  // ════════════════════════════════════════════════════════════════════════
  // B. 흙막이·토공 (지하층 있을 때 H-PILE + 띠장)
  // ════════════════════════════════════════════════════════════════════════
  if (T.basement) {
    const piles = [];
    for (const x of lin(-pit.x, pit.x, Math.round(pit.x * 2 / 1.6))) piles.push([x, -pit.z], [x, pit.z]);
    for (const z of lin(-pit.z, pit.z, Math.round(pit.z * 2 / 1.6)).slice(1, -1)) piles.push([-pit.x, z], [pit.x, z]);
    add(merged(piles.map(([x, z]) => [0.3, pit.depth + 1.3, 0.3, x, -pit.depth - 0.8, z]), 'steel'), 'earth', 0.0, 'drop', { h: pit.depth + 2, d: 0.6, ghost: false, until: ['frame', 0.5] });
    [-1.6, -3.6].forEach((y, k) => add(merged([[pit.x * 2, 0.3, 0.3, 0, y, pit.z - 0.3], [pit.x * 2, 0.3, 0.3, 0, y, -pit.z + 0.3],
      [0.3, 0.3, pit.z * 2, pit.x - 0.3, y, 0], [0.3, 0.3, pit.z * 2, -pit.x + 0.3, y, 0]], 'steel'), 'earth', 0.55 + k * 0.25, 'show', { d: 0.3, ghost: false, until: ['sub', 3.5] }));
  }

  // ════════════════════════════════════════════════════════════════════════
  // C. 기초 · 되메우기
  // ════════════════════════════════════════════════════════════════════════
  {
    const matTop = T.basement ? -T.basement : RC ? -0.2 : BASE;
    add(box(W + 0.6, matTop + pit.depth, D + 0.6, 'concrete', 0, -pit.depth, 0), 'found', 0.1, 'rise', { d: 0.8 });
    if (!T.basement && RC) add(box(W, 0.2, D, 'concrete', 0, -0.2, 0), 'found', 0.75, 'rise', { d: 0.4 });
    const mz = pit.z - hd - 0.3, mx = pit.x - hw - 0.3;
    add(merged([[pit.x * 2, pit.depth - 0.02, mz, 0, -pit.depth, (hd + 0.3 + pit.z) / 2], [pit.x * 2, pit.depth - 0.02, mz, 0, -pit.depth, -(hd + 0.3 + pit.z) / 2],
      [mx, pit.depth - 0.02, D + 0.6, (hw + 0.3 + pit.x) / 2, -pit.depth, 0], [mx, pit.depth - 0.02, D + 0.6, -(hw + 0.3 + pit.x) / 2, -pit.depth, 0]], 'gravel', { edges: false, cast: false }, [0, -pit.depth, 0]),
      T.basement ? 'sub' : 'found', 0.95, 'rise', { d: 0.4, ghost: false, hot: false });
  }

  // ════════════════════════════════════════════════════════════════════════
  // D. 지하골조 (꼬마빌딩)
  // ════════════════════════════════════════════════════════════════════════
  const { xs, zs, width: colS } = columnAxes(T);
  if (T.basement) {
    const y0 = -T.basement, h = T.basement - 0.25;
    add(box(W, h, 0.35, 'concrete', 0, y0, hd - 0.175), 'sub', 0.0, 'rise');
    add(box(W, h, 0.35, 'concrete', 0, y0, -hd + 0.175), 'sub', 0.12, 'rise');
    add(box(0.35, h, D, 'concrete', hw - 0.175, y0, 0), 'sub', 0.24, 'rise');
    add(box(0.35, h, D, 'concrete', -hw + 0.175, y0, 0), 'sub', 0.36, 'rise');
    add(merged(xs.slice(1, -1).map(x => [colS, h, colS, x, y0, 0]), 'concrete', undefined, [0, y0, 0]), 'sub', 0.45, 'rise');
    add(solid(slabGeo(-hw, -hd, hw, hd, 0.25), 'concrete'), 'sub', 0.75, 'drop', { lift: true });
  }

  // ════════════════════════════════════════════════════════════════════════
  // E. 지상골조
  // ════════════════════════════════════════════════════════════════════════
  const KC = T.core;
  for (let n = 1; n <= nF; n++) {
    const y0 = floorY(n), y1 = floorY(n + 1), h = y1 - y0 - slabT;
    const o0 = (n - 1) / nF, step = 1 / nF;
    if (RC) {
      const cols = [];
      for (const x of xs) for (const z of zs) {
        // 가운데 줄 기둥은 필로티층에서만 (상부 주택·객실층은 벽식 — 복도 한가운데 기둥이 서지 않게)
        if (z === 0 && x !== xs[0] && x !== xs[xs.length - 1] && !(T.piloti && n === 1)) continue;
        cols.push([colS, h, colS, x, y0, z]);
      }
      add(merged(cols, 'concrete', undefined, [0, y0, 0]), 'frame', o0, 'rise', { d: 0.5 });
      // 코어 벽 (출입문 포함)
      const isP1 = T.piloti && n === 1;
      const fGaps = KC.frontDoor ? [KC.frontDoor] : (isP1 && KC.frontDoor1 ? [KC.frontDoor1] : []);
      const front = segWall(KC.x0, KC.z1, KC.x1, KC.z1, y0, h, { t: 0.2, m: 'concrete', gaps: fGaps, leaves: false });
      const eGaps = KC.doorEast ? [KC.doorEast] : (KC.doorsSide && n >= 2 ? [[-2.0, -1.1]] : []);
      const east = segWall(KC.x1, KC.z0, KC.x1, KC.z1, y0, h, { t: 0.2, m: 'concrete', gaps: eGaps, leaves: false });
      const west = KC.doorsSide ? segWall(KC.x0, KC.z0, KC.x0, KC.z1, y0, h, { t: 0.2, m: 'concrete', gaps: n >= 2 ? [[-2.0, -1.1]] : [], leaves: false }) : [];
      [...front, ...east, ...west].forEach((g, i) => add(g, 'frame', o0 + step * (0.3 + i * 0.02), 'rise', { d: 0.5 }));
      // 코어 계단 (층마다 2개 비행 + 참)
      if (n < nF + 1) {
        const st = KC.stair, H = y1 - y0, half = H / 2, N = Math.max(6, Math.round(half / 0.17)), r = half / N;
        const L = st.zHigh - st.zLow, tr = L / N, boxes = [];
        for (let i = 0; i < N; i++) {
          boxes.push([st.w, r * (i + 1), Math.abs(tr), st.xa, y0, st.zLow + tr * (i + 0.5)]);
          boxes.push([st.w, r * (i + 1), Math.abs(tr), st.xb, y0 + half, st.zHigh - tr * (i + 0.5)]);
        }
        const [lx0, lz0, lx1, lz1] = st.landing;
        boxes.push([lx1 - lx0, 0.2, lz1 - lz0, (lx0 + lx1) / 2, y0 + half - 0.2, (lz0 + lz1) / 2]);
        if (n < nF) add(merged(boxes, 'concrete', undefined, [0, y0, 0]), 'frame', o0 + step * 0.45, 'rise', { d: 0.5 });
      }
      elevator.installLanding(n);
      // 슬래브 (계단 구멍)
      add(solid(slabGeo(-hw, -hd, hw, hd, slabT, [KC.hole, KC.ev]).translate(0, y1, 0), 'concrete'), 'frame', o0 + step * 0.65, 'drop', { lift: true, d: 0.6 });
    } else {
      // 경량목구조: 벽 4면을 개구부와 함께 세운다 (OSB 마감 스터드 벽)
      const t = 0.17, wallH = y1 - y0 - (n < nF ? slabT : 0);
      [['S', hd - t / 2, W], ['E', hw - t / 2, D - 2 * t], ['N', hd - t / 2, W], ['W', hw - t / 2, D - 2 * t]].forEach(([side, off, len], i) =>
        add(sideWall(side, y0, wallH, t, off, 'osb', ops(n, side), len), 'frame', o0 + step * 0.15 * i, 'rise', { d: 0.4 }));
      if (n < nF) add(solid(slabGeo(-hw, -hd, hw, hd, slabT, [T.hole2]).translate(0, y1, 0), 'osb'), 'frame', o0 + step * 0.7, 'drop', { h: 1.5, d: 0.4 });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // F. 지붕
  // ════════════════════════════════════════════════════════════════════════
  if (T.roof === 'flat') {
    const pH = 1.0, t = 0.2;
    add(merged([[W, pH, t, 0, ROOF_Y, hd - t / 2], [W, pH, t, 0, ROOF_Y, -hd + t / 2], [t, pH, D - 2 * t, hw - t / 2, ROOF_Y, 0], [t, pH, D - 2 * t, -hw + t / 2, ROOF_Y, 0]], 'concrete', undefined, [0, ROOF_Y, 0]), 'roof', 0.0, 'rise');
    add(box(KC.x1 - KC.x0, 3.0, KC.z1 - KC.z0, 'stucco', (KC.x0 + KC.x1) / 2, ROOF_Y, (KC.z0 + KC.z1) / 2), 'roof', 0.35, 'rise');
    add(box(W - 0.45, 0.03, D - 0.45, 'proof', 0, ROOF_Y, 0, { edges: false }), 'roof', 0.75, 'show', { ghost: false });
  } else {
    const th = Math.PI / 6, rise = hd * Math.tan(th), over = 0.5, ov2 = 0.4, L = (hd + over) / Math.cos(th);
    const tri = new THREE.Shape([V2(-hd, 0), V2(hd, 0), V2(0, rise)]);
    [hw - 0.17, -hw].forEach((x, i) => {
      const g = solid(new THREE.ExtrudeGeometry(tri, { depth: 0.17, bevelEnabled: false }), 'osb');
      g.position.set(x, ROOF_Y, 0); g.rotation.y = Math.PI / 2;
      add(g, 'roof', 0.05 + i * 0.05, 'rise', { d: 0.4 });
    });
    [1, -1].forEach((sd, k) => {
      const zc = sd * (hd + over) / 2, yc = ROOF_Y + rise - ((hd + over) / 2) * Math.tan(th);
      const n = Math.round((W + 2 * ov2) / 0.9);
      lin(-hw - ov2 + 0.1, hw + ov2 - 0.1, n).forEach((x, i) =>
        add(cbox(0.06, 0.2, L, 'stud', x, yc - 0.12, zc, sd * th), 'roof', 0.15 + 0.3 * i / n + k * 0.02, 'drop', { h: 1, d: 0.25, ghost: false }));
      add(cbox(W + 2 * ov2, 0.03, L, 'osb', 0, yc, zc, sd * th), 'roof', 0.55 + k * 0.05, 'drop', { h: 0.8, d: 0.35 });
      add(cbox(W + 2 * ov2, 0.04, L + 0.02, 'zincDk', 0, yc + 0.04, zc, sd * th), 'roof', 0.8 + k * 0.05, 'show', { d: 0.3, ghost: false });
      // 처마 후레싱(흰 판) · 박공 끝 판
      add(box(W + 2 * ov2 + 0.04, 0.24, 0.05, 'trim', 0, ROOF_Y - over * Math.tan(th) - 0.2, sd * (hd + over + 0.02)), 'roof', 0.9, 'show', { d: 0.3, ghost: false });
      [hw + ov2 + 0.02, -hw - ov2 - 0.02].forEach(x => add(cbox(0.05, 0.24, L + 0.04, 'trim', x, yc - 0.02, zc, sd * th), 'roof', 0.92, 'show', { d: 0.3, ghost: false }));
    });
    add(box(W + 2 * ov2, 0.1, 0.34, 'zincDk', 0, ROOF_Y + rise - 0.02, 0), 'roof', 0.95, 'show', { d: 0.3, ghost: false });   // 용마루
  }

  // ════════════════════════════════════════════════════════════════════════
  // G. 조적 (RC) — 개구부 있는 블록 외벽
  // ════════════════════════════════════════════════════════════════════════
  if (RC) {
    for (let n = 1; n <= nF; n++) {
      if (T.piloti && n === 1) {                                       // 필로티층은 북측 벽만
        add(sideWall('N', 0, T.f1 - slabT, 0.2, hd - 0.1, 'block', ops(1, 'N'), W), 'masonry', 0, 'rise', { d: 0.6 });
        continue;
      }
      const y0 = floorY(n), h = floorY(n + 1) - y0 - slabT, o = (n - 1) / nF;
      const sides = T.storefront ? ['E', 'N', 'W'] : ['S', 'E', 'N', 'W'];
      sides.forEach((side, i) => {
        const ns = side === 'S' || side === 'N';
        add(sideWall(side, y0, h, 0.2, (ns ? hd : hw) - 0.1, 'block', ops(n, side), ns ? W : D - 0.4), 'masonry', o + i * 0.02, 'rise', { d: 0.6 });
      });
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  // H. 창호  ·  I. 외장 — 같은 개구부 표에서
  // ════════════════════════════════════════════════════════════════════════
  const wallOff = RC ? 0.1 : 0.085;
  for (const o of PRJ.openings) {
    if (T.piloti && o.floor === 1 && o.side !== 'N') continue;
    if (o.open) continue;                                       // 트인 개구부(전원주택 윙 연결부)는 창 없이
    const ns = o.side === 'S' || o.side === 'N';
    const g = place(win(o.w, o.h, { door: o.door }), o.side, o.u, floorY(o.floor) + o.sill, (ns ? hd : hw) - wallOff);
    add(g, 'window', (o.floor - 1) / nF + 0.05, 'rise', { ghost: o.side === 'S' || o.side === 'E' });
  }
  const clad = (side, n, m, h, ghost = true) => {
    const ns = side === 'S' || side === 'N';
    const y0 = floorY(n);
    return add(sideWall(side, y0, h ?? floorY(n + 1) - y0, 0.08, (ns ? hd : hw) + 0.04, m, ops(n, side), ns ? W + 0.16 : D), 'facade', (n - 1) / nF + 0.02, 'rise', { ghost });
  };

  // 1층 상가 유리면: 출입문(frontDoors) 사이를 유리로 채운다 (배율이 바뀌어도 문 위치를 따라감)
  function storefront(doors, h) {
    const a0 = -hw + 0.6, a1 = hw - 0.6, dw = ENTRANCE_WIDTH; let cur = a0, k = 0;
    const seg = (u0, u1) => { if (u1 - u0 > 0.3) add(place(win(u1 - u0, h), 'S', (u0 + u1) / 2, 0.1, hd - 0.05), 'window', 0.01 * k++, 'rise'); };
    for (const dx of [...doors].sort((a, b) => a - b)) {
      seg(cur, dx - dw / 2);
      add(place(win(dw, 2.4, { door: true, glassDoor: true }), 'S', dx, 0, hd - 0.05), 'window', 0.03, 'rise');
      add(box(dw, h + 0.1 - 2.5, 0.06, 'glass', dx, 2.5, hd - 0.05, { edges: false }), 'window', 0.03, 'rise', { ghost: false });
      cur = dx + dw / 2;
    }
    seg(cur, a1);
  }
  if (T.style === 'storefront') {
    // 1층 상가 유리면(문 포함) + 화강석 띠 / 2층 이상 띠창 + 스팬드럴
    const sh = T.f1 - 0.9;
    storefront(T.frontDoors || [3.6], sh - 0.1);
    for (let n = 2; n <= nF; n++) {
      const y0 = floorY(n), o = (n - 1) / nF;
      add(place(win(W - 1.2, T.ft - 1.5), 'S', 0, y0 + 0.9, hd - 0.05), 'window', o, 'rise');
      add(merged([[W, 0.9, 0.08, 0, y0, hd + 0.04], [W, 0.6, 0.08, 0, y0 + T.ft - 0.6, hd + 0.04],
        [0.6, T.ft, 0.12, -hw + 0.3, y0, hd + 0.06], [0.6, T.ft, 0.12, hw - 0.3, y0, hd + 0.06]], 'granite', undefined, [0, y0, 0]), 'facade', o, 'rise');
      clad('E', n, 'granite'); clad('W', n, 'stucco', undefined, false); clad('N', n, 'stucco', undefined, false);
    }
    add(box(W, 0.9, 0.1, 'granite', 0, sh, hd + 0.05), 'facade', 0.0, 'rise');
    add(merged([[0.6, sh, 0.14, -hw + 0.3, 0, hd + 0.07], [0.6, sh, 0.14, hw - 0.3, 0, hd + 0.07]], 'graniteDk'), 'facade', 0.01, 'rise', { ghost: false });
    clad('E', 1, 'granite'); clad('W', 1, 'stucco', undefined, false); clad('N', 1, 'stucco', undefined, false);
  } else if (T.style === 'curtain') {
    // 중소형 빌딩: 1층 로비·근생 유리면 + 출입문 / 2층 이상 바닥~천장 커튼월 + 층간 스팬드럴(어두운 판)
    const sh = T.f1 - 0.6;
    storefront(T.frontDoors || [0], sh - 0.1);
    add(box(W, 0.6, 0.1, 'granite', 0, sh, hd + 0.05), 'facade', 0.0, 'rise');
    add(merged([[0.6, sh, 0.14, -hw + 0.3, 0, hd + 0.07], [0.6, sh, 0.14, hw - 0.3, 0, hd + 0.07]], 'graniteDk'), 'facade', 0.01, 'rise', { ghost: false });
    const len = W - 0.6, nM = Math.max(2, Math.round(len / 1.5));
    for (let n = 2; n <= nF; n++) {
      const y0 = floorY(n), h = floorY(n + 1) - y0, o = (n - 1) / nF, zc = hd - 0.05;
      add(box(len, h - 0.75, 0.03, 'glass', 0, y0 + 0.05, zc, { edges: false, cast: false }), 'window', o, 'rise');
      const mull = []; for (let i = 0; i <= nM; i++) mull.push([0.06, h, 0.14, -len / 2 + i * len / nM, y0, zc + 0.04]);
      mull.push([len, 0.06, 0.14, 0, y0 + h - 0.75, zc + 0.04]);
      add(merged(mull, 'frame', undefined, [0, y0, 0]), 'window', o + 0.01, 'rise');
      add(box(len, 0.7, 0.04, 'black', 0, y0 + h - 0.7, zc + 0.02, { edges: false }), 'facade', o, 'rise', { ghost: false });
      add(merged([[0.3, h, 0.2, -hw + 0.15, y0, hd + 0.02], [0.3, h, 0.2, hw - 0.15, y0, hd + 0.02]], 'granite', undefined, [0, y0, 0]), 'facade', o + 0.01, 'rise', { ghost: false });
      clad('E', n, 'granite'); clad('W', n, 'stucco', undefined, false); clad('N', n, 'stucco', undefined, false);
    }
    clad('E', 1, 'granite'); clad('W', 1, 'stucco', undefined, false); clad('N', 1, 'stucco', undefined, false);
  } else if (T.piloti) {
    const cm = T.cladMat || 'brick';
    for (let n = 2; n <= nF; n++) ['S', 'E', 'N', 'W'].forEach(side => clad(side, n, cm, undefined, side === 'S' || side === 'E'));
    add(merged(xs.map(x => [colS + 0.12, T.f1 - slabT, colS + 0.12, x, 0, hd - 0.3]), 'graniteDk'), 'facade', 0.9, 'rise', { ghost: false, d: 0.3 });
    const fd = KC.frontDoor1 || KC.frontDoor || [-0.6, 0.6];
    add(place(win(fd[1] - fd[0], 2.3, { door: true, glassDoor: true }), 'S', (fd[0] + fd[1]) / 2, 0, KC.z1), 'window', 0.95, 'rise', { ghost: false, d: 0.3 });
    for (let n = 2; n <= nF; n++) add(box(W - 1, 0.08, 0.06, 'steel', 0, floorY(n) + T.ft - 0.25, hd + 0.11), 'facade', (n - 1) / nF + 0.05, 'show', { ghost: false });
  } else {
    // 전원주택: 석재 기단 + 적삼목 + 스타코
    // 1층: 남·서 자연석 판석, 동·북 스타코 / 2층: 남·북 적삼목, 동·서 스타코 / 박공: 적삼목
    ['S', 'E', 'N', 'W'].forEach(side => clad(side, 1, side === 'S' || side === 'W' ? 'stone' : 'stucco', T.f1, side === 'S' || side === 'E'));
    ['S', 'E', 'N', 'W'].forEach(side => clad(side, 2, side === 'S' || side === 'N' ? 'cedar' : 'stucco', ROOF_Y - floorY(2), side === 'S' || side === 'E'));
    const rise = hd * Math.tan(Math.PI / 6);
    const tri = new THREE.Shape([V2(-hd, 0), V2(hd, 0), V2(0, rise)]);
    [hw, -hw - 0.06].forEach((x, i) => {
      const g = solid(new THREE.ExtrudeGeometry(tri, { depth: 0.06, bevelEnabled: false }), 'cedar');
      g.position.set(x, ROOF_Y, 0); g.rotation.y = Math.PI / 2;
      add(g, 'facade', 0.6 + i * 0.05, 'rise', { ghost: i === 0 });
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // K. 전원주택 디테일 — 전면 박공 윙 · 현관 포치 + 2층 발코니 · 석재 굴뚝
  //    (types.js의 wing / porch / chimney. 본체 12×8 박스 밖으로 붙는 부재들)
  // ════════════════════════════════════════════════════════════════════════
  const TH = Math.PI / 6, TAN = Math.tan(TH);
  if (T.wing) {
    const wg = T.wing, wx0 = wg.x0, wx1 = wg.x1, ww = wx1 - wx0, wcx = (wx0 + wx1) / 2, z0w = hd, z1w = hd + wg.depth, wcz = (z0w + z1w) / 2, tW = 0.17;
    add(box(ww + 0.3, 0.8, wg.depth + 0.15, 'concrete', wcx, -0.5, wcz + 0.075), 'found', 0.5, 'rise', { d: 0.6 });
    // 윙 개구부 (월드 좌표 c: S면은 x, E·W면은 z)
    const WO = { S1: [{ c: wcx, y: 0.1, w: 3.8, h: 2.3 }], S2: [{ c: wcx, y: 0.45, w: 2.6, h: 1.6 }],
                 E1: [{ c: wcz + 0.1, y: 0.8, w: 1.0, h: 1.5 }], W1: [{ c: wcz + 0.1, y: 0.8, w: 1.0, h: 1.5 }], E2: [], W2: [{ c: wcz, y: 0.9, w: 0.8, h: 1.1 }] };
    // side: S/E/W · inset: 벽 중심이 윙 외곽선에서 안쪽으로 얼마나 (음수면 바깥)
    const wingWall = (side, n, t, inset, m, h, key, order, opt = {}) => {
      const y0 = floorY(n), holes = WO[side + n] || [];
      let g;
      if (side === 'S') {
        g = solid(wallGeo(ww - 2 * Math.max(0, inset - t / 2) + (inset < 0 ? 2 * -inset + t : 0), h, t, holes.map(o => ({ u: o.c - wcx, y: o.y, w: o.w, h: o.h }))), m);
        g.position.set(wcx, y0, z1w - inset);
      } else {
        const x = side === 'E' ? wx1 - inset : wx0 + inset, zc = inset > 0 ? (z0w + z1w - 2 * inset) / 2 : wcz, len = inset > 0 ? wg.depth - 2 * inset : wg.depth;
        g = solid(wallGeo(len, h, t, holes.map(o => ({ u: side === 'E' ? -(o.c - zc) : o.c - zc, y: o.y, w: o.w, h: o.h }))), m);
        g.position.set(x, y0, zc); g.rotation.y = ROT[side];
      }
      return add(g, key, order, 'rise', { d: 0.4, ...opt });
    };
    for (let n = 1; n <= nF; n++) {
      const y0 = floorY(n), o0 = (n - 1) / nF, full = (n < nF ? floorY(n + 1) : ROOF_Y) - y0, frameH = full - (n < nF ? slabT : 0);
      ['S', 'E', 'W'].forEach((sd, i) => wingWall(sd, n, tW, tW / 2, 'osb', frameH, 'frame', o0 + 0.1 * i));                                       // 구조벽
      ['S', 'E', 'W'].forEach((sd, i) => wingWall(sd, n, 0.08, -0.04, n === 1 ? 'stone' : 'stucco', full, 'facade', o0 + 0.05 + 0.02 * i, { ghost: sd !== 'W' }));   // 외장
      ['S', 'E', 'W'].forEach(sd => wingWall(sd, n, 0.015, tW + 0.01, 'paint', frameH - (n === nF ? 0.28 : 0), 'interior', 0.3, { ghost: false, hot: false }));   // 실내 마감
      // 창
      for (const sd of ['S', 'E', 'W']) for (const o of WO[sd + n] || []) {
        const wgp = win(o.w, o.h);
        if (sd === 'S') wgp.position.set(o.c, y0 + o.y, z1w - tW / 2);
        else { wgp.position.set(sd === 'E' ? wx1 - tW / 2 : wx0 + tW / 2, y0 + o.y, o.c); wgp.rotation.y = ROT[sd]; }
        add(wgp, 'window', o0 + 0.1, 'rise', { ghost: sd === 'S' });
      }
      if (n < nF) add(box(ww, slabT, wg.depth, 'osb', wcx, floorY(n + 1) - slabT, wcz), 'frame', o0 + 0.6, 'drop', { h: 1.2, d: 0.4 });
    }
    // 줄리엣 발코니 (2층 남측 창 앞)
    add(merged([[2.8, 0.95, 0.03, wcx, floorY(2) + 0.05, z1w + 0.16]], 'glass', { edges: false }), 'facade', 0.7, 'rise', { ghost: false });
    add(merged([[2.9, 0.05, 0.06, wcx, floorY(2) + 1.0, z1w + 0.16], [0.05, 1.0, 0.05, wcx - 1.42, floorY(2) + 0.02, z1w + 0.16], [0.05, 1.0, 0.05, wcx + 1.42, floorY(2) + 0.02, z1w + 0.16]], 'steel'), 'facade', 0.72, 'rise', { ghost: false });
    // 윙 박공 지붕 (용마루가 남북 방향) — 본체 지붕 속으로 1.7m 파고들어 만난다
    const rise = (ww / 2) * TAN, ov = 0.45, zB = hd - 1.7, zF = z1w + ov, Lz = zF - zB, Lw = (ww / 2 + ov) / Math.cos(TH);
    const tri = new THREE.Shape([V2(-ww / 2, 0), V2(ww / 2, 0), V2(0, rise)]);
    const gF = solid(new THREE.ExtrudeGeometry(tri, { depth: tW, bevelEnabled: false }), 'osb'); gF.position.set(wcx, ROOF_Y, z1w - tW); add(gF, 'roof', 0.1, 'rise', { d: 0.4 });
    const gC = solid(new THREE.ExtrudeGeometry(tri, { depth: 0.06, bevelEnabled: false }), 'cedar'); gC.position.set(wcx, ROOF_Y, z1w + 0.005); add(gC, 'facade', 0.85, 'rise');
    add(place(win(0.9, 0.7), 'S', wcx, ROOF_Y + 0.22, z1w + 0.075), 'window', 0.9, 'rise');
    [1, -1].forEach((sd, k) => {
      const xc = wcx + sd * (ww / 2 + ov) / 2, yc = ROOF_Y + rise - ((ww / 2 + ov) / 2) * TAN;
      const plane = (m, t, dy, key, order, how) => { const g = solid(new THREE.BoxGeometry(Lw, t, Lz), m); g.children.forEach(c => (c.rotation.z = -sd * TH)); g.position.set(xc, yc + dy, (zB + zF) / 2); add(g, key, order, how, { h: 0.8, d: 0.35, ghost: how !== 'show' }); };
      plane('osb', 0.03, 0, 'roof', 0.6 + k * 0.04, 'drop');
      plane('zincDk', 0.04, 0.04, 'roof', 0.82 + k * 0.04, 'show');
      const rk = solid(new THREE.BoxGeometry(Lw + 0.04, 0.24, 0.05), 'trim'); rk.children.forEach(c => (c.rotation.z = -sd * TH)); rk.position.set(xc, yc - 0.02, zF + 0.02);
      add(rk, 'roof', 0.93, 'show', { d: 0.3, ghost: false });
    });
    add(box(0.32, 0.1, Lz, 'zincDk', wcx, ROOF_Y + rise - 0.02, (zB + zF) / 2), 'roof', 0.96, 'show', { d: 0.3, ghost: false });
    add(box(ww * 0.95, 0.35, 0.7, 'flower', wcx, 0, z1w + 0.75, { edges: false }), 'landscape', 0.4, 'grow', { ghost: false });
  }
  if (T.porch) {
    const pc = T.porch, px = pc.x1 - pc.x0, pcx = (pc.x0 + pc.x1) / 2, pz1 = hd + pc.depth, pcz = (hd + pz1) / 2, y2 = floorY(2);
    add(box(px, BASE, pc.depth, 'stone', pcx, 0, pcz), 'found', 0.85, 'rise', { d: 0.4 });                                   // 석재 기단
    add(merged([[1.9, 0.2, 0.36, 2.2, 0, pz1 + 0.18], [1.9, 0.1, 0.36, 2.2, 0, pz1 + 0.54]], 'stone'), 'found', 0.9, 'rise', { d: 0.3, ghost: false });   // 계단
    const posts = [[pc.x0 + 0.2, pz1 - 0.2], [pc.x1 - 0.2, pz1 - 0.2]];
    add(merged(posts.map(([x, z]) => [0.42, 0.55, 0.42, x, BASE, z]), 'stone'), 'frame', 0.55, 'rise', { d: 0.3 });
    add(merged(posts.map(([x, z]) => [0.22, y2 - 0.3 - BASE - 0.55, 0.22, x, BASE + 0.55, z]), 'cedar', undefined, [0, BASE + 0.55, 0]), 'frame', 0.6, 'rise', { d: 0.4 });
    add(box(px, 0.3, pc.depth, 'cedar', pcx, y2 - 0.3, pcz), 'frame', 0.75, 'drop', { h: 1.2, d: 0.4 });                      // 발코니 바닥 = 포치 천장
    add(box(px + 0.06, 0.32, 0.05, 'trim', pcx, y2 - 0.31, pz1 + 0.03), 'facade', 0.6, 'rise', { ghost: false });
    add(box(px - 0.1, 0.03, pc.depth - 0.1, 'deck', pcx, y2, pcz, { edges: false }), 'facade', 0.62, 'show', { ghost: false });
    add(merged([[px - 0.1, 0.95, 0.03, pcx, y2 + 0.05, pz1 - 0.06], [0.03, 0.95, pc.depth - 0.1, pc.x1 - 0.06, y2 + 0.05, pcz], [0.03, 0.95, pc.depth - 0.1, pc.x0 + 0.06, y2 + 0.05, pcz]], 'glass', { edges: false }), 'facade', 0.66, 'rise', { ghost: false });
    add(merged([[px, 0.05, 0.06, pcx, y2 + 1.0, pz1 - 0.06], [0.06, 0.05, pc.depth, pc.x1 - 0.06, y2 + 1.0, pcz], [0.06, 0.05, pc.depth, pc.x0 + 0.06, y2 + 1.0, pcz]], 'steel'), 'facade', 0.68, 'rise', { ghost: false });
    add(box(0.35, 0.04, 0.35, 'lamp', 2.2, y2 - 0.34, pcz, { edges: false, cast: false }), 'interior', 0.7, 'show', { ghost: false, hot: false });   // 포치 천장등
    add(box(px * 0.9, 0.35, 0.6, 'flower', pcx + 0.6, 0, pz1 + 0.9, { edges: false }), 'landscape', 0.45, 'grow', { ghost: false });
  }
  if (T.chimney) {
    const cx = -hw - 0.6, cz = T.chimney.z, top = ROOF_Y + hd * TAN + 1.0;
    [[0, floorY(2)], [floorY(2), ROOF_Y], [ROOF_Y, top]].forEach(([a, b], i) => add(box(0.95, b - a, 1.15, 'stone', cx, a, cz), 'facade', 0.3 + i * 0.1, 'rise', { d: 0.4 }));
    add(box(1.15, 0.12, 1.35, 'concrete', cx, top, cz), 'facade', 0.65, 'show', { ghost: false });
    add(box(0.28, 0.5, 0.28, 'black', cx, top + 0.12, cz), 'facade', 0.66, 'show', { ghost: false });
  }

  // 정원 (전원주택): 석재 담장·대문, 진입 주차, 디딤돌, 수영장, 퍼걸러, 산울타리, 정원등
  function gardenLandscape(tree) {
    const zw = S.z1 - 0.3, gate = [1.0, 4.4], drive = [-11.6, -5.4];
    [[S.x0 + 0.3, drive[0]], [drive[1], gate[0]], [gate[1], S.x1 - 0.3]].forEach(([a, b], i) =>
      add(box(b - a, 0.9, 0.35, 'stone', (a + b) / 2, 0, zw), 'landscape', 0.1 + i * 0.03, 'rise', { ghost: false }));
    [gate[0], gate[1], drive[0], drive[1]].forEach((x, i) => {
      add(box(0.55, 1.35, 0.55, 'stone', x, 0, zw), 'landscape', 0.2 + i * 0.01, 'rise', { ghost: false });
      add(box(0.65, 0.08, 0.65, 'trim', x, 1.35, zw), 'landscape', 0.22, 'show', { ghost: false });
    });
    add(box(drive[1] - drive[0], 0.04, S.z1 - hd - 2.0, 'paving', (drive[0] + drive[1]) / 2, 0, (S.z1 + hd + 2.0) / 2, { edges: false, cast: false }), 'landscape', 0.05, 'show', { ghost: false });
    const z0p = hd + (T.porch?.depth ?? 2) + 0.9;
    for (let z = zw - 0.8, i = 0; z > z0p; z -= 0.95, i++) add(box(0.95, 0.05, 0.55, 'paving', 2.4 + (i % 2 ? 0.12 : -0.12), 0, z, { cast: false }), 'landscape', 0.15 + i * 0.01, 'show', { ghost: false });
    // 정원등 (길 양쪽)
    for (let z = zw - 1.5; z > z0p; z -= 2.4) [1.5, 3.3].forEach(x => {
      add(box(0.1, 0.8, 0.1, 'black', x, 0, z), 'landscape', 0.55, 'show', { ghost: false });
      add(box(0.18, 0.16, 0.18, 'lamp', x, 0.8, z, { edges: false }), 'landscape', 0.56, 'show', { ghost: false });
    });
    if (T.pool) {
      const p = T.pool, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, w = p.x1 - p.x0, d = p.z1 - p.z0;
      add(box(w + 1.4, 0.06, d + 1.4, 'paving', cx, 0, cz, { cast: false }), 'landscape', 0.3, 'show', { ghost: false });
      add(merged([[w + 0.5, 0.14, 0.25, cx, 0, p.z0 - 0.125], [w + 0.5, 0.14, 0.25, cx, 0, p.z1 + 0.125], [0.25, 0.14, d, p.x0 - 0.125, 0, cz], [0.25, 0.14, d, p.x1 + 0.125, 0, cz]], 'trim'), 'landscape', 0.32, 'rise', { ghost: false });
      add(box(w, 0.04, d, 'water', cx, 0.04, cz, { edges: false, cast: false }), 'landscape', 0.35, 'show', { ghost: false });
      add(box(1.8, 0.14, d + 1.4, 'deck', p.x1 + 1.6, 0, cz), 'landscape', 0.34, 'rise', { ghost: false });
    }
    if (T.pergola) {
      const g = T.pergola, cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2, w = g.x1 - g.x0, d = g.z1 - g.z0;
      add(box(w + 0.8, 0.08, d + 0.8, 'stone', cx, 0, cz, { cast: false }), 'landscape', 0.4, 'show', { ghost: false });
      add(merged([[g.x0, g.z0], [g.x1, g.z0], [g.x0, g.z1], [g.x1, g.z1]].map(([x, z]) => [0.16, 2.5, 0.16, x, 0, z]), 'cedar'), 'landscape', 0.42, 'rise', { ghost: false });
      add(merged([[w + 0.6, 0.2, 0.1, cx, 2.5, g.z0], [w + 0.6, 0.2, 0.1, cx, 2.5, g.z1]], 'cedar'), 'landscape', 0.45, 'show', { ghost: false });
      add(merged(lin(g.x0 - 0.2, g.x1 + 0.2, 10).map(x => [0.06, 0.14, d + 0.6, x, 2.7, cz]), 'cedar'), 'landscape', 0.47, 'show', { ghost: false });
    }
    // 산울타리 (좌우 경계)
    [S.x0 + 0.7, S.x1 - 0.7].forEach((x, i) => add(box(0.9, 1.15, S.z1 - S.z0 - 3.0, 'hedge', x, 0, (S.z0 + S.z1) / 2 - 1.0, { edges: false }), 'landscape', 0.25 + i * 0.02, 'grow', { ghost: false }));
    tree(-13.0, 8.5, 1.1, 0); tree(13.2, 9.0, 1.0, 1); tree(-12.0, -8.5, 1.35, 2); tree(10.5, -8.2, 1.2, 3); tree(14.0, -3.0, 0.9, 4); tree(-5.0, -9.5, 1.05, 5); tree(6.5, 9.2, 0.75, 6);
  }

  // ════════════════════════════════════════════════════════════════════════
  // S. 현장 장비·가설재 (04·05 참고) — 굴착기·덤프트럭·흙더미·기초 철근·동바리·비계와 분진망·자재 팔레트·작업자
  //    모두 공정에 묶여 나타나고(until로) 사라진다. 준공 장면·입면 도면에는 나오지 않는다.
  // ════════════════════════════════════════════════════════════════════════
  const yellow = mat('crane'), dark = mat('black'), rust = mat('steel', { color: 0x8a4b2b });
  const grp = (parts, x, z, ry = 0, y = 0) => { const g = new THREE.Group(); parts.forEach(q => g.add(q)); g.position.set(x, y, z); g.rotation.y = ry; return g; };
  // 굴착기: 무한궤도 · 상부선회체 · 운전석 · 붐 · 암 · 버킷 (붐은 구덩이를 향함)
  function excavator(x, z, ry) {
    const boom = new THREE.Group(); boom.position.set(0.5, 1.6, 0);
    boom.add(box(3.6, 0.45, 0.45, yellow, 1.8, 0, 0)); boom.rotation.z = 0.55;
    const arm = new THREE.Group(); arm.position.set(3.5, 0.2, 0); arm.rotation.z = -1.6;
    arm.add(box(2.6, 0.35, 0.35, yellow, 1.3, 0, 0), box(0.8, 0.7, 0.9, dark, 2.6, -0.3, 0)); boom.add(arm);
    return grp([box(3.6, 0.7, 0.6, dark, 0, 0, -1.0), box(3.6, 0.7, 0.6, dark, 0, 0, 1.0), box(2.6, 0.9, 2.4, yellow, -0.3, 0.7, 0),
      box(1.1, 1.3, 1.0, yellow, 0.6, 1.6, -0.6), box(0.9, 0.8, 0.05, 'glass', 0.6, 1.9, -0.09, { edges: false }), boom], 0, 0, 0);
  }
  const fix = (g, x, y, z, ry) => { g.position.set(x, y, z); g.rotation.y = ry; return g; };
  const pitEdge = pit.x + 2.6;
  add(fix(excavator(0, 0, 0), pitEdge, 0, -0.5, Math.PI), 'earth', 0.05, 'show', { until: ['found', 0.3], ghost: false, hot: false });
  // 덤프트럭 (도로변)
  add(grp([box(2.2, 2.2, 2.3, mat('white'), 2.6, 0.5, 0), box(4.6, 1.5, 2.4, yellow, -1.0, 0.9, 0), box(4.2, 0.9, 2.2, mat('earth'), -1.0, 2.1, 0, { edges: false }),
    ...[-2.6, -0.6, 2.6].flatMap(px => [box(1.0, 1.0, 0.35, dark, px, 0, 1.25), box(1.0, 1.0, 0.35, dark, px, 0, -1.25)])], S.x1 - 6, S.z1 + 4.5, 0), 'earth', 0.15, 'show', { until: ['found', 0.5], ghost: false, hot: false });
  // 흙더미
  { const g = solid(new THREE.IcosahedronGeometry(1, 1).scale(Math.min(4, hw * 0.5), 1.3, Math.min(3, hd * 0.5)), 'earth', { edges: false }); g.position.set(-pit.x - 3.5, 0, -hd * 0.3);
    add(g, 'earth', 0.25, 'grow', { until: ['found', 1.0], ghost: false, hot: false, d: 0.6 }); }
  // 기초 철근 (매트 위 격자 — 콘크리트 타설 직전에 보였다가 덮인다)
  { const y = (T.basement ? -T.basement : RC ? -0.2 : BASE) - 0.02, bars = [];
    for (const x of lin(-hw + 0.2, hw - 0.2, Math.round(W / 0.3))) bars.push([0.025, 0.025, D - 0.4, x, y, 0]);
    for (const z of lin(-hd + 0.2, hd - 0.2, Math.round(D / 0.3))) bars.push([W - 0.4, 0.025, 0.025, 0, y + 0.03, z]);
    add(merged(bars, rust, { edges: false, cast: false }), T.basement ? 'sub' : 'found', 0.35, 'show', { until: [T.basement ? 'sub' : 'found', T.basement ? 1.0 : 0.6], ghost: false, hot: false }); }
  // 동바리(RC): 층마다 슬래브 아래 1.5m 간격 — 골조가 올라가는 동안 받치고 지붕 공정에 걷힌다
  if (RC) for (let n = 1; n < nF; n++) {
    const y0 = floorY(n), h = floorY(n + 1) - y0 - slabT - 0.02, props = [];
    for (const x of lin(-hw + 0.8, hw - 0.8, Math.max(2, Math.round((W - 1.6) / 1.5)))) for (const z of lin(-hd + 0.8, hd - 0.8, Math.max(2, Math.round((D - 1.6) / 1.5)))) props.push([0.06, h, 0.06, x, y0, z]);
    add(merged(props, mat('steel', { color: 0xb87333 }), { edges: false }, [0, y0, 0]), 'frame', (n - 1) / nF + 0.4 / nF, 'rise', { until: ['roof', 0.5 + n * 0.3], ghost: false, hot: false, d: 0.3 });
  }
  // 외부 비계 + 분진망: 조적(RC)·외장(목조) 동안. 남측은 파이프만(건물이 보이게), 동·서·북은 녹색 분진망
  { const key = RC ? 'masonry' : 'facade', top = ROOF_Y + 1.2, off = 0.9, pipe = mat('steel', { color: 0x9aa0a6 });
    const net = mat('white', { color: 0x3d7a4f, transparent: true, opacity: 0.32, depthWrite: false, roughness: 0.95, noPoche: true });
    const lifts = []; for (let y = BASE + 1.8; y < top; y += 1.8) lifts.push(y);
    [['S', W + 2 * off, hd + off], ['N', W + 2 * off, -hd - off], ['E', D + 2 * off, hw + off], ['W', D + 2 * off, -hw - off]].forEach(([side, len, c], k) => {
      const along = side === 'S' || side === 'N', bx = [];
      for (const u of lin(-len / 2, len / 2, Math.max(2, Math.round(len / 1.8) + 1))) bx.push(along ? [0.05, top, 0.05, u, 0, c] : [0.05, top, 0.05, c, 0, u]);
      for (const y of lifts) bx.push(along ? [len, 0.05, 0.05, 0, y, c] : [0.05, 0.05, len, c, y, 0], along ? [len, 0.04, 0.5, 0, y - 0.02, c - Math.sign(c) * 0.3] : [0.5, 0.04, len, c - Math.sign(c) * 0.3, y - 0.02, 0]);
      add(merged(bx, pipe, { edges: false }), key, 0.02 + k * 0.03, 'rise', { until: ['landscape', -0.2], ghost: false, hot: false, d: 0.6 });
      if (side !== 'S') add(merged([along ? [len, top - BASE, 0.02, 0, BASE, c + Math.sign(c) * 0.1] : [0.02, top - BASE, len, c + Math.sign(c) * 0.1, BASE, 0]], net, { edges: false, cast: false }), key, 0.06 + k * 0.03, 'rise', { until: ['landscape', -0.2], ghost: false, hot: false, d: 0.6 });
    }); }
  // 자재 팔레트 (블록·석고보드 더미)
  add(merged([[1.2, 0.15, 1.0, S.x0 + 3, 0, S.z1 - 3], [1.1, 0.9, 0.9, S.x0 + 3, 0.15, S.z1 - 3], [1.2, 0.15, 1.0, S.x0 + 4.6, 0, S.z1 - 3], [1.1, 0.6, 0.9, S.x0 + 4.6, 0.15, S.z1 - 3]], RC ? 'block' : 'osb'),
    RC ? 'masonry' : 'frame', 0.0, 'drop', { until: ['interior', 0], ghost: false, hot: false, h: 1.5 });

  // 축척 인물 (03·06·07) — 흰 카드 인형처럼. 작업자는 안전모(노랑)
  function figure(x, z, ry = 0, worker = false, y = 0) {
    const g = new THREE.Group();
    g.add(merged([[0.13, 0.82, 0.18, -0.08, 0, 0], [0.13, 0.82, 0.18, 0.08, 0, 0], [0.38, 0.62, 0.22, 0, 0.82, 0], [0.1, 0.58, 0.12, -0.25, 0.86, 0], [0.1, 0.58, 0.12, 0.25, 0.86, 0]], worker ? mat('steel', { color: 0x3a5a8c }) : 'white'));
    g.add(solid(new THREE.IcosahedronGeometry(0.115, 1).translate(0, 1.58, 0), worker ? yellow : 'white', { edges: false }));
    if (worker) g.add(box(0.4, 0.05, 0.24, mat('crane', { color: 0xe8c22c }), 0, 1.0, 0.02));
    g.position.set(x, y, z); g.rotation.y = ry; return g;
  }
  const doorX = T.frontDoors?.[0] ?? (T.core?.frontDoor1 ? (T.core.frontDoor1[0] + T.core.frontDoor1[1]) / 2 : T.core?.frontDoor ? (T.core.frontDoor[0] + T.core.frontDoor[1]) / 2 : 2.2);
  const doorZ = T.piloti ? (T.core?.z1 ?? 0) + 1.3 : hd + (T.porch ? T.porch.depth + 0.9 : 1.3);
  add(figure(doorX + 1.7, doorZ - 0.4, -0.5), 'handover', 0.3, 'show', { ghost: false, hot: false });   // 현관 옆 (투어 동선을 비켜 섬)
  add(figure(S.x0 + 4, S.z1 + 1.8, 1.2), 'handover', 0.35, 'show', { ghost: false, hot: false });
  add(figure(S.x1 - 3.5, S.z1 + 2.4, -2.1), 'handover', 0.4, 'show', { ghost: false, hot: false });
  [[pit.x + 1.2, hd * 0.6, 0.6, 'found'], [-hw + 1.5, hd + 1.4, -0.4, 'frame'], [hw - 1.2, -hd - 1.6, 2.6, RC ? 'masonry' : 'facade']].forEach(([x, z, r, k], i) =>
    add(figure(x, z, r, true), k, 0.1 + i * 0.1, 'show', { until: ['handover', 0], ghost: false, hot: false }));

  // ════════════════════════════════════════════════════════════════════════
  // J. 설비 (옥상 실외기) · L. 조경 · M. 준공
  // ════════════════════════════════════════════════════════════════════════
  if (T.roof === 'flat') add(merged(lin(1, hw - 1.5, 3).map(x => [1.0, 0.9, 0.8, x, ROOF_Y, -1.5]), 'white'), 'mep', 0.7, 'drop', { h: 2, ghost: false });
  else add(box(0.9, 0.7, 0.35, 'white', hw + 0.8, BASE, -2), 'mep', 0.8, 'show', { ghost: false });

  add(box(S.x1 - S.x0 + 30, 0.12, 3, 'paving', 0, 0, S.z1 + 1.5, { edges: false }), 'landscape', 0.0, 'show', { ghost: false });
  const tree = (x, z, s = 1, k = 0) => {
    const g = new THREE.Group();
    g.add(box(0.2 * s, 2.2 * s, 0.2 * s, 'trunk', 0, 0, 0, { edges: false }));
    g.add(solid(new THREE.IcosahedronGeometry(1.5 * s, 1).translate(0, 3.4 * s, 0), 'plant', { edges: false }));
    g.position.set(x, 0, z);
    add(g, 'landscape', 0.3 + k * 0.08, 'grow', { ghost: false, d: 0.6 });
  };
  if (T.structure === 'timber') {
    gardenLandscape(tree);
  } else {
    tree(S.x0 + 2, S.z1 + 1.6, 0.9, 0); tree(S.x1 - 2, S.z1 + 1.6, 0.9, 1);
  }
  // 주차구획 (parking.js가 계산한 배치): 흰 실선 2.5×5.0m, 직렬 구획은 앞뒤로 붙는다
  const stalls = PRJ.park?.L?.stalls || [];
  const stallLines = r => [[r.x1 - r.x0, 0.02, 0.1, (r.x0 + r.x1) / 2, 0.005, r.z0], [0.1, 0.02, r.z1 - r.z0, r.x0, 0.005, (r.z0 + r.z1) / 2], [0.1, 0.02, r.z1 - r.z0, r.x1, 0.005, (r.z0 + r.z1) / 2]];
  if (stalls.length) add(merged(stalls.flatMap(stallLines), 'line', { edges: false }), 'landscape', 0.5, 'show', { ghost: false });
  else if (T.piloti && T.parkLines) add(merged(T.parkLines.map(x => [0.1, 0.02, 4.6, x, 0.005, hd - 2.6]), 'line', { edges: false }), 'landscape', 0.5, 'show', { ghost: false });
  if (T.style === 'storefront') add(box(W - 2, 0.6, 0.12, 'sign', 0, T.f1 - 0.75, hd + 0.2), 'handover', 0.2, 'show', { ghost: false });
  else if (T.style === 'curtain') add(box(4.0, 0.42, 0.1, 'sign', -hw + 2.8, T.f1 - 0.5, hd + 0.18), 'handover', 0.2, 'show', { ghost: false });
  else if (T.piloti) add(box(2.4, 0.5, 0.08, 'sign', hw - 1.8, floorY(2) + 0.2, hd + 0.16), 'handover', 0.2, 'show', { ghost: false });

  // ════════════════════════════════════════════════════════════════════════
  // 실내 (interior.js) — 투어하는 층의 마감·벽·가구·조명
  // ════════════════════════════════════════════════════════════════════════
  const INT = buildInterior(K, { segWall, slabT });
  // 외벽 안쪽 마감(도장·석고보드) — 투어하는 층만. 같은 개구부 표를 써서 창이 그대로 뚫린다
  for (const [n, fp] of plansByFloor()) {
    if (!fp.ceiling) continue;
    const y0 = floorY(n), top = n < nF ? floorY(n + 1) - slabT : ROOF_Y, wt = RC ? 0.2 : 0.17;
    ['S', 'E', 'N', 'W'].forEach(side => {
      if (T.storefront && side === 'S') return;
      const ns = side === 'S' || side === 'N';
      add(sideWall(side, y0, top - y0, 0.015, (ns ? hd : hw) - wt - 0.01, 'paint', ops(n, side), (ns ? W : D) - 2 * wt - 0.04), 'interior', 0.3, 'rise', { ghost: false, hot: false });
    });
  }

  // ════════════════════════════════════════════════════════════════════════
  // 타워크레인
  // ════════════════════════════════════════════════════════════════════════
  let crane = null;
  if (T.crane) {
    const H = ROOF_Y + 9;
    crane = new THREE.Group();
    crane.position.set(S.x1 - 0.8, 0, S.z0 + 0.9);
    crane.add(box(1.4, H, 1.4, 'crane', 0, 0, 0));
    const jib = new THREE.Group(); jib.position.y = H; crane.add(jib);
    jib.add(box(0.9, 0.9, 26, 'crane', 0, 0, 10), box(0.9, 0.9, 7, 'crane', 0, 0, -4.5), box(1.6, 1.4, 2.2, 'concrete', 0, -0.2, -7), box(1.4, 1.4, 1.4, 'white', 1.2, -1.4, 0.5));
    const cable = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0x222222 }));
    root.add(crane, cable);
    crane.userData = { H, jib, cable };
  }

  // ════════════════════════════════════════════════════════════════════════
  // 법규 시각화: 대지 경계선 + 정북 일조사선 (건축법 시행령 제86조: 높이 10m 이하 1.5m, 초과분 높이의 1/2)
  // ════════════════════════════════════════════════════════════════════════
  const envelope = new THREE.Group(); envelope.visible = false; root.add(envelope);
  const EU = envelope.userData = { outline: null, sun: [], floors: [], park: [] };     // 법규 장면에서 단계별로 켜기 위한 손잡이
  {
    const lineM = new THREE.LineBasicMaterial({ color: C.accent });
    const outline = [[S.x0, S.z0], [S.x1, S.z0], [S.x1, S.z1], [S.x0, S.z1], [S.x0, S.z0]].map(([x, z]) => new THREE.Vector3(x, 0.05, z));
    EU.outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(outline), lineM); envelope.add(EU.outline);
    if (zoneById(PRJ.law.zone).sun) {
      const fill = new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
      const Hm = ROOF_Y + 8, zb = S.z0, x0 = S.x0, x1 = S.x1;
      const prof = [[1.5, 0], [1.5, 10], [5, 10], [Hm / 2, Hm]];         // (경계로부터 거리, 높이)
      const pos = [];
      for (let i = 0; i < prof.length - 1; i++) {
        const [d0, h0] = prof[i], [d1, h1] = prof[i + 1];
        pos.push(x0, h0, zb + d0, x1, h0, zb + d0, x1, h1, zb + d1, x0, h0, zb + d0, x1, h1, zb + d1, x0, h1, zb + d1);
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const em = new THREE.Mesh(g, fill); envelope.add(em); EU.sun.push(em);
      for (const x of [x0, x1, 0]) { const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(prof.map(([d, h]) => new THREE.Vector3(x, h, zb + d))), lineM); envelope.add(l); EU.sun.push(l); }
    }
    // 층별 건축가능영역 (snu-laus/TranslateZoning2BuildableVolume의 '층별 허용 면적' 아이디어):
    // 대지 − 공지 − 그 층 최상부 높이의 정북 이격 → 층마다 허용 사각형을 쌓아 설계 매스와 비교
    const zn = zoneById(PRJ.law.zone), sb = T.setback || { front: 1, side: 0.5 };
    const front = sb.front + (PRJ.law.road < 4 ? (4 - PRJ.law.road) / 2 : 0);
    const dash2 = new THREE.LineDashedMaterial({ color: C.accent, dashSize: 0.4, gapSize: 0.25 });
    const slabF = new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false });
    const maxN = Math.max(nF + 2, (T.floorRange || [0, nF])[1]);
    for (let n = 1; n <= maxN; n++) {
      const yb = floorY(n), yt = floorY(n + 1);
      const north = zn.sun ? sunReq(yt) : sb.side;
      const ax0 = S.x0 + sb.side, ax1 = S.x1 - sb.side, az0 = S.z0 + north, az1 = S.z1 - front;
      if (az1 - az0 < 1 || ax1 - ax0 < 1) break;
      const pts = [[ax0, az0], [ax1, az0], [ax1, az1], [ax0, az1], [ax0, az0]].map(([x, z]) => new THREE.Vector3(x, yb + 0.03, z));
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), dash2); ln.computeLineDistances(); envelope.add(ln);
      const pl = new THREE.Mesh(new THREE.PlaneGeometry(ax1 - ax0, az1 - az0).rotateX(-Math.PI / 2), slabF);
      pl.position.set((ax0 + ax1) / 2, yb + 0.02, (az0 + az1) / 2); envelope.add(pl);
      EU.floors.push({ n, objs: [ln, pl], area: (ax1 - ax0) * (az1 - az0) });
    }
    // 주차구획 (법규 장면 ④에서 주황으로 강조)
    for (const r of PRJ.park?.L?.stalls || []) {
      const pts = [[r.x0, r.z0], [r.x1, r.z0], [r.x1, r.z1], [r.x0, r.z1], [r.x0, r.z0]].map(([x, z]) => new THREE.Vector3(x, 0.06, z));
      const ln = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lineM); envelope.add(ln); EU.park.push(ln);
      const pf = new THREE.Mesh(new THREE.PlaneGeometry(r.x1 - r.x0 - 0.1, r.z1 - r.z0 - 0.1).rotateX(-Math.PI / 2), slabF);
      pf.position.set((r.x0 + r.x1) / 2, 0.04, (r.z0 + r.z1) / 2); envelope.add(pf); EU.park.push(pf);
    }
  }

  const glassMats = [], signMats = [], lampMats = [];
  root.traverse(o => {
    if (!o.isMesh) return;
    if (o.material.userData.glass) glassMats.push(o.material);
    if (o.material.userData.sign) signMats.push(o.material);
    if (o.material.userData.lamp) lampMats.push(o.material);
  });

  const tmp = new THREE.Vector3();
  function update(t, opts) {
    const active = K.update(t, opts);
    const earth = phaseByKey('earth'), span = earth.w1 - earth.w0;
    const digStart = earth.w0 + (T.basement ? 0.3 : 0.05) * span;
    const dig = Math.min(1, Math.max(0, (t - digStart) / (earth.w1 - 0.1 - digStart)));
    cap.visible = dig <= 0; pitMesh.visible = dig > 0;
    pitMesh.scale.y = Math.max(0.01, pit.depth * (1 - Math.pow(1 - dig, 3)));
    if (crane) {
      const fr = phaseByKey('frame'), rf = phaseByKey('roof');
      crane.visible = t > fr.w0 - 0.6 && t < Math.max(fr.w1, rf.w1) + 0.5;
      const { H, jib, cable } = crane.userData;
      const target = active ? tmp.copy(active.top).add(new THREE.Vector3(0, active.obj.position.y, 0)) : tmp.set(0, ROOF_Y, 0);
      const dx = target.x - crane.position.x, dz = target.z - crane.position.z;
      jib.rotation.y = Math.atan2(dx, dz);
      const r = Math.hypot(dx, dz);
      const tip = new THREE.Vector3(crane.position.x + Math.sin(jib.rotation.y) * r, H - 0.4, crane.position.z + Math.cos(jib.rotation.y) * r);
      cable.visible = crane.visible && !!active;
      if (cable.visible) cable.geometry.setFromPoints([tip, target.clone().add(new THREE.Vector3(0, 0.05, 0))]);
    }
    return active;
  }

  return { earthCut, K, root, update, updateLift: elevator.update, elevator, retime: () => K.retime(phaseByKey), groundMat, glassMats, signMats, lampMats,
           lights: INT.lights, rooms: INT.rooms, envelope, dispose: ()=>{elevator.dispose?.();K.dispose();} };
}
