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
 * Detects if a line is a plain heading (without number prefix).
 * Plain headings are short, don't end with sentence punctuation,
 * and are typically followed by content paragraphs.
 */
const isPlainHeading = (line: string, nextLine: string | undefined): boolean => {
  const trimmed = line.trim();
  
  // Empty lines are not headings
  if (!trimmed) return false;
  
  // Too long for a heading (more than 80 chars)
  if (trimmed.length > 80) return false;
  
  // Ends with sentence-ending punctuation - likely a paragraph, not heading
  if (/[.,:;!]$/.test(trimmed)) return false;
  
  // Too many words for a heading (more than 10 words)
  if (trimmed.split(/\s+/).length > 10) return false;
  
  // Must be followed by empty line or undefined (end of content)
  // This distinguishes headings from inline text
  if (nextLine !== undefined && nextLine.trim() !== '') return false;
  
  return true;
};

/**
 * Detects if a line looks like a bullet/list item.
 * List items are typically:
 * - Short lines ending with comma
 * - Lines starting with dash, bullet, or similar markers
 * - Short lines in a sequence (detected by context)
 */
const isListItemLine = (line: string): boolean => {
  const trimmed = line.trim();
  
  // Empty lines are not list items
  if (!trimmed) return false;
  
  // Explicit bullet markers
  if (/^[-–—•·*]\s+/.test(trimmed)) return true;
  
  // Ends with comma (continuation list item)
  if (trimmed.endsWith(',')) return true;
  
  // Short line (under 100 chars) that doesn't end with period
  // and starts with lowercase (continuation of a list)
  if (trimmed.length < 100 && /^[a-záčďéěíňóřšťúůýž]/.test(trimmed) && !trimmed.endsWith('.')) {
    return true;
  }
  
  return false;
};

/**
 * Cleans a list item text by removing bullet markers and trailing commas.
 */
const cleanListItemText = (line: string): string => {
  let cleaned = line.trim();
  // Remove leading bullet markers
  cleaned = cleaned.replace(/^[-–—•·*]\s+/, '');
  // Remove trailing comma
  cleaned = cleaned.replace(/,$/, '');
  return cleaned;
};

/**
 * Transforms plain text content into structured HTML for ALL CMS pages.
 * Uses the Legal pages format as the unified rendering style:
 * - Lines starting with "1.", "2.", "1.1", etc. become questions with gold-accented numbers
 * - Plain headings (short lines followed by empty line) become questions without numbers
 * - Consecutive list-like lines become bullet lists with gold markers
 * - Text following until the next heading becomes the answer
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
  let currentListItems: string[] = [];

  const flushList = () => {
    if (currentListItems.length > 0) {
      result.push('<ul class="cms-bullet-list">');
      currentListItems.forEach((item) => {
        result.push(`<li>${item}</li>`);
      });
      result.push('</ul>');
      currentListItems = [];
    }
  };

  const flushAnswer = () => {
    flushList();
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

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nextLine = lines[i + 1];
    const trimmedLine = line.trim();
    
    // Check for numbered heading pattern (e.g., "1.", "1.1.")
    const numberedMatch = trimmedLine.match(numberedPattern);

    if (numberedMatch) {
      // Numbered heading - render with gold number
      flushAnswer();
      const numberPrefix = numberedMatch[1];
      const questionText = numberedMatch[3];
      result.push(
        `<h3 class="cms-question"><span class="cms-number">${numberPrefix}</span> ${questionText}</h3>`
      );
    } else if (isPlainHeading(trimmedLine, nextLine)) {
      // Plain heading without number - same styling, no number span
      flushAnswer();
      result.push(`<h3 class="cms-question">${trimmedLine}</h3>`);
    } else if (trimmedLine === '') {
      // Empty line - flush list if we were building one, may split paragraphs
      flushList();
      if (currentAnswer.length > 0) {
        currentAnswer.push('');
      }
    } else if (isListItemLine(trimmedLine)) {
      // List item detected - flush any pending answer text first
      if (currentAnswer.length > 0) {
        const answerText = currentAnswer.join('\n').trim();
        if (answerText) {
          const formattedPara = answerText.replace(/\n/g, '<br />');
          result.push(`<p class="cms-answer">${formattedPara}</p>`);
        }
        currentAnswer = [];
      }
      // Add to current list
      currentListItems.push(cleanListItemText(trimmedLine));
    } else {
      // Regular content line
      // If we were building a list, flush it first
      flushList();
      currentAnswer.push(trimmedLine);
    }
  }

  flushAnswer();
  return result.join('\n');
};
