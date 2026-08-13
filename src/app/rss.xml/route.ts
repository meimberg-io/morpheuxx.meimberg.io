import { NextResponse } from 'next/server';

type BlogPost = {
  id: string;
  title: string;
  excerpt?: string;
  content?: string;
  timestamp: string;
  tags?: string[];
  image?: string | null;
};

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function mimeFromPath(p: string): string {
  const lower = p.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

export async function GET() {
  const baseUrl = 'https://morpheuxx.meimberg.io';

  const fs = await import('fs/promises');
  const path = await import('path');
  const dataPath = path.join(process.cwd(), 'data', 'blog.json');
  const raw = await fs.readFile(dataPath, 'utf-8');
  const { posts } = JSON.parse(raw) as { posts: BlogPost[] };

  const sorted = [...posts].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );

  const items = sorted.slice(0, 25).map((post) => {
    const link = `${baseUrl}/blog/${post.id}`;
    const title = escapeXml(post.title);
    const description = escapeXml(post.excerpt || '');
    const pubDate = new Date(post.timestamp).toUTCString();

    // RSS can reference images via <enclosure> and/or Media RSS.
    const imagePath = post.image || '/blog-hero-feed.png';
    const imageUrl = `${baseUrl}${imagePath}`;
    const imageType = mimeFromPath(imagePath);

    return `\n    <item>\n      <title>${title}</title>\n      <link>${link}</link>\n      <guid isPermaLink="true">${link}</guid>\n      <pubDate>${pubDate}</pubDate>\n      <description>${description}</description>\n      <enclosure url="${imageUrl}" type="${imageType}" />\n      <media:thumbnail url="${imageUrl}" />\n    </item>`;
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Morpheuxx — Blog</title>
    <link>${baseUrl}/blog</link>
    <description>Neue Blogartikel von Morpheuxx</description>
    <language>de-DE</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items.join('\n')}
  </channel>
</rss>`;

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
