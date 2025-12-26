/**
 * @fileoverview HTML sanitization utilities using sanitize-html
 * Prevents XSS attacks in user-submitted content
 *
 * Note: Uses sanitize-html instead of DOMPurify because Cloudflare Workers
 * does not have DOM/window objects (V8 isolate environment)
 */

import sanitizeHtml from 'sanitize-html';

/**
 * Sanitize HTML content to prevent XSS attacks
 *
 * @param html - Raw HTML string to sanitize
 * @param allowMarkdown - If true, allows basic Markdown-compatible HTML tags
 * @returns Sanitized HTML string
 *
 * @example
 * const clean = sanitizeHtml('<script>alert("XSS")</script><p>Safe content</p>');
 * // Returns: '<p>Safe content</p>'
 */
export function sanitizeHtmlContent(html: string, allowMarkdown: boolean = true): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  const config = allowMarkdown
    ? {
        // Allow basic Markdown-compatible HTML tags
        allowedTags: [
          'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'ul', 'ol', 'li',
          'blockquote',
          'a', 'img',
          'table', 'thead', 'tbody', 'tr', 'th', 'td'
        ],
        allowedAttributes: {
          'a': ['href', 'title'],
          'img': ['src', 'alt', 'title'],
          '*': ['class', 'id']  // For syntax highlighting in code blocks
        },
        // Allow only safe URL protocols
        allowedSchemes: ['http', 'https', 'mailto', 'tel'],
        // Remove scripts and dangerous attributes
        disallowedTagsMode: 'discard',
        // Enforce valid URLs
        allowProtocolRelative: false
      }
    : {
        // Strict mode - strip all HTML
        allowedTags: [],
        allowedAttributes: {}
      };

  return sanitizeHtml(html, config);
}

/**
 * Sanitize plain text (strip all HTML)
 * Use for non-HTML fields like project names, usernames, etc.
 *
 * @param text - Text to sanitize
 * @returns Text with all HTML stripped
 *
 * @example
 * const clean = sanitizePlainText('<script>alert("XSS")</script>Hello');
 * // Returns: 'Hello'
 */
export function sanitizePlainText(text: string): string {
  return sanitizeHtmlContent(text, false);
}

/**
 * Sanitize Markdown-compatible description
 * Allows basic formatting but removes dangerous content
 *
 * @param description - Description text (may contain Markdown/HTML)
 * @returns Sanitized description
 *
 * @example
 * const clean = sanitizeDescription('# Title\n<script>alert("XSS")</script>\nSafe **content**');
 * // Returns: '# Title\n\nSafe **content**'
 */
export function sanitizeDescription(description: string): string {
  return sanitizeHtmlContent(description, true);
}
