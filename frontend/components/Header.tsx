import React from 'react';
import { Moon, Settings, LogOut, Wifi, WifiOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';

interface HeaderProps {
  className?: string;
}

export const Header: React.FC<HeaderProps> = ({ className = '' }) => {
  const { user, logout } = useAuth();
  const { connectionStatus } = useWebSocket();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <header className={`border-b border-slate-700 bg-slate-900 shadow-lg ${className}`}>
      <div className="flex items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
        {/* Logo and Title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-primary-500 to-primary-600">
              <span className="text-sm font-bold text-white">A</span>
            </div>
            <div className="hidden sm:block">
              <h1 className="text-xl font-bold text-slate-100">APSF Viewer</h1>
              <p className="text-xs text-slate-400">Autonomous Problem-Solving</p>
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Connection Status Indicator */}
          <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700">
            {connectionStatus === 'connected' ? (
              <>
                <Wifi size={16} className="text-green-400 animate-pulse" />
                <span className="text-xs text-green-400 hidden sm:inline">Connected</span>
              </>
            ) : (
              <>
                <WifiOff size={16} className="text-yellow-400" />
                <span className="text-xs text-yellow-400 hidden sm:inline">{connectionStatus}</span>
              </>
            )}
          </div>

          {user && (
            <div className="hidden sm:flex items-center gap-3 px-3 py-2 bg-slate-800 rounded-lg border border-slate-700">
              <div className="text-sm">
                <p className="text-slate-200 font-medium">{user.name}</p>
                <p className="text-xs text-slate-400">{user.email}</p>
              </div>
            </div>
          )}
          <button
            className="btn btn-icon btn-ghost"
            aria-label="Theme"
            title="Dark mode"
          >
            <Moon size={18} className="text-slate-400" />
          </button>
          <button
            className="btn btn-icon btn-ghost"
            aria-label="Settings"
          >
            <Settings size={18} className="text-slate-400" />
          </button>
          {user && (
            <button
              onClick={handleLogout}
              className="btn btn-icon btn-ghost text-red-400 hover:text-red-300"
              aria-label="Logout"
              title="Logout"
            >
              <LogOut size={18} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
