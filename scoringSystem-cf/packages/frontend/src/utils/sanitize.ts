/**
 * @fileoverview HTML Sanitization Utility
 *
 * Provides DOMPurify-based HTML sanitization for user-generated content
 * to prevent XSS (Cross-Site Scripting) attacks.
 *
 * Used primarily for markdown-rendered content in:
 * - Submission content (contentMarkdown)
 * - Comment content
 */

import DOMPurify from 'dompurify'

/**
 * Sanitize HTML content to prevent XSS attacks
 *
 * Configuration:
 * - Allows common safe HTML tags (p, br, strong, em, etc.)
 * - Allows safe attributes (href, src, alt, title, etc.)
 * - Strips dangerous tags (script, iframe, object, embed)
 * - Strips event handlers (onclick, onerror, etc.)
 *
 * @param html - Raw HTML content to sanitize
 * @returns Sanitized HTML safe for v-html rendering
 */
export function sanitizeHtml(html: string | null | undefined): string {
  if (!html || typeof html !== 'string') {
    return ''
  }

  return DOMPurify.sanitize(html, {
    // Allow common markdown-rendered tags
    ALLOWED_TAGS: [
      'p', 'br', 'span', 'div',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
      'ul', 'ol', 'li',
      'blockquote', 'pre', 'code',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'hr'
    ],

    // Allow safe attributes
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height',
      'class', 'id', 'style',
      'target', 'rel'
    ],

    // Additional security options
    ALLOW_DATA_ATTR: false,  // Prevent data-* attributes
    ALLOW_UNKNOWN_PROTOCOLS: false,  // Only allow http, https, mailto
    SAFE_FOR_TEMPLATES: true,  // Extra safety for template engines

    // Force target="_blank" for external links (security best practice)
    ADD_ATTR: ['target']
  })

  // Custom hook to enforce rel="noopener noreferrer" on external links
  DOMPurify.addHook('afterSanitizeAttributes', (node: any) => {
    // Set all links to open in new tab with security attributes
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noopener noreferrer')
    }
  })
}

/**
 * Sanitize plain text (escape HTML entities)
 * Use this for displaying user input that should NOT contain any HTML
 *
 * @param text - Plain text to escape
 * @returns HTML-escaped text
 */
export function sanitizeText(text: string | null | undefined): string {
  if (!text || typeof text !== 'string') {
    return ''
  }

  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
