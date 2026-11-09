// law.fit 단위 점검 (브라우저 없이)  —  실행: node test/fit.mjs
// 유형마다 자동 최대 매스(층수 n, 평면 배율 s)와 검토 항목을 출력한다. law.js 표를 고친 뒤 값이 바뀌는지 확인할 때 쓴다.
import path from 'path'; import { fileURLToPath, pathToFileURL } from 'url';
globalThis.location = { search: '' };
const js = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'js') + '/').href;
const { TYPES } = await import(js + 'types.js');
const { fit } = await import(js + 'law.js');
let bad = 0;
for (const [k, T] of Object.entries(TYPES)) {
  const r = fit(T, T.law);
  if (r.feasible === false) bad++;
  console.log(k.padEnd(10), 'zone', T.law.zone, 'n', r.n, 's', r.s.toFixed(2), 'feasible', r.feasible ?? '(auto off)', 'far', r.m.farArea.toFixed(0), 'site', T.law.siteW * T.law.siteD);
  for (const row of r.rows) console.log('    ', row.name.padEnd(16), row.plan == null ? '-' : row.plan.toFixed(1), row.minRule ? '>=' : '<=', row.max.toFixed?.(1) ?? row.max, row.ok, row.advisory ? '(권고)' : '');
}
process.exit(bad ? 1 : 0);
