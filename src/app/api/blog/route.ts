
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const BLOG_FILE = path.join(process.cwd(), 'data', 'blog.json');

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const limit = searchParams.get('limit');
  
  try {
    const data = JSON.parse(fs.readFileSync(BLOG_FILE, 'utf8'));
    
    let posts = data.posts.map((post: any) => ({
      ...post,
      content: undefined, // Don't send full content in list
    }));

    if (limit) {
      posts = posts.slice(0, parseInt(limit));
    }
    
    return NextResponse.json({ posts, stats: data.stats });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read blog posts' }, { status: 500 });
  }
}

// --- Quality gate: reject junk / test posts ---
const TITLE_BLACKLIST = /^(test|todo|draft|untitled|asdf|xxx|placeholder)$/i;
const MIN_CONTENT_LENGTH = 500;
const MIN_TITLE_LENGTH = 5;
const IMAGE_BLACKLIST = /^\/(test|placeholder|dummy)\b/i;

function validatePost(title: string, content: string, image: string, tags?: string[]): string | null {
  if (!title || !content) return 'title and content are required';
  if (typeof title !== 'string' || title.trim().length < MIN_TITLE_LENGTH) return `title must be at least ${MIN_TITLE_LENGTH} characters`;
  if (TITLE_BLACKLIST.test(title.trim())) return `title "${title}" is blacklisted — no test/draft posts allowed`;
  if (typeof content !== 'string' || content.trim().length < MIN_CONTENT_LENGTH) return `content must be at least ${MIN_CONTENT_LENGTH} characters (got ${typeof content === 'string' ? content.trim().length : 0})`;
  if (typeof image !== 'string' || !image.trim()) return 'image is required (field name: "image", e.g. "/blog-hero-13.png")';
  if (IMAGE_BLACKLIST.test(image.trim())) return `image path "${image}" looks like a test placeholder`;
  if (!image.trim().startsWith('/blog-hero-')) return 'image path must start with "/blog-hero-" to ensure proper hero images';
  if (!Array.isArray(tags) || tags.length === 0) return 'at least one tag is required';
  if (tags.some((t: string) => /^test$/i.test(t))) return 'tag "test" is not allowed';
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { title, content, excerpt, tags, image } = await request.json();
    
    const validationError = validatePost(title, content, image, tags);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const data = JSON.parse(fs.readFileSync(BLOG_FILE, 'utf8'));
    
    const post = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      title,
      content,
      excerpt: excerpt || content.substring(0, 200).replace(/\n/g, ' ') + '...',
      tags: tags || [],
      image: image.trim()
    };

    data.posts.unshift(post);
    data.stats.totalPosts++;
    data.stats.lastPost = new Date().toISOString();

    fs.writeFileSync(BLOG_FILE, JSON.stringify(data, null, 2));
    return NextResponse.json({ success: true, post });
  } catch (error) {
    console.error('Blog post error:', error);
    return NextResponse.json({ error: 'Failed to create blog post' }, { status: 500 });
  }
}
