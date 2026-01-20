import { ROWS, COLUMNS, MODES, GAME_MODES, DIFFICULTIES, SOUNDS } from './game_setup.js';
import { MAX_UNITS, AVAILABLE_UNITS, UNIT_IMAGES } from './vehicles.js';

const socket = io();
const LOCAL_SAVE_KEY = 'gridops-local-saves';
let selectedLocalSave = null;

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
  draggingUnit: null,
};

const SFX_PATHS = {
  FIRE: '/assets/sfx/sfx_fire.wav',
  HIT: '/assets/sfx/sfx_hit.wav',
  MISS: '/assets/sfx/sfx_miss.wav',
};

function playSfx(path) {
  if (typeof Audio === 'undefined' || !path) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const audio = new Audio(path);
    audio.preload = 'auto';
    let resolved = false;
    const finalize = () => {
      if (resolved) return;
      resolved = true;
      audio.removeEventListener('ended', finalize);
      audio.removeEventListener('error', finalize);
      resolve();
    };
    audio.addEventListener('ended', finalize);
    audio.addEventListener('error', finalize);
    const playPromise = audio.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(finalize);
    }
  });
}

let elements = null;
let menuOpen = false;
let dragPreviewCells = [];

function syncAttackInterface() {
  if (!elements) return;
  const overlayActive = Boolean(state.playerTurn && state.dieComplete);
  if (elements.screens?.game) {
    elements.screens.game.classList.toggle('attack-mode', overlayActive);
  }
  const fireButton = elements.buttons?.fire;
  if (fireButton) {
    const canFire = overlayActive && Boolean(state.attackSelection);
    fireButton.disabled = !canFire;
    fireButton.classList.toggle('disabled', !canFire);
  }
}

function clearDragPreview() {
  if (!elements?.boards?.placement) return;
  dragPreviewCells.forEach((coord) => {
    const cell = elements.boards.placement.querySelector(`[data-coord="${coord}"]`);
    if (cell) {
      cell.classList.remove('drag-preview');
    }
  });
  dragPreviewCells = [];
}

function applyDragPreview(coords) {
  clearDragPreview();
  if (!coords || !coords.length) return;
  dragPreviewCells = coords.slice();
  dragPreviewCells.forEach((coord) => {
    const cell = elements.boards.placement.querySelector(`[data-coord="${coord}"]`);
    if (cell) {
      cell.classList.add('drag-preview');
    }
  });
}

function handlePlacementDragOver(event) {
  if (state.setupLocked || !state.draggingUnit) return;
  event.preventDefault();
  const cell = event.target.closest ? event.target.closest('.cell') : null;
  if (!cell || !cell.dataset.coord) {
    clearDragPreview();
    return;
  }
  const coordinate = cell.dataset.coord;
  const previewCoords = canPlaceUnit(state.placementBoard, state.draggingUnit, coordinate, state.orientation);
  if (!previewCoords) {
    clearDragPreview();
    return;
  }
  applyDragPreview(previewCoords);
}

function handlePlacementDragLeave(event) {
  if (!elements?.boards?.placement) return;
  const placement = elements.boards.placement;
  const target = event.relatedTarget;
  if (target && placement.contains(target)) {
    return;
  }
  clearDragPreview();
}

function handlePlacementDrop(event) {
  if (state.setupLocked) return;
  event.preventDefault();
  const cell = event.target.closest ? event.target.closest('.cell') : null;
  if (!cell || !cell.dataset.coord) {
    clearDragPreview();
    state.draggingUnit = null;
    return;
  }
  attemptPlaceSelectedUnit(cell.dataset.coord);
  clearDragPreview();
  state.draggingUnit = null;
}

function bindPlacementDragHandlers() {
  const placement = elements?.boards?.placement;
  if (!placement) return;
  placement.addEventListener('dragover', handlePlacementDragOver);
  placement.addEventListener('dragleave', handlePlacementDragLeave);
  placement.addEventListener('drop', handlePlacementDrop);
}

function highlightUnitSelection(unitName) {
  if (!elements?.lists?.unit) return;
  elements.lists.unit.querySelectorAll('.unit-item').forEach((item) => {
    item.classList.toggle('selected', item.dataset.unit === unitName);
  });
}

function bindVehicleDragSources() {
  const icons = document.querySelectorAll('.unit-item');
  if (!icons.length) return;
  icons.forEach((icon) => {
    const unitName = icon.dataset.unit;
    if (!unitName) return;
    icon.addEventListener('dragstart', (event) => {
      const unit = AVAILABLE_UNITS.find((item) => item.name === unitName);
      if (!unit) return;
      state.selectedUnit = unit;
      state.draggingUnit = unit;
      highlightUnitSelection(unit.name);
      const transfer = event.dataTransfer;
      if (transfer) {
        transfer.setData('text/plain', unitName);
        if (typeof transfer.setEffectAllowed === 'function') {
          transfer.setEffectAllowed('copy');
        }
      }
    });
    icon.addEventListener('dragend', () => {
      state.draggingUnit = null;
      clearDragPreview();
    });
  });
}

function collectElements(root = document) {
  return {
    appRoot: root.getElementById ? root.getElementById('app') : root.querySelector('#app'),
    screens: {
      home: root.getElementById ? root.getElementById('homeScreen') : root.querySelector('#homeScreen'),
      setup: root.getElementById ? root.getElementById('setupScreen') : root.querySelector('#setupScreen'),
      game: root.getElementById ? root.getElementById('gameScreen') : root.querySelector('#gameScreen'),
    },
    modals: {
      postGame: root.getElementById ? root.getElementById('postGameModal') : root.querySelector('#postGameModal'),
    },
    inputs: {
      playerName: root.getElementById ? root.getElementById('playerName') : root.querySelector('#playerName'),
    },
    buttons: {
      newGame: root.getElementById ? root.getElementById('newGameBtn') : root.querySelector('#newGameBtn'),
      continue: root.getElementById ? root.getElementById('continueBtn') : root.querySelector('#continueBtn'),
      startSolo: root.getElementById ? root.getElementById('startSoloBtn') : root.querySelector('#startSoloBtn'),
      randomize: root.getElementById ? root.getElementById('randomizeBtn') : root.querySelector('#randomizeBtn'),
      clearBoard: root.getElementById ? root.getElementById('clearBoardBtn') : root.querySelector('#clearBoardBtn'),
      ready: root.getElementById ? root.getElementById('readyBtn') : root.querySelector('#readyBtn'),
      backHome: root.getElementById ? root.getElementById('backToHomeBtn') : root.querySelector('#backToHomeBtn'),
      fire: root.getElementById ? root.getElementById('fireBtn') : root.querySelector('#fireBtn'),
      save: root.getElementById ? root.getElementById('saveBtn') : root.querySelector('#saveBtn'),
      loadLocalSave: root.getElementById
        ? root.getElementById('loadLocalSaveBtn')
        : root.querySelector('#loadLocalSaveBtn'),
      startDeployment: root.getElementById
        ? root.getElementById('startDeploymentBtn')
        : root.querySelector('#startDeploymentBtn'),
      cancelCallsign: root.getElementById
        ? root.getElementById('cancelCallsignBtn')
        : root.querySelector('#cancelCallsignBtn'),
      cancelMode: root.getElementById
        ? root.getElementById('cancelModeBtn')
        : root.querySelector('#cancelModeBtn'),
      playAgain: root.getElementById ? root.getElementById('playAgainBtn') : root.querySelector('#playAgainBtn'),
      returnHome: root.getElementById ? root.getElementById('returnHomeBtn') : root.querySelector('#returnHomeBtn'),
      abortMission: root.getElementById
        ? root.getElementById('abortMissionBtn')
        : root.querySelector('#abortMissionBtn'),
    },
    lists: {
      unit: root.getElementById ? root.getElementById('unitList') : root.querySelector('#unitList'),
      players: root.getElementById ? root.getElementById('playerList') : root.querySelector('#playerList'),
      localSaves: root.getElementById
        ? root.getElementById('localSaveList')
        : root.querySelector('#localSaveList'),
    },
    toggles: {
      orientation: root.querySelectorAll ? root.querySelectorAll('[data-orientation]') : [],
      difficulty: root.querySelectorAll ? root.querySelectorAll('#soloOptions .chip') : [],
    },
    boards: {
      placement: root.getElementById ? root.getElementById('placementBoard') : root.querySelector('#placementBoard'),
      player: root.getElementById ? root.getElementById('playerBoard') : root.querySelector('#playerBoard'),
      attack: root.getElementById ? root.getElementById('attackBoard') : root.querySelector('#attackBoard'),
    },
    hud: {
      statusFeed: root.getElementById ? root.getElementById('statusFeed') : root.querySelector('#statusFeed'),
      turnBanner: root.getElementById ? root.getElementById('turnBanner') : root.querySelector('#turnBanner'),
      homeStatus: root.getElementById ? root.getElementById('homeStatus') : root.querySelector('#homeStatus'),
      postGameTitle: root.getElementById ? root.getElementById('postGameTitle') : root.querySelector('#postGameTitle'),
      postGameMessage: root.getElementById
        ? root.getElementById('postGameMessage')
        : root.querySelector('#postGameMessage'),
    },
    panels: {
      soloOptions: root.getElementById ? root.getElementById('soloOptions') : root.querySelector('#soloOptions'),
      pvpOptions: root.getElementById ? root.getElementById('pvpOptions') : root.querySelector('#pvpOptions'),
    },
    header: {
      menuToggle: root.getElementById ? root.getElementById('menuToggle') : root.querySelector('#menuToggle'),
      menuDropdown: root.getElementById ? root.getElementById('menuDropdown') : root.querySelector('#menuDropdown'),
      menuItems: root.querySelectorAll ? root.querySelectorAll('[data-menu-action]') : [],
    },
  };
}

function hasLocalStorage() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

function readLocalSaves() {
  if (!hasLocalStorage()) return {};
  try {
    const raw = window.localStorage.getItem(LOCAL_SAVE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    console.error('Failed to read local saves', err);
    return {};
  }
}

function updateLocalSaveSelection(entry) {
  if (!elements?.lists?.localSaves) return;
  const container = elements.lists.localSaves;
  container.querySelectorAll('.save-entry').forEach((item) => {
    item.classList.remove('selected');
  });
  if (!entry) {
    selectedLocalSave = null;
    return;
  }
  entry.classList.add('selected');
  selectedLocalSave = entry.dataset.player || null;
}

function formatLocalSaveMeta(info) {
  const timestamp = info?.savedAt ? new Date(info.savedAt) : null;
  const dateLabel = timestamp
    ? timestamp.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : 'Unknown time';
  const mode = info?.payload?.mode ? info.payload.mode.toUpperCase() : 'UNKNOWN';
  return `${mode} · ${dateLabel}`;
}

function renderLocalSaveList() {
  if (!elements?.lists?.localSaves) return;
  const container = elements.lists.localSaves;
  container.innerHTML = '';
  if (!hasLocalStorage()) {
    container.innerHTML = '<p class="empty-state">Local storage unavailable.</p>';
    selectedLocalSave = null;
    return;
  }
  const saves = readLocalSaves();
  const entries = Object.entries(saves);
  if (!entries.length) {
    container.innerHTML = '<p class="empty-state">No local saves yet.</p>';
    selectedLocalSave = null;
    return;
  }
  entries
    .sort(([, current], [, next]) => {
      const currentTime = current?.savedAt ? new Date(current.savedAt).getTime() : 0;
      const nextTime = next?.savedAt ? new Date(next.savedAt).getTime() : 0;
      return nextTime - currentTime;
    })
    .forEach(([playerName, data]) => {
      const entry = document.createElement('div');
      entry.className = 'save-entry';
      entry.dataset.player = playerName;
      entry.tabIndex = 0;
      entry.innerHTML = `<strong>${playerName}</strong><span>${formatLocalSaveMeta(data)}</span>`;
      entry.addEventListener('click', () => updateLocalSaveSelection(entry));
      entry.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          updateLocalSaveSelection(entry);
        }
      });
      container.appendChild(entry);
    });
  const firstEntry = container.querySelector('.save-entry');
  if (firstEntry) {
    updateLocalSaveSelection(firstEntry);
  }
}

function persistLocalSave(playerName, payload) {
  if (!playerName || !payload || !hasLocalStorage()) return;
  const saves = readLocalSaves();
  saves[playerName] = {
    payload,
    savedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(LOCAL_SAVE_KEY, JSON.stringify(saves));
  renderLocalSaveList();
}

function handleLocalSaveLoad() {
  if (!elements?.hud?.homeStatus) return;
  if (!selectedLocalSave) {
    elements.hud.homeStatus.textContent = 'Select a local save to resume.';
    playTone(SOUNDS.ALERT, 200);
    return;
  }
  const saves = readLocalSaves();
  const entry = saves[selectedLocalSave];
  if (!entry?.payload) {
    elements.hud.homeStatus.textContent = 'Selected save is unavailable.';
    playTone(SOUNDS.ALERT, 200);
    return;
  }
  elements.inputs.playerName.value = selectedLocalSave;
  state.playerName = selectedLocalSave;
  state.continuePayload = entry.payload;
  loadSavedGame(entry.payload);
}


function showCallsignPanel() {
  slideActionAreaTrackTo(1);
  const input = elements?.inputs?.playerName;
  if (input) {
    window.setTimeout(() => input.focus(), 500);
  }
}

function hideCallsignPanel() {
  slideActionAreaTrackTo(0);
}

function showModePanel() {
  slideActionAreaTrackTo(2);
}

function hideModePanel() {
  slideActionAreaTrackTo(0);
}

function slideActionAreaTrackTo(targetIndex = 0) {
  const track = elements?.screens?.home?.querySelector('.action-area--track');
  if (!track) return;
  const panels = track.querySelectorAll('.action-area--panel');
  const panelCount = panels.length || 1;
  const clampedIndex = Math.min(Math.max(targetIndex, 0), panelCount - 1);
  const share = 100 / panelCount;
  panels.forEach((panel) => {
    panel.style.flex = `0 0 ${share}%`;
  });
  track.style.width = `${panelCount * 100}%`;
  track.style.transform = `translateX(${clampedIndex * -share}%)`;
  track.dataset.activePanelIndex = `${clampedIndex}`;
}

function handleNewDeploymentStart() {
  if (!elements?.inputs?.playerName) return false;
  const value = elements.inputs.playerName.value.trim();
  state.playerName = value;
  if (!state.playerName) {
    if (elements?.hud?.homeStatus) {
      elements.hud.homeStatus.textContent = 'Enter callsign to proceed.';
    }
    playTone(SOUNDS.ALERT, 200);
    return false;
  }
  if (elements?.hud?.homeStatus) {
    elements.hud.homeStatus.textContent = '';
  }
  requestPlayerRegistration();
  state.mode = null;
  showModePanel();
  toggleModal('mode', true);
  return true;
}

function playTone() {
  // Sound effects disabled.
}

function createEmptyBoard() {
  const cells = {};
  COLUMNS.forEach((column) => {
    ROWS.forEach((row) => {
      const coord = `${row}${column}`;
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

function isSpaceFree(board, coordinate) {
  const cell = board.cells[coordinate];
  return Boolean(cell && !cell.occupant);
}

function canPlaceUnit(board, unit, startCoordinate, orientation) {
  const indices = coordinateToIndices(startCoordinate);
  if (!indices) return false;
  const coordinates = [];
  for (let offset = 0; offset < unit.size; offset += 1) {
    const rowIndex = orientation === 'horizontal' ? indices.rowIndex + offset : indices.rowIndex;
    const columnIndex =
      orientation === 'vertical' ? indices.columnIndex + offset : indices.columnIndex;
    const coord = indicesToCoordinate(rowIndex, columnIndex);
    if (!coord) return false;
    if (!isSpaceFree(board, coord)) return false;
    coordinates.push(coord);
  }
  return coordinates;
}

function placeUnit(board, unit, coordinates) {
  console.log(`Placing unit ${unit.name} at ${coordinates.join(', ')}`);
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
  renderUnitList();
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
  renderUnitList();
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
  return firstIndices.columnIndex === secondIndices.columnIndex ? 'horizontal' : 'vertical';
}

function getUnitAnchorCoordinate(unit, orientation) {
  if (!unit || unit.coordinates.length === 0) return null;
  return unit.coordinates.reduce((anchor, coord) => {
    if (!anchor) return coord;
    const anchorIndices = coordinateToIndices(anchor);
    const coordIndices = coordinateToIndices(coord);
    if (!anchorIndices || !coordIndices) return anchor;
    if (orientation === 'horizontal') {
      if (coordIndices.rowIndex < anchorIndices.rowIndex) {
        return coord;
      }
      if (coordIndices.rowIndex === anchorIndices.rowIndex && coordIndices.columnIndex < anchorIndices.columnIndex) {
        return coord;
      }
      return anchor;
    }
    if (coordIndices.columnIndex < anchorIndices.columnIndex) {
      return coord;
    }
    if (coordIndices.columnIndex === anchorIndices.columnIndex && coordIndices.rowIndex < anchorIndices.rowIndex) {
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
  COLUMNS.forEach((column) => {
    ROWS.forEach((row) => {
      const coord = `${row}${column}`;
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
  const playerBoardEl = elements?.boards?.player;
  if (!playerBoardEl) {
    console.warn('Player board element missing when trying to render player board.');
    return;
  }
  playerBoardEl.innerHTML = '';
  COLUMNS.forEach((column) => {
    ROWS.forEach((row) => {
      const coord = `${row}${column}`;
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
      playerBoardEl.appendChild(cellEl);
    });
  });
}

function renderAttackBoard() {
  const { attack } = elements.boards;
  attack.innerHTML = '';
  COLUMNS.forEach((column) => {
    ROWS.forEach((row) => {
      const coord = `${row}${column}`;
      const cellEl = document.createElement('div');
      cellEl.className = 'cell';
      cellEl.dataset.coord = coord;
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
    item.draggable = true;
    item.innerHTML = `
      <div class="unit-thumb-wrapper">
        <img src="${UNIT_IMAGES[unit.name] || ''}" alt="${unit.name}" />
      </div>
      <div class="unit-meta">
        <strong>${unit.name}</strong>
        <span class="unit-size">${unit.size} tiles</span>
      </div>
    `;
    if (state.selectedUnit?.name === unit.name) {
      item.classList.add('selected');
    }
    if (state.placedUnits.some((placed) => placed.name === unit.name)) {
      item.classList.add('placed');
    }
    elements.lists.unit.appendChild(item);
  });
  bindVehicleDragSources();
}

function attemptPlaceSelectedUnit(coordinate) {
  if (state.setupLocked) return false;
  if (!coordinate) return false;
  if (state.placedUnits.length >= MAX_UNITS) {
    pushStatus('Unit cap reached. Remove a unit before placing another.', 'warning');
    return false;
  }
  const unit = state.selectedUnit;
  if (!unit) {
    pushStatus('Select a unit to deploy.', 'warning');
    return false;
  }
  if (state.placedUnits.some((placed) => placed.name === unit.name)) {
    pushStatus('Each unit profile may be deployed once.', 'warning');
    playTone(SOUNDS.ALERT, 200);
    return false;
  }
  const coordinates = canPlaceUnit(state.placementBoard, unit, coordinate, state.orientation);
  if (!coordinates) {
    pushStatus('Placement invalid. Check terrain boundaries.', 'danger');
    playTone(SOUNDS.ALERT, 250);
    return false;
  }
  placeUnit(state.placementBoard, unit, coordinates);
  state.placedUnits.push({ ...unit, coordinates });
  renderPlacementBoard();
  updateReadyButton();
  renderUnitList();
  return true;
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
function openMenu() {
  if (menuOpen) return;
  const toggle = elements?.header?.menuToggle;
  const dropdown = elements?.header?.menuDropdown;
  if (!toggle || !dropdown) return;
  dropdown.classList.remove('hidden');
  toggle.setAttribute('aria-expanded', 'true');
  menuOpen = true;
  document.addEventListener('click', handleMenuOutsideClick);
  document.addEventListener('keydown', handleMenuKeydown);
}

function closeMenu() {
  if (!menuOpen) return;
  const toggle = elements?.header?.menuToggle;
  const dropdown = elements?.header?.menuDropdown;
  if (dropdown) {
    dropdown.classList.add('hidden');
  }
  if (toggle) {
    toggle.setAttribute('aria-expanded', 'false');
  }
  menuOpen = false;
  document.removeEventListener('click', handleMenuOutsideClick);
  document.removeEventListener('keydown', handleMenuKeydown);
}

function toggleMenu() {
  if (menuOpen) {
    closeMenu();
  } else {
    openMenu();
  }
}

function handleMenuOutsideClick(event) {
  const container = elements?.header?.menuDropdown;
  const toggle = elements?.header?.menuToggle;
  if (!container || !menuOpen) return;
  if (container.contains(event.target) || toggle?.contains(event.target)) {
    return;
  }
  closeMenu();
}

function handleMenuKeydown(event) {
  if (event.key === 'Escape') {
    closeMenu();
  }
}

function handleMenuAction(action) {
  switch (action) {
    case 'home':
      switchScreen(MODES.HOME);
      toggleModal('mode', false);
      toggleModal('postGame', false);
      break;
    case 'save':
      elements?.buttons?.save?.click();
      break;
    case 'abort':
      if (state.mode === GAME_MODES.PVP && state.gameId) {
        socket.emit('cancelMatch');
      }
      if (state.mode === GAME_MODES.SOLO && state.gameStarted) {
        pushStatus('Mission aborted. Returning to command.', 'warning');
      }
      state.mode = null;
      state.gameId = null;
      state.gameStarted = false;
      state.setupLocked = false;
      state.dieComplete = false;
      state.playerTurn = false;
      state.currentTurnSocket = null;
      state.attackSelection = null;
      state.attackHistory = new Set();
      state.attackResults = {};
      state.opponentAttackHistory = new Set();
      state.statusMessages = [];
      state.playerBoard = createEmptyBoard();
      state.aiBoard = createEmptyBoard();
      state.aiShots = new Set();
      renderStatusFeed();
      renderPlayerBoard();
      renderAttackBoard();
      setTurnBanner('Awaiting orders...');
      syncAttackInterface();

      toggleModal('postGame', false);
      toggleModal('mode', false);
      switchScreen(MODES.HOME);
      resetPlacementBoard();
      break;
    default:
      break;
  }
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
          <span> ${item.message}</span>
        </div>`,
    )
    .join('');
}

function setTurnBanner(message) {
  if (!elements?.hud?.turnBanner) {
    return;
  }
  elements.hud.turnBanner.textContent = message;
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
  renderUnitList();
  resetPlacementBoard();
  state.aiBoard = createEmptyBoard();
  state.aiUnits = [];
  state.attackHistory = new Set();
  state.attackResults = {};
  state.opponentAttackHistory = new Set();
  state.aiShots = new Set();
  state.dieComplete = false;
  state.playerTurn = false;
  state.gameStarted = false;
  state.statusMessages = [];
  renderStatusFeed();
  setTurnBanner('Deploy your forces');
  state.attackSelection = null;
  syncAttackInterface();
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
  switchScreen(MODES.GAME);
  renderPlayerBoard();
  renderAttackBoard();
}

function establishInitiative() {
  const playerStarts = Math.random() < 0.5;
  state.playerTurn = playerStarts;
  const message = playerStarts
    ? 'You have the initiative. Strike when ready.'
    : 'Enemy forces seize the first shot.';
  setTurnBanner(playerStarts ? 'Your turn!' : 'Opponent turn');
  pushStatus(message, playerStarts ? 'success' : 'warning');
  syncAttackInterface();
  if (!playerStarts) {
    window.setTimeout(aiTakeTurn, 1100);
  }
}

function beginSoloCombat() {
  state.gameStarted = true;
  state.playerTurn = true;
  state.dieComplete = true;
  state.attackSelection = null;
  establishInitiative();
  syncAttackInterface();
}

function handleReadySolo() {
  if (state.placedUnits.length !== MAX_UNITS || state.setupLocked) return;
  populateAiBoard();
  state.setupLocked = true;
  pushStatus('Deployment locked. Awaiting command to begin.', 'info');
  enterGameScreen();
  beginSoloCombat();
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
  if (state.placedUnits.length !== MAX_UNITS) {
    pushStatus('Deploy every unit before locking in this deployment.', 'warning');
    playTone(SOUNDS.ALERT, 200);
    return;
  }
  if (state.setupLocked) return;
  playTone(SOUNDS.CLICK);
  if (state.mode === GAME_MODES.SOLO) {
    handleReadySolo();
  } else if (state.mode === GAME_MODES.PVP) {
    handleReadyMultiplayer();
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
  const attackBoard = elements?.boards?.attack;
  const previousSelection = attackBoard?.querySelector('.cell.selected-target');
  if (previousSelection) {
    previousSelection.classList.remove('selected-target', 'occupied');
  }
  const cellEl = attackBoard?.querySelector(`[data-coord="${coordinate}"]`);
  if (cellEl) {
    cellEl.classList.add('selected-target', 'occupied');
  }
  state.attackSelection = coordinate;
  const fireButton = elements?.buttons?.fire;
  if (fireButton) {
    fireButton.disabled = false;
    fireButton.classList.remove('disabled');
  }
  syncAttackInterface();
  setTurnBanner(`Target locked: ${coordinate}`);
}

async function finalizePlayerAttack() {
  if (!state.attackSelection) return;
  const coordinate = state.attackSelection;
  const fireButton = elements?.buttons?.fire;
  if (fireButton) {
    fireButton.disabled = true;
    fireButton.classList.add('disabled');
  }
  state.attackHistory.add(coordinate);
  await playSfx(SFX_PATHS.FIRE);
  if (state.mode === GAME_MODES.SOLO) {
    const result = resolveAttackAgainstBoard(state.aiBoard, coordinate);
    state.attackResults[coordinate] = result.hit ? 'hit' : 'miss';
    await playSfx(result.hit ? SFX_PATHS.HIT : SFX_PATHS.MISS);
    const cellEl = elements.boards.attack.querySelector(`[data-coord="${coordinate}"]`);
    if (cellEl) {
      cellEl.classList.remove('selected-target', 'occupied');
      cellEl.classList.add(result.hit ? 'hit' : 'miss');
    }
    state.attackSelection = null;
    if (result.hit) {
      pushStatus(`Direct hit at ${coordinate}!`, 'success');
      if (result.destroyed) {
        pushStatus(`Enemy ${result.destroyed} destroyed!`, 'success');
      }
      if (result.victory) {
        pushStatus('All hostiles neutralized!', 'success');
        setTurnBanner('Victory!');
        state.playerTurn = false;
        syncAttackInterface();
        showPostGameModal('Mission Success', 'You have secured the battlefield.');
        return;
      }
    } else {
      pushStatus(`Attack unsuccessful at ${coordinate}.`, 'info');
    }
    state.playerTurn = false;
    syncAttackInterface();
    setTurnBanner('Opponent turn...');
    window.setTimeout(aiTakeTurn, 1000);
  } else if (state.mode === GAME_MODES.PVP) {
    if (!state.gameId) return;
    socket.emit('attack', { gameId: state.gameId, coordinate });
    state.attackResults[coordinate] = 'pending';
    state.attackSelection = null;
    const cellEl = elements.boards.attack.querySelector(`[data-coord="${coordinate}"]`);
    if (cellEl) {
      cellEl.classList.remove('selected-target', 'occupied');
    }
    setTurnBanner('Transmitting strike data...');
    syncAttackInterface();
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

async function aiTakeTurn() {
  if (state.mode !== GAME_MODES.SOLO || state.playerTurn) return;
  const coordinate = aiChooseCoordinate();
  if (!coordinate) return;
  state.aiShots.add(coordinate);
  const result = resolveAttackAgainstBoard(state.playerBoard, coordinate);
  state.opponentAttackHistory.add(coordinate);
  pushStatus(`Incoming strike at ${coordinate}!`, 'warning');
  await playSfx(result.hit ? SFX_PATHS.HIT : SFX_PATHS.MISS);
  renderPlayerBoard();
  if (result.hit) {
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
    pushStatus('Enemy attack unsuccessful!', 'success');
  }
  state.playerTurn = true;
  setTurnBanner('Your turn!');
  state.attackSelection = null;
  syncAttackInterface();
}

function setupEventListeners() {
  if (elements?.buttons?.newGame) {
    elements.buttons.newGame.addEventListener('click', () => {
      showCallsignPanel();
    });
  }

  if (elements?.buttons?.startDeployment) {
    elements.buttons.startDeployment.addEventListener('click', (event) => {
      event.preventDefault();
      handleNewDeploymentStart();
    });
  }

  if (elements?.inputs?.playerName && elements?.buttons?.startDeployment) {
    elements.inputs.playerName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        elements.buttons.startDeployment.click();
      }
    });
  }

  if (elements?.buttons?.cancelCallsign) {
    elements.buttons.cancelCallsign.addEventListener('click', () => {
      hideCallsignPanel();
    });
  }

  if (elements?.buttons?.cancelMode) {
    elements.buttons.cancelMode.addEventListener('click', () => {
      showCallsignPanel();
    });
  }

  if (elements?.buttons?.continue) {
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
  }

  if (elements.buttons.loadLocalSave) {
    elements.buttons.loadLocalSave.addEventListener('click', () => {
      handleLocalSaveLoad();
    });
  }


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

  if (elements?.buttons?.randomize) {
    elements.buttons.randomize.addEventListener('click', () => {
      playTone(SOUNDS.CLICK);
      randomizePlacement();
    });
  }

  if (elements?.buttons?.clearBoard) {
    elements.buttons.clearBoard.addEventListener('click', () => {
      playTone(SOUNDS.CLICK);
      resetPlacementBoard();
    });
  }

  if (elements?.buttons?.ready) {
    elements.buttons.ready.addEventListener('click', () => {
      if (elements.buttons.ready.disabled) return;
      handleReady();
    });
  }


  if (elements.buttons.backHome) {
    elements.buttons.backHome.addEventListener('click', () => {
      playTone(SOUNDS.CLICK);
      toggleModal('mode', false);
      switchScreen(MODES.HOME);
    });
  }

  if (elements.header.menuToggle) {
    elements.header.menuToggle.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      toggleMenu();
    });
  }

  if (elements.header.menuItems && typeof elements.header.menuItems.forEach === 'function') {
    elements.header.menuItems.forEach((item) => {
      item.addEventListener('click', (event) => {
        event.preventDefault();
        const action = event.currentTarget.dataset.menuAction;
        closeMenu();
        if (action) {
          handleMenuAction(action);
        }
      });
    });
  }

  if (elements?.boards?.attack) {
    elements.boards.attack.addEventListener('click', (event) => {
      const cell = event.target.closest ? event.target.closest('.cell') : null;
      const coordinate = cell?.dataset?.coord;
      if (!coordinate) return;
      handlePlayerAttack(coordinate);
    });
  }

  if (elements?.buttons?.fire) {
    elements.buttons.fire.addEventListener('click', () => {
      if (elements.buttons.fire.disabled) return;
      void finalizePlayerAttack().catch((error) => {
        console.error('Failed to finalize attack', error);
      });
    });
  }

  bindPlacementDragHandlers();
}

// function initializeSocketEvents() {
// Temporarily disable socket glue until the UI catches up to this flow.
// return;

/*
socket.on('playerRegistered', ({ socketId }) => {
  state.socketId = socketId;
});

socket.on('playerList', (players) => {
  if (state.mode !== GAME_MODES.PVP) return;
  showPlayersList(players);
});

// socket.on('matchStarted', ({ gameId, opponentName }) => {
//   toggleModal('mode', false);
//   state.mode = GAME_MODES.PVP;
//   resetPlacementBoard();
//   state.gameId = gameId;
//   state.opponentName = opponentName;
//   state.attackHistory = new Set();
//   state.attackResults = {};
//   state.opponentAttackHistory = new Set();
//   state.statusMessages = [];
//   renderStatusFeed();
//   setTurnBanner('Deploy your forces');
//   state.attackSelection = null;
//   syncAttackInterface();
//   /* Dice controls paused for now.
//   state.setupLocked = false;
//   switchScreen(MODES.SETUP);
//   socket.emit('joinGameRoom', { gameId });
// });

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

/* Dice roll handshake disabled for now.
socket.on('diceTie', () => {
  pushStatus('Both operators rolled the same value. Roll again.', 'warning');
});
*/

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
  state.attackSelection = null;
  syncAttackInterface();
});

socket.on('attackResult', async ({ attacker, coordinate, result }) => {
  const soundPath = result.hit ? SFX_PATHS.HIT : SFX_PATHS.MISS;
  try {
    if (attacker === state.socketId) {
      state.attackResults[coordinate] = result.hit ? 'hit' : 'miss';
      state.attackHistory.add(coordinate);
      await playSfx(soundPath);
      const cellEl = elements.boards.attack.querySelector(`[data-coord="${coordinate}"]`);
      if (cellEl) {
        cellEl.classList.remove('selected-target');
        cellEl.classList.add(result.hit ? 'hit' : 'miss');
      }
      if (result.hit) {
        pushStatus(`Direct hit at ${coordinate}!`, 'success');
        if (result.destroyedUnit) {
          pushStatus(`Enemy ${result.destroyedUnit} destroyed!`, 'success');
        }
      } else {
        pushStatus('Attack unsuccessful!', 'info');
      }
    } else {
      state.opponentAttackHistory.add(coordinate);
      const resultBoard = resolveAttackAgainstBoard(state.playerBoard, coordinate);
      await playSfx(soundPath);
      renderPlayerBoard();
      if (resultBoard.hit) {
        pushStatus(`Our ${resultBoard.destroyed || 'unit'} was hit at ${coordinate}!`, 'danger');
        if (resultBoard.destroyed) {
          pushStatus(`Your ${resultBoard.destroyed} has been destroyed!`, 'danger');
        }
      } else {
        pushStatus('Enemy attack unsuccessful!', 'success');
      }
    }
  } catch (error) {
    console.error('Failed to play attack result SFX', error);
  }
});

socket.on('gameOver', ({ winner, winnerName }) => {
  state.gameStarted = false;
  const victory = winner === state.socketId;
  setTurnBanner(victory ? 'Victory!' : 'Defeat.');
  state.playerTurn = false;
  state.attackSelection = null;
  syncAttackInterface();
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
    state.attackSelection = null;
    syncAttackInterface();
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
  state.playerTurn = false;
  state.attackSelection = null;
  syncAttackInterface();
  showPostGameModal('Mission Interrupted', 'Opponent left the battlefield.');
});

function loadSavedGame(data) {
  if (data.mode === 'solo') {
    state.mode = GAME_MODES.SOLO;
    state.difficulty = data.difficulty || DIFFICULTIES.LOW;
    state.playerBoard = data.player.board;
    state.aiBoard = data.ai.board;
    state.playerTurn = data.player.turn;
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
    setTurnBanner(state.playerTurn ? 'Your turn!' : 'Opponent turn');
    state.attackSelection = null;
    syncAttackInterface();
    switchScreen(MODES.GAME);
  } else if (data.mode === 'pvp') {
    pushStatus('Reconnect to multiplayer session via Tactical Link.', 'info');
  }
}

export function initializeApp(root = document) {
  if (elements) {
    return;
  }
  const scope = root instanceof Document ? root : document;
  elements = collectElements(scope);
  renderPlacementBoard();
  renderUnitList();
  updateReadyButton();

  state.attackSelection = null;
  syncAttackInterface();
  setupEventListeners();
  slideActionAreaTrackTo(0);
}

if (typeof window !== 'undefined') {
  window.GridOps = window.GridOps || {};
  window.GridOps.initializeApp = initializeApp;
}
