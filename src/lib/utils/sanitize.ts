import DOMPurify from 'isomorphic-dompurify';

/**
 * Allowed HTML tags for sanitization.
 * Covers common formatting, links, images, tables, and code blocks.
 */
const ALLOWED_TAGS = [
  'b', 'i', 'u', 's', 'em', 'strong',
  'a', 'br', 'p',
  'ul', 'ol', 'li',
  'span', 'div',
  'img',
  'table', 'tr', 'td', 'th', 'thead', 'tbody',
  'h1', 'h2', 'h3', 'h4',
  'pre', 'code', 'blockquote',
];

/**
 * Allowed HTML attributes for sanitization.
 * Covers link targets, image sources, styling, and table layout.
 */
const ALLOWED_ATTR = [
  'href', 'target', 'rel',
  'src', 'alt',
  'class', 'style',
  'width', 'height',
  'colspan', 'rowspan',
];

/**
 * Sanitizes an HTML string, keeping only whitelisted tags and attributes.
 * Removes script tags, event handlers, and other XSS vectors.
 *
 * Works in both server (SSR) and client environments via isomorphic-dompurify.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ADD_ATTR: ['target'],
    FORCE_BODY: true,
  });
}

/**
 * Strips all HTML tags from a string, returning plain text.
 * Useful for text-only contexts like notifications or search indexing.
 */
export function sanitizeText(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [],
  });
}
