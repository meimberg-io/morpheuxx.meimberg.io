import fs from 'fs';
import path from 'path';
import readline from 'readline';

export type UsageRecord = {
  kind: 'cron' | 'heartbeat';
  ts: number; // epoch ms
  day: string; // YYYY-MM-DD (UTC)
  hour: string; // YYYY-MM-DDTHH (UTC)
  jobId?: string;
  jobName?: string;
  sessionId?: string;
  sessionKey?: string;
  model?: string;
  status?: 'ok' | 'error';
  cost?: number; // USD-ish; whatever provider reported
  tokens?: number;
};

const OPENCLAW_DIR = '/root/.openclaw';
const CRON_RUNS_DIR = path.join(OPENCLAW_DIR, 'cron', 'runs');
const AGENTS_DIR = path.join(OPENCLAW_DIR, 'agents');

const HEARTBEAT_PROMPT_START = 'Read HEARTBEAT.md if it exists';

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

function utcDayHour(ts: number) {
  const d = new Date(ts);
  const day = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  const hour = `${day}T${pad2(d.getUTCHours())}`;
  return { day, hour };
}

async function readJsonlLines(filePath: string, onLine: (obj: any) => void | Promise<void>) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const obj = JSON.parse(trimmed);
      await onLine(obj);
    } catch {
      // ignore malformed lines
    }
  }
}

function listSessionFiles() {
  const out: Array<{ agentId: string; sessionId: string; filePath: string }> = [];
  if (!fs.existsSync(AGENTS_DIR)) return out;
  const agents = fs.readdirSync(AGENTS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const agentId of agents) {
    const dir = path.join(AGENTS_DIR, agentId, 'sessions');
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.jsonl'));
    for (const f of files) {
      out.push({ agentId, sessionId: f.replace(/\.jsonl$/, ''), filePath: path.join(dir, f) });
    }
  }
  return out;
}

function findSessionFile(sessionId: string): string | null {
  for (const sf of listSessionFiles()) {
    if (sf.sessionId === sessionId) return sf.filePath;
  }
  return null;
}

async function summarizeSessionUsage(sessionId: string): Promise<{ cost: number; tokens: number; models: Map<string, { cost: number; tokens: number }> } | null> {
  const filePath = findSessionFile(sessionId);
  if (!filePath) return null;

  let cost = 0;
  let tokens = 0;
  const models = new Map<string, { cost: number; tokens: number }>();

  await readJsonlLines(filePath, (obj) => {
    if (obj?.type !== 'message') return;
    const msg = obj.message;
    if (!msg || msg.role !== 'assistant') return;
    const usage = msg.usage;
    if (!usage) return;

    const t = Number(usage.totalTokens ?? usage.total ?? usage.tokens ?? usage.input + usage.output);
    const c = Number(usage.cost?.total ?? usage.costTotal ?? usage.cost);

    if (Number.isFinite(t)) tokens += t;
    if (Number.isFinite(c)) cost += c;

    const model = msg.model || usage.model || obj.model || 'unknown';
    const bucket = models.get(model) || { cost: 0, tokens: 0 };
    if (Number.isFinite(t)) bucket.tokens += t;
    if (Number.isFinite(c)) bucket.cost += c;
    models.set(model, bucket);
  });

  return { cost, tokens, models };
}

function pickTopModel(models: Map<string, { cost: number; tokens: number }>): string | undefined {
  let best: { model: string; tokens: number } | null = null;
  for (const entry of Array.from(models.entries())) {
    const model = entry[0];
    const v = entry[1];
    if (!best || v.tokens > best.tokens) best = { model, tokens: v.tokens };
  }
  return best?.model;
}

export async function buildUsageRecords(opts: {
  startMs: number;
  endMs: number;
}): Promise<{ records: UsageRecord[]; warnings: string[] }>{
  const { startMs, endMs } = opts;
  const warnings: string[] = [];

  // Load cron jobs mapping (jobId -> name)
  let jobsMap = new Map<string, string>();
  try {
    const jobsJsonPath = path.join(OPENCLAW_DIR, 'cron', 'jobs.json');
    if (fs.existsSync(jobsJsonPath)) {
      const j = JSON.parse(fs.readFileSync(jobsJsonPath, 'utf8'));
      const jobs = Array.isArray(j?.jobs) ? j.jobs : Array.isArray(j) ? j : [];
      for (const job of jobs) {
        if (job?.id && job?.name) jobsMap.set(job.id, job.name);
      }
    }
  } catch (e: any) {
    warnings.push(`Failed to read jobs.json: ${e?.message || String(e)}`);
  }

  const records: UsageRecord[] = [];

  // 1) Cron runs
  if (fs.existsSync(CRON_RUNS_DIR)) {
    const runFiles = fs.readdirSync(CRON_RUNS_DIR).filter(f => f.endsWith('.jsonl'));

    for (const file of runFiles) {
      const jobId = file.replace(/\.jsonl$/, '');
      const jobName = jobsMap.get(jobId);
      const filePath = path.join(CRON_RUNS_DIR, file);

      await readJsonlLines(filePath, async (obj) => {
        if (obj?.action !== 'finished') return;
        const runAtMs = Number(obj.runAtMs);
        if (!Number.isFinite(runAtMs)) return;
        if (runAtMs < startMs || runAtMs > endMs) return;

        const status = obj.status === 'ok' ? 'ok' : 'error';
        const sessionId = obj.sessionId;
        const sessionKey = obj.sessionKey;

        let cost: number | undefined;
        let tokens: number | undefined;
        let model: string | undefined;

        if (sessionId) {
          const sum = await summarizeSessionUsage(sessionId);
          if (sum) {
            cost = sum.cost;
            tokens = sum.tokens;
            model = pickTopModel(sum.models);
          }
        }

        const { day, hour } = utcDayHour(runAtMs);
        records.push({
          kind: 'cron',
          ts: runAtMs,
          day,
          hour,
          jobId,
          jobName,
          sessionId,
          sessionKey,
          model,
          status,
          cost,
          tokens,
        });
      });
    }
  } else {
    warnings.push(`Cron runs directory not found: ${CRON_RUNS_DIR}`);
  }

  // 2) Heartbeats (scan all agent sessions; detect the heartbeat prompt and take the immediate assistant usage)
  const sessionFiles = listSessionFiles();
  if (sessionFiles.length) {
    for (const sf of sessionFiles) {
      const filePath = sf.filePath;

      let pendingHeartbeatAt: number | null = null;

      await readJsonlLines(filePath, (obj) => {
        if (obj?.type !== 'message') return;
        const msg = obj.message;
        if (!msg) return;

        // user heartbeat prompt
        if (msg.role === 'user') {
          const content = msg.content;
          const text = Array.isArray(content)
            ? content.map((c: any) => (c?.type === 'text' ? c.text : '')).join('')
            : typeof content === 'string'
              ? content
              : '';
          if (text && text.startsWith(HEARTBEAT_PROMPT_START)) {
            pendingHeartbeatAt = Number(msg.timestamp ?? obj.timestamp ? Date.parse(obj.timestamp) : NaN);
          }
          return;
        }

        // next assistant message with usage counts as the heartbeat run
        if (msg.role === 'assistant' && pendingHeartbeatAt) {
          const ts = pendingHeartbeatAt;
          pendingHeartbeatAt = null;
          if (!Number.isFinite(ts) || ts < startMs || ts > endMs) return;

          const usage = msg.usage;
          if (!usage) return;

          const tokens = Number(usage.totalTokens ?? usage.total ?? usage.tokens ?? usage.input + usage.output);
          const cost = Number(usage.cost?.total ?? usage.costTotal ?? usage.cost);
          const model = msg.model || usage.model || obj.model || 'unknown';

          const { day, hour } = utcDayHour(ts);
          records.push({
            kind: 'heartbeat',
            ts,
            day,
            hour,
            model,
            status: 'ok',
            cost: Number.isFinite(cost) ? cost : undefined,
            tokens: Number.isFinite(tokens) ? tokens : undefined,
          });
        }
      });
    }
  } else {
    warnings.push(`Agents sessions directories not found under: ${AGENTS_DIR}`);
  }

  // sort
  records.sort((a, b) => a.ts - b.ts);

  return { records, warnings };
}
