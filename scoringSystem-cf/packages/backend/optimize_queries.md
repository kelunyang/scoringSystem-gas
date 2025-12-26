# Non-Critical Query Optimization Plan

## Summary
After refactoring to VIEW-based status architecture, we need to optimize queries that don't require status calculation to avoid unnecessary VIEW overhead.

## Query Categories

### Category 1: Queries that MUST use VIEWs
These queries need auto-calculated status:

**stages_with_status (time-based status)**:
- Any query that checks `status` for pending/active/voting
- Any query returning `status` to frontend
- Any query with WHERE clauses on `status`

**submissions_with_status (timestamp-based status)**:
- Queries checking approval status
- Queries returning submission status to frontend
- Queries needing `withdrawn`/`approved`/`submitted` status

**rankingproposals_with_status (majority voting)**:
- Queries checking proposal approval/rejection
- Queries returning proposal status to frontend
- Queries with WHERE clauses on proposal status

### Category 2: Queries that should use BASE TABLES
These queries DON'T need status calculation:

#### stages table (base)
```typescript
// ✅ GOOD - No status needed
SELECT stageId, config FROM stages WHERE stageId = ?

// ✅ GOOD - Only metadata
SELECT stageId, stageName, stageOrder FROM stages WHERE projectId = ?

// ❌ BAD - Uses status
SELECT * FROM stages WHERE projectId = ? AND status != 'deleted'
```

#### submissions table (base)
```typescript
// ✅ GOOD - Just counts
SELECT COUNT(*) FROM submissions WHERE stageId = ?

// ✅ GOOD - Just IDs
SELECT submissionId, submitTime FROM submissions WHERE groupId = ?

// ❌ BAD - Needs status
SELECT status FROM submissions WHERE submissionId = ?
```

#### rankingproposals table (base)
```typescript
// ✅ GOOD - Just counts
SELECT COUNT(*) FROM rankingproposals WHERE stageId = ?

// ✅ GOOD - Just IDs
SELECT proposalId, createdTime FROM rankingproposals WHERE groupId = ?

// ❌ BAD - Needs status
SELECT status FROM rankingproposals WHERE proposalId = ?
```

## Issues Found

### Issue 1: Non-existent 'deleted' status
**Files affected**:
- `handlers/projects/create.ts:197`
- `handlers/projects/list.ts:184`

**Problem**:
```sql
SELECT * FROM stages WHERE projectId = ? AND status != 'deleted'
```

There's no 'deleted' status value in the system. Valid statuses:
- Auto: pending, active, voting
- Manual: completed, archived

**Fix options**:
1. Remove the `status != 'deleted'` condition entirely (if all stages should be shown)
2. Change to `manualStatus IS NULL OR manualStatus != 'archived'` (exclude archived)
3. Add explicit status filter: `status IN ('pending', 'active', 'voting', 'completed')`

**Recommendation**: Since these queries use `SELECT *` and will return status to frontend, they should use `stages_with_status` VIEW. Remove the incorrect `status != 'deleted'` condition:

```sql
-- Before (incorrect):
SELECT * FROM stages WHERE projectId = ? AND status != 'deleted' ORDER BY stageOrder

-- After (correct):
SELECT * FROM stages_with_status WHERE projectId = ? ORDER BY stageOrder
```

### Issue 2: Mixed status checks
**Files**: Multiple handlers mix status and non-status queries

**Example** (`handlers/rankings/submit.ts`):
```typescript
// This needs VIEW (uses status)
SELECT status, groupId FROM submissions WHERE submissionId = ?

// This could use base table (no status)
SELECT proposalId FROM rankingproposals WHERE groupId = ? AND stageId = ?
```

## Optimization Recommendations

### High Priority (Performance Impact)

1. **COUNT queries** - Should use base tables:
```sql
-- ✅ Optimize: Use base table
SELECT COUNT(*) as count FROM submissions WHERE stageId = ?

-- Not:
SELECT COUNT(*) as count FROM submissions_with_status WHERE stageId = ?
```

2. **Simple existence checks**:
```sql
-- ✅ Optimize: Use base table
SELECT 1 FROM stages WHERE stageId = ? LIMIT 1

-- Not:
SELECT 1 FROM stages_with_status WHERE stageId = ? LIMIT 1
```

3. **Config/metadata queries**:
```sql
-- ✅ Optimize: Use base table
SELECT stageId, config FROM stages WHERE stageId = ?
```

### Medium Priority

4. **JOINs with other tables** - Use base tables when status not needed:
```sql
-- ✅ Good
SELECT s.stageId, COUNT(r.rankingId)
FROM stages s
LEFT JOIN rankings r ON r.stageId = s.stageId
GROUP BY s.stageId
```

### Low Priority (Already optimized)

5. **Config-only queries** in `handlers/stages/config.ts` - Already use base table ✅

## Implementation Strategy

### Phase 1: Fix broken queries (URGENT)
1. Fix `status != 'deleted'` queries in:
   - `handlers/projects/create.ts:197`
   - `handlers/projects/list.ts:184`

### Phase 2: Optimize COUNT queries (PERFORMANCE)
2. Find and fix COUNT queries using VIEWs:
```bash
grep -r "COUNT.*FROM.*_with_status" --include="*.ts"
```

### Phase 3: Optimize existence checks (PERFORMANCE)
3. Find and fix existence checks:
```bash
grep -r "SELECT 1 FROM.*_with_status" --include="*.ts"
```

### Phase 4: Document usage patterns (MAINTENANCE)
4. Add comments to code explaining when to use VIEWs vs base tables

## Testing Strategy

1. Run type check: `pnpm type-check:backend`
2. Test critical flows:
   - Project creation/listing (uses optimized queries)
   - Stage management (mixed VIEW/base usage)
   - Submission workflow (VIEW for status, base for counts)
3. Performance testing:
   - Compare query times before/after optimization
   - Verify no N+1 query issues

## Files to Review

### Must use VIEWs (status required):
- `handlers/stages/manage.ts` - Stage listing with status ✅ (already using VIEW)
- `handlers/submissions/manage.ts` - Submission status checks ✅ (already using VIEW)
- `handlers/rankings/*` - Proposal status checks ✅ (already using VIEW)
- `middleware/require-stage-status.ts` - Status validation ✅ (already using VIEW)

### Should use base tables (no status needed):
- `handlers/stages/config.ts` - Config management ✅ (already optimized)
- `handlers/groups/manage.ts` - Group operations (counts)
- `db/operations.ts` - Batch exports (review case-by-case)

### Needs fixing (broken queries):
- `handlers/projects/create.ts:197` - ❌ Uses non-existent 'deleted' status
- `handlers/projects/list.ts:184` - ❌ Uses non-existent 'deleted' status

## Performance Metrics

Expected improvements after optimization:
- **COUNT queries**: ~30% faster (avoid VIEW calculation overhead)
- **Existence checks**: ~50% faster (direct table lookup)
- **Config queries**: Already optimal ✅
- **Status queries**: Same (must use VIEW)

## Notes

- VIEWs recalculate on EVERY query - use only when status needed
- Base table queries are faster but may have stale `status` column (deprecated)
- Never use base table `status` column - always use VIEW when status is needed
