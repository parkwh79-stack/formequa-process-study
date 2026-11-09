// ─────────────────────────────────────────────────────────────────────────────
// main.js — 무대(렌더러·빛·클리핑) + 스크롤 대본 + 유형 전환 + HUD
//
// 스크롤 진행도 p(0~1) 하나가 전부를 움직입니다 (원본: "One scroll value drives everything").
//   (로딩) 플로터 인트로 — 컷 평면이 지면에서 지붕까지 올라가며 입면도를 '그린다'
//   0.00–0.03 입면도 — 완성 건물을 종이+45° 해칭 그림자로 (07)   0.50–0.53 준공 가로 시점 (고층은 앙각)
//   0.03–0.09 돌리 줌 + 스캔 평면 스윕: 선 → 재질 (02·07)
//   0.09–0.16 대지·법규 → 0.16–0.50 공정 달력(굴착 개요 → 지상 관찰)
//   0.53–0.615 단면 개요 → 1층 눈높이 / 0.615–0.675 입구·1층 방문
//   0.675–0.745 평면도 / 0.745–0.81 착지 / 0.81–0.985 유형별 실내·승강기
//   0.985–   마무리 요약 패널
// 디버그: ?type=dasedae  ?p=0.7  ?hour=20  ?est  ?nointro  ?q=low(저사양: 하늘·AO 끔)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TYPES } from './types.js';
import { RULES_ASOF } from './law.js';
import { PRJ, loadType, recompute, phaseByKey, floorY, roofY, dateAt, fmtDate, workDaysTo, clamp01, smooth, lerp, C, PYEONG } from './project.js';
import { buildAll } from './building.js';
import { FX } from './kit.js';
import { camAt, setCam, framePose, limitCameraProgress, focalMM, poseToKey, makeTour } from './camera.js';
import { sunPosition } from './sun.js';
import { ganttSVG, financeSVG, financeNums, renderEstimate, tourCard, radarSVG, won } from './ui.js';
import { P, CHAPTERS, chapterAt, progressPerSecond, storyToScroll, scrollToStory } from './story.js';
import { buildWalkthrough, groundVisit, motionProfile } from './walkthrough.js';
import { createWalkInput, createProgressFollower, queueScrollProgress } from './scroll-motion.js';

const q = new URLSearchParams(location.search);
const FIXED_P = q.has('p') ? parseFloat(q.get('p')) : null;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const $ = id => document.getElementById(id);
const weekAt = p => clamp01((p - P.lawEnd) / (P.buildEnd - P.lawEnd)) * PRJ.WEEKS;     // 법규 장면이 끝나야 착공
const pAtWeek = w => P.lawEnd + (w / PRJ.WEEKS) * (P.buildEnd - P.lawEnd);
const lawU = p => clamp01((p - P.open) / (P.lawEnd - P.open));                         // 법규 장면 진행도 0~1

// ── 렌더러 · 장면 ─────────────────────────────────────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e4);   // y < cut만 그린다 (평면도 컷)
const secPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1e4);  // z < sec만 그린다 (단면 컷)
renderer.clippingPlanes = [cutPlane, secPlane];

const scene = new THREE.Scene();
const SUN45 = new THREE.Vector3(-0.56, 0.62, 0.55).normalize(), sunDir = SUN45.clone(), desiredSun = new THREE.Vector3();
const paper = new THREE.Color(C.paper), nightSky = new THREE.Color(0x1b2233), HAZE = new THREE.Color(0xd9e1e6);
scene.background = paper.clone();
scene.fog = new THREE.Fog(paper.clone(), 100, 400);
const pmrem = new THREE.PMREMGenerator(renderer);
const roomEnv = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = roomEnv;

// ── 실사 품질 (v3.3): 물리 하늘 + 하늘 반사 환경맵 + GTAO(앰비언트 오클루전) ─────────────
// 고품질은 데스크톱 기본. ?q=low 또는 화면의 '고품질' 버튼으로 끈다.
let HQ = q.has('q') ? q.get('q') !== 'low' : !(innerWidth < 760 || matchMedia('(pointer: coarse)').matches);
function skyMesh(opacityUniform) {
  const s = new Sky();
  const m = s.material;
  m.uniforms.uGain = { value: 0.42 }; m.uniforms.uOpacity = opacityUniform;
  m.fragmentShader = 'uniform float uGain;\nuniform float uOpacity;\n' + m.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * uGain, uOpacity );');
  m.transparent = true; m.depthWrite = false;
  Object.assign(m.uniforms, { turbidity: { value: 5.5 }, rayleigh: { value: 1.4 }, mieCoefficient: { value: 0.004 }, mieDirectionalG: { value: 0.82 } });
  return s;
}
const sky = skyMesh({ value: 0 }); sky.renderOrder = -1; sky.frustumCulled = false;
scene.add(sky);
const envScene = new THREE.Scene(), envSky = skyMesh({ value: 1 }); envSky.scale.setScalar(900); envScene.add(envSky);
envSky.material.uniforms.sunPosition = sky.material.uniforms.sunPosition;      // 같은 태양
let skyEnvRT = null, lastEnvSun = new THREE.Vector3(0, -1, 0);
function updateSkyEnv(dir) {
  if (skyEnvRT && dir.distanceTo(lastEnvSun) < 0.04) return;
  lastEnvSun.copy(dir);
  const rt = pmrem.fromScene(envScene, 0, 0.1, 2000);
  if (skyEnvRT) skyEnvRT.dispose();
  skyEnvRT = rt;
}
const hemi = new THREE.HemisphereLight(0xfffcf5, 0xd5cbb8, 1.2);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(hemi, sun, sun.target);
const camera = new THREE.PerspectiveCamera(2, 1, 1, 3000);
const composer = new EffectComposer(renderer);
composer.renderTarget1.samples = composer.renderTarget2.samples = Math.min(4, renderer.capabilities.maxSamples);
composer.addPass(new RenderPass(scene, camera));
const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
gtao.output = GTAOPass.OUTPUT.Default;
gtao.updateGtaoMaterial({ radius: 0.8, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
composer.addPass(gtao);
composer.addPass(new OutputPass());
const groundLine = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: C.ink, transparent: true }));
scene.add(groundLine);

// ── 월드 (유형마다 다시 만든다) ──────────────────────────────────────────
let W = null;            // { B, KEYS, tour, ... }
const FOV_WALK = () => motionProfile(PRJ.T).fov + (innerWidth / innerHeight < 0.9 ? 6 : 0);
function narrativePose(p){
  if(p>=P.land)return {...W.tour.sample(tourU(p)),fov:FOV_WALK()};
  if(p>=P.entry&&p<=P.cut){
    const u=p<=P.ground?(p-P.entry)/(P.ground-P.entry):1-(p-P.ground)/(P.cut-P.ground);
    return {...W.groundTour.sample(u),fov:FOV_WALK()};
  }
  return framePose(camAt(p,W.KEYS,camera.aspect));
}

// ── 유형별 카메라 동선 (공정 구간) ───────────────────────────────────────
// 실제 공정 시점에 맞춘 굴착 개요 → 골조 이후 지상 눈높이의 유형별 관찰 호.
function buildKeys(T, H, big, siteW, hd) {
  const ph = k => PRJ.PHASES.find(x => x.key === k);
  const pw = w => pAtWeek(w);
  const tall = T.floors >= 6, timber = T.structure === 'timber';
  const angles = motionProfile(T).yaw;
  const earth = ph('earth'), frame = ph('frame'), facade = ph('facade'), interior = ph('interior');
  const ks = [];
  ks.push({ p: P.lawEnd + 0.012, t: [0, H * 0.1, 0], fh: big * 2.3, fov: 34, yaw: 30, pitch: 34, minW: siteW * 1.6 });
  if (T.basement) ks.push({ p: pw((earth.w0 + earth.w1) * 0.5), t: [0, -T.basement * 0.5, 0], fh: T.W * 2.1, fov: 38, yaw: 16, pitch: 46, minW: siteW * 1.35 });   // 흙막이 속을 내려다봄
  else ks.push({ p: pw((earth.w0 + earth.w1) * 0.5), t: [0, 0, 0], fh: big * 1.7, fov: 36, yaw: timber ? -20 : 22, pitch: 30, minW: siteW * 1.4 });
  ks.push({ p: pw(frame.w0), t: [0, 1.5, 0], fh: big * (tall ? 1.6 : 1.8), fov: 38, yaw: 34, pitch: tall ? 16 : 22, minW: siteW * 1.3 });
  ks.push({ p: pw(frame.w0 + (frame.w1 - frame.w0) * 0.5), t: [0, H * 0.32, 0], fh: tall ? H * 1.3 : big * 2.0, fov: 40, yaw: tall ? 72 : 58, pitch: tall ? 8 : 14, minW: T.W * 1.8, ease: u => u });
  ks.push({ p: pw(frame.w1), t: [0, H * (tall ? 0.62 : 0.5), 0], fh: tall ? H * 1.25 : big * 1.85, fov: 42, yaw: tall ? 118 : 92, pitch: tall ? 2 : 10, minW: T.W * 1.7 });
  ks.push({ p: pw(facade.w0 + (facade.w1 - facade.w0) * 0.55), t: [T.W * 0.18, H * 0.4, hd], fh: H * (timber ? 1.5 : 1.0), fov: 46, yaw: -26, pitch: timber ? 8 : 4, minW: T.W * 1.2 });   // 외장 근접 패스
  ks.push({ p: pw((interior.w0 + interior.w1) * 0.5), t: [0, H * 0.4, 0], fh: big * 1.6, fov: 36, yaw: -8, pitch: 18, minW: siteW * 1.3 });
  ks.push({ p: P.buildEnd, t: [0, H * 0.5, 0], fh: tall ? H * 1.4 : big * 1.55, fov: 34, yaw: 26, pitch: timber ? 9 : 12, minW: siteW * 1.4 });
  // 공정 구간은 아래쪽 1/3을 공정표(dock)가 가리므로 피사체를 화면 위쪽(보이는 영역 중앙)으로 올린다
  const aspect = innerWidth / innerHeight, dockHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--dockH')) || 284;
  const dockFrac = Math.min(0.42, dockHeight / innerHeight);
  for (const k of ks) {
    let fh = Math.max(k.fh, (k.minW || 0) / aspect);
    // At handover fit the complete building in the area above the programme.
    if (k.p === P.buildEnd) { fh /= 1 - dockFrac; k.fh = fh; }
    k.t = [k.t[0], k.t[1] - fh * dockFrac * 0.5, k.t[2]];
  }
  ks.sort((a, b) => a.p - b.p);
  // A quiet, type-specific inspection arc. No 100° orbit or reverse whip past the facade.
  ks.forEach((k, i) => {
    const angle = angles[Math.min(i, angles.length - 1)]; k.yaw = angle; delete k.ease;
    if (k.p >= pw(frame.w0)) {
      const radius = Math.max(siteW * 1.2, H * 1.6, T.W / aspect * 1.05) / (1 - dockFrac);
      const eye = floorY(1) + 1.6, a = angle * Math.PI / 180;
      const targetY = H * 0.45;
      Object.assign(k, poseToKey([Math.sin(a) * radius, eye, hd + Math.cos(a) * radius], [0, targetY, 0], FOV_WALK()), { eyeHeight: eye, viewShift: dockFrac * 0.5, minW: 0 });
    }
  });
  const out = [];
  for (const k of ks) if (k.p > P.lawEnd && k.p <= P.buildEnd && (!out.length || k.p - out[out.length - 1].p > 0.012)) out.push(k);
  if (out[out.length - 1].p < P.buildEnd) out.push(ks[ks.length - 1]);
  return out;
}
// 단면 개요(6°) → 1층 눈높이 → 외부 입구. 상층 순회 없이 지상 동선으로 연결한다.
const SEC_Z = T => T.secZ ?? 0.2;
function sectionKeys(T, H) {
  const z = SEC_Z(T), fh = H * 1.5, eye = floorY(1) + 1.6, visit = groundVisit(T);
  const ground = { ...poseToKey([T.W * 0.12, eye, z + 5.5], [T.W * 0.12, eye - 0.06, z - 3], FOV_WALK()), eyeHeight: eye };
  return [
    { p: P.secIn, t: [0, H * 0.46, z], fh, fov: 6, yaw: 0, pitch: 1, minW: T.W * 1.7 },
    { p: P.secIn + 0.02, ...ground },
    { p: P.secOut - 0.012, ...poseToKey([T.W * 0.08, eye, z + 4.5], [T.W * 0.08, eye - 0.06, z - 3], FOV_WALK()), eyeHeight: eye },
    { p: P.secOut, ...poseToKey(visit[0].pos, visit[0].look, FOV_WALK()), eyeHeight: eye },
  ];
}
// 준공 가로 시점: 고층은 지면 가까이서 올려다보는 앙각, 저층은 눈높이 — P.street~P.cut 동안 천천히 옆으로 걸으며 머문다
function streetKeys(T, H, hd) {
  const k = streetKey(T, H, hd);
  return [k];
}
function streetKey(T, H, hd) {
  const visit = groundVisit(T), x = visit[0].pos[0], eye = visit[0].pos[1];
  return { p: P.street, ...poseToKey([x + T.W * 0.12, eye, hd + Math.max(9, H * 0.65)], [x, Math.min(H * 0.24, 7), 0], FOV_WALK()), eyeHeight: eye };
}
function buildWorld() {
  const T = PRJ.T;
  const B = buildAll();
  B.retime();
  scene.add(B.root);
  const half = Math.max(T.site.x1 - T.site.x0, T.site.z1 - T.site.z0) * 0.75 + 6;
  Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 220 });
  sun.shadow.camera.updateProjectionMatrix();
  groundLine.geometry.setFromPoints([new THREE.Vector3(-90, 0.02, T.site.z1), new THREE.Vector3(90, 0.02, T.site.z1)]);

  const pf = T.planFloor, yOff = floorY(pf), profile = motionProfile(T);
  const tour = makeTour(buildWalkthrough(T), 0, { speed: profile.speed });
  const groundTour = makeTour(groundVisit(T), 0, { speed: profile.speed });
  const groundKey = u => { const s = groundTour.sample(u); return { ...poseToKey(s.pos.toArray(), s.look.toArray(), FOV_WALK()), eyeHeight: s.pos.y }; };
  for (const texture of Object.values(B.K.TX)) if (texture?.isTexture) texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const H = roofY() + (T.roof === 'flat' ? 3 : 2.5), hd = T.D / 2, siteW = T.site.x1 - T.site.x0;
  const elevFh = H * 1.9, big = Math.max(H, siteW * 0.6);
  const start = poseToKey(tour.startPos, tour.startLook, FOV_WALK());
  const mkKeys = () => [
    { p: 0, t: [-siteW * 0.34, H * 0.5 - elevFh * 0.12, 0], fh: elevFh, fov: 2, minW: siteW * 1.75 },        // 입면도: 왼쪽 글 자리를 비우고 건물을 오른쪽에
    { p: P.flat, t: [-siteW * 0.34, H * 0.5 - elevFh * 0.12, 0], fh: elevFh, fov: 2, minW: siteW * 1.75 },
    { p: P.open, t: [0, H * 0.12, 0], fh: big * 2.3, fov: 34, yaw: 30, pitch: 38, minW: siteW * 1.6 },
    { p: P.open + 0.45 * (P.lawEnd - P.open), t: [0, H * 0.3, 0], fh: big * 2.4, fov: 30, yaw: 48, pitch: 30, minW: siteW * 1.7 },   // 층별 영역이 쌓이는 모습
    { p: P.open + 0.68 * (P.lawEnd - P.open), t: [0, H * 0.4, -T.D * 0.2], fh: big * 2.6, fov: 30, yaw: 64, pitch: 26, minW: siteW * 1.8 },   // 비스듬히 옆에서 일조사선
    { p: P.lawEnd - 0.006, t: [-siteW * 0.28, 0, T.D * 0.25], fh: (T.site.z1 - T.site.z0) * 2.1, fov: 30, yaw: 14, pitch: 64, minW: siteW * 2.2 },       // 위에서 주차구획
    ...buildKeys(T, H, big, siteW, hd),
    ...streetKeys(T, H, hd),
    ...sectionKeys(T, H),
    { p: P.entry, ...groundKey(0) },
    { p: P.entry + 0.012, ...groundKey(0.5) },
    { p: P.ground, ...groundKey(1) },
    { p: P.cut, ...groundKey(0) },
    { p: P.planIn - 0.016, t: [0, yOff, 0.5 + (T.planShiftZ || 0)], fh: (T.D + (T.wing?.depth || 0)) * 1.8, fov: 18, yaw: 0, pitch: 65, minW: T.W * 1.8 },
    { p: P.planIn, t: [0, yOff, 0.5 + (T.planShiftZ || 0)], fh: (T.D + (T.wing?.depth || 0)) * 1.5, fov: 2.5, yaw: 0, pitch: 89.5, minW: T.W * 1.75 },
    { p: P.planHold, t: [0, yOff, 0.5 + (T.planShiftZ || 0)], fh: (T.D + (T.wing?.depth || 0)) * 1.5, fov: 2.5, yaw: 0, pitch: 89.5, minW: T.W * 1.75 },
    { p: P.land, ...start },
  ];
  const KEYS = mkKeys();
  // 스캔 평면 (주황 반투명 + 테두리)
  const scanH = H + 6, scanD = (T.site.z1 - T.site.z0) + 14;
  const scan = new THREE.Group();
  scan.add(new THREE.Mesh(new THREE.PlaneGeometry(scanD, scanH).rotateY(Math.PI / 2).translate(0, scanH / 2, (T.site.z0 + T.site.z1) / 2),
    new THREE.MeshBasicMaterial({ color: C.accent, transparent: true, opacity: 0.13, side: THREE.DoubleSide, depthWrite: false })));
  scan.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(scanD, scanH).rotateY(Math.PI / 2).translate(0, scanH / 2, (T.site.z0 + T.site.z1) / 2)),
    new THREE.LineBasicMaterial({ color: C.accent })));
  scan.visible = false; B.root.add(scan);
  const sweepR = siteW * 0.62 + 4;
  // 방이 공개되는 시점(투어 u)
  const revealAt = {};
  tour.stops.forEach(s => (s.reveal || [s.room]).forEach(id => { const key=`${s.floor||currentFloor(tour.keys[s.i].pos[1])}:${id}`; if (revealAt[key] == null) revealAt[key] = s.u0; }));
  const allRooms = Object.values(B.rooms).flat();
  const roomById = Object.fromEntries(allRooms.map(r => [r.id, r]));
  // 평면도 라벨 (방 이름 · ㎡ · 평)
  $('plabels').innerHTML = '';
  const labels = (B.rooms[pf] || []).map(r => {
    const el = document.createElement('div'); el.className = 'pl';
    el.innerHTML = `<b>${r.name}</b><span>${r.area.toFixed(1)}㎡ · ${(r.area / PYEONG).toFixed(1)}평</span>`;
    $('plabels').appendChild(el);
    return { el, p: new THREE.Vector3(r.cx, r.y + 0.05, r.cz), big: r.area > 6 };
  });
  // 평면 치수선 (Casa Larga sheet.js처럼 도면 요소를 3D 바닥에 둔다) + 치수 라벨
  const dimY = floorY(pf) + 0.06, off = 1.4, hw = T.W / 2, tk = 0.35;
  const dimPts = [[-hw, hd + off, hw, hd + off], [-hw, hd + off - tk, -hw, hd + off + tk], [hw, hd + off - tk, hw, hd + off + tk],
                  [hw + off, -hd, hw + off, hd], [hw + off - tk, -hd, hw + off + tk, -hd], [hw + off - tk, hd, hw + off + tk, hd]]
    .flatMap(([x0, z0, x1, z1]) => [new THREE.Vector3(x0, dimY, z0), new THREE.Vector3(x1, dimY, z1)]);
  const dims = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(dimPts), new THREE.LineBasicMaterial({ color: C.ink }));
  dims.visible = false; B.root.add(dims);
  [[`${T.W.toFixed(2)}m`, 0, dimY, hd + off + 0.6], [`${T.D.toFixed(2)}m`, hw + off + 1.0, dimY, 0]].forEach(([t, x, y, z]) => {
    const el = document.createElement('div'); el.className = 'pl dim'; el.innerHTML = `<span>${t}</span>`;
    $('plabels').appendChild(el); labels.push({ el, p: new THREE.Vector3(x, y, z) });
  });
  // 입면도 레벨 핀
  $('pins').innerHTML = '';
  const pins = [];
  for (let n = 1; n <= T.floors + 1; n++) {
    const el = document.createElement('div'); el.className = 'lv';
    const y = floorY(n);
    el.innerHTML = `<i></i><b>+${y.toFixed(2)}</b><span>${n <= T.floors ? (n === 1 && T.piloti ? '1F 필로티' : n + 'F') : (T.roof === 'flat' ? '지붕' : '처마')}</span>`;
    $('pins').appendChild(el); pins.push({ el, p: new THREE.Vector3(T.W / 2 + 1.0, y, hd) });
  }
  // 투어 정지점 점(dot) 버튼
  $('tdots').innerHTML = tour.stops.map((s, i) => `<button data-i="${i}" title="${s.title}" aria-label="정지점 ${i + 1}: ${s.title}"></button>`).join('');
  $('tdots').querySelectorAll('button').forEach(b => b.addEventListener('click', () => goStop(+b.dataset.i)));
  // 정지점 이름 탭 (01·05·07)
  $('stabs').innerHTML = tour.stops.map((s, i) => `<button data-i="${i}">${String(i + 1).padStart(2, '0')} ${s.title.replace(' · 승강기',' EV')}</button>`).join('');
  $('stabs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => goStop(+b.dataset.i)));

  // 컷 높이: 평면도 1.2m → 벽 상단(천장 아래) → 카메라가 눈높이에 닿으면 위층이 다시 '닫힌다'
  const slabT = T.structure === 'rc' ? 0.25 : 0.3;
  const top = pf < T.floors ? floorY(pf + 1) - slabT : roofY();
  const planCut = floorY(pf) + 1.2;
  const wallTop = top - 0.08;
  const ceilCut = (pf < T.floors ? floorY(pf + 1) : roofY()) - 0.03;
  const inside = v => Math.abs(v[0]) < T.W / 2 - 0.05 && Math.abs(v[2]) < T.D / 2 - 0.05;
  const finalCut = inside(tour.startPos) ? ceilCut : 1e4;
  W = { scan, scanH, sweepR, mkKeys, B, KEYS, tour, groundTour, revealAt, roomById, allRooms, labels, pins, dims, planCut, wallTop, ceilCut, finalCut, inside, startY: tour.startPos[1], groundBase: B.groundMat.color.clone() };
  syncTypeUI();
}

// ── 법규 장면 카드 (스크롤 단계마다 한 줄씩 강조) ─────────────────────────
function lawCardHTML() {
  const F = PRJ.fit, L = PRJ.law, T = PRJ.T, z = F.z, m = F.m, site = F.site;
  const r = k => F.rows.find(x => x.k === k) || {};
  const sb = T.setback || { front: 1, side: 0.5 };
  const okN = F.rows.filter(x => !x.advisory && x.ok !== false).length, allN = F.rows.filter(x => !x.advisory).length;
  return `<div class="lk">법규 검토 · ${z.name}</div>
  <ol>
    <li data-step="0"><b>① 대지 · 건폐율</b><span>대지 ${L.siteW}×${L.siteD}m = <em>${site.toFixed(0)}㎡</em> · 전면도로 ${L.road}m<br>건폐율 ≤ ${z.bcr}% → 건축면적 최대 <em>${(site * z.bcr / 100).toFixed(0)}㎡</em></span></li>
    <li data-step="1"><b>② 용적률 · 층별 건축가능영역</b><span>용적률 ≤ ${z.far}% → 지상 연면적 최대 <em>${(site * z.far / 100).toFixed(0)}㎡</em><br>점선 = 층마다 대지 − 공지(전면 ${F.front.toFixed(1)}m · 측면 ${sb.side}m) − 일조 이격</span></li>
    <li data-step="2"><b>③ ${z.sun ? '정북방향 일조' : '후면 이격'}</b><span>${z.sun ? `높이 10m 이하 1.5m · 초과 부분 높이의 1/2<br>계획 높이 ${m.height.toFixed(1)}m → 북측 이격 <em>${F.north.toFixed(2)}m</em> 이상` : `이 용도지역은 정북 일조 기준이 없습니다<br>후면 공지 ${F.north.toFixed(1)}m만 확보`}</span></li>
    <li data-step="3"><b>④ ${F.auto ? '자동 최대 매스' : '템플릿 설계 검토'}</b><span>${F.feasible === false ? '모든 조건을 만족하는 매스가 없습니다 — 산정 패널에서 대지·용도지역을 바꿔 보세요' :
      `<em>${F.n}층</em> · 평면 ${m.W.toFixed(1)}×${m.D.toFixed(1)}m · 지상 ${m.farArea.toFixed(0)}㎡<br>건폐율 ${r('bcr').plan.toFixed(1)}% · 용적률 ${r('far').plan.toFixed(1)}% · 필수 항목 ${okN}/${allN} 적합<br>${parkLine()}`}</span></li>
  </ol>
  <small>학습·사전검토용 · 인허가 판단 아님 · 기준일 ${RULES_ASOF}</small>`;
}

function parkLine() {
  const P = PRJ.park; if (!P) return '';
  const { R, L } = P;
  return L.kind === 'mech' ? `주차 법정 <em>${R.req}대</em> → 지하 기계식 ${L.perLevel}대/층 · 지하 ${L.levels}개층 필요`
    : `주차 법정 <em>${R.req}대</em> · ${L.kind === 'piloti' ? '필로티' : '옥외'} 배치 ${L.provided}대 ${L.provided >= R.req ? '충족' : '부족'}`;
}
// ── 마무리 패널 (투어 끝): 프로젝트 요약 + 다음 행동 — 홈페이지에서는 여기에 소개·문의를 붙인다 ──
const TYPE_ORDER = ['midsize', 'geunsaeng', 'dasedae', 'dormitory', 'jeonwon'];
function closingHTML() {
  const T = PRJ.T, F = PRJ.fit, e = PRJ.est, last = PRJ.CASH[PRJ.CASH.length - 1];
  const nextKey = TYPE_ORDER[(TYPE_ORDER.indexOf(PRJ.key) + 1) % TYPE_ORDER.length];
  return `<div class="ck">PROJECT SUMMARY · ${T.short}</div>
  <h2>Every place, <em>a possibility.</em></h2>
  <p class="cname">${T.name}</p>
  <div class="cgrid">
    <div><span>대지 · 용도지역</span>${F.site.toFixed(0)}㎡ · ${F.z.name}</div>
    <div><span>규모</span>${T.basement ? '지하1층 · ' : ''}지상 ${T.floors}층 · ${T.structure === 'rc' ? '철근콘크리트' : '경량목구조'}</div>
    <div><span>연면적</span>${e.A.gfa.toFixed(0)}㎡ <em>${(e.A.gfa / PYEONG).toFixed(0)}평</em></div>
    <div><span>건폐율 · 용적률</span>${e.A.bcr.toFixed(1)}% · ${(F.rows.find(r => r.k === 'far')?.plan ?? 0).toFixed(1)}%</div>
    <div><span>총공사비</span>${won(e.total)} <em>${Math.round(e.perPy).toLocaleString()}만원/평</em></div>
    <div><span>공사기간</span>${PRJ.WEEKS.toFixed(1)}주 · ${fmtDate(dateAt(PRJ.WEEKS))} 준공</div>
    <div><span>주차</span>법정 ${PRJ.park?.R.req ?? '—'}대 · ${PRJ.park?.L.kind === 'mech' ? `지하 기계식 ${PRJ.park.L.levels}개층` : `${PRJ.park?.L.provided ?? 0}대 배치`}</div>
    <div><span>${T.unitsPerFloor ? '세대' : T.roomsPerFloor ? '임대 객실' : '시설'}</span>${T.unitsPerFloor ? F.m.units + '세대 · 전용 약 ' + F.m.exclusive.toFixed(0) + '㎡' : T.roomsPerFloor ? F.m.rooms + '실' : T.kind}</div>
    <div class="w"><span>총사업비 (토지 + 공사 + 이자)</span><b>${won(last.total)}</b></div>
  </div>
  <div class="cbtn">
    <button data-c="top">처음부터 ↺</button>
    <button data-c="est" class="solid">법규·공사비 산정 열기</button>
    <button data-c="next" data-k="${nextKey}">다음 유형: ${TYPES[nextKey].short} →</button>
  </div>
  <div class="researcher"><div><p class="eyebrow">THE RESEARCHER</p><b>박완희 <i>Wanhee Park</i></b></div>
    <nav><a href="https://wan2-website.web.app/" target="_blank" rel="noopener">POWERED BY WAN2 ↗</a><a href="https://formequa-research.web.app/#home" target="_blank" rel="noopener">FORMEQUA ↗</a></nav></div>
  <small>학습·사전검토용 화면입니다. 실제 인허가·공사비는 전문가 검토가 필요합니다.</small>`;
}
function bindClosing() {
  $('closing').querySelectorAll('[data-c]').forEach(b => b.addEventListener('click', () => {
    const c = b.dataset.c;
    if (c === 'top') navigate(0, false, true);
    if (c === 'est') { setPlaying(false); document.body.classList.add('estOpen'); }
    if (c === 'next') switchType(b.dataset.k);
  }));
}

// 법규 장면: 대지 경계 → 층별 영역(아래층부터) → 일조사선을 차례로 켠다. 다른 구간에서는 전부 켠다.
function envelopeStage(EU, lu, inLaw) {
  const all = !inLaw;
  if (EU.outline) EU.outline.visible = all || lu > 0.02;
  const nF = EU.floors.length;
  const parkStep = !all && lu > 0.8 && (EU.park || []).length > 0;          // ④에서는 층·사선을 걷어 내고 주차구획만
  EU.floors.forEach((f, i) => { const on = all || (lu > 0.25 + 0.3 * (i / Math.max(1, nF)) && !parkStep); f.objs.forEach(o => (o.visible = on)); });
  EU.sun.forEach(o => (o.visible = all || (lu > 0.55 && !parkStep)));
  (EU.park || []).forEach(o => (o.visible = all || lu > 0.78));
  return lu < 0.25 ? 0 : lu < 0.55 ? 1 : lu < 0.78 ? 2 : 3;
}

function disposeWorld() {
  if (!W) return;
  scene.remove(W.B.root); W.B.dispose(); W = null;
}

function syncTypeUI() {
  const T = PRJ.T, e = PRJ.est;
  document.querySelectorAll('[data-type]').forEach(a => { const on = a.dataset.type === PRJ.key; a.classList.toggle('on', on); a.setAttribute('aria-pressed', String(on)); });
  $('kicker').textContent = `${T.short} · ${T.kind}`;
  $('tbName').textContent = T.name;
  $('tbKind').textContent = `${T.kind} · 연면적 ${e.A.gfa.toFixed(0)}㎡ (${(e.A.gfa / PYEONG).toFixed(0)}평)`;
  $('heroFacts').innerHTML = `<div><dt>대지</dt><dd>${e.A.site.toFixed(0)}<small>㎡</small></dd></div><div><dt>규모</dt><dd>${T.floors}<small>층 · ${T.structure === 'rc' ? 'RC' : '목구조'}</small></dd></div><div><dt>연면적</dt><dd>${e.A.gfa.toFixed(0)}<small>㎡</small></dd></div>`;
  $('weekScrub').max = String(PRJ.WEEKS);
  $('planTitle').innerHTML = `<div class="pt-row"><svg class="north" viewBox="0 0 40 40" width="34" height="34"><circle cx="20" cy="20" r="17" fill="none" stroke="currentColor"/><path d="M20 4 L27 28 L20 23 L13 28 Z" fill="currentColor"/><text x="20" y="38.5" font-size="7" text-anchor="middle" fill="currentColor">N</text></svg>
    <div><b>${T.planFloor}층 평면도</b><span>실제로는 바닥 위 1.2m에서 자른 3D 모델 · 평면 ${T.W.toFixed(2)} × ${T.D.toFixed(2)}m</span></div></div>
    <div class="sbar"><i id="sbar"></i><span>0</span><span id="sbarL">5m</span></div>`;
  document.title = `${T.short} — FORMEQUA Process Study`;
  $('estTitle').textContent = `${T.short} · 법규·공사비·공기 산정`;
  renderEstimate(onEstimateChange);
  $('lawcard').innerHTML = lawCardHTML(); state.lawStep = -1;     // 법규 장면 카드
  $('closing').innerHTML = closingHTML(); bindClosing();          // 마무리 요약 (공사비 조건이 바뀌면 같이 갱신)
  state.dirty = true; state.dirtyTour = true; state.lastStop = -2;
}
function onEstimateChange(what, patch) {
  setPlaying(false);
  if (what === 'reset') { const p = state.target; disposeWorld(); loadType(PRJ.key); buildWorld(); state.target = state.p = p; return; }
  if (what === 'law') {                       // 대지·용도지역이 바뀌면 매스를 다시 산출하고 장면을 새로 만든다 (공사비 조건은 유지)
    const p = state.target; disposeWorld(); loadType(PRJ.key, { ...PRJ.law, ...patch }, true); buildWorld(); state.target = state.p = p; return;
  }
  W.B.retime();
  W.KEYS = W.mkKeys();                        // 공정이 바뀌면 카메라 동선도 공정 시점에 다시 맞춘다
  syncTypeUI();
}

function switchType(key) {
  if (!TYPES[key]) return;
  setPlaying(false); setTourFocus(false);
  try { history.replaceState(null, '', `?type=${key}`); } catch (e) { /* file:// 등에서는 무시 */ }
  disposeWorld();
  loadType(key);
  buildWorld();
  scrollTo(0, 0);
  state.p = state.target = FIXED_P ?? 0;
  motionFollower.reset(state.p);state.jump=null;
}

// ── 상태 · 입력 ─────────────────────────────────────────────────────────
const state = { beat: -2, intro: (FIXED_P == null && !q.has('nointro') && !reducedMotion.matches) ? 0 : 1, lawStep: -1, p: FIXED_P ?? 0, target: FIXED_P ?? 0, hour: q.has('hour') ? parseFloat(q.get('hour')) : 14, playing: false, playTo:null, seeking: false, playBuildOnly: false, tourFocus: false, dirty: true, lastT: -1, lastHour: -1, lastStop: -2 };
const motionFollower=createProgressFollower(state.p);
const scrollMax = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
addEventListener('scroll', () => { if (FIXED_P == null && performance.now()>(state.scrollSyncUntil||0)) scrubTo(scrollToStory(clamp01(scrollY / scrollMax())),false); }, { passive: true });
function scrollToP(p, smoothScroll = true) {
  const value = clamp01(p);
  state.target = value;
  state.scrollSyncUntil=performance.now()+(smoothScroll?1200:120);
  if (FIXED_P == null) scrollTo({ top: storyToScroll(value) * scrollMax(), behavior: smoothScroll && !reducedMotion.matches ? 'smooth' : 'instant' });
}
function scrubTo(p,syncScroll=true){
  setPlaying(false);state.p=state.target=clamp01(p);state.intro=1;state.jump=null;state.travelDir=1;
  motionFollower.reset(state.p);$('sceneTransition').style.opacity=0;
  if(syncScroll)scrollToP(state.p,false);
}
function navigate(p, smoothScroll = true, seek = false) {
  setPlaying(false);state.intro=1;
  if(seek&&!reducedMotion.matches){
    state.jump={to:clamp01(p),t:0,applied:false};scrollToP(p,false);state.scrollSyncUntil=performance.now()+600;
  }else if(seek)scrubTo(p);
  else scrollToP(p,smoothScroll);
}
function setPlaying(on, buildOnly = false) {
  state.playing = on; state.playBuildOnly = on && buildOnly;
  if(!on) state.playTo=null;
  else {state.seeking=false;state.target=state.p;state.jump=null;motionFollower.reset(state.p);}
  $('play').classList.toggle('on', on); $('play').setAttribute('aria-pressed', String(on));
  $('play').textContent = on ? '❚❚ 정지' : '▶ 자동 재생';
  $('tourPlay').textContent = on ? '❚❚ 일시정지' : '▶ 층별 투어';
  $('tourPlay').setAttribute('aria-pressed',String(on));
  $('buildPlay').setAttribute('aria-pressed', String(on && buildOnly));
  $('buildPlay').textContent = on && buildOnly ? '❚❚ 일시정지' : '▶ 공정 재생';
}
function setTourFocus(on) {
  state.tourFocus = on;
  document.body.classList.toggle('tourFocus', on);
  $('tourDetails').hidden = on; $('radar').hidden = on;
  $('tourToggle').setAttribute('aria-expanded', String(!on));
  $('tourToggle').textContent = on ? '설명 펼치기 ↙' : '공간만 보기 ↗';
}
function updateJourney(p) {
  const index = chapterAt(p), chapter = CHAPTERS[index];
  $('chapterLabel').textContent = `${String(index + 1).padStart(2, '0')} / ${CHAPTERS.length} · ${chapter.title}`;
  $('scenePercent').textContent = `${String(Math.round(p * 100)).padStart(3, '0')}%`;
  if (document.activeElement !== $('sceneScrub')) $('sceneScrub').value = String(Math.round(p * 1000));
  $('sceneScrub').setAttribute('aria-valuetext', `${chapter.title} · ${Math.round(p * 100)}%`);
  $('chapterPrev').disabled = index === 0; $('chapterNext').disabled = index === CHAPTERS.length - 1;
  document.querySelectorAll('[data-jump]').forEach(button => {
    const on = chapterAt(+button.dataset.jump) === index;
    if (on) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current');
  });
}
$('sceneScrub').addEventListener('input', e => scrubTo(+e.target.value / 1000));
$('weekScrub').addEventListener('input', e => scrubTo(pAtWeek(+e.target.value)));
$('chapterPrev').addEventListener('click', () => navigate(CHAPTERS[Math.max(0, chapterAt(state.p) - 1)].jump, true, true));
$('chapterNext').addEventListener('click', () => navigate(CHAPTERS[Math.min(CHAPTERS.length - 1, chapterAt(state.p) + 1)].jump, true, true));
$('enterStudy').addEventListener('click', () => navigate(0.06));
$('tourToggle').addEventListener('click', () => setTourFocus(!state.tourFocus));
$('buildPlay').addEventListener('click', () => {
  if (state.playing && state.playBuildOnly) { setPlaying(false); return; }
  if (state.p < P.lawEnd || state.p >= P.buildEnd) { state.p = state.target = P.lawEnd; scrollToP(P.lawEnd, false); }
  state.intro = 1; setPlaying(true, true);
});
const walkInput=createWalkInput();
function walkByGesture(pixels,event){
  if(!W||document.body.classList.contains('estOpen')||event.target.closest('input,select,textarea,.stabs,.est,.dock'))return false;
  if(state.jump){state.jump=null;state.target=state.p;motionFollower.reset(state.p);$('sceneTransition').style.opacity=0;}
  const seconds=walkInput(pixels,performance.now());
  event.preventDefault();
  if(seconds&&state.p>=P.land&&state.p<P.close){
    const u=tourU(state.p),next=W.tour.skipDwell(u,Math.sign(seconds));
    if(Math.abs(next-u)>1e-9){
      state.p=state.target=P.land+next*(P.close-P.land);motionFollower.reset(state.p);
    }
  }
  const rate=progressPerSecond(state.p,W.tour.duration);
  scrollToP(queueScrollProgress(state.p,state.target,seconds,rate),false);
  return true;
}
addEventListener('wheel', e => {
  if(e.ctrlKey||e.metaKey)return;
  setPlaying(false);state.seeking=false;state.scrollSyncUntil=0;
  if(Math.abs(e.deltaY)>=Math.abs(e.deltaX))walkByGesture(e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?innerHeight:1),e);
}, { passive: false });
let touchY=null;
addEventListener('touchstart', e => { setPlaying(false);state.seeking=false;state.scrollSyncUntil=0;touchY=e.touches.length===1?e.touches[0].clientY:null; }, { passive: true });
addEventListener('touchmove',e=>{if(touchY===null||e.touches.length!==1)return;const y=e.touches[0].clientY;walkByGesture((touchY-y)*2,e);touchY=y;},{passive:false});
document.addEventListener('visibilitychange', () => { if (document.hidden) setPlaying(false); });
document.addEventListener('focusin', e => { if (e.target.matches('input, select, textarea')) setPlaying(false); });

document.querySelectorAll('[data-type]').forEach(a => a.addEventListener('click', e => { e.preventDefault(); switchType(a.dataset.type); }));
let dragging = false;
function scrub(e) {
  const svg = $('gantt').querySelector('svg'); if (!svg) return;
  const r = svg.getBoundingClientRect(), x0 = +svg.dataset.x0, x1 = +svg.dataset.x1;
  const x = (e.clientX - r.left) * (svg.viewBox.baseVal.width / r.width);
  scrubTo(pAtWeek(clamp01((x - x0) / (x1 - x0)) * PRJ.WEEKS));
}
$('gantt').addEventListener('pointerdown', e => { if (e.button !== 0) return; e.preventDefault(); dragging = true; $('gantt').setPointerCapture(e.pointerId); scrub(e); });
addEventListener('pointermove', e => { if (dragging) scrub(e); });
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointercancel', () => (dragging = false));
document.querySelectorAll('[data-hour]').forEach(b => b.addEventListener('click', () => {
  state.hour = parseFloat(b.dataset.hour);
  document.querySelectorAll('[data-hour]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
}));
document.querySelectorAll('[data-jump]').forEach(b => b.addEventListener('click', () => navigate(+b.dataset.jump, true, true)));
$('play').addEventListener('click', () => { if (!state.playing && state.p >= 0.999) { state.p = state.target = 0; scrollToP(0, false); } setPlaying(!state.playing); });
$('tourPlay').addEventListener('click',()=>setPlaying(!state.playing));
$('rideLift').addEventListener('click',()=>{const i=W.tour.stops.findIndex(s=>s.kind==='elevator'&&s.u>tourU(state.p)+0.001);if(i>=0)goStop(i);});
$('estBtn').addEventListener('click', () => { setPlaying(false); document.body.classList.toggle('estOpen'); });
$('hq').classList.toggle('on', HQ);
$('hq').addEventListener('click', () => { HQ = !HQ; $('hq').classList.toggle('on', HQ); state.dirty = true; });
$('estClose').addEventListener('click', () => document.body.classList.remove('estOpen'));
const tourU = p => clamp01((p - P.land) / (P.close - P.land));
const BEATS = [
  [() => P.flat + 0.004, () => P.open - 0.004, '02 — 스캔', '그림자는 모두 45°로 그린 도면입니다. 스캔 평면이 지나가면 <em>선이 재료가 됩니다.</em>'],
  [() => P.buildEnd + 0.004, () => P.street + 0.004, '05 — 준공', '해가 움직이면 <em>그림자도 함께</em> 움직입니다.'],
  [() => P.street + 0.004, () => P.secIn + 0.016, '06 — 단면', '절단면이 들어옵니다. <em>렌즈가 열려도 단면의 크기는 그대로.</em>'],
  [() => P.secIn + 0.016, () => P.secOut - 0.006, '06 — 단면', '사람의 눈높이에서 <em>1층 단면을 읽습니다.</em>'],
  [() => P.secOut, () => P.ground + 0.002, '07 — 입구·1층', '입구를 지나 <em>1층에 먼저 들어갑니다.</em>'],
  [() => P.ground + 0.002, () => P.planIn, '08 — 평면', '현관으로 나와, <em>방금 본 공간을 도면으로 읽습니다.</em>'],
  [() => P.planHold + 0.004, () => P.land - 0.004, '08 — 착지', '벽이 솟고, 눈높이로 <em>현관에 내려앉습니다.</em>'],
];
const sceneCode = p => p < P.flat ? 'ELV A-201 입면' : p < P.open ? 'SCAN 스윕' : p < P.lawEnd ? 'ZONING 법규' : p < P.buildEnd ? 'BUILD 공정' : p < P.street ? 'HANDOVER 준공'
  : p < P.secOut ? 'SECTION A-A 단면' : p < P.cut ? 'ENTRY 입구·1층' : p < P.planHold ? 'PLAN 평면' : p < P.land ? 'DESCENT 착지' : 'TOUR 실내';
function goStop(i) {
  const s = W.tour.stops[Math.max(0, Math.min(W.tour.stops.length - 1, i))];
  const goal=P.land+s.u*(P.close-P.land);
  if(reducedMotion.matches){navigate(goal,false,true);return;}
  setPlaying(true);state.playTo=goal;state.intro=1;
}
$('tprev').addEventListener('click', () => goStop(state.lastStop - 1));
$('tnext').addEventListener('click', () => { if (state.lastStop >= W.tour.stops.length - 1) navigate(0, false, true); else goStop(state.lastStop + 1); });
addEventListener('keydown', e => {
  if (e.target.closest('input, select, textarea, button, a, [contenteditable="true"]') || e.altKey || e.ctrlKey || e.metaKey || document.body.classList.contains('estOpen')) return;
  if (e.code === 'Space') { e.preventDefault(); $('play').click(); return; }
  if (tourU(state.p) <= 0) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); goStop(state.lastStop + 1); }
  if (e.key === 'ArrowLeft') { e.preventDefault(); goStop(state.lastStop - 1); }
  if (e.key.toLowerCase() === 'h') setTourFocus(!state.tourFocus);
});

function resize() { document.documentElement.style.setProperty('--headerH', `${document.querySelector('.top').getBoundingClientRect().height}px`); renderer.setSize(innerWidth, innerHeight, false); composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; if (W) W.KEYS = W.mkKeys(); state.dirty = true; }
addEventListener('resize', resize);
new ResizeObserver(() => document.documentElement.style.setProperty('--headerH', `${document.querySelector('.top').getBoundingClientRect().height}px`)).observe(document.querySelector('.top'));

// ── 한 프레임 ─────────────────────────────────────────────────────────────
const dirName = az => ['남', '남서', '서', '북서', '북', '북동', '동', '남동'][Math.round((((az % 360) + 360) % 360) / 45) % 8];
const v3 = new THREE.Vector3();
let last = performance.now();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (!W) return;
  let previousP=state.p;
  let proposed=state.p;
  if(state.jump){
    const jump=state.jump;jump.t+=dt;
    $('sceneTransition').style.opacity=jump.applied?Math.max(0,1-(jump.t-.16)/.24):Math.min(1,jump.t/.16);
    if(jump.t>=.16&&!jump.applied){
      if(jump.covered){state.p=state.target=jump.to;previousP=state.p;motionFollower.reset(state.p);jump.applied=true;jump.t=.16;state.dirty=true;}
      else jump.covered=true;
    }
    proposed=state.p;
    if(jump.t>=.4)state.jump=null;
  }else if (state.playing) {
    const end=state.playTo??(state.playBuildOnly?P.buildEnd:1), dir=end>=state.p?1:-1;
    const step=dt*progressPerSecond(state.p,W.tour.duration);
    const next=dir>0?Math.min(end,state.p+step):Math.max(end,state.p-step);
    proposed=next;
  }else{
    $('sceneTransition').style.opacity=0;
    proposed=reducedMotion.matches?state.target:motionFollower.step(state.p,state.target,dt);
  }
  if(!state.jump&&!reducedMotion.matches){
    const onFoot=state.p>=P.land||(state.p>=P.entry&&state.p<=P.cut),lift=state.p>=P.land&&W.tour.sample(tourU(state.p)).lift;
    proposed=limitCameraProgress(state.p,proposed,narrativePose,{angle:16*Math.PI/180*dt,distance:onFoot?(lift?.phase==='상승'?.85:1.05)*dt:Infinity,lens:.9*dt});
  }
  state.p=proposed;
  if(state.playing){
    const end=state.playTo??(state.playBuildOnly?P.buildEnd:1);
    scrollToP(state.p,false);motionFollower.reset(state.p);
    if(Math.abs(state.p-end)<1e-9)setPlaying(false);
  }
  if (state.intro < 1) state.intro = Math.min(1, state.intro + dt / 2.4);             // 플로터 인트로 2.4초
  const p = state.p, T = PRJ.T, t = weekAt(p), u = tourU(p);
  if(Math.abs(p-previousP)>1e-9)state.travelDir=Math.sign(p-previousP);
  if (Math.abs(p - (state.journeyP ?? -1)) > 0.0005 || state.dirty) { updateJourney(p); state.journeyP = p; }
  const inTour = p >= P.land;
  document.body.classList.toggle('walking', inTour && Math.abs(state.p-previousP) > 1e-9 && !W.tour.sample(u).dwell);

  // 1) 평면도 모드 강도 · 방별 선화
  const drawK = smooth(P.cut + 0.25 * (P.planIn - P.cut), P.planIn, p) * (1 - smooth(P.planHold + 0.5 * (P.land - P.planHold), P.land, p));
  const roomOn = smooth(P.cut + 0.25 * (P.planIn - P.cut), P.planIn, p);
  const roomDraw = {};
  for (const r of W.allRooms) { const ru = W.revealAt[r.renderId] ?? 0.97; roomDraw[r.renderId] = roomOn * (1 - smooth(ru - 0.015, ru, u)); }
  const ghost = 1 - 0.55 * smooth(P.open - 0.02, P.open + 0.04, p);
  // 입면 도면 → 스캔 스윕 (02·07): 완성 건물을 종이+해칭으로 그려 두고, 스캔 평면이 지나가면 재질로. 끝나면 땅으로 가라앉고 착공
  const sw = clamp01((p - P.flat) / (P.open - 0.016 - P.flat));
  const preview = p < P.open ? 1 - smooth(P.open - 0.014, P.open - 0.002, p) : 0;
  FX.uSweepK.value = p < P.open - 0.002 ? 1 : 0;
  FX.uSweep.value = lerp(-W.sweepR, W.sweepR, smooth(0, 1, sw));
  FX.uDpr.value = renderer.getPixelRatio();
  const lines = p < P.flat ? 2.8 : p < P.open ? lerp(2.8, 1, sw) : p < P.lawEnd ? 1 : p < P.buildEnd ? lerp(1, 0.45, smooth(P.lawEnd, P.lawEnd + 0.04, p)) : 0.16;   // 도면은 진하게, 실사 장면은 옅게
  W.B.update(t, { ghost, drawK, roomDraw, weeks: PRJ.WEEKS, lines, preview });
  const sweeping = p > P.flat && p < P.open - 0.012;
  W.scan.visible = sweeping;
  if (sweeping) {
    W.scan.position.x = FX.uSweep.value;
    v3.set(FX.uSweep.value, W.scanH, 0).project(camera);
    $('sweepLabel').style.transform = `translate(${((v3.x + 1) / 2 * innerWidth).toFixed(1)}px, ${((1 - v3.y) / 2 * innerHeight).toFixed(1)}px)`;
    $('sweepLabel').innerHTML = `<b>CAD SCAN</b> X = ${FX.uSweep.value.toFixed(2)} M<br><span>선 → 재질 · ${Math.round(sw * 100)}%</span>`;
  }
  $('sweepLabel').style.opacity = sweeping ? 1 : 0;

  // 2) 카메라: 프레임 키(돌리 줌) → 착지 후 시간 기반 보행 경로
  let camY, look;
  if(p>=P.entry&&p<=P.cut){
    const s=narrativePose(p);camera.clearViewOffset();camera.fov=s.fov;camera.near=.1;camera.far=160;
    camera.position.copy(s.pos);camera.up.set(0,1,0);camera.lookAt(s.look);camera.updateProjectionMatrix();
    scene.fog.near=60;scene.fog.far=420;camY=s.pos.y;look=s.look;state.cam={fov:s.fov};
  } else if (!inTour) {
    const c = camAt(p, W.KEYS, camera.aspect);
    const d = setCam(camera, c);
    scene.fog.near = d + 40; scene.fog.far = d + 320;
    camY = camera.position.y; look = new THREE.Vector3(...c.t);
    state.cam = c;
  } else {
    const s = W.tour.sample(u);
    if(s.lift&&state.travelDir<0){
      const phases={'상승':'하강','호출':'도착','도착':'호출','탑승':'하차','하차':'탑승','문 닫힘':'문 열림','문 열림':'문 닫힘'};
      s.lift={...s.lift,from:s.lift.to,to:s.lift.from,phase:phases[s.lift.phase]||s.lift.phase};
    }
    camera.clearViewOffset();
    camera.fov = FOV_WALK(); camera.near = 0.1; camera.far = 160;
    camera.position.copy(s.pos); camera.up.set(0, 1, 0); camera.lookAt(s.look); camera.updateProjectionMatrix();
    scene.fog.near = 60; scene.fog.far = 420;
    camY = s.pos.y; look = s.look;
    state.cam = { fov: camera.fov };
    if (s.stopIndex !== state.lastStop) { state.lastStop = s.stopIndex; state.dirtyTour = true; }
    state.tourSample = s;
  }
  W.B.updateLift(inTour ? state.tourSample?.lift : null, inTour?currentFloor(camera.position.y):1);
  const lift = inTour ? state.tourSample?.lift : null;
  const liftPhase=lift?`${lift.from}-${lift.to}-${lift.phase}`:'';
  if(state.liftPhase!==liftPhase){state.liftPhase=liftPhase;state.dirtyTour=true;}
  document.body.classList.toggle('liftOn', !!lift);
  $('radar').hidden = state.tourFocus || !!lift;
  $('liftStatus').hidden = !lift;
  if (lift) {
    const floor=currentFloor(lift.y+0.1), label = `EV · ${lift.from}층 → ${lift.to}층 · ${lift.phase} · ${floor}F · +${lift.y.toFixed(1)}m`;
    if ($('liftStatus').textContent !== label) $('liftStatus').textContent = label;
  }

  // 3) 평면도 컷 (클리핑 평면 높이)
  let cut = 1e4;
  if (p >= P.cut && p < P.planIn) cut = lerp(roofY() + 6, W.planCut, smooth(P.cut + 0.3 * (P.planIn - P.cut), P.planIn, p));
  else if (p >= P.planIn && p < P.land) {
    const walls = lerp(W.planCut, W.wallTop, smooth(P.planHold, P.planHold + 0.5 * (P.land - P.planHold), p));   // 벽이 솟는다
    const ramp = clamp01((W.wallTop - 0.1 - camY) / Math.max(0.3, W.wallTop - 0.1 - W.startY));                // 눈높이에 닿을수록
    cut = ramp > 0 ? lerp(W.wallTop, Math.min(W.finalCut, roofY() + 6), smooth(0, 1, ramp)) : walls;
  }
  else if (inTour && !lift) { const floor = currentFloor(camY); cut = W.inside([camera.position.x, 0, camera.position.z]) ? (floor < T.floors ? floorY(floor + 1) : roofY()) - 0.03 : 1e4; }
  if (state.intro < 1 && p < P.open) {                                       // 플로터: 컷 평면이 지면→지붕으로 올라가며 입면을 '그린다'
    const k = smooth(0, 1, state.intro), top = roofY() + 4;
    cut = Math.max(-0.5 + (top + 0.5) * k, -0.5);
    if (k >= 0.999) cut = 1e4;
  }
  cutPlane.constant = cut;
  // 단면 컷: 앞쪽(남)에서 절단면이 미끄러져 들어와 SEC_Z에 멈췄다가, 끝나면 다시 빠진다
  const zFar = T.D / 2 + 9, z0 = SEC_Z(T);
  let sec = 1e4;
  if (p > P.street + 0.002 && p < P.secOut + 0.01) {
    const kin = smooth(P.street + 0.002, P.secIn - 0.002, p), kout = smooth(P.secOut - 0.01, P.secOut + 0.008, p);
    sec = lerp(zFar, z0, kin * (1 - kout));
  }
  secPlane.constant = sec;
  const secOn = sec < zFar - 0.01;
  W.B.earthCut.visible = secOn;
  const scan = state.intro < 1 && p < P.flat + 0.01;
  $('scan').style.opacity = scan ? 1 - smooth(0.85, 1, state.intro) : 0;
  if (scan) { v3.set(0, cut, PRJ.T.D / 2).project(camera); $('scan').style.transform = `translateY(${((1 - v3.y) / 2 * innerHeight).toFixed(1)}px)`; $('scan').dataset.pct = `PLOTTING A-201 · ${String(Math.round(state.intro * 100)).padStart(3, '0')}%`; }

  // 4) 빛 — 공정 날짜의 서울 태양. 준공 후엔 선택한 시각
  const hour = p < P.buildEnd ? 14 : state.hour;
  state.lightHour = lerp(state.lightHour ?? hour, hour, 1 - Math.exp(-dt * 3));
  const date = dateAt(t), sp = sunPosition(date, state.lightHour);
  const night = smooth(18.3, 19.6, state.lightHour);
  // 입면 도면의 태양은 45° (07: \"모든 그림자는 45°로 그렸다\") → 법규 장면을 지나며 실제 날짜의 서울 태양으로
  desiredSun.copy(SUN45).lerp(sp.dir, smooth(P.open, P.lawEnd, p)).normalize();
  sunDir.lerp(desiredSun, 1 - Math.exp(-dt * 3)).normalize();
  sun.position.copy(sunDir).multiplyScalar(90); sun.target.position.set(0, 0, 0);
  const day = smooth(-2, 8, sp.alt) * (1 - night);
  sun.intensity = 2.8 * day;
  if ('intensity' in sun.shadow) sun.shadow.intensity = (1 - drawK) * (secOn ? 0.15 : 1);   // 평면도·단면에서는 그림자를 끔(잘려 나간 앞쪽이 그림자를 드리우지 않게)
  sun.color.set(0xfff4e6).lerp(new THREE.Color(0xffb878), 1 - smooth(8, 30, sp.alt));
  hemi.intensity = lerp(0.3, 1.2, 1 - night) * (inTour ? 1.1 : 1);
  hemi.color.set(0xfffcf5).lerp(new THREE.Color(0x4a5a80), night);
  scene.environmentIntensity = lerp(0.12, 0.55, 1 - night);
  scene.background.copy(paper).lerp(nightSky, night * (1 - drawK));
  const real = (p < P.open ? smooth(0, 1, sw) : 1) * (1 - drawK);
  // 하늘: 도면(종이) → 현장으로 넘어가며 물리 하늘이 서서히 나타난다. 밤·평면도에서는 숨김
  const skyK = HQ ? real * (1 - night) * smooth(-4, 4, sp.alt) : 0;
  sky.visible = skyK > 0.01; sky.material.uniforms.uOpacity.value = skyK;
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  scene.fog.color.copy(scene.background).lerp(HAZE, skyK * 0.85);
  if (HQ && skyK > 0.01) { updateSkyEnv(sunDir); scene.environment = skyEnvRT.texture; scene.environmentIntensity = lerp(0.12, 0.8, 1 - night) * (inTour ? 0.7 : 1); }
  else scene.environment = roomEnv;
  W.B.groundMat.color.copy(paper).lerp(W.groundBase, 1 - drawK);           // 입면·스윕 구간의 종이색은 셰이더(FX)가 처리
  if (W.B.groundMat.userData.drawUniform) W.B.groundMat.userData.drawUniform.value = drawK;
  groundLine.material.opacity = 1 - smooth(P.flat, P.open, p);

  // 5) 실내 조명 · 유리 야간 발광 · 간판
  const interior = phaseByKey('interior');
  const lit = smooth(interior.w1 - 1.2, interior.w1, t);
  const inside = smooth(P.land - 0.04, P.land, p);
  W.B.glassMats.forEach(m => (m.emissiveIntensity = lit * lerp(0.1, 2.6, night) * (1 - inside) * (1 - drawK)));
  W.B.signMats.forEach(m => (m.emissiveIntensity = lit * lerp(0.4, 2.2, night)));
  W.B.lampMats.forEach(m => (m.emissiveIntensity = lit * lerp(0.5, 2.2, night) * (1 - drawK)));
  W.B.lights.forEach(l => (l.intensity = 14 * lit * lerp(0.35, 1.4, Math.max(night, inside * 0.6)) * (1 - drawK)));

  // 법규 시각화(대지 경계·일조사선·층별 건축가능영역): 산정 패널을 열었거나 준공 직후 외관 구간
  const estOpen = document.body.classList.contains('estOpen');
  const inLaw = p > P.open - 0.005 && p < P.lawEnd + 0.012;
  const lu = lawU(p);
  W.B.envelope.visible = inLaw || (estOpen && p < P.street + 0.02) || (p > P.buildEnd - 0.03 && p < P.street + 0.01);
  const step = envelopeStage(W.B.envelope.userData, lu, inLaw && !estOpen);
  if (step !== state.lawStep) { state.lawStep = step; $('lawcard').querySelectorAll('li').forEach(li => li.classList.toggle('on', +li.dataset.step <= step)); $('lawcard').querySelectorAll('li').forEach(li => li.classList.toggle('cur', +li.dataset.step === step)); }
  W.dims.visible = drawK > 0.5 && p < P.land;
  if (state.cam?.fh && drawK > 0.3) {                                       // 축척 바: 화면 px/m에 맞춰 5m 길이
    const pxm = innerHeight / state.cam.fh, m = pxm * 5 > 140 ? 2 : pxm * 5 < 50 ? 10 : 5;
    const w = (pxm * m).toFixed(0) + 'px'; $('sbar').style.width = w; $('sbarL').style.left = w; $('sbarL').textContent = m + 'm';
  }

  // 6) HTML 레이어
  const B = document.body.style;
  B.setProperty('--hero', 1 - smooth(0.005, 0.05, p));
  B.setProperty('--tb', 1 - smooth(P.flat, P.flat + 0.05, p));
  B.setProperty('--dock', smooth(P.lawEnd + 0.002, P.lawEnd + 0.014, p) * (1 - smooth(P.street - 0.01, P.street + 0.01, p)));
  B.setProperty('--law', smooth(P.open - 0.01, P.open + 0.005, p) * (1 - smooth(P.lawEnd - 0.005, P.lawEnd + 0.002, p)));
  B.setProperty('--close', smooth(P.close, P.close + 0.004, p));
  // 서사 캡션 (07·03): 장면 박자마다 왼쪽 아래 큰 문장 — 법규·공정 구간은 카드·공정표가 대신한다
  const beat = BEATS.findIndex(([a, b]) => p >= a() && p < b());
  if (beat !== state.beat) { state.beat = beat; $('beat').innerHTML = beat < 0 ? '' : `<p class="eyebrow">${BEATS[beat][2]}</p><h3>${BEATS[beat][3]}</h3>`; }
  B.setProperty('--beat', beat < 0 ? 0 : Math.min(smooth(BEATS[beat][0](), BEATS[beat][0]() + 0.006, p), 1 - smooth(BEATS[beat][1]() - 0.006, BEATS[beat][1](), p)));
  // 하단 상태줄 (01·07)
  if (Math.abs(p - (state.stP ?? -1)) > 0.0015 || state.dirty) {
    state.stP = p;
    const fovNow = state.cam?.fov ?? camera.fov, proj = fovNow < 4 ? 'ORTHO 정사' : fovNow < 20 ? 'TELE 망원' : 'PERSP 투시';
    $('status').innerHTML = `<b>${sceneCode(p)}</b><span>PROJ ${proj} (${fovNow.toFixed(1)}°)</span><span>SEQ ${String(Math.round(p * 100)).padStart(3, '0')}%</span><span>SUN ALT ${(Math.asin(sunDir.y) * 57.3).toFixed(1)}° · AZ ${((Math.atan2(sunDir.x, sunDir.z) * 57.3 + 360) % 360).toFixed(0)}°</span>${secOn ? `<span>SEC A-A // CUT Z ${secPlane.constant.toFixed(2)}M</span>` : ''}`;
  }
  B.setProperty('--tod', smooth(P.buildEnd + 0.01, P.street, p));
  B.setProperty('--plan', smooth(P.planIn - 0.015, P.planIn, p) * (1 - smooth(P.planHold + 0.02, P.planHold + 0.05, p)));
  B.setProperty('--tour', smooth(P.land - 0.002, P.land + 0.0004, p));
  B.setProperty('--ro', Math.max(smooth(P.lawEnd + 0.002, P.lawEnd + 0.014, p) * (1 - smooth(P.street, P.street + 0.02, p)), 0));
  document.body.classList.toggle('closeOn', p >= P.close);
  document.body.classList.toggle('todOn', p > P.buildEnd + 0.02);
  document.body.classList.toggle('tourOn', inTour);
  // Opacity alone leaves invisible controls in keyboard and screen-reader navigation.
  const activeLayers = [
    ['.hero', p < 0.045], ['.journey', !inTour], ['.tour', inTour && p < P.close],
    ['#closing', p >= P.close], ['#est', estOpen], ['.tod', p > P.buildEnd + 0.02],
    ['#lawcard', inLaw], ['#planTitle', p >= P.planIn - 0.015 && p < P.planHold + 0.05], ['#readout', p > P.lawEnd && p < P.street + 0.02],
    ['#card', p > P.lawEnd && p < P.street + 0.02], ['.dock', p > P.lawEnd && p < P.street + 0.01],
    ['#radar', inTour && !lift && !state.tourFocus && p < P.close && innerWidth > 760],
  ];
  for (const [selector, active] of activeLayers) { const el = document.querySelector(selector); if (el.inert === active) el.inert = !active; }
  const Wd = innerWidth, Hd = innerHeight;
  const secPin = secOn ? smooth(P.secIn - 0.004, P.secIn + 0.004, p) * (1 - smooth(P.secOut - 0.014, P.secOut - 0.004, p)) : 0;
  const pinK = Math.max(1 - smooth(P.flat, P.flat + 0.04, p), secPin);
  W.pins.forEach(({ el, p: wp }) => { v3.copy(wp); if (secPin > 0) v3.z = Math.min(wp.z, secPlane.constant); v3.project(camera); el.style.transform = `translate(${((v3.x + 1) / 2 * Wd).toFixed(1)}px, ${((1 - v3.y) / 2 * Hd).toFixed(1)}px)`; el.style.opacity = pinK; });
  const plK = smooth(P.planIn - 0.02, P.planIn, p) * (1 - smooth(P.planHold, P.planHold + 0.03, p));
  W.labels.forEach(({ el, p: wp }) => { v3.copy(wp).project(camera); el.style.transform = `translate(${((v3.x + 1) / 2 * Wd).toFixed(1)}px, ${((1 - v3.y) / 2 * Hd).toFixed(1)}px)`; el.style.opacity = plK; });

  if (state.dirty || Math.abs(t - state.lastT) > 0.004 || ((t === 0 || t === PRJ.WEEKS) && t !== state.lastT) || hour !== state.lastHour) {
    state.dirty = false; state.lastT = t; state.lastHour = hour;
    renderHUD(t, sp, date, hour, inTour);
  }
  if (inTour && state.dirtyTour !== false) renderTour();
  else if (inTour) updateRadar();
  sky.position.copy(camera.position); sky.scale.setScalar(camera.far * 1.05);
  gtao.blendIntensity = 0.45 * smooth(8, 24, camera.fov) * (1 - drawK) * (1 - drawK);
  gtao.enabled = HQ && gtao.blendIntensity > 0.001;
  if (HQ && gtao.enabled) composer.render(); else renderer.render(scene, camera);   // 도면 장면은 후처리 없이(잉크색 정확히)
  if (!window.__ksReady) { const e = $('err'); if (e.dataset.soft && !/오류:/.test(e.textContent)) e.style.display = 'none'; }
  window.__ksReady = true;
}

function renderHUD(t, sp, date, hour, inTour) {
  const WEEKS = PRJ.WEEKS, wk = Math.min(Math.ceil(WEEKS), Math.floor(t) + 1);
  const live = PRJ.PHASES.filter(ph => t >= ph.w0 && t < ph.w1);
  const days = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()];
  const fov = state.cam?.fov ?? 2;
  const lens = fov < 4 ? '정사투영(도면)' : fov < 22 ? '부조' : '투시';
  $('readout').innerHTML = `
    <div class="big">${t >= WEEKS ? '준공' : `W${String(wk).padStart(2, '0')}`}<small> / ${WEEKS.toFixed(1)}주</small></div>
    <div><span>날짜</span>${fmtDate(date)} (${days})</div>
    <div><span>작업일</span>${workDaysTo(t)}일 <em>주${PRJ.opts.wdays}일 · 공휴일 제외</em></div>
    <div><span>렌즈</span>${focalMM(fov).toFixed(0)}mm · ${fov.toFixed(1)}° ${lens}</div>
    <div><span>태양</span>${String(Math.floor(hour)).padStart(2, '0')}:${String(Math.round((hour % 1) * 60)).padStart(2, '0')} · 고도 ${sp.alt.toFixed(0)}° · ${dirName(sp.az)}</div>
    <div><span>총공사비</span>${won(PRJ.est.total)} <em>${Math.round(PRJ.est.perPy).toLocaleString()}만원/평</em></div>`;
  $('card').innerHTML = live.length
    ? live.slice(0, 3).map(ph => `<div class="ph"><b>${ph.code} ${ph.name}</b><span>${ph.spec} · ${won(PRJ.est.lines[ph.key] || 0)}</span><i style="--f:${clamp01((t - ph.w0) / (ph.w1 - ph.w0))}"></i></div>`).join('')
    : (t >= WEEKS ? `<div class="ph"><b>사용승인 완료</b><span>${PRJ.T.kind}</span></div>` : `<div class="ph"><b>착공 준비</b><span>착공 ${fmtDate(PRJ.T.start)} · 공사기간 ${WEEKS.toFixed(1)}주 · 총공사비 ${won(PRJ.est.total)}</span></div>`);
  if (document.body.style.getPropertyValue('--dock') > 0.01 || state.lastT < 0.01) {
    if (document.activeElement !== $('weekScrub')) $('weekScrub').value = String(t);
    $('weekLabel').textContent = t >= WEEKS ? `준공 · ${WEEKS.toFixed(1)}주` : `${t.toFixed(1)} / ${WEEKS.toFixed(1)}주`;
    $('weekScrub').setAttribute('aria-valuetext', `${t >= WEEKS ? '준공 · ' : ''}${t.toFixed(1)}주 · ${fmtDate(date)}`);
    const g = $('gantt'); g.innerHTML = ganttSVG(t, g.clientWidth, g.clientHeight);
    $('finNums').innerHTML = financeNums(t);
    const f = $('finSvg'); f.innerHTML = financeSVG(t, f.clientWidth, f.clientHeight);
  }
}

function currentFloor(y) { const T = PRJ.T; let n = 1; for (let k = 1; k <= T.floors; k++) if (y >= floorY(k) - 0.2) n = k; return n; }
function renderTour() {
  state.dirtyTour = false;
  const st = W.tour.stops, i = Math.max(0, state.lastStop), s = st[i];
  const stopY = W.tour.keys[s.i].pos[1];
  const lift=state.tourSample?.lift;
  const room = s.kind === 'elevator' ? null : W.B.rooms[s.floor||currentFloor(stopY)]?.find(r => r.id === s.room);
  const shown=lift?{floor:currentFloor(lift.y+.1),title:`승강기 · ${lift.from} → ${lift.to}층`,desc:['상승','하강'].includes(lift.phase)?'측면 유리 너머 레일과 층 표시가 지나갑니다. 도착하면 문을 열고 다음 층 실내로 이어집니다.':`${lift.phase} · 문과 객실의 실제 위치를 따라 이동합니다.`}:s;
  $('tourStop').textContent = `${String(i + 1).padStart(2, '0')} / ${String(st.length).padStart(2, '0')} · ${shown.title}`;
  $('tcard').innerHTML = tourCard(shown, i, st.length, lift?null:room);
  $('rideLift').hidden=!PRJ.T.core?.ev;
  $('rideLift').disabled=!st.some(s=>s.kind==='elevator'&&s.u>tourU(state.p)+0.001);
  $('tnext').textContent = i < st.length - 1 ? `다음: ${st[i + 1].title} →` : '처음으로 ↺';
  $('tprev').disabled = i <= 0;
  for (const group of ['tdots', 'stabs']) $(group).querySelectorAll('button').forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-pressed', String(k === i)); });
  updateRadar();
}
function updateRadar() {
  if (state.tourFocus || innerWidth <= 760 || performance.now() - (state.radarAt || 0) < 80) return;
  state.radarAt = performance.now();
  const s = state.tourSample; if (!s) return;
  const n = currentFloor(s.pos.y);
  const rooms = W.B.rooms[n];
  const cur = rooms?.find(r => s.pos.x >= r.r[0] && s.pos.x <= r.r[2] && s.pos.z >= r.r[1] && s.pos.z <= r.r[3]);
  $('radar').innerHTML = `<div class="rt">${n}층 · 현재 위치</div>` + radarSVG(rooms, s.pos, s.look, cur?.id);
}

// ── 시작 ─────────────────────────────────────────────────────────────────
try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2500))]); } catch (e) { /* 폰트 실패는 무시 */ }
loadType(q.get('type') || 'geunsaeng');
resize();
buildWorld();
if (FIXED_P != null) document.documentElement.classList.add('fixed');
if (q.has('est')) document.body.classList.add('estOpen');
requestAnimationFrame(frame);
window.__ks = { state, PRJ, get W() { return W; }, switchType, camera, renderer, THREE };
