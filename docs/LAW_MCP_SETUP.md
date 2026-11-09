# 법령 MCP 설치 안내 (korean-law-mcp)

목적: Claude가 국가법령정보센터의 **조문·별표·자치법규(조례)·연혁**을 직접 조회해서, 이 앱의 법규 값 표(`js/law.js`의 `ZONES`·`SOURCES`)를 검증·갱신하게 하는 것.

추천 서버: **[chrisryugj/korean-law-mcp](https://github.com/chrisryugj/korean-law-mcp)** (MIT)
- `search_law`, `get_law_text`(조문·부칙), `get_annexes`(별표·서식, 날짜 지정 가능), `ordinance_radar`(조례의 상위법 개정 확인), `time_travel`·`amendment_track`(연혁 비교) 등
- 다른 후보: [seo-jinseok/korean-law-mcp](https://github.com/seo-jinseok/korean-law-mcp) (MIT, Windows exe 제공, 환경변수 `OPEN_LAW_ID`)

---

## 1단계 — 법제처 Open API 인증키(OC) 발급 (무료)

1. [국가법령정보 공동활용](https://open.law.go.kr) 접속 → 회원가입·로그인
2. 상단 **OPEN API → OPEN API 신청**에서 사용 신청 (서비스명 예: "건축 법규 검토 학습용")
3. 승인되면 받는 **OC 값**을 메모합니다. (보통 가입 이메일의 아이디 부분)

> OC는 개인 키입니다. 깃허브에 올리는 코드나 공개 페이지에 넣지 마세요.

## 2단계 — 연결 방법 고르기

### 방법 A. claude.ai 커스텀 커넥터 (가장 간단 · 클라우드 세션에서도 사용)
1. claude.ai → **설정 → 커넥터 → 커스텀 커넥터 추가**
2. 이름: `korean-law` · URL: `https://mcp.gomdori.app/law?oc=여기에_OC`
3. 저장 후 새 대화(또는 이 Cowork 세션)에서 커넥터를 켭니다.

주의: 이 URL은 저장소 작성자가 운영하는 **외부 호스팅 서버**입니다. 조회 내용과 OC가 그 서버를 거칩니다. 회사 정책상 문제가 되면 방법 B(로컬)를 쓰세요. 조직 계정은 관리자가 커스텀 커넥터를 막아 두었을 수 있습니다.

### 방법 B. Claude 데스크톱 앱 로컬 설정 (Node.js 18 이상 필요)
1. Node.js LTS 설치 (명령 프롬프트에서 `node -v`로 확인)
2. 파일 열기: `%APPDATA%\Claude\claude_desktop_config.json` (탐색기 주소창에 붙여 넣기)
3. 아래 내용을 넣고 저장 (이미 `mcpServers`가 있으면 그 안에 `korean-law` 항목만 추가)

```json
{
  "mcpServers": {
    "korean-law": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.gomdori.app/law?oc=여기에_OC"]
    }
  }
}
```

4. Claude 데스크톱을 완전히 종료(트레이 아이콘까지) 후 다시 실행
5. 이 폴더(`docs/claude_desktop_config.example.json`)에 같은 예시를 넣어 두었습니다.

서버까지 완전히 로컬로 돌리려면 저장소 README의 로컬 설치(명령 `korean-law-mcp`, 환경변수 `LAW_OC`)를 따르세요.

## 3단계 — 연결 확인

Claude에게 이렇게 요청해 보세요.

```text
korean-law 도구로 「건축법 시행령」 제86조 제1항 현행 조문을 가져와서
정북방향 일조 이격 기준(높이 10m 이하 / 초과)을 원문 그대로 보여줘.
```

## 4단계 — 이 앱의 법규 표 검증 체크리스트

| law.js 항목 | 확인할 원문 | MCP 요청 예시 |
|---|---|---|
| `ZONES` 법정 상한 | 국토계획법 시행령 제84조·제85조 | "국토계획법 시행령 제84조, 제85조 현행 조문" |
| `ZONES` 서울 값 | 서울특별시 도시계획 조례 제54조·제55조 (+부칙의 경과규정) | "서울특별시 도시계획 조례 제54조 제55조, 최근 개정 연혁" |
| `SOURCES.sun` | 건축법 시행령 제86조 | 위 3단계 |
| `SOURCES.area` | 건축법 시행령 제119조 (바닥면적·연면적·용적률 산정 제외) | "건축법 시행령 제119조 제1항 제3호·제4호" |
| `SOURCES.dasedae/dagagu/dormitory` | 건축법 시행령 별표1 제1호·제2호 | "건축법 시행령 별표1 (get_annexes)" |
| `SOURCES.park` | 주차장법 시행령 별표1, 주택건설기준 등에 관한 규정 제27조, 서울시 주차장 조례 별표 | "주차장법 시행령 별표1", "서울특별시 주차장 설치 및 관리 조례 별표2" |
| `SOURCES.open` | 건축법 제58조, 서울시 건축 조례 (대지 안의 공지 별표) | "서울특별시 건축 조례 대지 안의 공지 별표" |

검증하면 `law.js`의 해당 항목 `status`를 `'확인(조회일)'`로 바꾸고, 값이 다르면 표를 고칩니다. 자치법규 API는 별표를 다 돌려주지 않는 경우가 있어서, 별표가 안 오면 "없음"이 아니라 "원문 확인 필요"로 남겨 두세요.
