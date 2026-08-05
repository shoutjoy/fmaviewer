(function initializeFMAAdminConfig(global) {
    "use strict";

    const authSettings = global.FMAAuthSettings || {};
    const storagePrefix = String(authSettings.storagePrefix || "fma_viewer");
    const STORAGE_KEY = `${storagePrefix}_admin_config_v4`;
    const LEGACY_STORAGE_KEYS = [
        `${storagePrefix}_admin_config_v3`,
        `${storagePrefix}_admin_config_v2`
    ];
    const HISTORY_KEY = `${storagePrefix}_admin_config_history_v1`;
    const DEFAULT_CONFIG = Object.freeze({
        gasWebAppUrl: String(authSettings.gasWebAppUrl || ""),
        spreadsheetUrl: String(authSettings.spreadsheetUrl || ""),
        appsScriptProjectUrl: String(authSettings.appsScriptProjectUrl || ""),
        checksPerDay: 1,
        blockedCheckMinutes: 5,
        updatedAt: ""
    });
    const DEPRECATED_GAS_WEB_APP_URLS = new Set(
        (Array.isArray(authSettings.deprecatedGasWebAppUrls) ? authSettings.deprecatedGasWebAppUrls : [])
            .map(value => String(value || "").trim().replace(/\/+$/, ""))
            .filter(Boolean)
    );

    function normalizeGasWebAppUrl(value) {
        const url = String(value || "").trim().replace(/\/+$/, "");
        if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/i.test(url)) {
            throw new Error("GAS 웹 앱의 /exec 주소를 정확히 입력해 주세요.");
        }
        return url;
    }

    function normalizeOptionalGasWebAppUrl(value) {
        const text = String(value || "").trim();
        return text ? normalizeGasWebAppUrl(text) : "";
    }

    function normalizeSpreadsheetUrl(value) {
        let url;
        try {
            url = new URL(String(value || "").trim());
        } catch (_) {
            throw new Error("Google Sheet 주소를 정확히 입력해 주세요.");
        }
        const match = url.pathname.match(/^\/spreadsheets(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)/i);
        if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !match) {
            throw new Error("https://docs.google.com/spreadsheets/d/... 형식의 Google Sheet 주소가 필요합니다.");
        }
        return url.toString();
    }

    function getSpreadsheetId(value) {
        const url = new URL(normalizeSpreadsheetUrl(value));
        const match = url.pathname.match(/^\/spreadsheets(?:\/u\/\d+)?\/d\/([A-Za-z0-9_-]+)/i);
        return match ? match[1] : "";
    }

    function applySpreadsheetIdToGasCode(source, spreadsheetUrl) {
        const spreadsheetId = getSpreadsheetId(spreadsheetUrl);
        const code = String(source || "");
        const spreadsheetIdDeclaration = /const\s+SPREADSHEET_ID\s*=\s*(['"])[^'"]*\1\s*;/;
        if (!spreadsheetIdDeclaration.test(code)) {
            throw new Error("Code.gs에서 SPREADSHEET_ID 설정을 찾지 못했습니다.");
        }
        return code.replace(spreadsheetIdDeclaration, `const SPREADSHEET_ID = '${spreadsheetId}';`);
    }

    function normalizeAppsScriptProjectUrl(value) {
        const text = String(value || "").trim();
        if (!text) return "";
        let url;
        try {
            url = new URL(text);
        } catch (_) {
            throw new Error("Apps Script 편집기 주소를 정확히 입력해 주세요.");
        }
        const projectPath = /^\/(?:u\/\d+\/)?home\/projects\/[A-Za-z0-9_-]+\/edit\/?$/i;
        const legacyPath = /^\/d\/[A-Za-z0-9_-]+\/edit\/?$/i;
        if (
            url.protocol !== "https:" ||
            url.hostname !== "script.google.com" ||
            (!projectPath.test(url.pathname) && !legacyPath.test(url.pathname))
        ) {
            throw new Error("script.google.com의 Apps Script 프로젝트 편집기 주소가 필요합니다.");
        }
        url.search = "";
        url.hash = "";
        return url.toString();
    }

    function normalizeChecksPerDay(value) {
        const count = Number(value);
        if (!Number.isInteger(count) || count < 1 || count > 24) {
            throw new Error("하루 점검 횟수는 1~24 사이의 정수여야 합니다.");
        }
        return count;
    }

    function normalizeBlockedCheckMinutes(value) {
        const minutes = Number(value);
        if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) {
            throw new Error("Blocked 감시 간격은 1~60분 사이의 정수여야 합니다.");
        }
        return minutes;
    }

    function normalizeConfig(value) {
        const candidate = value && typeof value === "object" ? value : {};
        const hasAppsScriptProjectUrl = Object.prototype.hasOwnProperty.call(candidate, "appsScriptProjectUrl");
        return {
            gasWebAppUrl: normalizeOptionalGasWebAppUrl(candidate.gasWebAppUrl || DEFAULT_CONFIG.gasWebAppUrl),
            spreadsheetUrl: normalizeSpreadsheetUrl(candidate.spreadsheetUrl || DEFAULT_CONFIG.spreadsheetUrl),
            appsScriptProjectUrl: normalizeAppsScriptProjectUrl(
                hasAppsScriptProjectUrl ? candidate.appsScriptProjectUrl : DEFAULT_CONFIG.appsScriptProjectUrl
            ),
            checksPerDay: normalizeChecksPerDay(candidate.checksPerDay || DEFAULT_CONFIG.checksPerDay),
            blockedCheckMinutes: normalizeBlockedCheckMinutes(
                candidate.blockedCheckMinutes || DEFAULT_CONFIG.blockedCheckMinutes
            ),
            updatedAt: String(candidate.updatedAt || "")
        };
    }

    function migrateDeprecatedGasWebAppUrl(config) {
        if (
            !DEPRECATED_GAS_WEB_APP_URLS.has(config.gasWebAppUrl) ||
            config.gasWebAppUrl === DEFAULT_CONFIG.gasWebAppUrl
        ) {
            return config;
        }

        return {
            ...config,
            gasWebAppUrl: DEFAULT_CONFIG.gasWebAppUrl,
            updatedAt: new Date().toISOString()
        };
    }

    function load() {
        try {
            const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
            const legacy = stored ? null : LEGACY_STORAGE_KEYS
                .map(key => JSON.parse(localStorage.getItem(key) || "null"))
                .find(Boolean);
            let loaded = normalizeConfig(stored || legacy || DEFAULT_CONFIG);
            if (!stored) {
                loaded.gasWebAppUrl = DEFAULT_CONFIG.gasWebAppUrl;
                if (legacy) localStorage.setItem(STORAGE_KEY, JSON.stringify(loaded));
            }
            const migrated = migrateDeprecatedGasWebAppUrl(loaded);
            if (migrated !== loaded) {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
                loaded = migrated;
            }
            return loaded;
        } catch (error) {
            console.warn("FMA admin configuration could not be loaded:", error);
            return { ...DEFAULT_CONFIG };
        }
    }

    function readHistory() {
        try {
            const stored = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
            return Array.isArray(stored) ? stored.slice(0, 50) : [];
        } catch (_) {
            return [];
        }
    }

    function save(value, options = {}) {
        const normalized = normalizeConfig({
            ...value,
            updatedAt: new Date().toISOString()
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));

        if (options.recordHistory !== false) {
            const history = readHistory();
            history.unshift({ ...normalized });
            localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)));
        }

        global.dispatchEvent(new CustomEvent("fma-admin-config-changed", {
            detail: normalized
        }));
        return normalized;
    }

    function reset() {
        return save(DEFAULT_CONFIG);
    }

    function clearHistory() {
        localStorage.removeItem(HISTORY_KEY);
    }

    function getSyncIntervalMs(config = load()) {
        return (24 * 60 * 60 * 1000) / normalizeChecksPerDay(config.checksPerDay);
    }

    function getBlockedCheckIntervalMs(config = load()) {
        return normalizeBlockedCheckMinutes(config.blockedCheckMinutes) * 60 * 1000;
    }

    function importFromLocation() {
        try {
            const params = new URLSearchParams(global.location.search);
            if (!params.has("fmaGasUrl") && !params.has("fmaChecks") && !params.has("fmaBlockMinutes")) return null;

            const current = load();
            const imported = save({
                gasWebAppUrl: params.get("fmaGasUrl") || current.gasWebAppUrl,
                spreadsheetUrl: current.spreadsheetUrl,
                appsScriptProjectUrl: current.appsScriptProjectUrl,
                checksPerDay: params.get("fmaChecks") || current.checksPerDay,
                blockedCheckMinutes: params.get("fmaBlockMinutes") || current.blockedCheckMinutes
            }, { recordHistory: false });

            params.delete("fmaGasUrl");
            params.delete("fmaChecks");
            params.delete("fmaBlockMinutes");
            const cleanSearch = params.toString();
            const cleanUrl = `${global.location.pathname}${cleanSearch ? `?${cleanSearch}` : ""}${global.location.hash}`;
            if (global.history?.replaceState) global.history.replaceState(null, "", cleanUrl);
            return imported;
        } catch (error) {
            console.warn("FMA admin configuration could not be imported from the URL:", error);
            return null;
        }
    }

    global.FMAAdminConfig = Object.freeze({
        STORAGE_KEY,
        HISTORY_KEY,
        DEFAULT_CONFIG,
        load,
        save,
        reset,
        readHistory,
        clearHistory,
        normalizeGasWebAppUrl,
        normalizeSpreadsheetUrl,
        getSpreadsheetId,
        applySpreadsheetIdToGasCode,
        normalizeAppsScriptProjectUrl,
        normalizeChecksPerDay,
        normalizeBlockedCheckMinutes,
        getSyncIntervalMs,
        getBlockedCheckIntervalMs,
        importFromLocation
    });

    importFromLocation();
})(window);
