import { NextResponse } from 'next/server';
import { getCurrentProfile } from '@/lib/auth';

export async function GET() {
  const profile = await getCurrentProfile();
  return profile ? NextResponse.json(profile) : NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
}