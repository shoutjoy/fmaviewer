(function initializeFMAAuthSettings(global) {
    "use strict";

    const overrides = global.FMA_AUTH_SETTINGS || {};
    const defaults = {
        appName: "FMA Viewer",
        appMark: "FMA",
        storagePrefix: "fma_viewer",
        gasWebAppUrl: "https://script.google.com/macros/s/AKfycbwEcIy_jOmwBh1996tIMf1sCHMIBazfdAJffSSD0pLDDDuzuhKmz-0rRBx9Pm48G9v8/exec",
        privacyPolicyUrl: "Auth/privacy_policy.html",
        privacyPolicyVersion: "2026-08-02",
        notificationRecipient: "shoutjoy1@yonsei.ac.kr",
        serverServiceName: "FMA Viewer verified email registration",
        serverVersion: "2026-08-02-email-verify-3",
        registrationTimeoutMs: 60000,
        registrationRetryMs: 60 * 60 * 1000,
        verificationPollMs: 5000,
        verificationRetryMs: 30000
    };

    global.FMAAuthSettings = Object.freeze({ ...defaults, ...overrides });
})(window);
