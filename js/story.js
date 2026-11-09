// One timeline for the camera, scene navigation and keyboard controls.
export const P = Object.freeze({ flat: 0.03, open: 0.09, lawEnd: 0.16, buildEnd: 0.50, street: 0.53, secIn: 0.555, secOut: 0.615, entry: 0.63, ground: 0.66, cut: 0.675, planIn: 0.715, planHold: 0.745, land: 0.81, close: 0.985 });

export const CHAPTERS = Object.freeze([
  { title: '입면도', start: 0, jump: 0 },
  { title: '선에서 재료로', start: P.flat, jump: 0.06 },
  { title: '대지·법규', start: P.open, jump: 0.135 },
  { title: '공정·자금', start: P.lawEnd, jump: 0.26 },
  { title: '준공·빛', start: P.buildEnd, jump: 0.515 },
  { title: '단면으로 읽기', start: P.street, jump: 0.58 },
  { title: '입구·1층 방문', start: P.secOut, jump: 0.65 },
  { title: '평면도', start: P.cut, jump: 0.73 },
  { title: '눈높이로', start: P.planHold, jump: 0.78 },
  { title: '실내·승강기 투어', start: P.land, jump: P.land+0.0005 },
  { title: '프로젝트 요약', start: P.close, jump: 0.995 },
]);

export function chapterAt(p) {
  const value = Number.isFinite(p) ? Math.min(1, Math.max(0, p)) : 0;
  let index = 0;
  for (let i = 1; i < CHAPTERS.length; i++) if (value >= CHAPTERS[i].start) index = i;
  return index;
}

// Seconds per complete chapter, not seconds per entire normalized 0–1 track.
const SECONDS = [4, 5, 8, 28, 4, 8, 10, 6, 6, 150, 5];
export function progressPerSecond(p, tourSeconds = 150) {
  const i = chapterAt(p), end = CHAPTERS[i + 1]?.start ?? 1;
  return (end - CHAPTERS[i].start) / (i === 9 ? Math.max(30, tourSeconds) : SECONDS[i]);
}

// Allocate most of the physical scroll track to the slower interior visit.
const SCROLL_TOUR = 0.38, SCROLL_CLOSE = 0.98;
export function storyToScroll(p) {
  if(p<=P.land) return p/P.land*SCROLL_TOUR;
  if(p<=P.close) return SCROLL_TOUR+(p-P.land)/(P.close-P.land)*(SCROLL_CLOSE-SCROLL_TOUR);
  return SCROLL_CLOSE+(p-P.close)/(1-P.close)*(1-SCROLL_CLOSE);
}
export function scrollToStory(s) {
  if(s<=SCROLL_TOUR) return s/SCROLL_TOUR*P.land;
  if(s<=SCROLL_CLOSE) return P.land+(s-SCROLL_TOUR)/(SCROLL_CLOSE-SCROLL_TOUR)*(P.close-P.land);
  return P.close+(s-SCROLL_CLOSE)/(1-SCROLL_CLOSE)*(1-P.close);
}
