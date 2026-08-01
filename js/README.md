# JavaScript 기능별 구조

`index.html`은 아래 기능 폴더의 일반 스크립트를 기존 의존 순서대로 불러옵니다. 파일을 다른 폴더로 옮길 때는 HTML의 `<script src>` 경로와 실행 순서를 함께 확인해야 합니다.

| 폴더 | 역할 | 파일 |
|---|---|---|
| `core/` | 전역 상태, 상호작용, 이탈 방지, 앱 초기화 | `globals.js`, `interaction.js`, `navigationGuard.js`, `app.js` |
| `storage/` | IndexedDB와 SaveDB 히스토리 | `database.js`, `dbHistory.js` |
| `gallery/` | 갤러리 목록과 이미지·영상 미리보기 | `gallery.js`, `preview.js` |
| `image/` | 이미지 편집, Crop, 메타데이터, 업스케일, 배경 제거 | `imageEditor.js`, `crop.js`, `imageMetadata.js`, `metadataWindow.js`, `imageUpscale.js`, `backgroundRemove.js`, `backgroundMaskEditor.js` |
| `video/` | 영상 자르기와 색상 보정 | `videoEditor.js` |
| `ai/` | Gemini 기반 AI Jena 편집 | `aiJena.js` |
| `files/` | FMA 파일 불러오기·저장·내보내기 | `fileHandlers.js` |
| `integrations/` | Aura, Story, BG Remover 외부 앱 연결 | `externalApps.js` |

모든 파일은 ES 모듈이 아닌 일반 스크립트이며 전역 함수와 상태를 공유합니다. 따라서 폴더 분리는 코드 네임스페이스를 변경하지 않고 파일 위치만 구조화합니다.
