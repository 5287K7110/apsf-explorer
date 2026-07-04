import React from 'react';
import { useRunStore } from '../store/runStore';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp, Target, Zap } from 'lucide-react';

export const Analytics: React.FC = () => {
  const runs = useRunStore((state) => state.runs);

  // Calculate stats
  const successRuns = runs.filter((r) => r.status === 'success').length;
  const failedRuns = runs.filter((r) => r.status === 'failed').length;
  const runningRuns = runs.filter((r) => r.status === 'running').length;

  const successRate = runs.length > 0 ? (successRuns / runs.length) * 100 : 0;
  const avgProgress =
    runs.length > 0
      ? Math.round(runs.reduce((sum, r) => sum + r.progress, 0) / runs.length)
      : 0;
  const avgACProgress =
    runs.length > 0
      ? Math.round(
          runs.reduce((sum, r) => sum + r.acProgress, 0) / runs.length
        )
      : 0;

  // Status distribution data
  const statusData = [
    { name: 'Success', value: successRuns, color: '#22c55e' },
    { name: 'Failed', value: failedRuns, color: '#ef4444' },
    { name: 'Running', value: runningRuns, color: '#eab308' },
  ];

  // Progress distribution
  const progressBuckets = [
    { range: '0-25%', count: runs.filter((r) => r.progress <= 25).length },
    {
      range: '25-50%',
      count: runs.filter((r) => r.progress > 25 && r.progress <= 50).length,
    },
    {
      range: '50-75%',
      count: runs.filter((r) => r.progress > 50 && r.progress <= 75).length,
    },
    {
      range: '75-100%',
      count: runs.filter((r) => r.progress > 75).length,
    },
  ];

  // Domain distribution
  const domainCounts: Record<string, number> = {};
  runs.forEach((r) => {
    domainCounts[r.domain] = (domainCounts[r.domain] || 0) + 1;
  });

  const domainData = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain, count }))
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {/* Key metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">Success Rate</p>
            <TrendingUp className="h-5 w-5 text-success-400" />
          </div>
          <p className="text-3xl font-bold text-success-400">
            {Math.round(successRate)}%
          </p>
          <p className="text-xs text-slate-500">
            {successRuns} successful runs
          </p>
        </div>

        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">Avg Progress</p>
            <Target className="h-5 w-5 text-primary-400" />
          </div>
          <p className="text-3xl font-bold text-primary-400">{avgProgress}%</p>
          <p className="text-xs text-slate-500">Average completion</p>
        </div>

        <div className="card space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-400">AC Progress</p>
            <Zap className="h-5 w-5 text-warning-400" />
          </div>
          <p className="text-3xl font-bold text-warning-400">{avgACProgress}%</p>
          <p className="text-xs text-slate-500">Average criteria met</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status distribution pie chart */}
        <div className="card">
          <h3 className="mb-4 text-lg font-semibold text-slate-100">
            Run Status Distribution
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {statusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Progress distribution */}
        <div className="card">
          <h3 className="mb-4 text-lg font-semibold text-slate-100">
            Progress Distribution
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={progressBuckets}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis dataKey="range" stroke="#94a3b8" />
              <YAxis stroke="#94a3b8" />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Domain distribution */}
        <div className="card lg:col-span-2">
          <h3 className="mb-4 text-lg font-semibold text-slate-100">
            Runs by Domain
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart
              data={domainData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 200, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
              <XAxis type="number" stroke="#94a3b8" />
              <YAxis dataKey="domain" type="category" stroke="#94a3b8" width={190} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#1e293b',
                  border: '1px solid #475569',
                }}
                labelStyle={{ color: '#e2e8f0' }}
              />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Stats table */}
      <div className="card space-y-4">
        <h3 className="text-lg font-semibold text-slate-100">Summary Stats</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700">
                <th className="text-left py-2 px-4 text-slate-400 font-medium">
                  Metric
                </th>
                <th className="text-right py-2 px-4 text-slate-400 font-medium">
                  Value
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-700/50">
                <td className="py-2 px-4 text-slate-300">Total Runs</td>
                <td className="text-right py-2 px-4 text-slate-100 font-semibold">
                  {runs.length}
                </td>
              </tr>
              <tr className="border-b border-slate-700/50">
                <td className="py-2 px-4 text-slate-300">Successful</td>
                <td className="text-right py-2 px-4 text-success-400 font-semibold">
                  {successRuns}
                </td>
              </tr>
              <tr className="border-b border-slate-700/50">
                <td className="py-2 px-4 text-slate-300">Failed</td>
                <td className="text-right py-2 px-4 text-error-400 font-semibold">
                  {failedRuns}
                </td>
              </tr>
              <tr>
                <td className="py-2 px-4 text-slate-300">Currently Running</td>
                <td className="text-right py-2 px-4 text-warning-400 font-semibold">
                  {runningRuns}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
