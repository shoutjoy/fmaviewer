/* =======================================================
   Browser navigation and accidental exit guard
   ======================================================= */

(function setupNavigationGuardModule() {
    "use strict";

    const EXIT_CONFIRMATION_MESSAGE = "정말 나가시겠습니까?";
    const HISTORY_GUARD_STATE_KEY = "__fmaExitGuard";
    const navigationGuardState = {
        modal: null,
        stayButton: null,
        leaveButton: null,
        pendingAction: null,
        historyGuardEnabled: false,
        allowExitOnce: false,
        lastFocusedElement: null,
        resetTimer: 0
    };

    function initNavigationGuard() {
        navigationGuardState.modal = document.getElementById("fmaExitGuardModal");
        navigationGuardState.stayButton = document.getElementById("btnFmaExitStay");
        navigationGuardState.leaveButton = document.getElementById("btnFmaExitLeave");
        if (!navigationGuardState.modal || !navigationGuardState.stayButton ||
            !navigationGuardState.leaveButton) return;

        navigationGuardState.stayButton.onclick = stayInFmaViewer;
        navigationGuardState.leaveButton.onclick = leaveFmaViewer;
        navigationGuardState.modal.addEventListener("mousedown", event => {
            if (event.target === navigationGuardState.modal) stayInFmaViewer();
        });

        document.addEventListener("keydown", handleNavigationGuardKeydown);
        document.addEventListener("click", handleSameTabNavigationClick, true);
        window.addEventListener("popstate", handleGuardedPopState);
        window.addEventListener("beforeunload", handleBeforeUnload);
        armBrowserBackGuard();
    }

    function handleBeforeUnload(event) {
        if (navigationGuardState.allowExitOnce) return;
        event.preventDefault();
        event.returnValue = EXIT_CONFIRMATION_MESSAGE;
        return EXIT_CONFIRMATION_MESSAGE;
    }

    function armBrowserBackGuard() {
        try {
            const currentState = history.state && typeof history.state === "object"
                ? history.state
                : {};
            if (!currentState[HISTORY_GUARD_STATE_KEY] && history.length <= 1) {
                navigationGuardState.historyGuardEnabled = false;
                return;
            }
            if (!currentState[HISTORY_GUARD_STATE_KEY]) {
                history.pushState(
                    { ...currentState, [HISTORY_GUARD_STATE_KEY]: true },
                    "",
                    location.href
                );
            }
            navigationGuardState.historyGuardEnabled = true;
        } catch (error) {
            navigationGuardState.historyGuardEnabled = false;
            console.warn("Browser back guard unavailable:", error);
        }
    }

    function handleGuardedPopState(event) {
        if (!navigationGuardState.historyGuardEnabled || navigationGuardState.allowExitOnce) return;
        if (event.state && event.state[HISTORY_GUARD_STATE_KEY]) return;

        armBrowserBackGuard();
        showExitConfirmation({ type: "history" });
    }

    function handleSameTabNavigationClick(event) {
        if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey ||
            event.shiftKey || event.altKey) return;

        const anchor = event.target.closest?.("a[href]");
        if (!anchor || anchor.hasAttribute("download")) return;
        const target = String(anchor.getAttribute("target") || "").toLowerCase();
        if (target && target !== "_self") return;

        let destination;
        try {
            destination = new URL(anchor.href, location.href);
        } catch (error) {
            return;
        }
        if (!["http:", "https:", "file:"].includes(destination.protocol)) return;
        const current = new URL(location.href);
        const sameDocument = destination.origin === current.origin &&
            destination.pathname === current.pathname &&
            destination.search === current.search;
        if (sameDocument && destination.hash) return;
        if (destination.href === current.href) return;

        event.preventDefault();
        showExitConfirmation({ type: "location", href: destination.href });
    }

    function showExitConfirmation(action) {
        navigationGuardState.pendingAction = action;
        navigationGuardState.lastFocusedElement = document.activeElement;
        navigationGuardState.modal.hidden = false;
        requestAnimationFrame(() => navigationGuardState.stayButton.focus());
    }

    function stayInFmaViewer() {
        navigationGuardState.pendingAction = null;
        navigationGuardState.modal.hidden = true;
        const previousFocus = navigationGuardState.lastFocusedElement;
        navigationGuardState.lastFocusedElement = null;
        if (previousFocus?.isConnected && typeof previousFocus.focus === "function") {
            previousFocus.focus();
        }
    }

    function leaveFmaViewer() {
        const action = navigationGuardState.pendingAction;
        if (!action) return;

        navigationGuardState.modal.hidden = true;
        navigationGuardState.pendingAction = null;
        allowNextNavigation();
        if (action.type === "history") {
            history.go(-2);
        } else if (action.type === "location" && action.href) {
            location.assign(action.href);
        }
    }

    function allowNextNavigation() {
        navigationGuardState.allowExitOnce = true;
        window.clearTimeout(navigationGuardState.resetTimer);
        navigationGuardState.resetTimer = window.setTimeout(() => {
            navigationGuardState.allowExitOnce = false;
        }, 1500);
    }

    function handleNavigationGuardKeydown(event) {
        if (navigationGuardState.modal?.hidden !== false) return;
        if (event.key === "Escape") {
            event.preventDefault();
            stayInFmaViewer();
        }
    }

    window.FMANavigationGuard = {
        confirmExit: showExitConfirmation,
        allowNextNavigation
    };

    document.addEventListener("DOMContentLoaded", initNavigationGuard);
})();
