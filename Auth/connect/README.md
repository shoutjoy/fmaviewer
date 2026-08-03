# Auth 모듈 연결 빠른 가이드

이 문서는 `Auth` 폴더를 다른 웹 앱에 연결할 때 필요한 최소 절차를 정리합니다. 앱별 분리 원칙, 개인정보 처리방침, 장애 동작까지 포함한 상세 설명은 [`connet.md`](connet.md)를 참고합니다.

## 1. 앱별 값 준비

다음 값은 앱마다 별도로 정합니다.

| 값 | 설명 |
| --- | --- |
| `appName`, `appMark` | 인증 화면에 표시할 이름과 짧은 표식 |
| `storagePrefix` | 브라우저 저장소 접두사. 앱마다 고유해야 함 |
| `SPREADSHEET_ID` | 앱 전용 Google Sheet ID |
| `gasWebAppUrl` | 앱 전용 GAS `/exec` URL |
| `notificationRecipient` | 인증 완료 알림 수신 주소 |
| `serverServiceName` | GAS health 응답과 비교할 서비스 이름 |
| `serverVersion` | 클라이언트와 GAS가 함께 사용할 코드 버전 |
| `privacyPolicyVersion` | 사용자가 동의하는 처리방침 버전 |

여러 앱이 같은 `storagePrefix`, Sheet, GAS 배포를 공유하지 않도록 합니다.

## 2. 파일 배치

대상 앱의 진입 파일과 `Auth` 폴더를 다음처럼 배치합니다.

```text
target-app/
├─ index.html
└─ Auth/
   ├─ settings.js
   ├─ config.js
   ├─ modal.js
   ├─ client.js
   ├─ auth.css
   ├─ admin.html
   ├─ admin.js
   ├─ admin.css
   ├─ privacy_policy.html
   ├─ PRIVACY_POLICY.md
   └─ gas/
      └─ Code.gs
```

## 3. Google Sheet와 GAS 준비

1. 앱 전용 Google Sheet를 만듭니다.
2. `확장 프로그램 → Apps Script`를 엽니다.
3. `Auth/gas/Code.gs`의 Sheet ID, 알림 이메일, 발신 계정, 서비스 이름, 서버 버전, 속성 접두사를 앱에 맞게 수정합니다.
4. Apps Script의 `Code.gs` 전체를 교체합니다.
5. `authorizeServices`를 실행하고 권한을 승인합니다.
6. 웹 앱을 실행 사용자 `나`, 액세스 `모든 사용자`로 새 배포합니다.
7. `/exec` URL과 `?action=health` 응답을 확인합니다.

`Users` 탭은 다음 구조로 관리됩니다.

```text
RequestedAt | Email | Status | LastVerifiedAt | VerifiedAt | NotifiedAt | NotificationError | Name | Organization | Purpose | PasswordSalt | PasswordHash | PasswordIterations | PasswordUpdatedAt
```

신청 정보는 Gmail 인증 완료 후에만 이 탭에 기록됩니다.

## 4. 대상 `index.html` 연결

CSS와 스크립트를 다음 순서로 연결합니다. 앱별 설정 선언은 반드시 `settings.js`보다 먼저 둡니다.

```html
<link rel="stylesheet" href="Auth/auth.css">

<script>
window.FMA_AUTH_SETTINGS = {
  appName: "APP_NAME",
  appMark: "APP",
  storagePrefix: "app_unique_prefix",
  gasWebAppUrl: "https://script.google.com/macros/s/배포ID/exec",
  privacyPolicyUrl: "Auth/privacy_policy.html",
  privacyPolicyVersion: "2026-08-04-1",
  notificationRecipient: "operator@example.com",
  serverServiceName: "APP_NAME verified email registration",
  serverVersion: "2026-08-04-password-login-1",
  passwordIterations: 600000,
  sessionTtlMs: 8 * 60 * 60 * 1000
};
</script>
<script src="Auth/settings.js"></script>
<script src="Auth/config.js"></script>
<script src="Auth/modal.js"></script>
<script src="Auth/client.js"></script>
```

스크립트는 `</body>` 직전에 두는 것을 권장합니다.

## 5. 관리자 페이지 연결

`Auth/admin.html`에서도 `settings.js`보다 먼저 대상 앱과 같은 `window.FMA_AUTH_SETTINGS`를 선언합니다. 최소한 아래 값은 `index.html`과 같아야 합니다.

```text
appName
appMark
storagePrefix
gasWebAppUrl
notificationRecipient
serverServiceName
serverVersion
```

관리 Sheet 바로가기와 앱 열기 링크도 대상 앱 주소로 바꿉니다.

## 6. 새 GAS URL 적용

1. 관리자 페이지에서 `/exec` URL을 입력합니다.
2. 서버 연결 테스트로 서비스 이름과 버전을 확인합니다.
3. **배포 URL로 앱 최신화**를 누릅니다.
4. 열린 `index.html`에서 이메일 인증 후 Gmail·비밀번호 로그인과 로그아웃을 테스트합니다.

이 버튼은 관리자와 앱의 `localStorage`가 분리된 환경에서도 URL 매개변수를 통해 최신 GAS URL을 앱에 전달합니다. `설정만 저장`은 관리자 저장소만 바꾸므로 GAS URL 변경 시에는 사용하지 않습니다.

GAS 코드 자체를 업데이트하는 절차는 상위 문서 [`../UPDATE_GUIDE.md`](../UPDATE_GUIDE.md)를 따릅니다.

## 7. 개인정보 문서 수정

다음 파일의 앱 이름, 운영자 정보, 수집 항목, 처리 목적, 삭제 요청 주소, 시행일을 실제 앱에 맞게 수정합니다.

```text
Auth/PRIVACY_POLICY.md
Auth/privacy_policy.html
Auth/privacyPolicy.js
Auth/modal.js
```

`privacy_policy.html`에는 Markdown을 불러오지 못할 때 사용하는 내장 대체 원문이 있으므로 Markdown만 수정하면 안 됩니다.

## 8. 연결 확인

- [ ] `GAS_WEB_APP_URL?action=health`가 JSON을 반환한다.
- [ ] health의 `service`와 `version`이 클라이언트 설정과 일치한다.
- [ ] Gmail이 아닌 주소는 거절된다.
- [ ] 신청 정보 입력 후 인증 메일이 도착한다.
- [ ] 인증 전에는 Sheet에 사용자 행이 없다.
- [ ] 인증 후 이름·소속·사용목적과 `Active` 상태가 기록된다.
- [ ] 앱을 다시 열었을 때 등록 상태가 유지된다.
- [ ] Sheet의 `Blocked` 변경이 앱에 반영된다.
- [ ] 다른 앱과 `storagePrefix`, Sheet, GAS가 분리되어 있다.
- [ ] 개인정보 처리방침과 신청 화면의 안내가 실제 처리 내용과 일치한다.
