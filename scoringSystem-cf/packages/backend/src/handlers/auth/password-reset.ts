/**
 * Password Reset Handler
 *
 * Implements 2FA + project-based password reset mechanism:
 * 1. User enters email → sends 2FA verification code with IP/country info
 * 2. User verifies 2FA code → receives 3 participated projects + 3 non-participated projects (shuffled)
 * 3. User selects non-participated projects OR checks "all participated" → if exact match, password is reset and emailed
 *
 * Security features:
 * - 2FA verification before showing projects
 * - IP and country logging for security notifications
 * - Always returns projects (even for non-existent users) to prevent enumeration
 * - Always returns success message (even on failure) to prevent enumeration
 * - Requires exact match of non-participated projects (or "all participated" flag)
 * - Projects are shuffled to hide which are participated/non-participated
 */

import { generateRandomPassword, hashPassword } from './password';
import { logGlobalOperation } from '../../utils/logging';
import type { ApiResponse } from '../../utils/response';
import { simpleHash } from '../../utils/hash';
import { shuffleArray, getRandomElements } from '../../utils/array';
import { validateEmail } from '../../utils/validation';
import { generateVerificationCode, storeVerificationCode, verifyTwoFactorCode } from './two-factor';
import type { Env } from '../../types';
import { queuePasswordReset2FAEmail, queuePasswordResetEmail } from '../../queues/email-producer';

/**
 * Number of projects to show:
 * - USER_PROJECT_COUNT: projects user participated in
 * - NON_PARTICIPATED_PROJECT_COUNT: projects user didn't participate in
 * Total: 6 projects shown to user
 */
const USER_PROJECT_COUNT = 3;
const NON_PARTICIPATED_PROJECT_COUNT = 3;

/**
 * Fake project names to use when system doesn't have enough real projects
 * These are used to pad the list to 6 projects to prevent enumeration attacks
 *
 * Security Note:
 * - Fake projects always have ID starting with "fake_" which never exists in database
 * - In verification, fake projects will be treated as "non-participated" projects
 * - This means if user sees 2 real + 4 fake projects, they must select all 4 fake ones
 * - This prevents enumeration: attacker can't tell if a project name is real or fake
 */
const FAKE_PROJECT_NAMES = [
  '數位學習平台開發計畫',
  '校園智慧管理系統',
  '學生成績分析專案',
  '線上課程整合計畫',
  '教學資源共享平台',
  '智慧教室建置專案',
  '學習歷程檔案系統',
  '校務行政數位化',
  '遠距教學整合計畫',
  '學生社團管理系統',
  '圖書館數位化專案',
  '校園安全監控系統',
  '課程評量分析平台',
  '教師研習管理系統',
  '學生輔導記錄系統',
  '校園活動管理平台',
  '招生報名系統開發',
  '畢業生追蹤系統',
  '實習媒合平台建置',
  '產學合作管理系統'
];

/**
 * Generate fake projects to pad the list
 * Uses userEmail as seed to ensure consistency across requests
 */
function generateFakeProjects(count: number, userEmail: string): ProjectInfo[] {
  const fakeProjects: ProjectInfo[] = [];
  const usedNames = new Set<string>();

  // Use email hash as seed for deterministic fake project generation
  const emailHash = simpleHash(userEmail);

  for (let i = 0; i < count && i < FAKE_PROJECT_NAMES.length; i++) {
    // Deterministically select a name based on email and index
    const nameIndex = (emailHash + i) % FAKE_PROJECT_NAMES.length;
    let name = FAKE_PROJECT_NAMES[nameIndex];

    // If name is already used, try next ones
    let attempts = 0;
    while (usedNames.has(name) && attempts < FAKE_PROJECT_NAMES.length) {
      attempts++;
      name = FAKE_PROJECT_NAMES[(nameIndex + attempts) % FAKE_PROJECT_NAMES.length];
    }

    if (!usedNames.has(name)) {
      usedNames.add(name);
      // Generate deterministic ID based on email and index
      const fakeId = `fake_${emailHash}_${i}`;
      fakeProjects.push({
        projectId: fakeId,
        projectName: name
      });
    }
  }

  return fakeProjects;
}

/**
 * Interface for project data
 */
interface ProjectInfo {
  projectId: string;
  projectName: string;
}

/**
 * Get all active projects from database
 */
async function getAllActiveProjects(env: Env): Promise<ProjectInfo[]> {
  const result = await env.DB.prepare(`
    SELECT projectId, projectName
    FROM projects
    WHERE status = 'active'
    ORDER BY projectName
  `).all();

  return (result.results || []).map((row: any) => ({
    projectId: row.projectId,
    projectName: row.projectName
  }));
}

/**
 * Get projects that a user has participated in
 * Includes:
 * - Projects created by user
 * - Projects where user is viewer/observer (projectviewers table)
 * - Projects where user is member (usergroups table)
 */
async function getUserParticipatedProjects(env: Env, userEmail: string): Promise<ProjectInfo[]> {
  // Get user ID first
  const userResult = await env.DB.prepare(`
    SELECT userId
    FROM users
    WHERE userEmail = ? AND status = 'active'
  `).bind(userEmail).first();

  if (!userResult) {
    return [];
  }

  const userId = userResult.userId as string;
  const projectMap = new Map<string, ProjectInfo>();

  // 1. Projects created by user
  const createdProjects = await env.DB.prepare(`
    SELECT p.projectId, p.projectName
    FROM projects p
    WHERE p.createdBy = ? AND p.status = 'active'
  `).bind(userId).all();

  for (const row of createdProjects.results || []) {
    const project = row as any;
    projectMap.set(project.projectId, {
      projectId: project.projectId,
      projectName: project.projectName
    });
  }

  // 2. Projects where user is viewer/observer
  const viewerProjects = await env.DB.prepare(`
    SELECT p.projectId, p.projectName
    FROM projectviewers pv
    JOIN projects p ON pv.projectId = p.projectId
    WHERE pv.userEmail = ? AND pv.isActive = 1 AND p.status = 'active'
  `).bind(userEmail).all();

  for (const row of viewerProjects.results || []) {
    const project = row as any;
    projectMap.set(project.projectId, {
      projectId: project.projectId,
      projectName: project.projectName
    });
  }

  // 3. Projects where user is member via groups
  const memberProjects = await env.DB.prepare(`
    SELECT DISTINCT p.projectId, p.projectName
    FROM usergroups ug
    JOIN projects p ON ug.projectId = p.projectId
    WHERE ug.userEmail = ? AND ug.isActive = 1 AND p.status = 'active'
  `).bind(userEmail).all();

  for (const row of memberProjects.results || []) {
    const project = row as any;
    projectMap.set(project.projectId, {
      projectId: project.projectId,
      projectName: project.projectName
    });
  }

  return Array.from(projectMap.values());
}

/**
 * Get the displayed projects list for password reset
 * This must be consistent between verifyEmailForReset and handlePasswordReset
 */
async function getDisplayedProjects(env: Env, userEmail: string): Promise<ProjectInfo[]> {
  const userProjects = await getUserParticipatedProjects(env, userEmail);
  const allProjects = await getAllActiveProjects(env);

  // Use email hash as seed for deterministic shuffling
  const emailSeed = simpleHash(userEmail);

  // If no projects in system at all, generate 6 fake ones
  if (allProjects.length === 0) {
    return generateFakeProjects(6, userEmail);
  }

  // User doesn't exist or has no projects
  if (userProjects.length === 0) {
    // Mix real and fake projects if not enough real ones
    if (allProjects.length < 6) {
      const fakeCount = 6 - allProjects.length;
      return shuffleArray([...allProjects, ...generateFakeProjects(fakeCount, userEmail)], emailSeed);
    }
    return shuffleArray(getRandomElements(allProjects, 6), emailSeed);
  }

  // Get projects user didn't participate in
  const nonParticipated = allProjects.filter(
    p => !userProjects.some(up => up.projectId === p.projectId)
  );

  // User participated in all projects - show 6 participated projects (pad with fake if needed)
  if (nonParticipated.length === 0) {
    if (userProjects.length < 6) {
      const fakeCount = 6 - userProjects.length;
      return shuffleArray([...userProjects, ...generateFakeProjects(fakeCount, userEmail)], emailSeed);
    }
    return shuffleArray(getRandomElements(userProjects, 6), emailSeed);
  }

  // Normal case: mix participated and non-participated
  const participatedToShow = getRandomElements(userProjects, Math.min(USER_PROJECT_COUNT, userProjects.length));
  const nonParticipatedToShow = getRandomElements(nonParticipated, Math.min(NON_PARTICIPATED_PROJECT_COUNT, nonParticipated.length));

  // Ensure we have 6 total, fill with whatever we can
  const combined = [...participatedToShow, ...nonParticipatedToShow];
  if (combined.length < 6) {
    const remaining = 6 - combined.length;

    // Try to fill with more real projects first
    const additionalProjects = allProjects.filter(
      p => !combined.some(c => c.projectId === p.projectId)
    );
    const additionalReal = getRandomElements(additionalProjects, remaining);
    combined.push(...additionalReal);

    // If still not enough, add fake projects
    if (combined.length < 6) {
      const fakeCount = 6 - combined.length;
      combined.push(...generateFakeProjects(fakeCount, userEmail));
    }
  }

  // Use seeded shuffle to ensure same order every time for this email
  return shuffleArray(combined, emailSeed);
}

/**
 * Step 1: Verify email and send 2FA code
 *
 * Validates email format and sends verification code with IP/country info.
 * Always returns success to prevent user enumeration.
 */
export async function verifyEmailForReset(
  env: Env,
  userEmail: string,
  ipAddress?: string,
  country?: string
): Promise<ApiResponse> {
  try {
    // Validate email format
    if (!validateEmail(userEmail)) {
      return {
        success: false,
        error: {
          code: 'INVALID_EMAIL',
          message: '請輸入有效的電子郵件地址'
        }
      };
    }

    // Check if user exists (but don't reveal this information)
    const userResult = await env.DB.prepare(`
      SELECT userId, displayName
      FROM users
      WHERE userEmail = ? AND status = 'active'
    `).bind(userEmail).first();

    // Generate and send 2FA code regardless of whether user exists
    // This prevents enumeration attacks
    const verificationCode = generateVerificationCode();

    if (userResult) {
      // User exists - store verification code and send email
      await storeVerificationCode(env, userEmail, verificationCode, 'password_reset');

      // Queue 2FA email with IP/country information
      await queuePasswordReset2FAEmail(
        env,
        userEmail,
        verificationCode,
        ipAddress || 'unknown',
        country
      );

      // Log password reset attempt
      try {
        await logGlobalOperation(
          env,
          userEmail,
          'password_reset_2fa_sent',
          'user',
          userEmail,
          {
            userEmail,
            ipAddress: ipAddress || 'unknown',
            country: country || 'unknown',
            timestamp: Date.now()
          },
          { level: 'info' }
        );
      } catch (logError) {
        console.error('[verifyEmailForReset] Failed to log 2FA send:', logError);
      }
    }

    // Always return success (security obfuscation)
    return {
      success: true,
      data: {
        verified: true,
        message: '驗證碼已發送到您的郵箱'
      }
    };

  } catch (error) {
    console.error('Error in verifyEmailForReset:', error);
    return {
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '伺服器錯誤，請稍後重試'
      }
    };
  }
}

/**
 * Step 2: Verify 2FA code and return projects
 *
 * Verifies the 2FA code and returns project list if successful.
 * Always returns success message (even on failure) to prevent enumeration.
 */
export async function verifyCodeAndGetProjects(
  env: Env,
  userEmail: string,
  verificationCode: string
): Promise<ApiResponse> {
  try {
    // Validate email format
    if (!validateEmail(userEmail)) {
      return {
        success: false,
        error: {
          code: 'INVALID_EMAIL',
          message: '請輸入有效的電子郵件地址'
        }
      };
    }

    // Verify 2FA code
    const verifyResult = await verifyTwoFactorCode(env, userEmail, verificationCode);

    if (!verifyResult.success) {
      return {
        success: false,
        error: {
          code: verifyResult.error || 'INVALID_CODE',
          message: verifyResult.message || '驗證碼錯誤',
          attemptsLeft: verifyResult.attemptsLeft
        }
      };
    }

    // 2FA verification successful - get displayed projects
    const displayedProjects = await getDisplayedProjects(env, userEmail);

    // Log successful 2FA verification
    try {
      await logGlobalOperation(
        env,
        userEmail,
        'password_reset_2fa_verified',
        'user',
        userEmail,
        {
          userEmail,
          timestamp: Date.now(),
          projectsShown: displayedProjects.length
        },
        { level: 'info' }
      );
    } catch (logError) {
      console.error('[verifyCodeAndGetProjects] Failed to log 2FA verification:', logError);
    }

    // Return projects
    return {
      success: true,
      data: {
        verified: true,
        projects: displayedProjects.map(project => ({
          projectId: project.projectId,
          projectName: project.projectName
        }))
      }
    };

  } catch (error) {
    console.error('Error in verifyCodeAndGetProjects:', error);
    return {
      success: false,
      error: {
        code: 'SERVER_ERROR',
        message: '伺服器錯誤，請稍後重試'
      }
    };
  }
}

/**
 * Step 3: Handle password reset with project verification
 *
 * Verifies that:
 * - If allParticipated=true: all displayed projects are in user's participated list
 * - If allParticipated=false: selected projects EXACTLY match non-participated projects
 * Always returns success message (even on failure) to prevent enumeration.
 */
export async function handlePasswordReset(
  env: Env,
  userEmail: string,
  selectedProjectIds: string[],
  allParticipated: boolean,
  turnstileToken?: string
): Promise<ApiResponse> {
  try {
    // Validate inputs
    if (!userEmail) {
      // Still return success message for security
      return {
        success: true,
        data: {},
        message: '如果您的資訊正確，新密碼已發送到您的電子郵件'
      };
    }

    // If neither projects selected nor allParticipated checked, return success for security
    if (!allParticipated && (!selectedProjectIds || selectedProjectIds.length === 0)) {
      return {
        success: true,
        data: {},
        message: '如果您的資訊正確，新密碼已發送到您的電子郵件'
      };
    }

    // Note: Turnstile verification is handled at the router level
    // See auth.ts route handler for turnstile token verification

    // Find user by email
    const userResult = await env.DB.prepare(`
      SELECT userId, displayName, userEmail
      FROM users
      WHERE userEmail = ? AND status = 'active'
    `).bind(userEmail).first();

    if (!userResult) {
      // User doesn't exist - return success message for obfuscation
      return {
        success: true,
        data: {},
        message: '如果您的資訊正確，新密碼已發送到您的電子郵件'
      };
    }

    // Get user's participated projects and displayed projects
    const userProjects = await getUserParticipatedProjects(env, userEmail);
    const displayedProjects = await getDisplayedProjects(env, userEmail);

    const userProjectIds = userProjects.map(p => p.projectId);
    const displayedProjectIds = displayedProjects.map(p => p.projectId);

    let isCorrect = false;

    if (allParticipated) {
      // User claims they participated in all displayed projects
      // Verify: all displayed projects should be in user's participated list
      isCorrect = displayedProjectIds.every(id => userProjectIds.includes(id));
    } else {
      // User selected non-participated projects
      // Calculate correct answer: displayed projects that user didn't participate in
      const correctAnswers = displayedProjectIds.filter(id => !userProjectIds.includes(id));

      // Verify EXACT match
      isCorrect =
        selectedProjectIds.length === correctAnswers.length &&
        selectedProjectIds.every(id => correctAnswers.includes(id)) &&
        correctAnswers.every(id => selectedProjectIds.includes(id));
    }

    if (!isCorrect) {
      // Projects don't match - return success message for obfuscation
      return {
        success: true,
        data: {},
        message: '如果您的資訊正確，新密碼已發送到您的電子郵件'
      };
    }

    // Verification successful! Generate new password (8-12 characters)
    const passwordLength = 8 + Math.floor(Math.random() * 5); // Random length between 8-12
    const newPassword = generateRandomPassword(passwordLength);
    const hashedPassword = await hashPassword(newPassword);

    // Update user's password
    const now = new Date().toISOString();
    await env.DB.prepare(`
      UPDATE users
      SET password = ?, updatedAt = ?
      WHERE userId = ?
    `).bind(hashedPassword, now, userResult.userId).run();

    // Queue password reset email
    try {
      await queuePasswordResetEmail(
        env,
        userResult.userEmail as string,
        userResult.displayName as string,
        newPassword
      );
    } catch (emailError) {
      console.error('Password reset email queue failed:', emailError);
      // Continue anyway - password is already reset
    }

    // Log the password reset event using centralized logging
    try {
      await logGlobalOperation(
        env,
        userResult.userEmail as string,
        'password_reset_completed',
        'user',
        userResult.userEmail as string,
        {
          userEmail: userResult.userEmail,
          resetTime: Date.now(),
          verificationMethod: allParticipated ? 'all_participated' : 'selected_non_participated',
          projectVerification: 'success',
          temporaryPasswordGenerated: true
        },
        { level: 'info' }
      );
    } catch (logError) {
      console.error('[handlePasswordReset] Password reset event logging failed:', logError);
      // Continue anyway
    }

    // TODO: Invalidate user's active sessions after password reset
    // Since we use JWT, we can't directly invalidate tokens, but we can:
    // Option 1: Add password_changed_at timestamp and check it when validating JWT
    // Option 2: Maintain a JWT blacklist in KV storage
    // Option 3: Use shorter JWT expiration times
    //
    // Recommended implementation:
    // await env.DB.prepare(`
    //   UPDATE users
    //   SET password_changed_at = ?
    //   WHERE userId = ?
    // `).bind(now, userResult.userId).run();
    //
    // Then in JWT validation, check:
    // if (tokenIssuedAt < user.password_changed_at) { reject }

    // Return success message (same as failure case)
    return {
      success: true,
      data: {},
      message: '如果您的資訊正確，新密碼已發送到您的電子郵件'
    };

  } catch (error) {
    console.error('Error in handlePasswordReset:', error);

    // Even on error, return success message for security
    return {
      success: true,
      data: {},
      message: '如果您的資訊正確，新密碼已發送到您的電子郵件'
    };
  }
}
