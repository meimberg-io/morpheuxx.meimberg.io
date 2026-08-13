'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';

type UsageRecord = {
  kind: 'cron' | 'heartbeat' | 'interactive';
  ts: number;
  day: string; // YYYY-MM-DD (UTC)
  hour: string; // YYYY-MM-DDTHH (UTC)
  jobId?: string;
  jobName?: string;
  model?: string;
  status?: 'ok' | 'error';
  cost?: number;
  tokens?: number;
  agentId?: string;
};

type ApiResponse = {
  startMs: number;
  endMs: number;
  records: UsageRecord[];
  warnings: string[];
  providerTruth?: {
    openai?: {
      available: boolean;
      totalCost?: number;
      rows?: number;
      byProject?: Array<{ projectId: string; amountUsd: number }>;
      byLineItem?: Array<{ lineItem: string; amountUsd: number }>;
    };
  };
  attribution?: {
    totalCost?: number;
    gapToOpenAI?: number;
  };
};

type Metric = 'cost' | 'tokens';

type PivotRow = {
  job: string;
  runs: number;
  byModel: Record<string, number>;
  total: number;
};

function uniq(arr: (string | undefined)[]) {
  return Array.from(new Set(arr.filter(Boolean) as string[])).sort();
}

function sum(nums: (number | undefined)[]) {
  return nums.reduce((a, b) => a + (Number.isFinite(b as number) ? (b as number) : 0), 0);
}

function fmtMoneyUSD(n?: number) {
  if (n === undefined || !Number.isFinite(n)) return '—';
  return `$${n.toFixed(3)}`;
}

function fmtInt(n?: number) {
  if (n === undefined || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}

function metricValue(r: UsageRecord, metric: Metric): number {
  const v = metric === 'cost' ? r.cost : r.tokens;
  return Number.isFinite(v as number) ? (v as number) : 0;
}

function groupBy<T>(items: T[], keyFn: (t: T) => string) {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = keyFn(it);
    const arr = m.get(k) || [];
    arr.push(it);
    m.set(k, arr);
  }
  return m;
}

function toLocal(ts: number) {
  return new Date(ts).toLocaleString();
}

export default function UsageDashboard() {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const chartByModelRef = useRef<any>(null);
  const chartByJobRef = useRef<any>(null);
  const suppressLegendHandlerRef = useRef(false);

  // filters
  const [range, setRange] = useState<'24h' | '7d' | '30d'>('7d');
  const [kind, setKind] = useState<'all' | 'cron' | 'heartbeat' | 'interactive'>('all');
  const [model, setModel] = useState<string>('all');
  const [job, setJob] = useState<string>('all');
  const [agent, setAgent] = useState<string>('all');
  const [bucket, setBucket] = useState<'day' | 'hour'>('day');
  const [bucketTouched, setBucketTouched] = useState(false);
  const [metric, setMetric] = useState<Metric>('cost');

  useEffect(() => {
    const now = Date.now();
    const delta = range === '24h' ? 24 * 3600e3 : range === '30d' ? 30 * 24 * 3600e3 : 7 * 24 * 3600e3;
    const startMs = now - delta;

    // Auto-bucket: only if user hasn't manually touched the bucket selector
    if (!bucketTouched) setBucket(range === '24h' ? 'hour' : 'day');

    setLoading(true);
    fetch(`/api/reports/usage?startMs=${startMs}&endMs=${now}`)
      .then(r => r.json())
      .then((j: ApiResponse) => setData(j))
      .finally(() => setLoading(false));
  }, [range]);

  const records = data?.records || [];

  const modelOptions = useMemo(() => ['all', ...uniq(records.map(r => r.model || 'unknown'))], [records]);
  const jobOptions = useMemo(() => {
    const cronJobs = uniq(records.filter(r => r.kind === 'cron').map(r => r.jobName || r.jobId || 'unknown'));
    // Add synthetic jobs so they can be shown/filtered like jobs.
    return ['all', 'heartbeat', 'interactive', ...cronJobs];
  }, [records]);
  const agentOptions = useMemo(() => ['all', ...uniq(records.map(r => r.agentId || 'main'))], [records]);

  const filtered = useMemo(() => {
    return records.filter(r => {
      if (kind !== 'all' && r.kind !== kind) return false;
      const m = r.model || 'unknown';
      if (model !== 'all' && m !== model) return false;
      if (agent !== 'all' && (r.agentId || 'main') !== agent) return false;
      if (job !== 'all') {
        const j = r.kind === 'heartbeat'
          ? 'heartbeat'
          : r.kind === 'interactive'
            ? 'interactive'
            : (r.jobName || r.jobId || 'unknown');
        if (j !== job) return false;
      }
      return true;
    });
  }, [records, kind, model, job, agent]);

  const totals = useMemo(() => {
    return {
      cost: sum(filtered.map(r => r.cost)),
      tokens: sum(filtered.map(r => r.tokens)),
      rows: filtered.length,
    };
  }, [filtered]);

  const providerTruth = data?.providerTruth?.openai;
  const attributionSummary = data?.attribution;

  function fmtDayUtc(ms: number) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function fmtHourUtc(ms: number) {
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    const h = String(d.getUTCHours()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}`;
  }

  function floorToHour(ms: number) {
    return Math.floor(ms / 3600e3) * 3600e3;
  }

  function floorToDay(ms: number) {
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  const timeSeries = useMemo(() => {
    const startMs = data?.startMs ?? Date.now() - 7 * 24 * 3600e3;
    const endMs = data?.endMs ?? Date.now();

    // Build a complete axis (fill missing buckets with zeros)
    const keys: string[] = [];
    if (bucket === 'hour') {
      let cur = floorToHour(startMs);
      const end = floorToHour(endMs);
      while (cur <= end) {
        keys.push(fmtHourUtc(cur));
        cur += 3600e3;
      }
    } else {
      let cur = floorToDay(startMs);
      const end = floorToDay(endMs);
      while (cur <= end) {
        keys.push(fmtDayUtc(cur));
        cur += 24 * 3600e3;
      }
    }

    const keyFn = (r: UsageRecord) => (bucket === 'day' ? r.day : r.hour);
    const g = groupBy(filtered, keyFn);

    const cost = keys.map(k => sum((g.get(k) || []).map(r => r.cost)));
    const tokens = keys.map(k => sum((g.get(k) || []).map(r => r.tokens)));

    return { keys, cost, tokens };
  }, [filtered, bucket, data?.startMs, data?.endMs]);

  const pivot = useMemo(() => {
    // Include heartbeats + interactive as synthetic jobs so they show up in the matrix.
    const scoped = filtered.filter(r => r.kind === 'cron' || r.kind === 'heartbeat' || r.kind === 'interactive');
    const models = uniq(scoped.map(r => r.model || 'unknown'));

    const byJobMap = new Map<string, UsageRecord[]>();
    for (const r of scoped) {
      const j = r.kind === 'heartbeat'
        ? 'heartbeat'
        : r.kind === 'interactive'
          ? 'interactive'
          : (r.jobName || r.jobId || 'unknown');
      const arr = byJobMap.get(j) || [];
      arr.push(r);
      byJobMap.set(j, arr);
    }

    const rows: PivotRow[] = [];
    for (const [jobName, rs] of Array.from(byJobMap.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
      const byModel: Record<string, number> = {};
      for (const m of models) byModel[m] = 0;
      for (const r of rs) {
        const m = r.model || 'unknown';
        if (!(m in byModel)) byModel[m] = 0;
        byModel[m] += metricValue(r, metric);
      }
      const total = Object.values(byModel).reduce((a, b) => a + b, 0);
      rows.push({ job: jobName, runs: rs.length, byModel, total });
    }

    // totals per model + grand total
    const totalsByModel: Record<string, number> = {};
    for (const m of models) totalsByModel[m] = 0;
    for (const r of rows) {
      for (const m of models) totalsByModel[m] += r.byModel[m] || 0;
    }
    const grandTotal = Object.values(totalsByModel).reduce((a, b) => a + b, 0);

    // Sort rows by total desc to make hotspots pop
    rows.sort((a, b) => b.total - a.total);

    return { models, rows, totalsByModel, grandTotal };
  }, [filtered, metric]);

  const chartOptions = useMemo(() => {
    const yCost = timeSeries.cost;
    const yTokens = timeSeries.tokens;

    return {
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#a3a3a3' } },
      grid: { left: 40, right: 16, top: 36, bottom: 40 },
      xAxis: {
        type: 'category',
        data: timeSeries.keys,
        axisLabel: { color: '#a3a3a3' },
        axisLine: { lineStyle: { color: '#262626' } },
      },
      yAxis: [
        {
          type: 'value',
          name: 'Cost',
          axisLabel: { color: '#a3a3a3' },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
        },
        {
          type: 'value',
          name: 'Tokens',
          axisLabel: { color: '#a3a3a3' },
          splitLine: { show: false },
        },
      ],
/* zoom removed */
      series: [
        {
          name: 'Cost',
          type: 'bar',
          data: yCost,
          yAxisIndex: 0,
          itemStyle: { color: '#dc2626' },
          barMaxWidth: 18,
        },
        {
          name: 'Tokens',
          type: 'bar',
          data: yTokens,
          yAxisIndex: 1,
          itemStyle: { color: '#a3a3a3' },
          barMaxWidth: 18,
        },
      ],
      backgroundColor: 'transparent',
      textStyle: { color: '#fafafa' },
    };
  }, [timeSeries]);

  const stackedCostByModelOptions = useMemo(() => {
    const keys = timeSeries.keys;
    const g = new Map<string, Map<string, number>>();
    for (const r of filtered) {
      const k = bucket === 'day' ? r.day : r.hour;
      const m = r.model || 'unknown';
      if (!g.has(m)) g.set(m, new Map());
      const mm = g.get(m)!;
      mm.set(k, (mm.get(k) || 0) + (Number.isFinite(r.cost as number) ? (r.cost as number) : 0));
    }
    const models = Array.from(g.keys()).sort();

    return {
      tooltip: { trigger: 'axis' },
      // Legend right, vertical; exclusive behavior is implemented via legendselectchanged handler
      legend: {
        type: 'scroll',
        orient: 'vertical',
        right: 8,
        top: 24,
        bottom: 24,
        selectedMode: true,
        textStyle: { color: '#a3a3a3' },
      },
      grid: { left: 40, right: 220, top: 24, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: keys, axisLabel: { color: '#a3a3a3' }, axisLine: { lineStyle: { color: '#262626' } } },
      yAxis: { type: 'value', axisLabel: { color: '#a3a3a3' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
      series: models.map((m) => ({
        name: m,
        type: 'bar',
        stack: 'total',
        emphasis: { focus: 'series' },
        data: keys.map((k) => (g.get(m)?.get(k) || 0)),
      })),
      backgroundColor: 'transparent',
      textStyle: { color: '#fafafa' },
    };
  }, [filtered, timeSeries.keys, bucket]);

  const stackedCostByJobOptions = useMemo(() => {
    const keys = timeSeries.keys;

    // Use the same job universe as the pivot (cron + heartbeat + interactive)
    const jobs = pivot.rows.map(r => r.job);

    const seriesMap = new Map<string, Map<string, number>>();
    const ensure = (name: string) => {
      if (!seriesMap.has(name)) seriesMap.set(name, new Map());
      return seriesMap.get(name)!;
    };

    for (const r of filtered) {
      const k = bucket === 'day' ? r.day : r.hour;
      const j = r.kind === 'heartbeat'
        ? 'heartbeat'
        : r.kind === 'interactive'
          ? 'interactive'
          : (r.jobName || r.jobId || 'unknown');

      if (!jobs.includes(j)) continue;

      const jm = ensure(j);
      jm.set(k, (jm.get(k) || 0) + (Number.isFinite(r.cost as number) ? (r.cost as number) : 0));
    }

    return {
      tooltip: { trigger: 'axis' },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        right: 8,
        top: 24,
        bottom: 24,
        selectedMode: true,
        textStyle: { color: '#a3a3a3' },
      },
      grid: { left: 40, right: 220, top: 24, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: keys, axisLabel: { color: '#a3a3a3' }, axisLine: { lineStyle: { color: '#262626' } } },
      yAxis: { type: 'value', axisLabel: { color: '#a3a3a3' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
      series: jobs.map((j) => ({
        name: j,
        type: 'bar',
        stack: 'total',
        emphasis: { focus: 'series' },
        data: keys.map((k) => (seriesMap.get(j)?.get(k) || 0)),
      })),
      backgroundColor: 'transparent',
      textStyle: { color: '#fafafa' },
    };
  }, [filtered, timeSeries.keys, bucket, pivot.rows]);

  const stackedCostByAgentOptions = useMemo(() => {
    const keys = timeSeries.keys;
    const agents = uniq(filtered.map(r => r.agentId || 'main'));

    const seriesMap = new Map<string, Map<string, number>>();
    const ensure = (name: string) => {
      if (!seriesMap.has(name)) seriesMap.set(name, new Map());
      return seriesMap.get(name)!;
    };

    for (const r of filtered) {
      const k = bucket === 'day' ? r.day : r.hour;
      const a = r.agentId || 'main';
      const am = ensure(a);
      am.set(k, (am.get(k) || 0) + (Number.isFinite(r.cost as number) ? (r.cost as number) : 0));
    }

    return {
      tooltip: { trigger: 'axis' },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        right: 8,
        top: 24,
        bottom: 24,
        selectedMode: true,
        textStyle: { color: '#a3a3a3' },
      },
      grid: { left: 40, right: 220, top: 24, bottom: 24, containLabel: true },
      xAxis: { type: 'category', data: keys, axisLabel: { color: '#a3a3a3' }, axisLine: { lineStyle: { color: '#262626' } } },
      yAxis: { type: 'value', axisLabel: { color: '#a3a3a3' }, splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } } },
      series: agents.map((a) => ({
        name: a,
        type: 'bar',
        stack: 'total',
        emphasis: { focus: 'series' },
        data: keys.map((k) => (seriesMap.get(a)?.get(k) || 0)),
      })),
      backgroundColor: 'transparent',
      textStyle: { color: '#fafafa' },
    };
  }, [filtered, timeSeries.keys, bucket]);

  const chartByAgentRef = useRef<any>(null);

  // When global filters change, reset chart legends so charts don't look "inconsistent"
  // due to previously hidden series (ECharts keeps legend selection state by name).
  useEffect(() => {
    suppressLegendHandlerRef.current = true;
    const instM = chartByModelRef.current?.getEchartsInstance?.();
    instM?.dispatchAction?.({ type: 'legendAllSelect' });
    const instJ = chartByJobRef.current?.getEchartsInstance?.();
    instJ?.dispatchAction?.({ type: 'legendAllSelect' });
    const instA = chartByAgentRef.current?.getEchartsInstance?.();
    instA?.dispatchAction?.({ type: 'legendAllSelect' });
    setTimeout(() => (suppressLegendHandlerRef.current = false), 0);
  }, [range, kind, model, job, agent, bucket, metric]);

  const formatMetric = (v: number, opts?: { total?: boolean }) => {
    if (metric === 'tokens') {
      // Hide zeros for readability (except totals)
      if (!opts?.total && (!v || v === 0)) return '';
      return fmtInt(v);
    }

    // cost
    if (!opts?.total && (!v || v === 0)) return '';
    if (v === undefined || !Number.isFinite(v)) return '—';
    // Keep it simple/consistent: 2 decimals everywhere.
    return `$${v.toFixed(2)}`;
  };

  return (
    <div className="usage-page">
      <div className="usage-controls">
        <div className="usage-control">
          <label>Range</label>
          <select value={range} onChange={e => setRange(e.target.value as any)}>
            <option value="24h">Last 24h</option>
            <option value="7d">Last 7d</option>
            <option value="30d">Last 30d</option>
          </select>
        </div>
        <div className="usage-control">
          <label>Kind</label>
          <select value={kind} onChange={e => setKind(e.target.value as any)}>
            <option value="all">All</option>
            <option value="cron">Cron</option>
            <option value="heartbeat">Heartbeat</option>
            <option value="interactive">Interactive</option>
          </select>
        </div>
        <div className="usage-control">
          <label>Model</label>
          <select value={model} onChange={e => setModel(e.target.value)}>
            {modelOptions.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div className="usage-control">
          <label>Job (cron)</label>
          <select value={job} onChange={e => setJob(e.target.value)}>
            {jobOptions.map(j => (
              <option key={j} value={j}>{j}</option>
            ))}
          </select>
        </div>
        <div className="usage-control">
          <label>Agent</label>
          <select value={agent} onChange={e => setAgent(e.target.value)}>
            {agentOptions.map(a => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div className="usage-control">
          <label>Bucket</label>
          <select
            value={bucket}
            onChange={e => {
              setBucketTouched(true);
              setBucket(e.target.value as any);
            }}
          >
            <option value="day">Day</option>
            <option value="hour">Hour</option>
          </select>
        </div>
        <div className="usage-control">
          <label>Metric</label>
          <div className="usage-toggle">
            <button className={metric === 'cost' ? 'active' : ''} onClick={() => setMetric('cost')}>Cost</button>
            <button className={metric === 'tokens' ? 'active' : ''} onClick={() => setMetric('tokens')}>Tokens</button>
          </div>
        </div>

        <div className="usage-summary">
          {loading ? (
            <span>Loading…</span>
          ) : (
            <>
              <div className="usage-summary-item"><span>Rows</span><strong>{totals.rows}</strong></div>
              <div className="usage-summary-item"><span>Attributed</span><strong>{fmtMoneyUSD(attributionSummary?.totalCost ?? totals.cost)}</strong></div>
              <div className="usage-summary-item"><span>OpenAI Truth</span><strong>{providerTruth?.available ? fmtMoneyUSD(providerTruth.totalCost) : '—'}</strong></div>
              <div className="usage-summary-item"><span>Gap</span><strong>{providerTruth?.available ? fmtMoneyUSD(attributionSummary?.gapToOpenAI) : '—'}</strong></div>
              <div className="usage-summary-item"><span>Tokens</span><strong>{fmtInt(totals.tokens)}</strong></div>
            </>
          )}
        </div>
      </div>

      {data?.warnings?.length ? (
        <div className="usage-warn">
          <strong>Warnings</strong>
          <ul>
            {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      ) : null}

      <section className="usage-card">
        <div className="usage-card-header">
          <h2>Truth vs Attributed</h2>
          <p>Provider truth = echte OpenAI-Kosten. Attributed = aus Sessions rekonstruierte Zuordnung.</p>
        </div>

        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th className="sticky left">View</th>
                <th className="sticky right">Cost</th>
                <th className="sticky left">Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="left mono">Attributed</td>
                <td className="right mono strong">{fmtMoneyUSD(attributionSummary?.totalCost ?? totals.cost)}</td>
                <td className="left">Session-/Message-basierte Attribution aus OpenClaw.</td>
              </tr>
              <tr>
                <td className="left mono">OpenAI provider truth</td>
                <td className="right mono strong">{providerTruth?.available ? fmtMoneyUSD(providerTruth.totalCost) : '—'}</td>
                <td className="left">Direkt vom Provider ingestete Kosten.</td>
              </tr>
              <tr>
                <td className="left mono">Gap</td>
                <td className="right mono strong">{providerTruth?.available ? fmtMoneyUSD(attributionSummary?.gapToOpenAI) : '—'}</td>
                <td className="left">Differenz zwischen Provider-Truth und Attribution.</td>
              </tr>
            </tbody>
          </table>
        </div>

        {providerTruth?.available ? (
          <div className="usage-table-wrap" style={{ marginTop: '1rem' }}>
            <table className="usage-table">
              <thead>
                <tr>
                  <th className="sticky left">OpenAI project</th>
                  <th className="sticky right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {(providerTruth.byProject || []).slice().sort((a, b) => b.amountUsd - a.amountUsd).map((r) => (
                  <tr key={r.projectId}>
                    <td className="left mono">{r.projectId}</td>
                    <td className="right mono">{fmtMoneyUSD(r.amountUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="usage-card">
        <div className="usage-card-header">
          <h2>Over time</h2>
          <p>Cost + Tokens (Zoom/Scroll).</p>
        </div>
        <div className="usage-chart">
          <ReactECharts option={chartOptions as any} style={{ height: 320, width: '100%' }} notMerge lazyUpdate />
        </div>
      </section>

      <section className="usage-card">
        <div className="usage-card-header" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h2>Stacked bars — Cost by model</h2>
            <p>Zeigt, welche Modelle über die Zeit die Kosten treiben.</p>
          </div>
          <button
            className="usage-small-btn"
            onClick={() => {
              suppressLegendHandlerRef.current = true;
              const inst = chartByModelRef.current?.getEchartsInstance?.();
              inst?.dispatchAction?.({ type: 'legendAllSelect' });
              // allow next user interaction
              setTimeout(() => (suppressLegendHandlerRef.current = false), 0);
            }}
          >
            Show all
          </button>
        </div>
        <div className="usage-chart">
          <ReactECharts
            ref={chartByModelRef}
            option={stackedCostByModelOptions as any}
            style={{ height: 360, width: '100%' }}
            notMerge
            lazyUpdate
            onEvents={{
              legendselectchanged: (e: any) => {
                if (suppressLegendHandlerRef.current) return;
                const inst = chartByModelRef.current?.getEchartsInstance?.();
                if (!inst) return;

                // Exclusive show: when a legend item is selected, hide all others.
                const selected = e?.selected || {};
                const clicked = e?.name;
                if (!clicked) return;

                // If user just selected an item -> keep only that one selected.
                if (selected[clicked] === true) {
                  for (const k of Object.keys(selected)) {
                    if (k !== clicked && selected[k] === true) {
                      inst.dispatchAction({ type: 'legendUnSelect', name: k });
                    }
                  }
                }
              },
            }}
          />
        </div>
      </section>

      <section className="usage-card">
        <div className="usage-card-header" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h2>Stacked bars — Cost by job</h2>
            <p>Gleiche Job-Liste wie Pivot (inkl. heartbeat + interactive).</p>
          </div>
          <button
            className="usage-small-btn"
            onClick={() => {
              suppressLegendHandlerRef.current = true;
              const inst = chartByJobRef.current?.getEchartsInstance?.();
              inst?.dispatchAction?.({ type: 'legendAllSelect' });
              setTimeout(() => (suppressLegendHandlerRef.current = false), 0);
            }}
          >
            Show all
          </button>
        </div>
        <div className="usage-chart">
          <ReactECharts
            ref={chartByJobRef}
            option={stackedCostByJobOptions as any}
            style={{ height: 360, width: '100%' }}
            notMerge
            lazyUpdate
            onEvents={{
              legendselectchanged: (e: any) => {
                if (suppressLegendHandlerRef.current) return;
                const inst = chartByJobRef.current?.getEchartsInstance?.();
                if (!inst) return;

                const selected = e?.selected || {};
                const clicked = e?.name;
                if (!clicked) return;

                if (selected[clicked] === true) {
                  for (const k of Object.keys(selected)) {
                    if (k !== clicked && selected[k] === true) {
                      inst.dispatchAction({ type: 'legendUnSelect', name: k });
                    }
                  }
                }
              },
            }}
          />
        </div>
      </section>

      <section className="usage-card">
        <div className="usage-card-header" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <h2>Stacked bars — Cost by agent</h2>
            <p>Zeigt, welche Agents über die Zeit die Kosten treiben.</p>
          </div>
          <button
            className="usage-small-btn"
            onClick={() => {
              suppressLegendHandlerRef.current = true;
              const inst = chartByAgentRef.current?.getEchartsInstance?.();
              inst?.dispatchAction?.({ type: 'legendAllSelect' });
              setTimeout(() => (suppressLegendHandlerRef.current = false), 0);
            }}
          >
            Show all
          </button>
        </div>
        <div className="usage-chart">
          <ReactECharts
            ref={chartByAgentRef}
            option={stackedCostByAgentOptions as any}
            style={{ height: 360, width: '100%' }}
            notMerge
            lazyUpdate
            onEvents={{
              legendselectchanged: (e: any) => {
                if (suppressLegendHandlerRef.current) return;
                const inst = chartByAgentRef.current?.getEchartsInstance?.();
                if (!inst) return;

                const selected = e?.selected || {};
                const clicked = e?.name;
                if (!clicked) return;

                if (selected[clicked] === true) {
                  for (const k of Object.keys(selected)) {
                    if (k !== clicked && selected[k] === true) {
                      inst.dispatchAction({ type: 'legendUnSelect', name: k });
                    }
                  }
                }
              },
            }}
          />
        </div>
      </section>

      <section className="usage-card">
        <div className="usage-card-header">
          <h2>By Job × Model</h2>
          <p>Matrix: Jobs als Zeilen, Models als Spalten. Umschaltbar Cost/Tokens. Totals rechts/unten.</p>
        </div>

        <div className="usage-table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th className="sticky left">Job</th>
                <th className="sticky">Runs</th>
                {pivot.models.map(m => (
                  <th key={m} className="sticky">{m}</th>
                ))}
                <th className="sticky right">Total</th>
              </tr>
            </thead>
            <tbody>
              {pivot.rows.map(r => (
                <tr key={r.job}>
                  <td className="left mono">{r.job}</td>
                  <td className="mono">{r.runs}</td>
                  {pivot.models.map(m => (
                    <td key={m} className="mono">{formatMetric(r.byModel[m] || 0)}</td>
                  ))}
                  <td className="right mono strong">{formatMetric(r.total, { total: true })}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="left strong">Totals</td>
                <td className="mono">—</td>
                {pivot.models.map(m => (
                  <td key={m} className="mono strong">{formatMetric(pivot.totalsByModel[m] || 0, { total: true })}</td>
                ))}
                <td className="right mono strong">{formatMetric(pivot.grandTotal, { total: true })}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="usage-card">
        <details className="usage-advanced">
          <summary className="usage-advanced-summary">Advanced</summary>

          <div className="usage-card-header" style={{ marginTop: '0.75rem' }}>
            <h2>Raw runs (latest 250)</h2>
            <p>Für Debugging. Filter wirkt global.</p>
          </div>

          <div className="usage-table-wrap">
            <table className="usage-table">
              <thead>
                <tr>
                  <th className="sticky left">When</th>
                  <th className="sticky">Kind</th>
                  <th className="sticky">Job</th>
                  <th className="sticky">Model</th>
                  <th className="sticky">Status</th>
                  <th className="sticky right">Cost</th>
                  <th className="sticky right">Tokens</th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice().sort((a,b)=>b.ts-a.ts).slice(0, 250).map((r, idx) => (
                  <tr key={idx}>
                    <td className="left mono">{toLocal(r.ts)}</td>
                    <td className="mono">{r.kind}</td>
                    <td className="mono">{r.kind === 'cron' ? (r.jobName || r.jobId || '—') : (r.kind === 'heartbeat' ? 'heartbeat' : 'interactive')}</td>
                    <td className="mono">{r.model || 'unknown'}</td>
                    <td className="mono">{r.status || 'ok'}</td>
                    <td className="right mono">{fmtMoneyUSD(r.cost)}</td>
                    <td className="right mono">{fmtInt(r.tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
    </div>
  );
}
