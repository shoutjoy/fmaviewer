# 재사용 가능한 이메일 인증 모듈

이 폴더에는 신청자의 Gmail·이름·소속·사용목적 입력, Gmail 인증 메일 발송, 인증 완료 후 Google Sheet 등록, 차단 상태 동기화에 필요한 파일이 모여 있습니다.

## 파일 구성

- `settings.js`: 앱 이름, 저장소 접두사, GAS URL, 서버 버전 등의 기본값
- `config.js`: 관리자 설정을 브라우저 `localStorage`에 저장하는 공용 API
- `modal.js`: 최초 사용자 인증 팝업을 페이지에 삽입
- `client.js`: 신청, 인증 폴링, 등록 동기화, 차단 감시
- `auth.css`: 인증 팝업 전용 스타일
- `admin.html`, `admin.js`, `admin.css`: 관리자 설정, 최신 `Code.gs` 미리보기·복사 화면과 코드·스타일
- `privacy_policy.html`, `PRIVACY_POLICY.md`, `privacyPolicy.js`: 개인정보 처리방침 화면과 원문
- `gas/Code.gs`: Google Apps Script 서버
- `gas/README.md`: GAS 설치와 배포 방법

## 다른 앱에서 사용하기

인증을 사용할 HTML의 `</body>` 직전에 다음 순서로 연결합니다. `settings.js`보다 먼저 `window.FMA_AUTH_SETTINGS`를 선언하면 앱별 값을 바꿀 수 있습니다.

```html
<link rel="stylesheet" href="Auth/auth.css">

<script>
window.FMA_AUTH_SETTINGS = {
  appName: "새 앱 이름",
  appMark: "APP",
  storagePrefix: "my_app",
  gasWebAppUrl: "https://script.google.com/macros/s/배포ID/exec",
  privacyPolicyUrl: "Auth/privacy_policy.html"
};
</script>
<script src="Auth/settings.js"></script>
<script src="Auth/config.js"></script>
<script src="Auth/modal.js"></script>
<script src="Auth/client.js"></script>
```

각 앱은 고유한 `storagePrefix`를 사용해야 브라우저의 인증 및 관리자 설정이 서로 섞이지 않습니다. GAS 서버의 앱 이름, Spreadsheet ID, 알림 수신 주소도 `gas/Code.gs`에서 대상 앱에 맞게 바꾼 뒤 새 버전으로 배포하십시오.

`file://`로 실행하는 앱에서도 동작하도록 팝업 HTML은 외부 파일을 `fetch`하지 않고 `modal.js`가 직접 삽입합니다.

관리자 페이지와 앱의 저장 환경이 다를 때는 관리자 화면에서 `배포 URL로 앱 최신화`를 누릅니다. 관리자 설정이 `fmaGasUrl`, `fmaChecks`, `fmaBlockMinutes` URL 매개변수로 `index.html`에 전달되고, `config.js`가 앱 환경의 로컬 저장소에 가져온 뒤 주소창에서 해당 매개변수를 제거합니다.
