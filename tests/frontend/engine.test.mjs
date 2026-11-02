import test from 'node:test';
import assert from 'node:assert/strict';
import { SIZE, createGame, canTurn, spawnFood, step } from '../../src/snake_lab/static/engine.mjs';

test('new game has three cells and unoccupied food', () => {
  const game = createGame(() => 0);
  assert.equal(game.snake.length, 3);
  assert.deepEqual(game.food, { x:0, y:0 });
  assert.equal(game.foodEaten, 0);
});

test('normal tick moves one cell without mutating original state', () => {
  const game = createGame(() => 0);
  const next = step(game);
  assert.deepEqual(next.snake[0], { x:9, y:10 });
  assert.equal(next.snake.length, 3);
  assert.deepEqual(game.snake[0], { x:8, y:10 });
});

test('opposite direction is rejected; a perpendicular turn is accepted', () => {
  assert.equal(canTurn('right', 'left'), false);
  assert.equal(canTurn('right', 'up'), true);
  assert.equal(canTurn('right', 'bad'), false);
  assert.equal(step(createGame(), 'left').direction, 'right');
  assert.equal(step(createGame(), 'up').direction, 'up');
});

test('eating grows snake and adds food count', () => {
  const game = createGame(); game.food = { x:9, y:10 };
  const next = step(game, 'right', () => 0);
  assert.equal(next.snake.length, 4);
  assert.equal(next.foodEaten, 1);
  assert.deepEqual(next.food, { x:0, y:0 });
});

test('wall collision ends run and ended state does not move again', () => {
  const game = createGame(); game.snake[0] = { x:19, y:10 };
  const next = step(game);
  assert.equal(next.outcome, 'collision');
  assert.strictEqual(step(next), next);
});

test('body collision ends run', () => {
  const game = { ...createGame(), snake:[{x:2,y:2},{x:2,y:3},{x:3,y:3},{x:3,y:2},{x:4,y:2}] };
  assert.equal(step(game).outcome, 'collision');
});

test('entering old tail cell is allowed if tail is moving away', () => {
  const game = { ...createGame(), snake:[{x:2,y:2},{x:2,y:3},{x:3,y:3},{x:3,y:2}] };
  assert.equal(step(game).outcome, null);
});

test('food generation terminates with the only free cell or a full board', () => {
  const full = Array.from({length:SIZE * SIZE}, (_, i) => ({x:i % SIZE, y:Math.floor(i / SIZE)}));
  assert.equal(spawnFood(full), null);
  assert.deepEqual(spawnFood(full.slice(0, -1)), {x:19,y:19});
});

test('eating the final free cell wins the game', () => {
  const snake = [{x:18,y:19}];
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (!(y === 19 && (x === 18 || x === 19))) snake.push({x,y});
  }
  const next = step({snake,food:{x:19,y:19},direction:'right',foodEaten:396,outcome:null});
  assert.equal(next.snake.length, 400);
  assert.equal(next.foodEaten, 397);
  assert.equal(next.outcome, 'won');
});
