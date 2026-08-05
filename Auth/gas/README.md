# FMA Viewer GAS 이메일 인증·비밀번호 로그인 서버

> 관리자 화면에서 최신 서버 코드를 바로 복사할 수 있도록 `Code.gs`만 정적 배포에 포함합니다. 이 README와 같은 배포 메모 및 다른 파일은 루트 `.gitignore` 규칙으로 계속 제외됩니다.

대상 Google Sheet:

```text
https://docs.google.com/spreadsheets/d/1xNA955JIwe5cHETAMMMaCEfb1QtZnbuc9tKbEDQ573w/edit
```

인증 완료 알림: `shoutjoy1@yonsei.ac.kr`

## 동작 방식

1. 앱은 Gmail·비밀번호 로그인 화면으로 시작합니다.
2. 최초 신청 또는 기존 계정의 비밀번호 설정 시 이름, 소속, Gmail, 사용목적과 브라우저에서 PBKDF2로 파생한 비밀번호 인증값을 받고, Gmail로 30분 동안 유효한 인증 링크를 발송합니다.
3. 인증 전 신청 정보, 토큰 해시와 서버 보안 키로 다시 보호한 비밀번호 인증 해시는 Script Properties에만 임시 보관하며 `Users` 탭에는 기록하지 않습니다.
4. 사용자가 `GET ?action=verify&token=...` 링크를 열면 신청 정보, `Active` 상태와 비밀번호 인증 정보를 `Users` 탭에 기록하거나 기존 행을 갱신합니다.
5. 신청 브라우저는 고유 요청 ID를 포함한 `GET ?action=check&email=...&requestId=...` 요청으로 인증 완료를 확인한 뒤 로그인 화면으로 돌아갑니다.
6. `GET ?action=login-params`로 솔트와 반복 횟수를 받고 `POST action=login`으로 인증하면 최대 8시간 세션이 발급됩니다.
7. 브라우저는 **아이디 저장** 선택 시 Gmail만 로컬 저장소에 보관하고 세션 토큰은 탭의 세션 저장소에 보관합니다. 서버에는 세션 토큰 해시만 저장합니다.
8. 앱은 `POST action=check` 및 `POST action=status`로 로그인 세션과 `Blocked` 변경을 확인합니다.
9. 로그인 실패는 이메일별 15분 창에서 5회까지 허용하며 초과 시 15분 동안 잠깁니다.
10. 서버 연결이 일시적으로 실패하면 아직 만료되지 않은 세션은 유지하고 다음 주기에 재시도합니다.
11. 관리자 페이지는 `admin` 아이디와 비밀번호를 확인해 1시간 관리자 세션을 발급합니다. 최초 비밀번호 `a1234567890`은 첫 로그인 직후 변경해야 하며 이후에는 사용할 수 없습니다.

## 코드 적용과 데이터 통합

1. 브라우저에서 인증 메일 발신 계정인 `shoutjoy1@gmail.com`으로 로그인합니다.
2. Google Sheet에서 `확장 프로그램 → Apps Script`를 엽니다. 이 계정에 Sheet와 스크립트 편집 권한이 있어야 합니다.
3. Apps Script의 `Code.gs` 전체를 이 폴더의 `Code.gs`로 교체하고 저장합니다.
4. 함수 목록에서 `authorizeServices`를 선택해 한 번 실행합니다.
5. Sheet 및 메일 권한을 승인합니다. 발신 계정이 다르면 함수가 오류로 중지됩니다.

`authorizeServices`를 실행하면 기존 Token/RequestId 구조가 아래 구조로 변환되고 동일 이메일의 중복 행이 한 행으로 통합됩니다. 비어 있는 `Admin` 탭에는 최초 관리자 계정도 자동으로 생성됩니다.

```text
RequestedAt | Email | Status | LastVerifiedAt | VerifiedAt | NotifiedAt | NotificationError | Name | Organization | Purpose | PasswordSalt | PasswordHash | PasswordIterations | PasswordUpdatedAt
```

`Admin` 탭의 최초 구조:

```text
Category | ID | PW | etc | status
Temporary | admin | a1234567890 | init pw | active
In fact |  |  | pbkdf2-sha256-v1 | inactive
```

첫 로그인에서 비밀번호를 바꾸면 `Temporary` 행의 PW는 즉시 비워지고 `inactive`가 됩니다. `In fact` 행에는 `v1$반복횟수$솔트$보호된해시` 형식의 인증값이 기록되고 `active`가 됩니다. 새 비밀번호 원문은 기록하지 않습니다.

상태는 다음 두 값을 사용합니다.

- `Active`: 이메일 인증을 완료했으며 앱 사용 가능
- `Blocked`: 앱 사용 중지 및 동일 Gmail 재신청 거절

대소문자와 앞뒤 공백은 정규화되지만 `Acitve` 같은 오타는 `Invalid`로 판정되어 앱이 잠깁니다. 이는 오타 때문에 차단 사용자가 우연히 활성화되는 일을 막기 위한 안전 동작입니다.
`authorizeServices`를 실행하면 Status 열에는 `Active`/`Blocked` 드롭다운과 잘못된 값 입력 방지가 적용됩니다.

행을 삭제하면 해당 브라우저는 다음 동기화 때 다시 신청해야 합니다. 영구적으로 막으려면 삭제 대신 `Status`를 `Blocked`로 변경합니다.

## 웹 앱 재배포

일반 사용자와 관리자 인증이 같은 웹 앱 배포 하나를 사용합니다.

1. `배포 → 배포 관리`에서 현재 배포의 연필 아이콘을 누릅니다.
2. 버전을 반드시 `새 버전`으로 선택합니다.
3. 배포 계정이 `shoutjoy1@gmail.com`인지 확인하고, 실행 사용자는 `나`, 액세스 권한은 `모든 사용자`로 설정합니다.
4. 배포 후 `/exec` URL을 확인합니다.

배포 후 `https://fmaviewer.vercel.app/Auth/admin.html`에서 `admin / a1234567890`으로 최초 로그인하고 새 비밀번호를 설정합니다. 관리자 계정은 `Admin` 탭을 기준으로 확인하며, 변경한 비밀번호 원문은 저장하지 않고 보호된 인증값만 같은 행에 기록합니다.

새 URL이 발급되면 `admin.html`에 배포 URL을 입력하고 **배포 URL로 앱 최신화**를 누릅니다. **설정만 저장**은 관리자 저장소만 갱신하므로 `index.html`이 별도 저장 환경에 있으면 이전 URL이 계속 사용될 수 있습니다.

프로젝트의 최신 코드 복사부터 재배포, 앱 반영까지의 전체 순서는 [`../UPDATE_GUIDE.md`](../UPDATE_GUIDE.md)를 따릅니다.

정상 health 응답:

```json
{"success":true,"service":"FMA Viewer verified email registration","version":"2026-08-05-admin-recovery-v3","status":"OK","authMode":"email-password-session"}
```

## 관리 함수

- `authorizeServices`: 권한 승인, 이전 스키마 변환, 이메일 중복 통합, 최초 관리자 인증 준비
- `resetAdminAccount`: 관리자 비밀번호를 잊었을 때 초기 비밀번호 상태로 되돌림
- `testNotificationEmail`: 개발자 주소로 인증 완료 알림 테스트 메일 발송
- `retryFailedNotifications`: 알림 발송 실패 행 재시도
