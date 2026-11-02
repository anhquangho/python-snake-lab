import { SIZE, SPEEDS, createGame, canTurn, step } from './engine.mjs';

const $ = id => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
const nameInput = $('player-name');
const modeInput = $('mode');
let game = createGame();
let phase = 'ready'; // ready | running | paused | ended
let nextDirection = null;
let elapsed = 0;
let segmentStarted = 0;
let timerId = null;
let run = null;
let pending = null;
let saving = false;
let refreshVersion = 0;
const nicknamePattern = /^[a-z0-9_-]{2,20}$/;

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function activeTime() {
  return elapsed + (phase === 'running' ? performance.now() - segmentStarted : 0);
}

function message(text) { $('message').textContent = text; }

function render() {
  const unit = canvas.width / SIZE;
  ctx.fillStyle = '#1b3027';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#284033';
  ctx.lineWidth = 1;
  for (let index = 0; index <= SIZE; index++) {
    ctx.beginPath(); ctx.moveTo(index * unit, 0); ctx.lineTo(index * unit, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, index * unit); ctx.lineTo(canvas.width, index * unit); ctx.stroke();
  }
  game.snake.forEach((cell, index) => {
    ctx.fillStyle = index === 0 ? '#d3f897' : '#a8ce70';
    ctx.beginPath(); ctx.roundRect(cell.x * unit + 2, cell.y * unit + 2, unit - 4, unit - 4, 5); ctx.fill();
    if (index === 0) {
      ctx.fillStyle = '#20352c';
      ctx.fillRect(cell.x * unit + 19, cell.y * unit + 8, 4, 4);
    }
  });
  if (game.food) {
    ctx.fillStyle = '#ed784b';
    ctx.beginPath(); ctx.arc((game.food.x + .5) * unit, (game.food.y + .5) * unit, unit * .28, 0, Math.PI * 2); ctx.fill();
  }
  $('score').textContent = String(game.foodEaten * 10).padStart(3, '0');
  $('timer').textContent = formatTime(activeTime());
}

function syncControls() {
  const active = phase === 'running' || phase === 'paused';
  nameInput.disabled = active || saving || Boolean(pending);
  modeInput.disabled = active || saving || Boolean(pending);
  $('start').disabled = active || saving || Boolean(pending);
  $('pause').disabled = !active;
  $('pause').textContent = phase === 'paused' ? 'Resume' : 'Pause';
  $('save-actions').hidden = !pending || saving;
  $('game-state').textContent = { ready:'READY TO PLAY', running:'RUN IN PROGRESS', paused:'PAUSED', ended:'RUN COMPLETE' }[phase];
}

function overlay(title, copy) {
  $('overlay').hidden = false;
  $('overlay-title').textContent = title;
  $('overlay-copy').textContent = copy;
}

function requestDirection(direction) {
  // Allow one turn per tick: block right -> up -> left before the snake moves.
  if (phase === 'running' && nextDirection === null && direction !== game.direction && canTurn(game.direction, direction)) nextDirection = direction;
}

function tick() {
  game = step(game, nextDirection ?? game.direction);
  nextDirection = null;
  render();
  if (game.outcome) finish();
}

function start() {
  if ($('start').disabled) return;
  const playerName = nameInput.value.trim().toLowerCase();
  if (!nicknamePattern.test(playerName)) {
    message('Use 2–20 letters, numbers, _ or - for your handle.');
    nameInput.focus();
    return;
  }
  nameInput.value = playerName;
  run = { run_id:crypto.randomUUID(), player_name:playerName, mode:modeInput.value };
  game = createGame();
  elapsed = 0;
  nextDirection = null;
  phase = 'running';
  segmentStarted = performance.now();
  $('overlay').hidden = true;
  timerId = setInterval(tick, SPEEDS[run.mode]);
  syncControls();
  render();
  canvas.focus({ preventScroll:true });
  message('Find your rhythm. Arrow keys / WASD to move; Space to pause.');
}

function pause(force = false) {
  if (phase === 'running') {
    elapsed = activeTime();
    phase = 'paused';
    clearInterval(timerId);
    overlay('Take a breather.', 'Resume when you’re ready. The clock is paused, too.');
  } else if (phase === 'paused' && !force) {
    phase = 'running';
    segmentStarted = performance.now();
    $('overlay').hidden = true;
    timerId = setInterval(tick, SPEEDS[run.mode]);
    canvas.focus({ preventScroll:true });
  }
  syncControls();
  render();
}

function finish() {
  elapsed = activeTime();
  phase = 'ended';
  clearInterval(timerId);
  pending = { ...run, food_eaten:game.foodEaten, duration_ms:Math.round(elapsed), outcome:game.outcome };
  overlay(game.outcome === 'won' ? 'The whole board. Yours.' : 'There’s always another run.', `${game.foodEaten * 10} points · ${formatTime(elapsed)} active play`);
  render();
  void saveRun();
}

async function jsonRequest(url, options = {}) {
  const response = await fetch(url, { ...options, signal:AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function saveRun() {
  if (!pending || saving) return;
  saving = true;
  syncControls();
  message('Saving your run to SQLite…');
  try {
    await jsonRequest('/api/scores', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(pending) });
    pending = null;
    message('Run saved. One more?');
    await refreshData();
  } catch (error) {
    message(`Run not confirmed saved (${error.message}). Retry safely, or discard to play again. Keep this tab open.`);
  } finally {
    saving = false;
    syncControls();
  }
}

async function refreshData() {
  const version = ++refreshVersion;
  const name = nameInput.value.trim().toLowerCase();
  const mode = modeInput.value;
  $('leaderboard-mode').textContent = mode === 'classic' ? 'Classic' : 'Sprint';
  if (!nicknamePattern.test(name)) {
    $('data-message').textContent = 'Enter a valid handle to load analytics.';
    return;
  }
  $('data-message').textContent = 'Refreshing…';
  try {
    const [leaders, analytics, stats] = await Promise.all([
      jsonRequest(`/api/leaderboard?mode=${mode}`),
      jsonRequest(`/api/players/${encodeURIComponent(name)}/analytics?mode=${mode}`),
      jsonRequest('/api/stats'),
    ]);
    if (version !== refreshVersion) return; // Do not let an older response overwrite the current mode or nickname.
    $('leaderboard').replaceChildren();
    for (const entry of leaders) {
      const li = document.createElement('li');
      const player = document.createElement('span');
      const rank = document.createElement('span');
      rank.className = 'player-rank'; rank.textContent = String(entry.rank).padStart(2, '0');
      player.append(rank, document.createTextNode(entry.player_name));
      const score = document.createElement('span'); score.className = 'player-score'; score.textContent = entry.score;
      const time = document.createElement('small'); time.textContent = formatTime(entry.duration_ms); score.append(time);
      li.append(player, score); $('leaderboard').append(li);
    }
    if (!leaders.length) {
      const empty = document.createElement('li'); empty.className = 'empty'; empty.textContent = 'A clean slate. Set the first score.'; $('leaderboard').append(empty);
    }
    $('analytics-handle').textContent = `${name} / ${mode}`;
    $('games').textContent = analytics.games_played;
    $('best').textContent = analytics.best_score;
    $('average').textContent = analytics.average_score;
    $('food').textContent = analytics.total_food;
    $('time-played').textContent = `Active play: ${Math.round(analytics.total_duration_ms / 1000)}s · Wins: ${analytics.wins}`;
    $('history').replaceChildren();
    const recent = [...analytics.recent_runs].reverse();
    const max = Math.max(10, ...recent.map(item => item.score));
    recent.forEach((item, index) => {
      const bar = document.createElement('div'); bar.className = 'history-bar';
      bar.style.height = `${Math.max(6, item.score / max * 100)}%`;
      bar.title = `Run ${index + 1}: ${item.score} points, ${formatTime(item.duration_ms)}`;
      bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', bar.title);
      $('history').append(bar);
    });
    if (!recent.length) {
      const empty = document.createElement('span'); empty.className = 'empty'; empty.textContent = 'Your first run starts the story.'; $('history').append(empty);
    }
    $('total-runs').textContent = stats.games_played;
    $('total-players').textContent = stats.players;
    $('lab-best').textContent = stats.best_score;
    $('data-message').textContent = 'Up to date · stored in SQLite';
  } catch (error) {
    if (version !== refreshVersion) return;
    $('data-message').textContent = `Data unavailable (${error.message}). Showing the last loaded data. Use Refresh data to retry.`;
    if ($('leaderboard').textContent.includes('Loading')) $('leaderboard').textContent = 'Could not load runs. Use Refresh data to retry.';
  }
}

$('start').addEventListener('click', start);
$('pause').addEventListener('click', () => pause());
$('retry').addEventListener('click', () => void saveRun());
$('discard').addEventListener('click', () => { pending = null; syncControls(); message('Unsaved run discarded. Ready for a new run.'); });
$('refresh').addEventListener('click', () => void refreshData());
nameInput.addEventListener('change', () => void refreshData());
modeInput.addEventListener('change', () => void refreshData());
document.querySelectorAll('[data-direction]').forEach(button => button.addEventListener('click', () => requestDirection(button.dataset.direction)));
document.addEventListener('keydown', event => {
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName)) return;
  const mapping = { ArrowUp:'up', w:'up', ArrowDown:'down', s:'down', ArrowLeft:'left', a:'left', ArrowRight:'right', d:'right' };
  const direction = mapping[event.key] ?? mapping[event.key.toLowerCase()];
  if ((direction || event.code === 'Space') && (phase === 'running' || phase === 'paused')) {
    event.preventDefault();
    if (event.code === 'Space') pause(); else requestDirection(direction);
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
window.addEventListener('blur', () => pause(true));
window.addEventListener('beforeunload', event => {
  if (pending || phase === 'running' || phase === 'paused') { event.preventDefault(); event.returnValue = ''; }
});
render();
syncControls();
void refreshData();
