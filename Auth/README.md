# Auth 이메일 인증 모듈

`Auth` 폴더는 로그인 화면에서 시작하며, 인증된 사용자는 Gmail과 FMA Viewer 전용 비밀번호로 로그인하고 미인증 사용자는 이메일 인증으로 비밀번호를 설정하는 인증 모듈입니다.

## 현재 동작

1. 앱은 Gmail·비밀번호 로그인 화면으로 시작하며, **아이디 저장**을 선택하면 Gmail만 저장합니다.
2. 미인증 사용자 또는 비밀번호가 없는 기존 사용자는 이름, 소속, Gmail, 사용목적과 전용 비밀번호를 입력하고 인증 메일을 요청합니다.
3. 브라우저는 PBKDF2로 파생한 인증값만 서버로 전송하고, GAS는 별도 보안 키로 다시 보호한 해시와 신청 정보를 Script Properties에 임시 보관합니다.
4. 인증 링크가 열리기 전에는 Google Sheet에 사용자를 기록하지 않습니다. 인증 완료 후 `Users` 탭에 신청 정보, `Active` 상태와 비밀번호 인증 정보를 기록합니다.
5. 로그인 성공 시 최대 8시간 세션을 발급하며, 앱은 로그인 세션과 Sheet의 `Active`·`Blocked` 상태를 주기적으로 확인합니다.
6. 인증 대기 중에도 입력 내용을 수정해 새 인증 메일을 요청할 수 있습니다.
7. 클라이언트가 요구하는 서버 버전과 GAS 배포 버전이 다르면 구버전 배포 경고를 표시합니다.
8. 관리자 페이지는 `admin` 아이디와 관리자 비밀번호로 로그인한 뒤에만 열립니다. 최초 비밀번호는 `a1234567890`이며 첫 로그인 직후 새 비밀번호 변경이 강제됩니다.

현재 GAS 서버 버전은 `2026-08-05-admin-recovery-v3`입니다.

## 문서 안내

| 문서 | 용도 |
| --- | --- |
| [`UPDATE_GUIDE.md`](UPDATE_GUIDE.md) | 현재 프로젝트의 `Code.gs` 교체, GAS 재배포, 새 `/exec` URL을 앱에 반영하는 방법 |
| [`connect/README.md`](connect/README.md) | `Auth` 모듈을 다른 웹 앱에 연결하는 빠른 가이드 |
| [`connect/connet.md`](connect/connet.md) | 앱별 분리 원칙, Sheet, GAS, 개인정보 처리방침, 전체 테스트를 포함한 상세 연결 문서 |
| [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md) | 개인정보 처리방침 원문 |
| [`gas/Code.gs`](gas/Code.gs) | Google Apps Script에 붙여 넣을 최신 서버 코드 |

## 파일 구성

- `settings.js`: 앱 이름, 저장소 접두사와 모든 새 브라우저가 함께 사용하는 기본 GAS 배포 URL. 서버 버전은 `gas/Code.gs`에서 자동으로 읽습니다.
- `config.js`: 관리자 설정 저장, 이전 브라우저 설정의 공용 GAS URL 마이그레이션 및 URL 매개변수로 전달된 최신 설정 가져오기
- `modal.js`: 로그인·이메일 인증 팝업과 설정 푸터가 없는 독립 연동용 대체 로그아웃 버튼 생성
- `client.js`: 로그인, 아이디 저장, 인증 신청·확인, 세션·차단 감시, 앱 설정 하단 로그아웃 처리
- `auth.css`: 인증 화면 스타일
- `admin.html`, `admin-auth.js`, `admin.js`, `admin.css`: 관리자 비밀번호 인증·최초 변경, 관리자 설정, 서버 검사, `Code.gs` 미리보기·복사, 앱 최신화
- `privacy_policy.html`, `PRIVACY_POLICY.md`, `privacyPolicy.js`: 개인정보 처리방침
- `gas/Code.gs`: GAS 서버 원본

## 기존 프로젝트를 업데이트할 때

아래 순서만 기억하면 됩니다.

1. 웹 프로젝트의 최신 `Auth` 파일을 먼저 배포합니다.
2. 첫 적용은 `Auth/gas/Code.gs` 원본을 직접 열어 전체 복사합니다.
3. Google Sheet의 `확장 프로그램 → Apps Script`에서 `Code.gs` 전체를 교체합니다.
4. `authorizeServices`를 실행한 뒤 기존 웹 앱을 **새 버전**으로 재배포합니다.
5. 기본 `/exec` URL이 바뀐 경우에만 `Auth/admin.html`에서 새 주소를 입력하고 **인증 서버 연결 및 버전 점검**을 누릅니다.
6. 점검이 통과하면 `admin / a1234567890`으로 최초 로그인합니다.
7. 표시되는 화면에서 새 관리자 비밀번호를 반드시 설정합니다.
8. 관리자 설정에서 **배포 URL로 앱 최신화**를 눌러 일반 앱에도 전달합니다.
9. 로그아웃 후 변경한 비밀번호로 다시 로그인되는지 테스트합니다.

`authorizeServices`를 실행하면 `Admin` 탭의 `Temporary` 행에 최초 계정 `admin / a1234567890`이 만들어집니다. 첫 로그인에서 비밀번호를 변경하면 임시 행의 PW가 지워지고 상태가 `inactive`로 바뀌며, `In fact` 행에 보호된 인증값이 저장되어 이후 로그인에 사용됩니다.

로그인 화면의 **인증 서버 연결 및 버전 점검**은 새 인증 서버의 버전과 `Admin` 시트 준비 상태를 확인합니다. 로그인 후 `Google Apps Script 코드` 영역에서는 Sheet ID가 반영된 최신 `Code.gs` 전체를 복사할 수 있으며, `동기화 설정`의 **연결 및 버전 점검**은 입력한 GAS 배포 URL의 상세 응답과 서버 버전 일치 여부를 함께 확인합니다.

`settings.js`는 같은 웹 배포의 `Auth/gas/Code.gs`를 읽어 버전을 결정합니다. `file://`에서 `.gs` 읽기가 차단되면 `gas/version.generated.js`를 사용하므로 로그인 초기화가 중단되지 않습니다. `Code.gs`의 버전을 바꾼 뒤에는 `node Auth/gas/sync-version.cjs`를 실행하면 로컬 fallback 파일도 같은 값으로 갱신됩니다. 자동 테스트에서도 두 버전의 일치를 검사합니다.

`설정만 저장`은 현재 관리자 화면의 저장소만 갱신합니다. 관리자와 `index.html`의 저장 환경이 다르거나 `file://`로 열었다면 앱에는 이전 URL이 남을 수 있으므로, GAS URL을 바꾼 경우에는 **배포 URL로 앱 최신화**를 사용해야 합니다.

자세한 화면별 절차와 오류 해결은 [`UPDATE_GUIDE.md`](UPDATE_GUIDE.md)를 따릅니다.

## 다른 앱에서 사용할 때

인증 CSS와 스크립트는 대상 HTML의 `</body>` 직전에 다음 순서로 연결합니다. 앱별 설정은 `settings.js`보다 먼저 선언해야 합니다.

```html
<link rel="stylesheet" href="Auth/auth.css">

<script>
window.FMA_AUTH_SETTINGS = {
  appName: "새 앱 이름",
  appMark: "APP",
  storagePrefix: "my_app",
  gasWebAppUrl: "https://script.google.com/macros/s/배포ID/exec",
  privacyPolicyUrl: "Auth/privacy_policy.html",
  privacyPolicyVersion: "2026-08-04-1",
  notificationRecipient: "operator@example.com",
  serverServiceName: "My App verified email registration",
  passwordIterations: 600000,
  sessionTtlMs: 8 * 60 * 60 * 1000
};
</script>
<script src="Auth/settings.js"></script>
<script src="Auth/config.js"></script>
<script src="Auth/modal.js"></script>
<script src="Auth/client.js"></script>
```

각 앱은 고유한 `storagePrefix`, Google Sheet, GAS 웹 앱 배포를 사용해야 합니다. 전체 연결 과정은 [`connect/README.md`](connect/README.md)에서 시작합니다.
