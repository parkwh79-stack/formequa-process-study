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

`firebase.json`의 배포 폴더는 `dist/`이며, 빌드는 `index.html`, `style.css`, `js/`만 복사합니다. 테스트·문서·개발 설정·로그는 웹 배포 폴더에 들어가지 않습니다. 인증 정보는 Git에 저장하지 않으며, `.firebaserc`에는 공개 프로젝트 ID와 Hosting 대상 매핑만 기록합니다.

앱의 모듈·CSS를 변경하면 `index.html`의 자산 버전도 함께 갱신합니다. HTML은 재검증하도록 Hosting 캐시 헤더를 설정했습니다.
