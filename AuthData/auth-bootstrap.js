(function bootstrapFMAAuthentication(global, document) {
    "use strict";

    const authMode = global.FMAAuthMode;
    const enabled = authMode?.enabled !== false;
    document.documentElement.dataset.authMode = enabled ? "on" : "off";

    if (!enabled) {
        // OFF 모드에서는 인증 UI와 클라이언트를 전혀 로드하지 않으므로
        // 로그인 잠금, 세션 검사, GAS 인증 서버 요청이 발생하지 않습니다.
        global.FMAAuthSettingsReady = Promise.resolve(Object.freeze({ enabled: false }));
        return;
    }

    // 이 파일은 index.html의 </body> 직전에 동기식으로 실행됩니다.
    // document.write를 사용해 기존과 같은 순서로 인증 파일을 로드합니다.
    const scripts = [
        "Auth/gas/version.generated.js?v=20260805-15",
        "Auth/settings.js?v=20260805-15",
        "Auth/config.js?v=20260805-15",
        "Auth/modal.js?v=20260804-7",
        "Auth/client.js?v=20260805-15"
    ];

    scripts.forEach(source => {
        document.write(`<script src="${source}"><\/script>`);
    });
})(window, document);
