/** Pure game rules without DOM, fetch, or timers; test with node --test. */
export const SIZE = 20;
export const INITIAL_LENGTH = 3;
export const SPEEDS = { classic: 140, sprint: 90 };
export const DIRECTIONS = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 },
  left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

const same = (a, b) => a.x === b.x && a.y === b.y;

export function spawnFood(snake, random = Math.random) {
  // Choose from free cells to avoid unbounded random retries on a nearly full board.
  const free = [];
  const occupied = new Set(snake.map(({ x, y }) => `${x},${y}`));
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!occupied.has(`${x},${y}`)) free.push({ x, y });
    }
  }
  return free.length ? free[Math.floor(random() * free.length)] : null;
}

export function createGame(random = Math.random) {
  const snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }];
  return { snake, food: spawnFood(snake, random), direction: 'right', foodEaten: 0, outcome: null };
}

export function canTurn(current, requested) {
  if (!DIRECTIONS[current] || !DIRECTIONS[requested]) return false;
  const a = DIRECTIONS[current];
  const b = DIRECTIONS[requested];
  return a.x + b.x !== 0 || a.y + b.y !== 0;
}

export function step(state, requested = state.direction, random = Math.random) {
  if (state.outcome) return state;
  const direction = canTurn(state.direction, requested) ? requested : state.direction;
  const delta = DIRECTIONS[direction];
  const head = { x: state.snake[0].x + delta.x, y: state.snake[0].y + delta.y };
  const eating = state.food !== null && same(head, state.food);
  // The tail moves away on a normal tick, so entering its previous cell is valid.
  const body = eating ? state.snake : state.snake.slice(0, -1);
  const outside = head.x < 0 || head.y < 0 || head.x >= SIZE || head.y >= SIZE;
  if (outside || body.some(cell => same(cell, head))) {
    return { ...state, direction, outcome: 'collision' };
  }
  const snake = [head, ...state.snake];
  if (!eating) snake.pop();
  const food = eating ? spawnFood(snake, random) : state.food;
  return {
    snake, food, direction,
    foodEaten: state.foodEaten + Number(eating),
    outcome: food === null ? 'won' : null,
  };
}
