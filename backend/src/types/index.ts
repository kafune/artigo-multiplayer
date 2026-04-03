export type GameMode = 'competitive' | 'cooperative';
export type RoomStatus = 'lobby' | 'playing' | 'finished';

export interface Player {
  id: string;
  nickname: string;
  isHost: boolean;
  score: number;
  guessCount: number;
  joinedAt: number;
  connected: boolean;
}

export interface ArticleToken {
  id: number;
  surface: string;
  word: string | null;
  isStopword: boolean;
  isRevealed: boolean;
  isTitle: boolean;
}

export interface GuessRecord {
  playerId: string;
  playerNickname: string;
  word: string;
  normalizedWord: string;
  timestamp: number;
  matchCount: number;
  isWinningGuess: boolean;
}

export interface GameState {
  articleTitle: string;
  normalizedTitle: string;
  tokens: ArticleToken[];
  guesses: GuessRecord[];
  startedAt: number;
  endedAt: number | null;
  winnerId: string | null;
  winnerNickname: string | null;
  articleUrl: string;
}

export interface ClientGameState {
  tokens: ArticleToken[];
  guesses: GuessRecord[];
  startedAt: number;
  endedAt: number | null;
  winnerId: string | null;
  winnerNickname: string | null;
  articleUrl: string | null;
  revealedCount: number;
  totalHiddenCount: number;
}

export interface Room {
  code: string;
  hostId: string;
  mode: GameMode;
  status: RoomStatus;
  players: Map<string, Player>;
  game: GameState | null;
  createdAt: number;
  lastActivityAt: number;
}

export interface ClientRoom {
  code: string;
  hostId: string;
  mode: GameMode;
  status: RoomStatus;
  players: Player[];
  gameState: ClientGameState | null;
}

// Socket event payloads — Client → Server
export interface CreateRoomPayload { nickname: string }
export interface JoinRoomPayload { code: string; nickname: string }
export interface SetModePayload { mode: GameMode }
export interface GuessPayload { word: string }

// Socket event payloads — Server → Client
export interface GuessResultPayload {
  guessRecord: GuessRecord;
  revealedTokenIds: number[];
  clientGameState: ClientGameState;
}

export interface GameOverPayload {
  winnerId: string | null;
  winnerNickname: string | null;
  articleTitle: string;
  articleUrl: string;
  finalGuesses: GuessRecord[];
}
