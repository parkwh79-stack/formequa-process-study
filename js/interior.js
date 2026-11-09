// ─────────────────────────────────────────────────────────────────────────────
// interior.js — 실내: 방 바닥 마감 · 천장 · 칸막이(문 포함) · 가구 · 계단 · 조명
//
// types.js의 floorsPlan[층] = { rooms, walls, furniture, lights, ceiling } 를 읽어 만든다.
// 모든 부재는 '내장·인테리어' 공정에 붙고, 방 id를 달고 있어서
// 투어 카메라가 도착하기 전까지는 선화(종이색), 도착하면 실제 재질이 된다 (kit.update의 roomDraw).
// 가구는 재질별로 상자·원기둥을 한 메시로 합쳐(merge) 드로우콜을 줄인다.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PRJ, floorY, roofY , plansByFloor } from './project.js';
import { metricUV } from './textures.js';
import { finishPatches } from './rect-patches.js';

const D2R = Math.PI / 180;

export function buildInterior(K, { segWall, slabT }) {
  const T = PRJ.T, { add, mat, solid, box } = K;
  const lights = [], rooms = {};
  const cache = {};
  const M = key => {                                     // 'fabric' 또는 'carPaint#6b1f22'
    if (cache[key]) return cache[key];
    const [name, hex] = key.split('#');
    return (cache[key] = mat(name, hex ? { color: parseInt(hex, 16) } : {}));
  };

  // 가구 빌더: 재질별로 모아 병합
  function fb() {
    const byMat = new Map();
    const get = m => { if (!byMat.has(m)) byMat.set(m, []); return byMat.get(m); };
    const api = {
      b(m, w, h, d, x = 0, y = 0, z = 0) { get(m).push(new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z)); return api; },
      c(m, rt, rb, h, x = 0, y = 0, z = 0, seg = 18) { get(m).push(new THREE.CylinderGeometry(rt, rb, h, seg).translate(x, y + h / 2, z)); return api; },
      s(m, r, x, y, z) { get(m).push(new THREE.IcosahedronGeometry(r, 1).translate(x, y, z)); return api; },
      done(x, y, z, rotDeg = 0) {
        const g = new THREE.Group();
        for (const [m, geos] of byMat) {
          const gs = geos.map(q => metricUV(q.index ? q.toNonIndexed() : q));
          const geo = mergeGeometries(gs); geo.userData.uvDone = true;
          g.add(...solid(geo, M(m)).children);
        }
        g.position.set(x, y, z); g.rotation.y = rotDeg * D2R;
        return g;
      },
    };
    return api;
  }
  const chair = (f, x, z, rot) => {                      // 의자 (rot 라디안: 앉은 사람이 보는 방향)
    const c = Math.cos(rot), s = Math.sin(rot);
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const [sx, sz] = P(0, 0), [bx, bz] = P(0, -0.2);
    f.b('walnut', 0.42, 0.05, 0.42, sx, 0.42, sz).b('black', 0.04, 0.42, 0.04, ...lp(P(0.18, 0.18))).b('black', 0.04, 0.42, 0.04, ...lp(P(-0.18, 0.18)))
     .b('black', 0.04, 0.42, 0.04, ...lp(P(0.18, -0.18))).b('black', 0.04, 0.42, 0.04, ...lp(P(-0.18, -0.18)));
    f.b('walnut', Math.abs(c) > 0.5 ? 0.42 : 0.04, 0.38, Math.abs(c) > 0.5 ? 0.04 : 0.42, bx, 0.47, bz);
  };
  const lp = ([x, z]) => [x, 0, z];

  // ── 가구 라이브러리: (옵션) → 로컬 좌표 그룹, rot 0 = 남향(+z)을 바라봄 ──────────
  const LIBF = {
    sofa: ({ w = 2.1 }) => fb().b('fabric', w, 0.42, 0.9).b('fabric', w, 0.45, 0.2, 0, 0.42, -0.35).b('fabric', 0.2, 0.22, 0.9, w / 2 - 0.1, 0.42).b('fabric', 0.2, 0.22, 0.9, -w / 2 + 0.1, 0.42)
      .b('fabricWarm', 0.45, 0.4, 0.12, -w / 4, 0.5, -0.18).b('fabricWarm', 0.45, 0.4, 0.12, w / 4, 0.5, -0.18),
    armchair: () => fb().b('fabricWarm', 0.85, 0.42, 0.85).b('fabricWarm', 0.85, 0.45, 0.18, 0, 0.42, -0.33).b('walnut', 0.12, 0.2, 0.85, 0.36, 0.42).b('walnut', 0.12, 0.2, 0.85, -0.36, 0.42),
    rug: ({ w = 2, d = 1.5 }) => fb().b('fabricWarm', w, 0.012, d),
    tv: ({ w = 1.4, y = 0.95 }) => fb().b('screen', w, w * 0.57, 0.04, 0, y, -0.02).b('black', w * 0.8, 0.05, 0.12, 0, y - 0.05, 0),
    tvWall: ({ w = 2.2 }) => fb().b('walnut', w, 0.42, 0.42, 0, 0, 0).b('screen', 1.5, 0.86, 0.04, 0, 0.95, -0.15),
    kitchen: ({ len = 2.4 }) => fb().b('lacquer', len, 0.85, 0.6).b('marble', len + 0.02, 0.04, 0.62, 0, 0.85).b('lacquer', len, 0.72, 0.35, 0, 1.45, -0.125)
      .b('steel', 0.6, 0.01, 0.42, -len / 4, 0.891).b('black', 0.6, 0.01, 0.5, len / 4, 0.891).b('steel', 0.04, 0.25, 0.04, -len / 4, 0.89, -0.2),
    fridge: () => fb().b('steel', 0.8, 1.85, 0.7),
    diningSet: ({ w = 1.4, d = 0.8, seats = 4 }) => {
      const f = fb().b('oak', w, 0.04, d, 0, 0.72).b('black', 0.05, 0.72, 0.05, w / 2 - 0.08, 0, d / 2 - 0.08).b('black', 0.05, 0.72, 0.05, -w / 2 + 0.08, 0, d / 2 - 0.08)
        .b('black', 0.05, 0.72, 0.05, w / 2 - 0.08, 0, -d / 2 + 0.08).b('black', 0.05, 0.72, 0.05, -w / 2 + 0.08, 0, -d / 2 + 0.08);
      const per = Math.ceil(seats / 2);
      for (let i = 0; i < per; i++) { const x = -w / 2 + w * (i + 0.5) / per; chair(f, x, d / 2 + 0.3, Math.PI); chair(f, x, -d / 2 - 0.3, 0); }
      return f;
    },
    bed: ({ w = 1.5, l = 2.0 }) => fb().b('walnut', w + 0.1, 0.3, l).b('linen', w, 0.24, l - 0.1, 0, 0.3, 0.03).b('walnut', w + 0.2, 0.95, 0.08, 0, 0, -l / 2)
      .b('linen', w * 0.38, 0.12, 0.35, -w / 4, 0.54, -l / 2 + 0.3).b('linen', w * 0.38, 0.12, 0.35, w / 4, 0.54, -l / 2 + 0.3).b('fabricWarm', w + 0.02, 0.06, l * 0.55, 0, 0.53, l * 0.2),
    wardrobe: ({ len = 1.6 }) => fb().b('lacquer', len, 2.2, 0.6).b('steel', 0.02, 0.4, 0.03, 0.05, 0.9, 0.31),
    desk: ({ w = 1.2 }) => { const f = fb().b('oak', w, 0.03, 0.6, 0, 0.72).b('oak', 0.03, 0.72, 0.6, w / 2 - 0.02).b('oak', 0.03, 0.72, 0.6, -w / 2 + 0.02).b('screen', 0.55, 0.33, 0.03, 0, 0.85, 0.2).b('black', 0.15, 0.1, 0.12, 0, 0.75, 0.2); chair(f, 0, -0.5, 0); return f; },
    deskRow: ({ n = 4 }) => { const f = fb(); for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 1.4; f.b('lacquer', 1.3, 0.03, 0.7, x, 0.72).b('black', 0.04, 0.72, 0.65, x - 0.6).b('screen', 0.55, 0.33, 0.03, x, 0.85, 0.22).b('black', 0.12, 0.12, 0.1, x, 0.75, 0.22); chair(f, x, -0.55, 0); } return f; },
    cabinetRow: ({ len = 4 }) => fb().b('lacquer', len, 1.1, 0.45),
    meetTable: ({ len = 2.4, seats = 6 }) => { const f = fb().b('walnut', len, 0.04, 1.1, 0, 0.72).b('black', len * 0.6, 0.72, 0.3); const per = Math.ceil(seats / 2); for (let i = 0; i < per; i++) { const x = -len / 2 + len * (i + 0.5) / per; chair(f, x, 0.85, Math.PI); chair(f, x, -0.85, 0); } return f; },
    shoeCab: ({ len = 1.2 }) => fb().b('lacquer', len, 2.1, 0.35).b('oak', len, 0.03, 0.36, 0, 1.0),
    plant: () => fb().c('lacquer', 0.18, 0.14, 0.42).s('plant', 0.38, 0, 0.95, 0).s('plant', 0.25, 0.15, 1.25, 0.05),
    pendant: ({ y = 2.2 }) => fb().c('lamp', 0.12, 0.2, 0.22, 0, y).b('black', 0.01, 0.9, 0.01, 0, y + 0.22),
    toilet: () => fb().b('porcelain', 0.38, 0.4, 0.55, 0, 0, 0.05).b('porcelain', 0.42, 0.38, 0.18, 0, 0.35, -0.22),
    vanity: () => fb().b('walnut', 0.8, 0.78, 0.45).b('marble', 0.82, 0.04, 0.47, 0, 0.78).b('porcelain', 0.42, 0.1, 0.32, 0, 0.82).b('steel', 0.7, 0.8, 0.02, 0, 1.1, -0.22),
    washer: () => fb().b('white', 0.6, 0.85, 0.6).c('black', 0.2, 0.2, 0.02, 0, 0.45, 0.3),
    bookshelf: ({ len = 1.8 }) => { const f = fb().b('walnut', len, 2.0, 0.35); for (let k = 1; k < 5; k++) f.b('oak', len - 0.06, 0.03, 0.3, 0, k * 0.4, 0.04); return f; },
    barCounter: ({ len = 5 }) => { const f = fb().b('walnut', len, 1.05, 0.6).b('marble', len + 0.05, 0.05, 0.75, 0, 1.05, 0.05).b('steel', 0.65, 0.45, 0.5, len / 2 - 0.9, 1.1, -0.05); for (let i = 0; i < 4; i++) { const x = -len / 2 + 0.7 + i * (len - 1.4) / 3; f.c('black', 0.03, 0.03, 0.72, x, 0, 0.65).c('walnut', 0.19, 0.19, 0.05, x, 0.72, 0.65); } return f; },
    backBar: ({ len = 5 }) => { const f = fb().b('walnut', len, 0.9, 0.45).b('marble', len, 0.03, 0.46, 0, 0.9); [1.55, 2.05].forEach(y => f.b('oak', len, 0.03, 0.3, 0, y, -0.07)); for (let i = 0; i < 14; i++) f.b(i % 3 ? 'screen' : 'lacquer', 0.08, 0.28, 0.08, -len / 2 + 0.3 + i * (len - 0.6) / 13, 1.58, -0.08); return f; },
    cafeTable: () => { const f = fb().c('marble', 0.4, 0.4, 0.03, 0, 0.72).c('black', 0.04, 0.04, 0.72).c('black', 0.25, 0.25, 0.02); chair(f, 0, 0.62, Math.PI); chair(f, 0.55, -0.35, -0.6); chair(f, -0.55, -0.35, 0.6); return f; },
    longTable: ({ len = 3.6 }) => fb().b('oak', len, 0.05, 0.9, 0, 0.72).b('black', 0.06, 0.72, 0.7, len / 2 - 0.2).b('black', 0.06, 0.72, 0.7, -len / 2 + 0.2).b('oak', len, 0.45, 0.32, 0, 0, 0.72).b('oak', len, 0.45, 0.32, 0, 0, -0.72),
    windowBar: ({ len = 5 }) => { const f = fb().b('oak', len, 0.05, 0.4, 0, 1.02).b('black', 0.05, 1.02, 0.3, len / 2 - 0.1).b('black', 0.05, 1.02, 0.3, -len / 2 + 0.1); for (let i = 0; i < Math.floor(len / 0.8); i++) { const x = -len / 2 + 0.45 + i * 0.8; f.c('black', 0.025, 0.025, 0.72, x, 0, -0.45).c('walnut', 0.17, 0.17, 0.05, x, 0.72, -0.45); } return f; },
    menuBoard: () => fb().b('black', 2.4, 1.0, 0.03, 0, 2.3, 0),
    car: ({ color = 0x2f3a46 }) => { const hex = color.toString(16).padStart(6, '0'); return fb().b('carPaint#' + hex, 1.8, 0.62, 4.4, 0, 0.3).b('black', 1.6, 0.52, 2.2, 0, 0.92, -0.25)
      .b('tyre', 0.24, 0.62, 0.62, 0.8, 0, 1.35).b('tyre', 0.24, 0.62, 0.62, -0.8, 0, 1.35).b('tyre', 0.24, 0.62, 0.62, 0.8, 0, -1.35).b('tyre', 0.24, 0.62, 0.62, -0.8, 0, -1.35); },
    mailbox: () => fb().b('steel', 1.0, 1.2, 0.3, 0, 0.4),
    lobbyDesk: ({ len = 2.4 }) => fb().b('marble', len, 1.05, 0.7).b('walnut', len + 0.04, 0.04, 0.78, 0, 1.05).b('screen', 0.5, 0.3, 0.03, -len / 4, 1.1, -0.2),
    shelfRow: ({ len = 5 }) => { const f = fb().b('white', len, 0.08, 0.9); for (const y of [0.45, 0.9, 1.35, 1.75]) f.b('white', len, 0.03, 0.9, 0, y); f.b('white', len, 1.85, 0.04);
      for (let i = 0; i < Math.floor(len / 0.35); i++) { const x = -len / 2 + 0.2 + i * 0.35; f.b(i % 3 ? 'fabricWarm' : 'lacquer', 0.25, 0.3, 0.28, x, 0.48, 0.25).b(i % 2 ? 'oak' : 'fabric', 0.25, 0.28, 0.28, x, 0.93, -0.25); } return f; },
    counter: ({ len = 1.8 }) => fb().b('lacquer', len, 1.0, 0.65).b('marble', len + 0.04, 0.04, 0.7, 0, 1.0).b('screen', 0.35, 0.28, 0.03, 0.3, 1.04, -0.1),
    // 전원주택: 벽난로(석재 + 화구 + 월넛 선반) · 아일랜드 주방 · 라운지 의자
    fireplace: ({ w = 1.8, h = 2.6 }) => fb().b('stone', w, h, 0.5).b('black', 0.9, 0.62, 0.1, 0, 0.32, 0.22).b('lamp', 0.7, 0.18, 0.06, 0, 0.36, 0.2).b('walnut', w + 0.2, 0.08, 0.32, 0, 1.12, 0.12).b('stone', w + 0.4, 0.12, 0.7, 0, 0, 0.1),
    island: ({ len = 2.4 }) => fb().b('walnut', len, 0.88, 0.95).b('marble', len + 0.1, 0.04, 1.05, 0, 0.88).b('lacquer', 0.42, 0.75, 0.42, -len / 2 + 0.4, 0, 0.75).b('lacquer', 0.42, 0.75, 0.42, len / 2 - 0.4, 0, 0.75),
    lounge: () => fb().b('fabricWarm', 0.8, 0.4, 0.85).b('fabricWarm', 0.8, 0.5, 0.18, 0, 0.4, -0.34).b('walnut', 0.06, 0.4, 0.8, -0.4, 0, 0).b('walnut', 0.06, 0.4, 0.8, 0.4, 0, 0),
    bathPod: () => fb().b('paint', 1.2, 2.2, 1.3).b('lacquer', 0.7, 2.0, 0.03, 0.15, 0, 0.66),   // 욕실 포드 (문은 방 쪽)

  };

  const inRoom = (list, x, z) => (list.find(r => x >= r.r[0] && x <= r.r[2] && z >= r.r[1] && z <= r.r[3]) || {}).id || null;

  for (const [n, fp, copy] of plansByFloor()) {
    const y0 = floorY(n), top = n < T.floors ? floorY(n + 1) - slabT : roofY() - (T.roof === 'gable' ? 0.28 : 0);   // 박공 아래는 서까래보다 낮게
    const clear = top - y0;
    const o0 = (n - 1) / T.floors;
    rooms[n] = fp.rooms.map(r => ({ ...r, name:r.name.replace(/20(\d)호/g,`${n}0$1호`), renderId:`${n}:${r.id}`, floor: n, y: y0, area: (r.r[2] - r.r[0]) * (r.r[3] - r.r[1]), cx: (r.r[0] + r.r[2]) / 2, cz: (r.r[1] + r.r[3]) / 2 }));

    // 1) 바닥 마감 (방마다)
    fp.rooms.forEach((r, i) => {
      for (const [x0, z0, x1, z1] of finishPatches(r.r, T.core?.ev ? [T.core.ev] : [])) {
        add(box(x1 - x0 - 0.02, 0.015, z1 - z0 - 0.02, r.fin, (x0 + x1) / 2, y0, (z0 + z1) / 2, { edges: false, cast: false }), 'interior', o0 + i * 0.01, 'show', { room: `${n}:${r.id}`, ghost: false, hot: false, d: 0.3 });
        if (fp.ceiling) add(box(x1 - x0 - 0.02, 0.02, z1 - z0 - 0.02, 'paint', (x0 + x1) / 2, top - 0.05, (z0 + z1) / 2, { edges: false, cast: false }), 'interior', 0.6, 'show', { room: `${n}:${r.id}`, ghost: false, hot: false, d: 0.3 });
      }
    });

    // 3) 칸막이 (문 구멍 + 열린 문짝)
    (fp.walls || []).forEach(([x0, z0, x1, z1, o = {}], i) => {
      const pieces = segWall(x0, z0, x1, z1, y0, o.h ?? clear, { t: o.t ?? 0.12, m: o.mat ?? 'paint', gaps: o.gaps || [], glass: !!o.glass });
      const key = o.mat === 'concrete' ? 'masonry' : 'interior';
      pieces.forEach(g => add(g, key, key === 'interior' ? 0.05 + i * 0.02 : o0, 'rise', { ghost: false, d: 0.4 }));
    });

    // 4) 가구
    (fp.furniture || []).forEach(([kind, x, z, rot = 0, opt = {}], i) => {
      const f = LIBF[kind]; if (!f) return;
      const g = f(opt).done(x, y0 + 0.015, z, rot);
      add(g, 'interior', 0.4 + 0.55 * i / fp.furniture.length, kind === 'car' ? 'drop' : 'show', { room: `${n}:${inRoom(fp.rooms, x, z)}`, ghost: false, hot: false, d: 0.4, h: 0.6 });
    });

    // 5) 조명 (실내 포인트 라이트 + 천장 조명 패널)
    (fp.lights || []).forEach(([x, y, z]) => {
      if (!copy) { const l = new THREE.PointLight(0xffd7a8, 0, 10, 1.6); l.position.set(x, y0 + y, z); K.root.add(l); lights.push(l); }   // 복제층은 조명 패널만 (광원 수 절약)
      if (fp.ceiling) add(box(0.6, 0.02, 0.6, 'lamp', x, top - 0.075, z, { edges: false, cast: false }), 'interior', 0.65, 'show', { room: `${n}:${inRoom(fp.rooms, x, z)}`, ghost: false, hot: false });
    });
  }

  // 6) 목조 실내 계단 (전원주택)
  if (T.stairTimber) {
    const st = T.stairTimber, y0 = floorY(1), H = floorY(2) - y0, N = 16, r = H / N, L = st.zHigh - st.zLow, tr = L / N;
    const f = fb();
    for (let i = 0; i < N; i++) f.b('oak', st.w, 0.04, Math.abs(tr) + 0.02, 0, r * (i + 1) - 0.04, tr * (i + 0.5));
    f.b('walnut', 0.06, H + 0.9, 0.06, -st.w / 2, 0, L);                 // 기둥
    const stringer = new THREE.Group();
    const len = Math.hypot(H, L), ang = Math.atan2(H, -L);
    stringer.add(box(0.05, 0.3, len, 'oak', 0, 0, 0)); stringer.children[0].position.set(0, -0.15, 0);
    stringer.position.set(st.w / 2 + 0.03, H / 2, L / 2); stringer.rotation.x = ang;
    const g = f.done(st.x, y0, st.zLow, 0); g.add(stringer);
    add(g, 'interior', 0.1, 'show', { room: 'hall', ghost: false, hot: false, d: 0.4 });
  }

  return { lights, rooms };
}
