// ─────────────────────────────────────────────────────────────────────────────
// types.js — 건물 유형 정의 (치수 · 개구부 · 방(ROOMS) · 벽 · 가구 · 투어 · 단가 · 자금)
//
// Casa Serra / Casa Larga(원작자의 평면도 데모)의 핵심 아이디어:
//   "ROOMS 표 하나가 평면도 글자, 바닥 마감, 가구 배치, 카메라 투어를 모두 정한다."
// 좌표: 1 unit = 1 m. x = 동(+)/서(-), z = 남(+, 전면도로)/북(-). 건물 중심 = 원점.
// 방 r: [x0, z0, x1, z1]  · 벽 seg: [x0, z0, x1, z1, { gaps:[[a,b]...], t, glass }]
// 가구: [종류, x, z, 회전(도, 0=남향), 옵션]  · 투어 키: { pos, look, stop:{...} }
// ※ 수치는 학습용 예시. 실제 사업은 실제 도면 치수로 바꾸세요.
// ─────────────────────────────────────────────────────────────────────────────

// 다세대·다가구 공통 평면 (B세대 = 동쪽 절반. A세대는 x를 뒤집어 자동 생성)
const villaRoomsB = [
  { id: 'entry',   name: '현관',     r: [2.0, -3.0, 4.2, -0.7], fin: 'tile' },
  { id: 'util',    name: '다용도실', r: [2.0, -5.0, 4.2, -3.0], fin: 'tile' },
  { id: 'bath',    name: '욕실',     r: [4.2, -5.0, 6.5, -2.2], fin: 'tileDark' },
  { id: 'room2',   name: '작은방',   r: [4.2, -2.2, 6.5, 1.4], fin: 'wood' },
  { id: 'kitchen', name: '주방·식당', r: [0.0, -0.7, 4.2, 1.4], fin: 'wood' },
  { id: 'living',  name: '거실',     r: [0.0, 1.4, 3.6, 5.0], fin: 'wood' },
  { id: 'master',  name: '안방',     r: [3.6, 1.4, 6.5, 5.0], fin: 'wood' },
];
const villaWallsB = [
  [4.2, -5.0, 4.2, 1.4, { gaps: [[-2.95, -2.25], [-0.4, 0.4]] }],
  [2.0, -3.0, 4.2, -3.0, { gaps: [[2.8, 3.6]] }],
  [4.2, -2.2, 6.5, -2.2],
  [3.6, 1.4, 6.5, 1.4],
  [3.6, 1.4, 3.6, 5.0, { gaps: [[1.6, 2.4]] }],
];
const villaFurnB = [
  ['shoeCab', 4.02, -1.6, -90, { len: 1.3 }],
  ['kitchen', 1.1, -0.3, 0, { len: 2.0 }],
  ['fridge', 0.45, 1.0, 90],
  ['diningSet', 2.7, 0.45, 0, { w: 1.3, d: 0.8, seats: 4 }],
  ['sofa', 0.55, 3.3, 90, { w: 2.1 }],
  ['rug', 1.8, 3.3, 0, { w: 1.9, d: 1.5 }],
  ['tv', 3.42, 3.3, -90, { w: 1.4 }],
  ['plant', 0.4, 4.6, 0],
  ['bed', 5.4, 2.5, 0, { w: 1.5, l: 2.05 }],
  ['wardrobe', 3.92, 4.1, 90, { len: 1.6 }],
  ['bed', 5.95, -0.6, 180, { w: 1.0, l: 2.0 }],
  ['desk', 4.75, 0.95, 0, { w: 1.0 }],
  ['toilet', 6.05, -4.55, 0],
  ['vanity', 4.85, -4.6, 0],
  ['washer', 2.45, -4.55, 0],
];
const mirrorX = list => list.map(([k, x, z, r, o]) => [k, -x, z, -r, o]);

const villaBase = {
  short: '다세대', W: 13, D: 10, style: 'piloti', cladMat: 'brick', unitsPerFloor: 2, setback: { front: 1.0, side: 1.0 }, f1: 3.0, ft: 2.9, basement: 0,
  piloti: true, roof: 'flat', structure: 'rc', facade: 'brick', storefront: false, crane: true,
  site: { x0: -9, x1: 9, z0: -7.5, z1: 8 }, parkLines: [-4.5, -3.1, -0.3, 0.3, 3.1, 4.5],
  core: { x0: -2, x1: 2, z0: -4.7, z1: -0.7, doorsSide: true, frontDoor1: [-0.6, 0.6],
          stair: { xa: -1.3, xb: -0.1, w: 1.2, zLow: -1.0, zHigh: -3.2, landing: [-1.9, -4.6, 0.5, -3.2] },
          hole: [-1.9, -3.2, 0.5, -0.8], ev: [0.7, -4.6, 1.9, -3.2] },
  openings: [
    { side: 'S', floors: [2, 99], u: 1.8, sill: 0.5, w: 2.4, h: 1.7, mirror: true },
    { side: 'S', floors: [2, 99], u: 5.05, sill: 0.9, w: 1.6, h: 1.3, mirror: true },
    { side: 'E', floors: [2, 99], u: 3.3, sill: 1.0, w: 1.1, h: 1.2, mirror: true },
    { side: 'E', floors: [2, 99], u: -0.4, sill: 0.9, w: 1.3, h: 1.2, mirror: true },
    { side: 'E', floors: [2, 99], u: -3.6, sill: 1.5, w: 0.6, h: 0.6, mirror: true },
    { side: 'N', floors: [2, 99], u: 3.1, sill: 1.3, w: 0.8, h: 0.8, mirror: true },
    { side: 'N', floors: [1, 99], u: -0.9, sill: 1.6, w: 0.9, h: 0.9 },
  ],
  planFloor: 2,
  floorsPlan: {
    2: {
      rooms: [...villaRoomsB.map(r => ({ ...r, id: r.id + 'B', name: r.name })),
              ...villaRoomsB.map(r => ({ ...r, id: r.id + 'A', name: r.name, r: [-r.r[2], r.r[1], -r.r[0], r.r[3]] })),
              { id: 'core2', name: '계단실', r: [-2.0, -4.7, 2.0, -0.7], fin: 'granite' }],
      walls: [...villaWallsB, ...villaWallsB.map(([x0, z0, x1, z1, o]) => [-x0, z0, -x1, z1, o && { ...o,
        gaps: o.gaps?.map(([a, b]) => Math.abs(z1 - z0) < 1e-6 ? [-b, -a] : [a, b]) }]),
              [0, -0.7, 0, 5.0, { t: 0.2, mat: 'concrete' }]],
      furniture: [...villaFurnB, ...mirrorX(villaFurnB)],
      lights: [[1.8, 2.2, 3.0], [5.0, 2.2, 3.0], [2.4, 2.2, 0.4], [-1.8, 2.2, 3.0]],
      ceiling: true,
    },
    1: {  // 필로티: 주차 4대
      rooms: [{ id: 'park', name: '필로티 주차장', r: [-6.5, -0.7, 6.5, 5.0], fin: 'epoxy' },
              { id: 'core1', name: '공용 현관', r: [-2.0, -4.7, 2.0, -0.7], fin: 'granite' }],
      walls: [],
      furniture: [['car', -4.6, 2.4, 180, { color: 0x2f3a46 }], ['car', -1.7, 2.4, 180, { color: 0xd8d6d0 }],
                  ['car', 1.7, 2.4, 180, { color: 0x6b1f22 }], ['mailbox', -2.6, -1.0, 0]],
      lights: [], ceiling: false,
    },
  },
  tour: [
    { pos: [3.1, 1.6, -2.5], look: [2.0, 1.4, 1.6], stop: { room: 'entryB', title: '현관', desc: '공용 계단실에서 들어서는 현관. 신발장과 다용도실이 붙어 있습니다.', reveal: ['entryB', 'utilB'] } },
    { pos: [3.8, 1.6, 0.9], look: [0.6, 1.2, -0.6], stop: { room: 'kitchenB', title: '주방·식당', desc: '코어 벽을 따라 놓인 ㄱ자 주방과 4인 식탁.', reveal: ['kitchenB'] } },
    { pos: [3.0, 1.6, 1.9], look: [1.0, 1.3, 4.9], stop: { room: 'livingB', title: '거실', desc: '남향 창 2.4m. 세대간 벽 쪽에 소파, 맞은편에 TV.', reveal: ['livingB'] } },
    { pos: [3.05, 1.6, 2.0], look: [5.4, 1.4, 2.4] },
    { pos: [4.1, 1.6, 2.1], look: [5.8, 1.2, 4.6], stop: { room: 'masterB', title: '안방', desc: '남·동 2면 채광. 퀸 침대와 붙박이장.', reveal: ['masterB'] } },
    { pos: [3.4, 1.6, 0.6], look: [4.4, 1.5, 0.0] },
    { pos: [4.6, 1.6, 0.25], look: [6.0, 1.0, -1.5], stop: { room: 'room2B', title: '작은방', desc: '자녀방·서재로 쓰는 3평 남짓한 방.', reveal: ['room2B', 'bathB'] } },
    { pos: [1.8, 1.6, 3.6], look: [1.8, 1.4, 12], stop: { room: 'livingB', title: '창밖 전망', desc: '거실 창에서 본 전면 도로. 시간대 버튼으로 빛을 바꿔 보세요.', reveal: ['livingB'] } },
  ],
};


// ── 임대형기숙사 평면 (중복도형, 층당 원룸 8실 + 공동주방·라운지) ────────────────
// 건축법 시행령 별표1 제2호라목2): 임대사업자 등이 임대 목적으로 20실 이상 제공 + 공동취사시설 이용 세대 50% 이상
const DORM_W0 = -3.0, DORM_RW = 2.425;                 // 객실 구역 시작 x, 객실 폭
const dormRooms = [], dormWalls = [], dormFurn = [];
for (let i = 0; i < 4; i++) {
  const x0 = DORM_W0 + i * DORM_RW, x1 = x0 + DORM_RW;
  dormRooms.push({ id: 'n' + (i + 1), name: `20${i + 1}호`, r: [x0, -5.2, x1, -0.6], fin: 'wood' });
  dormRooms.push({ id: 's' + (i + 1), name: `20${i + 5}호`, r: [x0, 0.6, x1, 5.2], fin: 'wood' });
  if (i > 0) { dormWalls.push([x0, -5.2, x0, -0.6]); dormWalls.push([x0, 0.6, x0, 5.2]); }
  dormFurn.push(['bathPod', x0 + 1.72, -1.35, 180], ['bed', x0 + 0.55, -3.9, 180, { w: 0.9, l: 2.0 }], ['desk', x0 + 1.75, -4.85, 180, { w: 0.9 }]);
  dormFurn.push(['bathPod', x0 + 1.72, 1.35, 0], ['bed', x0 + 0.55, 3.9, 0, { w: 0.9, l: 2.0 }], ['desk', x0 + 1.75, 4.85, 0, { w: 0.9 }]);
}
const doorGaps = [0, 1, 2, 3].map(i => [DORM_W0 + i * DORM_RW + 0.12, DORM_W0 + i * DORM_RW + 0.92]);
dormWalls.push([DORM_W0, -0.6, 6.7, -0.6, { gaps: doorGaps }], [DORM_W0, 0.6, 6.7, 0.6, { gaps: doorGaps }], [DORM_W0, 0.6, DORM_W0, 5.2]);
const dormRoomCenters = [0, 1, 2, 3].map(i => DORM_W0 + (i + 0.5) * DORM_RW);

export const TYPES = {
  // ══════════════════════════════════════════════════════════════════════
  geunsaeng: {
    name: '근생 빌딩 · 근린생활시설 신축공사', short: '근생 빌딩', kind: 'RC 지하1층·지상 근린생활시설 (1층 카페·상층 사무소)',
    style: 'storefront', frontDoors: [3.6], use: 'neighborhood', floorRange: [3, 8], setback: { front: 1.0, side: 0.5 },
    law: { zone: 'sr', siteW: 18, siteD: 19, road: 8, auto: true, region: 'seoul', parkHard: true },
    site: { x0: -10, x1: 10, z0: -8, z1: 8.5 },
    W: 14, D: 11, floors: 5, f1: 4.5, ft: 3.6, basement: 4.2,
    piloti: false, roof: 'flat', structure: 'rc', facade: 'granite', storefront: true, crane: true,
    start: new Date(2027, 2, 2),
    core: { x0: -6.7, x1: -2.7, z0: -5.2, z1: -0.2,
            stair: { xa: -6.0, xb: -4.8, w: 1.2, zLow: -0.6, zHigh: -4.0, landing: [-6.6, -5.1, -4.2, -4.0] },
            hole: [-6.6, -4.0, -4.2, -0.5], ev: [-4.1, -5.1, -2.9, -3.5], doorEast: [-1.5, -0.5] },
    openings: [
      { side: 'E', floors: [2, 99], u: -2.6, sill: 0.9, w: 2.2, h: 1.9 },
      { side: 'E', floors: [2, 99], u: 2.4, sill: 0.9, w: 2.2, h: 1.9 },
      { side: 'E', floors: [1, 1], u: 2.6, sill: 0.5, w: 2.8, h: 2.8 },
      { side: 'N', floors: [2, 99], u: 3.5, sill: 1.0, w: 1.6, h: 1.4 },
      { side: 'N', floors: [1, 1], u: 4.8, sill: 0, w: 1.0, h: 2.2, door: true },
    ],
    planFloor: 1,
    floorsPlan: {
      1: {
        rooms: [{ id: 'cafeF', name: '카페 홀', r: [-6.7, -0.2, 6.7, 5.2], fin: 'concretePol' },
                { id: 'cafeB', name: '바·주방', r: [-2.7, -5.2, 6.7, -0.2], fin: 'tile' },
                { id: 'core1', name: '계단실·EV', r: [-6.7, -5.2, -2.7, -0.2], fin: 'granite' }],
        walls: [],
        furniture: [
          ['barCounter', 3.1, -1.7, 0, { len: 5.0 }], ['backBar', 3.1, -4.85, 0, { len: 6.0 }],
          ['pendant', 1.4, -1.7, 0, { y: 3.2 }], ['pendant', 3.1, -1.7, 0, { y: 3.2 }], ['pendant', 4.8, -1.7, 0, { y: 3.2 }],
          ['cafeTable', -5.3, 0.9, 0], ['cafeTable', -5.2, 2.8, 0], ['cafeTable', -2.6, 2.4, 0],
          ['longTable', 1.8, 1.2, 0, { len: 3.6 }], ['windowBar', -3.4, 4.75, 0, { len: 5.2 }],
          ['plant', 6.2, 0.4, 0], ['plant', -6.3, 4.8, 0], ['menuBoard', 3.1, -5.05, 0],
        ],
        lights: [[3.1, 3.3, -1.5], [-3.5, 3.3, 2.5], [2.5, 3.3, 3.0]],
        ceiling: false,
      },
      2: {
        rooms: [{ id: 'office', name: '사무실', r: [-2.7, -5.2, 6.7, 5.2], fin: 'carpet' },
                { id: 'meet', name: '회의실', r: [-6.7, -0.2, -2.7, 5.2], fin: 'carpet' },
                { id: 'core2', name: '계단실·EV', r: [-6.7, -5.2, -2.7, -0.2], fin: 'granite' }],
        walls: [[-2.7, -0.2, -2.7, 5.2, { glass: true, gaps: [[0.4, 1.3]] }]],
        furniture: [
          ['deskRow', 1.6, 1.6, 0, { n: 4 }], ['deskRow', 1.6, 2.4, 180, { n: 4 }],
          ['deskRow', 1.6, -1.6, 0, { n: 3 }], ['cabinetRow', 2.4, -4.9, 0, { len: 6.0 }],
          ['meetTable', -4.7, 2.5, 90, { len: 2.6, seats: 6 }], ['tv', -4.7, 5.05, 180, { w: 1.6, y: 1.0 }],
          ['plant', 6.2, 4.7, 0], ['plant', -0.2, -4.7, 0],
        ],
        lights: [[2.0, 2.7, 1.0], [-4.7, 2.7, 2.5]],
        ceiling: true,
      },
    },
    tour: [
      { pos: [3.6, 1.6, 10.5], look: [2.0, 1.6, 0.0], stop: { room: 'cafeF', title: '1층 카페 입구', desc: '전면 유리 파사드와 화강석 띠. 1층 층고 4.5m.', reveal: [] } },
      { pos: [3.6, 1.6, 3.4], look: [-3.8, 1.2, 1.6], stop: { room: 'cafeF', title: '카페 홀', desc: '노출 천장, 폴리싱 콘크리트 바닥. 창가 바 테이블과 원형 테이블.', reveal: ['cafeF'] } },
      { pos: [-0.6, 1.6, 0.0], look: [3.8, 1.3, -3.4], stop: { room: 'cafeB', title: '바·주방', desc: '5m 바 카운터와 펜던트 조명. 뒤편 백바 선반.', reveal: ['cafeB'] } },
      { pos: [-1.8, 1.6, -1.0], look: [-4.5, 1.6, -1.0] },
      { pos: [-3.6, 1.6, -1.0], look: [-6.0, 1.9, -2.0], stop: { room: 'core1', title: '계단실 → 2층', desc: '코어(계단+승강기). 계단으로 2층 사무실에 올라갑니다.', reveal: ['core1'] } },
      { pos: [-6.0, 1.6, -0.9], look: [-6.0, 2.8, -4.6] },
      { pos: [-6.0, 3.85, -4.1], look: [-4.2, 3.9, -4.7] },
      { pos: [-4.8, 3.85, -4.2], look: [-4.8, 5.6, -0.4] },
      { pos: [-4.8, 6.1, -0.8], look: [-2.0, 6.1, -1.0] },
      { pos: [-1.4, 6.1, -1.0], look: [4.2, 5.6, 3.4], stop: { room: 'office', title: '2층 사무실', desc: '타일카펫, 매입 조명. 동측 창과 전면 띠창으로 2면 채광.', reveal: ['office', 'core2'] } },
      { pos: [-1.6, 6.1, 2.4], look: [-5.2, 5.6, 2.8], stop: { room: 'meet', title: '회의실', desc: '유리 칸막이 회의실 · 6인 테이블.', reveal: ['meet'] } },
      { pos: [2.6, 6.1, 3.6], look: [2.6, 5.9, 14], stop: { room: 'office', title: '창가 · 전면 도로', desc: '띠창으로 본 가로. 시간대 버튼으로 빛을 바꿔 보세요.', reveal: [] } },
    ],
    cost: { unit: 850, indirect: 12, frameDays: 12 },
    fin: { land: 95, equity: 40, limit: 110, rate: 0.065, label: 'PF' },
    spec: {
      site: '가설울타리 · 현장사무실 · 측량', earth: 'H-PILE+토류판 · 터파기 · 잔토반출', found: '매트기초 t=900',
      sub: 'B1 외벽 t=350 · 1층 슬래브', frame: 'RC 라멘조 · 층당 작업일 기준', roof: '옥탑 · 파라펫 · 우레탄 도막방수',
      masonry: '블록 측벽 · 미장', window: '알루미늄 창호 · 1층 상가 유리', facade: '화강석 버너 t=30 · 건식',
      mep: '수변전 · 공조 · 승강기 1대', interior: '1층 카페 · 2층 사무실 마감', landscape: '보도 포장 · 가로수', handover: '사용승인 · 준공검사',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  midsize: {
    name: '중소형 빌딩 · 업무시설 신축공사', short: '중소형 빌딩', kind: 'RC 지하1층·지상 업무시설 (1층 로비·근생)',
    style: 'curtain', frontDoors: [-2.6, 4.8], use: 'office', floorRange: [5, 10], setback: { front: 1.0, side: 0.5 },
    law: { zone: 'cg', siteW: 22, siteD: 20, road: 12, auto: true, region: 'seoul', parkHard: true },
    site: { x0: -11, x1: 11, z0: -13, z1: 7 },
    W: 16, D: 12, floors: 8, f1: 4.5, ft: 3.9, basement: 4.2,
    piloti: false, roof: 'flat', structure: 'rc', facade: 'curtain', storefront: true, crane: true,
    start: new Date(2027, 2, 2),
    core: { x0: -7.7, x1: -3.2, z0: -5.7, z1: -0.7,
            stair: { xa: -7.0, xb: -5.8, w: 1.2, zLow: -1.1, zHigh: -4.5, landing: [-7.6, -5.6, -5.2, -4.5] },
            hole: [-7.6, -4.5, -5.2, -1.0], ev: [-5.0, -5.6, -3.4, -3.8], doorEast: [-2.1, -1.0] },
    openings: [
      { side: 'E', floors: [2, 99], u: -3.0, sill: 0.9, w: 2.4, h: 2.0 },
      { side: 'E', floors: [2, 99], u: 2.5, sill: 0.9, w: 2.4, h: 2.0 },
      { side: 'E', floors: [1, 1], u: 3.0, sill: 0.5, w: 3.6, h: 2.9 },
      { side: 'N', floors: [2, 99], u: 3.5, sill: 1.0, w: 2.0, h: 1.5 },
      { side: 'N', floors: [1, 1], u: 6.6, sill: 0, w: 1.0, h: 2.2, door: true },
    ],
    planFloor: 1,
    floorsPlan: {
      1: {
        rooms: [{ id: 'lobby', name: '로비', r: [-7.7, -0.7, 2.0, 5.7], fin: 'granite' },
                { id: 'evhall', name: 'EV홀', r: [-3.2, -5.7, 2.0, -0.7], fin: 'granite' },
                { id: 'retail', name: '근생 (편의점)', r: [2.0, -5.7, 7.7, 5.7], fin: 'tile' },
                { id: 'core1', name: '계단실·EV', r: [-7.7, -5.7, -3.2, -0.7], fin: 'granite' }],
        walls: [[2.0, -5.7, 2.0, 5.7, { glass: true }]],
        furniture: [
          ['lobbyDesk', 0.2, 0.4, 0, { len: 2.6 }], ['sofa', -6.9, 3.4, 90, { w: 2.2 }], ['armchair', -4.9, 2.6, -90], ['armchair', -4.9, 4.2, -90],
          ['rug', -5.9, 3.4, 0, { w: 2.2, d: 2.6 }], ['plant', -7.2, 5.2, 0], ['plant', 1.4, 5.2, 0], ['plant', 1.4, -5.2, 0],
          ['shelfRow', 3.6, 0.3, 90, { len: 6.0 }], ['shelfRow', 5.3, 0.3, 90, { len: 6.0 }], ['cabinetRow', 7.25, -1.0, -90, { len: 5.0 }], ['counter', 6.6, 4.4, 180, { len: 1.8 }],
        ],
        lights: [[-3.0, 3.6, 2.4], [4.8, 3.6, 0.5], [-0.5, 3.6, -3.0]],
        ceiling: false,
      },
      2: {
        rooms: [{ id: 'office', name: '사무실', r: [-3.2, -5.7, 7.7, 5.7], fin: 'carpet' },
                { id: 'meet', name: '회의실', r: [-7.7, -0.7, -3.2, 5.7], fin: 'carpet' },
                { id: 'core2', name: '계단실·EV', r: [-7.7, -5.7, -3.2, -0.7], fin: 'granite' }],
        walls: [[-3.2, -0.7, -3.2, 5.7, { glass: true, gaps: [[0.3, 1.2]] }]],
        furniture: [
          ['deskRow', 2.3, 1.9, 0, { n: 5 }], ['deskRow', 2.3, 2.7, 180, { n: 5 }],
          ['deskRow', 2.3, -2.6, 0, { n: 5 }], ['deskRow', 2.3, -1.8, 180, { n: 5 }], ['cabinetRow', 2.4, -5.55, 0, { len: 8.0 }],
          ['meetTable', -5.45, 2.6, 90, { len: 3.0, seats: 8 }], ['tv', -5.45, -0.5, 0, { w: 1.8, y: 1.0 }],
          ['plant', 7.2, 5.2, 0], ['plant', -2.8, 5.2, 0],
        ],
        lights: [[2.4, 3.1, 0.0], [-5.4, 3.1, 2.6]],
        ceiling: true,
      },
    },
    tour: [
      { pos: [-2.6, 1.6, 12.5], look: [-2.6, 2.4, 0.0], stop: { room: 'lobby', title: '업무동 출입구', desc: '커튼월 전면, 1층 층고 4.5m. 왼쪽이 업무 로비, 오른쪽이 근생(편의점).', reveal: [] } },
      { pos: [-2.6, 1.6, 4.2], look: [-1.0, 1.4, -2.6], stop: { room: 'lobby', title: '로비', desc: '안내데스크와 대기 라운지. 안쪽에 EV홀과 계단 코어.', reveal: ['lobby', 'evhall'] } },
      { pos: [0.9, 1.6, 2.2], look: [5.6, 1.2, 0.4], stop: { room: 'retail', title: '1층 근생 (편의점)', desc: '유리 칸막이 너머 근린생활시설. 진열대와 계산대.', reveal: ['retail'] } },
      { pos: [-1.6, 1.6, -1.55], look: [-4.5, 1.6, -1.55] },
      { pos: [-4.0, 1.6, -1.55], look: [-7.0, 1.9, -2.6], stop: { room: 'core1', title: '코어 → 2층', desc: '계단 2개 비행 + 승강기. 계단으로 2층 사무실에 올라갑니다.', reveal: ['core1'] } },
      { pos: [-7.0, 1.6, -1.4], look: [-7.0, 2.8, -5.0] },
      { pos: [-7.0, 3.85, -4.65], look: [-5.2, 3.9, -5.2] },
      { pos: [-5.8, 3.85, -4.7], look: [-5.8, 5.6, -0.9] },
      { pos: [-5.8, 6.1, -1.3], look: [-2.5, 6.1, -1.55] },
      { pos: [-2.2, 6.1, -1.55], look: [4.6, 5.6, 3.6], stop: { room: 'office', title: '2층 사무실', desc: '타일카펫과 매입 조명, 20석 오픈 오피스. 전면 커튼월과 동측 창.', reveal: ['office', 'core2'] } },
      { pos: [-2.5, 6.1, 1.4], look: [-6.0, 5.6, 2.6], stop: { room: 'meet', title: '회의실', desc: '유리 칸막이 8인 회의실.', reveal: ['meet'] } },
      { pos: [1.0, 6.1, 4.2], look: [1.0, 5.9, 16], stop: { room: 'office', title: '커튼월 · 전면 가로', desc: '바닥부터 천장까지 유리. 시간대 버튼으로 빛을 바꿔 보세요.', reveal: [] } },
    ],
    cost: { unit: 950, indirect: 12, frameDays: 12 },
    fin: { land: 160, equity: 60, limit: 230, rate: 0.065, label: 'PF' },
    spec: {
      site: '가설울타리 · 현장사무실', earth: 'CIP+어스앵커 · 터파기', found: '매트기초 t=1000', sub: 'B1 외벽 · 1층 슬래브',
      frame: 'RC 라멘조 · 층당 작업일 기준', roof: '옥탑 · 도막방수', masonry: '코어·측벽 블록', window: '알루미늄 창호', facade: '유닛 커튼월 · 화강석',
      mep: '공조 · 수변전 · 승강기 2대', interior: '로비·근생·사무실 마감', landscape: '공개공지 · 보도', handover: '사용승인 · 준공검사',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  dormitory: {
    name: '임대형기숙사 신축공사 (필로티 + 원룸형 객실)', short: '임대형기숙사', kind: 'RC 필로티 + 객실층 · 층당 8실 · 공동주방',
    style: 'piloti', cladMat: 'stucco', use: 'dormitory', parkLines: [-2.9, 0.1, 3.1, 6.1], roomsPerFloor: 8, floorRange: [4, 7], setback: { front: 1.0, side: 1.0 },
    law: { zone: 'r2', siteW: 20, siteD: 24, road: 8, auto: true, region: 'seoul', parkHard: true },
    site: { x0: -10, x1: 10, z0: -16, z1: 8 },
    W: 14, D: 11, floors: 6, f1: 3.0, ft: 2.9, basement: 0,
    piloti: true, roof: 'flat', structure: 'rc', facade: 'stucco', storefront: false, crane: true,
    start: new Date(2027, 3, 5),
    core: { x0: -6.7, x1: -3.0, z0: -5.2, z1: -0.7, frontDoor: [-4.3, -3.4],
            stair: { xa: -6.0, xb: -4.8, w: 1.2, zLow: -1.0, zHigh: -3.4, landing: [-6.6, -5.1, -4.2, -3.4] },
            hole: [-6.6, -3.4, -4.2, -0.9], ev: [-4.0, -5.1, -3.1, -3.6] },
    openings: [
      ...dormRoomCenters.map(u => ({ side: 'S', floors: [2, 99], u, sill: 0.9, w: 1.1, h: 1.4 })),
      ...dormRoomCenters.map(u => ({ side: 'N', floors: [2, 99], u, sill: 1.0, w: 1.0, h: 1.3 })),
      { side: 'S', floors: [2, 99], u: -4.85, sill: 0.6, w: 2.6, h: 1.6 },
      { side: 'W', floors: [2, 99], u: 2.6, sill: 0.9, w: 1.6, h: 1.3 },
      { side: 'E', floors: [2, 99], u: 0, sill: 0.5, w: 1.0, h: 1.7 },
      { side: 'N', floors: [1, 99], u: -5.2, sill: 1.6, w: 0.9, h: 0.9 },
    ],
    planFloor: 2,
    floorsPlan: {
      2: {
        rooms: [{ id: 'lounge', name: '공동주방·라운지', r: [-6.7, -0.7, -3.0, 5.2], fin: 'wood' },
                { id: 'hall', name: '복도', r: [-3.0, -0.6, 6.7, 0.6], fin: 'tile' },
                { id: 'core2', name: '계단실', r: [-6.7, -5.2, -3.0, -0.7], fin: 'granite' }, ...dormRooms],
        walls: dormWalls,
        furniture: [['kitchen', -6.35, 2.4, 90, { len: 3.0 }], ['fridge', -6.3, 4.6, 90], ['diningSet', -4.5, 1.6, 0, { w: 1.4, d: 0.8, seats: 4 }],
                    ['diningSet', -4.5, 3.9, 0, { w: 1.4, d: 0.8, seats: 4 }], ['plant', -3.4, 4.9, 0], ...dormFurn],
        lights: [[-4.8, 2.2, 2.6], [1.8, 2.2, 0.0], [-0.0, 2.2, 3.0]],
        ceiling: true,
      },
      1: {
        rooms: [{ id: 'park', name: '필로티 주차장', r: [-3.0, -5.2, 6.7, 5.2], fin: 'epoxy' },
                { id: 'lobby1', name: '공용 현관', r: [-6.7, -0.7, -3.0, 5.2], fin: 'granite' },
                { id: 'core1', name: '계단실', r: [-6.7, -5.2, -3.0, -0.7], fin: 'granite' }],
        walls: [],
        furniture: [['car', -1.4, 2.4, 180, { color: 0x3a4652 }], ['car', 1.6, 2.4, 180, { color: 0xcfcdc6 }], ['car', 4.6, 2.4, 180, { color: 0x6b1f22 }], ['mailbox', -5.6, 0.0, 0]],
        lights: [], ceiling: false,
      },
    },
    tour: [
      { pos: [-3.5, 1.6, 0.0], look: [-5.9, 1.1, 3.3], stop: { room: 'lounge', title: '공동주방·라운지', desc: '층마다 있는 공동취사시설. 객실에는 개별 취사시설을 두지 않습니다 (공동취사 이용 100%).', reveal: ['lounge', 'core2'] } },
      { pos: [-2.4, 1.6, 0.0], look: [6.0, 1.5, 0.0], stop: { room: 'hall', title: '중복도', desc: '복도 양쪽으로 원룸 8실. 복도 끝 창으로 환기·채광.', reveal: ['hall'] } },
      { pos: [-0.03, 1.6, 0.0], look: [-0.03, 1.5, 3.0] },
      { pos: [-0.1, 1.6, 1.6], look: [0.9, 1.1, 4.8], stop: { room: 's2', title: '원룸 (206호)', desc: '약 11㎡ · 욕실 포드 · 침대·책상. 취사는 공동주방에서.', reveal: ['s1', 's2', 's3', 's4', 'n1', 'n2', 'n3', 'n4'] } },
      { pos: [0.6, 1.6, 3.4], look: [0.6, 1.4, 12], stop: { room: 's2', title: '창가', desc: '남향 창. 시간대 버튼으로 빛을 바꿔 보세요.', reveal: [] } },
    ],
    cost: { unit: 720, indirect: 12, frameDays: 11 },
    fin: { land: 42, equity: 15, limit: 48, rate: 0.068, label: 'PF' },
    spec: {
      site: '가설울타리 · 측량', earth: '터파기 1.5m', found: '매트기초 t=600', frame: 'RC 벽식+필로티 기둥',
      roof: '옥탑 · 도막방수', masonry: '객실 칸막이 · 욕실 포드 설치', window: 'PVC 이중창', facade: '외단열 스타코 · 화강석 필로티',
      mep: '개별 냉난방 · 승강기 1대', interior: '객실·공동주방 마감', landscape: '필로티 주차 · 조경', handover: '사용승인 · 임대사업 등록',
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  dasedae: { ...villaBase, name: '다세대주택 신축공사 (필로티 + 주택 4개층 이하)', short: '다세대주택',
    kind: 'RC 필로티 + 주택층 · 층당 2세대', floors: 5, start: new Date(2027, 3, 5), use: 'dasedae', floorRange: [3, 5],
    law: { zone: 'r2', siteW: 18, siteD: 20, road: 6, auto: true, region: 'seoul', parkHard: true },
    cost: { unit: 680, indirect: 12, frameDays: 11 },
    fin: { land: 30, equity: 12, limit: 35, rate: 0.07, label: 'PF' },
    spec: { site: '가설울타리 · 인접건물 보양', earth: '터파기 1.5m', found: '매트기초 t=600', frame: 'RC 벽식+필로티 기둥',
      roof: '옥탑 · 도막방수', masonry: '세대 칸막이 · 욕실 방수', window: 'PVC 이중창', facade: '치장벽돌 · 필로티 화강석',
      mep: '세대 보일러 · 승강기', interior: '도배·마루 · 주방가구', landscape: '필로티 주차 · 조경', handover: '사용승인 · 보존등기' } },

  // ══════════════════════════════════════════════════════════════════════
  jeonwon: {
    name: '전원주택 신축공사 (경량목구조 2층 · 전면 박공 윙)', short: '전원주택', kind: '경량목구조 2층 단독주택 · 교차 박공 · 석재 기단 · 벽난로',
    style: 'timber', use: 'house', floorRange: [2, 2], setback: { front: 8.0, side: 2.0 },
    law: { zone: 'mp', siteW: 32, siteD: 25, road: 6, auto: false, region: 'other' },
    site: { x0: -16, x1: 16, z0: -12, z1: 13 },
    W: 12, D: 8, floors: 2, f1: 3.0, ft: 2.8, basement: 0,
    piloti: false, roof: 'gable', structure: 'timber', facade: 'stone', storefront: false, crane: false,
    start: new Date(2027, 3, 5),
    core: null,
    stairTimber: { x: 2.35, w: 1.1, zLow: 1.4, zHigh: -2.6 },
    hole2: [1.8, -2.6, 2.9, 1.5],
    // ── 본체(12×8) 밖으로 붙는 요소 — building.js의 '전원주택 디테일'이 만든다 ──
    //   wing: 남측으로 2.6m 돌출한 2층 박공 윙(1층 식당 베이 · 2층 안방 라운지) / porch: 현관 포치 + 2층 발코니
    //   chimney: 서측 석재 굴뚝(거실 벽난로) / pool: 서측 정원 수영장 / pergola: 동측 테라스
    wing: { x0: -5.7, x1: -0.7, depth: 2.6 },
    porch: { x0: 0.7, x1: 6.0, depth: 2.0 },
    chimney: { z: 1.4 },
    pool: { x0: -14.8, x1: -9.4, z0: -4.0, z1: 1.8 },
    pergola: { x0: 7.6, x1: 11.6, z0: -2.4, z1: 1.6 },
    parkYard: { x0: -11.2, xMax: -5.6 },  // 앞마당 주차 2대 — 서측 진입로 (담장 개구부와 맞춤)
    wingArea: 13.0,                      // 윙 바닥면적(층당, ㎡) — 건축면적·연면적에 더한다
    planShiftZ: 1.4,                     // 평면도 카메라를 윙 쪽으로 조금 내림
    openings: [
      { side: 'S', floors: [1, 1], u: -3.2, sill: 0, w: 4.4, h: 2.55, open: true },   // 윙(식당 베이)으로 트인 개구부
      { side: 'S', floors: [1, 1], u: 2.2, sill: 0, w: 1.0, h: 2.2, door: true },
      { side: 'S', floors: [1, 1], u: 4.5, sill: 0.6, w: 1.6, h: 1.7 },
      { side: 'E', floors: [1, 1], u: 1.5, sill: 1.0, w: 1.2, h: 1.2 },
      { side: 'E', floors: [1, 1], u: -2.8, sill: 1.6, w: 0.6, h: 0.6 },
      { side: 'W', floors: [1, 1], u: 3.2, sill: 0.9, w: 1.0, h: 1.4 },
      { side: 'W', floors: [1, 1], u: -0.6, sill: 0.9, w: 1.0, h: 1.4 },
      { side: 'W', floors: [1, 1], u: -2.6, sill: 1.1, w: 1.2, h: 1.0 },
      { side: 'N', floors: [1, 1], u: -3.5, sill: 1.1, w: 2.4, h: 1.0 },
      { side: 'N', floors: [1, 1], u: 1.0, sill: 1.0, w: 0.8, h: 1.2 },
      { side: 'S', floors: [2, 2], u: -3.2, sill: 0, w: 4.4, h: 2.35, open: true },   // 윙(안방 라운지)으로 트인 개구부
      { side: 'S', floors: [2, 2], u: 4.5, sill: 0, w: 0.9, h: 2.1, door: true },      // 발코니 문
      { side: 'S', floors: [2, 2], u: 1.2, sill: 1.0, w: 1.0, h: 1.2 },
      { side: 'E', floors: [2, 2], u: 1.5, sill: 0.9, w: 1.2, h: 1.2 },
      { side: 'E', floors: [2, 2], u: -2.3, sill: 0.9, w: 1.2, h: 1.2 },
      { side: 'W', floors: [2, 2], u: 3.2, sill: 0.9, w: 0.9, h: 1.2 },
      { side: 'W', floors: [2, 2], u: -2.2, sill: 1.4, w: 0.8, h: 0.8 },
      { side: 'N', floors: [2, 2], u: -1.7, sill: 1.5, w: 0.6, h: 0.6 },
      { side: 'N', floors: [2, 2], u: 4.5, sill: 1.0, w: 1.0, h: 1.0 },
    ],
    planFloor: 1,
    floorsPlan: {
      1: {
        rooms: [{ id: 'living', name: '거실', r: [-6, -0.6, -0.4, 4], fin: 'wood' },
                { id: 'bay', name: '식당 베이', r: [-5.6, 4, -0.8, 6.5], fin: 'wood' },
                { id: 'kitchen', name: '아일랜드 주방', r: [-6, -4, -0.4, -0.6], fin: 'wood' },
                { id: 'hall', name: '현관·계단홀', r: [-0.4, -4, 3.0, 4], fin: 'tile' },
                { id: 'bath1', name: '욕실', r: [3.0, -4, 6, -1.4], fin: 'tileDark' },
                { id: 'guest', name: '게스트룸', r: [3.0, -1.4, 6, 4], fin: 'wood' }],
        walls: [[-0.4, -4, -0.4, -1.8], [3.0, -4, 3.0, 4, { gaps: [[-2.3, -1.5], [1.0, 1.8]] }], [3.0, -1.4, 6, -1.4]],
        furniture: [
          ['fireplace', -5.72, 1.4, 90, { w: 1.8 }], ['sofa', -2.0, 1.4, -90, { w: 2.6 }], ['rug', -3.8, 1.4, 0, { w: 2.2, d: 2.8 }],
          ['armchair', -3.9, 3.3, 180], ['armchair', -3.9, -0.1, 0], ['plant', -0.8, 3.6, 0],
          ['diningSet', -3.2, 5.3, 0, { w: 2.0, d: 1.0, seats: 6 }], ['pendant', -3.7, 5.3, 0, { y: 2.2 }], ['pendant', -2.7, 5.3, 0, { y: 2.2 }],
          ['kitchen', -3.8, -3.53, 0, { len: 4.0 }], ['fridge', -1.1, -3.48, 0], ['island', -3.4, -1.95, 0, { len: 2.6 }],
          ['shoeCab', 2.83, 2.9, -90, { len: 1.4 }],
          ['bed', 5.0, 2.6, -90, { w: 1.4, l: 2.0 }], ['desk', 3.6, -1.0, 180, { w: 1.0 }],
          ['toilet', 5.5, -3.6, 0], ['vanity', 4.0, -3.65, 0],
        ],
        lights: [[-3.2, 2.5, 1.4], [-3.2, 2.4, 5.2], [-3.4, 2.4, -2.0], [1.2, 2.5, 2.0]],
        ceiling: true,
      },
      2: {
        rooms: [{ id: 'master', name: '안방', r: [-6, -0.4, -0.4, 4], fin: 'wood' },
                { id: 'mbay', name: '안방 라운지', r: [-5.6, 4, -0.8, 6.5], fin: 'wood' },
                { id: 'dress', name: '드레스룸', r: [-6, -4, -3, -0.4], fin: 'wood' },
                { id: 'bath2', name: '욕실', r: [-3, -4, -0.4, -0.4], fin: 'tileDark' },
                { id: 'hall2', name: '계단홀·가족실', r: [-0.4, -4, 3.0, 4], fin: 'wood' },
                { id: 'kids', name: '자녀방', r: [3.0, -0.6, 6, 4], fin: 'wood' },
                { id: 'study', name: '서재', r: [3.0, -4, 6, -0.6], fin: 'wood' }],
        walls: [[-0.4, -4, -0.4, 4, { gaps: [[0.4, 1.2], [-2.2, -1.4]] }], [-6, -0.4, -0.4, -0.4, { gaps: [[-4.6, -3.8]] }],
                [-3, -4, -3, -0.4], [3.0, -4, 3.0, 4, { gaps: [[1.9, 2.7], [-3.7, -2.9]] }], [3.0, -0.6, 6, -0.6],
                [1.75, -2.6, 1.75, 1.5, { glass: true, h: 1.0 }], [1.75, 1.5, 2.95, 1.5, { glass: true, h: 1.0 }]],
        furniture: [
          ['bed', -3.2, 0.65, 0, { w: 1.6, l: 2.1 }], ['wardrobe', -4.5, -3.75, 0, { len: 2.8 }],
          ['lounge', -4.4, 5.4, 150], ['lounge', -2.0, 5.4, -150], ['rug', -3.2, 5.2, 0, { w: 2.2, d: 1.6 }], ['plant', -1.2, 6.1, 0],
          ['toilet', -1.0, -3.55, 0], ['vanity', -2.3, -3.6, 0],
          ['bed', 5.0, 2.4, -90, { w: 1.0, l: 2.0 }], ['desk', 3.7, 3.45, 0, { w: 1.1 }],
          ['desk', 4.5, -3.5, 180, { w: 1.6 }], ['bookshelf', 5.75, -2.0, -90, { len: 2.0 }],
          ['plant', 0.0, 3.6, 0],
        ],
        lights: [[-3.2, 2.4, 1.6], [-3.2, 2.3, 5.2], [4.5, 2.4, 1.8], [1.0, 2.4, 2.4]],
        ceiling: true,
      },
    },
    tour: [
      { pos: [3.0, 1.6, 15.5], look: [-1.0, 3.2, 0.0], stop: { room: 'hall', title: '정원 · 진입', desc: '석재 담장과 대문, 디딤돌 정원길. 전면 박공 윙과 현관 포치·발코니, 서측 석재 굴뚝.', reveal: [] } },
      { pos: [2.2, 1.6, 7.4], look: [2.2, 1.9, 0.0], stop: { room: 'hall', title: '현관 포치', desc: '2층 발코니가 지붕이 되는 포치. 석재 기단 위에 적삼목 기둥.', reveal: [] } },
      { pos: [2.5, 1.6, 2.6], look: [-3.0, 1.4, 1.0], stop: { room: 'hall', title: '현관', desc: '현관에 들어서면 왼쪽으로 거실과 벽난로가 열리고 오른쪽에 계단.', reveal: ['hall'] } },
      { pos: [-0.9, 1.6, 2.4], look: [-5.6, 1.3, 1.4], stop: { room: 'living', title: '거실 · 벽난로', desc: '서측 벽의 석재 벽난로가 거실의 중심. 굴뚝은 외벽 밖으로 지붕 위까지.', reveal: ['living'] } },
      { pos: [-1.6, 1.6, 3.4], look: [-3.4, 1.2, 6.6], stop: { room: 'bay', title: '식당 베이', desc: '전면으로 2.6m 돌출한 윙. 3면 창 아래 6인 식탁.', reveal: ['bay'] } },
      { pos: [-1.0, 1.6, 0.4], look: [-4.0, 1.2, -3.6], stop: { room: 'kitchen', title: '아일랜드 주방', desc: '북측 창 아래 일자 주방과 월넛 아일랜드.', reveal: ['kitchen', 'bath1', 'guest'] } },
      { pos: [1.3, 1.6, 2.0], look: [2.35, 2.2, -1.5] },
      { pos: [2.35, 1.6, 1.9], look: [2.35, 3.4, -2.6] },
      { pos: [2.35, 4.6, -2.9], look: [0.0, 4.4, -2.0] },
      { pos: [1.0, 4.6, -3.2], look: [-0.5, 4.5, 0.0] },
      { pos: [0.4, 4.6, 0.8], look: [-3.0, 4.4, 1.0] },
      { pos: [-0.9, 4.6, 0.8], look: [-4.6, 4.2, 2.0], stop: { room: 'master', title: '2층 안방', desc: '드레스룸·욕실이 붙은 안방.', reveal: ['master', 'dress', 'bath2', 'hall2'] } },
      { pos: [-1.6, 4.6, 2.6], look: [-3.2, 4.3, 6.8], stop: { room: 'mbay', title: '안방 라운지', desc: '박공 윙 2층. 정원을 내려다보는 라운지와 줄리엣 발코니.', reveal: ['mbay'] } },
      { pos: [0.3, 4.6, 0.8], look: [1.0, 4.5, 2.4] },
      { pos: [0.8, 4.6, 2.3], look: [4.0, 4.4, 2.3] },
      { pos: [2.4, 4.6, 2.3], look: [5.4, 4.1, 2.9], stop: { room: 'kids', title: '자녀방', desc: '남측 문으로 포치 위 발코니에 나간다.', reveal: ['kids', 'study'] } },
      { pos: [4.5, 4.6, 3.0], look: [4.5, 4.3, 9.0], stop: { room: 'kids', title: '2층 발코니', desc: '유리 난간 너머 정원과 수영장.', reveal: [] } },
    ],
    cost: { unit: 820, indirect: 12, frameDays: 9 },
    fin: { land: 3.0, equity: 4.0, limit: 6.5, rate: 0.055, label: '건축자금대출' },
    spec: {
      site: '경계측량 · 가설전기·수도', earth: '부지 정지 · 배수 · 오수관', found: '온통기초 t=300 · 단열 · 윙 기초',
      frame: '2×6 구조목 · OSB · 교차 박공 윙', roof: '서까래 · 리얼징크(차콜) · 후레싱', window: '시스템창호 (3중유리) · 베이창',
      facade: '자연석 판석 · 적삼목 사이딩 · 스타코', mep: '보일러 · 정화조 · 벽난로 연도', interior: '석고보드 · 원목마루 · 아일랜드 주방',
      landscape: '석재 담장 · 디딤돌 · 수영장 · 퍼걸러 · 정원등', handover: '사용승인 · 입주',
    },
  },
};

// 개구부 확장: mirror → 반대편(S/N은 u 부호 반전, E는 W로), floors 범위를 실제 층수로
export function expandOpenings(T) {
  const out = [];
  for (const o of T.openings) {
    const f1 = o.floors[0], f2 = Math.min(o.floors[1], T.floors);
    for (let f = f1; f <= f2; f++) {
      out.push({ ...o, floor: f });
      if (o.mirror) {
        if (o.side === 'S' || o.side === 'N') out.push({ ...o, floor: f, u: -o.u });
        else out.push({ ...o, floor: f, side: o.side === 'E' ? 'W' : 'E' });
      }
    }
  }
  return out;
}
