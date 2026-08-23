@echo off
chcp 65001 >nul
cd /d "%~dp0"

where npm >nul 2>nul
if %errorlevel% neq 0 (
  echo [오류] npm이 설치되어 있지 않습니다.
  echo Node.js를 설치한 뒤 다시 실행해 주세요.
  echo https://nodejs.org/ko
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [처음 실행] 패키지 설치 중... npm install
  npm install
  if %errorlevel% neq 0 (
    echo npm install 실패.
    pause
    exit /b 1
  )
  echo.
) else (
  echo [이미 설치됨] node_modules가 있으므로 npm install을 건너뜁니다.
  echo.
)

echo 개발 서버 실행 중... npm run dev
npm run dev
pause