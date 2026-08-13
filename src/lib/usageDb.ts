import mysql from 'mysql2/promise';

export type UsageEventRow = {
  kind: 'cron' | 'heartbeat' | 'interactive';
  ts: number;
  day: string;
  hour: string;
  jobId: string | null;
  jobName: string | null;
  model: string | null;
  status: string | null;
  cost: number | null;
  tokens: number | null;
  sessionId: string | null;
  agentId: string | null;
  source: string | null;
  missingUsage: number | null; // 0/1
};

export type ProviderCostRow = {
  provider: string;
  bucketStartMs: number;
  bucketEndMs: number;
  amountUsd: number;
  currency: string | null;
  projectId: string | null;
  lineItem: string | null;
  source: string | null;
  capturedAtMs: number | null;
};

export function usageDbEnabled() {
  return String(process.env.USAGE_DB_ENABLED || '').toLowerCase() === 'true';
}

export async function getDb() {
  const host = process.env.USAGE_DB_HOST || '127.0.0.1';
  const port = Number(process.env.USAGE_DB_PORT || 3306);
  const user = process.env.USAGE_DB_USER || 'morpheuxx';
  const password = process.env.USAGE_DB_PASSWORD || '';
  const database = process.env.USAGE_DB_NAME || 'morpheuxx_usage';

  return mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    connectionLimit: 5,
    enableKeepAlive: true,
  });
}

export async function ensureSchema() {
  const db = await getDb();
  await db.query(`
    CREATE TABLE IF NOT EXISTS ingest_state (
      source VARCHAR(255) PRIMARY KEY,
      byte_offset BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS usage_events (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      kind ENUM('cron','heartbeat') NOT NULL,
      ts BIGINT NOT NULL,
      day CHAR(10) NOT NULL,
      hour CHAR(13) NOT NULL,
      job_id VARCHAR(64) NULL,
      job_name VARCHAR(128) NULL,
      model VARCHAR(128) NULL,
      status VARCHAR(16) NULL,
      cost DOUBLE NULL,
      tokens BIGINT NULL,
      session_id VARCHAR(64) NULL,
      source VARCHAR(255) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_event (kind, ts, job_id, session_id),
      KEY idx_day (day),
      KEY idx_hour (hour),
      KEY idx_model (model),
      KEY idx_job (job_name)
    )
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS provider_costs (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      provider VARCHAR(32) NOT NULL,
      bucket_start_ms BIGINT NOT NULL,
      bucket_end_ms BIGINT NOT NULL,
      amount_usd DOUBLE NOT NULL,
      currency VARCHAR(8) NULL,
      project_id VARCHAR(128) NULL,
      line_item VARCHAR(255) NULL,
      source VARCHAR(255) NULL,
      raw_json JSON NULL,
      captured_at_ms BIGINT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uniq_provider_bucket (provider, bucket_start_ms, bucket_end_ms, COALESCE(project_id, ''), COALESCE(line_item, '')),
      KEY idx_provider_time (provider, bucket_start_ms, bucket_end_ms),
      KEY idx_provider_project (provider, project_id),
      KEY idx_provider_line (provider, line_item)
    )
  `).catch(async () => {
    // Fallback for MySQL variants that reject expressions in UNIQUE indexes.
    await db.query(`
      CREATE TABLE IF NOT EXISTS provider_costs (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        provider VARCHAR(32) NOT NULL,
        bucket_start_ms BIGINT NOT NULL,
        bucket_end_ms BIGINT NOT NULL,
        amount_usd DOUBLE NOT NULL,
        currency VARCHAR(8) NULL,
        project_id VARCHAR(128) NULL,
        line_item VARCHAR(255) NULL,
        source VARCHAR(255) NULL,
        raw_json JSON NULL,
        captured_at_ms BIGINT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        dedupe_key VARCHAR(512) GENERATED ALWAYS AS (CONCAT(provider, ':', bucket_start_ms, ':', bucket_end_ms, ':', IFNULL(project_id,''), ':', IFNULL(line_item,''))) STORED,
        PRIMARY KEY (id),
        UNIQUE KEY uniq_provider_bucket (dedupe_key),
        KEY idx_provider_time (provider, bucket_start_ms, bucket_end_ms),
        KEY idx_provider_project (provider, project_id),
        KEY idx_provider_line (provider, line_item)
      )
    `);
  });

  return db;
}

export async function queryUsageEvents(opts: {
  startMs: number;
  endMs: number;
}): Promise<UsageEventRow[]> {
  const db = await getDb();

  const [rows] = await db.query(
    `SELECT kind, ts, day, hour,
            job_id as jobId, job_name as jobName,
            model, status, cost, tokens,
            session_id as sessionId,
            agent_id as agentId,
            source,
            0 as missingUsage
     FROM usage_messages
     WHERE ts BETWEEN ? AND ?
     ORDER BY ts ASC`,
    [opts.startMs, opts.endMs]
  );

  return rows as UsageEventRow[];
}

export async function queryProviderCosts(opts: {
  provider: string;
  startMs: number;
  endMs: number;
}): Promise<ProviderCostRow[]> {
  const db = await getDb();

  const [rows] = await db.query(
    `SELECT provider,
            bucket_start_ms as bucketStartMs,
            bucket_end_ms as bucketEndMs,
            amount_usd as amountUsd,
            currency,
            project_id as projectId,
            line_item as lineItem,
            source,
            captured_at_ms as capturedAtMs
     FROM provider_costs
     WHERE provider = ?
       AND bucket_end_ms > ?
       AND bucket_start_ms < ?
     ORDER BY bucket_start_ms ASC, project_id ASC, line_item ASC`,
    [opts.provider, opts.startMs, opts.endMs]
  );

  return rows as ProviderCostRow[];
}
