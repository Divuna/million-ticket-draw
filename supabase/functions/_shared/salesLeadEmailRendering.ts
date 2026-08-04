const LINK_PATTERN = /\[([^\]\r\n]+)\]\(((?:https?:\/\/|mailto:)[^)\s]+)\)/gi;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderEmphasis(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*\r\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\r\n]+)\*(?!\*)/g, "$1<em>$2</em>");
}

function renderInline(value: string): string {
  LINK_PATTERN.lastIndex = 0;
  let output = "";
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = LINK_PATTERN.exec(value)) !== null) {
    output += renderEmphasis(value.slice(cursor, match.index));
    const label = renderEmphasis(match[1]);
    const href = escapeHtml(match[2]);
    const externalAttributes = /^https?:\/\//i.test(match[2])
      ? ' target="_blank" rel="noopener noreferrer nofollow"'
      : "";
    output += `<a href="${href}"${externalAttributes} style="color:#d97706;text-decoration:underline">${label}</a>`;
    cursor = match.index + match[0].length;
  }

  return output + renderEmphasis(value.slice(cursor));
}

/**
 * Converts supported formatting into a clean plain-text MIME alternative.
 * The stored template/body remains unchanged; only the outgoing e-mail is rendered.
 */
export function renderSalesLeadEmailText(value: string): string {
  return markdownLinksToVisibleText(value)
    .replace(/\*\*([^*\r\n]+)\*\*/g, "$1")
    .replace(/(^|[^*])\*([^*\r\n]+)\*(?!\*)/g, "$1$2")
    .replace(/^\s*[-•]\s+/gm, "• ");
}

/**
 * Renders a deliberately small, safe formatting subset for outbound sales e-mails:
 * bold, italic, bullet/numbered lists, links, paragraphs and emoji.
 * Raw HTML is always escaped; only http(s) and mailto links are clickable.
 */
export function renderSalesLeadEmailHtml(value: string): string {
  const lines = value.replace(/\r\n?/g, "\n").split("\n");
  const blocks: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushList = () => {
    if (!listType || listItems.length === 0) return;
    blocks.push(
      `<${listType} style="margin:0 0 12px 22px;padding:0">${listItems
        .map((item) => `<li style="margin:0 0 5px 0">${item}</li>`)
        .join("")}</${listType}>`,
    );
    listType = null;
    listItems = [];
  };

  for (const line of lines) {
    const bullet = line.match(/^\s*[-•]\s+(.+)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);

    if (bullet) {
      if (listType !== "ul") {
        flushList();
        listType = "ul";
      }
      listItems.push(renderInline(bullet[1]));
      continue;
    }

    if (numbered) {
      if (listType !== "ol") {
        flushList();
        listType = "ol";
      }
      listItems.push(renderInline(numbered[1]));
      continue;
    }

    flushList();
    if (!line.trim()) {
      blocks.push('<div style="height:10px;line-height:10px">&nbsp;</div>');
      continue;
    }
    blocks.push(`<div style="margin:0 0 7px 0">${renderInline(line)}</div>`);
  }
  flushList();

  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.55;color:#202124">${blocks.join("")}</div>`;
}

/**
 * Converts Markdown links to the text the author chose to display.
 * Kept as a public helper for existing tests and callers.
 */
export function markdownLinksToVisibleText(value: string): string {
  return value.replace(/\[([^\]\r\n]+)\]\(([^)\r\n]+)\)/g, "$1");
}
