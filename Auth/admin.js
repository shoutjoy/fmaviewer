(function initializeAdminSettings() {
    "use strict";

    const configApi = window.FMAAdminConfig;
    if (!configApi) throw new Error("FMAAdminConfig is not available.");
    const appName = String(window.FMAAuthSettings?.appName || "FMA Viewer");

    document.title = `${appName} 관리자 설정`;
    const description = document.getElementById("adminDescription");
    if (description) description.content = `${appName} Google Sheet, Apps Script, GAS 배포 URL과 점검 주기를 설정합니다.`;
    const eyebrow = document.getElementById("adminAppEyebrow");
    if (eyebrow) eyebrow.textContent = appName.toUpperCase();
    const appNameText = document.getElementById("adminAppName");
    if (appNameText) appNameText.textContent = appName;

    const form = document.getElementById("adminSettingsForm");
    const urlInput = document.getElementById("gasWebAppUrl");
    const spreadsheetInput = document.getElementById("spreadsheetUrl");
    const appsScriptProjectInput = document.getElementById("appsScriptProjectUrl");
    const checksInput = document.getElementById("checksPerDay");
    const blockedCheckInput = document.getElementById("blockedCheckMinutes");
    const intervalText = document.getElementById("syncIntervalText");
    const blockedIntervalText = document.getElementById("blockedIntervalText");
    const status = document.getElementById("adminStatus");
    const healthResult = document.getElementById("healthResult");
    const historyRows = document.getElementById("historyRows");
    const emptyHistory = document.getElementById("emptyHistory");
    const savedAtBadge = document.getElementById("savedAtBadge");
    const testButton = document.getElementById("testConnectionButton");
    const applyDeploymentToAppButton = document.getElementById("applyDeploymentToAppButton");
    const openAppLink = document.getElementById("openAppLink");
    const openSpreadsheetHeaderLink = document.getElementById("openSpreadsheetHeaderLink");
    const openAppsScriptHeaderLink = document.getElementById("openAppsScriptHeaderLink");
    const openSpreadsheetButton = document.getElementById("openSpreadsheetButton");
    const openAppsScriptButton = document.getElementById("openAppsScriptButton");
    const spreadsheetIdValue = document.getElementById("spreadsheetIdValue");
    const expectedServerVersion = String(window.FMAAuthSettings?.serverVersion || "");
    const expectedConnectionVersion = document.getElementById("expectedConnectionVersion");
    const connectionVersionBadge = document.getElementById("connectionVersionBadge");
    const gasCodePreview = document.getElementById("gasCodePreview");
    const gasCodeStatus = document.getElementById("gasCodeStatus");
    const gasCodeVersionBadge = document.getElementById("gasCodeVersionBadge");
    const gasCodeSourceLabel = document.getElementById("gasCodeSourceLabel");
    const copyGasCodeButton = document.getElementById("copyGasCodeButton");
    const copyAndOpenAppsScriptButton = document.getElementById("copyAndOpenAppsScriptButton");
    const reloadGasCodeButton = document.getElementById("reloadGasCodeButton");
    const gasCodeFileInput = document.getElementById("gasCodeFileInput");
    const openGasCodeLink = document.getElementById("openGasCodeLink");
    let gasCodeTemplateSource = "";
    openAppLink.textContent = `${appName}에 현재 설정 적용`;

    function formatDateTime(value) {
        if (!value) return "기본값 사용 중";
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return "저장 시각 확인 불가";
        return new Intl.DateTimeFormat("ko-KR", {
            dateStyle: "medium",
            timeStyle: "medium"
        }).format(date);
    }

    function formatInterval(checksPerDay) {
        const hours = 24 / checksPerDay;
        if (Number.isInteger(hours)) return `${hours}시간마다`;
        const totalMinutes = Math.round(hours * 60);
        const wholeHours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        return wholeHours ? `${wholeHours}시간 ${minutes}분마다` : `${minutes}분마다`;
    }

    function setStatus(message, tone = "success") {
        status.textContent = message;
        status.dataset.tone = tone;
        status.hidden = !message;
    }

    function setGasCodeStatus(message, tone = "success") {
        gasCodeStatus.textContent = message;
        gasCodeStatus.dataset.tone = tone;
        gasCodeStatus.hidden = !message;
    }

    function setConnectionVersion(message, tone = "neutral") {
        connectionVersionBadge.textContent = message;
        connectionVersionBadge.dataset.tone = tone;
    }

    function readGasCodeVersion(source) {
        const match = String(source || "").match(/const\s+SERVER_VERSION\s*=\s*['"]([^'"]+)['"]/);
        return match ? match[1] : "";
    }

    function normalizeGasCodeSource(source) {
        const normalized = String(source || "")
            .replace(/^\uFEFF/, "")
            .replace(/\r\n?/g, "\n")
            .trim();
        if (
            normalized.length < 1000 ||
            !/function\s+doPost\s*\(/.test(normalized) ||
            !/function\s+doGet\s*\(/.test(normalized) ||
            !/const\s+SERVER_VERSION\s*=/.test(normalized) ||
            /^\s*<!doctype\s+html/i.test(normalized)
        ) {
            throw new Error("선택한 파일이 올바른 FMA Viewer Code.gs 원문이 아닙니다.");
        }
        return normalized + "\n";
    }

    function setResourceLink(link, url) {
        if (url) {
            link.href = url;
            link.removeAttribute("aria-disabled");
            link.removeAttribute("tabindex");
            return;
        }
        link.removeAttribute("href");
        link.setAttribute("aria-disabled", "true");
        link.setAttribute("tabindex", "-1");
    }

    function updateResourceLinks(config) {
        const spreadsheetUrl = configApi.normalizeSpreadsheetUrl(config.spreadsheetUrl);
        const appsScriptUrl = configApi.normalizeAppsScriptProjectUrl(config.appsScriptProjectUrl);
        setResourceLink(openSpreadsheetHeaderLink, spreadsheetUrl);
        setResourceLink(openSpreadsheetButton, spreadsheetUrl);
        setResourceLink(openAppsScriptHeaderLink, appsScriptUrl);
        setResourceLink(openAppsScriptButton, appsScriptUrl);
        spreadsheetIdValue.textContent = configApi.getSpreadsheetId(spreadsheetUrl);
    }

    function updateSpreadsheetPreview() {
        try {
            const spreadsheetUrl = configApi.normalizeSpreadsheetUrl(spreadsheetInput.value);
            setResourceLink(openSpreadsheetHeaderLink, spreadsheetUrl);
            setResourceLink(openSpreadsheetButton, spreadsheetUrl);
            spreadsheetIdValue.textContent = configApi.getSpreadsheetId(spreadsheetUrl);
        } catch (_) {
            setResourceLink(openSpreadsheetHeaderLink, "");
            setResourceLink(openSpreadsheetButton, "");
        }
        refreshConfiguredGasCode();
    }

    function updateAppsScriptPreview() {
        try {
            const projectUrl = configApi.normalizeAppsScriptProjectUrl(appsScriptProjectInput.value);
            setResourceLink(openAppsScriptHeaderLink, projectUrl);
            setResourceLink(openAppsScriptButton, projectUrl);
        } catch (_) {
            setResourceLink(openAppsScriptHeaderLink, "");
            setResourceLink(openAppsScriptButton, "");
        }
    }

    function refreshConfiguredGasCode() {
        if (!gasCodeTemplateSource) return false;
        try {
            gasCodePreview.value = configApi.applySpreadsheetIdToGasCode(
                gasCodeTemplateSource,
                spreadsheetInput.value
            );
            spreadsheetIdValue.textContent = configApi.getSpreadsheetId(spreadsheetInput.value);
            copyGasCodeButton.disabled = false;
            copyAndOpenAppsScriptButton.disabled = false;
            return true;
        } catch (error) {
            gasCodePreview.value = gasCodeTemplateSource;
            copyGasCodeButton.disabled = true;
            copyAndOpenAppsScriptButton.disabled = true;
            spreadsheetIdValue.textContent = "유효한 Google Sheet 주소가 필요합니다.";
            setGasCodeStatus(String(error?.message || error), "error");
            return false;
        }
    }

    function applyGasCodeSource(source, sourceLabel) {
        const normalized = normalizeGasCodeSource(source);
        const sourceVersion = readGasCodeVersion(normalized);
        gasCodeTemplateSource = normalized;
        const configured = refreshConfiguredGasCode();
        gasCodeSourceLabel.textContent = sourceLabel;
        gasCodeVersionBadge.textContent = sourceVersion
            ? `Code.gs · ${sourceVersion}`
            : "Code.gs · 버전 확인 불가";

        if (!configured) return;

        if (!sourceVersion) {
            setGasCodeStatus("코드를 불러왔지만 SERVER_VERSION을 확인하지 못했습니다.", "error");
        } else if (sourceVersion !== expectedServerVersion) {
            setGasCodeStatus(
                `불러온 코드 버전(${sourceVersion})과 앱이 요구하는 버전(${expectedServerVersion})이 다릅니다. 최신 파일인지 확인해 주세요.`,
                "error"
            );
        } else {
            const lineCount = normalized.split("\n").length - 1;
            const spreadsheetId = configApi.getSpreadsheetId(spreadsheetInput.value);
            setGasCodeStatus(
                `최신 Code.gs ${lineCount.toLocaleString("ko-KR")}줄을 불러왔습니다. 저장된 Sheet ID(${spreadsheetId})가 복사본에 자동 반영됩니다.`,
                "success"
            );
        }
    }

    async function loadGasCode() {
        const sourceUrl = new URL("gas/Code.gs", location.href);
        const requestUrl = new URL(sourceUrl.href);
        requestUrl.searchParams.set("_", String(Date.now()));
        openGasCodeLink.href = sourceUrl.href;
        reloadGasCodeButton.disabled = true;
        reloadGasCodeButton.textContent = "코드 불러오는 중...";
        gasCodeSourceLabel.textContent = sourceUrl.href;
        setGasCodeStatus("최신 Code.gs 원문을 확인하고 있습니다…", "success");

        try {
            const response = await fetch(requestUrl.toString(), { cache: "no-store" });
            if (!response.ok) throw new Error(`Code.gs HTTP ${response.status}`);
            applyGasCodeSource(await response.text(), sourceUrl.href);
        } catch (error) {
            if (!gasCodePreview.value || /불러오는 중/.test(gasCodePreview.value)) {
                gasCodeTemplateSource = "";
                gasCodePreview.value = "";
                copyGasCodeButton.disabled = true;
                copyAndOpenAppsScriptButton.disabled = true;
            }
            const localHint = location.protocol === "file:"
                ? " 브라우저의 로컬 파일 보안 제한일 수 있으므로 ‘로컬 Code.gs 선택’을 이용해 주세요."
                : " Code.gs가 정적 배포에 포함되어 있는지 확인해 주세요.";
            setGasCodeStatus(`Code.gs를 자동으로 불러오지 못했습니다. (${error?.message || error})${localHint}`, "error");
        } finally {
            reloadGasCodeButton.disabled = false;
            reloadGasCodeButton.textContent = "최신 코드 다시 불러오기";
        }
    }

    function copyGasCodeFallback() {
        const selectionStart = gasCodePreview.selectionStart;
        const selectionEnd = gasCodePreview.selectionEnd;
        gasCodePreview.focus();
        gasCodePreview.select();
        const copied = document.execCommand("copy");
        gasCodePreview.setSelectionRange(selectionStart, selectionEnd);
        if (!copied) throw new Error("브라우저가 복사 명령을 허용하지 않았습니다.");
    }

    async function copyGasCode(successMessage = "Code.gs 전체를 클립보드에 복사했습니다. Apps Script 편집기에 붙여넣으세요.") {
        const source = String(gasCodePreview.value || "");
        if (!source) {
            setGasCodeStatus("먼저 Code.gs를 불러와 주세요.", "error");
            return false;
        }

        copyGasCodeButton.disabled = true;
        copyGasCodeButton.textContent = "복사 중...";
        try {
            if (navigator.clipboard?.writeText && window.isSecureContext) {
                await navigator.clipboard.writeText(source);
            } else {
                copyGasCodeFallback();
            }
            setGasCodeStatus(successMessage, "success");
            copyGasCodeButton.textContent = "복사 완료 ✓";
            setTimeout(() => {
                copyGasCodeButton.textContent = "Code.gs 전체 복사";
            }, 1800);
            return true;
        } catch (error) {
            setGasCodeStatus(`자동 복사에 실패했습니다. 코드 상자를 클릭해 Ctrl+A, Ctrl+C로 복사해 주세요. (${error?.message || error})`, "error");
            copyGasCodeButton.textContent = "Code.gs 전체 복사";
            return false;
        } finally {
            copyGasCodeButton.disabled = false;
        }
    }

    async function copyGasCodeAndOpenAppsScript() {
        const originalLabel = copyAndOpenAppsScriptButton.textContent;
        try {
            const saved = saveFormConfig();
            if (!refreshConfiguredGasCode()) return;

            const opensProjectDirectly = Boolean(saved.appsScriptProjectUrl);
            const targetUrl = saved.appsScriptProjectUrl || saved.spreadsheetUrl;
            copyAndOpenAppsScriptButton.disabled = true;
            copyAndOpenAppsScriptButton.textContent = "복사하고 여는 중...";
            window.open(targetUrl, "_blank", "noopener,noreferrer");

            const message = opensProjectDirectly
                ? "Sheet ID를 반영한 Code.gs를 복사하고 저장된 Apps Script 편집기를 열었습니다. 기존 코드를 교체해 주세요."
                : "Sheet ID를 반영한 Code.gs를 복사하고 Google Sheet를 열었습니다. 상단의 확장 프로그램 → Apps Script를 선택하세요.";
            const copied = await copyGasCode(message);
            if (copied) copyAndOpenAppsScriptButton.textContent = "복사 및 열기 완료 ✓";
        } catch (error) {
            setGasCodeStatus(String(error?.message || error), "error");
        } finally {
            setTimeout(() => {
                copyAndOpenAppsScriptButton.textContent = originalLabel;
                try {
                    configApi.getSpreadsheetId(spreadsheetInput.value);
                    copyAndOpenAppsScriptButton.disabled = !gasCodeTemplateSource;
                } catch (_) {
                    copyAndOpenAppsScriptButton.disabled = true;
                }
            }, 1800);
        }
    }

    function readFormConfig() {
        return {
            gasWebAppUrl: configApi.normalizeGasWebAppUrl(urlInput.value),
            spreadsheetUrl: configApi.normalizeSpreadsheetUrl(spreadsheetInput.value),
            appsScriptProjectUrl: configApi.normalizeAppsScriptProjectUrl(appsScriptProjectInput.value),
            checksPerDay: configApi.normalizeChecksPerDay(checksInput.value),
            blockedCheckMinutes: configApi.normalizeBlockedCheckMinutes(blockedCheckInput.value)
        };
    }

    function renderInterval() {
        try {
            intervalText.textContent = formatInterval(configApi.normalizeChecksPerDay(checksInput.value));
        } catch (_) {
            intervalText.textContent = "1~24회를 입력하세요";
        }

        try {
            const minutes = configApi.normalizeBlockedCheckMinutes(blockedCheckInput.value);
            blockedIntervalText.textContent = `최대 약 ${minutes}분`;
        } catch (_) {
            blockedIntervalText.textContent = "1~60분을 입력하세요";
        }
    }

    function createAppUrl(config) {
        const appUrl = new URL("../index.html", location.href);
        appUrl.searchParams.set("fmaGasUrl", config.gasWebAppUrl);
        appUrl.searchParams.set("fmaChecks", String(config.checksPerDay));
        appUrl.searchParams.set("fmaBlockMinutes", String(config.blockedCheckMinutes));
        return appUrl;
    }

    function updateAppLink(config) {
        const appUrl = createAppUrl(config);
        openAppLink.href = appUrl.href;
        return appUrl;
    }

    function saveFormConfig() {
        const saved = configApi.save(readFormConfig());
        renderConfig(saved);
        renderHistory();
        return saved;
    }

    function applyDeploymentToApp() {
        try {
            const saved = saveFormConfig();
            const appUrl = createAppUrl(saved);
            setStatus(`Google Sheet와 GAS 설정을 저장했습니다. ${appName}에 배포 설정을 전달합니다…`, "success");
            window.location.assign(appUrl.href);
        } catch (error) {
            setStatus(String(error?.message || error), "error");
        }
    }

    function renderConfig(config = configApi.load()) {
        urlInput.value = config.gasWebAppUrl;
        spreadsheetInput.value = config.spreadsheetUrl;
        appsScriptProjectInput.value = config.appsScriptProjectUrl;
        checksInput.value = String(config.checksPerDay);
        blockedCheckInput.value = String(config.blockedCheckMinutes);
        savedAtBadge.textContent = config.updatedAt
            ? `마지막 저장 ${formatDateTime(config.updatedAt)}`
            : "기본값 사용 중";
        renderInterval();
        updateAppLink(config);
        updateResourceLinks(config);
        refreshConfiguredGasCode();
    }

    function renderHistory() {
        const history = configApi.readHistory();
        historyRows.replaceChildren();
        emptyHistory.hidden = history.length > 0;

        history.forEach(entry => {
            const row = document.createElement("tr");
            const savedAtCell = document.createElement("td");
            const checksCell = document.createElement("td");
            const blockedCheckCell = document.createElement("td");
            const spreadsheetCell = document.createElement("td");
            const urlCell = document.createElement("td");

            savedAtCell.textContent = formatDateTime(entry.updatedAt);
            checksCell.textContent = `${entry.checksPerDay}회 (${formatInterval(entry.checksPerDay)})`;
            blockedCheckCell.textContent = `${entry.blockedCheckMinutes || configApi.DEFAULT_CONFIG.blockedCheckMinutes}분`;
            spreadsheetCell.textContent = entry.spreadsheetUrl || configApi.DEFAULT_CONFIG.spreadsheetUrl;
            spreadsheetCell.title = spreadsheetCell.textContent;
            urlCell.textContent = entry.gasWebAppUrl;
            urlCell.title = entry.gasWebAppUrl;
            row.append(savedAtCell, checksCell, blockedCheckCell, spreadsheetCell, urlCell);
            historyRows.append(row);
        });
    }

    async function testConnection() {
        let testUrl;
        try {
            testUrl = new URL(configApi.normalizeGasWebAppUrl(urlInput.value));
        } catch (error) {
            setStatus(error.message, "error");
            return;
        }

        testUrl.searchParams.set("action", "health");
        testUrl.searchParams.set("_", String(Date.now()));
        const controller = new AbortController();
        const timeoutMs = Math.min(Number(window.FMAAuthSettings?.registrationTimeoutMs) || 20000, 20000);
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        testButton.disabled = true;
        testButton.textContent = "연결·버전 확인 중...";
        healthResult.hidden = true;
        setConnectionVersion("연결 확인 중…", "neutral");
        setStatus("GAS 서버 응답을 기다리고 있습니다…", "success");

        try {
            const response = await fetch(testUrl.toString(), {
                method: "GET",
                cache: "no-store",
                signal: controller.signal
            });
            const text = await response.text();
            const contentType = response.headers.get("content-type") || "";
            if (response.redirected && /accounts\.google\.com/i.test(response.url || "")) {
                throw new Error("GAS가 Google 로그인을 요구합니다. 액세스 권한을 '모든 사용자'로 재배포하세요.");
            }
            if (/text\/html/i.test(contentType) || /^\s*<!doctype html/i.test(text)) {
                throw new Error("JSON 대신 HTML이 반환되었습니다. 배포 URL과 공개 권한을 확인하세요.");
            }

            let payload;
            try {
                payload = JSON.parse(text);
            } catch (_) {
                throw new Error("서버가 올바른 JSON을 반환하지 않았습니다.");
            }
            healthResult.textContent = JSON.stringify(payload, null, 2);
            healthResult.hidden = false;
            const expectedService = String(window.FMAAuthSettings?.serverServiceName || "FMA Viewer verified email registration");
            if (String(payload?.service || "") !== expectedService) {
                setConnectionVersion("인증 서버 확인 실패", "error");
                throw new Error("현재 배포 URL은 이메일 인증 기능이 없는 이전 GAS 버전입니다. 새 Code.gs로 재배포하세요.");
            }
            const actualVersion = String(payload?.version || "버전 없음");
            if (actualVersion !== expectedServerVersion) {
                setConnectionVersion(`불일치 · 서버 ${actualVersion}`, "error");
                throw new Error(`서버 버전(${actualVersion})과 앱 요구 버전(${expectedServerVersion})이 다릅니다. 최신 Code.gs를 저장한 뒤 새 버전으로 다시 배포하세요.`);
            }
            if (!response.ok || payload?.success !== true || String(payload?.status || "").toUpperCase() !== "OK") {
                setConnectionVersion(`응답 오류 · ${actualVersion}`, "error");
                throw new Error(payload?.message || `GAS HTTP ${response.status}`);
            }

            setConnectionVersion(`정상 · ${actualVersion}`, "success");
            setStatus(`서버 연결과 버전이 모두 정상입니다. (${actualVersion}) 이 URL을 저장할 수 있습니다.`, "success");
        } catch (error) {
            const message = error?.name === "AbortError"
                ? `서버가 ${Math.round(timeoutMs / 1000)}초 안에 응답하지 않았습니다.`
                : String(error?.message || error);
            if (connectionVersionBadge.dataset.tone !== "error") {
                setConnectionVersion("연결 실패", "error");
            }
            setStatus(message, "error");
        } finally {
            clearTimeout(timeoutId);
            testButton.disabled = false;
            testButton.textContent = "연결 및 버전 점검";
        }
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        try {
            saveFormConfig();
            setStatus(`Google Sheet, Apps Script와 배포 설정을 저장했습니다.`, "success");
        } catch (error) {
            setStatus(String(error?.message || error), "error");
        }
    });

    checksInput.addEventListener("input", renderInterval);
    blockedCheckInput.addEventListener("input", renderInterval);
    spreadsheetInput.addEventListener("input", updateSpreadsheetPreview);
    appsScriptProjectInput.addEventListener("input", updateAppsScriptPreview);
    urlInput.addEventListener("input", () => {
        setConnectionVersion("다시 점검 필요", "neutral");
        try {
            updateAppLink(readFormConfig());
        } catch (_) {}
    });
    checksInput.addEventListener("input", () => {
        try {
            updateAppLink(readFormConfig());
        } catch (_) {}
    });
    blockedCheckInput.addEventListener("input", () => {
        try {
            updateAppLink(readFormConfig());
        } catch (_) {}
    });
    testButton.addEventListener("click", testConnection);
    applyDeploymentToAppButton.addEventListener("click", applyDeploymentToApp);
    copyGasCodeButton.addEventListener("click", () => void copyGasCode());
    copyAndOpenAppsScriptButton.addEventListener("click", copyGasCodeAndOpenAppsScript);
    reloadGasCodeButton.addEventListener("click", loadGasCode);
    gasCodeFileInput.addEventListener("change", async event => {
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        try {
            applyGasCodeSource(await file.text(), `로컬 파일 · ${file.name}`);
        } catch (error) {
            setGasCodeStatus(String(error?.message || error), "error");
        } finally {
            event.currentTarget.value = "";
        }
    });

    document.getElementById("resetSettingsButton").addEventListener("click", () => {
        if (!confirm("Google Sheet, Apps Script, 배포 URL과 점검 주기를 기본값으로 복원할까요?")) return;
        const reset = configApi.reset();
        renderConfig(reset);
        renderHistory();
        setStatus("기본 설정으로 복원했습니다.", "success");
    });

    document.getElementById("clearHistoryButton").addEventListener("click", () => {
        if (!confirm("이 브라우저에 저장된 설정 변경 이력을 지울까요?")) return;
        configApi.clearHistory();
        renderHistory();
        setStatus("설정 변경 이력을 지웠습니다.", "success");
    });

    window.addEventListener("storage", event => {
        if (event.key === configApi.STORAGE_KEY) renderConfig();
        if (event.key === configApi.HISTORY_KEY) renderHistory();
    });

    const originValue = document.getElementById("originValue");
    originValue.textContent = location.protocol === "file:"
        ? `로컬 파일 · ${decodeURIComponent(location.pathname)}`
        : location.origin;
    expectedConnectionVersion.textContent = expectedServerVersion;
    renderConfig();
    renderHistory();
    void loadGasCode();
})();
