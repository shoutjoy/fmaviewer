# ai_image_studio_pro

React + Vite 프로젝트입니다.

## 실행 방법

**Windows:** 압축 해제 후 `실행.bat` 더블클릭. CMD가 열리며 npm 확인 → 필요 시 npm install → npm run dev 자동 실행.

### ⚠️ 실행 파일(실행.bat) 사용 시 필수

**실행 파일을 만들었을 때(압축 해제 후 처음 실행할 때)에는 반드시 bat 파일을 차단 해제해야 합니다.**

1. **실행.bat** 위에서 **마우스 오른쪽 클릭** → **속성**
2. **일반** 탭 맨 아래 **"차단 해제"** 체크 → **확인**
3. 그 다음 **실행.bat** 더블클릭

### "파일을 복사할 수 없음" / Windows 보안 경고가 뜨는 경우

인터넷에서 받은 파일로 인식되어 Windows가 차단한 경우입니다. 위와 같이 **실행.bat 우클릭 → 속성 → 차단 해제** 후 다시 실행하세요.

**또는 터미널에서:**

```bash
npm install
npm run dev
```

브라우저에서 http://localhost:5173 으로 접속하세요.

## 빌드

```bash
npm run build
npm run preview
```