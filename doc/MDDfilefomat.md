# MDD 파일 포맷 명세와 외부 앱 제작 가이드

> 문서 기준일: 2026-08-01  
> 대상 구현: 현재 MDpro의 `md_viewer/index.html`에서 로드되는 MDD 코드  
> 포맷 버전: MDD version 1

## 1. 이 문서의 목적

MDD는 Markdown 본문과 본문에서 사용하는 내부 이미지를 **하나의 JSON 파일**에 묶는 MDpro 문서 포맷이다. 확장자는 `.mdd`이지만 ZIP이나 바이너리 컨테이너가 아니며, UTF-8로 인코딩한 일반 JSON 텍스트 파일이다.

이 문서는 다음 두 가지를 정확히 설명한다.

1. MDpro가 MDD를 어떻게 내보내고 읽는지
2. 다른 앱이 현재 MDpro에서 정상적으로 열리는 MDD를 만드는 방법

현재 구현에는 `mdviewer/mdd`와 `mdlive/mdd`라는 두 포맷 식별자가 있다. **본문만 전달할 때는 `mdviewer/mdd`를 사용할 수 있지만, 묶음 이미지를 현재 MDpro로 가져와 본문에 정상 연결하려면 `mdlive/mdd` 호환 프로필과 `indb:` 참조를 사용하는 것이 안전하다.** 이유와 예시는 아래에서 설명한다.

## 2. 가장 빠른 결론

다른 앱에서 이미지가 포함된 MDD를 만들 때는 현재 다음 규칙을 사용한다.

1. 파일은 UTF-8 JSON으로 만들고 확장자를 `.mdd`로 지정한다.
2. 최상위 `format`은 `"mdlive/mdd"`로 지정한다.
3. `version`은 숫자 `1`로 지정한다.
4. Markdown 본문의 이미지 URL은 `indb:<image-id>`로 작성한다.
5. `images[]`의 각 항목에 같은 `id`, 올바른 `mime`, 접두사 없는 순수 Base64를 넣는다.
6. 이미지 ID는 영문자·숫자와 `-`, `_`, `.`, `~`만 사용하는 것이 안전하다.
7. 같은 ID를 중복해서 사용하지 않는다.

현재 MDpro에서 바로 읽히는 최소 이미지 묶음은 다음과 같다.

```json
{
  "format": "mdlive/mdd",
  "version": 1,
  "exportedAt": "2026-08-01T03:00:00.000Z",
  "document": {
    "fileName": "external-sample.md",
    "content": "# 외부 앱에서 만든 문서\n\n아래 이미지는 MDD 안에 포함되어 있습니다.\n\n![1×1 예제](indb:figure-1)\n"
  },
  "images": [
    {
      "id": "figure-1",
      "name": "figure-1.png",
      "mime": "image/png",
      "base64": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    }
  ]
}
```

MDpro는 이 파일을 가져올 때 `figure-1`을 그대로 내부 키로 쓰지 않는다. 충돌을 피하기 위해 `figure-1_xxxxxx`와 같은 새 ID를 만들고, 본문의 `indb:figure-1`을 새 `internal://figure-1_xxxxxx` 주소로 바꾼다. 따라서 외부 앱은 MDpro가 최종적으로 발급할 내부 ID를 예측할 필요가 없다.

## 3. 파일의 물리적 형식

| 항목 | 규칙 |
|---|---|
| 파일 확장자 | `.mdd` |
| 실제 데이터 형식 | JSON 객체 |
| 문자 인코딩 | UTF-8 권장·필수. UTF-8 BOM은 현재 파서가 제거할 수 있음 |
| MIME 형식 | `application/json;charset=utf-8` 권장 |
| 압축 | 없음 |
| 이미지 저장 방식 | JSON 문자열 안의 순수 Base64 |
| 줄바꿈 | JSON 표준에 맞으면 LF/CRLF 모두 가능 |
| 포맷 버전 | 숫자 `1` |
| 표준 식별자 | `mdviewer/mdd` |
| 현재 이미지 호환 식별자 | `mdlive/mdd` |

`.mdd` 파일의 내용은 `{`로 시작하는 JSON 객체여야 한다. 파일 이름만 `.mdd`로 바꾸고 ZIP·Markdown·바이너리 데이터를 넣으면 읽을 수 없다.

## 4. 최상위 JSON 구조

```json
{
  "format": "mdlive/mdd",
  "version": 1,
  "exportedAt": "2026-08-01T03:00:00.000Z",
  "document": {
    "fileName": "document.md",
    "content": "# Markdown 본문\n"
  },
  "images": []
}
```

### 4.1 최상위 필드

| 필드 | 권장 생성 규칙 | 현재 MDpro 읽기 동작 |
|---|---|---|
| `format` | 필수 문자열. 이미지 묶음은 `mdlive/mdd` 권장 | 앞뒤 공백과 대소문자를 정규화한 뒤 `mdviewer/mdd` 또는 `mdlive/mdd`만 MDD로 인정 |
| `version` | 필수 숫자 `1` | 숫자로 변환한다. 없거나 `0`이면 현재 기본값 `1`을 사용하며, 현재는 상위 버전을 엄격히 거부하지 않음 |
| `exportedAt` | 선택 문자열. UTC ISO 8601 권장 | 문자열로 보존하지만 가져오기 결과에는 사용하지 않음 |
| `document` | 필수 객체 | 객체가 없으면 유효한 MDD로 인정하지 않음 |
| `images` | 선택 배열. 이미지가 없으면 `[]` 권장 | 배열이 아니면 빈 배열로 취급 |

현재 판별기는 `format`과 `document` 객체를 우선 확인한다. 그러나 외부 앱은 느슨한 판별 동작에 기대지 말고 이 문서의 필수 필드를 모두 생성해야 한다.

### 4.2 `document` 객체

| 필드 | 권장 생성 규칙 | 현재 MDpro 읽기 동작 |
|---|---|---|
| `fileName` | 필수 문자열. 경로 없는 안전한 파일명과 `.md` 확장자 권장 | 없거나 빈 문자열이면 `document.md` 사용 |
| `content` | 필수 문자열. 원본 Markdown 전체 | 문자열로 변환해 편집기에 로드. 없으면 빈 문서가 됨 |

`content`는 JSON 문자열이므로 실제 줄바꿈은 직렬화할 때 `\n`으로 이스케이프된다. JSON 라이브러리를 사용하면 자동으로 처리되므로 문자열을 직접 조립하지 않는 것이 좋다.

`fileName`은 현재 문서 제목으로 사용된다. 외부 앱에서는 `C:\\...` 같은 로컬 절대 경로나 `../../...` 같은 상위 경로를 넣지 말고 `research-note.md`처럼 기본 파일명만 넣는다.

### 4.3 `images[]` 항목

```json
{
  "id": "figure-1",
  "name": "experiment-result.png",
  "mime": "image/png",
  "base64": "iVBORw0KGgoAAA..."
}
```

| 필드 | 권장 생성 규칙 | 현재 MDpro 읽기 동작 |
|---|---|---|
| `id` | 이미지마다 고유한 비어 있지 않은 문자열 | 참조 매핑 키와 새 내부 ID를 만들기 위한 seed로 사용 |
| `path` | 선택. 구형 제작기가 경로형 키를 쓸 때만 사용 | `indb:<path>` 매핑 키와 ID seed 후보로 사용. 실제 파일시스템 경로가 아님 |
| `name` | 원본 확장자를 포함한 표시용 파일명 | IndexedDB 이미지 레코드의 `name`으로 저장 |
| `mime` | 실제 파일과 일치하는 MIME | 복원 Blob의 MIME으로 사용. 없으면 `application/octet-stream` |
| `base64` | **접두사 없는 순수 Base64** | `atob()`으로 디코딩. 비어 있으면 해당 이미지를 건너뜀 |

외부 제작기는 최소한 `id`, `name`, `mime`, `base64`를 모두 넣는 것이 좋다. `path`는 필수가 아니다.

### Base64에 넣어야 하는 값

올바른 값:

```text
iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...
```

잘못된 값:

```text
data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...
```

현재 가져오기 코드는 `data:image/png;base64,` 접두사를 제거하지 않고 전체 문자열을 `atob()`에 전달한다. 따라서 Data URL을 만들었다면 첫 번째 쉼표 뒤의 Base64 부분만 저장해야 한다.

### 권장 MIME 값

| 확장자 | `mime` |
|---|---|
| PNG | `image/png` |
| JPG/JPEG | `image/jpeg` |
| GIF | `image/gif` |
| WebP | `image/webp` |
| SVG | `image/svg+xml` |
| BMP | `image/bmp` |
| AVIF | `image/avif` |

파일 확장자만 보고 MIME을 신뢰하지 말고, 가능하면 원본 파일의 실제 MIME을 확인한다. 특히 SVG는 스크립트·외부 참조 등 보안 검토가 필요하다.

## 5. Markdown 안에서 이미지를 참조하는 방법

### 5.1 현재 외부 앱 권장 방식

`format: "mdlive/mdd"`와 함께 다음처럼 쓴다.

```markdown
![실험 결과](indb:figure-1)
```

그리고 `images[]`에 같은 ID를 둔다.

```json
{
  "id": "figure-1",
  "name": "figure-1.png",
  "mime": "image/png",
  "base64": "..."
}
```

HTML 이미지 문법을 사용해야 한다면 문자열 치환이 가능하도록 동일한 URL을 쓸 수 있다.

```html
<img src="indb:figure-1" alt="실험 결과">
```

하나의 이미지를 본문 여러 곳에서 반복 참조해도 된다. 현재 가져오기는 `indb:figure-1`의 모든 출현을 새 `internal://...` 주소로 바꾼다.

### 5.2 경로형 키를 쓰는 방식

구형 형식과의 호환이 필요하면 `path`를 매핑 키로 사용할 수 있다.

```json
{
  "format": "mdlive/mdd",
  "version": 1,
  "document": {
    "fileName": "document.md",
    "content": "![그림](indb:IMAGE/figures/result-01.png)"
  },
  "images": [
    {
      "path": "IMAGE/figures/result-01.png",
      "name": "result-01.png",
      "mime": "image/png",
      "base64": "..."
    }
  ]
}
```

현재 활성 MDD 가져오기는 `path`를 실제 폴더에 생성하지 않는다. 단지 본문 참조를 새 IndexedDB 이미지 ID에 연결하기 위한 문자열 키로 사용한다.

### 5.3 안전한 이미지 ID 규칙

다음 정규식 범위로 제한하는 것을 권장한다.

```regex
^[A-Za-z0-9][A-Za-z0-9._~-]*$
```

권장 예:

```text
figure-1
chart_2026_08
sample.image-03
```

피할 예:

```text
그림 1
figure/1
figure:1
../image.png
```

MDpro 내부 `internal://` 추출기는 URI 인코딩된 문자열도 처리하지만, 외부 호환 파일에서는 ASCII ID를 사용하면 인코딩·치환 차이를 피할 수 있다.

## 6. `mdviewer/mdd`와 `mdlive/mdd`의 차이

### 6.1 `mdviewer/mdd` — 현재 표준 식별자

MDpro의 현재 내보내기는 다음 구조를 만든다.

```json
{
  "format": "mdviewer/mdd",
  "version": 1,
  "exportedAt": "2026-08-01T03:00:00.000Z",
  "document": {
    "fileName": "document.md",
    "content": "![그림](internal://original-image-id)"
  },
  "images": [
    {
      "id": "original-image-id",
      "name": "result.png",
      "mime": "image/png",
      "base64": "..."
    }
  ]
}
```

본문만 있고 `images`가 비어 있는 MDD는 이 식별자로 문제없이 만들 수 있다.

### 6.2 `mdlive/mdd` — 현재 이미지 가져오기 호환 식별자

`mdlive/mdd`는 포맷 레지스트리에 등록된 공식 별칭이다. 현재 가져오기 코드에서 이 식별자를 사용하면 `indb:<id 또는 path>` 참조를 새 `internal://...` 주소로 바꾸는 호환 처리까지 실행한다.

따라서 **다른 앱이 현재 MDpro를 목표로 이미지 묶음을 만들 때는 `mdlive/mdd`를 사용해야 한다.**

### 6.3 현행 구현의 알려진 이미지 재연결 문제

현재 활성 가져오기 코드는 모든 이미지에 새 임의 ID를 발급한다. 그러나 `format: "mdviewer/mdd"`일 때는 본문의 기존 `internal://old-id`를 새 ID로 치환하지 않는다. 그 결과 JSON과 이미지 데이터는 읽어도 본문의 이미지 링크가 이전 ID를 가리킬 수 있다.

| 입력 방식 | 본문만 | 묶음 이미지 복원 | 현재 권장 여부 |
|---|---:|---:|---|
| `mdviewer/mdd` + 일반 Markdown | 정상 | 해당 없음 | 권장 |
| `mdviewer/mdd` + `internal://id` + `images[]` | 본문 로드 | 이미지 참조가 끊길 수 있음 | 외부 제작용으로 비권장 |
| `mdlive/mdd` + `indb:id` + `images[]` | 정상 | 새 내부 ID로 재연결 | **현재 권장** |

이는 포맷 자체의 의도라기보다 현재 가져오기 구현의 호환성 문제다. 향후 가져오기가 수정되면 표준 `mdviewer/mdd`와 `internal://id` 조합을 기본으로 통일할 수 있다. 외부 제작기는 대상 MDpro 버전에 따라 출력 프로필을 선택할 수 있게 만드는 것이 좋다.

## 7. MDpro가 MDD를 만드는 실제 과정

현재 화면의 `MDD file (bundle)` 버튼은 다음 순서로 동작한다.

1. 현재 Markdown 본문 전체를 문자열로 가져온다.
2. 정규식으로 본문에서 `internal://<image-id>`를 모두 찾는다.
3. 중복 ID는 한 번만 남기고 처음 등장한 순서를 유지한다.
4. 각 ID로 MDpro IndexedDB의 `images` 스토어에서 이미지 Blob을 조회한다.
5. Blob을 Data URL로 읽은 뒤 첫 번째 쉼표 앞의 `data:<mime>;base64,` 부분을 제거한다.
6. 이미지마다 `id`, `name`, `mime`, 순수 `base64` 객체를 만든다.
7. Markdown 본문은 `internal://...` 참조를 포함한 원문 그대로 `document.content`에 넣는다.
8. `format`, `version`, `exportedAt`, `document`, `images`를 JSON으로 직렬화한다.
9. MIME `application/json;charset=utf-8`인 Blob을 만들고 `.mdd`로 다운로드한다.

현재 내보내기가 만드는 객체의 의사 코드는 다음과 같다.

```javascript
const payload = {
  format: "mdviewer/mdd",
  version: 1,
  exportedAt: new Date().toISOString(),
  document: {
    fileName: mddFileName.replace(/\.mdd$/i, ".md"),
    content: markdown
  },
  images: usedImages.map(image => ({
    id: image.id,
    name: image.name,
    mime: image.mime,
    base64: rawBase64WithoutDataUrlPrefix
  }))
};
```

본문에서 참조하지만 IndexedDB에서 찾지 못한 이미지는 `images[]`에 포함되지 않는다. 이때 본문의 참조는 그대로 남으므로 깨진 이미지가 될 수 있다.

## 8. MDpro가 MDD를 읽는 실제 과정

현재 MDpro는 다음 순서로 파일을 읽는다.

1. 파일명이 `.mdd`이면 일반 Markdown 읽기가 아니라 MDD 가져오기 함수로 보낸다.
2. 파일 전체를 텍스트로 읽고 JSON으로 파싱한다. UTF-8 BOM은 포맷 파서가 제거한다.
3. `format`이 `mdviewer/mdd` 또는 `mdlive/mdd`인지 확인한다.
4. `document`가 객체인지 확인하고 `document.content`를 Markdown 문자열로 정규화한다.
5. `images[]`를 앞에서부터 순회한다.
6. 각 이미지의 `base64`를 `atob()`으로 디코딩해 Blob을 만든다.
7. 원래 ID와 별도로 안전한 새 ID를 생성한다.
8. Blob을 IndexedDB `images` 스토어에 저장한다.
9. `format`이 `mdlive/mdd`이면 `indb:<item.id>`와 `indb:<item.path>`를 새 `internal://<new-id>`로 전역 치환한다.
10. 변환된 Markdown을 현재 편집기에 열고 자동 저장한다.

새 ID는 대략 다음 규칙으로 생성된다.

```text
원래 id/path/name의 마지막 이름
→ 마지막 확장자 제거
→ [A-Za-z0-9._~-] 이외 문자를 _로 변경
→ _<무작위 6자리 내외> 추가
```

예:

```text
입력 id: figure-1
복원 id: figure-1_k8m2qx
본문: indb:figure-1
결과: internal://figure-1_k8m2qx
```

외부 앱은 가져오기 후의 실제 내부 ID가 입력 ID와 같을 것이라고 가정하면 안 된다.

## 9. 외부 앱에서 만드는 절차

### 9.1 언어 독립 알고리즘

```text
입력:
  markdown 본문
  이미지 파일 목록

1. 각 이미지에 고유한 ASCII ID를 정한다.
2. Markdown 이미지 주소를 indb:<ID>로 작성한다.
3. 이미지 바이트를 Base64로 인코딩한다.
4. Base64 앞에 data:... 접두사를 붙이지 않는다.
5. format="mdlive/mdd", version=1인 JSON 객체를 만든다.
6. document.fileName에 .md 이름을 넣는다.
7. document.content에 Markdown 원문을 넣는다.
8. images[]에 id/name/mime/base64를 넣는다.
9. JSON 라이브러리로 직렬화한다.
10. UTF-8로 <원하는이름>.mdd 파일을 쓴다.
```

### 9.2 브라우저 JavaScript 예제

```javascript
function fileToRawBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      const comma = dataUrl.indexOf(",");
      if (comma < 0) {
        reject(new Error("Invalid data URL"));
        return;
      }
      resolve(dataUrl.slice(comma + 1));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function createMdproMdd(markdown, documentName, imageInputs) {
  // imageInputs: [{ id: "figure-1", file: File }, ...]
  const seen = new Set();
  const images = [];

  for (const input of imageInputs) {
    const id = String(input.id || "").trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(id)) {
      throw new Error(`Unsafe image id: ${id}`);
    }
    if (seen.has(id)) {
      throw new Error(`Duplicate image id: ${id}`);
    }
    seen.add(id);

    images.push({
      id,
      name: input.file.name || `${id}.bin`,
      mime: input.file.type || "application/octet-stream",
      base64: await fileToRawBase64(input.file)
    });
  }

  const payload = {
    format: "mdlive/mdd",
    version: 1,
    exportedAt: new Date().toISOString(),
    document: {
      fileName: String(documentName || "document.md")
        .replace(/\.mdd$/i, ".md"),
      content: String(markdown || "")
    },
    images
  };

  return new Blob(
    [JSON.stringify(payload, null, 2)],
    { type: "application/json;charset=utf-8" }
  );
}

// 사용 예
const markdown = [
  "# 연구 결과",
  "",
  "![실험 결과](indb:figure-1)"
].join("\n");

const mddBlob = await createMdproMdd(
  markdown,
  "research-result.md",
  [{ id: "figure-1", file: selectedPngFile }]
);

const link = document.createElement("a");
link.href = URL.createObjectURL(mddBlob);
link.download = "research-result.mdd";
link.click();
setTimeout(() => URL.revokeObjectURL(link.href), 1000);
```

### 9.3 Node.js 예제

```javascript
const fs = require("node:fs");
const path = require("node:path");

function imageRecord(id, imagePath, mime) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(id)) {
    throw new Error(`Unsafe image id: ${id}`);
  }
  return {
    id,
    name: path.basename(imagePath),
    mime,
    base64: fs.readFileSync(imagePath).toString("base64")
  };
}

const payload = {
  format: "mdlive/mdd",
  version: 1,
  exportedAt: new Date().toISOString(),
  document: {
    fileName: "research-result.md",
    content: "# 연구 결과\n\n![실험 결과](indb:figure-1)\n"
  },
  images: [
    imageRecord("figure-1", "./figure-1.png", "image/png")
  ]
};

fs.writeFileSync(
  "research-result.mdd",
  JSON.stringify(payload, null, 2),
  "utf8"
);
```

### 9.4 Python 예제

```python
from __future__ import annotations

import base64
import json
from datetime import datetime, timezone
from pathlib import Path


def image_record(image_id: str, image_path: Path, mime: str) -> dict:
    allowed = set(
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
        "abcdefghijklmnopqrstuvwxyz"
        "0123456789._~-"
    )
    if not image_id or not image_id[0].isalnum() or any(
        ch not in allowed for ch in image_id
    ):
        raise ValueError(f"Unsafe image id: {image_id}")

    return {
        "id": image_id,
        "name": image_path.name,
        "mime": mime,
        "base64": base64.b64encode(image_path.read_bytes()).decode("ascii"),
    }


payload = {
    "format": "mdlive/mdd",
    "version": 1,
    "exportedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    "document": {
        "fileName": "research-result.md",
        "content": "# 연구 결과\n\n![실험 결과](indb:figure-1)\n",
    },
    "images": [
        image_record("figure-1", Path("figure-1.png"), "image/png")
    ],
}

Path("research-result.mdd").write_text(
    json.dumps(payload, ensure_ascii=False, indent=2),
    encoding="utf-8",
)
```

## 10. 권장 JSON Schema

현재 MDpro 자체는 JSON Schema로 검증하지 않지만, 다른 앱은 파일을 만들기 전에 다음과 같은 엄격한 스키마로 검증하는 것이 좋다.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "MDpro MDD v1",
  "type": "object",
  "required": ["format", "version", "document", "images"],
  "properties": {
    "format": {
      "type": "string",
      "enum": ["mdviewer/mdd", "mdlive/mdd"]
    },
    "version": {
      "type": "integer",
      "const": 1
    },
    "exportedAt": {
      "type": "string",
      "format": "date-time"
    },
    "document": {
      "type": "object",
      "required": ["fileName", "content"],
      "properties": {
        "fileName": {
          "type": "string",
          "minLength": 1
        },
        "content": {
          "type": "string"
        }
      },
      "additionalProperties": true
    },
    "images": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "name", "mime", "base64"],
        "properties": {
          "id": {
            "type": "string",
            "pattern": "^[A-Za-z0-9][A-Za-z0-9._~-]*$"
          },
          "path": {
            "type": "string"
          },
          "name": {
            "type": "string",
            "minLength": 1
          },
          "mime": {
            "type": "string",
            "pattern": "^image/[A-Za-z0-9.+-]+$"
          },
          "base64": {
            "type": "string",
            "minLength": 4,
            "pattern": "^[A-Za-z0-9+/]*={0,2}$"
          }
        },
        "additionalProperties": true
      }
    }
  },
  "additionalProperties": true
}
```

스키마만으로 `document.content`의 모든 `indb:<id>`가 `images[].id`에 존재하는지 확인할 수는 없다. 이 참조 무결성은 별도 코드로 검사해야 한다.

## 11. 생성 전 검증 코드

```javascript
function validateMdproMdd(payload) {
  const errors = [];
  const allowedFormats = new Set(["mdviewer/mdd", "mdlive/mdd"]);

  if (!payload || Array.isArray(payload) || typeof payload !== "object") {
    return ["Top-level value must be a JSON object."];
  }
  if (!allowedFormats.has(String(payload.format || "").trim().toLowerCase())) {
    errors.push("format must be mdviewer/mdd or mdlive/mdd.");
  }
  if (payload.version !== 1) {
    errors.push("version must be numeric 1.");
  }
  if (!payload.document || typeof payload.document !== "object") {
    errors.push("document object is required.");
  } else {
    if (typeof payload.document.fileName !== "string" || !payload.document.fileName) {
      errors.push("document.fileName is required.");
    }
    if (typeof payload.document.content !== "string") {
      errors.push("document.content must be a string.");
    }
  }
  if (!Array.isArray(payload.images)) {
    errors.push("images must be an array.");
    return errors;
  }

  const ids = new Set();
  for (let i = 0; i < payload.images.length; i += 1) {
    const image = payload.images[i] || {};
    const id = String(image.id || "");
    if (!/^[A-Za-z0-9][A-Za-z0-9._~-]*$/.test(id)) {
      errors.push(`images[${i}].id is unsafe.`);
    } else if (ids.has(id)) {
      errors.push(`Duplicate image id: ${id}`);
    }
    ids.add(id);

    if (!/^image\/[A-Za-z0-9.+-]+$/.test(String(image.mime || ""))) {
      errors.push(`images[${i}].mime is invalid.`);
    }
    const b64 = String(image.base64 || "");
    if (!b64 || b64.startsWith("data:") || !/^[A-Za-z0-9+/]*={0,2}$/.test(b64)) {
      errors.push(`images[${i}].base64 is not raw Base64.`);
    } else {
      try {
        atob(b64);
      } catch (_) {
        errors.push(`images[${i}].base64 cannot be decoded.`);
      }
    }
  }

  if (String(payload.format).toLowerCase() === "mdlive/mdd") {
    const content = String(payload.document && payload.document.content || "");
    const refs = [...content.matchAll(/indb:([A-Za-z0-9][A-Za-z0-9._~-]*)/g)]
      .map(match => match[1]);
    for (const ref of refs) {
      if (!ids.has(ref)) errors.push(`Missing image record for indb:${ref}`);
    }
  }

  return errors;
}
```

## 12. 호환성 체크리스트

외부 앱이 만든 파일을 MDpro로 보내기 전에 모두 확인한다.

- [ ] 파일명이 `.mdd`로 끝난다.
- [ ] 파일 전체가 UTF-8 JSON 객체다.
- [ ] `format`이 이미지 묶음용 `mdlive/mdd`다.
- [ ] `version`이 문자열 `"1"`이 아니라 숫자 `1`이다.
- [ ] `document.fileName`이 비어 있지 않고 `.md`로 끝난다.
- [ ] `document.content`가 문자열이다.
- [ ] `images`가 배열이다.
- [ ] 모든 이미지 ID가 ASCII 안전 규칙을 따른다.
- [ ] 이미지 ID가 서로 중복되지 않는다.
- [ ] 본문의 `indb:<id>`와 `images[].id`가 대소문자까지 정확히 일치한다.
- [ ] Base64에 `data:image/...;base64,` 접두사가 없다.
- [ ] Base64를 디코딩했을 때 원본 바이트와 동일하다.
- [ ] `mime`이 실제 이미지 형식과 일치한다.
- [ ] JSON 직렬화 뒤 다시 파싱하는 왕복 테스트를 통과한다.
- [ ] MDpro에서 열어 본문 이미지가 보이고, 다시 MDD 또는 ZIP으로 내보낼 수 있다.

## 13. 오류와 원인

| 증상 | 가능한 원인 | 해결 방법 |
|---|---|---|
| `Invalid MDD format.` | `format` 오타, `document` 객체 없음 | `mdlive/mdd`, version 1, document 객체 확인 |
| JSON 파싱 오류 | JSON 문자열 직접 조립, 쉼표·따옴표 오류, UTF-8이 아님 | 표준 JSON 라이브러리와 UTF-8 사용 |
| 문서는 열리지만 이미지가 안 보임 | `mdviewer/mdd`에서 `internal://`가 새 ID로 재연결되지 않음 | 현재는 `mdlive/mdd` + `indb:id` 사용 |
| 일부 이미지만 빠짐 | `base64`가 비었거나 본문 ID와 이미지 ID 불일치 | 각 참조와 레코드의 정확한 일치 확인 |
| 가져오기가 중간에 실패 | 잘못된 Base64로 `atob()` 실패 | 생성 전에 모든 Base64 디코딩 검증 |
| 이미지 형식이 이상함 | `mime`이 실제 바이트 형식과 다름 | 실제 MIME 지정 |
| 한글·공백 ID가 연결되지 않음 | ID 인코딩·치환 차이 | ASCII 안전 ID 사용 |
| 파일이 매우 느리게 열림 | Base64로 파일 크기가 약 33% 증가하고 JSON 전체를 메모리에 올림 | 이미지를 최적화하거나 큰 묶음은 ZIP 검토 |
| 같은 그림이 엉뚱하게 연결됨 | 중복 `id` 또는 `path` | 모든 매핑 키를 고유하게 생성 |

가져오기는 이미지별로 하나씩 IndexedDB에 저장하며 전체 트랜잭션으로 묶여 있지 않다. 뒤쪽 이미지의 Base64가 잘못되어 실패하면 앞에서 저장한 이미지 일부가 남을 수 있으므로 외부 앱에서 사전 검증하는 것이 중요하다.

## 14. 크기·성능·보안 주의사항

- Base64는 원본 바이너리보다 대략 33% 커지고 JSON 문자열 오버헤드가 추가된다.
- 현재 코드에는 MDD 자체의 명시적인 최대 크기가 없지만 브라우저 메모리와 IndexedDB 저장공간 한도를 받는다.
- MDD는 전체 파일을 텍스트로 읽고 각 Base64 문자열을 한 번에 디코딩한다. 수백 MB 크기의 파일은 피한다.
- 이미지가 많거나 매우 크면 MDD보다 `ZIP file` 내보내기가 메모리·크기 면에서 더 적합할 수 있다.
- MDD에는 실행 코드를 넣지 않지만 Markdown/HTML과 SVG가 렌더링될 수 있다. 신뢰할 수 없는 파일은 HTML·SVG 정화 정책을 거쳐야 한다.
- 가져오는 앱은 `document.fileName`, `images[].name`, `path`를 실제 로컬 파일 경로로 직접 사용해서는 안 된다. 기본 파일명으로 정규화하고 경로 이동 문자열을 거부한다.
- 현재 포맷에는 해시, 전자서명, 암호화, 압축, 제작 앱 식별자에 대한 필수 표준이 없다. 무결성이나 출처 보증이 필요하면 별도 전송 계층에서 처리한다.

## 15. 구현 파일과 역할

현재 활성 구현:

- [file_format.js](../file_format/file_format.js): 포맷 레지스트리, 식별, JSON 파싱, MDD 정규화
- [extend-files.js](../js/extendFiles/extend-files.js): 현재 MDD 내보내기와 IndexedDB 가져오기
- [imageDB.js](../imageDB/imageDB.js): `internal://` ID 추출, 이미지 Blob 저장·조회·렌더링
- [app.js](../js/core/app.js): 파일 열기, 내보내기 메뉴, MDD 가져오기 호출
- [index.html](../index.html): 위 모듈을 실제 앱에 로드하는 진입점

참고용 구형·미연결 구현:

- [mdd-zip-format.js](../js/webDAV/storage/mdd-zip-format.js): `mdlive/mdd`, `indb:IMAGE/...` 기반의 이전 저장 계층용 구현. 현재 `index.html`의 MDD 실행 경로에는 직접 연결되지 않음

포맷을 변경할 때는 문서만 수정하지 말고 `file_format.js`의 포맷 레지스트리, `extend-files.js`의 내보내기/가져오기, 호환성 테스트를 함께 갱신해야 한다.

## 16. 외부 앱 제작자를 위한 최종 권장사항

현재 MDpro를 대상으로 한다면 다음 프로필을 구현한다.

```text
Profile name: MDpro MDD Current Compatibility
Extension: .mdd
Encoding: UTF-8 JSON
format: mdlive/mdd
version: 1
Markdown image URL: indb:<ASCII-safe-id>
Image data: images[].base64, raw Base64 only
Required image metadata: id, name, mime
```

그리고 향후 MDpro의 이미지 재연결 문제가 수정되면 다음 표준 프로필을 추가한다.

```text
Profile name: MDpro MDD Canonical v1
format: mdviewer/mdd
version: 1
Markdown image URL: internal://<percent-encoded-id>
```

외부 앱의 출력 설정에 `MDpro 현재 호환`과 `MDpro 표준 v1`을 분리해 두면 MDpro 버전 변화에 대응하기 쉽다. 현시점에서 실제 사용자에게 배포할 기본값은 **`MDpro 현재 호환`**이어야 한다.
