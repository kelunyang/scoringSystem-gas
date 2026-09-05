/**
 * @fileoverview The single definition of "administrative access to a project",
 * mirroring the backend's `checkProjectPermission` Level 0 rule.
 *
 * Three composables answered this question independently
 * (`useProjectPermissions`, `useDetailedProjectPermissions`, `useProjectRole`)
 * and all three answered it differently from the server:
 *
 * | Holder                | backend | the three composables |
 * |-----------------------|---------|-----------------------|
 * | `system_admin`        | yes     | yes                   |
 * | the project's creator | yes     | **no**                |
 * | `create_project`      | **no**  | yes                   |
 *
 * Neither direction was visible in practice, because the only account holding
 * `create_project` also held `system_admin` and had created the projects it
 * touched. Issue #006 flagged what happens once that stops being true: an
 * account with `create_project` alone sees every administrative control on
 * every project and gets 403 from all of them.
 *
 * Keeping the rule in one place does not make the frontend authoritative — the
 * server still decides — but it stops the UI promising things the server will
 * refuse.
 */

/** What the caller knows about the project. `createdBy` is a userId. */
export interface ProjectAdminSubject {
  createdBy?: string | null
}

/**
 * Whether this user holds administrative access to this project.
 *
 * Mirrors `middleware/permissions.ts` `checkProjectPermission`: Level 0 is
 * `system_admin` **or** being the project's creator. `create_project` is the
 * permission to create *new* projects and confers nothing over existing ones.
 *
 * @param globalPermissions - The user's global permissions
 * @param userId - The current user's id, compared against `project.createdBy`
 * @param project - The project being judged; may be null while loading
 * @returns true when the server would grant `manage`/`view` at Level 0
 *
 * @example
 * hasProjectAdminRole(['system_admin'], 'usr_1', project)          // true
 * hasProjectAdminRole(['create_project'], 'usr_1', { createdBy: 'usr_1' }) // true — creator
 * hasProjectAdminRole(['create_project'], 'usr_1', { createdBy: 'usr_2' }) // false
 */
export function hasProjectAdminRole(
  globalPermissions: readonly string[] | null | undefined,
  userId: string | null | undefined,
  project: ProjectAdminSubject | null | undefined
): boolean {
  if (globalPermissions?.includes('system_admin')) return true

  // A creator keeps administrative access even if `create_project` is later
  // revoked, which is how the server behaves.
  return Boolean(userId && project?.createdBy && project.createdBy === userId)
}
