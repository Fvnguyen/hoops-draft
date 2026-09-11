import { NextResponse } from 'next/server';
import { getAllCards } from '@/lib/engine';

export async function GET() {
  try {
    const cards = getAllCards();
    return NextResponse.json(cards);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Failed to generate cards' }, { status: 500 });
  }
}
