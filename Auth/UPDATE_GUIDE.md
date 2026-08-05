# Auth 최신 코드 적용 및 GAS 재배포 가이드

이 문서는 현재 프로젝트에서 인증 서버 코드를 업데이트하고, 새 Google Apps Script 웹 앱 URL을 `index.html`에 확실하게 반영하는 절차를 설명합니다.

## 이번 업데이트의 핵심

- 신청자가 이름, 소속, Gmail, 사용목적을 직접 입력합니다.
- 앱은 Gmail·비밀번호 로그인 화면으로 시작하고 **아이디 저장**은 Gmail만 저장합니다.
- 신청할 때 FMA Viewer 전용 비밀번호를 함께 입력하며, 원문 비밀번호는 저장하거나 서버로 보내지 않습니다.
- 인증 전 정보는 GAS Script Properties에 임시 보관합니다.
- Gmail 인증이 끝난 뒤에만 Google Sheet `Users` 탭에 신청 정보와 보호된 비밀번호 인증 정보를 기록합니다.
- 인증 완료 후 Gmail·비밀번호로 로그인하면 최대 8시간 세션으로 앱을 엽니다.
- 인증 메일을 기다리는 동안에도 입력 내용을 수정해 새 인증 메일을 보낼 수 있습니다.
- `admin.html` 하단에서 프로젝트의 최신 `Auth/gas/Code.gs`를 불러와 전체 복사할 수 있습니다.
- GAS 배포 URL이 바뀌면 **배포 URL로 앱 최신화**가 URL과 점검 설정을 `index.html`에 전달합니다.
- `config.js`는 전달된 값을 앱의 로컬 저장소에 저장한 뒤 주소창의 전달 매개변수를 제거합니다.
- 클라이언트는 GAS 응답의 서버 버전을 검사하여 구버전 배포를 감지합니다.
- 관리자 페이지는 `admin` 아이디와 관리자 비밀번호로 로그인한 뒤에만 열립니다. 최초 비밀번호 `a1234567890`으로 로그인하면 새 비밀번호 변경이 강제됩니다.

현재 기대 서버 버전:

```text
2026-08-05-admin-recovery-v3
```

## 전체 업데이트 순서

### 1. 웹 파일을 먼저 최신 상태로 배포

다음 파일이 최신 웹 배포에 포함되어야 합니다.

```text
index.html
Auth/admin.html
Auth/admin-auth.js
Auth/admin.js
Auth/admin.css
Auth/config.js
Auth/client.js
Auth/modal.js
Auth/settings.js
Auth/auth.css
Auth/gas/Code.gs
vercel.json
```

관리자 화면이 `Auth/gas/Code.gs`를 자동으로 읽으려면 이 파일을 정적 사이트에서 접근할 수 있어야 합니다. 현재 루트 `.gitignore`는 `Auth/gas/Code.gs`만 게시 대상으로 허용합니다.

배포 후 관리자 화면이 이전 모습이면 강력 새로고침을 하거나 브라우저 캐시를 지우고 다시 엽니다.

### 2. 첫 적용은 원본 `Code.gs` 직접 복사

기존 GAS가 새 관리자 로그인을 처리하기 전에는 관리자 화면이 잠겨 있으므로 다음 원본을 직접 엽니다.

```text
https://fmaviewer.vercel.app/Auth/gas/Code.gs
```

1. 원본 전체를 선택해 복사합니다.
2. 코드 상단 주석과 `SERVER_VERSION`이 `2026-08-05-admin-recovery-v3`인지 확인합니다. Apps Script 함수 목록에서 `version`을 실행해도 확인할 수 있습니다.

이미 관리자 비밀번호 로그인이 설정된 이후 업데이트라면 관리자 화면 하단의 다음 기능도 사용할 수 있습니다.

- **최신 코드 다시 불러오기**
- **로컬 Code.gs 선택** 후 프로젝트의 `Auth/gas/Code.gs` 선택

코드 일부만 복사하지 말고 전체를 교체해야 합니다.

### 3. Apps Script의 `Code.gs` 전체 교체

1. 사용자 관리용 Google Sheet를 엽니다.
2. `확장 프로그램 → Apps Script`를 선택합니다.
3. 기존 `Code.gs` 내용을 모두 선택해 삭제합니다.
4. 관리자 화면에서 복사한 최신 코드를 붙여 넣고 저장합니다.
5. 함수 목록에서 `authorizeServices`를 선택해 실행합니다.
6. Sheet와 Gmail 발송 권한을 요청하면 운영 계정으로 승인합니다.

`authorizeServices`는 `Users` 탭의 스키마와 상태값을 정리하고, 비어 있는 `Admin` 탭에 최초 관리자 계정을 만듭니다. 현재 열 구조는 다음과 같습니다.

```text
RequestedAt | Email | Status | LastVerifiedAt | VerifiedAt | NotifiedAt | NotificationError | Name | Organization | Purpose | PasswordSalt | PasswordHash | PasswordIterations | PasswordUpdatedAt
```

기존 열은 유지하고 뒤에 신청 정보와 `PasswordSalt`, `PasswordHash`, `PasswordIterations`, `PasswordUpdatedAt`을 추가합니다. 기존 `Active` 사용자는 처음 한 번 **이메일 인증하기**에서 전용 비밀번호를 설정해야 합니다.

`Admin` 탭에는 다음 값이 만들어져야 합니다.

```text
Category | ID | PW | etc | status
Temporary | admin | a1234567890 | init pw | active
In fact |  |  | pbkdf2-sha256-v1 | inactive
```

최초 로그인 후 비밀번호를 변경하면 `Temporary` 행은 PW가 지워지고 `inactive`가 됩니다. `In fact` 행에는 보호된 인증값이 기록되고 `active`가 되며 이후 로그인은 이 행만 사용합니다.

### 4. 웹 앱을 새 버전으로 재배포

일반 사용자와 관리자가 동일한 **공개 배포 하나**를 사용합니다.

1. Apps Script 오른쪽 위의 `배포 → 배포 관리`를 엽니다.
2. 사용 중인 웹 앱 배포의 연필 아이콘을 누릅니다.
3. 버전을 반드시 **새 버전**으로 선택합니다.
4. `다음 사용자로 실행`은 `나`로 설정합니다.
5. 앱 사용자가 로그인하지 않고 호출해야 하므로 액세스 권한은 `모든 사용자`로 설정합니다.
6. 배포하고 `/exec`로 끝나는 웹 앱 URL을 복사합니다.

기존 배포의 새 버전을 만들면 보통 `/exec` URL이 유지됩니다. 별도의 새 배포를 만들면 URL이 바뀔 수 있으므로 다음 단계에서 실제 URL을 다시 입력합니다.

### 5. GAS 서버 버전 확인

복사한 `/exec` URL 뒤에 `?action=health`를 붙여 브라우저에서 엽니다.

```text
https://script.google.com/macros/s/배포ID/exec?action=health
```

응답에서 다음 항목을 확인합니다.

```json
{
  "success": true,
  "service": "FMA Viewer verified email registration",
  "version": "2026-08-05-admin-recovery-v3",
  "status": "OK",
  "authMode": "email-password-session"
}
```

`version`이 이전 값이면 Apps Script 편집기의 코드만 저장하고 웹 앱을 새 버전으로 배포하지 않은 상태입니다.

### 6. 새 배포 URL을 `index.html`에 반영

1. `https://fmaviewer.vercel.app/Auth/admin.html`을 엽니다.
2. 로그인 화면에 현재 기본 `/exec` URL이 자동 적용됩니다. 별도 새 배포를 만들어 URL이 바뀐 경우에만 **GAS 웹 앱 배포 URL**에 새 주소를 입력합니다.
3. **인증 서버 연결 및 버전 점검**을 눌러 서버 버전과 Admin 시트 준비 상태를 확인합니다.
4. 점검이 통과하면 `admin / a1234567890`으로 로그인합니다.
5. 강제로 표시되는 새 비밀번호 설정 화면에서 앞으로 사용할 비밀번호를 입력합니다.
6. 관리자 설정이 열리면 필요한 경우 하루 점검 횟수와 차단 확인 간격을 조정합니다.
7. **배포 URL로 앱 최신화**를 누릅니다.
8. 로그아웃한 뒤 변경한 비밀번호로 다시 로그인되는지 확인합니다.

관리자 설정의 **연결 및 버전 점검**을 누르면 입력한 GAS URL의 실제 `version`과 앱 요구 버전을 비교합니다. 두 버전이 같을 때만 정상으로 표시됩니다.

이 버튼은 다음 값을 URL 매개변수로 앱에 전달합니다.

```text
fmaGasUrl
fmaChecks
fmaBlockMinutes
```

`index.html`의 `Auth/config.js`가 값을 앱 환경의 `localStorage`에 저장한 뒤 주소창에서 매개변수를 제거합니다. 따라서 이동 후 주소가 다시 평범한 `index.html`로 보이는 것이 정상입니다.

### 7. 두 관리자 버튼의 차이

| 버튼 | 동작 | 사용 시점 |
| --- | --- | --- |
| **배포 URL로 앱 최신화** | 관리자 설정 저장 후 `index.html`로 전달하고 앱 설정까지 교체 | GAS `/exec` URL 변경, 관리자와 앱의 저장 환경이 다를 때 |
| **설정만 저장** | 현재 관리자 페이지의 로컬 저장소에만 저장 | 같은 환경에서 점검 주기만 임시 조정할 때 |

새 GAS URL을 입력했는데 `index.html`이 계속 예전 URL을 사용한다면 **설정만 저장**만 누른 경우가 가장 흔합니다. 새 브라우저는 `settings.js`의 기본 URL을 사용하고, 관리자에서 전달한 URL은 해당 브라우저의 override로 사용됩니다.

## 업데이트 후 확인

새 브라우저나 시크릿 창에서 다음 순서로 검사합니다.

1. `index.html`에서 Gmail·비밀번호 로그인 화면이 먼저 표시되는지 확인합니다.
2. **이메일 인증하기**를 열고 이름, 소속, Gmail, 전용 비밀번호, 사용목적과 개인정보 동의를 입력합니다.
3. 인증 링크를 열기 전에는 Sheet에 새 행이 없고, 인증 대기 중에도 입력값을 수정할 수 있는지 확인합니다.
4. Gmail 인증 링크를 엽니다.
5. Sheet에 `Active` 상태, 신청 정보와 비밀번호 인증 열이 함께 기록되는지 확인합니다.
6. 원래 앱 화면이 로그인 화면으로 돌아오는지 확인한 뒤, 등록한 Gmail·비밀번호로 로그인합니다.
7. **아이디 저장** 선택 시 Gmail만 다음 방문에 채워지고 비밀번호는 저장되지 않는지 확인합니다.
8. 로그아웃하면 앱이 다시 잠기고 로그인 화면이 표시되는지 확인합니다.
9. Sheet 상태를 `Blocked`로 바꾸었을 때 설정된 간격 안에 앱이 잠기는지 확인합니다.
10. 최초 `admin / a1234567890` 로그인 후 비밀번호 변경이 강제되는지 확인합니다.
11. 변경 후 초기 비밀번호가 거부되고 새 비밀번호로만 로그인되는지 확인합니다.

## 문제 해결

| 증상 | 원인 | 해결 |
| --- | --- | --- |
| `현재 GAS가 ... 이전 버전입니다` | Apps Script 코드는 바꿨지만 웹 앱 배포 버전이 이전 상태 | `배포 관리`에서 **새 버전**으로 재배포하고 health 응답 확인 |
| 관리자에는 새 URL인데 앱은 이전 URL 사용 | 관리자와 앱의 저장소가 다르거나 설정만 저장함 | 새 URL 입력 후 **배포 URL로 앱 최신화** 클릭 |
| `Code.gs` 자동 불러오기 실패 | 정적 배포에 파일이 없거나 `file://` 제약 | 최신 웹 파일을 배포하거나 **로컬 Code.gs 선택** 사용 |
| health 주소에서 로그인 화면 표시 | 웹 앱 공개 범위가 제한됨 | 실행 사용자 `나`, 액세스 `모든 사용자`로 재배포 |
| health 버전이 계속 이전 값 | 잘못된 배포 URL 또는 새 버전 미선택 | 현재 편집 프로젝트의 배포 URL과 버전 다시 확인 |
| 변경 후 관리자 화면이 예전 모습 | 브라우저 또는 호스팅 캐시 | 강력 새로고침 후 최신 배포 파일 확인 |
| 초기 비밀번호 안내가 보이지 않음 | 이미 새 관리자 비밀번호로 변경했거나 GAS가 이전 버전 | 변경한 비밀번호로 로그인하거나 GAS health 버전 확인 |
| 비밀번호를 잊음 | 변경한 관리자 비밀번호를 확인할 수 없음 | Apps Script에서 `resetAdminAccount`를 한 번 실행하고 초기 비밀번호로 다시 로그인 |

## 완료 체크리스트

- [ ] 원본 `Code.gs` 버전이 `2026-08-05-admin-recovery-v3`이다.
- [ ] Apps Script의 `Code.gs` 전체를 최신 코드로 교체했다.
- [ ] `authorizeServices`를 실행했다.
- [ ] 웹 앱을 **새 버전**으로 재배포했다.
- [ ] 웹 앱 배포는 하나만 사용한다.
- [ ] `admin / a1234567890` 최초 로그인 후 새 비밀번호를 설정했다.
- [ ] `/exec?action=health`의 버전이 기대 버전과 같다.
- [ ] 새 `/exec` URL 입력 후 **배포 URL로 앱 최신화**를 눌렀다.
- [ ] 인증 전에는 Sheet에 기록되지 않는다.
- [ ] 인증 후 신청 정보, `Active` 상태와 비밀번호 인증 정보가 Sheet에 기록된다.
- [ ] Gmail·비밀번호 로그인, 아이디 저장, 로그아웃이 동작한다.
- [ ] 관리자 연결 테스트와 `Blocked` 반영 테스트가 통과한다.
- [ ] 관리자 로그아웃, 초기 비밀번호 폐기와 새 비밀번호 재로그인이 동작한다.
