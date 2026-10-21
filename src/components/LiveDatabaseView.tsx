import React, { useState, useEffect } from 'react';
import { RefreshCw, Database, Users, Layers, Coins, Lock, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Hammer, Ban } from 'lucide-react';
import { User, MatchingPreferences, CoinTransaction, UserReport } from '../types';

interface LiveDatabaseViewProps {
  onRefreshTrigger?: number;
}

export const LiveDatabaseView: React.FC<LiveDatabaseViewProps> = ({ onRefreshTrigger }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [preferences, setPreferences] = useState<MatchingPreferences[]>([]);
  const [transactions, setTransactions] = useState<CoinTransaction[]>([]);
  const [reports, setReports] = useState<UserReport[]>([]);
  const [sysStats, setSysStats] = useState<any>(null);
  const [queueStats, setQueueStats] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [dbRes, queueRes] = await Promise.all([
        fetch('/api/db/data'),
        fetch('/api/redis/queue'),
      ]);

      if (dbRes.ok) {
        const data = await dbRes.json();
        setUsers(data.users || []);
        setPreferences(data.preferences || []);
        setTransactions(data.transactions || []);
        setReports(data.reports || []);
        setSysStats(data.stats || null);
      }

      if (queueRes.ok) {
        const qData = await queueRes.json();
        setQueueStats(qData);
      }
    } catch (e) {
      console.error('Failed to load DB state', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [onRefreshTrigger]);

  const handleResolveReport = async (reportId: number, action: 'ban' | 'dismiss') => {
    try {
      const res = await fetch('/api/moderation/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reportId, action, adminName: 'DashboardAdmin' }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error('Failed to resolve report', e);
    }
  };

  const handleBanToggle = async (userId: number, currentStatus: string) => {
    try {
      const endpoint = currentStatus === 'banned' ? '/api/moderation/unban' : '/api/moderation/ban';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason: 'Manual toggle from Dashboard' }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (e) {
      console.error('Failed to toggle ban', e);
    }
  };

  const handleReset = async () => {
    if (confirm('Reset database to default seed state?')) {
      await fetch('/api/simulate/reset', { method: 'POST' });
      fetchData();
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-cyan-400" />
          <h3 className="font-bold text-sm text-slate-100">Live PostgreSQL & In-Memory State</h3>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchData}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleReset}
            className="text-xs bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-800/60 px-3 py-1.5 rounded-lg transition-colors"
          >
            Reset Demo DB
          </button>
        </div>
      </div>

      {/* Metrics & Anti-Spam Guard Status */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Total Users</div>
          <div className="text-lg font-bold text-slate-100 mt-0.5">{sysStats?.totalUsers ?? users.length}</div>
          <div className="text-[10px] text-emerald-400 font-mono mt-0.5">PostgreSQL</div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Queue Searches</div>
          <div className="text-lg font-bold text-amber-400 mt-0.5">{queueStats?.queueSize ?? 0}</div>
          <div className="text-[10px] text-amber-500/80 font-mono mt-0.5">In-Memory Map</div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Active Chats</div>
          <div className="text-lg font-bold text-cyan-400 mt-0.5">{sysStats?.activeChats ?? 0}</div>
          <div className="text-[10px] text-cyan-500/80 font-mono mt-0.5">Paired Relay</div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Pending Reports</div>
          <div className="text-lg font-bold text-rose-400 mt-0.5">{sysStats?.pendingReportsCount ?? reports.filter(r => r.status === 'pending').length}</div>
          <div className="text-[10px] text-rose-500/80 font-mono mt-0.5">Moderation</div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Banned Users</div>
          <div className="text-lg font-bold text-red-500 mt-0.5">{sysStats?.bannedUsersCount ?? users.filter(u => u.status === 'banned').length}</div>
          <div className="text-[10px] text-red-400/80 font-mono mt-0.5">Auto & Admin</div>
        </div>
        <div className="bg-slate-900/90 border border-slate-800 p-3 rounded-xl">
          <div className="text-[10px] text-slate-400 uppercase font-mono">Total Coins</div>
          <div className="text-lg font-bold text-amber-300 mt-0.5">{sysStats?.totalCoinsInCirculation ?? 0} 🪙</div>
          <div className="text-[10px] text-amber-400/80 font-mono mt-0.5">In Circulation</div>
        </div>
      </div>

      {/* Moderation & User Reports Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="bg-rose-950/30 px-4 py-2.5 border-b border-rose-900/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-rose-400" />
            <span className="font-semibold text-xs text-rose-200 font-mono">
              reports Table & Moderation Audits ({reports.length})
            </span>
          </div>
          <span className="text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30 font-mono px-2 py-0.5 rounded">
            Auto-Ban: &gt;= 3 Reports / 24h
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Report ID</th>
                <th className="py-2.5 px-3">Reporter</th>
                <th className="py-2.5 px-3">Reported User</th>
                <th className="py-2.5 px-3">Reason & Chat Evidence</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {reports.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-slate-500 italic font-sans">
                    No reports submitted yet. Use /report in simulator during a chat to file a report.
                  </td>
                </tr>
              ) : (
                reports.map((rep) => {
                  const reporter = users.find((u) => u.id === rep.reporter_id);
                  const reported = users.find((u) => u.id === rep.reported_id);
                  return (
                    <tr key={rep.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2 px-3 text-rose-400 font-bold">#REP-{rep.id}</td>
                      <td className="py-2 px-3">
                        <span className="text-cyan-400">{reporter?.internal_id || `User #${rep.reporter_id}`}</span>
                        <div className="text-[10px] text-slate-500 font-sans">{reporter?.name}</div>
                      </td>
                      <td className="py-2 px-3">
                        <span className="text-amber-400 font-semibold">{reported?.internal_id || `User #${rep.reported_id}`}</span>
                        <div className="text-[10px] text-slate-500 font-sans">{reported?.name}</div>
                      </td>
                      <td className="py-2 px-3 max-w-xs">
                        <div className="text-slate-200 font-sans text-[11px] truncate">{rep.reason}</div>
                        {rep.chat_snippet && (
                          <div className="text-[10px] text-slate-400 bg-slate-950 p-1 rounded mt-0.5 border border-slate-800 truncate">
                            Evidence: {rep.chat_snippet}
                          </div>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase ${
                            rep.status === 'pending'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800 animate-pulse'
                              : rep.status === 'resolved_banned'
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : 'bg-slate-800 text-slate-400 border border-slate-700'
                          }`}
                        >
                          {rep.status}
                        </span>
                      </td>
                      <td className="py-2 px-3 whitespace-nowrap">
                        {rep.status === 'pending' ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleResolveReport(rep.id, 'ban')}
                              className="bg-rose-950 hover:bg-rose-900 text-rose-200 border border-rose-700 px-2 py-1 rounded text-[10px] flex items-center gap-1 transition-colors"
                              title="Ban user and resolve report"
                            >
                              <Hammer className="w-3 h-3 text-rose-400" />
                              <span>Ban User</span>
                            </button>
                            <button
                              onClick={() => handleResolveReport(rep.id, 'dismiss')}
                              className="bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 px-2 py-1 rounded text-[10px] flex items-center gap-1 transition-colors"
                              title="Dismiss report without penalty"
                            >
                              <XCircle className="w-3 h-3 text-slate-400" />
                              <span>Dismiss</span>
                            </button>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-500 font-sans">
                            Resolved by {rep.resolved_by || 'System'}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* In-Memory Matchmaking Queue Widget */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-4 shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <h4 className="font-semibold text-xs text-slate-200 uppercase tracking-wider font-mono">
              In-Memory Matchmaking Queue (Fast Map/Set Store)
            </h4>
          </div>
          <span className="text-[11px] font-mono text-amber-400 bg-amber-950/60 border border-amber-800/80 px-2 py-0.5 rounded-full">
            {queueStats?.queueSize || 0} users in search
          </span>
        </div>

        {queueStats?.queuedUsers?.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {queueStats.queuedUsers.map((item: any, idx: number) => (
              <div
                key={idx}
                className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 flex items-center justify-between"
              >
                <div>
                  <div className="font-semibold text-slate-200">User #{item.userId} ({item.gender})</div>
                  <div className="text-[11px] text-slate-400">
                    Target: {item.targetGender} • Ages {item.targetAgeMin}-{item.targetAgeMax} • {item.province}
                  </div>
                </div>
                <span className="text-[10px] bg-cyan-950 text-cyan-400 px-2 py-1 rounded font-mono animate-pulse">
                  Searching
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500 italic">
            Queue is currently empty. Use the simulator and tap "Find a Match" or send /find to enqueue!
          </p>
        )}
      </div>

      {/* Users Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="bg-slate-800/80 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-cyan-400" />
            <span className="font-semibold text-xs text-slate-200 font-mono">users Table ({users.length})</span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono">
            <span className="text-amber-300">🔒 Immutable Gender</span>
            <span className="text-slate-500">•</span>
            <span className="text-rose-300">🛡️ Auto-Suspension Enabled</span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-2.5 px-3">Handle</th>
                <th className="py-2.5 px-3">Name</th>
                <th className="py-2.5 px-3">Gender</th>
                <th className="py-2.5 px-3">Age</th>
                <th className="py-2.5 px-3">Province</th>
                <th className="py-2.5 px-3">Coins</th>
                <th className="py-2.5 px-3">Referral Code</th>
                <th className="py-2.5 px-3">Status</th>
                <th className="py-2.5 px-3">Moderation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-3 text-cyan-400 font-bold">{u.internal_id}</td>
                  <td className="py-2 px-3 font-sans font-medium text-slate-100">{u.name}</td>
                  <td className="py-2 px-3">
                    <span className="inline-flex items-center gap-1 text-[11px] bg-amber-950/40 text-amber-300 border border-amber-700/50 px-1.5 py-0.5 rounded">
                      <Lock className="w-2.5 h-2.5" />
                      {u.gender}
                    </span>
                  </td>
                  <td className="py-2 px-3">{u.age} yrs</td>
                  <td className="py-2 px-3">{u.province}</td>
                  <td className="py-2 px-3 text-amber-400 font-semibold">{u.coins} 🪙</td>
                  <td className="py-2 px-3 text-purple-300 font-mono text-[11px]">{u.referral_code}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-sans font-medium ${
                        u.status === 'banned'
                          ? 'bg-red-950 text-red-400 border border-red-700 font-bold'
                          : u.status === 'in_chat'
                          ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          : u.status === 'searching'
                          ? 'bg-amber-950 text-amber-400 border border-amber-800 animate-pulse'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {u.status === 'banned' ? '⛔ banned' : u.status}
                    </span>
                  </td>
                  <td className="py-2 px-3">
                    <button
                      onClick={() => handleBanToggle(u.id, u.status)}
                      className={`text-[10px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                        u.status === 'banned'
                          ? 'bg-emerald-950 hover:bg-emerald-900 text-emerald-300 border-emerald-700'
                          : 'bg-slate-800 hover:bg-rose-950 text-slate-400 hover:text-rose-300 border-slate-700 hover:border-rose-800'
                      }`}
                    >
                      {u.status === 'banned' ? (
                        <>
                          <CheckCircle2 className="w-2.5 h-2.5" />
                          <span>Unban</span>
                        </>
                      ) : (
                        <>
                          <Ban className="w-2.5 h-2.5" />
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
      </div>

      {/* Coin Transactions Ledger */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="bg-slate-800/80 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-xs text-slate-200 font-mono">coin_transactions Table</span>
          </div>
          <span className="text-[10px] text-amber-400 font-mono">
            Referrals & Bonus Rewards
          </span>
        </div>

        <div className="overflow-x-auto max-h-56">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 text-[11px]">
              <tr>
                <th className="py-2 px-3">User ID</th>
                <th className="py-2 px-3">Amount</th>
                <th className="py-2 px-3">Type</th>
                <th className="py-2 px-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-800/30">
                  <td className="py-2 px-3 text-cyan-400">User #{tx.user_id}</td>
                  <td className="py-2 px-3">
                    <span
                      className={`font-bold ${
                        tx.amount > 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {tx.amount > 0 ? `+${tx.amount}` : tx.amount} Coins
                    </span>
                  </td>
                  <td className="py-2 px-3 text-purple-300">{tx.type}</td>
                  <td className="py-2 px-3 font-sans text-slate-300 text-[11px]">{tx.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
