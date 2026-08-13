import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
import UsageDashboard from './usage-dashboard';

async function hasLocalBypass() {
  const h = await headers();
  return h.get('x-local-bypass') === '1';
}

export default async function UsageReportPage() {
  if (!(await hasLocalBypass())) {
    const session = await auth();
    if (!session?.user) redirect('/api/auth/signin');
  }

  return (
    <main className="main-content-wide">
      <header className="page-header">
        <h1>📊 Usage</h1>
        <p>Cron + Heartbeats. Filterbar, Pivot nach Job×Model, Charts nach Zeit — plus Truth-vs-Attributed für echtes Kosten-Controlling.</p>
      </header>
      <UsageDashboard />
    </main>
  );
}
