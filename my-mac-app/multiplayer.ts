export type MultiplayerRole = 'host' | 'guest';

export interface MultiplayerInput {
  move: { x: number; z: number };
  boost: boolean;
  fire?: { x: number; y: number; z: number };
}

export interface TankSnapshot {
  typeId: 'light' | 'medium' | 'heavy';
  x: number;
  y: number;
  z: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  turretRotationY: number;
  hp: number;
}

export interface MultiplayerState {
  tanks: [TankSnapshot, TankSnapshot];
  bullets: Array<{ id: number; x: number; y: number; z: number; isEnemy: boolean }>;
  obstacles: Array<{ health: number; destroyed: boolean }>;
}

type MultiplayerMessage =
  | { type: 'room-created'; roomCode: string }
  | { type: 'joined'; roomCode: string }
  | { type: 'guest-joined' }
  | { type: 'guest-left' }
  | { type: 'host-left' }
  | { type: 'error'; message: string }
  | { type: 'input'; payload: MultiplayerInput }
  | { type: 'state'; payload: MultiplayerState };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isInput(value: unknown): value is MultiplayerInput {
  if (!isRecord(value) || !isRecord(value.move)) return false;
  if (!isFiniteNumber(value.move.x) || !isFiniteNumber(value.move.z) || typeof value.boost !== 'boolean') {
    return false;
  }
  if (value.fire === undefined) return true;
  return isRecord(value.fire) &&
    isFiniteNumber(value.fire.x) &&
    isFiniteNumber(value.fire.y) &&
    isFiniteNumber(value.fire.z);
}

function isTankSnapshot(value: unknown): value is TankSnapshot {
  if (!isRecord(value)) return false;
  return (value.typeId === 'light' || value.typeId === 'medium' || value.typeId === 'heavy') &&
    isFiniteNumber(value.x) &&
    isFiniteNumber(value.y) &&
    isFiniteNumber(value.z) &&
    isFiniteNumber(value.rotationX) &&
    isFiniteNumber(value.rotationY) &&
    isFiniteNumber(value.rotationZ) &&
    isFiniteNumber(value.turretRotationY) &&
    isFiniteNumber(value.hp);
}

function isMultiplayerState(value: unknown): value is MultiplayerState {
  if (!isRecord(value) || !Array.isArray(value.tanks) || value.tanks.length !== 2) return false;
  if (!value.tanks.every(isTankSnapshot) || !Array.isArray(value.bullets) || value.bullets.length > 512) {
    return false;
  }
  if (!value.bullets.every(bullet =>
    isRecord(bullet) &&
    isFiniteNumber(bullet.id) &&
    isFiniteNumber(bullet.x) &&
    isFiniteNumber(bullet.y) &&
    isFiniteNumber(bullet.z) &&
    typeof bullet.isEnemy === 'boolean'
  )) return false;
  return Array.isArray(value.obstacles) &&
    value.obstacles.length <= 512 &&
    value.obstacles.every(obstacle =>
      isRecord(obstacle) &&
      isFiniteNumber(obstacle.health) &&
      typeof obstacle.destroyed === 'boolean'
    );
}

function isMultiplayerMessage(value: unknown): value is MultiplayerMessage {
  if (!isRecord(value) || typeof value.type !== 'string') return false;
  switch (value.type) {
    case 'room-created':
    case 'joined':
      return typeof value.roomCode === 'string' && value.roomCode.length > 0;
    case 'guest-joined':
    case 'guest-left':
    case 'host-left':
      return true;
    case 'error':
      return typeof value.message === 'string';
    case 'input':
      return isInput(value.payload);
    case 'state':
      return isMultiplayerState(value.payload);
    default:
      return false;
  }
}

export class MultiplayerSession {
  role: MultiplayerRole | null = null;
  roomCode = '';
  connected = false;
  guestConnected = false;
  onStatus: (message: string) => void = () => {};
  onInput: (input: MultiplayerInput) => void = () => {};
  onState: (state: MultiplayerState) => void = () => {};

  private socket: WebSocket | null = null;

  host() {
    this.connect('host', { type: 'host' });
  }

  join(roomCode: string) {
    const normalizedRoomCode = roomCode.trim().toUpperCase();
    if (!normalizedRoomCode) {
      this.onStatus('请输入房间码。');
      return;
    }
    this.connect('guest', { type: 'join', roomCode: normalizedRoomCode });
  }

  sendInput(payload: MultiplayerInput): boolean {
    if (this.role !== 'guest' || !isInput(payload)) return false;
    return this.send({ type: 'input', payload });
  }

  sendState(payload: MultiplayerState): boolean {
    if (this.role !== 'host' || !isMultiplayerState(payload)) return false;
    return this.send({ type: 'state', payload });
  }

  close() {
    const socket = this.socket;
    this.socket = null;
    this.role = null;
    this.roomCode = '';
    this.connected = false;
    this.guestConnected = false;
    socket?.close();
  }

  private connect(role: MultiplayerRole, message: { type: string; roomCode?: string }) {
    this.close();
    this.role = role;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    let socket: WebSocket;
    try {
      socket = new WebSocket(`${protocol}//${location.host}/multiplayer`);
    } catch (error) {
      this.role = null;
      console.error('无法建立联机连接。', error);
      this.onStatus('联机连接失败。请确认房主服务器已启动并检查网络。');
      return;
    }
    this.socket = socket;
    socket.addEventListener('open', () => {
      if (this.socket !== socket) return;
      try {
        socket.send(JSON.stringify(message));
      } catch (error) {
        console.error('无法发送联机请求。', error);
        this.onStatus('发送联机请求失败。');
      }
    });
    socket.addEventListener('message', event => {
      if (this.socket !== socket) return;
      let response: unknown;
      try {
        response = JSON.parse(String(event.data));
      } catch (error) {
        console.error('无法解析联机消息。', error);
        this.onStatus('收到无效的联机消息。');
        return;
      }
      if (!isMultiplayerMessage(response)) {
        this.onStatus('收到无效的联机消息。');
        return;
      }
      this.handleMessage(response);
    });
    socket.addEventListener('error', () => {
      if (this.socket !== socket) return;
      this.onStatus('联机连接失败。请确认房主服务器已启动并检查网络。');
    });
    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        this.socket = null;
        this.role = null;
        this.roomCode = '';
        this.connected = false;
        this.guestConnected = false;
        this.onStatus('联机已断开。');
      }
    });
  }

  private send(message: { type: string; payload: MultiplayerInput | MultiplayerState }): boolean {
    const socket = this.socket;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    try {
      socket.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('无法发送联机数据。', error);
      this.onStatus('发送联机数据失败。');
      return false;
    }
  }

  private handleMessage(message: MultiplayerMessage) {
    switch (message.type) {
      case 'room-created':
        this.roomCode = message.roomCode;
        this.connected = true;
        this.onStatus(`房间 ${this.roomCode} 已创建，等待对手加入。`);
        break;
      case 'joined':
        this.roomCode = message.roomCode;
        this.connected = true;
        this.onStatus(`已加入房间 ${this.roomCode}，正在同步对局。`);
        break;
      case 'guest-joined':
        this.guestConnected = true;
        this.onStatus(`对手已加入房间 ${this.roomCode}。`);
        break;
      case 'guest-left':
        this.guestConnected = false;
        this.onStatus('对手已断开连接。');
        break;
      case 'host-left':
        this.connected = false;
        this.onStatus('房主已断开连接。');
        break;
      case 'error':
        this.onStatus(message.message);
        break;
      case 'input':
        if (this.role === 'host') this.onInput(message.payload);
        break;
      case 'state':
        if (this.role === 'guest') this.onState(message.payload);
        break;
    }
  }
}
