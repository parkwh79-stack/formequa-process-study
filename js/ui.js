// ─────────────────────────────────────────────────────────────────────────────
// ui.js — HTML/SVG 레이어: 공정표 · 자금 S커브 · 공사비·공기 산정 패널 · 투어 카드 · 미니 평면
// 3D와 같은 PRJ(공정·공사비·자금)를 읽으므로 화면이 항상 일치합니다.
// ─────────────────────────────────────────────────────────────────────────────
import { PRJ, GRADES, PYEONG, dateAt, fmtDate, clamp01, cashAt, recompute } from './project.js';
import { ZONES, SOURCES, RULES_ASOF } from './law.js';
import { REGIONS, PARK_SOURCES } from './parking.js';

const MONO = 'IBM Plex Mono, Noto Sans KR, monospace';
const $ = id => document.getElementById(id);
const txt = (x, y, s, o = {}) => `<text x="${x}" y="${y}" font-family="${MONO}" font-size="${o.size || 10}" font-weight="${o.w || 500}" fill="${o.fill || 'rgba(29,28,25,.72)'}" text-anchor="${o.anchor || 'start'}">${s}</text>`;
export const won = v => (Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2)) + '억';
const py = m2 => (m2 / PYEONG).toFixed(1);

// ── 공정표 (간트) ────────────────────────────────────────────────────────────
export function ganttSVG(t, W, H) {
  const { PHASES, WEEKS, est } = PRJ;
  const labelW = Math.min(185, W * 0.36), head = 22, rowH = (H - head - 4) / PHASES.length;
  const X = w => labelW + (W - labelW - 6) * w / WEEKS;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" data-x0="${labelW}" data-x1="${W - 6}" xmlns="http://www.w3.org/2000/svg">`;
  s += `<defs><pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="rgba(29,28,25,.32)" stroke-width="1"/></pattern></defs>`;
  let lastM = -1;
  for (let w = 0; w <= Math.ceil(WEEKS); w++) {
    const d = dateAt(w), x = X(Math.min(w, WEEKS));
    s += `<line x1="${x}" y1="${head - 6}" x2="${x}" y2="${H}" stroke="rgba(29,28,25,${w % 4 ? 0.06 : 0.16})"/>`;
    if (d.getMonth() !== lastM && w < WEEKS) { s += txt(x + 2, 12, `${d.getMonth() + 1}월`, { size: 9.5, w: 600 }); lastM = d.getMonth(); }
  }
  PHASES.forEach((p, i) => {
    const y = head + i * rowH, bh = Math.max(5, rowH * 0.56), by = y + (rowH - bh) / 2;
    const live = t >= p.w0 && t < p.w1, done = t >= p.w1, fill = clamp01((t - p.w0) / (p.w1 - p.w0));
    const delayed = PRJ.opts.delayWeeks > 0 && PRJ.opts.delayKey === p.key;
    s += `<g><title>${p.name} · ${p.w0.toFixed(1)}~${p.w1.toFixed(1)}주 · ${won(est.lines[p.key] || 0)}</title>`;
    s += txt(0, by + bh - 1, `${p.code} ${p.name}`, { size: rowH > 15 ? 10.5 : 9, w: live ? 700 : 500, fill: live ? 'var(--accent)' : done ? 'rgba(29,28,25,.9)' : 'rgba(29,28,25,.55)' });
    s += `<rect x="${X(p.w0)}" y="${by}" width="${Math.max(1, X(p.w1) - X(p.w0))}" height="${bh}" fill="url(#hatch)" stroke="${delayed ? 'var(--accent)' : 'rgba(29,28,25,.5)'}" stroke-width="${delayed ? 2 : 1}" ${delayed ? 'stroke-dasharray="3 2"' : ''}/>`;
    if (fill > 0) s += `<rect x="${X(p.w0)}" y="${by}" width="${(X(p.w1) - X(p.w0)) * fill}" height="${bh}" fill="${live ? 'var(--accent)' : 'var(--ink)'}" opacity="${live ? 0.95 : 0.78}"/>`;
    s += `</g>`;
  });
  const xn = X(Math.min(t, WEEKS)), xl = Math.min(W - 19, Math.max(labelW + 18, xn));
  s += `<line x1="${xn}" y1="${head - 8}" x2="${xn}" y2="${H}" stroke="var(--accent)" stroke-width="2"/>`;
  s += `<rect x="${xl - 18}" y="${head - 20}" width="36" height="13" fill="var(--accent)"/>` + txt(xl, head - 10, `W${String(Math.min(Math.ceil(WEEKS), Math.floor(t) + 1)).padStart(2, '0')}`, { size: 9.5, w: 700, fill: '#fff', anchor: 'middle' });
  return s + `</svg>`;
}

// ── 자금 S커브 ───────────────────────────────────────────────────────────────
export function financeSVG(t, W, H) {
  const { CASH, WEEKS, opts } = PRJ;
  const pad = { l: 34, r: 8, t: 22, b: 16 };
  const max = Math.max(opts.limit, CASH[CASH.length - 1].total) * 1.05;
  const X = w => pad.l + (W - pad.l - pad.r) * Math.min(w, WEEKS) / WEEKS;
  const Y = v => H - pad.b - (H - pad.t - pad.b) * v / max;
  const path = k => CASH.map((r, i) => `${i ? 'L' : 'M'}${X(r.w).toFixed(1)},${Y(r[k]).toFixed(1)}`).join('');
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (let k = 0; k <= 4; k++) { const v = max * k / 4; s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="rgba(29,28,25,.08)"/>` + txt(pad.l - 4, Y(v) + 3, v.toFixed(v < 10 ? 1 : 0), { size: 8.5, anchor: 'end' }); }
  const over = CASH.some(r => r.loan > opts.limit);
  s += `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(opts.limit)}" y2="${Y(opts.limit)}" stroke="${over ? 'var(--accent)' : 'rgba(29,28,25,.45)'}" stroke-dasharray="4 3"/>`;
  s += txt(W - pad.r, Y(opts.limit) - 3, `${PRJ.T.fin.label} 한도 ${opts.limit}억${over ? ' 초과!' : ''}`, { size: 8.5, anchor: 'end', fill: over ? 'var(--accent)' : undefined });
  s += `<path d="${path('total')}" fill="none" stroke="var(--ink)" stroke-width="1.6"/><path d="${path('loan')}" fill="none" stroke="var(--accent)" stroke-width="1.8"/>`;
  s += `<path d="${path('eqUsed')}" fill="none" stroke="rgba(29,28,25,.45)" stroke-width="1.2" stroke-dasharray="2 2"/>`;
  const xn = X(t);
  s += `<line x1="${xn}" x2="${xn}" y1="${pad.t - 6}" y2="${H - pad.b}" stroke="var(--accent)" stroke-width="1.5"/>`;
  s += txt(pad.l, 11, '■ 누적 사업비', { size: 9, fill: 'var(--ink)', w: 600 }) + txt(pad.l + 84, 11, `■ ${PRJ.T.fin.label} 잔액`, { size: 9, fill: 'var(--accent)', w: 600 }) + txt(pad.l + 190, 11, '┄ 자기자본', { size: 9 });
  return s + `</svg>`;
}
export function financeNums(t) {
  const k = cashAt(t), e = PRJ.est, o = PRJ.opts;
  return `<div><span>공사비 집행</span>${won(k.cumCost)} <em>/ ${won(e.total)} · 기성 ${(k.cumCost / e.total * 100).toFixed(0)}%</em></div>
    <div><span>자기자본</span>${won(k.eqUsed)} <em>/ ${won(o.equity)}</em></div>
    <div><span>${PRJ.T.fin.label} 잔액</span><b>${won(k.loan)}</b> <em>금리 ${(+o.rate).toFixed(1)}%</em></div>
    <div><span>누적 이자</span>${won(k.cumInt)}</div>
    <div><span>총사업비 누계</span>${won(k.total)} <em>토지 ${won(o.land)} 포함</em></div>`;
}

// ── 공사비·공기 산정 패널 ────────────────────────────────────────────────────
// 주차 대수 산정 섹션: 용도별 산식 → 합산·끝수 처리 → 배치 결과 → 근거
function parkSection(F, L) {
  const P = F.park; if (!P) return '';
  const { R, L: Lay } = P, e = PRJ.est?.park || {};
  const opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`;
  const rows = R.parts.map(p => `<tr><td>${p.use}${p.note ? `<i>${p.note}</i>` : ''}</td><td>${p.basis}</td><td>${p.raw.toFixed(1)}대</td></tr>`).join('');
  const srcs = [...new Set(R.parts.map(p => p.src)), 'size', 'acc', 'ext', R.capOn || L.capZone ? 'cap' : null, Lay.kind === 'piloti' ? 'small' : null].filter(Boolean)
    .map(k => `<li>${PARK_SOURCES[k].law} · <em>${PARK_SOURCES[k].status}</em></li>`).join('');
  const lay = Lay.kind === 'mech'
    ? `지하 기계식 1개층 <b>${Lay.perLevel}대</b> → 필요 지하 <b>${Lay.levels}개층</b>${Lay.levels > 1 ? ` · 추가 ${Lay.levels - 1}개층 공사비 ${won(e.extraCost || 0)}을 토공·지하골조에 반영` : ''} · 주차설비 ${won(e.equip || 0)}을 설비공사에 반영`
    : `${Lay.label} <b>${Lay.provided}대</b> 배치${Lay.note ? ' · ' + Lay.note : ''} — 3D 바닥의 흰 구획선`;
  return `<h3>주차 대수 산정 <small>용도별 산식을 합산한 뒤 끝수 처리 (별표1 비고)</small></h3>
    <div class="form">
      <label>지역 <i>조례·주택건설기준 지역 구분</i><select data-law="region">${Object.entries(REGIONS).map(([k, r]) => opt(k, r.name, L.region || 'seoul')).join('')}</select></label>
      <label>주차를 매스 조건으로<select data-law="parkHard">${opt('true', '필수 (대지 안 자주식)', String(L.parkHard !== false))}${opt('false', '권고 (기계식·인근 부설 별도)', String(L.parkHard !== false))}</select></label>
      <label>서울 주차상한제 <i>상업·준주거 10개 설치제한 지역 안</i><select data-law="capZone">${opt('false', '해당 없음', String(!!L.capZone))}${opt('true', '설치제한 지역 안', String(!!L.capZone))}</select></label>
      <label>상한 비율 <i>% · 조례 별표3 확인 · 기본값은 가정</i><input data-law="capRatio" type="number" step="5" min="10" max="100" value="${L.capRatio ?? 50}" ${L.capZone ? '' : 'disabled'}></label>
      <label>장애인 전용 비율 <i>% · 법정 2~4% 범위 조례값</i><input data-law="accRatio" type="number" step="0.5" min="2" max="4" value="${L.accRatio ?? 3}"></label>
    </div>
    <table class="tbl law park"><thead><tr><th>용도</th><th>산식</th><th>대수</th></tr></thead><tbody>${rows}
      <tr class="sum"><td>합계 → 법정 필요 대수</td><td>${R.sum.toFixed(1)}대 ${R.sum < 1 ? '(1대 미만 → 0대)' : `(끝수 ${(R.sum % 1).toFixed(1)} ${R.sum % 1 >= 0.5 ? '≥' : '<'} 0.5)`}</td><td><b>${R.std}대</b></td></tr>
      ${R.capOn ? `<tr><td>주차상한제 최고한도<i>주택·오피스텔 제외 시설 · 최소 1대</i></td><td>${R.std}대 × ${R.capRatio}%</td><td><b>≤ ${R.capMax}대</b></td></tr>` : ''}
      <tr><td>장애인 전용<i>설치기준 10대 이상일 때</i></td><td>${R.req >= 10 ? `${R.req}대 × ${R.accRatio}% → 올림` : '10대 미만 — 해당 없음'}</td><td>${R.acc}대</td></tr>
      <tr><td>확장형 2.6×5.2m<i>50대 이상 부설주차장</i></td><td>${R.req >= 50 ? `${R.req}대 × 30% → 올림` : '50대 미만 — 해당 없음'}</td><td>${R.ext}대</td></tr>
      <tr class="sum"><td>설계 목표 대수</td><td>${R.capOn ? '상한제 적용' : '법정 기준'}</td><td><b>${R.req}대</b></td></tr></tbody></table>
    <div class="fitSum ${F.rows.find(r => r.k === 'park')?.ok === false ? 'bad' : ''}">${lay}</div>
    <ul class="srcs">${srcs}<li>적용: ${R.region} · ${R.ord}. 주차상한제는 '설치제한 지역 안'을 고를 때만 적용합니다 (10개 지역: 4대문·신촌·영등포·강남서초·잠실·천호·청량리·용산마포·미아·목동의 상업·준주거).</li></ul>`;
}

export function renderEstimate(onChange) {
  const { est, PHASES, WEEKS, opts: o, T, CASH } = PRJ, A = est.A;
  const opt = (v, l, cur) => `<option value="${v}" ${String(cur) === String(v) ? 'selected' : ''}>${l}</option>`;
  const end = dateAt(WEEKS), last = CASH[CASH.length - 1], maxLoan = Math.max(...CASH.map(r => r.loan));
  const rows = PHASES.map(p => `<tr><td>${p.code} ${p.name}</td><td>${won(est.lines[p.key] || 0)}</td><td>${((est.lines[p.key] || 0) / est.direct * 100).toFixed(1)}%</td><td>${(p.w1 - p.w0).toFixed(1)}주</td></tr>`).join('');
  const L = PRJ.law, F = PRJ.fit;
  const fmtV = (v, u) => v == null ? '—' : (u === '%' || u === 'm' ? v.toFixed(1) : u === '㎡' ? v.toFixed(0) : Math.round(v)) + u;
  const status = r => r.ok == null ? ['확인 필요', 'q'] : r.ok ? ['적합', 'ok'] : r.advisory ? ['권고 미충족', 'adv'] : ['부적합', 'ng'];
  const lawRows = F.rows.map(r => { const [st, cl] = status(r); const src = SOURCES[r.k] || {};
    return `<tr><td>${r.name}${r.note ? `<i>${r.note}</i>` : ''}</td><td>${fmtV(r.plan, r.unit)}</td><td>${r.minRule ? '≥ ' : '≤ '}${fmtV(r.max, r.unit)}</td><td><b class="st ${cl}">${st}</b></td></tr>
      <tr class="src"><td colspan="4">${src.law || ''} · <em>${(r.k === 'bcr' || r.k === 'far') ? (F.z.v || '검증 필요') + (F.z.note ? ' · ' + F.z.note : '') : (src.status || '')}</em></td></tr>`; }).join('');
  $('estBody').innerHTML = `
    <h3>대지·법규 → 자동 매스 <small>용도지역·대지를 바꾸면 층수·평면 규모가 법규에 맞춰 다시 설계됩니다</small></h3>
    <div class="form">
      <label class="wide">용도지역 <i>서울시 도시계획 조례 기준</i><select data-law="zone">${ZONES.map(z => opt(z.id, `${z.name} · 건폐율 ${z.bcr}% · 용적률 ${z.far}%`, L.zone)).join('')}</select></label>
      <label>대지 폭 (전면) <i>m</i><input data-law="siteW" type="number" step="0.5" value="${L.siteW}"></label>
      <label>대지 깊이 <i>m · 북쪽이 뒤</i><input data-law="siteD" type="number" step="0.5" value="${L.siteD}"></label>
      <label>전면도로 폭 <i>m</i><input data-law="road" type="number" step="0.5" value="${L.road}"></label>
      <label>자동 최대 매스<select data-law="auto">${opt('true', '켜기 (법정 최대로 맞춤)', String(L.auto))}${opt('false', '끄기 (템플릿 설계 검토만)', String(L.auto))}</select></label>
    </div>
    <div class="fitSum ${F.feasible === false ? 'bad' : ''}">${F.auto ? (F.feasible === false ? '이 대지·용도지역에서는 모든 조건을 만족하는 매스를 찾지 못했습니다. 대지를 키우거나 용도지역을 바꿔 보세요.' : `자동 매스: <b>${F.n}층</b> (${T.piloti ? '필로티 포함' : T.basement ? '지하1층 별도' : ''}) · 평면 ${F.m.W.toFixed(1)}×${F.m.D.toFixed(1)}m · 지상 연면적 <b>${F.m.farArea.toFixed(0)}㎡</b> · 높이 ${F.m.height.toFixed(1)}m`) : '자동 매스 꺼짐 — 템플릿 설계를 그대로 검토합니다.'}</div>
    <table class="tbl law"><thead><tr><th>검토 항목</th><th>계획</th><th>기준</th><th>판정</th></tr></thead><tbody>${lawRows}</tbody></table>
    ${parkSection(F, L)}
    <p class="note">법규 값 기준일 ${RULES_ASOF}. '검증 필요' 항목은 법령 MCP로 조문·조례를 확인해 law.js의 표를 갱신하세요. 지구단위계획·가로구역 높이·도로사선 등은 아직 반영하지 않았습니다. 3D에서 주황 선이 대지 경계·일조사선·층별 건축가능영역입니다.</p>
    <h3>산정 조건 <small>바꾸면 공정표·3D 시점·자금이 즉시 다시 계산됩니다</small></h3>
    <div class="form">
      <label>마감 등급<select data-k="grade">${Object.entries(GRADES).map(([k, g]) => opt(k, `${g.name} (×${g.k})`, o.grade)).join('')}</select></label>
      <label>평당 직접공사비 <i>만원/평</i><input data-k="unit" type="number" step="10" value="${o.unit}"></label>
      <label>간접비·이윤 <i>%</i><input data-k="indirect" type="number" step="1" value="${o.indirect}"></label>
      <label>골조 층당 작업일 <i>RC</i><input data-k="frameDays" type="number" step="1" value="${o.frameDays}" ${T.structure !== 'rc' ? 'disabled' : ''}></label>
      <label>주당 작업일<select data-k="wdays">${opt(5, '5일 (토·일 휴무)', o.wdays)}${opt(6, '6일 (일 휴무)', o.wdays)}</select></label>
      <label>기계식 주차 단가 <i>만원/대 · 가정</i><input data-k="parkUnit" type="number" step="100" value="${o.parkUnit ?? 2500}" ${PRJ.park?.L?.kind !== 'mech' ? 'disabled' : ''}></label>
      <label>지연 시나리오<span class="pair"><select data-k="delayKey">${PHASES.map(p => opt(p.key, p.name, o.delayKey)).join('')}</select><input data-k="delayWeeks" type="number" step="1" min="0" value="${o.delayWeeks}"><i>주</i></span></label>
      <label>토지비 <i>억</i><input data-k="land" type="number" step="0.5" value="${o.land}"></label>
      <label>자기자본 <i>억</i><input data-k="equity" type="number" step="0.5" value="${o.equity}"></label>
      <label>대출 한도 <i>억</i><input data-k="limit" type="number" step="1" value="${o.limit}"></label>
      <label>대출 금리 <i>%</i><input data-k="rate" type="number" step="0.1" value="${o.rate}"></label>
    </div>
    <h3>면적</h3>
    <div class="kv"><div><span>대지면적</span>${A.site.toFixed(0)}㎡ <em>${py(A.site)}평</em></div><div><span>건축면적</span>${A.plate.toFixed(0)}㎡ <em>건폐율 ${A.bcr.toFixed(0)}%</em></div>
      <div><span>연면적</span>${A.gfa.toFixed(0)}㎡ <em>${py(A.gfa)}평</em></div><div><span>지상 연면적</span>${A.above.toFixed(0)}㎡ <em>용적률 ${A.far.toFixed(0)}%</em></div></div>
    <h3>공종별 공사비 · 기간</h3>
    <table class="tbl"><thead><tr><th>공종</th><th>금액</th><th>비율</th><th>기간</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="kv sum">
      <div><span>직접공사비</span>${won(est.direct)}</div><div><span>간접비·이윤</span>${won(est.indirect)}</div>
      <div class="big"><span>총공사비</span>${won(est.total)} <em>부가세 별도</em></div>
      <div><span>평당 / ㎡당</span>${Math.round(est.perPy).toLocaleString()}만원 <em>/ ${Math.round(est.perM2).toLocaleString()}만원</em></div>
      <div class="big"><span>공사기간</span>${WEEKS.toFixed(1)}주 <em>약 ${(WEEKS / 4.345).toFixed(1)}개월</em></div>
      <div><span>착공 → 준공</span>${fmtDate(T.start)} → ${fmtDate(end)}</div>
      <div class="big"><span>총사업비</span>${won(last.total)} <em>이자 ${won(last.cumInt)} 포함</em></div>
      <div><span>대출 최대 잔액</span><b ${maxLoan > o.limit ? 'class="warn"' : ''}>${won(maxLoan)}</b> <em>한도 ${o.limit}억${maxLoan > o.limit ? ' 초과' : ''}</em></div>
    </div>
    <p class="note">학습용 예시 단가·비율입니다. 실제 검토는 도급내역서·공정표·약정서 값을 넣으세요.</p>
    <button class="reset" data-reset>유형 기본값으로</button>`;
  $('estBody').querySelectorAll('[data-k]').forEach(el => el.addEventListener('change', () => {
    const k = el.dataset.k; PRJ.opts[k] = el.tagName === 'SELECT' && isNaN(+el.value) ? el.value : +el.value;
    recompute(); onChange();
  }));
  $('estBody').querySelector('[data-reset]').addEventListener('click', () => onChange('reset'));
  $('estBody').querySelectorAll('[data-law]').forEach(el => el.addEventListener('change', () => {
    const k = el.dataset.law, v = el.value;
    onChange('law', { [k]: k === 'zone' || k === 'region' ? v : k === 'auto' || k === 'parkHard' || k === 'capZone' ? v === 'true' : +v });
  }));
}

// ── 투어 카드 · 미니 평면 ────────────────────────────────────────────────────
export function tourCard(stop, i, n, room) {
  if (!stop) return '';
  const area = room ? `${room.area.toFixed(1)}㎡ · ${py(room.area)}평` : '';
  const fin = room ? ({ wood: '원목마루', tile: '포세린 타일', tileDark: '욕실 타일', carpet: '타일카펫', concretePol: '폴리싱 콘크리트', epoxy: '에폭시', granite: '화강석' }[room.fin] || '') : '';
  const dimensions = room ? `${(room.r[2] - room.r[0]).toFixed(2)} × ${(room.r[3] - room.r[1]).toFixed(2)}m` : '';
  return `<div class="tc-top"><b>STOP ${String(i + 1).padStart(2, '0')} / ${String(n).padStart(2, '0')}</b><span>${room ? room.floor + '층' : stop.floor ? stop.floor + '층' : ''}</span></div>
    <h4>${stop.title}</h4><p>${stop.desc || ''}</p>
    ${room ? `<div class="tc-kv"><div><span>면적</span>${area}</div><div><span>평면 치수</span>${dimensions}</div><div><span>바닥</span>${fin}</div><div><span>층고</span>${(room.floor === 1 ? PRJ.T.f1 : PRJ.T.ft).toFixed(2)}m</div></div>` : ''}`;
}
export function radarSVG(rooms, cam, look, curRoom) {
  if (!rooms || !rooms.length) return '';
  const xs = rooms.flatMap(r => [r.r[0], r.r[2]]), zs = rooms.flatMap(r => [r.r[1], r.r[3]]);
  const x0 = Math.min(...xs) - 0.6, x1 = Math.max(...xs) + 0.6, z0 = Math.min(...zs) - 0.6, z1 = Math.max(...zs) + 0.6;
  const W = 190, H = W * (z1 - z0) / (x1 - x0);
  const X = x => (x - x0) / (x1 - x0) * W, Z = z => (z - z0) / (z1 - z0) * H;
  let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">`;
  for (const r of rooms) {
    const on = r.id === curRoom;
    s += `<rect x="${X(r.r[0])}" y="${Z(r.r[1])}" width="${X(r.r[2]) - X(r.r[0])}" height="${Z(r.r[3]) - Z(r.r[1])}" fill="${on ? 'rgba(232,93,4,.16)' : 'rgba(242,239,231,.9)'}" stroke="var(--ink)" stroke-width="1"/>`;
    if ((r.r[2] - r.r[0]) > 2.2) s += `<text x="${X(r.cx)}" y="${Z(r.cz) + 3}" font-family="${MONO}" font-size="7.5" text-anchor="middle" fill="rgba(29,28,25,.7)">${r.name}</text>`;
  }
  if (cam) {
    const a = Math.atan2(look.x - cam.x, look.z - cam.z), cx = X(cam.x), cz = Z(cam.z), R = 22, sp = 0.5;
    s += `<path d="M${cx},${cz} L${cx + Math.sin(a - sp) * R},${cz + Math.cos(a - sp) * R} A${R},${R} 0 0 0 ${cx + Math.sin(a + sp) * R},${cz + Math.cos(a + sp) * R} Z" fill="rgba(232,93,4,.25)"/>`;
    s += `<circle cx="${cx}" cy="${cz}" r="4" fill="var(--accent)" stroke="#fff" stroke-width="1.5"/>`;
  }
  return s + `</svg>`;
}
