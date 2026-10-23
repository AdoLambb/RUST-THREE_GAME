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
    this.connect('guest', { type: 'join', roomCode });
  }

  sendInput(payload: MultiplayerInput) {
    this.send({ type: 'input', payload });
  }

  sendState(payload: MultiplayerState) {
    this.send({ type: 'state', payload });
  }

  close() {
    this.socket?.close();
    this.socket = null;
    this.role = null;
    this.connected = false;
    this.guestConnected = false;
  }

  private connect(role: MultiplayerRole, message: { type: string; roomCode?: string }) {
    this.close();
    this.role = role;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${location.host}/multiplayer`);
    this.socket = socket;
    socket.addEventListener('open', () => socket.send(JSON.stringify(message)));
    socket.addEventListener('message', event => {
      let response: MultiplayerMessage;
      try {
        response = JSON.parse(String(event.data)) as MultiplayerMessage;
      } catch (error) {
        console.error('无法解析联机消息。', error);
        this.onStatus('收到无效的联机消息。');
        return;
      }
      this.handleMessage(response);
    });
    socket.addEventListener('error', () => {
      this.onStatus('联机连接失败。请确认房主服务器已启动并检查网络。');
    });
    socket.addEventListener('close', () => {
      if (this.socket === socket) {
        this.connected = false;
        this.onStatus('联机已断开。');
      }
    });
  }

  private send(message: { type: string; payload?: MultiplayerInput | MultiplayerState }) {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify(message));
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
