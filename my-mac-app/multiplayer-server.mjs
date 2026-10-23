import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';

const port = Number(process.env.PORT ?? 1420);
const distDirectory = resolve('dist');
const rooms = new Map();
const peers = new WeakMap();
const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
};

function send(socket, message) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function closeRoom(roomCode, disconnectedSocket) {
  const room = rooms.get(roomCode);
  if (!room) return;

  if (room.host === disconnectedSocket) {
    send(room.guest, { type: 'host-left' });
    room.guest?.close(1000, '房主已断开');
    rooms.delete(roomCode);
  } else if (room.guest === disconnectedSocket) {
    room.guest = null;
    send(room.host, { type: 'guest-left' });
  }
}

const server = createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', `http://${request.headers.host}`).pathname);
  } catch {
    response.writeHead(400).end('Bad request');
    return;
  }

  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = resolve(distDirectory, `.${requestedPath}`);
  if (filePath !== distDirectory && !filePath.startsWith(`${distDirectory}${sep}`)) {
    response.writeHead(403).end('Forbidden');
    return;
  }

  try {
    if (!statSync(filePath).isFile()) throw new Error('Not a file');
  } catch {
    response.writeHead(404).end('Not found. Build the app with npm run build first.');
    return;
  }

  response.writeHead(200, { 'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream' });
  createReadStream(filePath).pipe(response);
});

const webSocketServer = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
server.on('upgrade', (request, socket, head) => {
  if (request.url !== '/multiplayer') {
    socket.destroy();
    return;
  }
  webSocketServer.handleUpgrade(request, socket, head, webSocket => {
    webSocketServer.emit('connection', webSocket);
  });
});

webSocketServer.on('connection', socket => {
  socket.on('message', rawMessage => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch {
      send(socket, { type: 'error', message: '无效的网络消息' });
      return;
    }

    if (message.type === 'host') {
      const roomCode = randomBytes(3).toString('hex').toUpperCase();
      rooms.set(roomCode, { host: socket, guest: null });
      peers.set(socket, { role: 'host', roomCode });
      send(socket, { type: 'room-created', roomCode });
      return;
    }

    if (message.type === 'join') {
      const roomCode = String(message.roomCode ?? '').trim().toUpperCase();
      const room = rooms.get(roomCode);
      if (!room) {
        send(socket, { type: 'error', message: '房间不存在，请检查房间码。' });
        return;
      }
      if (room.guest) {
        send(socket, { type: 'error', message: '房间已满。' });
        return;
      }
      room.guest = socket;
      peers.set(socket, { role: 'guest', roomCode });
      send(socket, { type: 'joined', roomCode });
      send(room.host, { type: 'guest-joined' });
      return;
    }

    const peer = peers.get(socket);
    const room = peer ? rooms.get(peer.roomCode) : null;
    if (!peer || !room) {
      send(socket, { type: 'error', message: '请先创建或加入房间。' });
      return;
    }
    if (peer.role === 'host' && message.type === 'state' && room.guest) {
      send(room.guest, message);
    } else if (peer.role === 'guest' && message.type === 'input') {
      send(room.host, message);
    }
  });

  socket.on('close', () => {
    const peer = peers.get(socket);
    if (peer) closeRoom(peer.roomCode, socket);
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`LAN game server listening on http://0.0.0.0:${port}`);
  console.log('On the host device open http://localhost:%d; on the guest device use the host LAN IP.', port);
});
