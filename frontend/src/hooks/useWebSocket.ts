import { useEffect, useState } from 'react';
import { createWebSocket } from '../services/api';

interface ProgressData {
  progress: number;
  files_processed: number;
  files_total: number;
  current_file?: string;
}

export const useWebSocket = (scanId: string | null) => {
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!scanId) return;

    const ws = createWebSocket(scanId);

    ws.onopen = () => setConnected(true);
    
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'progress') {
        setProgress(message.data);
      }
    };

    ws.onclose = () => setConnected(false);

    return () => ws.close();
  }, [scanId]);

  return { progress, connected };
};
