import { useEffect, useRef, useState } from 'react';
import { io as socketIo } from 'socket.io-client';

const apiBase = import.meta.env.VITE_API_URL || undefined;

let sharedSocket = null;
function getSharedSocket() {
  if (!sharedSocket) {
    sharedSocket = socketIo(apiBase, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });
  }
  return sharedSocket;
}

/**
 * useSocket — subscribe to socket.io events with auto join/leave of rooms.
 *
 * @param {Object} opts
 * @param {string[]} opts.rooms - Generic rooms (joined via 'join-room')
 * @param {string} [opts.userId] - User ID (joined as `user-${userId}`)
 * @param {string} [opts.patientId] - Patient ID (joined as `patient-${patientId}`)
 * @param {string} [opts.department] - Dept (joined as `dept-${department}`)
 * @param {boolean} [opts.reception] - Join 'reception' room
 * @param {Object<string,Function>} opts.events - { eventName: handler }
 * @returns {{ connected: boolean, socket: any }}
 */
export function useSocket({ rooms = [], userId, patientId, department, reception, events = {} } = {}) {
  const [connected, setConnected] = useState(false);
  const socketRef = useRef(null);
  const handlersRef = useRef(events);
  handlersRef.current = events;

  useEffect(() => {
    const socket = getSharedSocket();
    socketRef.current = socket;

    const onConnect = () => {
      setConnected(true);
      rooms.forEach(r => r && socket.emit('join-room', r));
      if (userId) socket.emit('join-user', userId);
      if (patientId) socket.emit('join-patient', patientId);
      if (department) socket.emit('join-dept', department);
      if (reception) socket.emit('join-reception');
    };
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    if (socket.connected) onConnect();

    // Wrap every handler to read the latest from handlersRef so closures stay fresh
    const wrappers = {};
    Object.keys(events).forEach(eventName => {
      wrappers[eventName] = (...args) => {
        const fn = handlersRef.current[eventName];
        if (typeof fn === 'function') fn(...args);
      };
      socket.on(eventName, wrappers[eventName]);
    });

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      Object.keys(wrappers).forEach(eventName => socket.off(eventName, wrappers[eventName]));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, patientId, department, reception, JSON.stringify(rooms), JSON.stringify(Object.keys(events))]);

  return { connected, socket: socketRef.current };
}

export default useSocket;
