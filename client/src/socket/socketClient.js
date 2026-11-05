import { io } from 'socket.io-client';

const SERVER_URL = (import.meta.env.VITE_SERVER_URL || '').replace(/\/$/, '') || (typeof window !== 'undefined' ? window.location.origin : '');

let socket = null;
let initData = null;

export function getInitData() {
  return initData;
}

export function setInitData(data) {
  initData = data;
}

export function getSocket() {
  return socket;
}

export function connectSocket(telegramInitData) {
  if (socket?.connected) return socket;

  initData = telegramInitData;

  socket = io(SERVER_URL, {
    auth: { initData: telegramInitData },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000
  });

  socket.on('connect', () => {
    console.log('Socket connected:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.error('Socket connection error:', err.message);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export default { getSocket, connectSocket, disconnectSocket, getInitData, setInitData };

