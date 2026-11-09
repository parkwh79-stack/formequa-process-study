// ─────────────────────────────────────────────────────────────────────────────
// kit.js — 모델링 도구 + 부재 레지스트리 (building.js와 interior.js가 같이 씀)
//
// 원본에서 가져온 원리 4가지가 모두 여기 있습니다.
//  ① add(부재, 공정, 순서, 방식)  — 05 Schedule Build: 공정이 부재의 등장 시점을 결정
//  ② update(t) 순수 함수          — 스크롤을 되감으면 정확히 해체
//  ③ 포셰(poché)                  — Casa Larga: 클리핑 평면으로 자르면 보이는 '벽 속(뒷면)'을 검게
//                                   칠해 건축 평면도의 검은 벽체를 만든다 (추가 형상 없음)
//  ④ 도면 ↔ 재질                 — Casa Serra: 방마다 카메라가 도착하기 전엔 종이색 선화,
//                                   도착하면 실제 재질로 (drawK / roomDraw)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTextures, metricUV } from './textures.js';
import { C, clamp01, smooth } from './project.js';

export const PAPER = new THREE.Color(C.paper), INKC = new THREE.Color(C.ink), ACCENT = new THREE.Color(C.accent);
const easeOut = s => 1 - Math.pow(1 - s, 3);

// ── 셰이더 효과 (모든 재질 공통 · 전역 uniform FX 하나로 조정) ─────────────────
// ③ 포셰: 뒷면(gl_FrontFacing=false)을 잉크색으로. 닫힌 상자를 자르면 단면이 검게 보인다.
// ⑥ 스캔 스윕(02·07): 월드 x가 uSweep보다 큰 쪽은 아직 '도면'(종이색) — 스캔 평면이 지나가면 재질이 드러난다.
// ⑦ 그림자 해칭(07): 직사광이 닿지 않는 곳을 화면 공간 45° 사선으로 칠한다 — "도면의 해칭이 곧 실제 그림자".
// 잉크·종이색은 화면 출력(sRGB) 기준 값이다 (도면 장면은 후처리 없이 화면에 바로 그린다).
const sRGB = hex => new THREE.Vector3(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
export const FX = {
  uSweep: { value: 1e4 }, uSweepK: { value: 0 }, uHatch: { value: 0 }, uDpr: { value: 1 },
  uPaper: { value: new THREE.Color(C.paper) }, uInk: { value: sRGB(C.ink) },
};
function fxCompile(sh, poche, drawUniform) {
  Object.assign(sh.uniforms, FX, { uRoomDraw: drawUniform });
  sh.vertexShader = 'varying vec3 vFxW;\n' + sh.vertexShader.replace('#include <project_vertex>',
    '#include <project_vertex>\n  vFxW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  sh.fragmentShader = 'uniform float uSweep;\nuniform float uSweepK;\nuniform float uHatch;\nuniform float uDpr;\nuniform float uRoomDraw;\nuniform vec3 uPaper;\nuniform vec3 uInk;\nvarying vec3 vFxW;\nfloat fxShade = 0.0;\nfloat fxDrawn = 0.0;\n' + sh.fragmentShader
    .replace('#include <map_fragment>', '#include <map_fragment>\n  fxDrawn = uSweepK * smoothstep(uSweep - 0.35, uSweep + 0.35, vFxW.x);\n  diffuseColor.rgb = mix(diffuseColor.rgb, uPaper, max(fxDrawn, uRoomDraw) * 0.93);')
    .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n  fxShade = 1.0 - smoothstep(0.015, 0.08, dot(reflectedLight.directDiffuse, vec3(0.3333)));')
    .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n'
      + '  float fxH = max(uHatch, fxDrawn);\n'
      + '  float fxD = mod(gl_FragCoord.x + gl_FragCoord.y, 6.0 * uDpr);\n'
      + '  float fxL = 1.0 - smoothstep(0.65 * uDpr, 1.65 * uDpr, fxD);\n'
      + '  gl_FragColor.rgb = mix(gl_FragColor.rgb, uInk, fxL * fxShade * fxH * 0.78);\n'
      + (poche ? '  if (!gl_FrontFacing) gl_FragColor = vec4(uInk, 1.0);\n' : ''));
}
export function applyFx(m, poche) {
  if (poche) { m.side = THREE.DoubleSide; m.shadowSide = THREE.FrontSide; }
  m.userData.drawUniform = { value: 0 };
  m.onBeforeCompile = sh => fxCompile(sh, poche, m.userData.drawUniform);
  m.customProgramCacheKey = () => (poche ? 'fx-poche-stable' : 'fx-stable');
  m.userData.poche = !!poche; m.userData.fx = true;
  return m;
}
export const applyPoche = m => applyFx(m, true);

export function makeKit(hasPhase) {
  const TX = getTextures();
  const LIB = {
    concrete:  { color: 0xdcd8d0, map: TX.concrete, roughness: 0.82 },
    block:     { color: 0xd4d0c8, map: TX.block, roughness: 0.9 },
    granite:   { color: 0xc4c0b9, map: TX.granite, roughness: 0.55 },
    graniteDk: { color: 0x7d7973, map: TX.granite, roughness: 0.5 },
    brick:     { color: 0xffffff, map: TX.brick, roughness: 0.85 },
    stucco:    { color: 0xffffff, map: TX.stucco, roughness: 0.92 },
    siding:    { color: 0x8a715c, map: TX.siding, roughness: 0.7 },
    osb:       { color: 0xffffff, map: TX.osb, roughness: 0.85 },
    stud:      { color: 0xdcc096, roughness: 0.7 },
    zinc:      { color: 0x80868e, map: TX.zinc, roughness: 0.38, metalness: 0.6 },
    zincDk:    { color: 0x4b5157, map: TX.zinc, roughness: 0.42, metalness: 0.55 },
    stone:     { color: 0xffffff, map: TX.stone, roughness: 0.88 },
    cedar:     { color: 0xffffff, map: TX.cedar, roughness: 0.72 },
    trim:      { color: 0xf4f1ea, roughness: 0.6 },
    water:     { color: 0xffffff, map: TX.water, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.9, envMapIntensity: 1.6 },
    flower:    { color: 0xc4607a, roughness: 0.9 },
    earthCut:  { color: 0xa8916c, map: TX.earthCut, roughness: 1, envMapIntensity: 0.4 },
    hedge:     { color: 0x4f6438, roughness: 0.95 },
    earth:     { color: 0xb9a78d, map: TX.earth, roughness: 1 },
    gravel:    { color: 0xffffff, map: TX.gravel, roughness: 0.95 },
    lawn:      { color: 0x9aa877, map: TX.lawn, roughness: 0.95 },
    paving:    { color: 0xffffff, map: TX.paving, roughness: 0.9 },
    asphalt:   { color: C.asphalt, roughness: 0.95 },
    glass:     { color: C.glass, roughness: 0.04, metalness: 0.55, transparent: true, opacity: 0.5, emissive: 0xffc27a, emissiveIntensity: 0, depthWrite: false, envMapIntensity: 1.8 },
    frame:     { color: C.frame, roughness: 0.4, metalness: 0.6 },
    steel:     { color: C.steel, roughness: 0.35, metalness: 0.75 },
    proof:     { color: C.waterproof, roughness: 0.7 },
    fence:     { color: C.fence, roughness: 0.8 },
    cabin:     { color: C.cabin, roughness: 0.6, metalness: 0.2 },
    crane:     { color: 0xe3a51c, roughness: 0.5, metalness: 0.3 },
    deck:      { color: 0xb08a63, map: TX.siding, roughness: 0.75 },
    white:     { color: 0xf3f0ea, roughness: 0.85 },
    paint:     { color: 0xf1eee8, roughness: 0.9 },
    plant:     { color: C.plant, roughness: 0.85 },  // (포셰 제외: 나무가 잘려도 검게 칠하지 않음)
    trunk:     { color: 0x6b5a48, roughness: 0.9 },
    line:      { color: 0xf5f5f0, roughness: 0.6 },
    sign:      { color: 0x1d1c19, roughness: 0.4, emissive: 0xe85d04, emissiveIntensity: 0 },
    // 실내
    wood:      { color: 0xffffff, map: TX.wood, roughness: 0.55 },
    tile:      { color: 0xffffff, map: TX.tile, roughness: 0.35 },
    tileDark:  { color: 0xffffff, map: TX.tileDark, roughness: 0.4 },
    carpet:    { color: 0xffffff, map: TX.carpet, roughness: 0.95 },
    concretePol: { color: 0xffffff, map: TX.concretePol, roughness: 0.3, metalness: 0.05 },
    epoxy:     { color: 0xffffff, map: TX.epoxy, roughness: 0.4 },
    fabric:    { color: 0x8b8f93, map: TX.fabric, roughness: 0.95 },
    fabricWarm:{ color: 0xc9b9a0, map: TX.fabric, roughness: 0.95 },
    linen:     { color: 0xf4f1ea, map: TX.fabric, roughness: 0.95 },
    oak:       { color: 0xc49a6c, map: TX.wood, roughness: 0.5 },
    walnut:    { color: 0x7a5236, map: TX.wood, roughness: 0.5 },
    marble:    { color: 0xffffff, map: TX.marble, roughness: 0.25 },
    lacquer:   { color: 0xeeebe5, roughness: 0.35 },
    black:     { color: 0x222222, roughness: 0.4, metalness: 0.2 },
    screen:    { color: 0x101214, roughness: 0.2, metalness: 0.3, emissive: 0x2a3440, emissiveIntensity: 0.3 },
    porcelain: { color: 0xf7f7f5, roughness: 0.2 },
    lamp:      { color: 0xfff1d6, emissive: 0xffd39a, emissiveIntensity: 0, roughness: 0.4 },
    carPaint:  { color: 0x2f3a46, roughness: 0.25, metalness: 0.6 },
    tyre:      { color: 0x1a1a1a, roughness: 0.9 },
  };
  const NO_POCHE = new Set(['glass', 'line', 'lamp', 'screen', 'plant', 'trunk', 'water', 'flower', 'hedge']);
  // 실사 품질: 질감이 있는 재료는 색 텍스처를 범프맵으로도 써서 줄눈·결이 빛을 받게 한다
  const BUMP = { brick: 2.2, block: 1.6, granite: 0.8, graniteDk: 0.8, stucco: 1.2, concrete: 0.9, siding: 1.4, paving: 1.4, gravel: 2.0,
                 earth: 1.5, lawn: 1.2, stone: 3.2, cedar: 1.3, tile: 0.8, tileDark: 0.8, wood: 0.5, oak: 0.5, walnut: 0.5, deck: 1.2, osb: 1.0, fabric: 0.6, fabricWarm: 0.6, carpet: 1.0, zinc: 0.6 };
  function mat(name, opts = {}) {
    const { noPoche, ...o } = opts;
    const m = new THREE.MeshStandardMaterial({ ...LIB[name], ...o });
    if (BUMP[name] && m.map) { m.bumpMap = m.map; m.bumpScale = BUMP[name] * 0.002; }
    if (!m.transparent) { m.polygonOffset = true; m.polygonOffsetFactor = 1; m.polygonOffsetUnits = 1; }
    if (name === 'glass') m.userData.glass = true;
    if (name === 'sign') m.userData.sign = true;
    if (name === 'lamp') m.userData.lamp = true;
    applyFx(m, !NO_POCHE.has(name) && !noPoche);
    return m;
  }

  const ink = new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: 0.25, depthWrite: false });
  const dash = new THREE.LineDashedMaterial({ color: C.ink, dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0.5, depthWrite: false });

  // ── 형상 도우미 ────────────────────────────────────────────────────────
  function solid(geo, m, { edges = true, cast = true } = {}) {
    if (!geo.userData.uvDone) metricUV(geo);
    const g = new THREE.Group();
    const mesh = new THREE.Mesh(geo, typeof m === 'string' ? mat(m) : m);
    mesh.castShadow = cast; mesh.receiveShadow = true;
    g.add(mesh);
    if (edges) g.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 28), ink));
    return g;
  }
  const box = (w, h, d, m, x = 0, y = 0, z = 0, o) => {           // 바닥 중심 기준
    const g = solid(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), m, o);
    g.position.set(x, y, z);
    return g;
  };
  const cbox = (w, h, d, m, x, y, z, rx = 0, o) => {               // 중심 기준 + x축 회전
    const g = solid(new THREE.BoxGeometry(w, h, d), m, o);
    g.position.set(x, y, z); g.children.forEach(c => (c.rotation.x = rx));
    return g;
  };
  const cyl = (rt, rb, h, m, x = 0, y = 0, z = 0, o = {}) => {
    const g = solid(new THREE.CylinderGeometry(rt, rb, h, o.seg || 20).translate(0, h / 2, 0), m, { edges: false, ...o });
    g.position.set(x, y, z);
    return g;
  };
  // 상자 여러 개를 한 메시로 (계단 디딤판 등 — 드로우콜 절약)
  // at: 피벗(=rise의 기준점). 상자 좌표는 월드 기준으로 주고, 내부에서 at만큼 빼서 붙인다
  function merged(boxes, m, o, at = [0, 0, 0]) {
    const geos = boxes.map(([w, h, d, x, y, z]) => metricUV(new THREE.BoxGeometry(w, h, d).translate(x - at[0], y + h / 2 - at[1], z - at[2])));
    const geo = mergeGeometries(geos); geo.userData.uvDone = true;
    const g = solid(geo, m, o);
    g.position.set(...at);
    return g;
  }

  // ── ① 부재 등록 ─────────────────────────────────────────────────────────
  const root = new THREE.Group(), ghostRoot = new THREE.Group();
  root.add(ghostRoot);
  const parts = [];
  function add(obj, key, order = 0, how = 'rise', o = {}) {
    if (!hasPhase(key)) return null;
    const pivot = new THREE.Group();
    pivot.position.copy(obj.position);
    obj.position.set(0, 0, 0);
    pivot.add(obj);
    root.add(pivot);
    const mats = [], edgeMats = [];
    obj.traverse(c => {
      if (c.isMesh) {
        const src = c.material;
        c.material = src.clone();                       // 부재마다 색을 따로 바꾸려고 복제
        if (src.userData.fx) applyFx(c.material, src.userData.poche);  // clone은 onBeforeCompile을 복사하지 않음
        c.material.userData.base = c.material.color.clone();
        c.material._map = c.material.map;              // 도면 모드에서 텍스처를 잠시 끄기 위해 보관
        c.material.userData.op = c.material.opacity;
        mats.push(c.material);
      } else if (c.isLineSegments) {
        c.material = ink.clone();
        edgeMats.push(c.material);
      }
    });
    root.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(pivot);
    const p = { pivot, obj, key, order, how, dOpt: o.d, untilKey: o.until, room: o.room || null,
      drop: o.h ?? 3, mats, edgeMats, ghosts: null, hot: o.hot ?? true, lift: !!o.lift,
      top: new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.max.y, (bb.min.z + bb.max.z) / 2), t0: 0, t1: 1, until: Infinity, s: 0 };
    if (o.ghost !== false) {
      p.ghosts = [];
      obj.traverse(c => {
        if (!c.isLineSegments) return;
        const gl = new THREE.LineSegments(c.geometry, dash);
        gl.applyMatrix4(c.matrixWorld);
        gl.computeLineDistances();
        ghostRoot.add(gl); p.ghosts.push(gl);
      });
    }
    parts.push(p);
    return p;
  }

  // 공정표가 바뀌면(지연 시나리오·단가 변경) 형상은 그대로, 시점만 다시 계산
  function retime(phaseByKey) {
    for (const p of parts) {
      const ph = phaseByKey(p.key); if (!ph) continue;
      const span = Math.max(0.2, ph.w1 - ph.w0);
      const d = p.dOpt ?? Math.min(1.0, span * 0.35);
      p.t0 = ph.w0 + clamp01(p.order) * Math.max(0, span - d);
      p.t1 = p.t0 + d;
      if (p.untilKey) { const u = phaseByKey(p.untilKey[0]); p.until = u ? u.w0 + p.untilKey[1] : Infinity; }
    }
  }

  // ── ② 주차 t의 상태 (순수 함수) ─────────────────────────────────────────
  // lines: 모서리 선 진하기(실사 장면에서는 옅게)
  // preview: 0~1 — 입면 도면 장면에서 '완성된 건물'을 보여 준다(가설재 제외). 1보다 작아지면 땅으로 가라앉으며 사라짐
  function update(t, { ghost = 0, drawK = 0, roomDraw = null, weeks = 1, lines = 1, preview = 0 } = {}) {
    let active = null;
    for (const p of parts) {
      const pv = preview > 0 && p.until === Infinity;
      const s = pv ? 1 : clamp01((t - p.t0) / (p.t1 - p.t0));
      const gone = pv ? 0 : t > p.until ? clamp01((t - p.until) / 0.3) : (preview > 0 && p.until !== Infinity ? 1 : 0);
      p.s = s;
      p.pivot.visible = s > 0 && gone < 1;
      if (p.ghosts) for (const g of p.ghosts) g.visible = ghost > 0 && s <= 0 && !pv;
      if (!p.pivot.visible) continue;
      const e = easeOut(s);
      p.pivot.scale.set(1, 1, 1);
      p.obj.position.set(0, 0, 0);
      if (p.how === 'drop') p.obj.position.y = (1 - e) * p.drop;
      else if (p.how === 'rise') p.pivot.scale.y = Math.max(1e-3, e);
      else if (p.how === 'grow') p.pivot.scale.setScalar(Math.max(1e-3, e));
      if (gone > 0) p.pivot.scale.multiplyScalar(Math.max(1e-3, 1 - gone));
      if (pv && preview < 1) p.pivot.scale.y *= Math.max(1e-3, preview);
      const heat = !pv && p.hot && t < weeks ? (s < 1 ? 1 : 1 - smooth(p.t1, p.t1 + 0.25, t)) : 0;
      // ④ 도면 모드: 종이색으로 (방 단위 roomDraw가 있으면 그 값)
      const k = Math.max(drawK, p.room && roomDraw ? (roomDraw[p.room] ?? 0) : 0);
      for (const m of p.mats) {
        if (m.userData.drawUniform) m.userData.drawUniform.value = k;
        m.color.copy(m.userData.base).lerp(ACCENT, heat * 0.25).lerp(PAPER, k * 0.93);
        if (m.userData.glass) m.opacity = m.userData.op * (1 - 0.6 * k);
      }
      for (const em of p.edgeMats) {
        em.color.copy(INKC).lerp(ACCENT, heat);
        em.opacity = Math.max(0.25 * lines + 0.65 * heat, 0.7 * k);
      }
      if (p.lift && s > 0 && s < 1 && (!active || p.t0 > active.t0)) active = p;
    }
    dash.opacity = 0.5 * ghost;
    return active;
  }

  function dispose() {
    root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) [o.material].flat().forEach(m => m.dispose());
    });
  }

  return { THREE, TX, mat, solid, box, cbox, cyl, merged, add, retime, update, dispose, root, ghostRoot, parts, ink, dash };
}
