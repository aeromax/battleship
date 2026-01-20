const fs = require('fs');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
  },
});

const PORT = process.env.PORT || 4000;
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

function createGameRecord({ creatorId, opponentId }) {
  const id = uuidv4();
  const createdAt = Date.now();
  const record = {
    id,
    createdAt,
    mode: 'pvp',
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

function resetGameIfIncomplete(socketId) {
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
      io.to(opponentId).emit('opponentLeft');
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
    if (challenger.status !== 'online' || opponent.status !== 'online') {
      socket.emit('matchError', { message: 'Either player is busy.' });
      return;
    }
    const game = createGameRecord({ creatorId: socket.id, opponentId });
    challenger.status = 'in_game';
    opponent.status = 'in_game';
    challenger.currentGameId = game.id;
    opponent.currentGameId = game.id;
    players.set(socket.id, challenger);
    players.set(opponentId, opponent);
    [socket.id, opponentId].forEach((id) => {
      io.to(id).emit('matchStarted', {
        gameId: game.id,
        opponentName: id === socket.id ? opponent.name : challenger.name,
      });
    });
    broadcastPlayerList();
  });

  socket.on('cancelMatch', () => {
    resetGameIfIncomplete(socket.id);
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
      io.to(game.id).emit('setupComplete');
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
  const allUnits = board.units || [];
  const victory = allUnits.length > 0 && allUnits.every((unit) =>
    unit.coordinates.every((coord) => board.cells[coord]?.hit)
  );
  return {
    hit: true,
    coordinate: normalized,
    destroyedUnit,
    victory,
  };
}

server.listen(PORT, () => {
  console.log(`GridOps server running on http://localhost:${PORT}`);
});
