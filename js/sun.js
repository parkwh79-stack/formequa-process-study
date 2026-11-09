// ─────────────────────────────────────────────────────────────────────────────
// sun.js — 서울 위도 기준 태양 위치 (한국형 추가 기능)
//
// 원본 05는 "주차에 따라 해가 조금씩 높아진다"는 연출용 공식을 씁니다.
// 여기서는 실제 천문 근사식으로 바꿨습니다: 착공(3월) → 준공(이듬해 2월)까지
// 공정이 진행되는 동안 그림자 길이가 실제 계절대로 변합니다.
//
//   적위 δ = 23.44° · sin(360°·(284+N)/365)          (N = 1월1일부터의 일수)
//   시간각 H = 15° · (태양시 − 12)
//   고도 sin α = sinφ·sinδ + cosφ·cosδ·cosH          (φ = 위도)
//   방위 A: 남쪽 기준, 서쪽(+)
// KST는 동경 135° 기준이고 서울은 약 127°이므로 태양시 ≈ KST − 32분.
// 균시차(±16분)는 무시한 근사입니다. 실제 일조 검토는 전문 도구를 쓰세요.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const LAT = 37.57;          // 서울 (전원주택이면 양평 37.49 등으로 바꿔도 됨)
export const LON = 126.98;
const D2R = Math.PI / 180;

export function sunPosition(date, kstHour) {
  const start = new Date(date.getFullYear(), 0, 1);
  const N = Math.floor((date - start) / 864e5) + 1;
  const decl = 23.44 * Math.sin(D2R * 360 * (284 + N) / 365) * D2R;
  const solarHour = kstHour - (135 - LON) / 15;            // 경도 보정
  const H = 15 * (solarHour - 12) * D2R;
  const phi = LAT * D2R;
  const sinA = Math.sin(phi) * Math.sin(decl) + Math.cos(phi) * Math.cos(decl) * Math.cos(H);
  const alt = Math.asin(sinA);
  let cosAz = (Math.sin(alt) * Math.sin(phi) - Math.sin(decl)) / (Math.cos(alt) * Math.cos(phi));
  cosAz = Math.min(1, Math.max(-1, cosAz));
  const az = Math.acos(cosAz) * (H > 0 ? 1 : -1);          // 남=0, 서=+
  // 장면 좌표: x 동(+), z 남(+). 태양을 향하는 방향 벡터
  const dir = new THREE.Vector3(-Math.cos(alt) * Math.sin(az), Math.sin(alt), Math.cos(alt) * Math.cos(az));
  return { alt: alt / D2R, az: az / D2R, dir };
}
