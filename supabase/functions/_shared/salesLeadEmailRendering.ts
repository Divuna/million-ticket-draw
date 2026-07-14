/**
 * Converts Markdown links to the text the author chose to display.
 *
 * Lead e-mails are plain text. The HTML MIME alternative is produced by the
 * sender only for whitespace-preserving display, so link destinations must not
 * leak into either alternative as raw Markdown.
 */
export function markdownLinksToVisibleText(value: string): string {
  return value.replace(/\[([^\]\r\n]+)\]\(([^)\r\n]+)\)/g, "$1");
}
