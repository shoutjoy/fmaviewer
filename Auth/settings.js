(function initializeFMAAuthSettings(global) {
    "use strict";

    const overrides = global.FMA_AUTH_SETTINGS || {};
    const generatedCodeVersion = String(global.FMA_CODE_GS_VERSION || "");
    const defaults = {
        appName: "FMA Viewer",
        appMark: "FMA",
        storagePrefix: "fma_viewer",
        // One public deployment is the canonical endpoint for both the admin gate
        // and the user login. Admin config may override it in this browser, but a
        // fresh browser must never start without an authentication server.
        gasWebAppUrl: "https://script.google.com/macros/s/AKfycbxb89OH02WBeIljK-PY8-jqp6DYy31AnzqGh4U9DsPok2Zer6ccfFVXYsymXan5Gw5R/exec",
        spreadsheetUrl: "https://docs.google.com/spreadsheets/d/1xNA955JIwe5cHETAMMMaCEfb1QtZnbuc9tKbEDQ573w/edit?gid=2013460554#gid=2013460554",
        appsScriptProjectUrl: "https://script.google.com/u/0/home/projects/1uhzkAW5vS8kqRVG761QgQ_ft0yw7ujXpGGXm4lX-l9SGlcmGCAdb5zRB/edit",
        privacyPolicyUrl: "Auth/privacy_policy.html",
        privacyPolicyVersion: "2026-08-04-1",
        notificationRecipient: "shoutjoy1@yonsei.ac.kr",
        serverServiceName: "FMA Viewer verified email registration",
        serverVersion: generatedCodeVersion,
        serverVersionSourceUrl: "",
        serverVersionError: "",
        passwordIterations: 600000,
        sessionTtlMs: 8 * 60 * 60 * 1000,
        registrationTimeoutMs: 60000,
        registrationRetryMs: 60 * 60 * 1000,
        verificationPollMs: 5000,
        verificationRetryMs: 30000
    };

    const settings = {
        ...defaults,
        ...overrides,
        serverVersion: generatedCodeVersion,
        serverVersionError: ""
    };
    global.FMAAuthSettings = settings;

    function getCodeSourceUrl() {
        const settingsScriptUrl = global.document?.currentScript?.src || global.location?.href || "";
        if (!settingsScriptUrl) throw new Error("settings.js의 위치를 확인할 수 없습니다.");
        return new URL("gas/Code.gs", settingsScriptUrl).toString();
    }

    function readServerVersion(source) {
        const match = String(source || "").match(/const\s+SERVER_VERSION\s*=\s*['"]([^'"]+)['"]/);
        if (!match) throw new Error("Auth/gas/Code.gs에서 SERVER_VERSION을 찾지 못했습니다.");
        return match[1].normalize("NFKC").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();
    }

    global.FMAAuthSettingsReady = (async () => {
        try {
            const sourceUrl = getCodeSourceUrl();
            const requestUrl = new URL(sourceUrl);
            requestUrl.searchParams.set("_", String(Date.now()));
            const response = await fetch(requestUrl.toString(), { cache: "no-store" });
            if (!response.ok) throw new Error(`Auth/gas/Code.gs HTTP ${response.status}`);
            settings.serverVersion = readServerVersion(await response.text());
            settings.serverVersionSourceUrl = sourceUrl;
        } catch (error) {
            if (generatedCodeVersion) {
                settings.serverVersion = generatedCodeVersion;
                settings.serverVersionSourceUrl = "Auth/gas/version.generated.js";
                settings.serverVersionError = "";
                console.warn("FMA Code.gs source could not be fetched; generated version fallback is in use:", error);
            } else {
                settings.serverVersion = "";
                settings.serverVersionError = String(error?.message || error);
                console.error("FMA Code.gs version could not be loaded:", error);
            }
        }
        return Object.freeze(settings);
    })();
})(window);
