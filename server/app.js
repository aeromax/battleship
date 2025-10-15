import { ROWS, COLUMNS, MODES, GAME_MODES, DIFFICULTIES, SOUNDS } from './game_setup.js';
import { MAX_UNITS, AVAILABLE_UNITS, UNIT_IMAGES } from './vehicles.js';

const socket = io();

const state = {
  view: MODES.HOME,
  playerName: '',
  socketId: null,
  opponentName: null,
  mode: null,
  difficulty: DIFFICULTIES.LOW,
  gameId: null,
  placementBoard: createEmptyBoard(),
  playerBoard: null,
  attackSelection: null,
  placedUnits: [],
  selectedUnit: AVAILABLE_UNITS[0],
  orientation: 'horizontal',
  setupLocked: false,
  gameStarted: false,
  currentTurnSocket: null,
  playerTurn: false,
  playerRoll: null,
  opponentRoll: null,
  dieComplete: false,
  attackHistory: new Set(),
  attackResults: {},
  opponentAttackHistory: new Set(),
  aiBoard: null,
  aiUnits: [],
  aiShots: new Set(),
  statusMessages: [],
  continuePayload: null,
  awaitingSave: false,
};

const elements = {
  screens: {
    home: document.getElementById('homeScreen'),
    setup: document.getElementById('setupScreen'),
    game: document.getElementById('gameScreen'),
  },
  modals: {
    mode: document.getElementById('modeModal'),
    postGame: document.getElementById('postGameModal'),
  },
  inputs: {
    playerName: document.getElementById('playerName'),
  },
  buttons: {
    newGame: document.getElementById('newGameBtn'),
    continue: document.getElementById('continueBtn'),
    closeModal: document.getElementById('closeModalBtn'),
    startSolo: document.getElementById('startSoloBtn'),
    randomize: document.getElementById('randomizeBtn'),
    clearBoard: document.getElementById('clearBoardBtn'),
    ready: document.getElementById('readyBtn'),
    backHome: document.getElementById('backToHomeBtn'),
    rollDice: document.getElementById('rollDiceBtn'),
    fire: document.getElementById('fireBtn'),
    save: document.getElementById('saveBtn'),
    playAgain: document.getElementById('playAgainBtn'),
    returnHome: document.getElementById('returnHomeBtn'),
    refreshPlayers: document.getElementById('refreshPlayersBtn'),
  },
  lists: {
    unit: document.getElementById('unitList'),
    players: document.getElementById('playerList'),
  },
  toggles: {
    orientation: document.querySelectorAll('[data-orientation]'),
    difficulty: document.querySelectorAll('#soloOptions .chip'),
  },
  boards: {
    placement: document.getElementById('placementBoard'),
    player: document.getElementById('playerBoard'),
    attack: document.getElementById('attackBoard'),
  },
  hud: {
    statusFeed: document.getElementById('statusFeed'),
    diceDisplay: document.getElementById('diceDisplay'),
    turnBanner: document.getElementById('turnBanner'),
    homeStatus: document.getElementById('homeStatus'),
    postGameTitle: document.getElementById('postGameTitle'),
    postGameMessage: document.getElementById('postGameMessage'),
  },
  panels: {
    soloOptions: document.getElementById('soloOptions'),
    pvpOptions: document.getElementById('pvpOptions'),
  },
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext || null)();

function playTone(frequency, duration = 180) {
  if (!audioCtx) return;
  const oscillator = audioCtx.createOscillator();
  const gainNode = audioCtx.createGain();
  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
  gainNode.gain.setValueAtTime(0.0001, audioCtx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.3, audioCtx.currentTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration / 1000);
  oscillator.connect(gainNode);
  gainNode.connect(audioCtx.destination);
  oscillator.start();
  oscillator.stop(audioCtx.currentTime + duration / 1000);
}

function createEmptyBoard() {
  const cells = {};
  ROWS.forEach((row) => {
    COLUMNS.forEach((col) => {
      const coord = `${row}${col}`;
      cells[coord] = { occupant: null, hit: false };
    });
  });
  return { cells, units: [] };
}

function cloneBoard(board) {
  return {
    cells: Object.fromEntries(
      Object.entries(board.cells).map(([coord, cell]) => [
        coord,
        { occupant: cell.occupant, hit: cell.hit || false },
      ]),
    ),
    units: board.units.map((unit) => ({
      name: unit.name,
      size: unit.size,
      coordinates: [...unit.coordinates],
    })),
  };
}

function coordinateToIndices(coordinate) {
  const match = /^([A-I])([1-9])$/.exec(coordinate);
  if (!match) return null;
  const [, row, column] = match;
  return { rowIndex: ROWS.indexOf(row), columnIndex: COLUMNS.indexOf(column) };
}

function indicesToCoordinate(rowIndex, columnIndex) {
  if (rowIndex < 0 || rowIndex >= ROWS.length || columnIndex < 0 || columnIndex >= COLUMNS.length) {
    return null;
  }
  return `${ROWS[rowIndex]}${COLUMNS[columnIndex]}`;
}

function canPlaceUnit(board, unit, startCoordinate, orientation) {
  const indices = coordinateToIndices(startCoordinate);
  if (!indices) return false;
  const coordinates = [];
  for (let offset = 0; offset < unit.size; offset += 1) {
    const rowIndex = orientation === 'vertical' ? indices.rowIndex + offset : indices.rowIndex;
    const columnIndex =
      orientation === 'horizontal' ? indices.columnIndex + offset : indices.columnIndex;
    const coord = indicesToCoordinate(rowIndex, columnIndex);
    if (!coord) return false;
    if (board.cells[coord].occupant) return false;
    coordinates.push(coord);
  }
  return coordinates;
}

function placeUnit(board, unit, coordinates) {
  board.units.push({
    name: unit.name,
    size: unit.size,
    coordinates,
  });
  coordinates.forEach((coord) => {
    board.cells[coord].occupant = unit.name;
  });
}

function removeUnit(board, unitName) {
  const unitIndex = board.units.findIndex((unit) => unit.name === unitName);
  if (unitIndex === -1) return;
  const [unit] = board.units.splice(unitIndex, 1);
  unit.coordinates.forEach((coord) => {
    board.cells[coord].occupant = null;
    board.cells[coord].hit = false;
  });
}

function removeUnitAtCoordinate(board, coordinate) {
  const unit = board.units.find((item) => item.coordinates.includes(coordinate));
  if (!unit) return;
  removeUnit(board, unit.name);
}

function resetPlacementBoard() {
  state.placementBoard = createEmptyBoard();
  state.placedUnits = [];
  renderPlacementBoard();
  updateReadyButton();
}

function randomizePlacement() {
  resetPlacementBoard();
  const shuffledUnits = [...AVAILABLE_UNITS].sort(() => Math.random() - 0.5);
  let attempts = 0;
  for (const unit of shuffledUnits) {
    if (state.placedUnits.length >= MAX_UNITS) break;
    let placed = false;
    const orientations = ['horizontal', 'vertical'];
    while (!placed && attempts < 200) {
      const orientation = orientations[Math.floor(Math.random() * orientations.length)];
      const rowIndex = Math.floor(Math.random() * ROWS.length);
      const colIndex = Math.floor(Math.random() * COLUMNS.length);
      const coord = indicesToCoordinate(rowIndex, colIndex);
      const coordinates = canPlaceUnit(state.placementBoard, unit, coord, orientation);
      if (coordinates) {
        placeUnit(state.placementBoard, unit, coordinates);
        state.placedUnits.push({ ...unit, coordinates });
        placed = true;
      }
      attempts += 1;
    }
  }
  renderPlacementBoard();
  updateReadyButton();
}

function getUnitAtCoordinate(board, coordinate) {
  return board.units.find((unit) => unit.coordinates.includes(coordinate));
}

function getUnitOrientation(unit) {
  if (!unit || unit.coordinates.length < 2) {
    return 'horizontal';
  }
  const [first, second] = unit.coordinates;
  const firstIndices = coordinateToIndices(first);
  const secondIndices = coordinateToIndices(second);
  if (!firstIndices || !secondIndices) {
    return 'horizontal';
  }
  return firstIndices.rowIndex === secondIndices.rowIndex ? 'horizontal' : 'vertical';
}

function getUnitAnchorCoordinate(unit, orientation) {
  if (!unit || unit.coordinates.length === 0) return null;
  return unit.coordinates.reduce((anchor, coord) => {
    if (!anchor) return coord;
    const anchorIndices = coordinateToIndices(anchor);
    const coordIndices = coordinateToIndices(coord);
    if (!anchorIndices || !coordIndices) return anchor;
    if (orientation === 'horizontal') {
      if (coordIndices.columnIndex < anchorIndices.columnIndex) {
        return coord;
      }
      if (coordIndices.columnIndex === anchorIndices.columnIndex && coordIndices.rowIndex < anchorIndices.rowIndex) {
        return coord;
      }
      return anchor;
    }
    if (coordIndices.rowIndex < anchorIndices.rowIndex) {
      return coord;
    }
    if (coordIndices.rowIndex === anchorIndices.rowIndex && coordIndices.columnIndex < anchorIndices.columnIndex) {
      return coord;
    }
    return anchor;
  }, unit.coordinates[0]);
}

function getUnitRenderMeta(board, coordinate) {
  const unit = getUnitAtCoordinate(board, coordinate);
  if (!unit) return null;
  const orientation = getUnitOrientation(unit);
  const anchor = getUnitAnchorCoordinate(unit, orientation);
  return { unit, orientation, anchor };
}

function appendUnitImage(cellEl, unit, orientation) {
  const imagePath = UNIT_IMAGES[unit.name];
  if (!imagePath) return;
  const wrapper = document.createElement('div');
  wrapper.className = 'unit-image-wrap';
  wrapper.classList.add(orientation === 'vertical' ? 'wrap-vertical' : 'wrap-horizontal');
  wrapper.style.setProperty('--unit-length', unit.size);
  const img = document.createElement('img');
  img.src = imagePath;
  img.alt = unit.name;
  img.draggable = false;
  img.className = 'unit-image';
  wrapper.appendChild(img);

  cellEl.classList.add(
    'unit-anchor',
    orientation === 'vertical' ? 'unit-vertical' : 'unit-horizontal',
  );
  cellEl.style.setProperty('--unit-length', unit.size);
  cellEl.appendChild(wrapper);
}

function renderPlacementBoard() {
  const { placement } = elements.boards;
  placement.innerHTML = '';
  ROWS.forEach((row) => {
    COLUMNS.forEach((col) => {
      const coord = `${row}${col}`;
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.coord = coord;
      const occupant = state.placementBoard.cells[coord].occupant;
      if (occupant) {
        cell.classList.add('occupied');
        const meta = getUnitRenderMeta(state.placementBoard, coord);
        if (meta) {
          cell.title = `${meta.unit.name} (${coord})`;
          if (meta.anchor === coord) {
            appendUnitImage(cell, meta.unit, meta.orientation);
            cell.setAttribute(
              'aria-label',
              `${meta.unit.name}, length ${meta.unit.size}, starting at ${coord}`,
            );
          } else {
            cell.setAttribute('aria-label', `${meta.unit.name} segment at ${coord}`);
          }
        } else {
          cell.setAttribute('aria-label', `Occupied sector ${coord}`);
        }
      } else {
        cell.textContent = coord;
        cell.setAttribute('aria-label', `Empty sector ${coord}`);
      }
      placement.appendChild(cell);
    });
  });
}

function renderPlayerBoard() {
  if (!state.playerBoard) {
    state.playerBoard = createEmptyBoard();
  }
  const { player } = elements.boards;
  player.innerHTML = '';
  ROWS.forEach((row) => {
    COLUMNS.forEach((col) => {
      const coord = `${row}${col}`;
      const cellEl = document.createElement('div');
      cellEl.className = 'cell';
      cellEl.dataset.coord = coord;
      const cell = state.playerBoard.cells[coord];
      if (cell.occupant) {
        cellEl.classList.add('occupied');
        const meta = getUnitRenderMeta(state.playerBoard, coord);
        if (meta) {
          cellEl.title = `${meta.unit.name} (${coord})`;
          const isAnchor = meta.anchor === coord;
          if (isAnchor) {
            const anyHit = meta.unit.coordinates.some(
              (unitCoord) => state.playerBoard.cells[unitCoord]?.hit,
            );
            const destroyed = meta.unit.coordinates.every(
              (unitCoord) => state.playerBoard.cells[unitCoord]?.hit,
            );
            if (anyHit) {
              cellEl.classList.add('unit-damaged');
            }
            if (destroyed) {
              cellEl.classList.add('unit-destroyed');
            }
            appendUnitImage(cellEl, meta.unit, meta.orientation);
            cellEl.setAttribute(
              'aria-label',
              `${meta.unit.name}, length ${meta.unit.size}, deployed at ${coord}`,
            );
          } else {
            cellEl.setAttribute('aria-label', `${meta.unit.name} segment at ${coord}`);
          }
        } else {
          cellEl.setAttribute('aria-label', `Occupied sector ${coord}`);
        }
      } else {
        cellEl.setAttribute('aria-label', `Empty sector ${coord}`);
      }
      if (cell.hit && cell.occupant) {
        cellEl.classList.add('hit');
        const unit = (state.playerBoard.units || []).find((unitItem) =>
          unitItem.coordinates.includes(coord),
        );
        if (
          unit &&
          unit.coordinates.every((unitCoord) => state.playerBoard.cells[unitCoord].hit === true)
        ) {
          cellEl.classList.add('destroyed');
        }
      } else if (cell.hit) {
        cellEl.classList.add('miss');
      }
      player.appendChild(cellEl);
    });
  });
}

function renderAttackBoard() {
  const { attack } = elements.boards;
  attack.innerHTML = '';
  ROWS.forEach((row) => {
    COLUMNS.forEach((col) => {
      const coord = `${row}${col}`;
      const cellEl = document.createElement('div');
      cellEl.className = 'cell';
      cellEl.dataset.coord = coord;
      cellEl.textContent = coord;
      const result = state.attackResults?.[coord];
      if (result === 'hit') {
        cellEl.classList.add('hit');
      } else if (result === 'miss') {
        cellEl.classList.add('miss');
      } else if (state.mode === GAME_MODES.SOLO && state.aiBoard?.cells?.[coord]?.hit) {
        cellEl.classList.add(
          state.aiBoard.cells[coord].occupant ? 'hit' : 'miss',
        );
      }
      attack.appendChild(cellEl);
    });
  });
}

function renderUnitList() {
  elements.lists.unit.innerHTML = '';
  AVAILABLE_UNITS.forEach((unit) => {
    const item = document.createElement('div');
    item.className = 'unit-item';
    item.dataset.unit = unit.name;
    item.innerHTML = `
      <span>${unit.name}</span>
      <span class="unit-size">${unit.size} tiles</span>
    `;
    if (state.selectedUnit?.name === unit.name) {
      item.classList.add('selected');
    }
    elements.lists.unit.appendChild(item);
  });
}

function switchScreen(next) {
  const target = elements.screens[next];
  if (!target) return;
  Object.values(elements.screens).forEach((screen) => {
    if (screen === target) {
      screen.classList.add('active');
      screen.classList.remove('hidden');
    } else {
      screen.classList.remove('active');
      screen.classList.add('hidden');
    }
  });
  state.view = next;
}

function toggleModal(modalKey, visible) {
  const modal = elements.modals[modalKey];
  if (!modal) return;
  modal.classList.toggle('hidden', !visible);
}

function updateReadyButton() {
  const ready = elements.buttons.ready;
  if (state.placedUnits.length === MAX_UNITS) {
    ready.classList.remove('disabled');
    ready.disabled = false;
  } else {
    ready.classList.add('disabled');
    ready.disabled = true;
  }
}

function pushStatus(message, context = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  state.statusMessages.unshift({ message, timestamp, context });
  if (state.statusMessages.length > 20) {
    state.statusMessages.length = 20;
  }
  renderStatusFeed();
}

function renderStatusFeed() {
  elements.hud.statusFeed.innerHTML = state.statusMessages
    .map(
      (item) =>
        `<div class="status-item status-${item.context}">
          <span>[${item.timestamp}]</span>
          <span> ${item.message}</span>
        </div>`,
    )
    .join('');
}

function setTurnBanner(message) {
  elements.hud.turnBanner.textContent = message;
}

function setDiceDisplay(value) {
  elements.hud.diceDisplay.textContent = value;
}

function requestPlayerRegistration() {
  if (!state.playerName) return;
  socket.emit('registerPlayer', { name: state.playerName });
}

function showPlayersList(players) {
  elements.lists.players.innerHTML = '';
  const others = players.filter((player) => player.socketId !== state.socketId);
  if (!others.length) {
    elements.lists.players.innerHTML =
      '<li class="empty">No operators online. Stand by for reinforcements.</li>';
    return;
  }
  others.forEach((player) => {
    const li = document.createElement('li');
    li.dataset.socketId = player.socketId;
    li.innerHTML = `
      <span>${player.name}</span>
      <span class="player-status ${player.status}">${player.status.replace('_', ' ')}</span>
    `;
    if (player.status === 'online') {
      li.addEventListener('click', () => {
        socket.emit('createMatch', { opponentId: player.socketId });
        pushStatus(`Connecting to ${player.name}...`, 'info');
      });
    } else {
      li.classList.add('disabled');
    }
    elements.lists.players.appendChild(li);
  });
}

function showPostGameModal(title, message) {
  elements.hud.postGameTitle.textContent = title;
  elements.hud.postGameMessage.textContent = message;
  toggleModal('postGame', true);
}

function setupSoloSession() {
  state.mode = GAME_MODES.SOLO;
  state.opponentName = 'CPU';
  resetPlacementBoard();
  state.aiBoard = createEmptyBoard();
  state.aiUnits = [];
  state.attackHistory = new Set();
  state.attackResults = {};
  state.opponentAttackHistory = new Set();
  state.aiShots = new Set();
  state.playerRoll = null;
  state.opponentRoll = null;
  state.dieComplete = false;
  state.playerTurn = false;
  state.gameStarted = false;
  state.statusMessages = [];
  renderStatusFeed();
  setDiceDisplay('-');
  setTurnBanner('Deploy your forces');
  elements.buttons.fire.classList.add('disabled');
  elements.buttons.fire.disabled = true;
  elements.buttons.rollDice.disabled = false;
  elements.buttons.rollDice.classList.remove('disabled');
  state.setupLocked = false;
  switchScreen(MODES.SETUP);
}

function populateAiBoard() {
  state.aiBoard = createEmptyBoard();
  state.aiUnits = [];
  const shuffledUnits = [...AVAILABLE_UNITS].sort(() => Math.random() - 0.5);
  let attempts = 0;
  while (state.aiUnits.length < MAX_UNITS && attempts < 400) {
    const unit = shuffledUnits[state.aiUnits.length % shuffledUnits.length];
    const orientation = Math.random() > 0.5 ? 'horizontal' : 'vertical';
    const rowIndex = Math.floor(Math.random() * ROWS.length);
    const colIndex = Math.floor(Math.random() * COLUMNS.length);
    const coord = indicesToCoordinate(rowIndex, colIndex);
    const coordinates = canPlaceUnit(state.aiBoard, unit, coord, orientation);
    if (coordinates) {
      placeUnit(state.aiBoard, unit, coordinates);
      state.aiUnits.push({ ...unit, coordinates });
    }
    attempts += 1;
  }
}

function enterGameScreen() {
  state.playerBoard = cloneBoard(state.placementBoard);
  renderPlayerBoard();
  renderAttackBoard();
  switchScreen(MODES.GAME);
}

function handleReadySolo() {
  if (state.placedUnits.length !== MAX_UNITS || state.setupLocked) return;
  populateAiBoard();
  state.setupLocked = true;
  pushStatus('Deployment locked. Awaiting command to begin.', 'info');
  enterGameScreen();
}

function handleReadyMultiplayer() {
  if (!state.gameId || state.setupLocked || state.placedUnits.length !== MAX_UNITS) return;
  state.setupLocked = true;
  state.playerBoard = cloneBoard(state.placementBoard);
  socket.emit('submitBoard', {
    gameId: state.gameId,
    board: state.playerBoard,
    pieces: state.placedUnits,
  });
  pushStatus('Deployment transmitted to command.', 'info');
}

function handleReady() {
  playTone(SOUNDS.CLICK);
  if (state.mode === GAME_MODES.SOLO) {
    handleReadySolo();
  } else if (state.mode === GAME_MODES.PVP) {
    handleReadyMultiplayer();
  }
}

function animateDiceRoll() {
  return new Promise((resolve) => {
    const iterations = 15;
    let count = 0;
    const interval = setInterval(() => {
      const value = Math.floor(Math.random() * 20) + 1;
      setDiceDisplay(value);
      playTone(400 + value * 10, 30);
      count += 1;
      if (count >= iterations) {
        clearInterval(interval);
        resolve();
      }
    }, 60);
  });
}

function startSoloDiceSequence() {
  const rollPlayer = Math.floor(Math.random() * 20) + 1;
  const rollAi = Math.floor(Math.random() * 20) + 1;
  state.playerRoll = rollPlayer;
  state.opponentRoll = rollAi;
  setDiceDisplay(rollPlayer);
  pushStatus(`You roll a ${rollPlayer}.`, 'info');
  pushStatus(`Opponent rolls a ${rollAi}.`, 'info');
  if (rollPlayer === rollAi) {
    pushStatus('Tie detected. Roll again!', 'warning');
    state.playerTurn = false;
    setTurnBanner('Tied roll. Roll again!');
    state.dieComplete = false;
    return;
  }
  state.dieComplete = true;
  state.gameStarted = true;
  state.playerTurn = rollPlayer > rollAi;
  const message = state.playerTurn ? 'You fire the first shot!' : 'Opponent gains initiative!';
  pushStatus(message, state.playerTurn ? 'success' : 'warning');
  setTurnBanner(state.playerTurn ? 'Your turn!' : `${state.opponentName || 'CPU'} turn`);
  elements.buttons.fire.disabled = !state.playerTurn;
  elements.buttons.fire.classList.toggle('disabled', !state.playerTurn);
  if (!state.playerTurn) {
    window.setTimeout(aiTakeTurn, 1100);
  }
}

function handleSoloDiceRoll() {
  animateDiceRoll().then(() => {
    startSoloDiceSequence();
  });
}

function handleMultiplayerDiceRoll() {
  if (!state.gameId) return;
  const rollValue = Math.floor(Math.random() * 20) + 1;
  animateDiceRoll().then(() => {
    socket.emit('dieRoll', { gameId: state.gameId, value: rollValue });
    setDiceDisplay(rollValue);
  });
}

function handleDiceRoll() {
  if (state.setupLocked === false) {
    pushStatus('Lock in your deployment first.', 'warning');
    return;
  }
  playTone(SOUNDS.CLICK);
  elements.buttons.rollDice.disabled = true;
  elements.buttons.rollDice.classList.add('disabled');
  if (state.mode === GAME_MODES.SOLO) {
    handleSoloDiceRoll();
  } else if (state.mode === GAME_MODES.PVP) {
    handleMultiplayerDiceRoll();
  }
}

function resolveAttackAgainstBoard(board, coordinate) {
  const cell = board.cells[coordinate];
  if (!cell) return { hit: false };
  if (cell.hit) return { already: true };
  cell.hit = true;
  if (cell.occupant) {
    const unit = board.units.find((item) => item.coordinates.includes(coordinate));
    const destroyed =
      unit &&
      unit.coordinates.every((unitCoord) => board.cells[unitCoord] && board.cells[unitCoord].hit);
    const victory = board.units.every((unitItem) =>
      unitItem.coordinates.every((unitCoord) => board.cells[unitCoord].hit),
    );
    return { hit: true, destroyed: destroyed ? unit.name : null, victory };
  }
  return { hit: false };
}

function handlePlayerAttack(coordinate) {
  if (!state.playerTurn || !state.dieComplete) {
    pushStatus('Hold fire until it is your turn.', 'warning');
    return;
  }
  if (state.attackHistory.has(coordinate)) {
    pushStatus('Coordinate already targeted.', 'warning');
    return;
  }
  state.attackHistory.add(coordinate);
  const cellEl = elements.boards.attack.querySelector(`[data-coord="${coordinate}"]`);
  if (cellEl) cellEl.classList.add('selected-target');
  elements.buttons.fire.disabled = false;
  elements.buttons.fire.classList.remove('disabled');
  state.attackSelection = coordinate;
  setTurnBanner(`Target locked: ${coordinate}`);
}

function finalizePlayerAttack() {
  if (!state.attackSelection) return;
  const coordinate = state.attackSelection;
  if (state.mode === GAME_MODES.SOLO) {
    const result = resolveAttackAgainstBoard(state.aiBoard, coordinate);
    state.attackResults[coordinate] = result.hit ? 'hit' : 'miss';
    const cellEl = elements.boards.attack.querySelector(`[data-coord="${coordinate}"]`);
    if (cellEl) {
      cellEl.classList.remove('selected-target');
      if (result.hit) {
        cellEl.classList.add('hit');
      } else {
        cellEl.classList.add('miss');
      }
    }
    state.attackSelection = null;
    if (result.hit) {
      playTone(SOUNDS.HIT, 300);
      pushStatus(`Direct hit at ${coordinate}!`, 'success');
      if (result.destroyed) {
        pushStatus(`Enemy ${result.destroyed} destroyed!`, 'success');
      }
      if (result.victory) {
        pushStatus('All hostiles neutralized!', 'success');
        setTurnBanner('Victory!');
        showPostGameModal('Mission Success', 'You have secured the battlefield.');
        return;
      }
    } else {
      playTone(SOUNDS.MISS, 200);
      pushStatus(`Attack unsuccessful at ${coordinate}.`, 'info');
    }
    elements.buttons.fire.disabled = true;
    elements.buttons.fire.classList.add('disabled');
    state.playerTurn = false;
    setTurnBanner('Opponent turn...');
    window.setTimeout(aiTakeTurn, 1000);
  } else if (state.mode === GAME_MODES.PVP) {
    if (!state.gameId) return;
    socket.emit('attack', { gameId: state.gameId, coordinate });
    state.attackResults[coordinate] = 'pending';
    state.attackSelection = null;
    const cellEl = elements.boards.attack.querySelector(`[data-coord="${coordinate}"]`);
    if (cellEl) cellEl.classList.remove('selected-target');
    setTurnBanner('Transmitting strike data...');
    elements.buttons.fire.disabled = true;
    elements.buttons.fire.classList.add('disabled');
  }
}

function aiChooseCoordinate() {
  const available = [];
  ROWS.forEach((row) => {
    COLUMNS.forEach((col) => {
      const coord = `${row}${col}`;
      if (!state.aiShots.has(coord)) available.push(coord);
    });
  });
  if (!available.length) return null;
  if (state.difficulty === DIFFICULTIES.LOW) {
    return available[Math.floor(Math.random() * available.length)];
  }
  if (state.difficulty === DIFFICULTIES.MEDIUM) {
    const targets = available.filter((coord) => {
      const indices = coordinateToIndices(coord);
      return (indices.rowIndex + indices.columnIndex) % 2 === 0;
    });
    if (targets.length) {
      return targets[Math.floor(Math.random() * targets.length)];
    }
    return available[Math.floor(Math.random() * available.length)];
  }
  const priority = available.filter((coord) => {
    const indices = coordinateToIndices(coord);
    return indices.rowIndex === 4 || indices.columnIndex === 4;
  });
  if (priority.length) {
    return priority[Math.floor(Math.random() * priority.length)];
  }
  return available[Math.floor(Math.random() * available.length)];
}

function aiTakeTurn() {
  if (state.mode !== GAME_MODES.SOLO || state.playerTurn) return;
  const coordinate = aiChooseCoordinate();
  if (!coordinate) return;
  state.aiShots.add(coordinate);
  const result = resolveAttackAgainstBoard(state.playerBoard, coordinate);
  state.opponentAttackHistory.add(coordinate);
  pushStatus(`Incoming strike at ${coordinate}!`, 'warning');
  renderPlayerBoard();
  if (result.hit) {
    playTone(SOUNDS.HIT, 280);
    pushStatus('Enemy artillery reports a hit!', 'danger');
    if (result.destroyed) {
      pushStatus(`Your ${result.destroyed} has been destroyed!`, 'danger');
    }
    if (result.victory) {
      setTurnBanner('Mission failed.');
      showPostGameModal('Mission Failed', 'Enemy forces overwhelmed your sector.');
      return;
    }
  } else {
    playTone(SOUNDS.MISS, 180);
    pushStatus('Enemy attack unsuccessful!', 'success');
  }
  state.playerTurn = true;
  setTurnBanner('Your turn!');
  elements.buttons.fire.disabled = true;
  elements.buttons.fire.classList.add('disabled');
}

function setupEventListeners() {
  elements.buttons.newGame.addEventListener('click', () => {
    state.playerName = elements.inputs.playerName.value.trim();
    if (!state.playerName) {
      elements.hud.homeStatus.textContent = 'Enter callsign to proceed.';
      playTone(SOUNDS.ALERT, 200);
      return;
    }
    elements.hud.homeStatus.textContent = '';
    requestPlayerRegistration();
    state.mode = null;
    toggleModal('mode', true);
  });

  elements.buttons.continue.addEventListener('click', () => {
    state.playerName = elements.inputs.playerName.value.trim();
    if (!state.playerName) {
      elements.hud.homeStatus.textContent = 'Enter callsign to continue.';
      playTone(SOUNDS.ALERT, 200);
      return;
    }
    fetch(`/api/saves/${encodeURIComponent(state.playerName)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data) {
          elements.hud.homeStatus.textContent = 'No saved operations found.';
          playTone(SOUNDS.ALERT, 200);
          return;
        }
        state.continuePayload = data;
        loadSavedGame(data);
      })
      .catch(() => {
        elements.hud.homeStatus.textContent = 'Unable to retrieve save data.';
      });
  });

  elements.buttons.closeModal.addEventListener('click', () => {
    toggleModal('mode', false);
  });

  document.querySelectorAll('.mode-card').forEach((card) => {
    card.addEventListener('click', () => {
      const mode = card.dataset.mode;
      if (mode === 'solo') {
        state.mode = GAME_MODES.SOLO;
        elements.panels.soloOptions.classList.remove('hidden');
        elements.panels.pvpOptions.classList.add('hidden');
      } else if (mode === 'pvp') {
        state.mode = GAME_MODES.PVP;
        elements.panels.pvpOptions.classList.remove('hidden');
        elements.panels.soloOptions.classList.add('hidden');
        socket.emit('requestPlayerList');
      }
    });
  });

  elements.toggles.orientation.forEach((button) => {
    button.addEventListener('click', () => {
      state.orientation = button.dataset.orientation;
      elements.toggles.orientation.forEach((btn) => btn.classList.remove('selected'));
      button.classList.add('selected');
    });
  });

  elements.toggles.difficulty.forEach((button) => {
    button.addEventListener('click', () => {
      elements.toggles.difficulty.forEach((btn) => btn.classList.remove('selected'));
      button.classList.add('selected');
      state.difficulty = button.dataset.difficulty;
    });
  });

  elements.buttons.startSolo.addEventListener('click', () => {
    toggleModal('mode', false);
    setupSoloSession();
  });

  elements.buttons.refreshPlayers.addEventListener('click', () => {
    socket.emit('requestPlayerList');
  });

  elements.buttons.randomize.addEventListener('click', () => {
    playTone(SOUNDS.CLICK);
    randomizePlacement();
  });

  elements.buttons.clearBoard.addEventListener('click', () => {
    playTone(SOUNDS.CLICK);
    resetPlacementBoard();
  });

  elements.buttons.ready.addEventListener('click', handleReady);

  elements.buttons.backHome.addEventListener('click', () => {
    playTone(SOUNDS.CLICK);
    toggleModal('mode', false);
    switchScreen(MODES.HOME);
  });

  elements.buttons.rollDice.addEventListener('click', handleDiceRoll);

  elements.buttons.fire.addEventListener('click', finalizePlayerAttack);

  elements.buttons.save.addEventListener('click', () => {
    if (!state.gameStarted) {
      pushStatus('Begin the mission before saving.', 'warning');
      return;
    }
    if (!state.playerName) return;
    state.awaitingSave = true;
    const payload =
      state.mode === GAME_MODES.SOLO
        ? {
          mode: 'solo',
          difficulty: state.difficulty,
          player: {
            board: state.playerBoard,
            turn: state.playerTurn,
            roll: state.playerRoll,
            attackHistory: [...state.attackHistory],
          },
          ai: {
            board: state.aiBoard,
            shots: [...state.aiShots],
            roll: state.opponentRoll,
          },
          status: state.statusMessages,
        }
        : {
          mode: 'pvp',
          gameId: state.gameId,
        };
    fetch(`/api/saves/${encodeURIComponent(state.playerName)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
      .then((res) => res.json())
      .then(() => {
        pushStatus('Mission state stored successfully.', 'success');
        state.awaitingSave = false;
      })
      .catch(() => {
        pushStatus('Failed to save mission.', 'danger');
        state.awaitingSave = false;
      });
  });

  elements.buttons.playAgain.addEventListener('click', () => {
    toggleModal('postGame', false);
    if (state.mode === GAME_MODES.SOLO) {
      setupSoloSession();
    } else {
      switchScreen(MODES.HOME);
    }
  });

  elements.buttons.returnHome.addEventListener('click', () => {
    toggleModal('postGame', false);
    switchScreen(MODES.HOME);
  });

  elements.boards.placement.addEventListener('click', (event) => {
    if (state.setupLocked) return;
    const cell = event.target.closest('.cell');
    if (!cell) return;
    const coordinate = cell.dataset.coord;
    if (!coordinate) return;
    const occupant = state.placementBoard.cells[coordinate].occupant;
    if (occupant) {
      removeUnitAtCoordinate(state.placementBoard, coordinate);
      state.placedUnits = state.placedUnits.filter((unit) => unit.name !== occupant);
      renderPlacementBoard();
      updateReadyButton();
      return;
    }
    if (state.placedUnits.length >= MAX_UNITS) {
      pushStatus('Unit cap reached. Remove a unit before placing another.', 'warning');
      return;
    }
    const unit = AVAILABLE_UNITS.find((item) => item.name === state.selectedUnit?.name);
    if (!unit) {
      pushStatus('Select a unit to deploy.', 'warning');
      return;
    }
    if (state.placedUnits.some((placed) => placed.name === unit.name)) {
      pushStatus('Each unit profile may be deployed once.', 'warning');
      playTone(SOUNDS.ALERT, 200);
      return;
    }
    const coordinates = canPlaceUnit(state.placementBoard, unit, coordinate, state.orientation);
    if (!coordinates) {
      pushStatus('Placement invalid. Check terrain boundaries.', 'danger');
      playTone(SOUNDS.ALERT, 250);
      return;
    }
    placeUnit(state.placementBoard, unit, coordinates);
    state.placedUnits.push({ ...unit, coordinates });
    renderPlacementBoard();
    updateReadyButton();
  });

  elements.lists.unit.addEventListener('click', (event) => {
    const item = event.target.closest('.unit-item');
    if (!item) return;
    const unitName = item.dataset.unit;
    state.selectedUnit = AVAILABLE_UNITS.find((unit) => unit.name === unitName);
    renderUnitList();
    playTone(SOUNDS.CLICK);
  });

  elements.boards.attack.addEventListener('click', (event) => {
    const cell = event.target.closest('.cell');
    if (!cell) return;
    const coordinate = cell.dataset.coord;
    if (!coordinate) return;
    handlePlayerAttack(coordinate);
  });
}

function initializeSocketEvents() {
  socket.on('playerRegistered', ({ socketId }) => {
    state.socketId = socketId;
  });

  socket.on('playerList', (players) => {
    if (state.mode !== GAME_MODES.PVP) return;
    showPlayersList(players);
  });

  socket.on('matchStarted', ({ gameId, opponentName }) => {
    toggleModal('mode', false);
    state.mode = GAME_MODES.PVP;
    resetPlacementBoard();
    state.gameId = gameId;
    state.opponentName = opponentName;
    state.attackHistory = new Set();
    state.attackResults = {};
    state.opponentAttackHistory = new Set();
    state.statusMessages = [];
    renderStatusFeed();
    setDiceDisplay('-');
    setTurnBanner('Deploy your forces');
    elements.buttons.fire.disabled = true;
    elements.buttons.fire.classList.add('disabled');
    elements.buttons.rollDice.disabled = false;
    elements.buttons.rollDice.classList.remove('disabled');
    state.setupLocked = false;
    switchScreen(MODES.SETUP);
    socket.emit('joinGameRoom', { gameId });
  });

  socket.on('playerReady', ({ socketId }) => {
    if (socketId !== state.socketId) {
      pushStatus(`${state.opponentName || 'Opponent'} ready for battle.`, 'info');
    }
  });

  socket.on('setupComplete', () => {
    pushStatus('Both forces deployed. Roll to determine initiative.', 'info');
    state.setupLocked = true;
    enterGameScreen();
  });

  socket.on('diceTie', () => {
    pushStatus('Both operators rolled the same value. Roll again.', 'warning');
    elements.buttons.rollDice.disabled = false;
    elements.buttons.rollDice.classList.remove('disabled');
  });

  socket.on('turnStart', ({ currentTurn, order }) => {
    state.currentTurnSocket = currentTurn;
    state.playerTurn = currentTurn === state.socketId;
    state.gameStarted = true;
    state.dieComplete = true;
    const playerIndex = order.indexOf(state.socketId);
    if (playerIndex !== -1) {
      pushStatus(
        state.playerTurn ? 'Strike sequence authorized.' : 'Hold position; awaiting opponent.',
        state.playerTurn ? 'success' : 'info',
      );
    }
    setTurnBanner(state.playerTurn ? 'Your turn!' : `${state.opponentName} turn`);
    elements.buttons.fire.disabled = !state.playerTurn;
    elements.buttons.fire.classList.toggle('disabled', !state.playerTurn);
  });

  socket.on('attackResult', ({ attacker, coordinate, result }) => {
    if (attacker === state.socketId) {
      state.attackResults[coordinate] = result.hit ? 'hit' : 'miss';
      const cellEl = elements.boards.attack.querySelector(`[data-coord="${coordinate}"]`);
      if (cellEl) {
        cellEl.classList.remove('selected-target');
        if (result.hit) {
          cellEl.classList.add('hit');
        } else {
          cellEl.classList.add('miss');
        }
      }
      state.attackHistory.add(coordinate);
      if (result.hit) {
        playTone(SOUNDS.HIT, 280);
        pushStatus(`Direct hit at ${coordinate}!`, 'success');
        if (result.destroyedUnit) {
          pushStatus(`Enemy ${result.destroyedUnit} destroyed!`, 'success');
        }
      } else {
        playTone(SOUNDS.MISS, 200);
        pushStatus('Attack unsuccessful!', 'info');
      }
    } else {
      state.opponentAttackHistory.add(coordinate);
      const resultBoard = resolveAttackAgainstBoard(state.playerBoard, coordinate);
      renderPlayerBoard();
      if (resultBoard.hit) {
        playTone(SOUNDS.HIT, 280);
        pushStatus(`Our ${resultBoard.destroyed || 'unit'} was hit at ${coordinate}!`, 'danger');
        if (resultBoard.destroyed) {
          pushStatus(`Your ${resultBoard.destroyed} has been destroyed!`, 'danger');
        }
      } else {
        playTone(SOUNDS.MISS, 200);
        pushStatus('Enemy attack unsuccessful!', 'success');
      }
    }
  });

  socket.on('gameOver', ({ winner, winnerName }) => {
    state.gameStarted = false;
    const victory = winner === state.socketId;
    setTurnBanner(victory ? 'Victory!' : 'Defeat.');
    showPostGameModal(
      victory ? 'Mission Success' : 'Mission Failed',
      victory
        ? `You have neutralized ${state.opponentName || 'the opponent'}.`
        : `${winnerName || 'Opponent'} secured the battlefield.`,
    );
  });

  socket.on('gameState', (payload) => {
    if (payload.currentTurn) {
      state.currentTurnSocket = payload.currentTurn;
      state.playerTurn = payload.currentTurn === state.socketId;
      setTurnBanner(state.playerTurn ? 'Your turn!' : `${state.opponentName} turn`);
    }
  });

  socket.on('saved', () => {
    if (state.awaitingSave) {
      pushStatus('Mission state stored successfully.', 'success');
      state.awaitingSave = false;
    }
  });

  socket.on('matchError', ({ message }) => {
    pushStatus(message || 'Command error encountered.', 'danger');
  });

  socket.on('opponentLeft', () => {
    pushStatus('Opponent disconnected. Mission aborted.', 'warning');
    setTurnBanner('Opponent disconnected');
    showPostGameModal('Mission Interrupted', 'Opponent left the battlefield.');
  });
}

function loadSavedGame(data) {
  if (data.mode === 'solo') {
    state.mode = GAME_MODES.SOLO;
    state.difficulty = data.difficulty || DIFFICULTIES.LOW;
    state.playerBoard = data.player.board;
    state.aiBoard = data.ai.board;
    state.playerTurn = data.player.turn;
    state.playerRoll = data.player.roll;
    state.opponentRoll = data.ai.roll;
    state.attackHistory = new Set(data.player.attackHistory || []);
    state.attackResults = {};
    state.attackHistory.forEach((coord) => {
      const cell = state.aiBoard?.cells?.[coord];
      if (!cell || !cell.hit) {
        state.attackResults[coord] = 'miss';
      } else if (cell.occupant) {
        state.attackResults[coord] = 'hit';
      } else {
        state.attackResults[coord] = 'miss';
      }
    });
    state.aiShots = new Set(data.ai.shots || []);
    state.statusMessages = data.status || [];
    state.gameStarted = true;
    state.setupLocked = true;
    state.dieComplete = true;
    renderPlayerBoard();
    renderAttackBoard();
    renderStatusFeed();
    setDiceDisplay(state.playerRoll || '-');
    setTurnBanner(state.playerTurn ? 'Your turn!' : 'Opponent turn');
    elements.buttons.fire.disabled = !state.playerTurn;
    elements.buttons.fire.classList.toggle('disabled', !state.playerTurn);
    elements.buttons.rollDice.disabled = true;
    elements.buttons.rollDice.classList.add('disabled');
    switchScreen(MODES.GAME);
  } else if (data.mode === 'pvp') {
    pushStatus('Reconnect to multiplayer session via Tactical Link.', 'info');
  }
}

function initializeApp() {
  renderPlacementBoard();
  renderUnitList();
  renderPlayerBoard();
  renderAttackBoard();
  renderStatusFeed();
  updateReadyButton();
  elements.buttons.fire.disabled = true;
  elements.buttons.fire.classList.add('disabled');
  setupEventListeners();
  initializeSocketEvents();
}

initializeApp();
