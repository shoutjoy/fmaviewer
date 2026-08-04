(function initializePasswordAdminAccess() {
    "use strict";

    const settings = window.FMAAuthSettings || {};
    const configApi = window.FMAAdminConfig;
    if (!configApi) throw new Error("FMAAdminConfig is not available.");

    const prefix = String(settings.storagePrefix || "fma_viewer");
    const sessionKey = `${prefix}_admin_session_v2`;
    const gate = document.getElementById("adminAuthGate");
    const shell = document.getElementById("adminShell");
    const status = document.getElementById("adminAuthStatus");
    const description = document.getElementById("adminAuthDescription");
    const initialPasswordNotice = document.getElementById("adminInitialPasswordNotice");
    const loginForm = document.getElementById("adminLoginForm");
    const adminIdInput = document.getElementById("adminLoginId");
    const passwordInput = document.getElementById("adminLoginPassword");
    const loginButton = document.getElementById("adminLoginButton");
    const changeForm = document.getElementById("adminPasswordChangeForm");
    const newPasswordInput = document.getElementById("adminNewPassword");
    const newPasswordConfirmInput = document.getElementById("adminNewPasswordConfirm");
    const changeButton = document.getElementById("adminPasswordChangeButton");
    const logoutButton = document.getElementById("adminLogoutButton");
    let adminLoaded = false;
    let pendingChangeSession = null;

    function setStatus(message, tone = "success") {
        status.textContent = message || "";
        status.dataset.tone = tone;
        status.hidden = !message;
    }

    function setLoginBusy(busy) {
        adminIdInput.disabled = busy;
        passwordInput.disabled = busy;
        loginButton.disabled = busy;
        loginButton.textContent = busy ? "로그인 확인 중…" : "로그인";
    }

    function setChangeBusy(busy) {
        newPasswordInput.disabled = busy;
        newPasswordConfirmInput.disabled = busy;
        changeButton.disabled = busy;
        changeButton.textContent = busy ? "비밀번호 변경 중…" : "비밀번호 변경 후 관리자 열기";
    }

    function createRandomHex(byteLength = 16) {
        if (!window.crypto?.getRandomValues) throw new Error("안전한 브라우저 난수 기능을 사용할 수 없습니다.");
        const bytes = new Uint8Array(byteLength);
        crypto.getRandomValues(bytes);
        return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
    }

    function hexToBytes(hex) {
        if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) throw new Error("비밀번호 보안 정보를 확인할 수 없습니다.");
        return Uint8Array.from(hex.match(/.{2}/g), value => parseInt(value, 16));
    }

    function bytesToHex(buffer) {
        return Array.from(new Uint8Array(buffer), value => value.toString(16).padStart(2, "0")).join("");
    }

    async function derivePasswordVerifier(password, saltHex, iterations) {
        if (!window.crypto?.subtle || typeof TextEncoder === "undefined") {
            throw new Error("이 브라우저에서는 안전한 비밀번호 처리를 사용할 수 없습니다.");
        }
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(password),
            "PBKDF2",
            false,
            ["deriveBits"]
        );
        const bits = await crypto.subtle.deriveBits({
            name: "PBKDF2",
            hash: "SHA-256",
            salt: hexToBytes(saltHex),
            iterations
        }, key, 256);
        return bytesToHex(bits);
    }

    function validateNewPassword(password, confirmation) {
        if (password !== confirmation) throw new Error("새 비밀번호 확인이 일치하지 않습니다.");
        if (password.length < 10 || password.length > 128) {
            throw new Error("새 비밀번호는 10~128자로 입력해 주세요.");
        }
        const typeCount = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]
            .filter(pattern => pattern.test(password)).length;
        if (typeCount < 3) throw new Error("영문 대·소문자, 숫자, 특수문자 중 세 종류 이상을 사용해 주세요.");
    }

    function readSession() {
        try {
            const session = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
            if (!session || session.adminId !== "admin" ||
                !/^[a-f0-9]{64}$/i.test(String(session.token || "")) ||
                Date.parse(session.expiresAt) <= Date.now()) {
                sessionStorage.removeItem(sessionKey);
                return null;
            }
            return session;
        } catch (_) {
            sessionStorage.removeItem(sessionKey);
            return null;
        }
    }

    function saveSession(result) {
        const session = {
            adminId: String(result.adminId || "admin").toLowerCase(),
            token: String(result.adminSessionToken || "").toLowerCase(),
            expiresAt: String(result.expiresAt || ""),
            passwordChangeRequired: Boolean(result.passwordChangeRequired)
        };
        sessionStorage.setItem(sessionKey, JSON.stringify(session));
        return session;
    }

    function clearSession() {
        sessionStorage.removeItem(sessionKey);
        pendingChangeSession = null;
    }

    function createAdminRequestError(message, code) {
        const error = new Error(message);
        error.code = code;
        return error;
    }

    async function requestAdminActionAtUrl(gasWebAppUrl, payload) {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 60000);
        try {
            const response = await fetch(gasWebAppUrl, {
                method: "POST",
                cache: "no-store",
                headers: { "Content-Type": "text/plain;charset=utf-8" },
                body: JSON.stringify(payload),
                signal: controller.signal
            });
            const text = await response.text();
            if (response.redirected && /accounts\.google\.com/i.test(response.url || "")) {
                throw createAdminRequestError("Google 로그인을 요구하는 관리자용 GAS 주소가 저장되어 있습니다.", "GAS_AUTH_REQUIRED");
            }
            if (!response.ok || /^\s*(?:<!doctype|<html)/i.test(text)) {
                throw createAdminRequestError("저장된 GAS 주소가 공개 JSON 서버가 아닙니다.", "GAS_HTML_RESPONSE");
            }
            let result;
            try {
                result = JSON.parse(text);
            } catch (_) {
                throw createAdminRequestError("관리자 인증 서버가 JSON을 반환하지 않았습니다.", "GAS_INVALID_JSON");
            }
            const expectedVersion = String(settings.serverVersion || "");
            if (expectedVersion && String(result.serverVersion || "") !== expectedVersion) {
                const actualVersion = String(result.serverVersion || result.version || "확인 불가");
                throw createAdminRequestError(
                    `GAS 배포가 구버전입니다(${actualVersion}). 최신 Code.gs ${expectedVersion}을 새 버전으로 배포해 주세요.`,
                    "GAS_VERSION_MISMATCH"
                );
            }
            return result;
        } catch (error) {
            if (error?.name === "AbortError") {
                throw createAdminRequestError("관리자 인증 서버 응답 시간이 초과되었습니다.", "GAS_TIMEOUT");
            }
            throw error;
        } finally {
            window.clearTimeout(timeoutId);
        }
    }

    async function postAdminAction(payload) {
        const config = configApi.load();
        const configuredUrl = String(config.gasWebAppUrl || "");
        const defaultUrl = String(settings.gasWebAppUrl || "");
        const candidates = Array.from(new Set([configuredUrl, defaultUrl].filter(Boolean)));
        const errors = [];

        for (const gasWebAppUrl of candidates) {
            try {
                const result = await requestAdminActionAtUrl(gasWebAppUrl, payload);
                if (gasWebAppUrl !== configuredUrl) {
                    configApi.save({ ...config, gasWebAppUrl }, { recordHistory: false });
                }
                return result;
            } catch (error) {
                errors.push(error);
            }
        }

        const versionError = errors.find(error => error?.code === "GAS_VERSION_MISMATCH");
        if (versionError) throw versionError;
        const lastError = errors[errors.length - 1];
        throw lastError || new Error("관리자 인증용 GAS 주소를 확인할 수 없습니다.");
    }

    function loadAdminApplication(session) {
        gate.hidden = true;
        shell.hidden = false;
        const identityBadge = document.getElementById("adminIdentityBadge");
        if (identityBadge) identityBadge.textContent = session.adminId;
        if (adminLoaded) return;
        adminLoaded = true;
        const script = document.createElement("script");
        script.src = "admin.js?v=20260805-2";
        script.async = false;
        script.onerror = () => {
            adminLoaded = false;
            shell.hidden = true;
            gate.hidden = false;
            setStatus("관리자 설정 모듈을 불러오지 못했습니다.", "error");
        };
        document.body.appendChild(script);
    }

    function showLoginGate(message = "", tone = "success") {
        shell.hidden = true;
        gate.hidden = false;
        loginForm.hidden = false;
        changeForm.hidden = true;
        description.textContent = "FMA Viewer 관리자 아이디와 비밀번호를 입력해 주세요.";
        passwordInput.value = "";
        newPasswordInput.value = "";
        newPasswordConfirmInput.value = "";
        if (message) setStatus(message, tone);
        else setStatus("");
        window.setTimeout(() => passwordInput.focus(), 0);
    }

    async function refreshInitialPasswordNotice() {
        try {
            const parameters = await postAdminAction({ action: "admin-login-params", adminId: "admin" });
            initialPasswordNotice.hidden = !parameters?.success || !parameters.bootstrapPasswordRequired;
        } catch (error) {
            initialPasswordNotice.hidden = true;
            setStatus(String(error?.message || error), "error");
        }
    }

    function showPasswordChange(session) {
        pendingChangeSession = session;
        shell.hidden = true;
        gate.hidden = false;
        loginForm.hidden = true;
        changeForm.hidden = false;
        initialPasswordNotice.hidden = true;
        description.textContent = "최초 로그인 보안을 위해 새 관리자 비밀번호를 설정해야 합니다.";
        setStatus("임시 비밀번호로 로그인했습니다. 새 비밀번호 설정을 완료해 주세요.", "success");
        window.setTimeout(() => newPasswordInput.focus(), 0);
    }

    async function login(event) {
        event.preventDefault();
        const adminId = String(adminIdInput.value || "").trim().toLowerCase();
        const password = String(passwordInput.value || "");
        if (adminId !== "admin" || !password) {
            setStatus("관리자 아이디와 비밀번호를 입력해 주세요.", "error");
            return;
        }

        setLoginBusy(true);
        setStatus("관리자 로그인을 확인하고 있습니다…", "success");
        try {
            const parameters = await postAdminAction({ action: "admin-login-params", adminId });
            if (!parameters?.success) throw new Error(parameters?.message || "관리자 계정이 아직 준비되지 않았습니다.");
            initialPasswordNotice.hidden = !parameters.bootstrapPasswordRequired;

            const payload = { action: "admin-login", adminId };
            if (parameters.bootstrapPasswordRequired) {
                payload.bootstrapPassword = password;
            } else {
                payload.passwordVerifier = await derivePasswordVerifier(
                    password,
                    String(parameters.passwordSalt || ""),
                    Number(parameters.passwordIterations || settings.passwordIterations || 600000)
                );
            }

            const result = await postAdminAction(payload);
            if (!result?.success || !result?.adminAuthenticated ||
                !/^[a-f0-9]{64}$/i.test(String(result.adminSessionToken || ""))) {
                throw new Error(result?.message || "관리자 아이디 또는 비밀번호가 올바르지 않습니다.");
            }
            passwordInput.value = "";
            const session = saveSession(result);
            if (session.passwordChangeRequired) showPasswordChange(session);
            else loadAdminApplication(session);
        } catch (error) {
            clearSession();
            setStatus(String(error?.message || error), "error");
        } finally {
            setLoginBusy(false);
        }
    }

    async function changePassword(event) {
        event.preventDefault();
        const session = pendingChangeSession || readSession();
        if (!session) {
            showLoginGate("관리자 세션이 만료되었습니다. 다시 로그인해 주세요.", "error");
            return;
        }

        const password = String(newPasswordInput.value || "");
        const confirmation = String(newPasswordConfirmInput.value || "");
        try {
            validateNewPassword(password, confirmation);
        } catch (error) {
            setStatus(String(error?.message || error), "error");
            return;
        }

        setChangeBusy(true);
        setStatus("새 관리자 비밀번호를 안전하게 저장하고 있습니다…", "success");
        try {
            const passwordSalt = createRandomHex(16);
            const passwordIterations = Number(settings.passwordIterations || 600000);
            const passwordVerifier = await derivePasswordVerifier(password, passwordSalt, passwordIterations);
            const result = await postAdminAction({
                action: "admin-change-password",
                adminSessionToken: session.token,
                passwordSalt,
                passwordVerifier,
                passwordIterations
            });
            if (!result?.success || !result?.adminAuthenticated) {
                throw new Error(result?.message || "관리자 비밀번호를 변경하지 못했습니다.");
            }
            newPasswordInput.value = "";
            newPasswordConfirmInput.value = "";
            pendingChangeSession = null;
            initialPasswordNotice.hidden = true;
            const updatedSession = saveSession(result);
            loadAdminApplication(updatedSession);
        } catch (error) {
            setStatus(String(error?.message || error), "error");
        } finally {
            setChangeBusy(false);
        }
    }

    async function verifySession(session) {
        const result = await postAdminAction({
            action: "admin-status",
            adminSessionToken: session.token
        });
        if (!result?.success || !result?.adminAuthenticated) {
            throw new Error(result?.message || "관리자 세션이 만료되었습니다.");
        }
        return saveSession(result);
    }

    async function logout() {
        const session = readSession();
        logoutButton.disabled = true;
        try {
            if (session) {
                await postAdminAction({
                    action: "admin-logout",
                    adminSessionToken: session.token
                });
            }
        } catch (error) {
            console.warn("Admin logout request failed:", error);
        } finally {
            clearSession();
            logoutButton.disabled = false;
            showLoginGate("관리자 계정에서 로그아웃했습니다.", "success");
            void refreshInitialPasswordNotice();
        }
    }

    async function initialize() {
        loginForm.addEventListener("submit", event => void login(event));
        changeForm.addEventListener("submit", event => void changePassword(event));
        logoutButton.addEventListener("click", () => void logout());

        const session = readSession();
        if (!session) {
            showLoginGate();
            await refreshInitialPasswordNotice();
            return;
        }
        setStatus("기존 관리자 세션을 확인하고 있습니다…", "success");
        try {
            const verified = await verifySession(session);
            if (verified.passwordChangeRequired) showPasswordChange(verified);
            else loadAdminApplication(verified);
        } catch (error) {
            clearSession();
            showLoginGate(String(error?.message || error), "error");
        }
    }

    void initialize();
})();
