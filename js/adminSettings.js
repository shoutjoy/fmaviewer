(function initializeAdminSettings() {
    "use strict";

    const configApi = window.FMAAdminConfig;
    if (!configApi) throw new Error("FMAAdminConfig is not available.");

    const form = document.getElementById("adminSettingsForm");
    const urlInput = document.getElementById("gasWebAppUrl");
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
    const openAppLink = document.getElementById("openAppLink");

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

    function readFormConfig() {
        return {
            gasWebAppUrl: configApi.normalizeGasWebAppUrl(urlInput.value),
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

    function updateAppLink(config) {
        const appUrl = new URL("index.html", location.href);
        appUrl.searchParams.set("fmaGasUrl", config.gasWebAppUrl);
        appUrl.searchParams.set("fmaChecks", String(config.checksPerDay));
        appUrl.searchParams.set("fmaBlockMinutes", String(config.blockedCheckMinutes));
        openAppLink.href = appUrl.href;
    }

    function renderConfig(config = configApi.load()) {
        urlInput.value = config.gasWebAppUrl;
        checksInput.value = String(config.checksPerDay);
        blockedCheckInput.value = String(config.blockedCheckMinutes);
        savedAtBadge.textContent = config.updatedAt
            ? `마지막 저장 ${formatDateTime(config.updatedAt)}`
            : "기본값 사용 중";
        renderInterval();
        updateAppLink(config);
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
            const urlCell = document.createElement("td");

            savedAtCell.textContent = formatDateTime(entry.updatedAt);
            checksCell.textContent = `${entry.checksPerDay}회 (${formatInterval(entry.checksPerDay)})`;
            blockedCheckCell.textContent = `${entry.blockedCheckMinutes || configApi.DEFAULT_CONFIG.blockedCheckMinutes}분`;
            urlCell.textContent = entry.gasWebAppUrl;
            urlCell.title = entry.gasWebAppUrl;
            row.append(savedAtCell, checksCell, blockedCheckCell, urlCell);
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
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        testButton.disabled = true;
        testButton.textContent = "연결 확인 중...";
        healthResult.hidden = true;
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
            if (!response.ok || payload?.success !== true || String(payload?.status || "").toUpperCase() !== "OK") {
                throw new Error(payload?.message || `GAS HTTP ${response.status}`);
            }

            healthResult.textContent = JSON.stringify(payload, null, 2);
            healthResult.hidden = false;
            setStatus("서버 연결이 정상입니다. 이 URL을 저장할 수 있습니다.", "success");
        } catch (error) {
            const message = error?.name === "AbortError"
                ? "서버가 60초 안에 응답하지 않았습니다."
                : String(error?.message || error);
            setStatus(message, "error");
        } finally {
            clearTimeout(timeoutId);
            testButton.disabled = false;
            testButton.textContent = "서버 연결 테스트";
        }
    }

    form.addEventListener("submit", event => {
        event.preventDefault();
        try {
            const saved = configApi.save(readFormConfig());
            renderConfig(saved);
            renderHistory();
            setStatus("설정이 저장되었습니다. 같은 환경의 FMA Viewer가 새 설정을 사용합니다.", "success");
        } catch (error) {
            setStatus(String(error?.message || error), "error");
        }
    });

    checksInput.addEventListener("input", renderInterval);
    blockedCheckInput.addEventListener("input", renderInterval);
    urlInput.addEventListener("input", () => {
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

    document.getElementById("resetSettingsButton").addEventListener("click", () => {
        if (!confirm("배포 URL과 점검 주기를 기본값으로 복원할까요?")) return;
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
    renderConfig();
    renderHistory();
})();
