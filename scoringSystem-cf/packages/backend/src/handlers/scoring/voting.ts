/**
 * DEPRECATED: Voting Handlers - Individual Voting System
 *
 * This file uses the obsolete 'rankings' table for individual voting.
 * The individual voting system has been replaced by the proposal-based system:
 * - Use rankingproposals + proposalvotes instead
 * - See handlers/rankings/submit.ts, vote.ts for the new system
 *
 * The rankings table has no data and is not in use.
 *
 * @deprecated Since migration to proposal-based voting system
 * @see handlers/rankings/submit.ts
 * @see handlers/rankings/vote.ts
 */

/*
import { Env } from '../../types';
import { successResponse, errorResponse } from '../../utils/response';
import { generateId } from '../../utils/id-generator';
import { parseJSON, stringifyJSON } from '../../utils/json';
import { checkProjectPermission } from '../../middleware/permissions';

export async function submitRankingVote(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string,
  rankings: Record<string, number>
): Promise<Response> {
  return errorResponse('DEPRECATED', 'This API endpoint is deprecated. Please use the proposal-based voting system.');
}

export async function getStageVotingStatus(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  return errorResponse('DEPRECATED', 'This API endpoint is deprecated. Please use the proposal-based voting system.');
}

export async function getVotingData(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  return errorResponse('DEPRECATED', 'This API endpoint is deprecated. Please use the proposal-based voting system.');
}

export async function getVotingAnalysis(
  env: Env,
  userEmail: string,
  projectId: string,
  stageId: string
): Promise<Response> {
  return errorResponse('DEPRECATED', 'This API endpoint is deprecated. Please use the proposal-based voting system.');
}
*/
