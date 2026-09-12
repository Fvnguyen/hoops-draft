/**
 * Game Logs API — Writes and reads full draft/season JSON logs to disk
 * 
 * POST /api/game-logs  — Save full game data to disk
 *   Body: { sessions: DraftSession[], seasons: Season[], rosters: any[] }
 *   Writes individual files per session and season
 * 
 * GET /api/game-logs    — List all saved log files
 * GET /api/game-logs?file=<name> — Read a specific log file
 */

import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.resolve(process.cwd(), '..', 'data', 'game_logs');

function ensureDir() {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

export async function POST(req: NextRequest) {
  try {
    ensureDir();
    const body = await req.json();
    const { sessions = [], seasons = [], rosters = [] } = body;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const written: string[] = [];

    // Write each draft session as its own file
    for (const session of sessions) {
      const filename = `draft_${session.id || timestamp}.json`;
      const filepath = path.join(LOGS_DIR, filename);
      fs.writeFileSync(filepath, JSON.stringify(session, null, 2), 'utf-8');
      written.push(filename);
    }

    // Write each season as its own file (includes full GameTheater per game)
    for (const season of seasons) {
      const filename = `season_${season.id || timestamp}.json`;
      const filepath = path.join(LOGS_DIR, filename);
      fs.writeFileSync(filepath, JSON.stringify(season, null, 2), 'utf-8');
      written.push(filename);
    }

    // Write rosters
    if (rosters.length > 0) {
      const filename = `rosters_${timestamp}.json`;
      const filepath = path.join(LOGS_DIR, filename);
      fs.writeFileSync(filepath, JSON.stringify(rosters, null, 2), 'utf-8');
      written.push(filename);
    }

    // Also write a combined dump for convenience
    const combinedFilename = `full_dump_${timestamp}.json`;
    const combinedPath = path.join(LOGS_DIR, combinedFilename);
    fs.writeFileSync(combinedPath, JSON.stringify(body, null, 2), 'utf-8');
    written.push(combinedFilename);

    return NextResponse.json({ 
      success: true, 
      filesWritten: written,
      directory: LOGS_DIR 
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    ensureDir();
    const fileParam = req.nextUrl.searchParams.get('file');

    if (fileParam) {
      // Return a specific log file
      const filepath = path.join(LOGS_DIR, path.basename(fileParam));
      if (!fs.existsSync(filepath)) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      const content = JSON.parse(fs.readFileSync(filepath, 'utf-8'));
      return NextResponse.json(content);
    }

    // List all log files
    const files = fs.readdirSync(LOGS_DIR)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        const stat = fs.statSync(path.join(LOGS_DIR, f));
        return {
          name: f,
          size: stat.size,
          sizeKB: (stat.size / 1024).toFixed(1) + ' KB',
          modified: stat.mtime.toISOString(),
        };
      })
      .sort((a, b) => b.modified.localeCompare(a.modified));

    return NextResponse.json({ directory: LOGS_DIR, files });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
