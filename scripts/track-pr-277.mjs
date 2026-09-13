import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PR_NUMBER = 277;
const REPO = 'get-bb/marketplace';
const THREAD_ID = 'thr_wsjddffefb';
const STATE_DIR = join(homedir(), '.bb', 'cache');
const STATE_FILE = join(STATE_DIR, `pr-${PR_NUMBER}-state.json`);

mkdirSync(STATE_DIR, { recursive: true });

let prData;
try {
  const raw = execFileSync('gh', [
    'pr', 'view', String(PR_NUMBER),
    '--repo', REPO,
    '--json', 'number,title,state,url,comments,reviews,latestReviews,statusCheckRollup'
  ], { encoding: 'utf8', timeout: 30000 });
  prData = JSON.parse(raw);
} catch (err) {
  console.error(`Failed to fetch PR #${PR_NUMBER}:`, err.message);
  process.exit(1);
}

let prevState = null;
if (existsSync(STATE_FILE)) {
  try {
    prevState = JSON.parse(readFileSync(STATE_FILE, 'utf8'));
  } catch {}
}

const currentCommentsCount = prData.comments?.length || 0;
const currentReviewsCount = prData.reviews?.length || 0;
const currentState = prData.state;
const currentChecks = prData.statusCheckRollup || [];
const checksFailed = currentChecks.filter(c => c.conclusion === 'FAILURE' || (c.status === 'COMPLETED' && c.conclusion !== 'SUCCESS'));
const checksPassed = currentChecks.filter(c => c.conclusion === 'SUCCESS');

const changes = [];

if (prevState) {
  if (prevState.state !== currentState) {
    changes.push(`Статус PR изменился: **${prevState.state}** ➔ **${currentState}**`);
  }
  if (currentCommentsCount > (prevState.commentsCount || 0)) {
    const newComments = prData.comments.slice(prevState.commentsCount || 0);
    for (const c of newComments) {
      changes.push(`Новый комментарий от @${c.author?.login}: "${(c.body || '').slice(0, 200)}..."`);
    }
  }
  if (currentReviewsCount > (prevState.reviewsCount || 0)) {
    const newReviews = prData.reviews.slice(prevState.reviewsCount || 0);
    for (const r of newReviews) {
      changes.push(`Новый отзыв/ревью от @${r.author?.login} (${r.state}): "${(r.body || '').slice(0, 200)}..."`);
    }
  }
  if (checksFailed.length > 0 && !(prevState.checksFailedCount > 0)) {
    changes.push(`CI проверки завершились с ошибкой: ${checksFailed.map(c => c.name).join(', ')}`);
  }
}

// Update stored state
writeFileSync(STATE_FILE, JSON.stringify({
  state: currentState,
  commentsCount: currentCommentsCount,
  reviewsCount: currentReviewsCount,
  checksFailedCount: checksFailed.length,
  checksPassedCount: checksPassed.length,
  updatedAt: new Date().toISOString()
}, null, 2));

if (changes.length > 0) {
  const report = [
    `🔔 **Обновление по Pull Request [get-bb/marketplace#${PR_NUMBER}](${prData.url})**:`,
    ...changes.map(c => `• ${c}`)
  ].join('\n');

  console.log(report);

  // Send message to thread if BB_CLI is available
  const bbCli = process.env.BB_CLI || 'bb';
  try {
    execFileSync(bbCli, ['thread', 'tell', THREAD_ID, report], { encoding: 'utf8', timeout: 15000 });
  } catch (err) {
    // Non-fatal
  }
} else {
  // Silent tick
}
