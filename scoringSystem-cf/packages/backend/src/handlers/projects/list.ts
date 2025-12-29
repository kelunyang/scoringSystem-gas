/**
 * Project List and Data Handlers
 * Migrated from GAS scripts/projects_api.js
 */

import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { parseJSON } from '../../utils/json';
import { checkIsTeacherOrObserver } from '@utils/permissions';
import { getEffectiveScoringConfig } from '../../utils/scoring-config';

// extractParticipants function removed - no longer needed
// participationProposal is now returned directly with masked percentages for non-group members

/**
 * TypeScript interfaces for database results
 */

/**
 * Submission database row structure
 */
interface SubmissionRow {
  submissionId: string;
  projectId: string;
  stageId: string;
  groupId: string;
  groupName?: string;
  memberNames?: string;  // JSON string array of member display names
  contentMarkdown?: string;
  actualAuthors?: string;  // JSON string
  participationProposal?: string;  // JSON string
  submitTime: number;
  submitterEmail: string;
  status: 'draft' | 'submitted' | 'approved' | 'withdrawn';
  updatedAt?: number;
  withdrawnTime?: number;
  withdrawnBy?: string;
}

/**
 * Processed submission for API response
 */
interface ProcessedSubmission {
  submissionId: string;
  projectId: string;
  stageId: string;
  groupId: string;
  groupName?: string;
  memberNames: string[];  // Array of member display names
  contentMarkdown?: string;
  actualAuthors: string[];
  participationProposal: Record<string, number>;  // Always included, percentages masked to 0 for non-group members
  submitTime: number;
  submitterEmail: string;
  status: string;
  updatedAt?: number;
  withdrawnTime?: number;
  withdrawnBy?: string;
}

interface ProjectRow {
  projectId: string;
  projectName: string;
  description: string;
  status: string;
  createdBy: string;
  createdTime: number;
  updatedAt: number;
  lastModified: number;
  viewerRole: 'teacher' | 'observer' | 'member' | null;
  creatorDisplayName: string | null;
}

interface UserGroupRow {
  projectId: string;
  groupId: string;
  groupName: string;
  role: 'leader' | 'member';
  userEmail: string;
  isActive: number;
}

interface StageRow {
  projectId: string;
  stageId: string;
  stageName: string;
  stageOrder: number;
  startTime: number;
  endTime: number;
  status: string;
  description: string;
  reportRewardPool: number;
  commentRewardPool: number;
}

interface ProjectWithDetails {
  projectId: string;
  projectName: string;
  description: string;
  status: string;
  createdBy: string;
  creatorDisplayName: string | null;
  createdTime: number;
  updatedAt: number;
  lastModified: number;
  viewerRole: 'teacher' | 'observer' | 'member' | null;
  userGroups: Array<{ userEmail: string; groupId: string; groupName: string; role: 'leader' | 'member'; isActive: number }>;
  groups: Array<any>;  // Full groups with allowChange field
  groupMembers: Array<{ groupId: string; userEmail: string; displayName: string; role: 'leader' | 'member'; avatarSeed?: string; avatarStyle?: string; avatarOptions?: string }>;
  stages?: StageRow[] | null;
}

/**
 * List user's projects with optional filters
 */
export async function listUserProjects(
  env: Env,
  userEmail: string,
  filters: {
    status?: string;
    createdBy?: string;
    tagId?: string;
    includeStages?: boolean;
  } = {}
): Promise<Response> {
  try {
    // Check if user is system admin
    const isAdmin = await checkSystemAdmin(env, userEmail);

    let projects: any[];

    if (isAdmin) {
      // Admins see all projects
      projects = await listAllProjectsForAdmin(env, userEmail, filters);
    } else {
      // Regular users see projects based on projectviewers table (viewer role)
      projects = await listProjectsForUser(env, userEmail, filters);
    }

    return successResponse(projects);
  } catch (error) {
    console.error('List user projects error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to list projects');
  }
}

/**
 * Get project core data (project + groups + stages)
 */
export async function getProjectCore(
  env: Env,
  userEmail: string,
  projectId: string
): Promise<Response> {
  try {
    // Check access
    const hasAccess = await checkProjectAccess(env, userEmail, projectId);
    if (!hasAccess) {
      return errorResponse('ACCESS_DENIED', 'No access to this project');
    }

    // Get project
    const project = await env.DB.prepare(`
      SELECT * FROM projects WHERE projectId = ?
    `).bind(projectId).first();

    if (!project) {
      return errorResponse('PROJECT_NOT_FOUND', 'Project not found');
    }

    // Get viewer role (CRITICAL: needed for 6-layer permission model)
    const viewerRoleResult = await env.DB.prepare(`
      SELECT role FROM projectviewers
      WHERE projectId = ? AND userEmail = ? AND isActive = 1
    `).bind(projectId, userEmail).first();

    const viewerRole = viewerRoleResult ? (viewerRoleResult as any).role : null;

    // Get groups
    const groups = await env.DB.prepare(`
      SELECT * FROM groups WHERE projectId = ? AND status = 'active'
    `).bind(projectId).all();

    // Get user groups
    const userGroups = await env.DB.prepare(`
      SELECT * FROM usergroups WHERE projectId = ?
    `).bind(projectId).all();

    // Get stages with auto-calculated status (exclude archived)
    const stages = await env.DB.prepare(`
      SELECT * FROM stages_with_status
      WHERE projectId = ? AND archivedTime IS NULL
      ORDER BY stageOrder
    `).bind(projectId).all();

    // Stage results are already in correct format with startTime/endTime
    const mappedStages = stages.results;

    // Get effective scoring config (handles NULL fallback with 3-tier system)
    const effectiveConfig = await getEffectiveScoringConfig(env.DB, env.KV, env, projectId);

    // Get ALL users involved in project (not just group members)
    // Include: group members, viewers, and project creator
    const userEmailsFromGroups = userGroups.results.map((ug: any) => ug.userEmail);
    const viewersResult = await env.DB.prepare(`
      SELECT userEmail FROM projectviewers
      WHERE projectId = ? AND isActive = 1
    `).bind(projectId).all();
    const userEmailsFromViewers = viewersResult.results.map((v: any) => v.userEmail);

    // Combine and deduplicate: group members + viewers + creator
    const allUserEmails = [...new Set([
      ...userEmailsFromGroups,
      ...userEmailsFromViewers,
      (project as any).createdBy  // Project creator
    ])].filter(Boolean);  // Remove null/undefined

    // Fetch users (handle empty array case)
    let users = { results: [] };
    if (allUserEmails.length > 0) {
      users = await env.DB.prepare(`
        SELECT userId, userEmail, displayName, avatarSeed, avatarStyle, avatarOptions
        FROM users
        WHERE userEmail IN (${allUserEmails.map(() => '?').join(',')})
      `).bind(...allUserEmails).all();
    }

    return successResponse({
      project: {
        ...project,
        // Override potentially NULL scoring config with effective values (3-tier fallback)
        maxCommentSelections: effectiveConfig.maxCommentSelections,
        studentRankingWeight: effectiveConfig.studentRankingWeight,
        teacherRankingWeight: effectiveConfig.teacherRankingWeight,
        commentRewardPercentile: effectiveConfig.commentRewardPercentile,
      },
      groups: groups.results.map((g: any) => ({
        ...g,
        allowChange: Boolean(g.allowChange)  // Convert 0/1 to boolean
      })),
      userGroups: userGroups.results,
      stages: mappedStages,
      users: users.results,
      viewerRole  // Add viewerRole at top level for 6-layer permissions
    });
  } catch (error) {
    console.error('Get project core error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get project core data');
  }
}

/**
 * Get project content data (submissions + comments)
 */
export async function getProjectContent(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  contentType: string = 'all',
  options?: { excludeTeachers?: boolean; excludeUserGroups?: boolean; includeSubmitted?: boolean }
): Promise<Response> {
  try {
    const excludeTeachers = options?.excludeTeachers || false;
    const excludeUserGroups = options?.excludeUserGroups || false;
    const includeSubmitted = options?.includeSubmitted || false;

    console.log('📊 [getProjectContent] Starting:', {
      projectId,
      stageId,
      contentType,
      excludeTeachers,
      excludeUserGroups,
      includeSubmitted,
      userEmail
    });

    // Check access
    const hasAccess = await checkProjectAccess(env, userEmail, projectId);
    if (!hasAccess) {
      return errorResponse('ACCESS_DENIED', 'No access to this project');
    }

    let submissions: ProcessedSubmission[] = [];
    let comments: any[] = [];

    // Query user's groups for permission checking
    const userGroupsResult = await env.DB.prepare(`
      SELECT groupId FROM usergroups
      WHERE userEmail = ? AND projectId = ? AND isActive = 1
    `).bind(userEmail, projectId).all();

    const userGroupIds = new Set(userGroupsResult.results.map((ug: any) => ug.groupId));

    // Check if user has elevated permissions (Teacher/Observer)
    const hasElevatedPermissions = await checkIsTeacherOrObserver(env.DB, userEmail, projectId);

    console.log(`🔐 [getProjectContent] Permission context:`, {
      userEmail,
      userGroupCount: userGroupIds.size,
      hasElevatedPermissions,
      projectId
    });

    if (contentType === 'all' || contentType === 'submissions') {
      // Build query parameters safely using parameterized queries
      const queryParts = {
        baseParams: [projectId, stageId],
        statusFilter: '',
        statusParams: [] as string[],
        userGroupFilter: '',
        userGroupParams: [] as string[]
      };

      // Build status filter with parameterized values
      if (includeSubmitted) {
        queryParts.statusFilter = 's.status IN (?, ?)';
        queryParts.statusParams = ['approved', 'submitted'];
      } else {
        queryParts.statusFilter = 's.status = ?';
        queryParts.statusParams = ['approved'];
      }

      // Build user group filter
      if (excludeUserGroups) {
        queryParts.userGroupFilter = `
          AND s.groupId NOT IN (
            SELECT groupId FROM usergroups
            WHERE userEmail = ? AND projectId = ? AND isActive = 1
          )
        `;
        queryParts.userGroupParams = [userEmail, projectId];
      }

      console.log('🔍 [getProjectContent] Query parameters:', {
        base: queryParts.baseParams,
        status: queryParts.statusParams,
        userGroup: queryParts.userGroupParams
      });

      // Use Window Function to get latest submission per group + LEFT JOIN for groupName and member names
      const submissionsQuery = env.DB.prepare(`
        WITH LatestSubmissions AS (
          SELECT s.*,
                 g.groupName,
                 ROW_NUMBER() OVER (
                   PARTITION BY s.groupId
                   ORDER BY s.submitTime DESC
                 ) as rn
          FROM submissions_with_status s
          LEFT JOIN groups g ON s.groupId = g.groupId
          WHERE s.projectId = ?
            AND s.stageId = ?
            AND ${queryParts.statusFilter}
            ${queryParts.userGroupFilter}
        ),
        GroupMembers AS (
          SELECT
            ug.groupId,
            JSON_GROUP_ARRAY(u.displayName) as memberNames
          FROM usergroups ug
          JOIN users u ON ug.userEmail = u.userEmail
          WHERE ug.projectId = ?
            AND ug.isActive = 1
          GROUP BY ug.groupId
        )
        SELECT ls.submissionId, ls.projectId, ls.stageId, ls.groupId, ls.contentMarkdown,
               ls.actualAuthors, ls.participationProposal, ls.submitTime,
               ls.submitterEmail, ls.status, ls.updatedAt, ls.withdrawnTime, ls.withdrawnBy,
               ls.groupName, gm.memberNames
        FROM LatestSubmissions ls
        LEFT JOIN GroupMembers gm ON ls.groupId = gm.groupId
        WHERE ls.rn = 1
      `).bind(
        ...queryParts.baseParams,
        ...queryParts.statusParams,
        ...queryParts.userGroupParams,
        projectId  // Additional projectId for GroupMembers CTE
      );

      try {
        const submissionsResult = await submissionsQuery.all();

        // Transform submissions with permission-based participation masking
        submissions = (submissionsResult.results as unknown as SubmissionRow[]).map((sub): ProcessedSubmission => {
          try {
            const parsedProposal = parseJSON<Record<string, number>>(sub.participationProposal || '', {});
            const parsedMemberNames = parseJSON<string[]>(sub.memberNames || '', []);

            // Check if user is in this submission's group
            const isGroupMember = userGroupIds.has(sub.groupId);
            const canSeePercentages = hasElevatedPermissions || isGroupMember;

            // Mask percentages to 0 for non-group members (preserve email keys)
            const maskedProposal = canSeePercentages
              ? parsedProposal
              : Object.keys(parsedProposal).reduce((acc, email) => {
                  acc[email] = 0;  // Set percentage to 0 for privacy
                  return acc;
                }, {} as Record<string, number>);

            return {
              submissionId: sub.submissionId,
              projectId: sub.projectId,
              stageId: sub.stageId,
              groupId: sub.groupId,
              groupName: sub.groupName,
              memberNames: parsedMemberNames,  // Add parsed member names array
              contentMarkdown: sub.contentMarkdown,
              actualAuthors: parseJSON<string[]>(sub.actualAuthors || '', []),
              participationProposal: maskedProposal,  // Unified field with permission-based masking
              submitTime: sub.submitTime,
              submitterEmail: sub.submitterEmail,
              status: sub.status,
              updatedAt: sub.updatedAt,
              withdrawnTime: sub.withdrawnTime,
              withdrawnBy: sub.withdrawnBy
            };
          } catch (err) {
            console.error(`Failed to process submission ${sub.submissionId}:`, err);
            // Return submission with safe defaults
            return {
              submissionId: sub.submissionId,
              projectId: sub.projectId,
              stageId: sub.stageId,
              groupId: sub.groupId,
              groupName: sub.groupName,
              memberNames: [],  // Empty array as fallback
              contentMarkdown: sub.contentMarkdown,
              actualAuthors: [],
              participationProposal: {},  // Empty object as fallback
              submitTime: sub.submitTime,
              submitterEmail: sub.submitterEmail,
              status: sub.status,
              updatedAt: sub.updatedAt,
              withdrawnTime: sub.withdrawnTime,
              withdrawnBy: sub.withdrawnBy
            };
          }
        });
      } catch (err) {
        console.error('Failed to fetch submissions:', err);
        return errorResponse('DATABASE_ERROR', 'Failed to fetch submissions');
      }
    }

    if (contentType === 'all' || contentType === 'comments') {
      // Build query with teacher filtering and group membership info
      let commentsQuery = `
        SELECT
          c.*,
          u.displayName as authorDisplayName,
          pv.role as authorRole,
          ug.role as groupRole
        FROM comments c
        LEFT JOIN users u ON u.userEmail = c.authorEmail
        LEFT JOIN projectviewers pv
          ON pv.userEmail = c.authorEmail
          AND pv.projectId = c.projectId
          AND pv.isActive = 1
        LEFT JOIN usergroups ug
          ON ug.userEmail = c.authorEmail
          AND ug.projectId = c.projectId
          AND ug.isActive = 1
          AND (ug.role = 'leader' OR ug.role = 'member')
        WHERE c.projectId = ?
      `;

      const queryParams = [projectId];

      if (stageId) {
        commentsQuery += ` AND c.stageId = ?`;
        queryParams.push(stageId);
      }

      if (excludeTeachers) {
        commentsQuery += `
          AND (pv.role IS NULL OR pv.role != 'teacher')
        `;
        console.log('🚫 [getProjectContent] Filtering out teacher comments');
      }

      commentsQuery += ` ORDER BY c.createdTime ASC`;

      console.log('🔍 [getProjectContent] Comments query:', {
        hasStageId: !!stageId,
        excludeTeachers,
        queryParamsCount: queryParams.length
      });

      try {
        const commentsResult = await env.DB.prepare(commentsQuery).bind(...queryParams).all();

        const rawComments = commentsResult.results as any[];
        console.log('📝 [getProjectContent] Raw comments loaded:', rawComments.length);

        // Process comments to add metadata
        comments = rawComments.map(c => {
        const isGroupMember = !!(c.groupRole); // leader or member

        // Parse mentions
        let mentionedGroups: string[] = [];
        let mentionedUsers: string[] = [];

        try {
          if (c.mentionedGroups) {
            mentionedGroups = JSON.parse(c.mentionedGroups as string);
          }
        } catch (e) {
          console.warn('Failed to parse mentionedGroups:', e);
        }

        try {
          if (c.mentionedUsers) {
            mentionedUsers = JSON.parse(c.mentionedUsers as string);
          }
        } catch (e) {
          console.warn('Failed to parse mentionedUsers:', e);
        }

        return {
          ...c,
          authorDisplayName: c.authorDisplayName || (c.authorEmail as string)?.split('@')[0],
          isGroupMember,
          mentionedGroups,
          mentionedUsers
        };
        });

        console.log('✅ [getProjectContent] Comments processed:', {
          total: comments.length,
          withGroupMembership: comments.filter((c: any) => c.isGroupMember).length,
          teacherComments: rawComments.filter((c: any) => c.authorRole === 'teacher').length,
          excludedTeachers: excludeTeachers
        });
      } catch (err) {
        console.error('Failed to fetch comments:', err);
        return errorResponse('DATABASE_ERROR', 'Failed to fetch comments');
      }
    }

    return successResponse({
      submissions,
      comments,
      metadata: {
        projectId,
        stageId,
        contentType,
        totalSubmissions: submissions.length,
        totalComments: comments.length,
        loadedAt: Date.now()
      }
    });
  } catch (error) {
    console.error('Get project content error:', error);
    return errorResponse('SYSTEM_ERROR', 'Failed to get project content data');
  }
}

/**
 * List projects for regular user (using project viewer role system)
 * Updated to use 4-layer permission model with optimized single query
 */
async function listProjectsForUser(
  env: Env,
  userEmail: string,
  filters: { status?: string; createdBy?: string; tagId?: string; includeStages?: boolean }
): Promise<ProjectWithDetails[]> {
  try {
    // Single query to get all accessible projects with viewer roles
    // This eliminates N+1 query problem
    const projectsResult = await env.DB.prepare(`
      SELECT DISTINCT
        p.projectId,
        p.projectName,
        p.description,
        p.status,
        p.createdBy,
        p.createdTime,
        p.updatedAt,
        p.lastModified,
        pv.role as viewerRole,
        creator.displayName as creatorDisplayName
      FROM projects p
      LEFT JOIN projectviewers pv
        ON p.projectId = pv.projectId
        AND pv.userEmail = ?
        AND pv.isActive = 1
      LEFT JOIN users creator
        ON p.createdBy = creator.userId
      WHERE p.status NOT IN ('deleted', 'archived')
        AND pv.id IS NOT NULL
      ORDER BY p.createdTime DESC
    `).bind(userEmail).all();

    if (!projectsResult.results || projectsResult.results.length === 0) {
      return [];
    }

    const projects = projectsResult.results as unknown as ProjectRow[];
    const projectIds = projects.map(p => p.projectId);

    // Batch fetch user groups for all projects in single query
    const userGroupsMap = await batchGetUserGroups(env, userEmail, projectIds);

    // Batch fetch all groups (with allowChange field for permission calculation)
    const groupsMap = await batchGetGroups(env, projectIds);

    // Batch fetch all group members with avatar data
    const groupMembersMap = await batchGetGroupMembers(env, projectIds);

    // Batch fetch stages if requested
    let stagesMap: Map<string, StageRow[]> = new Map();
    if (filters.includeStages) {
      stagesMap = await batchGetStages(env, projectIds);
    }

    // Assemble final results
    const userProjects: ProjectWithDetails[] = projects.map(proj => ({
      projectId: proj.projectId,
      projectName: proj.projectName,
      description: proj.description,
      status: proj.status,
      createdBy: proj.createdBy,
      creatorDisplayName: proj.creatorDisplayName,
      createdTime: proj.createdTime,
      updatedAt: proj.updatedAt,
      lastModified: proj.lastModified,
      viewerRole: proj.viewerRole, // teacher/observer/member
      userGroups: userGroupsMap.get(proj.projectId) || [],
      groups: groupsMap.get(proj.projectId) || [],  // Full groups with allowChange
      groupMembers: groupMembersMap.get(proj.projectId) || [],
      stages: filters.includeStages ? (stagesMap.get(proj.projectId) || []) : null
    }));

    // Apply additional filters (status, etc.)
    return applyFilters(userProjects, filters, null);
  } catch (error) {
    console.error('List projects for user error:', error);
    throw new Error(`Failed to list projects: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Batch fetch user groups for multiple projects in a single query
 */
async function batchGetUserGroups(
  env: Env,
  userEmail: string,
  projectIds: string[]
): Promise<Map<string, Array<{ userEmail: string; groupId: string; groupName: string; role: 'leader' | 'member'; isActive: number }>>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const placeholders = projectIds.map(() => '?').join(',');
  const result = await env.DB.prepare(`
    SELECT ug.projectId, ug.userEmail, ug.groupId, ug.role, ug.isActive, g.groupName
    FROM usergroups ug
    JOIN groups g ON ug.groupId = g.groupId
    WHERE ug.projectId IN (${placeholders})
      AND ug.userEmail = ?
      AND ug.isActive = 1
  `).bind(...projectIds, userEmail).all();

  const groupsMap = new Map<string, Array<{ userEmail: string; groupId: string; groupName: string; role: 'leader' | 'member'; isActive: number }>>();
  for (const row of result.results) {
    const ug = row as unknown as UserGroupRow;
    if (!groupsMap.has(ug.projectId)) {
      groupsMap.set(ug.projectId, []);
    }
    groupsMap.get(ug.projectId)!.push({
      userEmail: ug.userEmail,
      groupId: ug.groupId,
      groupName: ug.groupName,
      role: ug.role,
      isActive: ug.isActive
    });
  }

  return groupsMap;
}

/**
 * Batch fetch all group members with avatar data for multiple projects
 */
async function batchGetGroupMembers(
  env: Env,
  projectIds: string[]
): Promise<Map<string, Array<{ groupId: string; userEmail: string; displayName: string; role: 'leader' | 'member'; avatarSeed?: string; avatarStyle?: string; avatarOptions?: string }>>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const placeholders = projectIds.map(() => '?').join(',');
  const result = await env.DB.prepare(`
    SELECT ug.projectId, ug.groupId, ug.userEmail, ug.role,
           u.displayName, u.avatarSeed, u.avatarStyle, u.avatarOptions
    FROM usergroups ug
    JOIN users u ON ug.userEmail = u.userEmail
    WHERE ug.projectId IN (${placeholders})
      AND ug.isActive = 1
    ORDER BY ug.groupId, ug.role DESC, ug.joinTime ASC
  `).bind(...projectIds).all();

  const membersMap = new Map<string, Array<any>>();
  for (const row of result.results) {
    const member = row as any;
    if (!membersMap.has(member.projectId)) {
      membersMap.set(member.projectId, []);
    }
    membersMap.get(member.projectId)!.push({
      groupId: member.groupId,
      userEmail: member.userEmail,
      displayName: member.displayName,
      role: member.role,
      avatarSeed: member.avatarSeed,
      avatarStyle: member.avatarStyle,
      avatarOptions: member.avatarOptions
    });
  }

  return membersMap;
}

/**
 * Batch fetch all groups for multiple projects in a single query
 * Converts allowChange from 0/1 to boolean
 */
async function batchGetGroups(
  env: Env,
  projectIds: string[]
): Promise<Map<string, Array<any>>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const placeholders = projectIds.map(() => '?').join(',');
  const result = await env.DB.prepare(`
    SELECT * FROM groups
    WHERE projectId IN (${placeholders})
      AND status = 'active'
  `).bind(...projectIds).all();

  const groupsMap = new Map<string, Array<any>>();
  for (const row of result.results) {
    const group = row as any;
    if (!groupsMap.has(group.projectId)) {
      groupsMap.set(group.projectId, []);
    }
    // Convert allowChange: 0/1 → false/true
    groupsMap.get(group.projectId)!.push({
      ...group,
      allowChange: Boolean(group.allowChange)
    });
  }

  return groupsMap;
}

/**
 * Batch fetch stages for multiple projects in a single query
 */
async function batchGetStages(
  env: Env,
  projectIds: string[]
): Promise<Map<string, StageRow[]>> {
  if (projectIds.length === 0) {
    return new Map();
  }

  const placeholders = projectIds.map(() => '?').join(',');
  const result = await env.DB.prepare(`
    SELECT projectId, stageId, stageName, stageOrder,
           startTime, endTime,
           status,
           description, reportRewardPool, commentRewardPool
    FROM stages_with_status
    WHERE projectId IN (${placeholders})
      AND archivedTime IS NULL
    ORDER BY stageOrder
  `).bind(...projectIds).all();

  const stagesMap = new Map<string, StageRow[]>();
  for (const row of result.results) {
    const stage = row as unknown as StageRow;
    if (!stagesMap.has(stage.projectId)) {
      stagesMap.set(stage.projectId, []);
    }
    stagesMap.get(stage.projectId)!.push(stage);
  }

  return stagesMap;
}

/**
 * List all projects for admin
 */
async function listAllProjectsForAdmin(
  env: Env,
  userEmail: string,
  filters: any
): Promise<any[]> {
  try {
    // Get userId for createdBy comparison
    const userId = await getUserId(env, userEmail);

    // LEFT JOIN with users table to get creator's display name
    const allProjects = await env.DB.prepare(`
      SELECT
        p.*,
        u.displayName as creatorDisplayName
      FROM projects p
      LEFT JOIN users u ON p.createdBy = u.userId
      WHERE p.status NOT IN ('deleted', 'archived')
    `).all();

    if (!allProjects.results || allProjects.results.length === 0) {
      return [];
    }

    const projectIds = allProjects.results.map((p: any) => p.projectId);

    // Batch fetch user groups for admin
    const userGroupsMap = await batchGetUserGroups(env, userEmail, projectIds);

    // Batch fetch all groups (with allowChange field for permission calculation)
    const groupsMap = await batchGetGroups(env, projectIds);

    // Batch fetch all group members with avatar data
    const groupMembersMap = await batchGetGroupMembers(env, projectIds);

    // Batch fetch stages if requested
    let stagesMap: Map<string, StageRow[]> = new Map();
    if (filters.includeStages) {
      stagesMap = await batchGetStages(env, projectIds);
    }

    const userProjects: any[] = allProjects.results.map((project: any) => {
      const proj = project as any;
      const userGroups = userGroupsMap.get(proj.projectId) || [];
      const isLeader = userGroups.some((ug: any) => ug.role === 'leader');
      const isCreator = proj.createdBy === userId;

      return {
        projectId: proj.projectId,
        projectName: proj.projectName,
        description: proj.description,
        status: proj.status,
        totalStages: proj.totalStages,
        currentStage: proj.currentStage,
        createdBy: proj.createdBy,
        creatorDisplayName: proj.creatorDisplayName,
        createdTime: proj.createdTime,
        lastModified: proj.lastModified,
        isCreator,
        isLeader,
        userGroups,
        groups: groupsMap.get(proj.projectId) || [],  // Full groups with allowChange
        groupMembers: groupMembersMap.get(proj.projectId) || [],
        stages: filters.includeStages ? (stagesMap.get(proj.projectId) || []) : null,
        // Scoring configuration fields
        scoreRangeMin: proj.scoreRangeMin ?? 0,
        scoreRangeMax: proj.scoreRangeMax ?? 100,
        maxCommentSelections: proj.maxCommentSelections ?? null,
        studentRankingWeight: proj.studentRankingWeight ?? null,
        teacherRankingWeight: proj.teacherRankingWeight ?? null,
        commentRewardPercentile: proj.commentRewardPercentile ?? null
      };
    });

    return applyFilters(userProjects, filters, userId);
  } catch (error) {
    console.error('List all projects for admin error:', error);
    return [];
  }
}

/**
 * Apply filters to project list
 */
function applyFilters(
  projects: ProjectWithDetails[],
  filters: { status?: string; createdBy?: string; tagId?: string; includeStages?: boolean },
  userId: string | null
): ProjectWithDetails[] {
  let filtered = projects;

  if (filters.status) {
    filtered = filtered.filter(p => p.status === filters.status);
  }

  if (filters.createdBy === 'me') {
    // For admin view only (regular users don't have isCreator field)
    filtered = filtered.filter(p => (p as any).isCreator === true);
  }

  // DISABLED: Tags system has been disabled
  /*
  if (filters.tagId) {
    // For admin view only (regular users don't have tags field)
    filtered = filtered.filter(p => {
      const tags = (p as any).tags;
      return tags && Array.isArray(tags) && tags.some((tag: any) => tag.tagId === filters.tagId);
    });
  }
  */

  // Sort by last modified
  filtered.sort((a, b) => b.lastModified - a.lastModified);

  return filtered;
}

/**
 * Helper functions
 */

/**
 * Check if user has global permissions to see all projects
 * Users with system_admin or create_project can see all projects
 */
async function checkSystemAdmin(env: Env, userEmail: string): Promise<boolean> {
  const result = await env.DB.prepare(`
    SELECT gg.globalPermissions
    FROM globalusergroups gug
    JOIN globalgroups gg ON gug.globalGroupId = gg.globalGroupId
    WHERE gug.userEmail = ?
  `).bind(userEmail).all();

  for (const row of result.results) {
    const permissions = parseJSON<string[]>(row.globalPermissions as string, []);
    // Users with system_admin OR create_project can see all projects
    if (permissions.includes('system_admin') || permissions.includes('create_project')) {
      return true;
    }
  }

  return false;
}

/**
 * Check if user has access to a project
 * User has access if:
 * - Has system_admin or create_project global permission
 * - Is in projectviewers (teacher/observer)
 * - Is a member through usergroups
 */
async function checkProjectAccess(env: Env, userEmail: string, projectId: string): Promise<boolean> {
  // Check for global permissions
  const isAdmin = await checkSystemAdmin(env, userEmail);
  if (isAdmin) return true;

  // Check if user is in projectviewers (teacher/observer)
  const viewer = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM projectviewers
    WHERE projectId = ? AND userEmail = ? AND isActive = 1
  `).bind(projectId, userEmail).first();

  if (viewer && (viewer.count as number) > 0) return true;

  // Check if user is a member through usergroups
  const membership = await env.DB.prepare(`
    SELECT COUNT(*) as count
    FROM usergroups
    WHERE projectId = ? AND userEmail = ? AND isActive = 1
  `).bind(projectId, userEmail).first();

  return membership ? (membership.count as number) > 0 : false;
}

async function getUserId(env: Env, userEmail: string): Promise<string | null> {
  const user = await env.DB.prepare('SELECT userId FROM users WHERE userEmail = ?')
    .bind(userEmail).first();
  return user ? (user.userId as string) : null;
}

// DISABLED: Tags system has been disabled
/*
async function getProjectTags(env: Env, projectId: string): Promise<any[]> {
  const result = await env.DB.prepare(`
    SELECT t.tagId, t.tagName
    FROM projecttags pt
    JOIN globaltags t ON pt.tagId = t.tagId
    WHERE pt.projectId = ? AND pt.isActive = 1 AND t.isActive = 1
  `).bind(projectId).all();

  return result.results.map((t: any) => ({
    tagId: t.tagId,
    tagName: t.tagName
  }));
}
*/

async function getProjectStages(env: Env, projectId: string): Promise<any[]> {
  const result = await env.DB.prepare(`
    SELECT stageId, stageName, stageOrder,
           startTime, endTime,
           status,
           description, reportRewardPool, commentRewardPool
    FROM stages_with_status
    WHERE projectId = ?
      AND archivedTime IS NULL
    ORDER BY stageOrder
  `).bind(projectId).all();

  return result.results as any[];
}
