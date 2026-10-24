import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Search, Check, X, Ban, CheckCircle2 } from 'lucide-react';
import { User, UserReport, CoinTransaction } from './types';

interface OverviewResponse {
  mongoConnected: boolean;
  botPollingActive: boolean;
  botConfigured: boolean;
  uptimeSeconds: number;
  stats: {
    totalUsers: number;
    activeChats: number;
    queueSize: number;
    bannedUsersCount: number;
    pendingReportsCount: number;
    totalCoinsInCirculation: number;
    totalTransactions: number;
    totalReports: number;
  };
  queuedUsers: Array<{
    userId: number;
    internalId: string;
    name: string;
    gender: string;
    age: number;
    province: string;
    targetGender: string;
    targetAgeMin: number;
    targetAgeMax: number;
  }>;
  users: User[];
  reports: UserReport[];
  transactions: CoinTransaction[];
}

type SectionId = 'overview' | 'users' | 'moderation' | 'ledger';

function formatUptime(totalSeconds: number): string {
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

export default function App() {
  const [activeSection, setActiveSection] = useState<SectionId>('overview');
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState<string>('');
  const [reportFilter, setReportFilter] = useState<'all' | 'pending' | 'resolved'>('all');

  const fetchOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/overview');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload: OverviewResponse = await res.json();
      setData(payload);
    } catch (err: any) {
      setError(err?.message || 'Unable to reach backend status endpoint.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
    const interval = setInterval(fetchOverview, 15000);
    return () => clearInterval(interval);
  }, [fetchOverview]);

  const handleBanToggle = async (userId: number, currentStatus: string) => {
    const endpoint = currentStatus === 'banned' ? '/api/moderation/unban' : '/api/moderation/ban';
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, reason: 'Updated from Admin Console' }),
    });
    fetchOverview();
  };

  const handleResolveReport = async (reportId: number, action: 'ban' | 'dismiss') => {
    await fetch('/api/moderation/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reportId, action, adminName: 'AdminConsole' }),
    });
    fetchOverview();
  };

  const users = data?.users || [];
  const reports = data?.reports || [];
  const transactions = data?.transactions || [];
  const queuedUsers = data?.queuedUsers || [];

  const filteredUsers = users.filter((u) => {
    if (!userSearch.trim()) return true;
    const q = userSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.internal_id.toLowerCase().includes(q) ||
      u.telegram_id.includes(q) ||
      u.province.toLowerCase().includes(q)
    );
  });

  const filteredReports = reports.filter((r) => {
    if (reportFilter === 'pending') return r.status === 'pending';
    if (reportFilter === 'resolved') return r.status !== 'pending';
    return true;
  });

  return (
    <div className="min-h-screen bg-[#0b1120] text-slate-200 flex flex-col">
      {/* Top Bar Contract: 3 Zones (Brand — Nav Links — Primary Action) */}
      <header className="border-b border-slate-800 bg-[#0f172a]">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <a
            href="#overview"
            onClick={(e) => {
              e.preventDefault();
              setActiveSection('overview');
            }}
            className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            Telegram Matchmaking Service
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-400">
            <button
              onClick={() => setActiveSection('overview')}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeSection === 'overview'
                  ? 'text-slate-100 border-sky-400'
                  : 'border-transparent'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveSection('users')}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeSection === 'users' ? 'text-slate-100 border-sky-400' : 'border-transparent'
              }`}
            >
              Users
            </button>
            <button
              onClick={() => setActiveSection('moderation')}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeSection === 'moderation'
                  ? 'text-slate-100 border-sky-400'
                  : 'border-transparent'
              }`}
            >
              Moderation
            </button>
            <button
              onClick={() => setActiveSection('ledger')}
              className={`hover:text-slate-100 transition-colors whitespace-nowrap shrink-0 py-1 border-b-2 ${
                activeSection === 'ledger' ? 'text-slate-100 border-sky-400' : 'border-transparent'
              }`}
            >
              Coin Ledger
            </button>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              onClick={fetchOverview}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8 space-y-8">
        {/* Mobile Section Switcher */}
        <div className="flex md:hidden items-center gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
          {(['overview', 'users', 'moderation', 'ledger'] as SectionId[]).map((sec) => (
            <button
              key={sec}
              onClick={() => setActiveSection(sec)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 capitalize ${
                activeSection === sec
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {sec === 'ledger' ? 'Coin Ledger' : sec}
            </button>
          ))}
        </div>

        {/* Service Connection Strip */}
        <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800/90">
          <div>
            <h1 className="text-2xl font-bold text-slate-100 tracking-tight">
              Operational Status &amp; Administration
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1.5 font-mono tabular-nums">
              <span className={data?.botPollingActive ? 'text-emerald-400' : 'text-amber-400'}>
                Telegram Bot:{' '}
                {data?.botPollingActive
                  ? 'Long Polling Active'
                  : data?.botConfigured
                  ? 'Connecting'
                  : 'Awaiting TELEGRAM_BOT_TOKEN'}
              </span>
              <span aria-hidden="true">·</span>
              <span className={data?.mongoConnected ? 'text-emerald-400' : 'text-amber-400'}>
                MongoDB: {data?.mongoConnected ? 'Connected' : 'Awaiting MONGODB_URI'}
              </span>
              <span aria-hidden="true">·</span>
              <span>Uptime: {data ? formatUptime(data.uptimeSeconds) : '—'}</span>
            </div>
          </div>
        </section>

        {error && (
          <div className="p-4 rounded-lg bg-red-950/40 border border-red-900 text-sm text-red-200">
            Backend status check failed: {error}
          </div>
        )}

        {/* Key Operational Metrics */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-400">Registered Users</div>
            <div className="text-2xl font-bold text-slate-100 font-mono tabular-nums mt-1">
              {data?.stats.totalUsers ?? 0}
            </div>
          </div>
          <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-400">Match Queue</div>
            <div className="text-2xl font-bold text-slate-100 font-mono tabular-nums mt-1">
              {data?.stats.queueSize ?? 0}
            </div>
          </div>
          <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-400">Active Chats</div>
            <div className="text-2xl font-bold text-emerald-400 font-mono tabular-nums mt-1">
              {data?.stats.activeChats ?? 0}
            </div>
          </div>
          <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-400">Pending Reports</div>
            <div className="text-2xl font-bold text-amber-400 font-mono tabular-nums mt-1">
              {data?.stats.pendingReportsCount ?? 0}
            </div>
          </div>
          <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-400">Banned Accounts</div>
            <div className="text-2xl font-bold text-red-400 font-mono tabular-nums mt-1">
              {data?.stats.bannedUsersCount ?? 0}
            </div>
          </div>
          <div className="bg-[#0f172a] border border-slate-800 rounded-lg p-4">
            <div className="text-xs text-slate-400">Coins in Circulation</div>
            <div className="text-2xl font-bold text-slate-100 font-mono tabular-nums mt-1">
              {data?.stats.totalCoinsInCirculation ?? 0}
            </div>
          </div>
        </section>

        {/* OVERVIEW SECTION */}
        {activeSection === 'overview' && (
          <div className="space-y-8">
            {/* Live Matchmaking Queue */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-100">
                  Live Matchmaking Queue
                </h2>
                <span className="text-xs text-slate-400 font-mono tabular-nums">
                  {queuedUsers.length} searching
                </span>
              </div>

              <div className="bg-[#0f172a] border border-slate-800 rounded-lg overflow-hidden">
                {queuedUsers.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">
                    No users are currently waiting in the matchmaking queue. Real Telegram users
                    appear here while executing <code className="font-mono text-slate-300">/search</code>.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="py-3 px-4 font-semibold">Internal ID</th>
                          <th className="py-3 px-4 font-semibold">Name</th>
                          <th className="py-3 px-4 font-semibold">Profile</th>
                          <th className="py-3 px-4 font-semibold">Target Criteria</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {queuedUsers.map((q) => (
                          <tr key={q.userId} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-4 font-mono tabular-nums text-sky-400">
                              {q.internalId}
                            </td>
                            <td className="py-2.5 px-4 text-slate-100 font-semibold">{q.name}</td>
                            <td className="py-2.5 px-4 text-slate-300 font-mono tabular-nums">
                              {q.gender} · {q.age} yrs · {q.province}
                            </td>
                            <td className="py-2.5 px-4 text-slate-400 font-mono tabular-nums">
                              Target: {q.targetGender} · Ages {q.targetAgeMin}–{q.targetAgeMax}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>

            {/* Recent Pending Reports Snapshot */}
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-100">
                  Pending Moderation Queue
                </h2>
                <button
                  onClick={() => setActiveSection('moderation')}
                  className="text-xs font-semibold text-sky-400 hover:text-sky-300 transition-colors whitespace-nowrap"
                >
                  View all reports
                </button>
              </div>

              <div className="bg-[#0f172a] border border-slate-800 rounded-lg overflow-hidden">
                {reports.filter((r) => r.status === 'pending').length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-400">
                    Zero pending moderation reports. Incoming <code className="font-mono text-slate-300">/report</code> submissions from Telegram chats appear here automatically.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-800 text-slate-400">
                        <tr>
                          <th className="py-3 px-4 font-semibold">ID</th>
                          <th className="py-3 px-4 font-semibold">Reported User</th>
                          <th className="py-3 px-4 font-semibold">Reason</th>
                          <th className="py-3 px-4 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80">
                        {reports
                          .filter((r) => r.status === 'pending')
                          .slice(0, 5)
                          .map((rep) => {
                            const reported = users.find((u) => u.id === rep.reported_id);
                            return (
                              <tr key={rep.id} className="hover:bg-slate-800/30">
                                <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300">
                                  #{rep.id}
                                </td>
                                <td className="py-2.5 px-4 font-mono tabular-nums text-slate-200">
                                  {reported?.internal_id || `User #${rep.reported_id}`}
                                </td>
                                <td className="py-2.5 px-4 text-slate-300 max-w-md truncate">
                                  {rep.reason}
                                </td>
                                <td className="py-2.5 px-4 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center gap-2">
                                    <button
                                      onClick={() => handleResolveReport(rep.id, 'ban')}
                                      className="px-2.5 py-1 text-xs font-semibold bg-red-950/70 hover:bg-red-900 text-red-200 border border-red-800 rounded transition-colors"
                                    >
                                      Ban User
                                    </button>
                                    <button
                                      onClick={() => handleResolveReport(rep.id, 'dismiss')}
                                      className="px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
                                    >
                                      Dismiss
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {/* USERS SECTION */}
        {activeSection === 'users' && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-100">
                Registered Telegram Users ({filteredUsers.length})
              </h2>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search handle, name, Telegram ID..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-[#0f172a] border border-slate-800 rounded-lg text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
              </div>
            </div>

            <div className="bg-[#0f172a] border border-slate-800 rounded-lg overflow-hidden">
              {filteredUsers.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-400">
                  {users.length === 0
                    ? 'No users registered in MongoDB yet. Users are created automatically when they complete /start onboarding on Telegram.'
                    : 'No users matched your search filter.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Internal ID</th>
                        <th className="py-3 px-4 font-semibold">Telegram ID</th>
                        <th className="py-3 px-4 font-semibold">Name</th>
                        <th className="py-3 px-4 font-semibold">Demographics</th>
                        <th className="py-3 px-4 font-semibold text-right">Coins</th>
                        <th className="py-3 px-4 font-semibold">State</th>
                        <th className="py-3 px-4 font-semibold text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {filteredUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-800/30">
                          <td className="py-2.5 px-4 font-mono tabular-nums text-sky-400 font-semibold">
                            {u.internal_id}
                          </td>
                          <td className="py-2.5 px-4 font-mono tabular-nums text-slate-400">
                            {u.telegram_id}
                          </td>
                          <td className="py-2.5 px-4 text-slate-100 font-semibold">{u.name}</td>
                          <td className="py-2.5 px-4 text-slate-300 font-mono tabular-nums">
                            {u.gender} · {u.age} yrs · {u.province}
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">
                            {u.coins}
                          </td>
                          <td className="py-2.5 px-4 font-mono text-slate-300">
                            {u.status === 'banned' ? (
                              <span className="text-red-400 font-semibold">Banned</span>
                            ) : (
                              <span>{u.status}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <button
                              onClick={() => handleBanToggle(u.id, u.status)}
                              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors ${
                                u.status === 'banned'
                                  ? 'bg-emerald-950/60 hover:bg-emerald-900 text-emerald-300 border border-emerald-800'
                                  : 'bg-slate-800 hover:bg-red-950 text-slate-300 hover:text-red-200 border border-slate-700'
                              }`}
                            >
                              {u.status === 'banned' ? (
                                <>
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  <span>Unban</span>
                                </>
                              ) : (
                                <>
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>Ban</span>
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* MODERATION SECTION */}
        {activeSection === 'moderation' && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <h2 className="text-base font-semibold text-slate-100">
                Abuse Reports &amp; Auto-Ban Audits ({filteredReports.length})
              </h2>

              <div className="flex items-center gap-1 p-1 bg-[#0f172a] border border-slate-800 rounded-lg self-start">
                {(['all', 'pending', 'resolved'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setReportFilter(tab)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors capitalize whitespace-nowrap ${
                      reportFilter === tab
                        ? 'bg-slate-800 text-slate-100'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-[#0f172a] border border-slate-800 rounded-lg overflow-hidden">
              {filteredReports.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-400">
                  No moderation reports found for this filter.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Report ID</th>
                        <th className="py-3 px-4 font-semibold">Reporter</th>
                        <th className="py-3 px-4 font-semibold">Reported</th>
                        <th className="py-3 px-4 font-semibold">Reason &amp; Chat Evidence</th>
                        <th className="py-3 px-4 font-semibold">State</th>
                        <th className="py-3 px-4 font-semibold text-right">Resolution</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {filteredReports.map((rep) => {
                        const reporter = users.find((u) => u.id === rep.reporter_id);
                        const reported = users.find((u) => u.id === rep.reported_id);
                        return (
                          <tr key={rep.id} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300">
                              #{rep.id}
                            </td>
                            <td className="py-2.5 px-4 font-mono tabular-nums text-slate-300">
                              {reporter?.internal_id || `User #${rep.reporter_id}`}
                            </td>
                            <td className="py-2.5 px-4 font-mono tabular-nums text-amber-300 font-semibold">
                              {reported?.internal_id || `User #${rep.reported_id}`}
                            </td>
                            <td className="py-2.5 px-4 max-w-md">
                              <div className="text-slate-200">{rep.reason}</div>
                              {rep.chat_snippet && (
                                <pre className="mt-1 text-[11px] font-mono text-slate-400 whitespace-pre-wrap break-words">
                                  {rep.chat_snippet}
                                </pre>
                              )}
                            </td>
                            <td className="py-2.5 px-4 font-mono">
                              {rep.status === 'pending' ? (
                                <span className="text-amber-400 font-semibold">Pending</span>
                              ) : rep.status === 'resolved_banned' ? (
                                <span className="text-red-400">Banned</span>
                              ) : (
                                <span className="text-slate-400">Dismissed</span>
                              )}
                            </td>
                            <td className="py-2.5 px-4 text-right whitespace-nowrap">
                              {rep.status === 'pending' ? (
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    onClick={() => handleResolveReport(rep.id, 'ban')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-red-950/70 hover:bg-red-900 text-red-200 border border-red-800 rounded transition-colors"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                    <span>Ban</span>
                                  </button>
                                  <button
                                    onClick={() => handleResolveReport(rep.id, 'dismiss')}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                    <span>Dismiss</span>
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-500 font-mono">
                                  {rep.resolved_by || 'Resolved'}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}

        {/* COIN LEDGER SECTION */}
        {activeSection === 'ledger' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-100">
                Recent Coin Transactions ({transactions.length})
              </h2>
            </div>

            <div className="bg-[#0f172a] border border-slate-800 rounded-lg overflow-hidden">
              {transactions.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-400">
                  No coin transactions recorded yet. Welcome bonuses, daily rewards, referrals, and
                  search deductions are logged here automatically.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-slate-400">
                      <tr>
                        <th className="py-3 px-4 font-semibold">Tx ID</th>
                        <th className="py-3 px-4 font-semibold">User</th>
                        <th className="py-3 px-4 font-semibold">Type</th>
                        <th className="py-3 px-4 font-semibold">Description</th>
                        <th className="py-3 px-4 font-semibold text-right">Amount</th>
                        <th className="py-3 px-4 font-semibold text-right">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {transactions.map((tx) => {
                        const u = users.find((usr) => usr.id === tx.user_id);
                        return (
                          <tr key={tx.id} className="hover:bg-slate-800/30">
                            <td className="py-2.5 px-4 font-mono tabular-nums text-slate-400">
                              #{tx.id}
                            </td>
                            <td className="py-2.5 px-4 font-mono tabular-nums text-sky-400">
                              {u?.internal_id || `User #${tx.user_id}`}
                            </td>
                            <td className="py-2.5 px-4 font-mono text-slate-300">{tx.type}</td>
                            <td className="py-2.5 px-4 text-slate-300">{tx.description}</td>
                            <td
                              className={`py-2.5 px-4 text-right font-mono tabular-nums font-semibold ${
                                tx.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
                              }`}
                            >
                              {tx.amount >= 0 ? `+${tx.amount}` : tx.amount}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-400">
                              {new Date(tx.created_at).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-slate-800/80 py-4 px-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <span>Telegram Matchmaking Bot Administration</span>
          <a
            href="/api/health"
            target="_blank"
            rel="noreferrer"
            className="hover:text-slate-300 transition-colors font-mono"
          >
            /api/health
          </a>
        </div>
      </footer>
    </div>
  );
}
