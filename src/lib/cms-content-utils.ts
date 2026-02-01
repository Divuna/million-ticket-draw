/**
 * CMS Content Transformation Utilities
 * Transforms plain text content into structured HTML for all CMS pages.
 * Uses the Legal pages format as the single unified rendering style.
 */

/**
 * Normalizes a string by removing diacritics (accents) for comparison.
 * e.g., "nahlásit-problém" → "nahlasit-problem"
 */
export const normalizeSlug = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

/**
 * Transforms plain text content into structured HTML for ALL CMS pages.
 * Uses the Legal pages format as the unified rendering style:
 * - Lines starting with "1.", "2.", "1.1", etc. become questions with gold-accented numbers
 * - Text following until the next numbered line becomes the answer
 * - Empty lines split content into paragraphs
 * 
 * This single transformation is applied identically to Info, Support, and Legal pages.
 */
export const transformContentToHtml = (content: string): string => {
  // If content already contains significant HTML tags, return as-is
  if (/<(div|section|article|h[1-6]|ul|ol|table)[^>]*>/i.test(content)) {
    return content;
  }

  // Normalize line endings and split into lines
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  
  // Pattern for numbered questions: "1.", "2.", "1.1", "1.1.1", etc.
  const numberedPattern = /^((\d+\.)+)\s+(.+)$/;
  
  const result: string[] = [];
  let currentAnswer: string[] = [];
  let inQuestion = false;

  const flushAnswer = () => {
    if (currentAnswer.length > 0) {
      const answerText = currentAnswer.join('\n').trim();
      if (answerText) {
        const paragraphs = answerText.split(/\n\s*\n/);
        paragraphs.forEach((para) => {
          const trimmedPara = para.trim();
          if (trimmedPara) {
            const formattedPara = trimmedPara.replace(/\n/g, '<br />');
            result.push(`<p class="cms-answer">${formattedPara}</p>`);
          }
        });
      }
      currentAnswer = [];
    }
  };

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    const match = trimmedLine.match(numberedPattern);

    if (match) {
      flushAnswer();
      const numberPrefix = match[1];
      const questionText = match[3];
      result.push(
        `<h3 class="cms-question"><span class="cms-number">${numberPrefix}</span> ${questionText}</h3>`
      );
      inQuestion = true;
    } else if (trimmedLine === '') {
      if (inQuestion) {
        currentAnswer.push('');
      }
    } else {
      currentAnswer.push(trimmedLine);
      inQuestion = true;
    }
  });

  flushAnswer();
  return result.join('\n');
};
