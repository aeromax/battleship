const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
let cachedUuidV4;

async function getUuidV4() {
  if (!cachedUuidV4) {
    const { v4 } = await import('uuid');
    cachedUuidV4 = v4;
  }
  return cachedUuidV4;
}

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const PORT = process.env.PORT || 4001;
const DATA_FILE = path.join(__dirname, '..', 'data', 'saves.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/js', express.static(__dirname));

app.get('/test', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'test.html'));
});

/**
 * Persisted save data keyed by player id.
 * Format: { [playerName: string]: SavedGameState }
 */
let savedGames = {};

try {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    savedGames = raw ? JSON.parse(raw) : {};
  }
} catch (err) {
  console.error('Failed to load saves file', err);
  savedGames = {};
}

function persistSaves() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(savedGames, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist saves', err);
  }
}

app.get('/api/saves/:playerName', (req, res) => {
  const { playerName } = req.params;
  res.json(savedGames[playerName] || null);
});

app.post('/api/saves/:playerName', (req, res) => {
  const { playerName } = req.params;
  const state = req.body;
  if (!state || typeof state !== 'object') {
    res.status(400).json({ error: 'Invalid save payload' });
    return;
  }
  savedGames[playerName] = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  persistSaves();
  res.json({ success: true });
});

app.delete('/api/saves/:playerName', (req, res) => {
  const { playerName } = req.params;
  delete savedGames[playerName];
  persistSaves();
  res.json({ success: true });
});

app.get('/api/status', (_req, res) => {
  res.json({
    mode: process.env.NODE_ENV || 'production',
    activePlayers: players.size,
    games: games.size,
  });
});

// Fallback for client-side routing on non-API GET requests.
app.get(/^\/(?!api)(?!socket\.io).*/, (req, res, next) => {
  if (req.method !== 'GET') {
    next();
    return;
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const players = new Map();
const games = new Map();
const pendingMatchRequests = new Map();

function hasPendingRequestFrom(challengerId) {
  for (const request of pendingMatchRequests.values()) {
    if (request.challengerId === challengerId) {
      return true;
    }
  }
  return false;
}

function removePendingMatchRequest(opponentId) {
  const request = pendingMatchRequests.get(opponentId);
  if (request) {
    pendingMatchRequests.delete(opponentId);
  }
  return request;
}

function cancelPendingMatchRequestsForSocket(socketId) {
  const entries = [];
  pendingMatchRequests.forEach((request, targetId) => {
    if (targetId === socketId || request.challengerId === socketId) {
      entries.push({ targetId, request });
    }
  });
  entries.forEach(({ targetId, request }) => {
    pendingMatchRequests.delete(targetId);
    const notifyId = targetId === socketId ? request.challengerId : targetId;
    io.to(notifyId).emit('matchRequestCancelled');
  });
}

function buildPlayerList() {
  const list = [];
  players.forEach((value, key) => {
    list.push({
      socketId: key,
      name: value.name,
      status: value.status,
    });
  });
  return list;
}

function broadcastPlayerList() {
  io.emit('playerList', buildPlayerList());
}

async function createGameRecord({ creatorId, opponentId }) {
  const uuidv4 = await getUuidV4();
  const id = uuidv4();
  const createdAt = Date.now();
  const record = {
    id,
    createdAt,
    mode: 'pvp',
    started: false,
    reconnectPending: false,
    reconnectVotes: {},
    players: {
      [creatorId]: {
        socketId: creatorId,
        name: players.get(creatorId)?.name || 'Player 1',
        ready: false,
        board: null,
        shots: new Set(),
        destroyed: [],
        connected: true,
        dieRoll: null,
      },
      [opponentId]: {
        socketId: opponentId,
        name: players.get(opponentId)?.name || 'Player 2',
        ready: false,
        board: null,
        shots: new Set(),
        destroyed: [],
        connected: true,
        dieRoll: null,
      },
    },
    order: [],
    currentTurn: null,
    winner: null,
    history: [],
    lastUpdate: createdAt,
  };
  games.set(id, record);
  return record;
}

function serializeGame(record) {
  return {
    id: record.id,
    mode: record.mode,
    players: Object.values(record.players).map((p) => ({
      socketId: p.socketId,
      name: p.name,
      ready: p.ready,
      connected: p.connected,
      dieRoll: p.dieRoll,
      destroyed: p.destroyed,
    })),
    order: record.order,
    currentTurn: record.currentTurn,
    winner: record.winner,
    history: record.history,
    lastUpdate: record.lastUpdate,
  };
}

function findPlayerEntryByName(game, playerName) {
  const target = String(playerName || '').trim();
  if (!target) return null;
  return Object.entries(game.players).find(([, player]) => player.name === target) || null;
}

function reassignPlayerSocket(game, oldId, newId) {
  if (!game.players[oldId] || oldId === newId) return;
  const player = game.players[oldId];
  delete game.players[oldId];
  player.socketId = newId;
  player.connected = true;
  game.players[newId] = player;
  if (Array.isArray(game.order)) {
    game.order = game.order.map((id) => (id === oldId ? newId : id));
  }
  if (game.currentTurn === oldId) {
    game.currentTurn = newId;
  }
  if (game.winner === oldId) {
    game.winner = newId;
  }
}

function buildReconnectPayload(game, socketId) {
  const player = game.players[socketId];
  const opponentId = Object.keys(game.players).find((id) => id !== socketId);
  const opponent = opponentId ? game.players[opponentId] : null;
  return {
    gameId: game.id,
    opponentName: opponent?.name || 'Opponent',
    playerName: player?.name || 'Player',
    playerBoard: player?.board || null,
    opponentBoard: opponent?.board || null,
    playerShots: Array.from(player?.shots || []),
    opponentShots: Array.from(opponent?.shots || []),
    currentTurn: game.currentTurn,
    order: game.order || [],
  };
}

function resetGameIfIncomplete(socketId) {
  cancelPendingMatchRequestsForSocket(socketId);
  const player = players.get(socketId);
  if (!player?.currentGameId) {
    return;
  }
  const game = games.get(player.currentGameId);
  if (!game) {
    players.set(socketId, { ...player, currentGameId: null, status: 'online' });
    return;
  }
  const opponentId = Object.keys(game.players).find((id) => id !== socketId);
  if (game.started) {
    const gamePlayer = game.players[socketId];
    if (gamePlayer) {
      gamePlayer.connected = false;
    }
    if (opponentId) {
      io.to(opponentId).emit('opponentLeft', { name: gamePlayer?.name || player?.name || 'Opponent' });
    }
    if (!game.reconnectPending) {
      game.reconnectPending = true;
      game.reconnectVotes = {};
    }
    game.lastUpdate = Date.now();
    return;
  }
  if (opponentId) {
    const opponent = players.get(opponentId);
    if (opponent) {
      opponent.status = 'online';
      opponent.currentGameId = null;
      players.set(opponentId, opponent);
      io.to(opponentId).emit('opponentLeft', { name: player?.name || 'Opponent' });
    }
  }
  games.delete(game.id);
  players.set(socketId, { ...player, currentGameId: null, status: 'online' });
  broadcastPlayerList();
}

function terminateGameForSocket(socketId, notifyEvent = 'opponentLeft') {
  const player = players.get(socketId);
  if (!player?.currentGameId) {
    return;
  }
  const game = games.get(player.currentGameId);
  if (!game) {
    players.set(socketId, { ...player, currentGameId: null, status: 'online' });
    return;
  }
  const opponentId = Object.keys(game.players).find((id) => id !== socketId);
  if (opponentId) {
    const opponent = players.get(opponentId);
    if (opponent) {
      opponent.status = 'online';
      opponent.currentGameId = null;
      players.set(opponentId, opponent);
      io.to(opponentId).emit(notifyEvent, { name: player?.name || 'Opponent' });
    }
  }
  games.delete(game.id);
  players.set(socketId, { ...player, currentGameId: null, status: 'online' });
  broadcastPlayerList();
}

io.on('connection', (socket) => {
  socket.on('registerPlayer', ({ name }) => {
    const safeName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 30) : 'Player';
    players.set(socket.id, {
      socketId: socket.id,
      name: safeName,
      status: 'online',
      currentGameId: null,
    });
    socket.emit('playerRegistered', { socketId: socket.id, name: safeName });
    broadcastPlayerList();
  });

  socket.on('requestReconnect', ({ gameId, playerName }) => {
    const game = games.get(gameId);
    if (!game || game.mode !== 'pvp') {
      socket.emit('reconnectUnavailable');
      return;
    }
    const entry = findPlayerEntryByName(game, playerName);
    if (!entry) {
      socket.emit('reconnectUnavailable');
      return;
    }
    const [playerId, player] = entry;
    if (player.connected && playerId !== socket.id) {
      socket.emit('reconnectUnavailable');
      return;
    }
    if (playerId !== socket.id) {
      reassignPlayerSocket(game, playerId, socket.id);
    } else {
      player.connected = true;
    }
    socket.join(game.id);
    players.set(socket.id, {
      socketId: socket.id,
      name: player.name,
      status: 'online',
      currentGameId: game.id,
    });
    game.reconnectPending = true;
    game.reconnectVotes = {};
    const opponentId = Object.keys(game.players).find((id) => id !== socket.id);
    const opponentName = opponentId ? game.players[opponentId]?.name : 'Opponent';
    socket.emit('reconnectPrompt', { gameId: game.id, opponentName });
    if (opponentId) {
      io.to(opponentId).emit('reconnectPrompt', {
        gameId: game.id,
        opponentName: player.name,
      });
    }
    broadcastPlayerList();
  });

  socket.on('reconnectDecision', ({ gameId, accept }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('reconnectUnavailable');
      return;
    }
    const player = game.players[socket.id];
    if (!player) {
      socket.emit('reconnectUnavailable');
      return;
    }
    const opponentId = Object.keys(game.players).find((id) => id !== socket.id);
    const opponentName = opponentId ? game.players[opponentId]?.name : 'Opponent';
    if (!accept) {
      if (opponentId) {
        io.to(opponentId).emit('reconnectDeclined', { name: player.name });
        const opponent = players.get(opponentId);
        if (opponent) {
          opponent.currentGameId = null;
          opponent.status = 'online';
          players.set(opponentId, opponent);
        }
      }
      players.set(socket.id, { socketId: socket.id, name: player.name, status: 'online', currentGameId: null });
      games.delete(game.id);
      broadcastPlayerList();
      return;
    }
    game.reconnectVotes = game.reconnectVotes || {};
    game.reconnectVotes[player.name] = true;
    io.to(socket.id).emit('reconnectWaiting', { opponentName });
    const playerNames = Object.values(game.players).map((p) => p.name);
    const allAccepted = playerNames.every((name) => game.reconnectVotes[name]);
    if (allAccepted) {
      game.reconnectPending = false;
      Object.keys(game.players).forEach((id) => {
        const payload = buildReconnectPayload(game, id);
        if (!payload.playerBoard || !payload.opponentBoard) {
          io.to(id).emit('reconnectUnavailable');
          return;
        }
        io.to(id).emit('reconnectState', payload);
      });
    }
  });

  socket.on('requestPlayerList', () => {
    socket.emit('playerList', buildPlayerList());
  });

  socket.on('createMatch', ({ opponentId }) => {
    const challenger = players.get(socket.id);
    const opponent = players.get(opponentId);
    if (!challenger || !opponent) {
      socket.emit('matchError', { message: 'Opponent unavailable.' });
      return;
    }
    if (socket.id === opponentId) {
      socket.emit('matchError', { message: 'Cannot challenge yourself.' });
      return;
    }
    if (challenger.status !== 'online' || opponent.status !== 'online') {
      socket.emit('matchError', { message: 'Either player is busy.' });
      return;
    }
    if (pendingMatchRequests.has(opponentId)) {
      socket.emit('matchError', { message: 'Opponent already has a pending request.' });
      return;
    }
    if (hasPendingRequestFrom(socket.id)) {
      socket.emit('matchError', { message: 'You already have a pending match request.' });
      return;
    }
    pendingMatchRequests.set(opponentId, {
      challengerId: socket.id,
      challengerName: challenger.name,
    });
    io.to(opponentId).emit('matchRequest', {
      challengerId: socket.id,
      challengerName: challenger.name,
    });
  });

  socket.on('respondMatchRequest', async ({ accept }) => {
    const request = removePendingMatchRequest(socket.id);
    if (!request) {
      socket.emit('matchError', { message: 'No pending match request.' });
      return;
    }
    const challenger = players.get(request.challengerId);
    const opponent = players.get(socket.id);
    if (!challenger || !opponent) {
      socket.emit('matchError', { message: 'Match request no longer valid.' });
      if (challenger) {
        io.to(challenger.socketId).emit('matchError', { message: 'Match request no longer valid.' });
      }
      return;
    }
    if (!accept) {
      io.to(challenger.socketId).emit('matchRejected', { playerName: opponent.name });
      return;
    }
    challenger.status = 'in_game';
    opponent.status = 'in_game';
    challenger.currentGameId = null;
    opponent.currentGameId = null;
    players.set(challenger.socketId, challenger);
    players.set(opponent.socketId, opponent);
    let game;
    try {
      game = await createGameRecord({
        creatorId: challenger.socketId,
        opponentId: opponent.socketId,
      });
    } catch (err) {
      console.error('Failed to create match record', err);
      challenger.status = 'online';
      opponent.status = 'online';
      players.set(challenger.socketId, challenger);
      players.set(opponent.socketId, opponent);
      io.to(challenger.socketId).emit('matchError', { message: 'Unable to start match.' });
      socket.emit('matchError', { message: 'Unable to start match.' });
      return;
    }
    challenger.currentGameId = game.id;
    opponent.currentGameId = game.id;
    players.set(challenger.socketId, challenger);
    players.set(opponent.socketId, opponent);
    [challenger.socketId, opponent.socketId].forEach((id) => {
      io.to(id).emit('matchStarted', {
        gameId: game.id,
        opponentName: id === challenger.socketId ? opponent.name : challenger.name,
      });
    });
    broadcastPlayerList();
  });

  socket.on('cancelMatch', () => {
    terminateGameForSocket(socket.id);
  });

  socket.on('submitBoard', ({ gameId, board, pieces }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('matchError', { message: 'Game no longer exists.' });
      return;
    }
    const hasValidCells = board && typeof board === 'object' && board.cells && typeof board.cells === 'object';
    if (!hasValidCells || !Array.isArray(pieces)) {
      socket.emit('matchError', { message: 'Invalid board submission.' });
      return;
    }
    const player = game.players[socket.id];
    if (!player) {
      socket.emit('matchError', { message: 'Player not in game.' });
      return;
    }
    player.board = board;
    player.ready = true;
    player.destroyed = [];
    game.lastUpdate = Date.now();
    socket.join(game.id);
    io.to(game.id).emit('playerReady', { socketId: socket.id });
    const allReady = Object.values(game.players).every((p) => p.ready);
    if (allReady) {
      game.started = true;
      if (!Array.isArray(game.order) || game.order.length === 0) {
        const playerIds = Object.keys(game.players);
        game.order = playerIds.sort(() => Math.random() - 0.5);
        game.currentTurn = game.order[0] || null;
      }
      io.to(game.id).emit('setupComplete');
      if (game.currentTurn) {
        io.to(game.id).emit('turnStart', {
          currentTurn: game.currentTurn,
          order: game.order,
        });
      }
      io.to(game.id).emit('gameState', serializeGame(game));
    }
  });

  socket.on('joinGameRoom', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('matchError', { message: 'Game not found.' });
      return;
    }
    socket.join(gameId);
    socket.emit('gameState', serializeGame(game));
  });

  socket.on('dieRoll', ({ gameId, value }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('matchError', { message: 'Game not found.' });
      return;
    }
    const player = game.players[socket.id];
    if (!player) {
      socket.emit('matchError', { message: 'Player not part of game.' });
      return;
    }
    const rollValue = Number(value);
    if (!Number.isInteger(rollValue) || rollValue < 1 || rollValue > 20) {
      socket.emit('matchError', { message: 'Invalid die roll.' });
      return;
    }
    player.dieRoll = rollValue;
    game.history.push({ type: 'die-roll', player: player.name, value: rollValue });
    const rolls = Object.values(game.players).map((p) => p.dieRoll);
    if (rolls.every((v) => typeof v === 'number')) {
      if (rolls[0] === rolls[1]) {
        Object.values(game.players).forEach((p) => {
          p.dieRoll = null;
        });
        io.to(game.id).emit('diceTie');
      } else {
        game.order = Object.values(game.players)
          .sort((a, b) => b.dieRoll - a.dieRoll)
          .map((p) => p.socketId);
        game.currentTurn = game.order[0];
        io.to(game.id).emit('turnStart', {
          currentTurn: game.currentTurn,
          order: game.order,
        });
      }
    }
    io.to(game.id).emit('gameState', serializeGame(game));
  });

  socket.on('attack', ({ gameId, coordinate }) => {
    const game = games.get(gameId);
    if (!game || !coordinate) {
      socket.emit('matchError', { message: 'Game/coordinate invalid.' });
      return;
    }
    if (game.currentTurn !== socket.id) {
      socket.emit('matchError', { message: 'Not your turn.' });
      return;
    }
    const player = game.players[socket.id];
    const opponentEntry = Object.entries(game.players).find(([id]) => id !== socket.id);
    if (!opponentEntry) {
      socket.emit('matchError', { message: 'Opponent missing.' });
      return;
    }
    const [opponentId, opponent] = opponentEntry;
    if (player.shots.has(coordinate)) {
      socket.emit('matchError', { message: 'Coordinate already targeted.' });
      return;
    }
    player.shots.add(coordinate);
    const result = resolveAttack({ opponent, coordinate });
    game.history.push({
      type: 'attack',
      attacker: player.name,
      coordinate,
      result,
      timestamp: Date.now(),
    });
    if (result.destroyedUnit) {
      opponent.destroyed.push(result.destroyedUnit);
    }
    if (result.victory) {
      game.winner = socket.id;
      io.to(game.id).emit('gameOver', {
        winner: socket.id,
        winnerName: player.name,
        coordinate,
        result,
      });
    } else {
      const currentIdx = game.order.indexOf(game.currentTurn);
      const nextIdx = (currentIdx + 1) % game.order.length;
      game.currentTurn = game.order[nextIdx];
      io.to(game.id).emit('turnStart', {
        currentTurn: game.currentTurn,
        order: game.order,
      });
    }
    game.lastUpdate = Date.now();
    io.to(game.id).emit('attackResult', {
      attacker: socket.id,
      coordinate,
      result,
    });
    io.to(game.id).emit('gameState', serializeGame(game));
  });

  socket.on('saveMultiplayer', ({ gameId, playerName }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('matchError', { message: 'Game not found for saving.' });
      return;
    }
    savedGames[playerName] = {
      mode: 'pvp-online',
      game: serializeGame(game),
      updatedAt: new Date().toISOString(),
    };
    persistSaves();
    socket.emit('saved', { success: true });
  });

  socket.on('disconnect', () => {
    resetGameIfIncomplete(socket.id);
    players.delete(socket.id);
    broadcastPlayerList();
  });
});

function resolveAttack({ opponent, coordinate }) {
  const normalized = String(coordinate).toUpperCase();
  const board = opponent.board;
  if (!board || !board.cells) {
    return { hit: false, coordinate: normalized };
  }
  const cell = board.cells[normalized];
  if (!cell) {
    return { hit: false, coordinate: normalized };
  }
  cell.hit = true;
  const unitRecord = board.units?.find((unit) => unit.coordinates.includes(normalized));
  let destroyedUnit = null;
  if (unitRecord) {
    const destroyed = unitRecord.coordinates.every((coord) => board.cells[coord]?.hit);
    if (destroyed) {
      destroyedUnit = unitRecord.name;
    }
  }
  const hit = Boolean(cell.occupant);
  const allUnits = board.units || [];
  const victory =
    hit &&
    allUnits.length > 0 &&
    allUnits.every((unit) => unit.coordinates.every((coord) => board.cells[coord]?.hit));
  return {
    hit,
    coordinate: normalized,
    destroyedUnit,
    victory,
  };
}

server.listen(PORT, () => {
  console.log(`GridOps server running on http://localhost:${PORT}`);
});
