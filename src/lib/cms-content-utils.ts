/**
 * CMS Content Transformation Utilities
 * Transforms plain text content into structured HTML for CMS pages.
 */

/**
 * Normalizes a string by removing diacritics (accents) for comparison.
 * e.g., "nahlásit-problém" → "nahlasit-problem"
 */
export const normalizeSlug = (str: string): string => {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
};

/**
 * Transforms the "nahlásit-problém" support page content into structured HTML.
 * This page has a specific format with section headings and bullet lists.
 */
const transformSupportPageContent = (content: string): string => {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  const result: string[] = [];
  let inList = false;
  
  const sectionHeadings = [
    'Formulář slouží k nahlášení například:',
    'Co se stane po odeslání',
    'Doporučení pro rychlejší vyřešení',
    'Jiný způsob kontaktu',
    'Jaký typ problému řešíte?'
  ];
  
  const listStarters = [
    'Po odeslání formuláře:',
    'Do zprávy uveďte co nejpřesnější informace, například:'
  ];

  const closeList = () => {
    if (inList) {
      result.push('</ul>');
      inList = false;
    }
  };

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    
    if (!trimmedLine) {
      closeList();
      return;
    }

    if (sectionHeadings.includes(trimmedLine)) {
      closeList();
      result.push(`<h3 class="cms-section-heading">${trimmedLine}</h3>`);
      return;
    }

    if (listStarters.includes(trimmedLine)) {
      closeList();
      result.push(`<p class="cms-list-intro">${trimmedLine}</p>`);
      return;
    }

    const isListItem = 
      trimmedLine.endsWith(',') || 
      (trimmedLine.match(/^[a-záčďéěíňóřšťúůýž]/) && !trimmedLine.includes('Pokud')) ||
      trimmedLine.startsWith('obdržíte') ||
      trimmedLine.startsWith('váš dotaz') ||
      trimmedLine.startsWith('v případě potřeby') ||
      trimmedLine.startsWith('e-mail,') ||
      trimmedLine.startsWith('popis') ||
      trimmedLine.startsWith('kdy k') ||
      trimmedLine.startsWith('případně');

    if (isListItem) {
      if (!inList) {
        result.push('<ul class="cms-bullet-list">');
        inList = true;
      }
      const cleanText = trimmedLine.replace(/,$/, '');
      result.push(`<li>${cleanText}</li>`);
      return;
    }

    closeList();
    result.push(`<p>${trimmedLine}</p>`);
  });

  closeList();
  return result.join('\n');
};

/**
 * Transforms plain text content into structured HTML for FAQ/legal documents.
 * - Lines starting with "1.", "2.", "1.1", etc. become questions with gold-accented numbers
 * - Text following until the next numbered line becomes the answer
 * - Empty lines split content into paragraphs
 */
export const transformContentToHtml = (content: string, section?: string, slug?: string): string => {
  // If content already contains significant HTML tags, return as-is
  if (/<(div|section|article|h[1-6]|ul|ol|table)[^>]*>/i.test(content)) {
    return content;
  }

  // Special handling for the support/nahlásit-problém page
  const normalizedSlug = slug ? normalizeSlug(slug) : '';
  if (section === 'support' && normalizedSlug === 'nahlasit-problem') {
    return transformSupportPageContent(content);
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
