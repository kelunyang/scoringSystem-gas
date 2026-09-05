/**
 * The frontend's notion of "project admin" drifted from the server's in both
 * directions at once. These pin it to the server's rule.
 */

import { describe, it, expect } from 'vitest'
import { hasProjectAdminRole } from '../useProjectAdminRole'

const PROJECT = { createdBy: 'usr_owner' }

describe('hasProjectAdminRole', () => {
  it('grants system_admin regardless of who created the project', () => {
    expect(hasProjectAdminRole(['system_admin'], 'usr_other', PROJECT)).toBe(true)
  })

  it('grants the project creator', () => {
    expect(hasProjectAdminRole([], 'usr_owner', PROJECT)).toBe(true)
  })

  it('refuses create_project on a project someone else created', () => {
    // The divergence issue #006 predicted: every admin control visible, every
    // one of them 403 from the server.
    expect(hasProjectAdminRole(['create_project'], 'usr_other', PROJECT)).toBe(false)
  })

  it('keeps the creator even after create_project is revoked', () => {
    expect(hasProjectAdminRole([], 'usr_owner', PROJECT)).toBe(true)
  })

  it('refuses everyone else', () => {
    expect(hasProjectAdminRole([], 'usr_other', PROJECT)).toBe(false)
    expect(hasProjectAdminRole(['manage_users'], 'usr_other', PROJECT)).toBe(false)
  })

  it('is safe while data is still loading', () => {
    expect(hasProjectAdminRole(null, null, null)).toBe(false)
    expect(hasProjectAdminRole(undefined, 'usr_owner', undefined)).toBe(false)
    expect(hasProjectAdminRole(['system_admin'], null, null)).toBe(true)
  })

  it('does not treat a missing createdBy as a match', () => {
    expect(hasProjectAdminRole([], 'usr_owner', { createdBy: null })).toBe(false)
    expect(hasProjectAdminRole([], '', { createdBy: '' })).toBe(false)
  })
})
