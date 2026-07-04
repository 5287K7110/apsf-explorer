import React from 'react';

export const PhaseIndicatorSkeleton: React.FC = () => {
  return (
    <div className="bg-slate-800 rounded p-3 animate-pulse border border-slate-700">
      <div className="h-4 bg-slate-700 rounded w-24 mb-2"></div>
      <div className="h-2 bg-slate-700 rounded w-full"></div>
    </div>
  );
};

export const RunListSkeleton: React.FC = () => {
  return (
    <div className="space-y-2">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="bg-slate-800 rounded p-3 animate-pulse h-16 border border-slate-700"
        ></div>
      ))}
    </div>
  );
};

export const RunDetailSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      <div className="bg-slate-800 rounded p-4 animate-pulse border border-slate-700">
        <div className="h-6 bg-slate-700 rounded w-1/3 mb-2"></div>
        <div className="h-4 bg-slate-700 rounded w-full mb-2"></div>
        <div className="h-4 bg-slate-700 rounded w-2/3"></div>
      </div>
      <div className="bg-slate-800 rounded p-4 animate-pulse border border-slate-700 h-40"></div>
    </div>
  );
};

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 p-4">
      <PhaseIndicatorSkeleton />
      <RunListSkeleton />
      <RunDetailSkeleton />
    </div>
  );
};
