import React from 'react';
import { Dashboard } from './components/Dashboard';
import { ProtectedRoute } from './components/ProtectedRoute';
import { ErrorBoundary } from './components/ErrorBoundary';
import { useWebSocket } from './hooks/useWebSocket';
import './index.css';

export const App: React.FC = () => {
  // Initialize WebSocket on mount
  useWebSocket();

  return (
    <ErrorBoundary>
      <div className="h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
        <ProtectedRoute>
          <Dashboard />
        </ProtectedRoute>
      </div>
    </ErrorBoundary>
  );
};

export default App;
