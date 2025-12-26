/**
 * Avatar utility functions
 * Extracted from UserManagement.vue to follow DRY principle
 */

import type { User } from '@repo/shared'

/**
 * Generic avatar data interface
 * Any object with these fields can be used for avatar generation
 */
export interface AvatarData {
  userEmail: string
  displayName?: string | null
  avatarSeed?: string | null
  avatarStyle?: string
  avatarOptions?: string | object
}

/**
 * Parse avatar options from string or object
 */
export function parseAvatarOptions(options: string | object | undefined): Record<string, any> {
  if (typeof options === 'string') {
    try {
      return JSON.parse(options)
    } catch (e) {
      console.warn('Failed to parse avatarOptions:', e)
      return {}
    }
  }
  return options || {}
}

/**
 * Generate Dicebear avatar URL
 */
export function generateDicebearUrl(
  seed: string,
  style: string = 'avataaars',
  options: Record<string, any> = {}
): string {
  const baseUrl = `https://api.dicebear.com/7.x/${style}/svg`
  const params = new URLSearchParams({
    seed,
    ...options
  })
  return `${baseUrl}?${params.toString()}`
}

/**
 * Generate initials-based fallback avatar (for errors)
 */
export function generateInitialsAvatar(user: Partial<AvatarData> | null): string {
  if (!user) return ''

  const name = user.displayName || user.userEmail || 'User'
  const initials = name
    .split(' ')
    .map((word: string) => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=random&size=128`
}

/**
 * Get avatar URL for a user with optional extra options
 */
export function getAvatarUrl(
  user: Partial<AvatarData> | null,
  extraOptions?: Record<string, any>,
  fallbackMode: boolean = false
): string {
  if (!user || fallbackMode) {
    return generateInitialsAvatar(user)
  }

  // Use deterministic seed if avatarSeed is not set
  const seed = user.avatarSeed || (user.userEmail ? generateAvatarSeed(user.userEmail) : 'default')
  const style = user.avatarStyle || 'avataaars'
  const parsed = parseAvatarOptions(user.avatarOptions)
  const final = { ...parsed, ...extraOptions }

  return generateDicebearUrl(seed, style, final)
}

/**
 * Generate a deterministic avatar seed based on email
 * Same email always produces same seed for consistency
 */
export function generateAvatarSeed(email: string): string {
  // Simple hash function (djb2 algorithm)
  let hash = 5381
  for (let i = 0; i < email.length; i++) {
    const char = email.charCodeAt(i)
    hash = ((hash << 5) + hash) + char // hash * 33 + char
    hash = hash & hash // Ensure 32-bit integer
  }

  // Convert to base36 for shorter, URL-safe string
  return `email_${Math.abs(hash).toString(36)}`
}
