/**
 * Text effects utility - processes .text-wave and .text-wave-fast elements by splitting text into letter spans.
 * Uses MutationObserver to handle dynamically added content (speech bubbles, etc.).
 */

const TEXT_WAVE_PROCESSED = 'data-text-wave-processed';

/**
 * Restore a processed wave element to plain text (unwrap letter spans).
 */
function unwrapTextWaveElement(el) {
  const letters = el.querySelectorAll('.text-wave-letter');
  if (letters.length === 0) return;
  const text = Array.from(letters).map((s) => (s.textContent === '\u00A0' ? ' ' : s.textContent)).join('');
  letters.forEach((s) => s.remove());
  el.appendChild(document.createTextNode(text));
  el.removeAttribute(TEXT_WAVE_PROCESSED);
}

/**
 * Split a .text-wave or .text-wave-fast element's text into individual letter spans with staggered animation.
 * Preserves nested HTML by only splitting text nodes.
 */
function processTextWaveElement(el) {
  if (el.getAttribute(TEXT_WAVE_PROCESSED) === 'true') return;

  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
  const textNodes = [];
  let n;
  while ((n = walker.nextNode())) textNodes.push(n);

  if (textNodes.length === 0) {
    el.setAttribute(TEXT_WAVE_PROCESSED, 'true');
    return;
  }

  let letterIndex = 0;
  textNodes.forEach((textNode) => {
    const text = textNode.textContent;
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const span = document.createElement('span');
      span.className = 'text-wave-letter';
      // Use non-breaking space so spaces don't collapse with display:inline-block
      span.textContent = char === ' ' ? '\u00A0' : char;
      span.style.animationDelay = `${letterIndex * 0.1}s`;
      fragment.appendChild(span);
      letterIndex++;
    }
    textNode.parentNode.replaceChild(fragment, textNode);
  });

  el.setAttribute(TEXT_WAVE_PROCESSED, 'true');
}

/**
 * Process all .text-wave and .text-wave-fast elements in a container (or document).
 * @param {Document|Element} container - Container to search (default: document)
 * @param {boolean} force - If true, re-process even already-processed elements (use when container was hidden during init)
 */
export function processTextWaveElements(container = document, force = false) {
  const selector = '.text-wave, .text-wave-fast';
  const elements = container.querySelectorAll(selector);
  elements.forEach((el) => {
    if (force && el.getAttribute(TEXT_WAVE_PROCESSED) === 'true') {
      unwrapTextWaveElement(el);
    }
    if (el.getAttribute(TEXT_WAVE_PROCESSED) !== 'true') {
      processTextWaveElement(el);
    }
  });
}

/**
 * Initialize text effects: process existing elements and watch for new ones.
 */
export function initTextEffects() {
  processTextWaveElements();

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (node.classList?.contains('text-wave') || node.classList?.contains('text-wave-fast')) {
            processTextWaveElement(node);
          }
          processTextWaveElements(node);
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
