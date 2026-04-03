import cors from 'cors';
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import { PORTUGUESE_STOPWORDS } from './data/stopwords';
import { GameEngine } from './game/GameEngine';
import { TextProcessor } from './game/TextProcessor';
import { WordNormalizer } from './game/WordNormalizer';
import { RoomManager } from './rooms/RoomManager';
import {
  ClientRoom,
  GameMode,
  GameState,
  GuessPayload,
  JoinRoomPayload,
  SetModePayload,
} from './types';
import { WikipediaFetcher } from './wikipedia/WikipediaFetcher';

const app = express();
const httpServer = createServer(app);

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'http://localhost:3000';

const io = new Server(httpServer, {
  cors: { origin: FRONTEND_URL, methods: ['GET', 'POST'] },
});

app.use(cors({ origin: FRONTEND_URL }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Shared singletons
const normalizer = new WordNormalizer();
const textProcessor = new TextProcessor(PORTUGUESE_STOPWORDS, normalizer);
const fetcher = new WikipediaFetcher();
const gameEngine = new GameEngine(textProcessor, normalizer, fetcher);
const roomManager = new RoomManager();

// Rate limiting map: playerId → last guess timestamp
const lastGuessTime = new Map<string, number>();
const GUESS_RATE_LIMIT_MS = 300;

// Cleanup expired rooms every 30 minutes
setInterval(() => roomManager.cleanupExpiredRooms(), 30 * 60 * 1000);

function toClientRoom(game: GameState | null, buildClientGameState: (gs: GameState) => ReturnType<GameEngine['buildClientGameState']>): (room: InstanceType<typeof import('./rooms/Room').RoomEntity>) => ClientRoom {
  return (room) => room.toClientRoom(buildClientGameState);
}

function buildClientRoom(room: InstanceType<typeof import('./rooms/Room').RoomEntity>): ClientRoom {
  return room.toClientRoom((gs) => gameEngine.buildClientGameState(gs));
}

function registerHandlers(socket: Socket): void {
  // ─── room:create ─────────────────────────────────────────────────────────────
  socket.on('room:create', ({ nickname }: { nickname: string }) => {
    if (!nickname?.trim()) {
      socket.emit('room:error', { message: 'Apelido inválido' });
      return;
    }
    const room = roomManager.createRoom(socket.id, nickname.trim());
    socket.join(room.data.code);
    socket.emit('room:created', { room: buildClientRoom(room) });
  });

  // ─── room:join ────────────────────────────────────────────────────────────────
  socket.on('room:join', ({ code, nickname }: JoinRoomPayload) => {
    if (!nickname?.trim() || !code?.trim()) {
      socket.emit('room:error', { message: 'Dados inválidos' });
      return;
    }
    const result = roomManager.joinRoom(code.trim().toUpperCase(), socket.id, nickname.trim());
    if (result instanceof Error) {
      socket.emit('room:error', { message: result.message });
      return;
    }
    socket.join(result.data.code);
    const clientRoom = buildClientRoom(result);
    socket.emit('room:joined', { room: clientRoom, player: result.data.players.get(socket.id) });
    socket.to(result.data.code).emit('room:updated', { room: clientRoom });
  });

  // ─── room:set_mode ────────────────────────────────────────────────────────────
  socket.on('room:set_mode', ({ mode }: SetModePayload) => {
    const room = roomManager.getRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.data.hostId !== socket.id) {
      socket.emit('room:error', { message: 'Apenas o host pode mudar o modo' });
      return;
    }
    if (!['competitive', 'cooperative'].includes(mode)) {
      socket.emit('room:error', { message: 'Modo inválido' });
      return;
    }
    room.setMode(mode as GameMode);
    io.to(room.data.code).emit('room:updated', { room: buildClientRoom(room) });
  });

  // ─── room:start ───────────────────────────────────────────────────────────────
  socket.on('room:start', async () => {
    const room = roomManager.getRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.data.hostId !== socket.id) {
      socket.emit('room:error', { message: 'Apenas o host pode iniciar' });
      return;
    }
    if (room.data.status !== 'lobby') {
      socket.emit('room:error', { message: 'Partida já iniciada' });
      return;
    }

    try {
      room.setStatus('playing');
      const gameState = await gameEngine.initGame();
      room.setGame(gameState);

      const clientGameState = gameEngine.buildClientGameState(gameState);
      io.to(room.data.code).emit('game:started', { gameState: clientGameState });
    } catch (err) {
      room.setStatus('lobby');
      socket.emit('room:error', { message: 'Falha ao carregar artigo. Tente novamente.' });
      console.error('Error starting game:', err);
    }
  });

  // ─── game:guess ───────────────────────────────────────────────────────────────
  socket.on('game:guess', ({ word }: GuessPayload) => {
    if (!word?.trim()) return;

    // Rate limiting
    const now = Date.now();
    const lastTime = lastGuessTime.get(socket.id) ?? 0;
    if (now - lastTime < GUESS_RATE_LIMIT_MS) return;
    lastGuessTime.set(socket.id, now);

    const room = roomManager.getRoomByPlayerId(socket.id);
    if (!room || room.data.status !== 'playing' || !room.data.game) return;

    const player = room.data.players.get(socket.id);
    if (!player) return;

    const result = gameEngine.processGuess(room.data.game, player, word.trim());
    if (result.alreadyGuessed) return;

    player.guessCount++;

    const clientGameState = gameEngine.buildClientGameState(room.data.game);

    io.to(room.data.code).emit('game:guess_result', {
      guessRecord: result.guessRecord,
      revealedTokenIds: result.revealedTokenIds,
      clientGameState,
    });

    if (result.isWin) {
      room.setStatus('finished');
      // In competitive: record score as guessCount
      if (room.data.mode === 'competitive') {
        player.score = player.guessCount;
      }
      io.to(room.data.code).emit('game:over', {
        winnerId: room.data.game.winnerId,
        winnerNickname: room.data.game.winnerNickname,
        articleTitle: room.data.game.articleTitle,
        articleUrl: room.data.game.articleUrl,
        finalGuesses: room.data.game.guesses,
      });
    }
  });

  // ─── room:leave ───────────────────────────────────────────────────────────────
  socket.on('room:leave', () => handlePlayerLeave(socket));

  // ─── disconnect ───────────────────────────────────────────────────────────────
  socket.on('disconnect', () => handlePlayerLeave(socket));
}

function handlePlayerLeave(socket: Socket): void {
  lastGuessTime.delete(socket.id);
  const result = roomManager.removePlayer(socket.id);
  if (!result) return;

  const { room, wasHost } = result;
  socket.leave(room.data.code);

  if (room.connectedCount === 0) return; // room will expire naturally

  let newHostId: string | null = null;
  if (wasHost && room.data.status === 'lobby') {
    newHostId = room.assignNewHost();
  }

  const clientRoom = buildClientRoom(room);
  io.to(room.data.code).emit('room:updated', { room: clientRoom });
  io.to(room.data.code).emit('room:player_left', {
    playerId: socket.id,
    newHostId,
  });
}

io.on('connection', (socket) => {
  registerHandlers(socket);
});

const PORT = parseInt(process.env.PORT ?? '3001', 10);
httpServer.listen(PORT, () => {
  console.log(`🚀 Backend running on port ${PORT}`);
});
