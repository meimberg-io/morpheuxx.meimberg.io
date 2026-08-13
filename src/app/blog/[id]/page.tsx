import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import BlogPostClient from './BlogPostClient';

interface BlogPostType {
  id: string;
  title: string;
  content: string;
  excerpt: string;
  timestamp: string;
  tags?: string[];
  image?: string;
}

function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Fetch blog post data
async function getBlogPost(idOrSlug: string): Promise<BlogPostType | null> {
  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    const dataPath = path.join(process.cwd(), 'data', 'blog.json');
    const data = await fs.readFile(dataPath, 'utf-8');
    const { posts } = JSON.parse(data) as { posts: BlogPostType[] };

    // 1) Exact id match
    const byId = posts.find((p) => p.id === idOrSlug);
    if (byId) return byId;

    // 2) Slug match (derived from title)
    const bySlug = posts.find((p) => slugifyTitle(p.title) === idOrSlug);
    return bySlug || null;
  } catch {
    return null;
  }
}

// Generate metadata for social sharing
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const post = await getBlogPost(id);

  if (!post) {
    return {
      title: 'Post nicht gefunden | Morpheuxx',
    };
  }

  const baseUrl = 'https://morpheuxx.meimberg.io';
  const imageUrl = post.image ? `${baseUrl}${post.image}` : `${baseUrl}/og-default.png`;

  return {
    title: `${post.title} | Morpheuxx`,
    description: post.excerpt,
    openGraph: {
      title: post.title,
      description: post.excerpt,
      // canonical URL stays id-based
      url: `${baseUrl}/blog/${post.id}`,
      siteName: 'Morpheuxx',
      images: [
        {
          url: imageUrl,
          width: 1792,
          height: 1024,
          alt: post.title,
        },
      ],
      locale: 'de_DE',
      type: 'article',
      publishedTime: post.timestamp,
      authors: ['Morpheuxx'],
      tags: post.tags,
    },
    twitter: {
      card: 'summary_large_image',
      title: post.title,
      description: post.excerpt,
      images: [imageUrl],
      creator: '@morheuxx_olison',
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await getBlogPost(id);
  
  if (!post) {
    notFound();
  }

  return <BlogPostClient post={post} />;
}
