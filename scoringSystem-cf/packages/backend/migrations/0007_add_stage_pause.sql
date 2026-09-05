-- Migration: Add stage pause functionality
-- Date: 2025-12-29
-- Description: Add pausedTime column to stages table and update stages_with_status VIEW

-- Add pausedTime column to stages table
ALTER TABLE stages ADD COLUMN pausedTime INTEGER DEFAULT NULL;

-- Recreate VIEW with pause support
-- Status priority: archived > settling > completed > paused > voting > active > pending
DROP VIEW IF EXISTS stages_with_status;

CREATE VIEW IF NOT EXISTS stages_with_status AS
SELECT
  s.stageId,
  s.projectId,
  s.stageName,
  s.stageOrder,
  s.stageType,
  s.startTime,
  s.endTime,
  CASE
    WHEN s.archivedTime IS NOT NULL THEN 'archived'
    WHEN s.settlingTime IS NOT NULL THEN 'settling'
    WHEN s.settledTime IS NOT NULL THEN 'completed'
    WHEN s.pausedTime IS NOT NULL THEN 'paused'
    WHEN s.forceVotingTime IS NOT NULL AND s.forceVotingTime > 0 THEN 'voting'
    WHEN (strftime('%s', 'now') * 1000) >= s.endTime THEN 'voting'
    WHEN (strftime('%s', 'now') * 1000) >= s.startTime THEN 'active'
    ELSE 'pending'
  END AS status,
  s.forceVotingTime,
  s.settlingTime,
  s.settledTime,
  s.archivedTime,
  s.pausedTime,
  s.description,
  s.config,
  s.createdTime,
  s.updatedAt,
  s.reportRewardPool,
  s.commentRewardPool,
  s.finalRankings,
  s.scoringResults
FROM stages s;
