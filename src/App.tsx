/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Bot,
  Database,
  Layers,
  Sparkles,
  GitBranch,
  Table,
  CheckCircle2,
  Lock,
  Compass,
  Server,
  BookOpen,
} from 'lucide-react';
import { TelegramSimulator } from './components/TelegramSimulator';
import { ArchitectureView } from './components/ArchitectureView';
import { SchemaView } from './components/SchemaView';
import { LiveDatabaseView } from './components/LiveDatabaseView';
import { DeploymentGuide } from './components/DeploymentGuide';

export default function App() {
  const [selectedUser, setSelectedUser] = useState<string>('100000003');
  const [activeTab, setActiveTab] = useState<'architecture' | 'schema' | 'db' | 'deployment'>('architecture');
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const handleDataChanged = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/90 bg-slate-900/80 backdrop-blur-md sticky top-0 z-40 px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-slate-950 shadow-lg shadow-cyan-500/20 font-bold">
              <Bot className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-extrabold text-base tracking-tight text-white">
                  Telegram Matchmaking Bot
                </h1>
                <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono px-2 py-0.5 rounded-full font-semibold">
                  v1.0 Production Arch
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Node.js • TypeScript • grammY • PostgreSQL (Drizzle) • Redis
              </p>
            </div>
          </div>

          {/* System Badges */}
          <div className="flex items-center gap-2 overflow-x-auto text-xs font-mono">
            <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/70 px-2.5 py-1 rounded-lg text-slate-300">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>grammY Engine</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/70 px-2.5 py-1 rounded-lg text-slate-300">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span>Drizzle ORM</span>
            </div>
            <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/70 px-2.5 py-1 rounded-lg text-slate-300">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>Redis Queue</span>
            </div>
            <div className="flex items-center gap-1.5 bg-amber-950/40 border border-amber-800/60 px-2.5 py-1 rounded-lg text-amber-300">
              <Lock className="w-3 h-3" />
              <span>Immutable Gender</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Interactive Telegram Simulator (5 Cols on large) */}
        <section className="lg:col-span-5 h-[760px] flex flex-col">
          <TelegramSimulator
            currentTelegramId={selectedUser}
            onSelectUser={setSelectedUser}
            onDataChanged={handleDataChanged}
          />
        </section>

        {/* Right Column: Architecture & Engineering Explorer (7 Cols on large) */}
        <section className="lg:col-span-7 flex flex-col space-y-4">
          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 p-1.5 rounded-2xl overflow-x-auto no-scrollbar">
            <button
              onClick={() => setActiveTab('architecture')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'architecture'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Compass className="w-4 h-4" />
              <span>Architecture & Wizard</span>
            </button>

            <button
              onClick={() => setActiveTab('schema')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'schema'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Table className="w-4 h-4" />
              <span>Drizzle Schema & SQL</span>
            </button>

            <button
              onClick={() => setActiveTab('db')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'db'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Database className="w-4 h-4" />
              <span>Live DB & Redis State</span>
            </button>

            <button
              onClick={() => setActiveTab('deployment')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                activeTab === 'deployment'
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-bold shadow-md'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Server className="w-4 h-4" />
              <span>Deployment Guide</span>
            </button>
          </div>

          {/* Active Tab Content Area */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-xl backdrop-blur-sm min-h-[690px]">
            {activeTab === 'architecture' && <ArchitectureView />}
            {activeTab === 'schema' && <SchemaView />}
            {activeTab === 'db' && <LiveDatabaseView onRefreshTrigger={refreshTrigger} />}
            {activeTab === 'deployment' && <DeploymentGuide />}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-3 text-center text-xs text-slate-500 font-mono">
        Telegram Matchmaking Bot Architecture • grammY • Drizzle ORM • PostgreSQL • Redis
      </footer>
    </div>
  );
}
