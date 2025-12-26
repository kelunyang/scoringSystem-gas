/**
 * @fileoverview Core database abstraction layer for D1 operations
 * Provides unified interface for reading and writing data across all tables
 */


/**
 * Global data structure (cached result from readGlobalData)
 */
export interface GlobalData {
  projects?: any[];
  users?: any[];
  globalgroups?: any[];
  globalusergroups?: any[];
  invitations?: any[];
  invitationlogs?: any[];
  invitation_codes?: any[];
  globalemailqueue?: any[];
  globalemaillogs?: any[];
}

/**
 * Project data structure (cached result from readProjectData)
 */
export interface ProjectData {
  groups?: any[];
  usergroups?: any[];
  stages?: any[];
  submissions?: any[];
  rankings?: any[];
  comments?: any[];
  reactions?: any[];
  criteriacategories?: any[];
  criteria?: any[];
  scores?: any[];
  scoreshistory?: any[];
  wallets?: any[];
  transactions?: any[];
  transactionlogs?: any[];
  eventlogs?: any[];
  auditlogs?: any[];
  activitylogs?: any[];
  emailqueue?: any[];
  emaillogs?: any[];
}

/**
 * Read all global data (users, projects, global groups, etc.)
 * Equivalent to GAS readGlobalData()
 */
export async function readGlobalData(db: D1Database): Promise<GlobalData> {
  const globalData: GlobalData = {};

  try {
    // Batch read all global tables
    const [
      projects,
      users,
      globalgroups,
      globalusergroups,
      invitations,
      invitationlogs,
      invitation_codes,
      globalemailqueue,
      globalemaillogs
    ] = await Promise.all([
      db.prepare('SELECT * FROM projects').all(),
      db.prepare('SELECT * FROM users').all(),
      db.prepare('SELECT * FROM globalgroups').all(),
      db.prepare('SELECT * FROM globalusergroups').all(),
      db.prepare('SELECT * FROM invitations').all(),
      db.prepare('SELECT * FROM invitationlogs').all(),
      db.prepare('SELECT * FROM invitation_codes').all(),
      db.prepare('SELECT * FROM globalemailqueue').all(),
      db.prepare('SELECT * FROM globalemaillogs').all()
    ]);

    globalData.projects = projects.results;
    globalData.users = users.results;
    globalData.globalgroups = globalgroups.results;
    globalData.globalusergroups = globalusergroups.results;
    globalData.invitations = invitations.results;
    globalData.invitationlogs = invitationlogs.results;
    globalData.invitation_codes = invitation_codes.results;
    globalData.globalemailqueue = globalemailqueue.results;
    globalData.globalemaillogs = globalemaillogs.results;

    return globalData;
  } catch (error) {
    console.error('Failed to read global data:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Database read error: ${message}`);
  }
}

/**
 * Read all project-specific data
 * Equivalent to GAS readProjectData(projectId)
 */
export async function readProjectData(
  db: D1Database,
  projectId: string
): Promise<ProjectData> {
  const projectData: ProjectData = {};

  try {
    // Batch read all project tables filtered by projectId
    const [
      groups,
      usergroups,
      stages,
      submissions,
      rankings,
      comments,
      reactions,
      criteriacategories,
      criteria,
      scores,
      scoreshistory,
      wallets,
      transactions,
      transactionlogs,
      eventlogs,
      auditlogs,
      activitylogs,
      emailqueue,
      emaillogs
    ] = await Promise.all([
      db.prepare('SELECT * FROM groups WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM usergroups WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM stages WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM submissions_with_status WHERE projectId = ?').bind(projectId).all(),
      // rankings table has no projectId field, must JOIN with stages table
      db.prepare(`
        SELECT r.* FROM rankings r
        JOIN stages s ON r.stageId = s.stageId
        WHERE s.projectId = ?
      `).bind(projectId).all(),
      db.prepare('SELECT * FROM comments WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM reactions WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM criteriacategories WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM criteria WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM scores WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM scoreshistory WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM wallets WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM transactions WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM transactionlogs WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM eventlogs WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM auditlogs WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM activitylogs WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM emailqueue WHERE projectId = ?').bind(projectId).all(),
      db.prepare('SELECT * FROM emaillogs WHERE projectId = ?').bind(projectId).all()
    ]);

    projectData.groups = groups.results;
    projectData.usergroups = usergroups.results;
    projectData.stages = stages.results;
    projectData.submissions = submissions.results;
    projectData.rankings = rankings.results;
    projectData.comments = comments.results;
    projectData.reactions = reactions.results;
    projectData.criteriacategories = criteriacategories.results;
    projectData.criteria = criteria.results;
    projectData.scores = scores.results;
    projectData.scoreshistory = scoreshistory.results;
    projectData.wallets = wallets.results;
    projectData.transactions = transactions.results;
    projectData.transactionlogs = transactionlogs.results;
    projectData.eventlogs = eventlogs.results;
    projectData.auditlogs = auditlogs.results;
    projectData.activitylogs = activitylogs.results;
    projectData.emailqueue = emailqueue.results;
    projectData.emaillogs = emaillogs.results;

    return projectData;
  } catch (error) {
    console.error('Failed to read project data:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Database read error: ${message}`);
  }
}

/**
 * Insert a row into any table
 * Equivalent to GAS insertRow()
 */
export async function insertRow(
  db: D1Database,
  tableName: string,
  data: Record<string, any>
): Promise<any> {
  try {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = columns.map(() => '?').join(', ');

    const sql = `
      INSERT INTO ${tableName} (${columns.join(', ')})
      VALUES (${placeholders})
    `;

    const stmt = db.prepare(sql);
    const result = await stmt.bind(...values).run();

    if (!result.success) {
      throw new Error(`Failed to insert into ${tableName}`);
    }

    return { success: true, meta: result.meta };
  } catch (error) {
    console.error(`Failed to insert row into ${tableName}:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Database insert error: ${message}`);
  }
}

/**
 * Update a row in any table
 * Equivalent to GAS updateRow()
 */
export async function updateRow(
  db: D1Database,
  tableName: string,
  keyField: string,
  keyValue: any,
  updates: Record<string, any>
): Promise<any> {
  try {
    const columns = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = columns.map(col => `${col} = ?`).join(', ');

    const sql = `
      UPDATE ${tableName}
      SET ${setClause}
      WHERE ${keyField} = ?
    `;

    const stmt = db.prepare(sql);
    const result = await stmt.bind(...values, keyValue).run();

    if (!result.success) {
      throw new Error(`Failed to update ${tableName}`);
    }

    return { success: true, meta: result.meta };
  } catch (error) {
    console.error(`Failed to update row in ${tableName}:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Database update error: ${message}`);
  }
}

/**
 * Delete a row from any table
 * Equivalent to GAS deleteRow()
 */
export async function deleteRow(
  db: D1Database,
  tableName: string,
  keyField: string,
  keyValue: any
): Promise<any> {
  try {
    const sql = `DELETE FROM ${tableName} WHERE ${keyField} = ?`;
    const stmt = db.prepare(sql);
    const result = await stmt.bind(keyValue).run();

    if (!result.success) {
      throw new Error(`Failed to delete from ${tableName}`);
    }

    return { success: true, meta: result.meta };
  } catch (error) {
    console.error(`Failed to delete row from ${tableName}:`, error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Database delete error: ${message}`);
  }
}

/**
 * Execute a custom SQL query
 * For complex queries not covered by basic CRUD operations
 */
export async function executeQuery(
  db: D1Database,
  sql: string,
  params: any[] = []
): Promise<any> {
  try {
    const stmt = db.prepare(sql);
    const result = await stmt.bind(...params).all();
    return result.results;
  } catch (error) {
    console.error('Failed to execute query:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Database query error: ${message}`);
  }
}

/**
 * Execute a batch of SQL statements in a transaction
 * Useful for operations that must succeed or fail together
 */
export async function executeBatch(
  db: D1Database,
  statements: Array<{ sql: string; params?: any[] }>
): Promise<any> {
  try {
    const preparedStatements = statements.map(stmt => {
      const prepared = db.prepare(stmt.sql);
      return stmt.params ? prepared.bind(...stmt.params) : prepared;
    });

    const results = await db.batch(preparedStatements);
    return results;
  } catch (error) {
    console.error('Failed to execute batch:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Database batch error: ${message}`);
  }
}
