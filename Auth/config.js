(function initializeFMAAdminConfig(global) {
    "use strict";

    const authSettings = global.FMAAuthSettings || {};
    const storagePrefix = String(authSettings.storagePrefix || "fma_viewer");
    const STORAGE_KEY = `${storagePrefix}_admin_config_v2`;
    const LEGACY_STORAGE_KEY = `${storagePrefix}_admin_config_v1`;
    const HISTORY_KEY = `${storagePrefix}_admin_config_history_v1`;
    const DEFAULT_CONFIG = Object.freeze({
        gasWebAppUrl: String(authSettings.gasWebAppUrl || ""),
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
        return {
            gasWebAppUrl: normalizeGasWebAppUrl(candidate.gasWebAppUrl || DEFAULT_CONFIG.gasWebAppUrl),
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
            const legacy = stored ? null : JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY) || "null");
            let loaded = normalizeConfig(stored || legacy || DEFAULT_CONFIG);
            if (!stored) {
                loaded.gasWebAppUrl = DEFAULT_CONFIG.gasWebAppUrl;
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
        normalizeChecksPerDay,
        normalizeBlockedCheckMinutes,
        getSyncIntervalMs,
        getBlockedCheckIntervalMs,
        importFromLocation
    });

    importFromLocation();
})(window);
