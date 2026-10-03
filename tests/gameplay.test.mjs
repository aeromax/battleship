import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { chooseTarget } from '../server/tactical-ai.mjs';

function game() {
  const timers = new Map();
  const element = { textContent: '', disabled: false, classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, querySelector() { return null; } };
  const context = vm.createContext({
    console, chooseTarget,
    io: () => ({ on() {}, emit() {} }),
    document: { hidden: true, getElementById: () => element },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    window: { addEventListener() {}, clearTimeout: id => timers.delete(id), setTimeout: fn => { const id = timers.size + 1; timers.set(id, fn); return id; } },
    setTimeout, clearTimeout,
  });
  const setup = fs.readFileSync(new URL('../server/game_setup.js', import.meta.url), 'utf8').replaceAll('export ', '');
  const units = fs.readFileSync(new URL('../server/vehicles.js', import.meta.url), 'utf8').replaceAll('export ', '');
  const source = fs.readFileSync(new URL('../server/app.js', import.meta.url), 'utf8').replace(/^import .*;\n/gm, '').replace('export function initializeApp', 'function initializeApp');
  vm.runInContext(setup + units + source + `
    elements = { buttons: { fire: null }, screens: {}, boards: { attack: { querySelector: () => null } }, hud: { turnBanner: {} } };
    renderPlacementBoard = renderUnitList = renderPlayerBoard = renderAttackBoard = renderStatusFeed = updateReadyButton = updateBeforeUnloadGuard = () => {};
    globalThis.game = { state, createEmptyBoard, canPlaceUnit, placeUnit, resolveAttackAgainstBoard, populateAiBoard, randomizePlacement, finalizePlayerAttack, aiTakeTurn, scheduleAiTurn, setupSoloSession, chooseTarget, attemptPlaceSelectedUnit, resetPlacementBoard };
  `, context);
  return { ...context.game, timers, context };
}

test('placement rejects overlaps and edges; attacks detect sinking and victory', () => {
  const g = game(), board = g.createEmptyBoard(), unit = { name: 'Recon', size: 2 };
  assert.equal(g.canPlaceUnit(board, unit, 'I9', 'horizontal'), false);
  assert.equal(g.canPlaceUnit(board, unit, 'A9', 'vertical'), false);
  g.placeUnit(board, unit, ['A1', 'B1']);
  assert.equal(g.canPlaceUnit(board, unit, 'B1', 'vertical'), false);
  assert.equal(g.resolveAttackAgainstBoard(board, 'A1').victory, false);
  assert.equal(g.resolveAttackAgainstBoard(board, 'A1').already, true);
  assert.equal(g.resolveAttackAgainstBoard(board, 'B1').victory, true);
});

test('random fleets always contain all six non-overlapping units', () => {
  const g = game();
  for (let i = 0; i < 200; i++) {
    g.populateAiBoard();
    assert.equal(g.state.aiBoard.units.length, 6);
    const coords = g.state.aiBoard.units.flatMap(unit => unit.coordinates);
    assert.equal(coords.length, 17);
    assert.equal(new Set(coords).size, 17);
    g.randomizePlacement();
    assert.equal(g.state.placedUnits.length, 6);
  }
});

test('AI follows hits, extends lines on Elite, and ignores sunk targets', () => {
  assert.equal(chooseTarget({ shots: ['A1'], hits: ['A1'], difficulty: 'medium' }, () => 0), 'B1');
  assert.equal(chooseTarget({ shots: ['A1', 'B1'], hits: ['A1', 'B1'], difficulty: 'hard' }, () => 0), 'C1');
  assert.equal(chooseTarget({ shots: ['A1'], hits: ['A1'], sunk: ['A1'], difficulty: 'hard' }, () => 0), 'C1');
});

test('every difficulty exhausts all 81 sectors without repeating or leaving the grid', () => {
  for (const difficulty of ['low', 'medium', 'hard']) {
    const shots = [];
    for (let i = 0; i < 81; i++) {
      const coord = chooseTarget({ shots, hits: shots.filter(c => c.endsWith('1')), difficulty });
      assert.match(coord, /^[A-I][1-9]$/);
      assert.ok(!shots.includes(coord));
      shots.push(coord);
    }
    assert.equal(chooseTarget({ shots, difficulty }), null);
  }
});

test('shot locks immediately; duplicate confirmation cannot cause extra attacks', async () => {
  const g = game();
  Object.assign(g.state, { mode: 'solo', view: 'game', gameStarted: true, playerTurn: true, dieComplete: true, attackSelection: 'A1', aiBoard: g.createEmptyBoard() });
  await Promise.all([g.finalizePlayerAttack(), g.finalizePlayerAttack()]);
  assert.equal(g.state.attackHistory.size, 1);
  assert.equal(g.state.attackResults.A1, 'miss');
  assert.equal(g.state.playerTurn, false);
  assert.equal(g.timers.size, 1);
});

test('AI callbacks cannot attack a stopped mission; scheduling replaces old timers', async () => {
  const g = game();
  Object.assign(g.state, { mode: 'solo', view: 'game', gameStarted: false, playerTurn: false });
  await g.aiTakeTurn();
  assert.equal(g.state.aiShots.size, 0);
  g.scheduleAiTurn(); g.scheduleAiTurn();
  assert.equal(g.timers.size, 1);
});


test('manual placement advances the selected unit, and reset restores a usable selection', () => {
  const g = game();
  assert.equal(g.attemptPlaceSelectedUnit('A1'), true);
  assert.equal(g.state.placedUnits.length, 1);
  assert.equal(g.state.selectedUnit.name, 'Recon Vehicle');
  g.resetPlacementBoard();
  assert.equal(g.state.placedUnits.length, 0);
  assert.equal(g.state.selectedUnit.name, 'Tank Convoy');
});

test('blocked or never-ending audio cannot stall combat', async () => {
  const g = game();
  let plays = 0;
  g.context.document.hidden = false;
  g.context.Audio = class {
    addEventListener() {}
    play() { plays++; return new Promise(() => {}); }
  };
  Object.assign(g.state, { mode: 'solo', view: 'game', gameStarted: true, playerTurn: true, dieComplete: true, attackSelection: 'A1', aiBoard: g.createEmptyBoard() });
  await g.finalizePlayerAttack();
  assert.equal(plays, 2);
  assert.equal(g.state.attackResults.A1, 'miss');
  assert.equal(g.timers.size, 1);
});
