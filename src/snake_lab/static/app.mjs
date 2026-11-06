import { SIZE, SPEEDS, createGame, canTurn, step } from './engine.mjs';
import { boardSnapshot, checkPlan, drawPlan, renderTrace, requestPlan, updateDashboard } from './ai-play.mjs';

const $ = id => document.getElementById(id);
const canvas = $('board');
const ctx = canvas.getContext('2d');
const nameInput = $('player-name');
const modeInput = $('mode');
let game = createGame();
let phase = 'ready'; // ready | thinking | running | paused | ended
let nextDirection = null;
let elapsed = 0;
let segmentStarted = 0;
let timerId = null;
let run = null;
let pending = null;
let saving = false;
let refreshVersion = 0;
let aiMode = false;
let aiRun = null;
const nicknamePattern = /^[a-z0-9_-]{2,20}$/;

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function activeTime() {
  return elapsed + (phase === 'running' ? performance.now() - segmentStarted : 0);
}

function message(text) { $('message').textContent = text; }

function isActive() {
  return phase === 'running' || phase === 'paused' || phase === 'thinking';
}

function render() {
  const unit = canvas.width / SIZE;
  ctx.fillStyle = '#b8c397';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#a6b18b';
  ctx.lineWidth = 1;
  for (let index = 0; index <= SIZE; index++) {
    ctx.beginPath(); ctx.moveTo(index * unit, 0); ctx.lineTo(index * unit, canvas.height); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, index * unit); ctx.lineTo(canvas.width, index * unit); ctx.stroke();
  }
  drawPlan(ctx, unit, aiRun?.plan?.path, aiRun?.cursor);
  game.snake.forEach((cell, index) => {
    ctx.fillStyle = index === 0 ? '#253322' : '#455538';
    ctx.fillRect(cell.x * unit + 2, cell.y * unit + 2, unit - 4, unit - 4);
    if (index === 0) {
      ctx.fillStyle = '#dbe3bd';
      ctx.fillRect(cell.x * unit + 19, cell.y * unit + 8, 4, 4);
    }
  });
  if (game.food) {
    ctx.fillStyle = '#8d3029';
    ctx.fillRect((game.food.x + .22) * unit, (game.food.y + .22) * unit, unit * .56, unit * .56);
  }
  $('score').textContent = String(game.foodEaten * 10).padStart(3, '0');
  $('timer').textContent = formatTime(activeTime());
  if (aiMode) updateDashboard($, aiRun, phase, Number($('ai-budget').value) || 10);
}

function syncControls() {
  const active = isActive();
  const locked = active || saving || Boolean(pending);
  nameInput.disabled = aiMode || locked;
  modeInput.disabled = locked;
  $('start').disabled = locked;
  $('human-mode').disabled = locked;
  $('ai-mode').disabled = locked;
  for (const id of ['ai-provider', 'ai-key', 'ai-budget', 'clear-key']) $(id).disabled = active;
  $('pause').disabled = !active;
  $('pause').textContent = phase === 'paused' ? 'Resume' : 'Pause';
  $('stop-ai').hidden = !aiMode || !active;
  $('save-actions').hidden = !pending || saving;
  $('game-state').textContent = { ready:'READY TO PLAY', thinking:'AI PLANNING', running:'RUN IN PROGRESS', paused:'PAUSED', ended:'RUN COMPLETE' }[phase];
}

function overlay(title, copy) {
  $('overlay').hidden = false;
  $('overlay-title').textContent = title;
  $('overlay-copy').textContent = copy;
}

function requestDirection(direction) {
  // Allow one turn per tick: block right -> up -> left before the snake moves.
  if (!aiMode && phase === 'running' && nextDirection === null && direction !== game.direction && canTurn(game.direction, direction)) nextDirection = direction;
}

function tick() {
  if (aiRun) {
    tickAi();
    return;
  }
  game = step(game, nextDirection ?? game.direction);
  nextDirection = null;
  render();
  if (game.outcome) finish();
}

function start() {
  if ($('start').disabled) return;
  if (aiMode) {
    startAi();
    return;
  }
  const playerName = nameInput.value.trim().toLowerCase();
  if (!nicknamePattern.test(playerName)) {
    message('Use 2–20 letters, numbers, _ or - for your handle.');
    nameInput.focus();
    return;
  }
  nameInput.value = playerName;
  run = { run_id:crypto.randomUUID(), player_name:playerName, mode:modeInput.value };
  resetBoard();
  beginMovement();
  canvas.focus({ preventScroll:true });
  message('Find your rhythm. Arrow keys / WASD to move; Space to pause.');
}

function resetBoard() {
  game = createGame();
  elapsed = 0;
  nextDirection = null;
}

function beginMovement() {
  phase = 'running';
  segmentStarted = performance.now();
  $('overlay').hidden = true;
  timerId = setInterval(tick, SPEEDS[run?.mode ?? modeInput.value]);
  syncControls();
  render();
}

function setAiMode(enabled) {
  if (aiMode === enabled || isActive() || saving || pending) return;
  aiMode = enabled;
  aiRun = null;
  run = null;
  phase = 'ready';
  resetBoard();
  $('human-mode').setAttribute('aria-pressed', String(!enabled));
  $('ai-mode').setAttribute('aria-pressed', String(enabled));
  $('handle-label').hidden = enabled;
  $('handle-help').hidden = enabled;
  $('ai-setup').hidden = !enabled;
  $('ai-dashboard').hidden = !enabled;
  $('human-leaderboard').hidden = enabled;
  $('human-analytics').hidden = enabled;
  $('human-controls').hidden = enabled;
  $('human-instructions').hidden = enabled;
  $('start-label').textContent = enabled ? 'Start AI' : 'Start a run';
  if (enabled) {
    overlay('Watch the planner.', 'Choose a provider and start an AI run.');
    message('The model plans a route. The board checks and plays each move.');
    renderTrace($('ai-trace'), []);
  } else {
    overlay('One more bite.', 'Pick a handle. Find your rhythm.');
    message('Ready when you are. Each snack is worth 10 points.');
  }
  syncControls();
  render();
}

function startAi() {
  const key = $('ai-key').value.trim();
  if (!/^[!-~]{1,512}$/.test(key)) {
    message('Enter an API key for the selected provider.');
    $('ai-key').focus();
    return;
  }
  const budget = Number($('ai-budget').value);
  if (!Number.isInteger(budget) || budget < 1 || budget > 30) {
    message('Choose a call limit from 1 to 30.');
    $('ai-budget').focus();
    return;
  }
  run = null;
  aiRun = { provider: $('ai-provider').value, budget, entries: [], plan: null, cursor: 0, controller: null };
  resetBoard();
  canvas.focus({ preventScroll: true });
  void askAi();
}

function showThinking() {
  phase = 'thinking';
  overlay('AI thinking…', 'Waiting for the next route.');
  syncControls();
  render();
}

async function askAi() {
  if (aiRun.entries.length >= aiRun.budget) {
    finishAi('Call limit reached.');
    return;
  }
  elapsed = activeTime();
  clearInterval(timerId);
  const currentRun = aiRun;
  const controller = new AbortController();
  const entry = { board: boardSnapshot(game, currentRun.provider), status: 'Requesting a route' };
  currentRun.entries.push(entry);
  currentRun.controller = controller;
  currentRun.plan = null;
  currentRun.cursor = 0;
  renderTrace($('ai-trace'), currentRun.entries);
  showThinking();
  message('Waiting for the model to return a direction sequence.');
  try {
    const result = await requestPlan(entry.board, $('ai-key').value.trim(), controller.signal);
    if (aiRun !== currentRun || currentRun.controller !== controller) return;
    Object.assign(entry, { model: result.model, plan: result.plan, usage: result.usage, latency: result.latency_ms });
    if (!result.plan) throw new Error(result.issue || 'No plan received.');
    currentRun.plan = checkPlan(game, result.plan);
    const { steps, reachesFood } = currentRun.plan;
    entry.status = `${steps.length} legal steps · ${reachesFood ? 'reaches food' : 'partial route'}`;
  } catch (error) {
    if (aiRun !== currentRun || currentRun.controller !== controller) return;
    const reason = error.name === 'TimeoutError' ? 'The request timed out.' : error.message;
    entry.status = reason;
    finishAi(reason);
    return;
  }
  currentRun.controller = null;
  renderTrace($('ai-trace'), currentRun.entries);
  message('Plan checked. Follow the highlighted route.');
  if (phase === 'paused') {
    render();
  } else {
    beginMovement();
  }
}

function tickAi() {
  const before = game.foodEaten;
  game = step(game, aiRun.plan.steps[aiRun.cursor++]);
  render();
  const entry = aiRun.entries.at(-1);
  if (game.outcome) {
    entry.status = game.outcome === 'won' ? 'Board filled' : 'Collision';
    finishAi(game.outcome === 'won' ? 'AI filled the board.' : 'The snake collided.');
  } else if (game.foodEaten > before || aiRun.cursor === aiRun.plan.steps.length) {
    entry.status = game.foodEaten > before ? 'Food reached' : 'Partial route completed';
    void askAi();
  }
}

function finishAi(reason) {
  elapsed = activeTime();
  clearInterval(timerId);
  if (aiRun.controller) {
    aiRun.controller.abort();
    aiRun.controller = null;
    const entry = aiRun.entries.at(-1);
    if (entry.status === 'Requesting a route') entry.status = reason;
  }
  phase = 'ended';
  overlay('AI run complete.', reason);
  const calls = aiRun.entries.length;
  message(`${reason} ${game.foodEaten * 10} points · ${calls} API ${calls === 1 ? 'call' : 'calls'}.`);
  renderTrace($('ai-trace'), aiRun.entries);
  syncControls();
  render();
}

function pause(force = false) {
  if (phase === 'running' || phase === 'thinking') {
    elapsed = activeTime();
    phase = 'paused';
    clearInterval(timerId);
    overlay('Take a breather.', 'Resume when you’re ready. The clock is paused, too.');
  } else if (phase === 'paused' && !force) {
    if (aiRun?.controller) showThinking();
    else beginMovement();
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
$('human-mode').addEventListener('click', () => setAiMode(false));
$('ai-mode').addEventListener('click', () => setAiMode(true));
$('stop-ai').addEventListener('click', () => finishAi('Stopped by the player.'));
$('ai-provider').addEventListener('change', () => {
  $('ai-key').value = '';
  message('Enter an API key for the selected provider.');
});
$('clear-key').addEventListener('click', () => {
  $('ai-key').value = '';
  $('ai-key').focus();
  message('API key cleared.');
});
$('ai-budget').addEventListener('input', render);
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
  if ((direction || event.code === 'Space') && isActive()) {
    event.preventDefault();
    if (event.code === 'Space') pause(); else requestDirection(direction);
  }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
window.addEventListener('blur', () => pause(true));
window.addEventListener('beforeunload', event => {
  if (pending || isActive()) { event.preventDefault(); event.returnValue = ''; }
});
render();
syncControls();
void refreshData();
