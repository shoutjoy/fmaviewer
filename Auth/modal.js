(function mountFMAAuthModal(global, document) {
    "use strict";

    if (document.getElementById("firstUseModal")) return;

    const settings = global.FMAAuthSettings || {};
    const appName = String(settings.appName || "FMA Viewer");
    const appMark = String(settings.appMark || "FMA");
    const policyUrl = String(settings.privacyPolicyUrl || "Auth/privacy_policy.html");
    const recipient = String(settings.notificationRecipient || "shoutjoy1@yonsei.ac.kr");
    const sessionStorageKey = `${String(settings.storagePrefix || "fma_viewer")}_session_v1`;

    const hasResumableSession = (() => {
        try {
            const session = JSON.parse(global.sessionStorage.getItem(sessionStorageKey) || "null");
            return Boolean(
                session?.email &&
                /^[a-f0-9]{64}$/i.test(String(session?.token || "")) &&
                Date.parse(session?.expiresAt || "") > Date.now()
            );
        } catch (_) {
            return false;
        }
    })();

    const escapeHtml = value => String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    const container = document.createElement("div");
    container.innerHTML = `
        <div id="firstUseModal" class="first-use-modal" role="dialog" aria-modal="true"
            ${hasResumableSession ? 'data-auth-resuming="true" style="display:none;"' : ""}
            aria-labelledby="firstUseTitle" aria-describedby="firstUseDescription">
            <div class="first-use-dialog">
                <header class="first-use-header">
                    <span class="first-use-mark" aria-hidden="true">${escapeHtml(appMark)}</span>
                    <div>
                        <h2 id="firstUseTitle">${escapeHtml(appName)} 로그인</h2>
                        <p id="firstUseDescription">이메일과 ${escapeHtml(appName)} 전용 비밀번호로 로그인해 주세요.</p>
                    </div>
                </header>

                <div class="first-use-body">
                    <section id="authLoginPanel" class="auth-view auth-login-view" data-auth-panel="login">
                        <div class="auth-login-intro">
                            <strong>등록된 사용자 로그인</strong>
                            <p>이메일 인증을 마친 계정만 로그인할 수 있습니다. Google 계정 비밀번호가 아닌 ${escapeHtml(appName)} 전용 비밀번호를 사용합니다.</p>
                        </div>

                        <div class="auth-login-form">
                            <label class="first-use-field" for="authLoginEmail">
                                <span>사용자 Gmail</span>
                                <input id="authLoginEmail" type="email" inputmode="email" autocomplete="username"
                                    placeholder="Gmail 아이디 또는 example@gmail.com" spellcheck="false" required>
                                <small><strong>@gmail.com</strong>은 생략해도 자동으로 입력됩니다.</small>
                            </label>
                            <label class="first-use-field" for="authLoginPassword">
                                <span>비밀번호</span>
                                <input id="authLoginPassword" type="password" autocomplete="current-password"
                                    minlength="10" maxlength="128" placeholder="FMA Viewer 전용 비밀번호" required>
                            </label>
                            <label class="auth-remember-check">
                                <input id="authRememberEmail" type="checkbox">
                                <span>아이디 저장</span>
                            </label>
                        </div>

                        <p id="authLoginStatus" class="first-use-status" role="status" aria-live="polite" hidden></p>
                        <p id="authLoginError" class="first-use-error" role="alert" hidden></p>

                        <div class="auth-login-submit">
                            <button id="btnAuthLogin" type="button">로그인</button>
                        </div>
                    </section>

                    <section id="authRegistrationPanel" class="auth-view" data-auth-panel="registration" hidden>
                        <div class="first-use-notice">
                            <strong>이메일 인증 및 비밀번호 설정</strong>
                            <p>정보를 입력하면 30분 동안 유효한 인증 링크를 Gmail로 보냅니다. 링크를 연 뒤 로그인 화면에서 이메일과 비밀번호를 입력하세요.</p>
                            <p>비밀번호는 브라우저에서 강하게 파생된 값으로 변환되며, 원문 비밀번호는 앱 서버나 Google Sheet에 저장되지 않습니다.</p>
                        </div>

                        <details class="first-use-policy">
                            <summary>개인정보 처리방침 주요 내용</summary>
                            <div>
                                <p>Gmail, 이름, 소속, 사용목적, 신청·인증 시각과 로그인용 비밀번호 파생 정보가 등록 시스템에서 처리됩니다.</p>
                                <p>인증 완료 알림은 <strong>${escapeHtml(recipient)}</strong>로 발송됩니다. Google 계정 비밀번호는 입력하거나 저장하지 않습니다.</p>
                                <a href="${escapeHtml(policyUrl)}" target="_blank" rel="noopener noreferrer">개인정보 처리방침 전문 보기 ↗</a>
                            </div>
                        </details>

                        <div class="first-use-application-grid">
                            <label class="first-use-field" for="firstUseName">
                                <span>이름</span>
                                <input id="firstUseName" type="text" autocomplete="name" maxlength="80"
                                    placeholder="신청자 이름" required>
                            </label>
                            <label class="first-use-field" for="firstUseOrganization">
                                <span>소속</span>
                                <input id="firstUseOrganization" type="text" autocomplete="organization" maxlength="120"
                                    placeholder="학교, 기관, 회사 등" required>
                            </label>
                            <label class="first-use-field first-use-field-wide" for="firstUseGmail">
                                <span>사용자 Gmail</span>
                                <input id="firstUseGmail" type="email" inputmode="email" autocomplete="username"
                                    placeholder="Gmail 아이디 또는 example@gmail.com" spellcheck="false" required>
                                <small><strong>@gmail.com</strong>은 생략해도 자동으로 입력됩니다.</small>
                            </label>
                            <label class="first-use-field" for="firstUsePassword">
                                <span>비밀번호</span>
                                <input id="firstUsePassword" type="password" autocomplete="new-password" minlength="10"
                                    maxlength="128" placeholder="10자 이상" required>
                                <small>Google 비밀번호와 다른 전용 비밀번호를 권장합니다.</small>
                            </label>
                            <label class="first-use-field" for="firstUsePasswordConfirm">
                                <span>비밀번호 확인</span>
                                <input id="firstUsePasswordConfirm" type="password" autocomplete="new-password"
                                    minlength="10" maxlength="128" placeholder="비밀번호 다시 입력" required>
                            </label>
                            <label class="first-use-field first-use-field-wide" for="firstUsePurpose">
                                <span>사용목적</span>
                                <textarea id="firstUsePurpose" rows="3" maxlength="500"
                                    placeholder="FMA Viewer를 사용하려는 목적을 작성해 주세요." required></textarea>
                                <small>최대 500자까지 입력할 수 있습니다.</small>
                            </label>
                        </div>

                        <div class="first-use-mail-preview">
                            <strong>신청 정보 요약</strong>
                            <output id="firstUseMailPreview" aria-live="polite"></output>
                        </div>

                        <label class="first-use-consent-check">
                            <input id="firstUsePrivacyConsent" type="checkbox">
                            <span>개인정보 처리방침을 읽었으며 Gmail, 이름, 소속, 사용목적, 신청·인증 시각과 로그인용 비밀번호 파생 정보의 처리에 동의합니다.</span>
                        </label>
                        <p id="firstUseStatus" class="first-use-status" role="status" aria-live="polite" hidden></p>
                        <p id="firstUseError" class="first-use-error" role="alert" hidden></p>
                    </section>
                </div>

                <footer class="first-use-footer">
                    <p id="authFooterNote" hidden>인증 대기 중에도 입력 내용을 수정해 새 인증 메일을 보낼 수 있습니다.</p>
                    <div class="auth-registration-prompt" data-auth-actions="login">
                        <div>
                            <strong>아직 이메일 인증을 받지 않았나요?</strong>
                            <p>처음 사용하는 경우 또는 기존 계정에 비밀번호가 없는 경우 이메일 인증으로 비밀번호를 설정할 수 있습니다.</p>
                        </div>
                        <button id="btnShowRegistration" type="button">이메일 인증하기</button>
                    </div>
                    <div class="first-use-footer-actions" data-auth-actions="registration" hidden>
                        <button id="btnBackToLogin" class="first-use-reset" type="button">로그인으로 돌아가기</button>
                        <button id="btnFirstUseContinue" type="button">인증 메일 보내기</button>
                    </div>
                </footer>
            </div>
        </div>`;

    document.documentElement.classList.add("first-use-locked");
    while (container.firstElementChild) document.body.appendChild(container.firstElementChild);

    // 설정 푸터가 없는 독립 연동 프로젝트에서는 기존처럼 접근 가능한
    // 최소 로그아웃 버튼을 제공한다. FMA Viewer는 index.html의 설정 푸터 버튼을 사용한다.
    if (!document.getElementById("authLogoutButton")) {
        const fallbackLogoutButton = document.createElement("button");
        fallbackLogoutButton.id = "authLogoutButton";
        fallbackLogoutButton.className = "auth-logout-button";
        fallbackLogoutButton.type = "button";
        fallbackLogoutButton.hidden = true;
        fallbackLogoutButton.title = "로그아웃";
        fallbackLogoutButton.setAttribute("aria-label", "로그아웃");
        fallbackLogoutButton.innerHTML = `
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                <path d="m16 17 5-5-5-5"></path>
                <path d="M21 12H9"></path>
            </svg>`;
        document.body.appendChild(fallbackLogoutButton);
    }
})(window, document);
