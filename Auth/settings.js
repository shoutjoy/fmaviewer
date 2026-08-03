(function initializeFMAAuthSettings(global) {
    "use strict";

    const overrides = global.FMA_AUTH_SETTINGS || {};
    const defaults = {
        appName: "FMA Viewer",
        appMark: "FMA",
        storagePrefix: "fma_viewer",
        gasWebAppUrl: "https://script.google.com/macros/s/AKfycbxb89OH02WBeIljK-PY8-jqp6DYy31AnzqGh4U9DsPok2Zer6ccfFVXYsymXan5Gw5R/exec",
        deprecatedGasWebAppUrls: [
            "https://script.google.com/macros/s/AKfycbwEcIy_jOmwBh1996tIMf1sCHMIBazfdAJffSSD0pLDDDuzuhKmz-0rRBx9Pm48G9v8/exec",
            "https://script.google.com/macros/s/AKfycbylMbOHMhWgGrFZb00zkidmvGdtRg7qYQUfFSuKSiwW4Lj1j1H2An_bpRgPCbsRlRjM/exec",
            "https://script.google.com/macros/s/AKfycbzHuhxp5UjxXpdQVFDqK0QP70C6iddJrz0mTpfqNNPZUjcCj28NR7zJcpnc7EM-tj_A/exec"
        ],
        privacyPolicyUrl: "Auth/privacy_policy.html",
        privacyPolicyVersion: "2026-08-04-1",
        notificationRecipient: "shoutjoy1@yonsei.ac.kr",
        serverServiceName: "FMA Viewer verified email registration",
        serverVersion: "2026-08-04-password-login-1",
        passwordIterations: 600000,
        sessionTtlMs: 8 * 60 * 60 * 1000,
        registrationTimeoutMs: 60000,
        registrationRetryMs: 60 * 60 * 1000,
        verificationPollMs: 5000,
        verificationRetryMs: 30000
    };

    global.FMAAuthSettings = Object.freeze({ ...defaults, ...overrides });
})(window);
