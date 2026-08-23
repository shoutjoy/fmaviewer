(function configureFMAAuthenticationMode(global) {
    "use strict";

    // deployment-mode.js가 배포할 버전의 기본 인증 상태를 지정합니다.
    const configuredDefaultMode = String(global.FMA_AUTH_DEFAULT_MODE || "on").toLowerCase();
    const DEFAULT_MODE = configuredDefaultMode === "off" ? "off" : "on";
    const STORAGE_KEY = "fma_developer_auth_mode_v1";
    const MODES = Object.freeze({ on: true, off: false });

    function isLocalDevelopment() {
        const protocol = String(global.location?.protocol || "").toLowerCase();
        const hostname = String(global.location?.hostname || "").toLowerCase();
        return protocol === "file:" || hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
    }

    let mode = Object.prototype.hasOwnProperty.call(MODES, DEFAULT_MODE) ? DEFAULT_MODE : "on";
    let source = "default";

    // AuthSwitch.html의 선택은 로컬 개발 환경에서만 적용합니다.
    // 공개 호스트에서는 소스 코드의 DEFAULT_MODE만 사용하므로 외부 사용자가 인증을 끌 수 없습니다.
    if (isLocalDevelopment()) {
        try {
            const savedMode = String(global.localStorage.getItem(STORAGE_KEY) || "").toLowerCase();
            if (Object.prototype.hasOwnProperty.call(MODES, savedMode)) {
                mode = savedMode;
                source = "developer-switch";
            }
        } catch (_) {
            // file:// 보안 정책 등으로 저장소를 읽을 수 없으면 안전한 기본값을 유지합니다.
        }
    }

    global.FMAAuthMode = Object.freeze({
        mode,
        enabled: MODES[mode],
        source,
        defaultMode: DEFAULT_MODE,
        storageKey: STORAGE_KEY,
        localDevelopment: isLocalDevelopment()
    });
})(window);
