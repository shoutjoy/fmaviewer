# AuthData 개발자 인증 모드

`AuthData`는 FMA Viewer를 단독 앱 또는 다른 앱의 애드온으로 사용할 때 사용자 인증 로딩 여부를 결정합니다. 실제 로그인·GAS·관리자 인증 코드는 기존 `Auth` 폴더에서 계속 관리합니다.

- `deployment-mode.js`: 배포할 버전의 기본 모드입니다. 기본값은 `on`입니다.
- `auth-mode.js`: 배포 기본값과 로컬 개발자 선택을 안전하게 해석합니다.
- `auth-bootstrap.js`: `on`일 때만 기존 `Auth` 스크립트를 순서대로 로드합니다.
- `AuthSwitch.html`: localhost 또는 `file://`에서 로컬 테스트 모드를 선택하는 개발 전용 화면입니다.

## 사용법

1. 로컬 서버에서 `AuthData/AuthSwitch.html`을 엽니다.
2. `ON` 또는 `OFF`를 선택하고 **선택 적용**을 누릅니다.
3. `앱 열기`를 누르거나 이미 열린 `index.html`을 새로고침합니다.

로컬 스위치 값은 브라우저 `localStorage`에만 저장되고 공개 호스트에서는 무시됩니다.

인증 없는 별도 배포본을 만들 때는 원하는 모드를 선택하고 **배포 설정 파일 저장**을 누른 뒤, 저장 대화상자에서 현재 프로젝트의 `AuthData/deployment-mode.js`를 선택해 덮어씁니다. 파일 직접 저장을 지원하지 않는 브라우저에서는 파일이 다운로드되므로 기존 파일을 교체하면 됩니다.

`AuthSwitch.html`은 `.vercelignore`에 등록되어 Vercel 배포 결과에 포함되지 않습니다.
