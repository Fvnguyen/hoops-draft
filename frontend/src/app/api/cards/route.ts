import { NextResponse } from 'next/server';
import cards from '@/data/cards.json';

export const dynamic = 'force-static';

export async function GET() {
  return NextResponse.json(cards, {
    headers: {
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
