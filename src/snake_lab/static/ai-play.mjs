import { DIRECTIONS, SIZE, canTurn, step } from './engine.mjs';

const moves = { U: 'up', D: 'down', L: 'left', R: 'right' };
const names = { openai: 'OpenAI', gemini: 'Gemini', anthropic: 'Claude' };

/** Run the model's moves against the current board without changing the live game. */
export function checkPlan(game, plan) {
  if (typeof plan !== 'string' || !/^[UDLR][1-9]\d?(?:,[UDLR][1-9]\d?)*$/.test(plan)) {
    throw new Error('The plan must use directions and step counts, such as R4,U3.');
  }
  const segments = plan.split(',').map(part => [moves[part[0]], Number(part.slice(1))]);
  if (segments.reduce((sum, [, count]) => sum + count, 0) > 64) {
    throw new Error('The plan exceeds the 64-step limit.');
  }

  let state = game;
  const steps = [];
  const path = [game.snake[0]];
  for (const [direction, count] of segments) {
    for (let i = 0; i < count; i++) {
      const number = steps.length + 1;
      if (!canTurn(state.direction, direction)) {
        throw new Error(`Step ${number} reverses into the snake.`);
      }
      const next = step(state, direction, () => 0);
      if (next.outcome === 'collision') {
        const head = state.snake[0];
        const delta = DIRECTIONS[direction];
        const x = head.x + delta.x;
        const y = head.y + delta.y;
        const wall = x < 0 || y < 0 || x >= SIZE || y >= SIZE;
        throw new Error(`Step ${number} hits ${wall ? 'a wall' : 'the snake’s body'}.`);
      }
      steps.push(direction);
      path.push(next.snake[0]);
      if (next.foodEaten > game.foodEaten) return { steps, path, reachesFood: true };
      state = next;
    }
  }
  return { steps, path, reachesFood: false };
}

export function boardSnapshot(game, provider) {
  return {
    provider,
    snake: game.snake.map(({ x, y }) => [x, y]),
    direction: game.direction,
    food: [game.food.x, game.food.y],
  };
}

export async function requestPlan(board, key, signal) {
  const response = await fetch('/api/ai/plan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(board),
    cache: 'no-store',
    signal: AbortSignal.any([signal, AbortSignal.timeout(22000)]),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(typeof result.detail === 'string' ? result.detail : 'The plan request failed.');
  }
  return result;
}

export function drawPlan(ctx, unit, path, progress) {
  if (!path?.length) return;
  ctx.save();
  ctx.lineWidth = unit * .14;
  ctx.lineCap = 'round';
  for (let i = 1; i < path.length; i++) {
    ctx.strokeStyle = i <= progress ? '#813225df' : '#81322578';
    ctx.beginPath();
    ctx.moveTo((path[i - 1].x + .5) * unit, (path[i - 1].y + .5) * unit);
    ctx.lineTo((path[i].x + .5) * unit, (path[i].y + .5) * unit);
    ctx.stroke();
  }
  ctx.restore();
}

export function updateDashboard($, run, phase, defaultBudget) {
  const entry = run?.entries.at(-1);
  const status = { ready: 'Ready', thinking: 'Planning', running: 'Executing', paused: 'Paused', ended: 'Finished' };
  const used = run?.entries.length ?? 0;
  const reported = run?.entries.filter(item => item.usage?.total_tokens != null) ?? [];
  const sum = reported.reduce((total, item) => total + item.usage.total_tokens, 0);
  $('ai-status').textContent = run ? status[phase] : 'Ready';
  $('ai-calls').textContent = `${used} / ${run?.budget ?? defaultBudget}`;
  $('ai-tokens').textContent = reported.length ? sum.toLocaleString() : '—';
  $('ai-token-note').textContent = used ? `Usage reported for ${reported.length} of ${used} calls` : 'Provider-reported usage';
  $('ai-target').textContent = entry ? `(${entry.board.food.join(', ')})` : '—';
  $('ai-model').textContent = run ? (entry?.model ?? names[run.provider]) : '—';
  $('ai-plan').textContent = entry?.plan ?? '—';
  $('ai-validation').textContent = entry?.status ?? 'Waiting for a run';
  $('ai-progress').textContent = run?.plan ? `${run.cursor} / ${run.plan.steps.length} steps` : '—';
}

/** Render one entry per request. The input snapshot contains board data only. */
export function renderTrace(list, entries) {
  const open = [...list.children].map(item => item.open);
  list.replaceChildren();
  entries.forEach((entry, index) => {
    const details = document.createElement('details');
    details.open = Boolean(open[index]);
    const summary = document.createElement('summary');
    summary.textContent = `#${index + 1} · ${entry.status}`;
    const data = document.createElement('pre');
    const usage = entry.usage;
    data.textContent = [
      `Model: ${entry.model ?? names[entry.board.provider]}`,
      `Plan: ${entry.plan ?? '—'}`,
      `Latency: ${entry.latency == null ? '—' : `${entry.latency} ms`}`,
      `Tokens: ${usage?.input_tokens ?? '—'} in / ${usage?.output_tokens ?? '—'} out / ${usage?.total_tokens ?? '—'} total`,
      '',
      `Board sent: ${JSON.stringify(entry.board)}`,
    ].join('\n');
    details.append(summary, data);
    list.append(details);
  });
}
