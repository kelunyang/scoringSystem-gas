-- Migration: Add withdrawnReason to rankingproposals
-- Supports admin/teacher force-clearing (作廢) of stage votes with a mandatory reason.
-- Each withdrawn proposal version surfaces the reason to its group members.

ALTER TABLE rankingproposals ADD COLUMN withdrawnReason TEXT;

-- Recreate the status VIEW to expose withdrawnReason (SQLite cannot ALTER a VIEW)
DROP VIEW IF EXISTS rankingproposals_with_status;
CREATE VIEW rankingproposals_with_status AS
WITH ProposalVoteCounts AS (
  SELECT
    proposalId,
    COUNT(*) AS totalVotes,
    SUM(CASE WHEN agree = 1 THEN 1 ELSE 0 END) AS agreeVotes,
    SUM(CASE WHEN agree = -1 THEN 1 ELSE 0 END) AS disagreeVotes,
    SUM(agree) AS voteScore
  FROM proposalvotes
  GROUP BY proposalId
)
SELECT
  rp.proposalId,
  rp.projectId,
  rp.stageId,
  rp.groupId,
  rp.proposerEmail,
  rp.rankingData,
  rp.createdTime,

  -- Timestamp fields
  rp.settleTime,
  rp.withdrawnTime,
  rp.withdrawnBy,
  rp.withdrawnReason,
  rp.resetTime,

  -- Vote counts (guaranteed non-null with COALESCE)
  COALESCE(pvc.agreeVotes, 0) AS agreeVotes,
  COALESCE(pvc.disagreeVotes, 0) AS disagreeVotes,
  COALESCE(pvc.agreeVotes, 0) AS supportCount,    -- Frontend-friendly alias
  COALESCE(pvc.disagreeVotes, 0) AS opposeCount,  -- Frontend-friendly alias
  COALESCE(pvc.totalVotes, 0) AS totalVotes,
  COALESCE(pvc.voteScore, 0) AS voteScore,

  -- votingResult: Simplified calculation using count comparison
  CASE
    WHEN COALESCE(pvc.totalVotes, 0) = 0 THEN 'no_votes'
    WHEN COALESCE(pvc.agreeVotes, 0) > COALESCE(pvc.disagreeVotes, 0) THEN 'agree'
    WHEN COALESCE(pvc.agreeVotes, 0) < COALESCE(pvc.disagreeVotes, 0) THEN 'disagree'
    ELSE 'tie'  -- agreeVotes = disagreeVotes
  END AS votingResult,

  -- status: Timestamp-based state (priority: settled > withdrawn > reset > pending)
  CASE
    WHEN rp.settleTime IS NOT NULL THEN 'settled'
    WHEN rp.withdrawnTime IS NOT NULL THEN 'withdrawn'
    WHEN rp.resetTime IS NOT NULL THEN 'reset'
    ELSE 'pending'
  END AS status

FROM rankingproposals rp
LEFT JOIN ProposalVoteCounts pvc USING (proposalId);
