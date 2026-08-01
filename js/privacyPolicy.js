/* Render the local privacy-policy Markdown without a third-party dependency. */

function escapePrivacyHtml(value) {
    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function renderPrivacyInline(value) {
    return escapePrivacyHtml(value)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

function renderPrivacyMarkdown(markdown) {
    const output = [];
    const paragraph = [];
    let listOpen = false;

    const closeParagraph = () => {
        if (!paragraph.length) return;
        output.push(`<p>${paragraph.map(renderPrivacyInline).join(" ")}</p>`);
        paragraph.length = 0;
    };
    const closeList = () => {
        if (!listOpen) return;
        output.push("</ul>");
        listOpen = false;
    };

    String(markdown).replace(/\r\n?/g, "\n").split("\n").forEach(line => {
        const heading = /^(#{1,6})\s+(.+)$/.exec(line);
        const listItem = /^-\s+(.+)$/.exec(line);
        if (heading) {
            closeParagraph();
            closeList();
            const level = heading[1].length;
            output.push(`<h${level}>${renderPrivacyInline(heading[2])}</h${level}>`);
        } else if (listItem) {
            closeParagraph();
            if (!listOpen) {
                output.push("<ul>");
                listOpen = true;
            }
            output.push(`<li>${renderPrivacyInline(listItem[1])}</li>`);
        } else if (!line.trim()) {
            closeParagraph();
            closeList();
        } else {
            closeList();
            paragraph.push(line.trim());
        }
    });

    closeParagraph();
    closeList();
    return output.join("\n");
}

async function loadPrivacyPolicy() {
    const container = document.getElementById("privacyPolicy");
    if (!container) return;
    const fallback = document.getElementById("privacyPolicyFallback")?.textContent.trim() || "";
    try {
        const response = await fetch("PRIVACY_POLICY.md", { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        container.innerHTML = renderPrivacyMarkdown(await response.text());
    } catch (error) {
        console.error("Privacy policy could not be loaded:", error);
        if (fallback) {
            container.innerHTML = renderPrivacyMarkdown(fallback);
            return;
        }
        container.innerHTML = [
            '<div class="error">',
            "<strong>개인정보 처리방침을 불러오지 못했습니다.</strong>",
            "<p>로컬 파일로 열었다면 HTTP 서버에서 FMA Viewer를 실행해 주세요. ",
            '<a href="PRIVACY_POLICY.md">Markdown 원문 열기</a></p>',
            "</div>"
        ].join("");
    }
}

document.addEventListener("DOMContentLoaded", loadPrivacyPolicy);
