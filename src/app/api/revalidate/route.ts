import { revalidatePath } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';

// Secret token for API authentication
// Set REVALIDATE_SECRET in environment variables
const REVALIDATE_SECRET = process.env.REVALIDATE_SECRET || 'morpheuxx-revalidate-2026';

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret') || request.headers.get('x-revalidate-secret');
    
    // Verify secret
    if (secret !== REVALIDATE_SECRET) {
      return NextResponse.json(
        { error: 'Invalid secret' },
        { status: 401 }
      );
    }

    // Get path from body or query
    let path: string | null = searchParams.get('path');
    
    if (!path) {
      const body = await request.json().catch(() => ({}));
      path = body.path;
    }

    if (!path) {
      return NextResponse.json(
        { error: 'Missing path parameter' },
        { status: 400 }
      );
    }

    // Revalidate the path
    revalidatePath(path);

    return NextResponse.json({
      revalidated: true,
      path,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to revalidate', details: String(error) },
      { status: 500 }
    );
  }
}

// Also support GET for simple curl usage
export async function GET(request: NextRequest) {
  return POST(request);
}
