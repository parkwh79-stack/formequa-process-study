# 코드 구조 (ARCHITECTURE)

빌드 도구 없이 ES 모듈만 씁니다. three.js 0.169.0은 `index.html`의 importmap이 CDN(jsDelivr)에서 불러옵니다. 이미지 파일도 없습니다. 재질은 `textures.js`가 캔버스로 그립니다.

## 1. 좌표·단위 약속

| 항목 | 약속 |
|---|---|
| 단위 | m (면적 ㎡, 평 = ㎡ / 3.3058). 금액은 **억 원**, 단가는 만원/평 |
| 축 | x = 동(+)·서(−), y = 위, **z = 남(+)·북(−)**. 정북은 −z로 고정 (ROADMAP 2단계에서 실제 방위로 바꿀 예정) |
| 원점 | 건물 평면 중심, 지면 y = 0. `floorY(n)` = n층 바닥 높이, `roofY()` = 지붕 슬래브 |
| 전면 | 도로는 남측(+z). 대지 `T.site = {x0,x1,z0,z1}`는 `scaleType()`이 건물 둘레에 다시 잡습니다 |
| 시간 | 공정 진행은 주(week) 단위 실수 `t`. 날짜는 `dateAt(t)`가 작업일 달력으로 바꿉니다 |

## 2. 모듈 지도

```
index.html ── importmap(three) · 오류 상자 · HTML 레이어(헤더/히어로/판독기/카드/공정표/투어/법규카드/마무리)
style.css  ── CAD 룩 토큰(--paper/--ink/--accent) · 스크롤 연동 CSS 변수(--hero --dock --law --plan --tour --close …)

js/types.js     데이터: 유형별 치수·구조·개구부·평면(ROOMS/벽/가구/조명)·투어·단가·자금·기본 대지(law)
js/law.js       법규: ZONES·SOURCES·RULES_ASOF · metricsFor · check · fit · scaleType      (three 의존 없음 → node로 테스트)
js/parking.js   주차: parkingRequired(법정 대수) · parkingLayout(구획 좌표) · parkingCheck(판정 행) · REGIONS·PARK_SOURCES
js/project.js   상태 PRJ · loadType · 면적 · 공사비 estimate · 공정 schedule · 자금 cashflow · 달력
js/kit.js       모델링 도구와 부재 레지스트리: mat/box/cbox/merged · add(obj,key,order,how) · retime · update(t)
js/building.js  대지·흙막이·기초·골조·계단·외벽(개구부)·외장·지붕·크레인·간판 + 법규 시각화(envelope)
js/interior.js  바닥 마감·천장·칸막이(문 구멍)·가구 라이브러리 LIBF·실내 조명 → rooms
js/camera.js    프레임 키 보간(돌리 줌) camAt/setCam · poseToKey · makeTour(거리·시간 기반 보행)
js/walkthrough.js  유형별 눈높이·1층·승강기 경로
js/elevator.js  설치된 객실·층별 문·샤프트·레일 · 카메라와 같은 샘플로 업데이트
js/access.js    실제 기둥 격자 · 안전 여유가 있는 출입문 좌표
js/scroll-motion.js  실내 스크롤 입력량·시간 예산
js/rect-patches.js  샤프트를 비우는 마감 사각형 분할
js/sun.js       서울 위도 태양 위치
js/textures.js  캔버스 재질(벽돌·콘크리트·목재·타일 …), 미터 단위 UV
js/ui.js        간트·자금 S커브·판독 숫자 · 산정 패널(법규+공사비) · 투어 카드 · 미니 평면
js/story.js     공통 장면 경계 P · CHAPTERS · chapterAt · 스크롤 왕복 매핑 (카메라와 탐색 UI가 공유)
js/main.js      렌더러·하늘·AO·클리핑(평면·단면) · 카메라(buildKeys/streetKeys/sectionKeys) · 스윕·해칭 제어 · 법규 장면 · 진행률/주차 탐색 · 실내 집중 모드 · 마무리
```

의존 방향은 한쪽입니다: `types → parking → law → project → kit → building/interior → main`. `ui`와 `camera`는 `project`만 봅니다.

## 3. 데이터 흐름

```
loadType(key, lawOverride?, keepOpts?)                         project.js
  T0 = TYPES[key]
  PRJ.law = { ...T0.law, ...lawOverride }                      대지·용도지역
  PRJ.fit = fit(T0, PRJ.law)                                   law.js: 층수 n × 평면 배율 s 탐색
  PRJ.T   = scaleType(T0, s, n, law)                           실제 설계(좌표 s배, 가구 크기 유지, 대지 재배치)
  PRJ.park = PRJ.fit.park                                      주차 { R: 필요 대수·산식, L: 배치·구획 } — check() 안에서 계산
  recompute(): PHASES(w0,w1) · WEEKS · est(공종별 금액) · CASH(주별 자금)

buildWorld()                                                   main.js
  B = buildAll()   → kit.add(부재, 공정key, 순서, 방식) 로 모든 부재 등록, envelope 생성
  B.retime()       → PHASES로 부재별 등장 시점 계산
  KEYS(카메라 프레임 키) · tour · 평면 라벨 · 치수선 · 레벨 핀 · 컷 높이들
  syncTypeUI()     → 산정 패널 · 법규 카드 · 마무리 패널 HTML

frame()  (매 프레임)
  p(스크롤 0~1) → t = weekAt(p)  → B.update(t, {ghost, drawK, roomDraw})
                → 카메라: p < land ? camAt(KEYS) : tour.sample(u)
                → cutPlane.constant (평면도 컷 · 인트로 플로터)
                → 태양(dateAt(t), hour) · 조명 · 유리 발광
                → envelopeStage(법규 장면 단계) · CSS 변수 · HUD

산정 패널 입력
  공사비 조건 → PRJ.opts → recompute() → B.retime() → syncTypeUI()     (형상 재생성 없음)
  대지·용도지역 → loadType(key, patch, keepOpts) → buildWorld()          (매스가 바뀌므로 재생성)
```

## 4. 스크롤 대본 (`story.js`의 `P`)

| p | 장면 | 무엇이 움직이나 |
|---|---|---|
| (로딩) | 플로터 인트로 2.4초 | `cutPlane` −0.5 → 지붕+4m, `#scan` 주황선 + "PLOTTING A-201 · %" |
| 0 – 0.03 | 입면도 | fov 2°, `preview=1`(완성 건물), 종이색 + 45° 해칭 그림자(FX), 고정 태양 `SUN45` |
| 0.03 – 0.09 | 돌리 줌 + 스캔 스윕 | `FX.uSweep` −R → +R, 주황 스캔 평면 `W.scan`, 끝에 `preview` 1→0(건물이 가라앉음) |
| 0.09 – 0.16 | 법규 장면 | lawU 0–0.25 대지 → 0.25–0.55 층별 영역 → 0.55–0.78 일조사선 → 0.78–1 결과·주차구획 |
| 0.16 – 0.50 | 공정 | `weekAt(p)` 0 → WEEKS, 공정표·자금, `buildKeys`, 장비·동바리·비계가 공정에 따라 |
| 0.50 – 0.53 | 준공 가로 시점 | `streetKeys`(고층 앙각), 시간대 버튼 |
| 0.53 – 0.615 | **단면** | 단면 개요 → 1층 눈높이 → 외부 입구, `earthCut` 표시 |
| 0.615 – 0.675 | 입구·1층 | 외부 입구 → 1층 방문 → 도면 전 외부로 물러남 |
| 0.675 – 0.745 | 평면도 | 컷이 지붕 → 바닥+1.2m, drawK=1(선화), 방 라벨·치수 |
| 0.745 – 0.81 | 착지 | 컷 → 벽 상단, 카메라가 투어 시작점으로 |
| 0.81 – 0.985 | 실내·승강기 | 정지점 카드 · 이름 탭 · 미니 평면, 승강기에서는 객실·문·카메라 동기화 |
| 0.985 – | 마무리 요약 | `#closing` + `body.closeOn` |

장면 박자 캡션은 `BEATS` 배열(구간 · 번호 · 문장)이 정하고, 상태줄 코드는 `sceneCode(p)`가 정합니다.

자동 재생은 `story.progressPerSecond()`가 장면별 초를 정합니다. 실내는 `tour.duration`을 사용합니다. 유형별 경로·시간·안정화·검증은 `CAMERA_MOTION.md`에 기록했습니다.

새 장면을 넣으려면 다음 순서로 고칩니다.
1. P에 구간을 추가하고 뒤 구간을 민다.
2. KEYS에 프레임 키를 넣는다. p 오름차순을 지켜야 한다.
3. frame()에 그 구간의 로직과 CSS 변수를 넣는다.
4. index.html의 `data-jump` 값을 고친다.

## 5. 자주 하는 확장

### 유형 추가 (`types.js`)
1. 가장 비슷한 유형을 복사합니다. 주택 계열이면 `villaBase`를 펼치면 됩니다.
2. `W·D·floors·f1·ft·structure·style·roof·piloti·basement`를 정합니다.
3. `openings`로 면·층·위치·폭·높이를 정하고, `floorsPlan[층] = { rooms, walls, furniture, lights }`를 채웁니다.
4. `tour`(planFloor 기준 상대 y)와 `cost`·`fin`을 넣습니다.
5. `law`(zone, siteW, siteD, road, auto)와 `floorRange`, `use`를 넣습니다. `use`는 주차 산식과 유형 요건을 고릅니다.
6. `index.html`의 `.types`에 버튼을 달고 `main.js`의 `TYPE_ORDER`에 key를 추가합니다.
7. `node test/fit.mjs`로 feasible을 확인한 뒤, `?type=키&p=0.68`(평면도)과 `?p=0.85`(투어)로 눈으로 점검합니다.

### 법규 항목 추가 (`law.js`)
1. `SOURCES`에 `{ law: '조문', status: '검증 필요' }`를 추가합니다.
2. `check()`의 `rows`에 `{ k, name, plan, max, unit, ok, minRule?, advisory? }`를 넣습니다.
   - `advisory: true`면 권고 항목이라 매스 탐색을 막지 않습니다.
   - `ok: null`이면 "확인 필요"로 표시됩니다.
3. 형상에 영향을 주는 규칙(이격, 높이 등)은 `check()`의 `needD/needW` 계산에 반영합니다. 3D에 보이려면 `building.js` envelope에 선을 추가하고 `EU.sun` 또는 `EU.floors`에 넣으면 법규 장면 단계에 자동으로 묶입니다.
4. 원칙: 수치 판정은 이 표와 계산 코드가 합니다. LLM·MCP는 근거 조회와 표 갱신에만 씁니다.

### 가구 추가 (`interior.js` LIBF)
- `이름: ({ w = 기본폭 }) => fb().b('재질', w, h, d, x, y, z)…` 형식입니다. `fb()`는 상자를 합쳐 메시 하나로 만듭니다.
- `types.js`의 `furniture`에 `['이름', x, z, 회전(도), { w }]`로 배치합니다. `scaleType()`은 위치만 s배로 바꾸고 크기는 유지합니다.

### 공정 추가 (`project.js`)
1. `PHASE_DEFS`에 `{ key, code, name, only? }`를 넣습니다.
2. `schedule()`의 규칙 `R[key] = { dur, deps: [[선행key, 'FS'|'SS', lag]] }`를 정합니다.
3. `SHARES`에 공사비 비율을 넣습니다.
4. 부재를 그 공정에 묶으려면 `add(obj, 'key', 순서, 'rise'|'drop'|'grow'|'show')`를 씁니다.

### 주차 규칙 고치기 (`parking.js`)
- 용도별 기준면적은 `RATE`(시행령 base / 서울 seoul)에 있습니다. 지역별 주택 기준은 `REGIONS[].house = [85㎡ 이하, 85㎡ 초과]`에 있습니다.
- 새 용도는 `parkingRequired()`의 `switch (T.use)`에 `area('키', 면적)`으로 추가합니다. 끝수 처리는 `roundPark()` 한 곳에서 합니다.
- 배치는 `parkingLayout()`이 `{kind, stalls:[{x0,z0,x1,z1,tandem}], provided, …}`를 돌려줍니다. 3D 구획선(building.js)과 법규 장면(EU.park)이 이 좌표를 그대로 씁니다.
- 필수/권고는 `law.parkHard`(패널의 "주차를 매스 조건으로")와 배치 종류로 정합니다. 지하 기계식은 항상 권고입니다.

### 카메라 고치기
- 공정 구간 카메라는 `buildKeys(T, …)`가 공정표에서 시점을 읽어 만듭니다. 새 유형 프로필을 추가할 때는 `tall`/`timber` 분기처럼 조건을 하나 더 둡니다.
- 키의 `ease`를 `u => u`로 주면 등속 궤도(골조 중간 구간처럼)가 됩니다.

### 셰이더 효과 (`kit.js` FX)
모든 kit 재질은 `applyFx(m, poche)` 하나로 컴파일됩니다. 전역 uniform `FX`를 바꾸면 장면 전체에 즉시 적용됩니다.
- `uSweep`(월드 x), `uSweepK`(0/1): x > uSweep 쪽을 종이색으로. 스캔 평면이 지나간 쪽만 재질이 드러납니다.
- 해칭: `reflectedLight.directDiffuse`가 거의 0인 곳(그림자·태양 반대면)에 `gl_FragCoord` 기준 45° 사선. `uHatch` 또는 '아직 도면인 영역'에서 켭니다.
- 포셰: 뒷면을 잉크색으로(sRGB 값). 도면 장면은 후처리 없이 화면에 바로 그리므로 색이 정확합니다.

### 단면 장면 고치기
- 절단 위치: 유형에 `secZ`(기본 0.2m)를 두면 됩니다. 방문 층은 `secFloors(T)`가 정합니다.
- 흙 단면: `building.js`의 `earthCut`(양면, 해칭 텍스처). 단면 중에는 그림자 강도를 0.15로 낮춥니다(셰도맵에는 클리핑이 적용되지 않음).

## 6. 성능·렌더링 메모
- **실사 품질(HQ)**: `Sky`(투명 패치: `uOpacity`·`uGain`) → `pmrem.fromScene(envScene)`(태양 방향이 0.04 이상 바뀔 때만) → `EffectComposer`(RenderPass → GTAOPass → OutputPass). GTAO는 fov > 14°이고 평면도가 아닐 때만 켭니다(망원 도면 구간은 깊이 범위가 커서 끔).
- Sky는 ShaderMaterial이라 전역 클리핑 평면의 영향을 받지 않습니다. 카메라를 따라다니며 `far`에 맞춰 크기를 바꿉니다.
- 같은 재질의 작은 부재는 `merged()`로 합쳐 드로콜을 줄입니다. 바닥에서 솟아오르는 연출에는 `at` 피벗을 씁니다.
- 포셰는 `DoubleSide` + 뒷면을 잉크색으로 칠하는 방식입니다. 유리·선·조명·식재는 `NO_POCHE`로 제외합니다.
- 클리핑은 `renderer.clippingPlanes` 전역 평면 하나만 씁니다. 그림자 계산에는 적용되지 않습니다.
- 유형 전환은 `disposeWorld()`로 지오메트리·재질을 해제한 뒤 다시 만듭니다.

## 7. 점검 방법
- `node test/fit.mjs` — 법규 엔진 단위 점검 (브라우저 불필요)
- 주소 파라미터: `?type= ?p= ?hour= ?est ?nointro`. 콘솔에서는 `__ks.PRJ`, `__ks.switchType('dormitory')`
- 스크린샷 자동화: Playwright + SwiftShader. CDN 요청을 로컬 npm `three` 패키지로 돌리면 오프라인에서도 찍힙니다. 이 저장소에는 포함하지 않았고, 방식만 STUDY_GUIDE 5장에 적었습니다.

## 8. 보안·배포
- 법제처 OC, VWorld 키 등은 코드·문서에 넣지 않습니다. 예시 파일은 `YOUR_OC_HERE` 자리표시만 씁니다.
- GitHub Pages 정적 배포가 가능합니다. 공공 API를 붙일 때는 키를 중계 서버(예: Cloudflare Worker)에 둡니다.
