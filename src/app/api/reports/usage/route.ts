import { NextRequest, NextResponse } from 'next/server';
import { buildUsageRecords } from '@/lib/usageReport';
import { ensureSchema, queryProviderCosts, queryUsageEvents, usageDbEnabled } from '@/lib/usageDb';

export const runtime = 'nodejs';

function parseMs(v: string | null, fallback: number) {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sum(nums: Array<number | undefined>) {
  return nums.reduce((a, b) => a + (Number.isFinite(b as number) ? (b as number) : 0), 0);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);

  const now = Date.now();
  const defaultStart = now - 7 * 24 * 60 * 60 * 1000;

  const startMs = parseMs(searchParams.get('startMs'), defaultStart);
  const endMs = parseMs(searchParams.get('endMs'), now);

  try {
    const warnings: string[] = [];
    let records: any[] = [];

    if (usageDbEnabled()) {
      await ensureSchema();
      const rows = await queryUsageEvents({ startMs, endMs });
      records = rows.map(r => ({
        kind: r.kind,
        ts: r.ts,
        day: r.day,
        hour: r.hour,
        jobId: r.jobId || undefined,
        jobName: r.jobName || undefined,
        model: r.model || undefined,
        status: (r.status as any) || undefined,
        cost: r.cost === null ? undefined : r.cost,
        tokens: r.tokens === null ? undefined : Number(r.tokens),
        sessionId: r.sessionId || undefined,
        agentId: r.agentId || 'main',
        missingUsage: r.missingUsage ? true : false,
      }));

      const providerRows = await queryProviderCosts({ provider: 'openai', startMs, endMs });
      const providerTotal = sum(providerRows.map(r => r.amountUsd));
      const attributedTotal = sum(records.map(r => r.cost));

      const byProject = Array.from(providerRows.reduce((m, row) => {
        const key = row.projectId || 'unassigned';
        const prev = m.get(key) || 0;
        m.set(key, prev + row.amountUsd);
        return m;
      }, new Map<string, number>()).entries()).map(([projectId, amountUsd]) => ({ projectId, amountUsd }));

      const byLineItem = Array.from(providerRows.reduce((m, row) => {
        const key = row.lineItem || 'unknown';
        const prev = m.get(key) || 0;
        m.set(key, prev + row.amountUsd);
        return m;
      }, new Map<string, number>()).entries()).map(([lineItem, amountUsd]) => ({ lineItem, amountUsd }));

      if (!providerRows.length) {
        warnings.push('No OpenAI provider-truth rows found in provider_costs for this range. Attribution is available; provider truth is not ingested yet.');
      }

      return NextResponse.json({
        startMs,
        endMs,
        records,
        warnings,
        providerTruth: {
          openai: {
            available: providerRows.length > 0,
            totalCost: providerRows.length > 0 ? providerTotal : undefined,
            rows: providerRows.length,
            byProject,
            byLineItem,
          },
        },
        attribution: {
          totalCost: attributedTotal,
          gapToOpenAI: providerRows.length > 0 ? providerTotal - attributedTotal : undefined,
        },
      });
    }

    const built = await buildUsageRecords({ startMs, endMs });
    records = built.records;
    warnings.push(...built.warnings);
    warnings.push('DB-backed provider truth is disabled; showing attribution only.');

    return NextResponse.json({
      startMs,
      endMs,
      records,
      warnings,
      providerTruth: {
        openai: {
          available: false,
          rows: 0,
          byProject: [],
          byLineItem: [],
        },
      },
      attribution: {
        totalCost: sum(records.map(r => r.cost)),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
