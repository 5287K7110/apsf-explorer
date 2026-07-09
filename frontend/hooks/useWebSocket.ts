import { useEffect, useCallback, useRef } from 'react';
import { wsClient } from '../utils/wsClient';
import { useRunStore } from '../store/runStore';

export function useWebSocket() {
  const isConnected = useRef(false);
  const updateRun = useRunStore((state) => state.updateRun);
  const updateRunPhase = useRunStore((state) => state.updateRunPhase);
  const setConnectionStatus = useRunStore((state) => state.setConnectionStatus);
  const connectionStatus = useRunStore((state) => state.connectionStatus);

  useEffect(() => {
    const connectAndListen = async () => {
      try {
        // Note: In development, WebSocket connection may fail gracefully
        // The app will continue to work with mock data
        try {
          await wsClient.connect();
          isConnected.current = true;
          setConnectionStatus('connected');
        } catch (wsError) {
          console.warn('WebSocket connection unavailable (development mode):', wsError);
          setConnectionStatus('disconnected');
          return;
        }

        // Listen for run updates
        wsClient.on('run-updated', (data: any) => {
          console.debug('Run updated via WebSocket:', data);
          updateRun(data.runId, data.updates);
        });

        // Listen for phase progress
        wsClient.on('phase-progress', (data: any) => {
          console.debug('Phase progress via WebSocket:', data);
          updateRunPhase(data.runId, data.phase, data.progress);
        });

        // Listen for errors
        wsClient.on('error', (error: any) => {
          console.error('WebSocket error event:', error);
          setConnectionStatus('error');
        });

        // Listen for disconnect
        wsClient.on('disconnect', () => {
          isConnected.current = false;
          setConnectionStatus('disconnected');
        });
      } catch (error) {
        console.error('WebSocket initialization failed:', error);
        setConnectionStatus('error');
      }
    };

    connectAndListen();

    return () => {
      wsClient.disconnect();
    };
  }, [updateRun, updateRunPhase, setConnectionStatus]);

  const sendMessage = useCallback((type: string, data: any) => {
    if (isConnected.current) {
      wsClient.send({ type, data });
    } else {
      console.warn('WebSocket not connected, message not sent:', type);
    }
  }, []);

  return {
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    sendMessage,
  };
}
