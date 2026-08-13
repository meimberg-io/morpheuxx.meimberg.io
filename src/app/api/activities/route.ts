
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const ACTIVITIES_FILE = path.join(process.cwd(), 'data', 'activities.json');

export async function GET() {
  try {
    const data = JSON.parse(fs.readFileSync(ACTIVITIES_FILE, 'utf8'));
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read activities' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { type, title, description, tags } = await request.json();
    
    if (!type || !title) {
      return NextResponse.json({ error: 'type and title are required' }, { status: 400 });
    }

    const data = JSON.parse(fs.readFileSync(ACTIVITIES_FILE, 'utf8'));
    
    const nowIso = new Date().toISOString();
    const activity = {
      id: Date.now().toString(),
      timestamp: nowIso,
      type,
      title,
      description: description || '',
      tags: tags || []
    };

    // Basic dedup: if an identical type+title was posted recently, don't spam.
    // (Prevents guard/worker loops from flooding /status.)
    const recentWindowMs = 6 * 60 * 60 * 1000;
    const nowMs = Date.now();
    const isDup = (data.activities || []).some((a: any) => {
      if (!a) return false;
      if (a.type !== type) return false;
      if (a.title !== title) return false;
      const ts = Date.parse(a.timestamp || '');
      if (!Number.isFinite(ts)) return false;
      return Math.abs(nowMs - ts) < recentWindowMs;
    });

    if (!isDup) {
      data.activities.unshift(activity);
    }
    if (!isDup) {
      data.stats.totalActivities++;
      data.stats.lastUpdate = nowIso;

      if (data.activities.length > 1000) {
        data.activities = data.activities.slice(0, 1000);
      }

      fs.writeFileSync(ACTIVITIES_FILE, JSON.stringify(data, null, 2));
      return NextResponse.json({ success: true, activity });
    }

    return NextResponse.json({ success: true, activity, deduped: true });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to add activity' }, { status: 500 });
  }
}
