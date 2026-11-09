// ─────────────────────────────────────────────────────────────────────────────
// textures.js — 이미지 파일 없이 캔버스로 그리는 재질 (원본의 getTextures 패턴)
//
// 원리: <canvas>에 무늬를 그리고 THREE.CanvasTexture로 감싼다.
//       텍스처 1장 = 실제 크기 tile(m)만큼의 면적. metricUV()가 부재 크기에 맞춰
//       UV를 미터 단위로 깔아 주므로, 벽돌 크기가 부재마다 늘어나지 않는다.
// 같은 시드(seed)를 쓰면 매번 같은 무늬가 나온다(결정적 난수).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

let seed = 42;
const rnd = () => {               // mulberry32 — 원본과 같은 결정적 난수
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function make(px, tile, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  draw(g, px);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / tile, 1 / tile);          // tile m 마다 한 번 반복
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function grain(g, s, amp) {
  const id = g.getImageData(0, 0, s, s), d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const k = (rnd() - 0.5) * amp;
    d[i] += k; d[i + 1] += k; d[i + 2] += k;
  }
  g.putImageData(id, 0, 0);
}

let cache = null;
export function getTextures() {
  if (cache) return cache;
  seed = 42;
  const T = {};

  // 노출콘크리트 — 유로폼 600×1200 줄눈 + 폼타이 구멍 (한국 RC 현장의 그 모습)
  T.concrete = make(512, 2.4, (g, s) => {
    g.fillStyle = '#ece9e3'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = `rgba(90,84,74,${0.02 + rnd() * 0.04})`;
      g.fillRect(rnd() * s, rnd() * s, 30 + rnd() * 120, 20 + rnd() * 80);
    }
    g.fillStyle = 'rgba(40,36,32,0.28)';
    for (let k = 0; k <= 2; k++) g.fillRect(k * s / 2, 0, 2, s);       // 1.2m 세로 줄눈
    for (let k = 0; k <= 4; k++) g.fillRect(0, k * s / 4, s, 2);       // 0.6m 가로 줄눈
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {          // 폼타이
      g.fillStyle = 'rgba(30,28,25,0.5)';
      g.beginPath(); g.arc((c + 0.5) * s / 4, (r + 0.5) * s / 4, 3.5, 0, 7); g.fill();
    }
    grain(g, s, 14);
  });

  // 화강석 판재 — 600×1200 버너마감, 점박이 입자
  T.granite = make(512, 2.4, (g, s) => {
    g.fillStyle = '#d2cec7'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 9000; i++) {
      const v = rnd();
      g.fillStyle = v < 0.5 ? 'rgba(60,58,56,0.55)' : v < 0.8 ? 'rgba(255,255,255,0.6)' : 'rgba(150,120,110,0.5)';
      g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2);
    }
    g.fillStyle = 'rgba(50,48,45,0.45)';
    for (let k = 0; k <= 2; k++) g.fillRect(k * s / 2, 0, 2, s);
    for (let k = 0; k <= 4; k++) g.fillRect(0, k * s / 4, s, 2);
    grain(g, s, 10);
  });

  // 치장벽돌 — 190×57 (한국 표준형 벽돌), 10mm 줄눈, 길이쌓기
  T.brick = make(512, 1.34, (g, s) => {
    g.fillStyle = '#d9d3c8'; g.fillRect(0, 0, s, s);                   // 줄눈 모르타르
    const rows = 20, bw = s / 6.7, bh = s / rows;                       // 0.067m 단 × 20단
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * bw / 2;
      for (let x = -bw; x < s + bw; x += bw) {
        const v = 150 + rnd() * 50, rr = v + 40, gg = v * 0.62, bb = v * 0.45;
        g.fillStyle = `rgb(${rr | 0},${gg | 0},${bb | 0})`;
        g.fillRect(x + off + 2, r * bh + 2, bw - 4, bh - 4);
      }
    }
    grain(g, s, 18);
  });

  // 콘크리트블록 — 390×190
  T.block = make(256, 1.6, (g, s) => {
    g.fillStyle = '#c9c5bd'; g.fillRect(0, 0, s, s);
    const bw = s / 4.1, bh = s / 8.4;
    g.fillStyle = 'rgba(60,56,50,0.35)';
    for (let r = 0; r < 9; r++) {
      g.fillRect(0, r * bh, s, 2);
      for (let x = (r % 2) * bw / 2; x < s; x += bw) g.fillRect(x, r * bh, 2, bh);
    }
    grain(g, s, 26);
  });

  // 스타코 — 미세한 뿜칠 질감
  T.stucco = make(256, 1.0, (g, s) => {
    g.fillStyle = '#f2efe8'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 2500; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.5)';
      g.beginPath(); g.arc(rnd() * s, rnd() * s, 0.5 + rnd() * 2, 0, 7); g.fill();
    }
    grain(g, s, 10);
  });

  // 세라믹/목재 사이딩 — 가로 판재 150mm
  T.siding = make(256, 1.2, (g, s) => {
    for (let r = 0; r < 8; r++) {
      const v = 200 + rnd() * 30;
      g.fillStyle = `rgb(${v | 0},${(v * 0.86) | 0},${(v * 0.72) | 0})`;
      g.fillRect(0, r * s / 8, s, s / 8);
      g.fillStyle = 'rgba(30,20,10,0.4)'; g.fillRect(0, r * s / 8, s, 2);
    }
    grain(g, s, 16);
  });

  // OSB 합판 — 스트랜드 조각
  T.osb = make(256, 1.22, (g, s) => {
    g.fillStyle = '#e4d3ae'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 700; i++) {
      const v = 170 + rnd() * 70;
      g.fillStyle = `rgba(${v | 0},${(v * 0.8) | 0},${(v * 0.55) | 0},0.7)`;
      g.save(); g.translate(rnd() * s, rnd() * s); g.rotate(rnd() * 3.14);
      g.fillRect(-10, -2, 20 + rnd() * 14, 4); g.restore();
    }
    grain(g, s, 12);
  });

  // 징크 지붕 — 스탠딩심 430mm
  T.zinc = make(256, 1.72, (g, s) => {
    g.fillStyle = '#d6d9dc'; g.fillRect(0, 0, s, s);
    for (let k = 0; k < 4; k++) {
      g.fillStyle = 'rgba(30,32,36,0.45)'; g.fillRect(k * s / 4, 0, 3, s);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(k * s / 4 + 3, 0, 2, s);
    }
    grain(g, s, 8);
  });

  // 보도블럭 — 200×100 헤링본 대신 단순 엇갈림
  T.paving = make(256, 1.0, (g, s) => {
    g.fillStyle = '#9c968c'; g.fillRect(0, 0, s, s);
    const bw = s / 5, bh = s / 10;
    for (let r = 0; r < 10; r++) for (let x = (r % 2) * bw / 2 - bw; x < s; x += bw) {
      const v = 185 + rnd() * 35;
      g.fillStyle = `rgb(${v | 0},${(v - 6) | 0},${(v - 14) | 0})`;
      g.fillRect(x + 1.5, r * bh + 1.5, bw - 3, bh - 3);
    }
    grain(g, s, 14);
  });

  // 흙 · 잔디 · 쇄석
  T.earth = make(256, 2.0, (g, s) => {
    g.fillStyle = '#e9e2d7'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 400; i++) {
      g.fillStyle = rnd() > 0.5 ? 'rgba(60,45,30,0.25)' : 'rgba(255,250,240,0.25)';
      g.beginPath(); g.arc(rnd() * s, rnd() * s, 1 + rnd() * 3, 0, 7); g.fill();
    }
    grain(g, s, 24);
  });
  T.lawn = make(256, 1.5, (g, s) => {
    g.fillStyle = '#c9d2b0'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 4000; i++) {
      const v = rnd();
      g.fillStyle = v > 0.5 ? 'rgba(60,80,30,0.25)' : 'rgba(240,250,210,0.25)';
      g.fillRect(rnd() * s, rnd() * s, 1, 2 + rnd() * 4);
    }
  });
  T.gravel = make(256, 1.0, (g, s) => {
    g.fillStyle = '#e8e3da'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1100; i++) {
      const v = 180 + rnd() * 70;
      g.fillStyle = `rgb(${v | 0},${(v - 3) | 0},${(v - 8) | 0})`;
      g.fillRect(rnd() * s, rnd() * s, 2 + rnd() * 4, 2 + rnd() * 3);
    }
  });


  // ── 실내 마감재 ───────────────────────────────────────────────────────────
  // 원목마루 — 폭 120 · 길이 1200 판재, 엇갈림 줄눈
  T.wood = make(512, 1.2, (g, s) => {
    const rows = 10, h = s / rows;
    for (let r = 0; r < rows; r++) {
      const off = rnd() * s;
      for (let x = -s; x < s * 2; x += s) {
        const v = 196 + rnd() * 34;
        g.fillStyle = `rgb(${v | 0},${(v * 0.8) | 0},${(v * 0.6) | 0})`;
        g.fillRect(x + off, r * h, s, h);
        for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(90,55,25,${0.05 + rnd() * 0.08})`; g.fillRect(x + off, r * h + rnd() * h, s, 1 + rnd()); }
        g.fillStyle = 'rgba(60,35,15,0.45)'; g.fillRect(x + off, r * h, 2, h);
      }
      g.fillStyle = 'rgba(60,35,15,0.35)'; g.fillRect(0, r * h, s, 1.5);
    }
    grain(g, s, 10);
  });
  // 포세린 타일 600×600 (밝은 회색)
  T.tile = make(256, 1.2, (g, s) => {
    g.fillStyle = '#e6e3dd'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 600; i++) { g.fillStyle = `rgba(120,115,105,${rnd() * 0.08})`; g.fillRect(rnd() * s, rnd() * s, 3 + rnd() * 8, 2 + rnd() * 6); }
    g.fillStyle = 'rgba(150,145,138,0.9)'; g.fillRect(0, 0, s, 2); g.fillRect(0, s / 2, s, 2); g.fillRect(0, 0, 2, s); g.fillRect(s / 2, 0, 2, s);
    grain(g, s, 6);
  });
  // 욕실 타일 300×600 (진회색)
  T.tileDark = make(256, 1.2, (g, s) => {
    g.fillStyle = '#8d8b88'; g.fillRect(0, 0, s, s);
    g.fillStyle = 'rgba(230,228,222,0.8)';
    for (let k = 0; k <= 4; k++) g.fillRect(0, k * s / 4, s, 2);
    for (let r = 0; r < 4; r++) for (let k = 0; k <= 2; k++) g.fillRect(k * s / 2 + (r % 2) * s / 4, r * s / 4, 2, s / 4);
    grain(g, s, 12);
  });
  // 타일카펫 500×500
  T.carpet = make(256, 1.0, (g, s) => {
    for (let r = 0; r < 2; r++) for (let c = 0; c < 2; c++) {
      g.fillStyle = (r + c) % 2 ? '#8f9196' : '#9a9ca0'; g.fillRect(c * s / 2, r * s / 2, s / 2, s / 2);
      for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '0,0,0'},0.08)`; const vert = (r + c) % 2; g.fillRect(c * s / 2 + rnd() * s / 2, r * s / 2 + rnd() * s / 2, vert ? 1 : 4, vert ? 4 : 1); }
    }
    grain(g, s, 8);
  });
  // 폴리싱 콘크리트 바닥
  T.concretePol = make(512, 3.0, (g, s) => {
    g.fillStyle = '#c9c6bf'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${rnd() > 0.5 ? '255,255,255' : '80,76,70'},${0.03 + rnd() * 0.05})`; g.beginPath(); g.arc(rnd() * s, rnd() * s, 20 + rnd() * 90, 0, 7); g.fill(); }
    for (let i = 0; i < 2500; i++) { g.fillStyle = `rgba(60,58,55,${rnd() * 0.25})`; g.fillRect(rnd() * s, rnd() * s, 1.5, 1.5); }
    g.fillStyle = 'rgba(60,58,55,0.3)'; g.fillRect(0, 0, s, 2); g.fillRect(0, 0, 2, s);
  });
  // 에폭시 주차장 바닥
  T.epoxy = make(256, 2.0, (g, s) => {
    g.fillStyle = '#9aa39b'; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(255,255,255,${rnd() * 0.12})`; g.fillRect(rnd() * s, rnd() * s, 2, 2); }
  });
  // 패브릭 (소파·침구)
  T.fabric = make(128, 0.4, (g, s) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 2) { g.fillStyle = 'rgba(0,0,0,0.05)'; g.fillRect(0, y, s, 1); }
    for (let x = 0; x < s; x += 2) { g.fillStyle = 'rgba(0,0,0,0.04)'; g.fillRect(x, 0, 1, s); }
    grain(g, s, 14);
  });
  // 대리석 (상판)
  T.marble = make(512, 1.6, (g, s) => {
    g.fillStyle = '#f1efea'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(120,118,115,0.35)';
    for (let k = 0; k < 9; k++) {
      g.lineWidth = 0.6 + rnd() * 1.8; g.beginPath();
      let x = rnd() * s, y = 0; g.moveTo(x, y);
      while (y < s) { x += (rnd() - 0.5) * 40; y += 10 + rnd() * 20; g.lineTo(x, y); }
      g.stroke();
    }
    grain(g, s, 6);
  });

  // 자연석 판석 붙임 (전원주택 1층·굴뚝) — 크기가 다른 사각 석재를 줄눈 사이에 쌓는다
  T.stone = make(512, 1.6, (g, s) => {
    g.fillStyle = '#8f8a80'; g.fillRect(0, 0, s, s);                    // 줄눈
    let y = 0;
    while (y < s) {
      const h = s * (0.08 + rnd() * 0.07); let x = -rnd() * s * 0.1;
      while (x < s) {
        const w = s * (0.12 + rnd() * 0.18), t = rnd();
        const c = t < 0.33 ? [196, 186, 168] : t < 0.66 ? [176, 168, 154] : [210, 202, 186];
        const k = (rnd() - 0.5) * 26;
        g.fillStyle = `rgb(${c[0] + k},${c[1] + k},${c[2] + k})`;
        g.fillRect(x + 3, y + 3, w - 6, h - 6);
        if (x + w > s) { g.fillRect(x + 3 - s, y + 3, w - 6, h - 6); }   // 이음매 없이 반복
        x += w;
      }
      y += h;
    }
    grain(g, s, 28);
  });
  // 적삼목 세로 판재 (박공·2층 외벽 포인트)
  T.cedar = make(256, 1.2, (g, s) => {
    for (let i = 0; i < 10; i++) {
      const k = (rnd() - 0.5) * 30;
      g.fillStyle = `rgb(${150 + k},${102 + k * 0.8},${68 + k * 0.6})`; g.fillRect(i * s / 10, 0, s / 10, s);
      g.fillStyle = 'rgba(40,24,14,0.55)'; g.fillRect(i * s / 10, 0, 2, s);
      for (let j = 0; j < 14; j++) { g.fillStyle = `rgba(70,42,24,${0.08 + rnd() * 0.12})`; g.fillRect(i * s / 10 + rnd() * s / 10, rnd() * s, 1, 10 + rnd() * 40); }
    }
    grain(g, s, 12);
  });
  // 수면 (수영장)
  T.water = make(256, 2.0, (g, s) => {
    const gr = g.createLinearGradient(0, 0, s, s); gr.addColorStop(0, '#6fc0cf'); gr.addColorStop(1, '#3f97ad');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    for (let i = 0; i < 140; i++) { g.strokeStyle = `rgba(255,255,255,${0.08 + rnd() * 0.18})`; g.lineWidth = 1 + rnd() * 1.5;
      g.beginPath(); const x = rnd() * s, y = rnd() * s; g.moveTo(x, y); g.quadraticCurveTo(x + 12, y - 6, x + 26 + rnd() * 20, y + rnd() * 4); g.stroke(); }
  });

  // 단면의 흙 — 황토색 바탕 + 45° 해칭 (03 Open Section의 지반 표현)
  T.earthCut = make(256, 1.2, (g, s) => {
    g.fillStyle = '#d9c6a3'; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(90,64,36,0.55)'; g.lineWidth = 2;
    for (let k = -s; k < s * 2; k += s / 8) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + s, s); g.stroke(); }
    grain(g, s, 10);
  });

  cache = T;
  return T;
}

// 부재의 로컬 좌표로 UV를 미터 단위로 깐다 (원본 applyMetricUV의 단순판).
// 면의 법선이 위/아래면 (x,z), 동/서면 (z,y), 남/북면 (x,y)을 UV로 쓴다.
export function metricUV(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ay >= ax && ay >= az) { uv[i * 2] = x; uv[i * 2 + 1] = z; }
    else if (ax >= az) { uv[i * 2] = z; uv[i * 2 + 1] = y; }
    else { uv[i * 2] = x; uv[i * 2 + 1] = y; }
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
