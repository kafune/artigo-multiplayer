import { ClientGameState, ClientRoom, GameMode, GameState, Player, Room, RoomStatus } from '../types';

export class RoomEntity {
  data: Room;

  constructor(data: Room) {
    this.data = data;
  }

  addPlayer(player: Player): void {
    this.data.players.set(player.id, player);
    this.touch();
  }

  removePlayer(id: string): void {
    this.data.players.delete(id);
    this.touch();
  }

  setPlayerConnected(id: string, connected: boolean): void {
    const player = this.data.players.get(id);
    if (player) {
      player.connected = connected;
      this.touch();
    }
  }

  setMode(mode: GameMode): void {
    this.data.mode = mode;
    this.touch();
  }

  setStatus(status: RoomStatus): void {
    this.data.status = status;
    this.touch();
  }

  setGame(game: GameState | null): void {
    this.data.game = game;
    this.touch();
  }

  assignNewHost(): string | null {
    const connected = [...this.data.players.values()].find(
      (p) => p.connected && p.id !== this.data.hostId
    );
    if (!connected) return null;
    // Demote old host
    const oldHost = this.data.players.get(this.data.hostId);
    if (oldHost) oldHost.isHost = false;
    // Promote new host
    connected.isHost = true;
    this.data.hostId = connected.id;
    this.touch();
    return connected.id;
  }

  get connectedCount(): number {
    return [...this.data.players.values()].filter((p) => p.connected).length;
  }

  toClientRoom(buildClientGameState: (gs: GameState) => ClientGameState): ClientRoom {
    return {
      code: this.data.code,
      hostId: this.data.hostId,
      mode: this.data.mode,
      status: this.data.status,
      players: [...this.data.players.values()],
      gameState: this.data.game ? buildClientGameState(this.data.game) : null,
    };
  }

  private touch(): void {
    this.data.lastActivityAt = Date.now();
  }
}
