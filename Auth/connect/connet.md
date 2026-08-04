# Auth 이메일 인증 모듈 연결 가이드

이 문서는 `Auth` 폴더의 이메일 인증 모듈을 **임의의 다른 웹 앱**에 연결하는 절차를 설명합니다. 사람뿐 아니라 코드를 수정하는 AI도 같은 규칙으로 작업할 수 있도록 앱별 변수, 수정 파일, Google Sheet 생성, Google Apps Script(GAS) 배포, 연결 확인 순서까지 명시합니다.

> 빠른 연결 순서는 [`README.md`](README.md), 현재 프로젝트의 코드 교체·재배포 절차는 [`../UPDATE_GUIDE.md`](../UPDATE_GUIDE.md)에서 확인할 수 있습니다. 이 문서는 앱별 복제와 운영 검증을 위한 상세 참고 문서입니다.

> 현재 구현은 `@gmail.com` 주소만 허용합니다. 회사·학교 Google Workspace 주소까지 받으려면 클라이언트의 `isValidGmailAddress()`와 GAS의 `isValidGmail_()`를 함께 변경하고 개인정보 처리방침 및 테스트도 갱신해야 합니다.

## 1. 가장 중요한 원칙

앱마다 다음 항목을 서로 다르게 사용합니다.

- 고유한 `storagePrefix`
- 별도의 Google Sheet
- 별도로 배포한 GAS 웹 앱
- 앱에 맞는 개인정보 처리방침
- 앱을 식별할 수 있는 서버 서비스 이름과 서버 버전

같은 브라우저·같은 도메인에서 여러 앱이 같은 `storagePrefix`를 사용하면 등록 정보와 관리자 설정이 섞일 수 있습니다. 또한 여러 앱이 같은 GAS와 Sheet를 사용하면 현재 서버 구조상 이메일만으로 사용자를 찾기 때문에 어느 앱에서 승인한 사용자인지 구분되지 않습니다. **앱별 Sheet와 GAS 배포를 분리하는 구성을 기본값으로 사용합니다.**

GAS `/exec` 주소는 비밀번호가 아닙니다. 반면 Google Sheet는 공개하지 말고 운영자에게만 편집 권한을 부여합니다. Google 비밀번호, OAuth 토큰, 서비스 계정 키 같은 비밀값은 HTML이나 JavaScript에 넣지 않습니다.

이 모듈은 이메일 소유 확인과 브라우저 측 사용 제한을 위한 장치입니다. 브라우저 `localStorage`를 사용하는 구조이므로 결제, 중요 개인정보, 서버 비밀과 같은 고가치 자원을 보호하는 강력한 서버 인증 수단으로 간주하면 안 됩니다.

## 2. 먼저 정할 앱별 값

작업 전에 아래 값을 한 번에 정합니다. 문서의 자리표시자는 실제 값으로 바꿉니다.

| 자리표시자 | 의미 | 예시 형식 |
| --- | --- | --- |
| `APP_NAME` | 화면과 이메일에 표시할 앱 이름 | `Sample Studio` |
| `APP_MARK` | 인증 팝업에 표시할 짧은 표식 | `SS` |
| `APP_SLUG` | 코드·서버 속성에 사용할 영문 식별자 | `sample_studio` |
| `STORAGE_PREFIX` | 브라우저 저장소 키 접두사 | `sample_studio` |
| `SPREADSHEET_ID` | 앱 전용 Google Sheet ID | URL의 `/d/`와 `/edit` 사이 값 |
| `GAS_WEB_APP_URL` | 앱 전용 GAS 배포 주소 | `https://script.google.com/macros/s/.../exec` |
| `NOTIFICATION_EMAIL` | 인증 완료 알림을 받을 운영자 이메일 | `operator@example.com` |
| `SENDER_GMAIL` | 인증 메일을 실제 발송할 배포 계정 | `sender@gmail.com` |
| `SERVER_SERVICE_NAME` | GAS 상태 확인용 고유 서비스 이름 | `Sample Studio verified email registration` |
| `SERVER_VERSION` | 배포 코드 버전 | `2026-08-02-email-verify-1` |
| `PRIVACY_POLICY_VERSION` | 동의한 처리방침 버전 | `2026-08-02` |

식별자 규칙은 다음과 같습니다.

- `STORAGE_PREFIX`는 영문 소문자, 숫자, 밑줄만 사용하는 것을 권장합니다.
- `STORAGE_PREFIX`는 배포 후 함부로 변경하지 않습니다. 변경하면 기존 브라우저가 새 앱으로 인식하여 다시 인증을 요구합니다.
- `SERVER_SERVICE_NAME`은 앱마다 고유해야 하며 클라이언트와 GAS의 문자열이 완전히 같아야 합니다.
- `SERVER_VERSION`은 `Auth/gas/Code.gs`에서만 증가시킵니다. `settings.js`가 이 값을 자동으로 읽으므로 클라이언트에 중복 입력하지 않습니다.
- `GAS_WEB_APP_URL`은 테스트용 `/dev` 주소가 아니라 `/exec`로 끝나는 배포 주소를 사용합니다.

## 3. 전체 연결 순서

권장 순서는 아래와 같습니다.

1. 대상 앱에 `Auth` 폴더를 복사합니다.
2. 앱 전용 Google Sheet를 만듭니다.
3. 복사한 `Auth/gas/Code.gs`를 앱별 값으로 수정합니다.
4. Sheet에 연결된 Apps Script 프로젝트에 `Code.gs`를 적용하고 권한을 승인합니다.
5. GAS를 웹 앱으로 배포하고 `/exec` 주소를 받습니다.
6. 대상 앱 HTML에서 `window.FMA_AUTH_SETTINGS`를 선언하고 인증 파일을 순서대로 연결합니다.
7. 관리자 페이지와 개인정보 처리방침의 앱별 문구를 수정합니다.
8. 서버 상태 확인, 신규 인증, 차단 반영까지 실제 브라우저에서 검사합니다.

## 4. `Auth` 폴더 복사

대상 앱의 진입 HTML을 기준으로 아래와 같은 구조를 권장합니다.

```text
target-app/
├─ index.html
└─ Auth/
   ├─ README.md
   ├─ UPDATE_GUIDE.md
   ├─ settings.js
   ├─ config.js
   ├─ modal.js
   ├─ client.js
   ├─ auth.css
   ├─ admin.html
   ├─ admin-auth.js
   ├─ admin.js
   ├─ admin.css
   ├─ privacy_policy.html
   ├─ PRIVACY_POLICY.md
   ├─ privacyPolicy.js
   ├─ connect/
   │  ├─ README.md
   │  └─ connet.md
   └─ gas/
      └─ Code.gs
```

`Auth/gas/Code.gs`는 Apps Script에 붙여넣는 배포용 원본입니다. `admin.html`에서 최신 코드를 자동으로 불러와 복사하게 하려면 `Code.gs`만 정적 배포에 포함하고 나머지 배포 메모는 제외합니다.

```gitignore
/Auth/gas/*
!/Auth/gas/Code.gs
```

서버 원문을 공개 저장소에 올리지 않으려면 `/Auth/gas/` 전체를 제외할 수 있습니다. 이 경우 관리자 화면의 자동 불러오기는 사용할 수 없고, `로컬 Code.gs 선택`으로 파일을 직접 불러와야 합니다. `Code.gs`에는 비밀번호나 인증 토큰을 넣지 마십시오.

이미 다른 위치에 인증 폴더를 둘 경우 이후 HTML의 CSS·스크립트·개인정보 처리방침 경로를 실제 위치에 맞게 바꿉니다.

## 5. 앱 전용 Google Sheet 만들기

1. `SENDER_GMAIL` 또는 운영용 Google 계정으로 Google Drive에 로그인합니다.
2. 새 Google 스프레드시트를 만들고 `APP_NAME 사용자 인증 관리`처럼 알아보기 쉬운 이름을 지정합니다.
3. 주소창에서 Sheet ID를 복사합니다.

```text
https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit
                                        ^^^^^^^^^^^^^^
```

4. Sheet는 공개 공유하지 않습니다. GAS를 관리할 계정에 편집 권한이 있어야 합니다.
5. `Users` 탭이나 헤더는 직접 만들지 않아도 됩니다. 뒤에서 `authorizeServices`를 실행하면 코드가 생성·정리합니다.

서버가 사용하는 `Users` 탭의 열은 다음과 같습니다.

```text
RequestedAt | Email | Status | LastVerifiedAt | VerifiedAt | NotifiedAt | NotificationError | Name | Organization | Purpose
```

`Status`는 다음 두 값만 사용합니다.

- `Active`: 인증 완료, 앱 사용 가능
- `Blocked`: 사용 중지, 같은 Gmail의 재신청도 거절

행을 삭제하면 사용자는 다음 전체 동기화 때 미등록 상태가 되어 다시 신청할 수 있습니다. 계속 차단하려면 행 삭제 대신 `Blocked`로 변경합니다.

## 6. 앱별 `Auth/gas/Code.gs` 수정

복사한 `Auth/gas/Code.gs` 상단의 값을 먼저 바꿉니다.

```javascript
const SHEET_NAME = 'Users';
const NOTIFICATION_EMAIL = 'NOTIFICATION_EMAIL';
const EXPECTED_SENDER_EMAIL = 'SENDER_GMAIL';
const SERVER_VERSION = 'SERVER_VERSION';
const SPREADSHEET_ID = 'SPREADSHEET_ID';
const VERIFICATION_TTL_MS = 30 * 60 * 1000;
const VERIFICATION_GRANT_TTL_MS = 24 * 60 * 60 * 1000;
const PENDING_TOKEN_PREFIX = 'APP_SLUG_pending_token_';
const PENDING_EMAIL_PREFIX = 'APP_SLUG_pending_email_';
```

그다음 `Code.gs` 전체에서 원본 앱 이름과 서비스 이름을 찾아 모두 대상 앱 값으로 바꿉니다. 변경 대상에는 다음 위치가 포함됩니다.

- 파일 첫 줄 설명
- `doGet()`의 `service` 응답 두 곳
- 인증 성공·실패 페이지의 앱 이름
- 사용자에게 보내는 인증 이메일의 제목, 본문, HTML, 발신자 표시 이름
- 운영자에게 보내는 완료 알림의 제목, 본문, HTML, 발신자 표시 이름
- `testVerificationEmail()`의 테스트 문구

특히 `doGet()`의 `action=health` 응답은 아래 값과 정확히 일치해야 합니다.

```javascript
return json_({
  success: true,
  service: 'SERVER_SERVICE_NAME',
  version: SERVER_VERSION,
  status: 'OK'
  // 나머지 기존 속성 유지
});
```

기본 액션 응답에 있는 `service`도 같은 `SERVER_SERVICE_NAME`으로 바꿉니다. 원본 앱 이름이나 이전 앱의 이메일, Sheet ID, 속성 접두사가 남지 않았는지 전체 검색합니다.

```powershell
rg -n "FMA Viewer|fma_|shoutjoy1|SPREADSHEET_ID|SERVER_VERSION|service:" Auth/gas/Code.gs
```

위 검색어 중 원본 전용 값은 결과가 없어야 하고, 공용 상수 이름과 새 값만 남아야 합니다. 다른 원본에서 복사했다면 검색어를 그 원본의 앱 이름·접두사·이메일로 바꿉니다.

`EXPECTED_SENDER_EMAIL`은 안내 및 상태 확인에 표시되는 기대값입니다. 실제 메일 발신자는 GAS 웹 앱을 배포할 때 선택한 **실행 사용자**이므로 배포 계정과 이 값을 동일하게 맞춥니다.

## 7. Apps Script 프로젝트 설정과 권한 승인

1. 방금 만든 Google Sheet를 엽니다.
2. 메뉴에서 `확장 프로그램 → Apps Script`를 선택합니다.
3. 기본 `Code.gs` 내용을 모두 지우고 수정해 둔 `Auth/gas/Code.gs` 전체를 붙여 넣습니다.
4. Apps Script 프로젝트 이름을 `APP_NAME Auth Server`처럼 변경하고 저장합니다.
5. 필요하면 `프로젝트 설정 → 시간대`를 실제 운영 시간대로 맞춥니다. 이메일과 Sheet에 표시되는 시각에 사용됩니다.
6. 상단 함수 목록에서 `authorizeServices`를 선택하고 `실행`합니다.
7. Google의 권한 승인 화면에서 해당 프로젝트의 Sheet 및 메일 발송 권한을 승인합니다.
8. 실행 로그에서 발신 계정, 등록 사용자 수, 남은 메일 발송 한도를 확인합니다.
9. Sheet로 돌아가 `Users` 탭, 헤더, `Status` 드롭다운이 생성되었는지 확인합니다.

선택적으로 `testVerificationEmail`을 한 번 실행하여 `NOTIFICATION_EMAIL`에 테스트 메일이 도착하는지 확인합니다. `testNotificationEmail`은 운영자용 인증 완료 알림 형식을 검사할 때 사용합니다. 테스트도 일일 메일 발송 한도를 사용합니다.

권한 승인 단계에서 발신 계정이 아닌 다른 계정으로 실행하지 않도록 주의합니다. Sheet와 스크립트에 대한 편집 권한, MailApp 발송 권한이 모두 필요합니다.

## 8. GAS 웹 앱 배포

일반 사용자와 관리자 인증은 같은 공개 배포 하나를 사용합니다.

1. Apps Script 오른쪽 위에서 `배포 → 새 배포`를 선택합니다.
2. 배포 유형에서 `웹 앱`을 선택합니다.
3. 설명에 `SERVER_VERSION`이나 변경 내용을 기록합니다.
4. `다음 사용자로 실행`은 `나`로 설정합니다.
5. 액세스 권한은 로그인하지 않은 앱 사용자도 호출할 수 있도록 `모든 사용자`로 설정합니다.
6. 배포를 누르고 추가 권한 요청이 나오면 승인합니다.
7. 표시된 웹 앱 URL 중 `/exec`로 끝나는 주소를 `GAS_WEB_APP_URL`로 기록합니다.

코드를 수정한 뒤에는 기존 배포를 그냥 저장하는 것으로 끝내지 않습니다.

1. `배포 → 배포 관리`를 엽니다.
2. 대상 배포의 수정 아이콘을 선택합니다.
3. 버전을 `새 버전`으로 선택합니다.
4. 배포한 뒤 `/exec` URL과 응답 버전을 다시 확인합니다.

새 배포를 별도로 만들면 URL이 바뀔 수 있습니다. 기존 배포의 새 버전으로 갱신하면 일반적으로 기존 `/exec` URL을 유지할 수 있습니다.

관리자 페이지의 최초 아이디는 `admin`, 최초 비밀번호는 `Code.gs`의 `ADMIN_INITIAL_PASSWORD`입니다. `authorizeServices`가 `Admin` 탭에 이 임시 계정을 만들며, 최초 로그인 직후 새 비밀번호 변경이 강제됩니다. 변경 시 임시 비밀번호 셀은 비워지고 보호된 인증값만 같은 행에 저장됩니다.

## 9. GAS 단독 상태 확인

브라우저에서 아래 주소를 엽니다.

```text
GAS_WEB_APP_URL?action=health
```

정상 응답 예시는 다음과 같습니다.

```json
{
  "success": true,
  "service": "SERVER_SERVICE_NAME",
  "version": "SERVER_VERSION",
  "status": "OK",
  "expectedMailSender": "SENDER_GMAIL"
}
```

확인할 항목은 다음과 같습니다.

- Google 로그인 화면이나 권한 요청 HTML이 아니라 JSON이 표시되는가
- `success`가 `true`인가
- `service`가 대상 앱의 `SERVER_SERVICE_NAME`과 같은가
- `version`이 배포하려는 `SERVER_VERSION`과 같은가
- `/exec` 주소를 사용하고 있는가

이 단계가 통과하기 전에 클라이언트 연결을 진행하면 문제 원인을 구분하기 어렵습니다.

## 10. 대상 앱 HTML에 인증 모듈 연결

앱의 `<head>` 안에 인증 CSS를 추가합니다.

```html
<link rel="stylesheet" href="Auth/auth.css">
```

앱의 `</body>` 바로 앞에서 아래 순서를 지킵니다. 설정 선언은 반드시 `Auth/settings.js`보다 먼저 와야 합니다.

```html
<script>
window.FMA_AUTH_SETTINGS = {
  appName: "APP_NAME",
  appMark: "APP_MARK",
  storagePrefix: "STORAGE_PREFIX",
  privacyPolicyUrl: "Auth/privacy_policy.html",
  privacyPolicyVersion: "PRIVACY_POLICY_VERSION",
  notificationRecipient: "NOTIFICATION_EMAIL",
  serverServiceName: "SERVER_SERVICE_NAME"
};
</script>

<script src="Auth/settings.js"></script>
<script src="Auth/config.js"></script>
<script src="Auth/modal.js"></script>
<script src="Auth/client.js"></script>
```

스크립트 순서의 역할은 다음과 같습니다.

1. 앱별 `window.FMA_AUTH_SETTINGS` 선언
2. `settings.js`: 기본값과 앱별 값을 합쳐 `window.FMAAuthSettings` 생성
3. `config.js`: GAS URL 및 동기화 주기의 브라우저 설정 API 생성
4. `modal.js`: 인증 팝업 DOM 생성
5. `client.js`: 인증 신청, 폴링, 등록 동기화, 차단 감시 시작

`modal.js`는 `document.body`에 팝업을 삽입하므로 위 스크립트들은 `</body>` 직전에 두는 것이 안전합니다. 앱이 하위 경로에 있거나 인증 폴더 이름이 다르면 모든 상대 경로를 실제 배치에 맞춰 조정합니다.

배포 캐시 때문에 이전 파일이 남는 환경에서는 파일 버전을 붙일 수 있습니다.

```html
<script src="Auth/client.js?v=SERVER_VERSION"></script>
```

`notificationRecipient`는 팝업 안내에 표시되는 값이고 실제 알림 발송 대상은 GAS의 `NOTIFICATION_EMAIL`입니다. 두 값이 일치해야 사용자 안내와 실제 처리가 다르지 않습니다.

## 11. 설정값 일치 조건

아래 네 조건은 자동 연결 검사에서 핵심입니다.

```text
window.FMA_AUTH_SETTINGS.serverServiceName == GAS health 응답의 service
Auth/gas/Code.gs의 SERVER_VERSION          == GAS health 응답의 version
window.FMA_AUTH_SETTINGS.notificationRecipient == Code.gs의 NOTIFICATION_EMAIL
```

하나라도 다르면 관리자 페이지의 서버 연결 테스트가 다른 앱의 GAS 연결 또는 구버전 배포로 판정할 수 있습니다.

## 12. 관리자 페이지 수정

`Auth/admin.html`에는 원본 앱의 표시 문자열과 Sheet 바로가기 주소가 들어 있으므로 다음 항목을 대상 앱에 맞게 수정합니다.

- `<title>`과 설명 `<meta>`
- 상단 앱 이름과 표식
- `관리 스프레드시트 열기` 링크를 새 Sheet URL로 교체
- `APP_NAME 열기` 링크가 대상 앱의 진입 HTML을 가리키는지 확인
- 본문에 남은 원본 앱 이름

`admin.html`도 자체적으로 `settings.js`를 불러옵니다. 아래처럼 `settings.js` 앞에 앱별 설정을 선언합니다. 최소한 연결 검사에 필요한 값은 앱 화면과 동일해야 합니다.

```html
<script>
window.FMA_AUTH_SETTINGS = {
  appName: "APP_NAME",
  appMark: "APP_MARK",
  storagePrefix: "STORAGE_PREFIX",
  notificationRecipient: "NOTIFICATION_EMAIL",
  serverServiceName: "SERVER_SERVICE_NAME"
};
</script>
<script src="settings.js"></script>
<script src="config.js"></script>
<script src="admin-auth.js"></script>
```

관리자 페이지의 설정은 `localStorage`에 저장됩니다. 같은 프로토콜·호스트·포트에서 열면 관리자와 앱이 같은 설정을 바로 사용합니다. 저장 환경이 다르거나 `file://`로 실행하는 경우에는 관리자 화면의 **배포 URL로 앱 최신화**를 사용합니다. 이 버튼은 `fmaGasUrl`, `fmaChecks`, `fmaBlockMinutes`를 `index.html`로 전달하고, `config.js`가 앱 환경의 저장소에 가져온 뒤 주소창에서 해당 매개변수를 제거합니다.

관리자 페이지에서 다음 순서로 확인합니다.

1. 최초 관리자 아이디·비밀번호로 로그인하고 새 비밀번호를 설정합니다.
2. GAS `/exec` URL이 맞는지 입력합니다.
3. `서버 연결 테스트`를 실행합니다.
4. 서비스 이름, 버전, 발신 기대 계정이 대상 앱 값인지 확인합니다.
5. 하루 전체 점검 횟수와 `Blocked` 확인 간격을 운영 정책에 맞게 설정합니다.
6. GAS URL이 변경되었으면 **설정만 저장**이 아니라 **배포 URL로 앱 최신화**를 눌러 `index.html`에 전달합니다.

관리자 설정을 사용하지 않을 경우에도 `settings.js`의 `gasWebAppUrl` 기본값 또는 HTML의 앱별 설정에는 올바른 URL이 있어야 합니다.

## 13. 개인정보 처리방침과 팝업 문구 수정

다른 앱에 복사한 뒤 최소한 아래 파일을 검토합니다.

- `Auth/PRIVACY_POLICY.md`
- `Auth/privacy_policy.html`
- `Auth/privacyPolicy.js`
- `Auth/modal.js`

반드시 실제 처리 내용에 맞춰 바꿀 항목은 다음과 같습니다.

- 앱 이름, 앱의 목적, 운영자 또는 개발자 정보
- 문의 및 삭제 요청 이메일
- 수집·처리하는 정보
- 처리 목적과 보유·삭제 방식
- Google Sheet와 Apps Script의 역할
- 인증 완료 알림 수신자
- 외부 API, AI, 분석, 저장 기능의 실제 데이터 전송 내용
- 시행일과 `PRIVACY_POLICY_VERSION`

`privacy_policy.html`은 HTTP 환경에서 `PRIVACY_POLICY.md`를 불러오지만, 로컬 파일 등에서 불러오지 못할 때 사용할 Markdown 원문도 HTML 안에 포함하고 있습니다. 따라서 **Markdown 파일만 수정하지 말고 HTML의 제목, 표식, 내장 대체 원문도 함께 수정**합니다.

`modal.js`의 AI 안내는 모든 앱에 공통인 문구가 아닙니다. 대상 앱에 AI 기능이 없으면 제거하고, 다른 AI 제공자나 다른 종류의 데이터가 전송되면 실제 제공자·전송 항목·처리 방식을 반영합니다. 팝업의 수집 항목과 개인정보 처리방침의 내용이 서로 모순되지 않아야 합니다.

처리 내용이 달라졌다면 `PRIVACY_POLICY_VERSION`을 갱신합니다. 버전은 사용자가 동의한 로컬 등록 레코드에 기록됩니다.

## 14. 최초 연결 전체 테스트

기존 등록정보의 영향을 피하려면 시크릿 창이나 새 브라우저 프로필에서 테스트합니다. 운영 사용자의 실제 저장소를 지우지 않습니다.

### 14.1 신규 사용자 인증

1. 앱을 열었을 때 인증 팝업이 표시되고 본문이 잠기는지 확인합니다.
2. Gmail이 아닌 주소를 입력했을 때 거절되는지 확인합니다.
3. 테스트 이름, 소속, Gmail, 사용목적과 개인정보 동의를 입력하고 신청합니다.
4. 인증 메일의 앱 이름, 발신 표시, 만료 안내가 올바른지 확인합니다.
5. 인증 링크를 열고 성공 페이지의 앱 이름을 확인합니다.
6. 원래 앱 창이 자동 폴링 후 열리는지 확인합니다.
7. Sheet `Users` 탭에 해당 이메일이 `Active`로 한 행만 생성되고 이름, 소속, 사용목적이 함께 기록되는지 확인합니다.
8. 운영자 알림 메일이 `NOTIFICATION_EMAIL`에 도착하고 신청 정보가 포함되는지 확인합니다.

인증 링크를 열기 전에는 신규 이메일이 `Users` 탭에 기록되지 않는 것이 정상입니다. 미인증 요청의 토큰 해시와 요청 정보는 GAS Script Properties에 제한 시간 동안 임시 저장됩니다.

### 14.2 재실행과 앱 간 분리

1. 앱을 닫았다 다시 열어 재인증 없이 시작되는지 확인합니다.
2. 같은 사이트의 다른 앱을 열어 등록 상태가 공유되지 않는지 확인합니다.
3. 개발자 도구에서 아이디 저장용 `STORAGE_PREFIX_remembered_email_v1`, 인증 대기용 `STORAGE_PREFIX_registration_pending_v5`, 관리자용 `STORAGE_PREFIX_admin_config_v2` 키가 앱별로 분리되는지 확인합니다. 로그인 세션은 `sessionStorage`의 `STORAGE_PREFIX_session_v1`에만 저장됩니다.

### 14.3 차단 반영

1. Sheet의 테스트 사용자 `Status`를 `Blocked`로 변경합니다.
2. 앱으로 돌아와 설정된 차단 확인 간격 안에 앱이 잠기는지 확인합니다.
3. 같은 Gmail로 다시 신청했을 때 거절되는지 확인합니다.
4. 테스트가 끝난 뒤 운영 정책에 따라 `Active`로 되돌리거나 테스트 행을 정리합니다.

### 14.4 서버 장애 동작

기존 등록 사용자는 일시적인 GAS 연결 실패만으로 즉시 잠기지 않고 다음 주기에 다시 시도하도록 구현되어 있습니다. 반면 서버가 명시적으로 `Blocked` 또는 잘못된 상태를 반환하면 앱을 잠급니다. 이 정책이 대상 앱의 보안 요구와 맞는지 배포 전에 확인합니다.

## 15. 운영 중 변경 및 재배포

GAS 코드를 변경할 때마다 다음 절차를 반복합니다.

1. 프로젝트의 `Auth/gas/Code.gs`에서 `SERVER_VERSION`을 갱신합니다. 클라이언트 버전은 이 파일에서 자동으로 읽습니다.
2. 최신 웹 파일을 배포해 관리자 화면이 새 `Code.gs`를 읽을 수 있게 합니다.
3. `Auth/admin.html` 하단에서 코드 버전을 확인하고 **Code.gs 전체 복사**를 누릅니다.
4. Apps Script의 `Code.gs` 전체를 복사한 코드로 교체하고 저장합니다.
5. 필요하면 `authorizeServices`를 다시 실행하여 스키마와 권한을 확인합니다.
6. 웹 앱 배포를 반드시 **새 버전**으로 갱신합니다.
7. `/exec?action=health`에서 새 서버 버전을 확인합니다.
8. `/exec` URL이 바뀌었거나 앱에 이전 설정이 남아 있으면 관리자에서 새 URL을 입력하고 **배포 URL로 앱 최신화**를 누릅니다.
9. 관리자 연결 테스트와 신규 인증 테스트를 다시 수행합니다.

현재 프로젝트의 화면별 업데이트 절차는 [`../UPDATE_GUIDE.md`](../UPDATE_GUIDE.md)를 기준으로 합니다.

정기적으로 Sheet의 `NotificationError`, Apps Script 실행 기록, `MailApp` 일일 발송 한도를 확인합니다. 실패한 완료 알림은 `retryFailedNotifications`로 재시도할 수 있습니다.

## 16. 자주 발생하는 문제

| 증상 | 원인 | 확인 및 해결 |
| --- | --- | --- |
| 로그인 페이지나 HTML이 응답함 | 웹 앱 접근 권한이 제한됨 | 실행 사용자 `나`, 액세스 `모든 사용자`로 새 버전 배포 |
| `GAS_AUTH_REQUIRED` | GAS가 로그인을 요구함 | 공개 웹 앱 설정과 `/exec` URL 확인 |
| 서버 서비스 이름 불일치 | 다른 앱의 GAS URL이거나 `service` 문자열이 다름 | 클라이언트 `serverServiceName`과 GAS health `service`를 동일하게 수정 |
| 서버 버전 불일치 | 이전 코드가 배포됨 | `새 버전`으로 재배포하고 양쪽 `SERVER_VERSION` 일치 |
| `Failed to fetch` | 잘못된 URL, 비공개 배포, 네트워크 문제 | health URL을 브라우저에서 먼저 직접 검사 |
| 인증 메일이 오지 않음 | MailApp 권한, 발송 한도, 스팸, 잘못된 실행 계정 | `testVerificationEmail`, 실행 기록, 남은 한도, 스팸함 확인 |
| 인증 전 Sheet에 사용자가 없음 | 정상 동작일 수 있음 | 인증 링크를 연 뒤 `Active` 행이 생성되는지 확인 |
| 여러 앱의 인증이 공유됨 | 같은 origin에서 같은 `storagePrefix` 사용 | 앱별 고유 접두사 사용; 테스트는 새 브라우저 상태에서 다시 수행 |
| 한 앱의 승인이 다른 앱에도 적용됨 | 같은 GAS·Sheet를 공유함 | 앱별 Sheet와 GAS 배포로 분리 |
| `Blocked`가 반영되지 않음 | 잘못된 Sheet/GAS, 상태 오타, 확인 간격 미경과 | 연결 대상, 정확한 `Blocked` 값, 관리자 설정 간격 확인 |
| 개인정보 처리방침이 로컬에서 예전 내용임 | Markdown `fetch` 실패 후 HTML 내장 원문 사용 | `privacy_policy.html`의 내장 대체 원문도 함께 수정하거나 HTTP 서버 사용 |
| 관리자 설정이 앱에 적용되지 않음 | 서로 다른 origin, `file://` 저장소 분리 또는 접두사 불일치 | `storagePrefix`를 확인하고 새 URL 입력 후 **배포 URL로 앱 최신화** 클릭 |
| 관리자에는 새 URL인데 앱은 이전 URL 사용 | **설정만 저장**으로 관리자 저장소만 변경 | **배포 URL로 앱 최신화**를 눌러 `index.html`에 전달 |

## 17. AI 작업용 필수 검사 목록

AI가 이 모듈을 새 앱에 연결할 때는 다음 규칙을 지킵니다.

1. 사용자가 제공하지 않은 Sheet ID, GAS URL, 이메일을 임의로 추측하지 않습니다. 미정 값은 명확한 `TODO`로 남깁니다.
2. `Auth` 파일을 복사하기 전에 대상 앱의 기존 인증 코드와 충돌 여부를 확인합니다.
3. 앱별 값은 한 번 정의하고 HTML, GAS, 관리자 페이지, 개인정보 처리방침에 일관되게 반영합니다.
4. `storagePrefix`가 같은 origin의 다른 앱과 중복되지 않는지 검색합니다.
5. GAS의 이전 앱 이름, 이전 Sheet ID, 이전 이메일, 이전 속성 접두사가 남지 않았는지 검색합니다.
6. 클라이언트의 `serverServiceName`·`serverVersion`과 GAS health 응답이 정확히 일치하는지 확인합니다.
7. `notificationRecipient`와 GAS의 `NOTIFICATION_EMAIL`이 일치하는지 확인합니다.
8. `privacyPolicyUrl`이 앱 진입 HTML 위치를 기준으로 실제 파일을 가리키는지 확인합니다.
9. 개인정보 처리방침과 인증 팝업에 대상 앱이 실제로 처리하지 않는 기능이나 외부 전송 내용을 남기지 않습니다.
10. 사용자의 명시적 승인 없이 실제 Google 계정 권한 승인이나 운영 배포를 완료했다고 주장하지 않습니다.
11. 최종 결과에는 미완료된 외부 작업, 사용자가 직접 해야 하는 Google 권한 승인·배포 단계, 테스트 결과를 구분해 보고합니다.

최종 정적 검색 예시는 다음과 같습니다.

```powershell
rg -n "FMA Viewer|fma_viewer|fma_pending|shoutjoy1|script.google.com/macros/s/|docs.google.com/spreadsheets/d/" Auth index.html
```

검색 결과에서 공용 API 식별자인 `FMA_AUTH_SETTINGS`, `FMAAuthSettings`, `FMAAdminConfig` 등은 현재 모듈의 공개 인터페이스이므로 앱 이름을 바꾼다고 무조건 변경하지 않습니다. 반면 화면 문구, 이메일 문구, Sheet/GAS 주소, 저장소 접두사 같은 앱 전용 값은 대상 앱 값이어야 합니다.

## 18. 완료 판정

다음 조건을 모두 만족하면 연결이 완료된 것으로 봅니다.

- 앱 전용 Sheet와 GAS 배포가 존재한다.
- health 응답의 서비스 이름과 버전이 앱 설정과 일치한다.
- 대상 앱이 고유한 `storagePrefix`를 사용한다.
- 신규 Gmail 인증, 신청 정보와 Sheet `Active` 등록, 앱 잠금 해제가 정상 동작한다.
- 운영자 완료 알림이 올바른 주소로 도착한다.
- `Blocked` 변경이 설정된 시간 안에 앱에 반영된다.
- 관리자 페이지가 올바른 Sheet와 GAS를 가리킨다.
- 앱 이름, 이메일, 외부 API 및 데이터 처리 내용이 개인정보 처리방침과 팝업에 정확히 반영되어 있다.
- 원본 앱의 이름, Sheet ID, GAS URL, 이메일, 저장소 접두사가 대상 앱 파일에 남아 있지 않다.
