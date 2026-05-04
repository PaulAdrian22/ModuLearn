#!/usr/bin/env node
/**
 * Push the cleaned-up lesson snapshots in lessons/lesson*_after_import_snapshot.json
 * back to the running backend via PUT /api/admin/modules/:ModuleID.
 *
 * Each snapshot file has two entries (English + Taglish); both are pushed.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@... ADMIN_PASSWORD=... API_BASE=http://localhost:5000/api \
 *     node scripts/push_lesson_snapshots.js [--dry-run] [--lessons=1,2,3]
 *
 * Defaults: API_BASE=http://localhost:5000/api, lessons=1..7.
 */

const fs = require('fs');
const path = require('path');

const API_BASE = (process.env.API_BASE || 'http://localhost:5000/api').replace(/\/$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const dryRun = process.argv.includes('--dry-run');
const lessonsArg = (process.argv.find((a) => a.startsWith('--lessons=')) || '').split('=')[1];
const lessonNumbers = lessonsArg
  ? lessonsArg.split(',').map((n) => Number(n.trim())).filter((n) => Number.isFinite(n))
  : [1, 2, 3, 4, 5, 6, 7];

const lessonsDir = path.join(process.cwd(), 'lessons');

const log = (...parts) => console.log('[push-snapshots]', ...parts);
const fail = (msg) => {
  console.error('[push-snapshots] ERROR:', msg);
  process.exit(1);
};

async function login() {
  if (dryRun) return null;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    fail('ADMIN_EMAIL and ADMIN_PASSWORD env vars are required (or use --dry-run).');
  }
  const url = `${API_BASE}/auth/login`;
  log('Logging in as', ADMIN_EMAIL, 'at', url);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    fail(`Login failed (${res.status}): ${body?.message || JSON.stringify(body)}`);
  }
  const token = body?.token || body?.data?.token;
  if (!token) fail('Login response did not contain a token.');
  if (body?.user?.role !== 'admin' && body?.data?.user?.role !== 'admin') {
    log('WARNING: logged-in user is not an admin; PUTs will be rejected.');
  }
  return token;
}

function buildPayload(entry) {
  return {
    ModuleTitle: entry.ModuleTitle || '',
    Description: entry.Description || '',
    LessonOrder: Number(entry.LessonOrder) || 0,
    LessonLanguage: entry.LessonLanguage || 'English',
    Difficulty: entry.Difficulty || 'Easy',
    Tesda_Reference: entry.Tesda_Reference || '',
    LessonTime:
      entry.LessonTime && typeof entry.LessonTime === 'object'
        ? {
            hours: Number(entry.LessonTime.hours) || 0,
            minutes: Number(entry.LessonTime.minutes) || 0,
          }
        : { hours: 0, minutes: 30 },
    sections: Array.isArray(entry.sections) ? entry.sections : [],
    diagnosticQuestions: Array.isArray(entry.diagnosticQuestions) ? entry.diagnosticQuestions : [],
    reviewQuestions: Array.isArray(entry.reviewQuestions) ? entry.reviewQuestions : [],
    finalQuestions: Array.isArray(entry.finalQuestions) ? entry.finalQuestions : [],
    finalInstruction: entry.finalInstruction || '',
    roadmapStages: Array.isArray(entry.roadmapStages) ? entry.roadmapStages : [],
  };
}

async function pushEntry(token, entry, lessonNum) {
  const moduleId = Number(entry.ModuleID);
  if (!Number.isFinite(moduleId) || moduleId <= 0) {
    log(`SKIP L${lessonNum} ${entry.LessonLanguage}: invalid ModuleID ${entry.ModuleID}`);
    return { ok: false, skipped: true };
  }
  const url = `${API_BASE}/admin/modules/${moduleId}`;
  const payload = buildPayload(entry);
  if (dryRun) {
    log(
      `DRY-RUN PUT ${url} title=${payload.ModuleTitle.slice(0, 50)} sections=${payload.sections.length} ` +
        `dx=${payload.diagnosticQuestions.length} review=${payload.reviewQuestions.length} final=${payload.finalQuestions.length}`,
    );
    return { ok: true, dryRun: true };
  }
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    log(`FAIL L${lessonNum} ${entry.LessonLanguage} (Module ${moduleId}): ${res.status} ${body?.message || ''}`);
    return { ok: false, status: res.status, body };
  }
  log(`OK   L${lessonNum} ${entry.LessonLanguage} (Module ${moduleId}): updated, sections=${payload.sections.length}`);
  return { ok: true, body };
}

async function main() {
  log('Mode:', dryRun ? 'dry-run' : 'live');
  log('Lessons:', lessonNumbers.join(', '));
  const token = await login();

  const summary = { ok: 0, fail: 0, skipped: 0 };
  for (const lessonNum of lessonNumbers) {
    const filePath = path.join(lessonsDir, `lesson${lessonNum}_after_import_snapshot.json`);
    if (!fs.existsSync(filePath)) {
      log(`SKIP L${lessonNum}: ${filePath} not found`);
      summary.skipped += 2;
      continue;
    }
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(data)) {
      log(`SKIP L${lessonNum}: snapshot is not an array`);
      summary.skipped += 1;
      continue;
    }
    for (const entry of data) {
      const res = await pushEntry(token, entry, lessonNum);
      if (res.skipped) summary.skipped += 1;
      else if (res.ok) summary.ok += 1;
      else summary.fail += 1;
    }
  }

  log('Done.', summary);
  if (summary.fail > 0 && !dryRun) process.exit(2);
}

main().catch((err) => {
  console.error('[push-snapshots] Unhandled error:', err);
  process.exit(1);
});
