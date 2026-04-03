import { GameMode, Player, Room } from '../types';
import { RoomEntity } from './Room';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_EXPIRY_MS = 2 * 60 * 60 * 1000; // 2 hours

export class RoomManager {
  private rooms: Map<string, RoomEntity> = new Map();

  createRoom(hostId: string, nickname: string): RoomEntity {
    const code = this.generateCode();
    const host: Player = {
      id: hostId,
      nickname,
      isHost: true,
      score: 0,
      guessCount: 0,
      joinedAt: Date.now(),
      connected: true,
    };

    const roomData: Room = {
      code,
      hostId,
      mode: 'competitive',
      status: 'lobby',
      players: new Map([[hostId, host]]),
      game: null,
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    const room = new RoomEntity(roomData);
    this.rooms.set(code, room);
    return room;
  }

  joinRoom(code: string, playerId: string, nickname: string): RoomEntity | Error {
    const room = this.rooms.get(code);
    if (!room) return new Error('Sala não encontrada');

    // Re-join: player is already in the room (e.g., creator navigating to room page)
    if (room.data.players.has(playerId)) {
      room.setPlayerConnected(playerId, true);
      return room;
    }

    if (room.data.status !== 'lobby') return new Error('A partida já começou');
    if (room.data.players.size >= 8) return new Error('Sala cheia (máximo 8 jogadores)');

    const nicknameInUse = [...room.data.players.values()].some(
      (p) => p.nickname.toLowerCase() === nickname.toLowerCase() && p.connected
    );
    if (nicknameInUse) return new Error('Apelido já em uso nesta sala');

    const player: Player = {
      id: playerId,
      nickname,
      isHost: false,
      score: 0,
      guessCount: 0,
      joinedAt: Date.now(),
      connected: true,
    };

    room.addPlayer(player);
    return room;
  }

  getRoom(code: string): RoomEntity | undefined {
    return this.rooms.get(code);
  }

  getRoomByPlayerId(playerId: string): RoomEntity | undefined {
    for (const room of this.rooms.values()) {
      if (room.data.players.has(playerId)) return room;
    }
    return undefined;
  }

  removePlayer(playerId: string): { room: RoomEntity; wasHost: boolean } | null {
    const room = this.getRoomByPlayerId(playerId);
    if (!room) return null;

    const wasHost = room.data.hostId === playerId;
    room.setPlayerConnected(playerId, false);

    // If game is in lobby and player disconnects, remove them fully
    if (room.data.status === 'lobby') {
      room.removePlayer(playerId);
    }

    return { room, wasHost };
  }

  cleanupExpiredRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms.entries()) {
      if (now - room.data.lastActivityAt > ROOM_EXPIRY_MS) {
        this.rooms.delete(code);
      }
    }
  }

  generateCode(): string {
    let code: string;
    do {
      code = Array.from({ length: 6 }, () =>
        CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
      ).join('');
    } while (this.rooms.has(code));
    return code;
  }
}
