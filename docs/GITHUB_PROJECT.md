# 독립 GitHub 프로젝트 구성

저장소: https://github.com/parkwh79-stack/formequa-process-study

이 폴더(`korea-starter`) 자체가 독립 저장소 루트입니다. 상위 작업 공간의 원본 데모·연구용 다운로드·작업 백업은 포함하지 않습니다.

## 포함할 내용

`index.html`, `style.css`, `js/`, `test/`, `docs/`, `homepage/`, `README.md`, `NOTICE.md`, `CHANGELOG.md`, `run.bat`, `package.json`, `.gitignore`를 포함합니다. 프로젝트의 자체 코드에 적용할 배포 라이선스는 소유자가 결정하며, 참고 원본에 관한 `NOTICE.md`는 그대로 유지합니다.

## 실행과 검증

브라우저 앱은 빌드 과정 없이 정적 파일로 실행합니다. Python 서버는 이 폴더에서 `python -m http.server 8000 --bind 127.0.0.1`로 시작하고 `http://127.0.0.1:8000/`에 접속합니다. 브라우저는 Three.js와 폰트를 CDN에서 불러옵니다.

새 체크아웃의 테스트 의존성은 `npm install --ignore-scripts`로 설치하고 `npm test`로 검사합니다. 테스트는 브라우저와 동일한 Three.js 0.169.0을 사용합니다. 앱의 런타임 번들러를 설치하는 작업은 아닙니다.

## Firebase 배포

웹은 별도의 새 Firebase 프로젝트 `formequa-process-study`에 배포합니다. 주소는 https://formequa-process-study.web.app 이며 상세 명령과 배포 구성은 `DEPLOYMENT.md`를 참고합니다. `npm run build`가 실행 파일만 `dist/`로 복사합니다. 소스 저장소와 브라우저 실행 파일의 배포 범위를 구분합니다.
