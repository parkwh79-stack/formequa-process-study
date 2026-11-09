// ─────────────────────────────────────────────────────────────────────────────
// camera.js — ① 망원 렌즈 = 도면 / 돌리 줌 (07 elevation.js의 camAt·setCam)
//             ② 거리·시간 기반 보행 경로 (단조 Hermite 보간 + 정지점 체류)
//
// ① 카메라 키 = 프레임 { t 타깃, fh 프레임 높이(m), fov, yaw, pitch }.  거리 d = (fh/2)/tan(fov/2)
//    fov 2°면 수백 m 뒤에서 본 '도면', fov를 키우며 다가오면 원근이 살아난다. fh·fov는 로그 보간.
// ② 투어 키 = { pos, look, stop? }. stop이 있는 키에서는 잠시 머문다(dwell) — 방마다 카드가 뜬다.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { clamp01, lerp } from './project.js';

const D2R = Math.PI / 180;
const ease = u => u * u * u * (u * (u * 6 - 15) + 10);
const span = (p, a, b) => clamp01((p - a) / (b - a));
const wrap = a => ((a + 180) % 360 + 360) % 360 - 180;

export function camAt(p, keys, aspect) {
  let a = keys[0], b = keys[0], u = 0;
  for (let i = 0; i < keys.length - 1; i++) if (p >= keys[i].p) { a = keys[i]; b = keys[i + 1]; u = span(p, keys[i].p, keys[i + 1].p); }
  if (p >= keys[keys.length - 1].p) { a = b = keys[keys.length - 1]; u = 0; }
  const e = (b.ease || ease)(u);
  const L = (x, y) => lerp(x, y, e), LL = (x, y) => Math.exp(lerp(Math.log(x), Math.log(y), e));
  const fit = k => Math.max(k.fh, (k.minW || 0) / aspect);
  const ya = a.yaw || 0, yb = ya + wrap((b.yaw || 0) - ya);              // 가까운 쪽으로 회전
  return { t: [L(a.t[0], b.t[0]), L(a.t[1], b.t[1]), L(a.t[2], b.t[2])], fh: LL(fit(a), fit(b)), fov: LL(a.fov, b.fov),
           yaw: L(ya, yb), pitch: L(a.pitch || 0, b.pitch || 0), viewShift: L(a.viewShift || 0, b.viewShift || 0),
           eyeHeight: Number.isFinite(a.eyeHeight) && Number.isFinite(b.eyeHeight) ? L(a.eyeHeight, b.eyeHeight) : undefined };
}

export function setCam(camera, c) {
  camera.fov = c.fov;
  const {pos,look:tgt,distance:d}=framePose(c);
  camera.position.copy(pos);
  if (Math.abs(c.viewShift || 0) > 1e-5) camera.setViewOffset(camera.aspect, 1, 0, c.viewShift, camera.aspect, 1);
  else camera.clearViewOffset();
  camera.near = Math.max(0.1, d - 110);
  camera.far = d + 220;
  camera.up.set(0, 1, 0);
  camera.lookAt(tgt);
  camera.updateProjectionMatrix();
  return d;
}
export function framePose(c) {
  const distance=c.fh/(2*Math.tan(c.fov*D2R/2)), pitch=Math.min(89.5,c.pitch||0)*D2R, yaw=(c.yaw||0)*D2R;
  const look=new THREE.Vector3(...c.t),pos=look.clone().addScaledVector(new THREE.Vector3(Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),Math.cos(yaw)*Math.cos(pitch)),distance);
  if(Number.isFinite(c.eyeHeight))pos.y=c.eyeHeight;
  return {pos,look,fov:c.fov,distance};
}
// Limit the motion actually displayed, including wheel response and low-frame-rate catch-up.
export function limitCameraProgress(current,next,sample,{angle=Infinity,distance=Infinity,lens=Infinity}={}){
  if(current===next)return current;
  const start=sample(current);
  function fits(p){
    let previous=start,turn=0,travel=0,zoom=0;
    for(let i=1;i<=4;i++){
      const pose=sample(current+(p-current)*i/4);
      const a=previous.look.clone().sub(previous.pos).normalize(),b=pose.look.clone().sub(pose.pos).normalize();
      turn+=Math.acos(Math.max(-1,Math.min(1,a.dot(b))));travel+=previous.pos.distanceTo(pose.pos);
      zoom+=Math.abs(Math.log(Math.tan(pose.fov*D2R/2)/Math.tan(previous.fov*D2R/2)));
      if(turn>angle+1e-9||travel>distance+1e-9||zoom>lens+1e-9)return false;
      previous=pose;
    }
    return true;
  }
  if(fits(next))return next;
  let lo=0,hi=1;
  for(let i=0;i<14;i++){const mid=(lo+hi)/2;if(fits(current+(next-current)*mid))lo=mid;else hi=mid;}
  return current+(next-current)*lo;
}
// 위치·시선 → 프레임 키 (투어 첫 장면을 돌리 줌의 도착점으로 쓰기 위해)
export function poseToKey(pos, look, fov) {
  const P = new THREE.Vector3(...pos), L = new THREE.Vector3(...look), v = P.clone().sub(L);
  const d = v.length();
  return { t: look, fov, fh: 2 * d * Math.tan(fov * D2R / 2), yaw: Math.atan2(v.x, v.z) / D2R, pitch: Math.asin(v.y / d) / D2R };
}
export const focalMM = fov => 12 / Math.tan(fov * D2R / 2);

// ② 투어: 키 사이 이동(거리 비례) + 정지점 체류. sample(u) → 위치·시선·현재 정지점
export function makeTour(keys, yOff = 0, { speed = 0.48, dwell = 6, turnSpeed = 0.22 } = {}) {
  const P = keys.map(k => new THREE.Vector3(k.pos[0], k.pos[1] + yOff, k.pos[2]));
  const yaw = [], pitch = [];
  keys.forEach((k, i) => {
    const dx = k.look[0] - k.pos[0], dz = k.look[2] - k.pos[2];
    let a = Math.atan2(dx, dz);
    if (i) a = yaw[i - 1] + Math.atan2(Math.sin(a - yaw[i - 1]), Math.cos(a - yaw[i - 1]));
    yaw.push(a); pitch.push(Math.max(-0.38, Math.min(0.38, Math.atan2(k.look[1] - k.pos[1], Math.hypot(dx, dz)))));
  });
  const moveSeconds = keys.slice(0, -1).map((k, i) => Math.max(0.9, keys[i + 1].hold || 0,
    P[i].distanceTo(P[i + 1]) / (keys[i + 1].speed || speed) * 1.65,
    Math.abs(yaw[i + 1] - yaw[i]) * 1.875 / (keys[i+1].turnSpeed || turnSpeed)));
  // Monotone Hermite tangents: continuous walking through waypoints, no spline overshoot through walls.
  const tangent = (i, axis) => {
    if (i === 0 || i === keys.length - 1 || keys[i].stop || keys[i].hold) return 0;
    const a = (P[i][axis] - P[i - 1][axis]) / moveSeconds[i - 1];
    const b = (P[i + 1][axis] - P[i][axis]) / moveSeconds[i];
    return a * b > 0 ? 2 * a * b / (a + b) : 0;
  };
  const tangents = P.map((p, i) => new THREE.Vector3(tangent(i, 'x'), tangent(i, 'y'), tangent(i, 'z')));
  const segs = [];
  keys.forEach((k, i) => {
    if (k.stop) segs.push({ type: 'dwell', i, w: k.dwell || dwell });
    if (i < keys.length - 1) segs.push({ type: 'move', i, w: moveSeconds[i] });
  });
  const total = segs.reduce((a, s) => a + s.w, 0);
  let acc = 0; segs.forEach(s => { s.u0 = acc / total; acc += s.w; s.u1 = acc / total; });
  const stops = keys.map((k, i) => ({ ...k.stop, i })).filter(s => s.title);
  stops.forEach(s => { const d = segs.find(g => g.type === 'dwell' && g.i === s.i); s.u = (d.u0 + d.u1) / 2; s.u0 = d.u0; });
  function sample(u) {
    u = clamp01(u);
    let seg = segs[segs.length - 1];
    for (const s of segs) if (u <= s.u1) { seg = s; break; }
    const i = seg.i, j = seg.type === 'dwell' ? i : i + 1;
    const v = seg.type === 'dwell' ? 0 : span(u, seg.u0, seg.u1), e = ease(v);
    const pos = P[i].clone();
    if (i !== j) {
      const v2 = v * v, v3 = v2 * v;
      for (const axis of ['x', 'y', 'z']) pos[axis] = (2 * v3 - 3 * v2 + 1) * P[i][axis]
        + (v3 - 2 * v2 + v) * seg.w * tangents[i][axis]
        + (-2 * v3 + 3 * v2) * P[j][axis] + (v3 - v2) * seg.w * tangents[j][axis];
    }
    const a = lerp(yaw[i], yaw[j], e), p = lerp(pitch[i], pitch[j], e);
    const look = pos.clone().add(new THREE.Vector3(Math.sin(a) * Math.cos(p), Math.sin(p), Math.cos(a) * Math.cos(p)).multiplyScalar(3));
    const la = keys[i].lift, lb = keys[j].lift;
    const vertical = Math.abs(P[j].y - P[i].y) > 1e-8 ? (pos.y - P[i].y) / (P[j].y - P[i].y) : e;
    const lift = la && lb ? { ...lb, y: lerp(la.y, lb.y, vertical), door: lerp(la.door, lb.door, e) } : la || lb || null;
    let si = -1; for (let k = 0; k < stops.length; k++) if (u >= stops[k].u0 - 0.002) si = k;
    return { pos, look, lift, stopIndex: si, dwell: seg.type === 'dwell' };
  }
  const start = sample(0);
  function skipDwell(u,direction){
    const seg=segs.find(s=>s.type==='dwell'&&u>=s.u0-1e-10&&u<=s.u1+1e-10);
    return seg?(direction>0?seg.u1:seg.u0):u;
  }
  return { sample, skipDwell, stops, keys, duration: total, keyU: keys.map((_,i)=>segs.find(s=>s.i===i)?.u0??1), startPos: start.pos.toArray(), startLook: start.look.toArray() };
}
