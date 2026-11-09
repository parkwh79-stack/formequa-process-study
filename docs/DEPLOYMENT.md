# 독립 저장소와 Firebase Hosting

- GitHub: https://github.com/parkwh79-stack/formequa-process-study
- Firebase 프로젝트 ID: `formequa-process-study`
- Hosting 사이트 ID: `formequa-process-study`
- Hosting 대상: `study`
- 웹 주소: https://formequa-process-study.web.app

기존 `formequa-research` 프로젝트와 별도의 Firebase 프로젝트입니다. 원본 데모와 상위 작업 공간의 백업은 저장소·웹 배포에 포함하지 않습니다. 브라우저 앱은 별도 서버나 데이터베이스 없이 정적 파일로 동작합니다.

## 개발과 검증

```sh
npm install --ignore-scripts
npm test
python -m http.server 8000 --bind 127.0.0.1
```

## 배포

```sh
npm run build
firebase deploy --project formequa-process-study --only hosting:study
```

Windows에서는 `deploy.bat`을 더블클릭해도 됩니다. 테스트 → 빌드 → 배포 순서로 실행하며, 테스트가 실패하면 배포하지 않습니다. 처음 한 번은 `npm install -g firebase-tools`와 `firebase login`이 필요합니다.

`firebase.json`의 배포 폴더는 `dist/`이며, 빌드는 `index.html`, `style.css`, `js/`만 복사합니다. 테스트·문서·개발 설정·로그는 웹 배포 폴더에 들어가지 않습니다. 인증 정보는 Git에 저장하지 않으며, `.firebaserc`에는 공개 프로젝트 ID와 Hosting 대상 매핑만 기록합니다.

앱의 모듈·CSS를 변경하면 `index.html`의 자산 버전도 함께 갱신합니다. HTML은 재검증하도록 Hosting 캐시 헤더를 설정했습니다.

## GitHub 자동 배포 (v3.9.3)

`.github/workflows/firebase-hosting.yml`이 배포를 맡습니다.

| 이벤트 | 동작 |
|---|---|
| `main`에 push | `npm ci` → `npm test` → `npm run build` → live 배포(https://formequa-process-study.web.app) |
| Pull request | 같은 검사 후 7일 미리보기 채널. 주소는 PR 댓글로 남음 |
| Actions 탭의 Run workflow | 수동 live 배포 |

테스트가 실패하면 배포하지 않습니다.

### 처음 한 번 (이 PC에서)

1. `setup-deploy.bat`을 더블클릭합니다.
   - Firebase CLI 설치·로그인을 하고, `firebase init hosting:github`를 실행합니다.
   - 저장소는 `parkwh79-stack/formequa-process-study`를 고릅니다. "build script"와 "deploy on merge"는 No로 답합니다. 우리 워크플로가 둘 다 처리합니다.
   - 이 명령이 서비스 계정을 만들고 GitHub Secret `FIREBASE_SERVICE_ACCOUNT_FORMEQUA_PROCESS_STUDY`를 등록합니다.
   - init이 새로 만든 중복 워크플로 파일 두 개는 스크립트가 지웁니다.
   - 워크플로 원본은 `github-workflow/firebase-hosting.yml`에 있고, 스크립트가 `.github/workflows/`로 복사합니다. 원격 도구로는 `.github` 폴더에 쓸 수 없어서 이렇게 나눴습니다. 워크플로를 고칠 때는 `.github/workflows/` 쪽을 고치면 됩니다.
2. 변경을 커밋하고 push합니다.

```sh
git add -A
git commit -m "v3.9.3 camera motion fixes + GitHub Actions deploy"
git push origin main
```

3. GitHub의 Actions 탭에서 "Deploy to Firebase Hosting"이 초록색이면 배포가 끝난 것입니다.

### 수동으로 Secret을 만들 때

1. Firebase 콘솔 → 프로젝트 설정 → 서비스 계정에서 새 비공개 키(JSON)를 받습니다.
2. GitHub 저장소 → Settings → Secrets and variables → Actions → New repository secret에서 이름을 `FIREBASE_SERVICE_ACCOUNT_FORMEQUA_PROCESS_STUDY`로 하고 JSON 전체를 붙여 넣습니다.
3. 받은 JSON 파일은 저장소 폴더 밖에 두거나 삭제합니다. 키는 저장소에 커밋하지 않습니다.

### PC에서 바로 배포

`deploy.bat`을 실행하면 테스트 → 빌드 → `firebase deploy --project formequa-process-study --only hosting:study` 순서로 실행됩니다.

