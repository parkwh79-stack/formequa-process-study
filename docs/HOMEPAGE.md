# 홈페이지 연결 — FORMEQUA · POWERED BY WAN2

## 1. 이 앱에 적용한 FORMEQUA 톤앤매너

2026-11-09에 formequa-research.web.app의 실제 계산값(CSS 변수, 글꼴)을 읽어 옮겼습니다.

| 요소 | FORMEQUA | 이 앱 (`style.css` v3.3 블록) |
|---|---|---|
| 바탕 | `#f5f3ee` 웜 페이퍼 (theme-color `#eeeae2`) | `--paper: #f5f3ee`. 3D 종이색 `C.paper`도 같은 값 |
| 글자 | `#242622` | `--ink: #242622` |
| 강조 | 올리브 `#707960` / `#424a3b`, 브론즈 `#b45309` | `--olive`, `--olive-dk`, `--accent: #b45309` (법규선·공정 강조) |
| 제목 | 세리프(Georgia/Cormorant) + 이탤릭 강조어 ("A way *of seeing.*") | `Cormorant Garamond`. "From drawing *to site.*", "Layer *by layer.*", "Every place, *a possibility.*" |
| 라벨 | `01 / ABOUT FORMEQUA` — 대문자, 자간 넓힘 | `.eyebrow` "04 / FROM DRAWING TO SITE", "EXPLODED AXONOMETRIC" |
| 본문 | SUIT/Pretendard, 자간 −0.015em | Noto Sans KR (SUIT는 Google Fonts에 없어 대체) |
| 카드 | 흰 카드, 얇은 선, 옅은 그림자, 각진 모서리 | `--card`, `--line`, `--shadow`. 판독기도 어두운 상자에서 밝은 유리 패널로 바꿈 |
| 링크 | 밑줄 + ↗ | "POWERED BY WAN2 ↗", "FORMEQUA ↗", "스크롤 연구 열기 ↗" |

연결은 세 곳에 넣었습니다.
- 헤더 왼쪽 **FORMEQUA** 워드마크 → formequa-research.web.app
- 헤더 오른쪽 **POWERED BY WAN2 ↗** → wan2-website.web.app
- 마무리 요약 패널의 **THE RESEARCHER — 박완희 Wanhee Park**: [POWERED BY WAN2 ↗] [FORMEQUA ↗]

FORMEQUA의 "THE RESEARCHER / POWERED BY WAN2" 구성과 같습니다.

## 2. FORMEQUA 홈페이지의 어디에 넣을까

현재 FORMEQUA 섹션 순서는 다음과 같습니다.

```
히어로 → 01 ABOUT → OUR PERSPECTIVE → OUR APPROACH(Place/Form/Value) → THE RESEARCHER
→ 02 SELECTED STUDIES → 03 THE ATELIER ("From place to form.") → 04 READING THE SITE
→ 05 MATERIAL & ATMOSPHERE → 06 A CONSIDERED PERSPECTIVE ("From form to value.") → 푸터
```

### 추천: 03 THE ATELIER 바로 다음에 새 섹션 "04 / FROM DRAWING TO SITE"
기존 04~06은 05~07로 번호를 하나씩 미룹니다.

- **이야기 흐름이 이어집니다.** 섹션 제목이 차례로 "From place to form."(Atelier) → **"From drawing to site."** → "From form to value."(사업성)로 이어져, 장소 → 형태 → 시공 → 가치 순서가 됩니다.
- **같은 데이터 언어를 씁니다.** Atelier의 "조건 확인"(용도지역·건폐율·용적률)과 사업성 카드(총사업비·PF)를 이 앱도 같은 항목으로 다룹니다. 방문자가 "이 숫자가 어떻게 나왔나"를 공정·법규·주차 과정으로 확인하게 됩니다.
- **역할이 겹치지 않습니다.** Selected Studies는 완성 이미지 위주, Atelier는 모형 조작 위주입니다. 이 섹션은 시간(공정)과 과정을 보여 주는 유일한 자리가 됩니다.

넣을 코드: `homepage/formequa-section.html`
- FORMEQUA의 CSS 변수를 그대로 쓰고, 변수가 없을 때를 위한 기본값도 들어 있습니다.
- `PROCESS_URL`만 배포 주소로 바꾸면 됩니다.
- 미리보기: `homepage/preview.html`

### 함께 넣으면 좋은 연결점
1. **상단 메뉴**: About / Studies / Atelier 다음에 **Process — 도면·공정** 추가 (`#process`)
2. **Atelier 탭**("One study, four perspectives" — 공간 모형 · 대지 조건 · 재료·외관 · 사업성) 오른쪽에 **공정·실내 ↗** 링크
3. **06 사업성 카드**의 "사업성 상세 검토 문의" 옆에 보조 링크 **공정·자금 흐름 보기 ↗** (`?est`로 산정 패널을 열어 둔 상태)
4. **WAN2 개인 홈페이지** 04 Research & Writing 또는 Methods & Instruments(도구: Revit·Python 등)에 "Process study ↗" 한 줄 — 연구 도구로 소개

## 3. 배포 방법 (택1)

| 방법 | 주소 예시 | 메모 |
|---|---|---|
| FORMEQUA Firebase 호스팅에 폴더로 | `https://formequa-research.web.app/process/` | `korea-starter` 폴더를 호스팅 `public/process/`에 복사 → `firebase deploy`. 같은 도메인이라 가장 자연스러움 |
| GitHub Pages | `https://<계정>.github.io/<저장소>/` | 저장소 공개 후 Settings → Pages. 빌드 단계 없음 |
| claude.ai 아티팩트 | 지금 미리보기 링크 | 공유 설정 전에는 본인만 열람 |

- 법제처 OC, VWorld 키 같은 비밀값은 어느 경우에도 앱 코드에 넣지 않습니다.
- 공공 API를 붙이는 단계에서는 중계 서버(Firebase Functions 또는 Cloudflare Worker)에 키를 둡니다.
