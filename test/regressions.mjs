// Regression checks for model quantities and the timeline's financial endpoints.
import assert from 'node:assert/strict';
import { TYPES } from '../js/types.js';
import { PRJ, loadType, recompute, areas, cashAt, workDaysTo } from '../js/project.js';
import { scaleType } from '../js/law.js';
import { CHAPTERS, chapterAt, P } from '../js/story.js';

const near = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-7, `${message}: ${a} != ${b}`);
for (const key of Object.keys(TYPES)) {
  loadType(key);
  near(areas().gfa, PRJ.fit.m.gfa, `${key}: law/model area`);
  const end = PRJ.CASH.at(-1);
  near(end.w, PRJ.WEEKS, `${key}: actual completion week`);
  near(end.cumCost, PRJ.est.total, `${key}: all construction costs paid`);
  for (const field of ['total', 'loan', 'cumCost', 'cumInt', 'eqUsed']) {
    near(cashAt(PRJ.WEEKS)[field], end[field], `${key}: completion HUD ${field}`);
    near(cashAt(PRJ.WEEKS + 10)[field], end[field], `${key}: clamp after completion ${field}`);
  }
  assert.equal(cashAt(-1).cumCost, 0, `${key}: clamp before start`);
  for (let i = 1; i < PRJ.CASH.length; i++) {
    const a = PRJ.CASH[i - 1], b = PRJ.CASH[i], middle = cashAt((a.w + b.w) / 2);
    near(middle.total, (a.total + b.total) / 2, `${key}: interpolate actual time interval`);
  }
}

// Mirrored unit doors must stay on their mirrored wall at every supported scale.
for (const key of ['dasedae']) for (const scale of [0.9, 1, 1.07, 1.2]) {
  const T = TYPES[key], scaled = scaleType(T, scale, T.floors, T.law);
  for (const [x0, z0, x1, z1, options] of scaled.floorsPlan[2].walls) {
    const alongX = Math.abs(z1 - z0) < 1e-6;
    const min = Math.min(alongX ? x0 : z0, alongX ? x1 : z1);
    const max = Math.max(alongX ? x0 : z0, alongX ? x1 : z1);
    for (const [a, b] of options?.gaps || []) assert.ok(a >= min - 1e-8 && b <= max + 1e-8, `${key} at ${scale}: door extends beyond wall`);
  }
}

loadType('jeonwon', { auto: true });
near(areas().gfa, PRJ.fit.m.gfa, 'scaled house extension area');
near((PRJ.T.wing.x1 - PRJ.T.wing.x0) * PRJ.T.wing.depth, PRJ.T.wingArea, 'wing footprint matches ledger');

loadType('geunsaeng');
const beforeMep = PRJ.PHASES.find(p => p.key === 'mep').w1;
const beforeFinish = PRJ.WEEKS;
PRJ.opts.delayKey = 'mep'; PRJ.opts.delayWeeks = 8; recompute();
near(PRJ.PHASES.find(p => p.key === 'mep').w1, beforeMep + 8, 'MEP delay retained');
assert.ok(PRJ.WEEKS > beforeFinish, 'MEP delay moves completion');
assert.ok(PRJ.PHASES.find(p => p.key === 'handover').w0 >= PRJ.PHASES.find(p => p.key === 'mep').w1, 'handover waits for MEP');
near(PRJ.CASH.at(-1).cumCost, PRJ.est.total, 'delayed project cost allocation');
PRJ.opts.wdays = 6; const sixDays = workDaysTo(10);
PRJ.opts.wdays = 5; assert.ok(workDaysTo(10) < sixDays, 'five-day week excludes Saturdays');

for (let i = 0; i < CHAPTERS.length; i++) {
  assert.equal(chapterAt(CHAPTERS[i].start), i, 'chapter boundary');
  assert.equal(chapterAt(CHAPTERS[i].jump), i, 'chapter button lands in its chapter');
  if (i) assert.ok(CHAPTERS[i].start > CHAPTERS[i - 1].start, 'chapters ordered');
}
assert.equal(chapterAt(1), CHAPTERS.length - 1);
assert.equal(chapterAt(P.land), CHAPTERS.findIndex(c => c.title === '실내·승강기 투어'));
console.log('PASS: 5 project ledgers, mirrored doors at 4 scales, house extensions, MEP delay, workweek and scene boundaries.');
