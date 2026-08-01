(function mountFMAAuthModal(global, document) {
    "use strict";

    if (document.getElementById("firstUseModal")) return;

    const settings = global.FMAAuthSettings || {};
    const appName = String(settings.appName || "FMA Viewer");
    const appMark = String(settings.appMark || "FMA");
    const policyUrl = String(settings.privacyPolicyUrl || "Auth/privacy_policy.html");
    const recipient = String(settings.notificationRecipient || "shoutjoy1@yonsei.ac.kr");

    const escapeHtml = (value) => String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");

    const container = document.createElement("div");
    container.innerHTML = `
        <div id="firstUseModal" class="first-use-modal" role="dialog" aria-modal="true"
            aria-labelledby="firstUseTitle" aria-describedby="firstUseDescription" style="display:none;">
            <div class="first-use-dialog">
                <header class="first-use-header">
                    <span class="first-use-mark" aria-hidden="true">${escapeHtml(appMark)}</span>
                    <div>
                        <h2 id="firstUseTitle">${escapeHtml(appName)} 첫 사용자 확인</h2>
                        <p id="firstUseDescription">Gmail로 받은 인증 링크를 열면 사용 승인이 기록되고 ${escapeHtml(appName)}가 시작됩니다.</p>
                    </div>
                </header>
                <div class="first-use-body">
                    <div class="first-use-notice">
                        <strong>사용 신청에 포함되는 정보</strong>
                        <ul>
                            <li>입력한 Gmail 주소</li>
                            <li>신청자 이름과 소속</li>
                            <li>작성한 사용목적</li>
                            <li>첫 사용 일자와 시각(시·분)</li>
                            <li>이메일 인증 일자와 시각</li>
                            <li>마지막 등록 확인 시각과 사용 상태</li>
                        </ul>
                        <p>비밀번호, Gmail 인증 토큰, 이미지 또는 영상은 이 최초 사용자 알림에 포함되지 않습니다.</p>
                    </div>
                    <details class="first-use-policy" open>
                        <summary>개인정보 처리방침 주요 내용</summary>
                        <div>
                            <p>위 정보는 최초 사용자 확인, 운영 공지 및 문의 대응 목적으로 처리됩니다.</p>
                            <p>신청 정보는 인증을 기다리는 동안 현재 브라우저와 Google Apps Script 임시 저장소에 보관됩니다. 입력한 Gmail로 30분 동안 유효한 인증 링크를 발송하며,
                                링크를 열어 인증을 완료한 뒤에만 Gmail, 이름, 소속, 사용목적이 Google Sheet의 Users 탭에 Active 상태로 저장됩니다. 인증 완료 알림은 <strong>${escapeHtml(recipient)}</strong>로 발송됩니다.</p>
                            <p>앱은 관리자가 설정한 횟수만큼 Sheet의 이메일을 확인합니다(기본 하루 1회). 이메일이 없으면 다시 신청해야 하며, 서버 연결이 일시적으로 실패하면 기존 등록 사용자는 계속 사용할 수 있습니다.</p>
                            <p>AI 기능을 직접 실행하는 경우 선택한 이미지와 프롬프트가 Google Gemini API로 전송될 수 있습니다. 로컬 편집 기능은 가능한 범위에서 브라우저 안에서 처리됩니다.</p>
                            <p>동의 철회 및 삭제 요청은 개발자 이메일로 접수할 수 있습니다.</p>
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
                            <input id="firstUseGmail" type="email" inputmode="email" autocomplete="email"
                                placeholder="example@gmail.com" spellcheck="false" required>
                            <small>Google 계정 비밀번호는 입력하지 마세요.</small>
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
                        <span>개인정보 처리방침을 읽었으며 Gmail 주소, 이름, 소속, 사용목적, 신청·인증 시각, 마지막 확인 시각 및 사용 상태를 등록 시스템에서 처리하는 것에 동의합니다.</span>
                    </label>
                    <p id="firstUseStatus" class="first-use-status" role="status" aria-live="polite" hidden></p>
                    <p id="firstUseError" class="first-use-error" role="alert" hidden></p>
                </div>
                <footer class="first-use-footer">
                    <p>인증 전에는 앱이 잠겨 있으며, 인증 후 Sheet 등록을 정기 동기화합니다.</p>
                    <div class="first-use-footer-actions">
                        <button id="btnFirstUseContinue" type="button">사용 신청하고 시작</button>
                    </div>
                </footer>
            </div>
        </div>`;

    document.body.appendChild(container.firstElementChild);
})(window, document);
