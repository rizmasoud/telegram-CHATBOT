import React from 'react';
import {
  Layers,
  ArrowRight,
  Shield,
  Zap,
  Database,
  Lock,
  Gift,
  Users,
  Compass,
  CheckCircle2,
  FileCode2,
} from 'lucide-react';

export const ArchitectureView: React.FC = () => {
  return (
    <div className="space-y-6 text-slate-200">
      {/* Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-cyan-400 mb-1">
            <Zap className="w-4 h-4" />
            <h4 className="font-semibold text-xs tracking-wide uppercase">Framework</h4>
          </div>
          <div className="text-lg font-bold text-slate-100">grammY + TS</div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Type-safe conversations wizard, session middlewares, and webhook engine.
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-blue-400 mb-1">
            <Database className="w-4 h-4" />
            <h4 className="font-semibold text-xs tracking-wide uppercase">Relational DB</h4>
          </div>
          <div className="text-lg font-bold text-slate-100">PostgreSQL + Drizzle</div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            1-to-1 matching preferences, referral foreign keys, and immutable gender enforcement.
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl">
          <div className="flex items-center gap-2 text-amber-400 mb-1">
            <Layers className="w-4 h-4" />
            <h4 className="font-semibold text-xs tracking-wide uppercase">In-Memory Engine</h4>
          </div>
          <div className="text-lg font-bold text-slate-100">Redis (ioredis)</div>
          <p className="text-[11px] text-slate-400 mt-0.5">
            Sub-millisecond sorted-set matchmaking queues, active chat pairings, and rate-limiting.
          </p>
        </div>
      </div>

      {/* High-Level Architecture Pipeline */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            Full-Stack Telegram Bot Architecture
          </h3>
          <span className="text-[10px] bg-cyan-950 text-cyan-400 border border-cyan-800/80 px-2 py-0.5 rounded-full font-mono">
            Modular Structure
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
          {/* Layer 1 */}
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 space-y-2">
            <div className="font-bold text-slate-300 flex items-center gap-1.5 text-xs text-cyan-400">
              <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px]">1</span>
              Ingress & Inbound
            </div>
            <ul className="text-slate-400 space-y-1 text-[11px]">
              <li>• Telegram Cloud API</li>
              <li>• Webhook / Polling Runner</li>
              <li>• Secret Header Validation</li>
              <li>• Express HTTP Receiver</li>
            </ul>
          </div>

          {/* Layer 2 */}
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 space-y-2">
            <div className="font-bold text-slate-300 flex items-center gap-1.5 text-xs text-blue-400">
              <span className="w-5 h-5 rounded-full bg-blue-500/20 flex items-center justify-center text-[10px]">2</span>
              grammY Orchestrator
            </div>
            <ul className="text-slate-400 space-y-1 text-[11px]">
              <li>• <code>@grammyjs/conversations</code></li>
              <li>• In-memory/Redis Session</li>
              <li>• Command & Callback Routers</li>
              <li>• Deep-link Referral Parser</li>
            </ul>
          </div>

          {/* Layer 3 */}
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 space-y-2">
            <div className="font-bold text-slate-300 flex items-center gap-1.5 text-xs text-purple-400">
              <span className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px]">3</span>
              Domain & Services
            </div>
            <ul className="text-slate-400 space-y-1 text-[11px]">
              <li>• <code>UserService.registerUser()</code></li>
              <li>• Referral reward calculator (+15)</li>
              <li>• Immutable gender guard</li>
              <li>• Reciprocal match evaluator</li>
            </ul>
          </div>

          {/* Layer 4 */}
          <div className="bg-slate-950/80 border border-slate-800/90 rounded-xl p-3.5 space-y-2">
            <div className="font-bold text-slate-300 flex items-center gap-1.5 text-xs text-amber-400">
              <span className="w-5 h-5 rounded-full bg-amber-500/20 flex items-center justify-center text-[10px]">4</span>
              Data & Storage
            </div>
            <ul className="text-slate-400 space-y-1 text-[11px]">
              <li>• PostgreSQL (Drizzle ORM)</li>
              <li>• Users & Preferences 1:1</li>
              <li>• Redis Match Queues</li>
              <li>• Active Chat Peer Map</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Step-by-Step Onboarding Flowchart */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <Compass className="w-4 h-4 text-emerald-400" />
            6-Step User Onboarding Wizard & Immutability Rules
          </h3>
          <span className="text-[10px] bg-emerald-950 text-emerald-400 border border-emerald-800/80 px-2 py-0.5 rounded-full font-mono">
            Conversations Plugin
          </span>
        </div>

        <div className="space-y-3">
          {/* Step 1 */}
          <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 font-bold text-xs flex-shrink-0">
              1
            </div>
            <div className="text-xs space-y-1">
              <div className="font-semibold text-slate-100 flex items-center gap-2">
                <span>Ask for Name / Nickname</span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                  Length: 2 - 50 chars
                </span>
              </div>
              <p className="text-slate-400">
                Waits for text message. Validates length and blocks empty or malicious formatting.
              </p>
            </div>
          </div>

          {/* Step 2 */}
          <div className="flex items-start gap-3 bg-amber-950/20 p-3 rounded-xl border border-amber-800/40">
            <div className="w-7 h-7 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300 font-bold text-xs flex-shrink-0">
              2
            </div>
            <div className="text-xs space-y-1">
              <div className="font-semibold text-amber-200 flex items-center gap-2">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Ask for Gender (Strict Immutability Warning)</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-mono">
                  Permanent Lock
                </span>
              </div>
              <p className="text-slate-300">
                Presents explicit warning: <i>"Gender cannot be modified after registration"</i>. Handled via inline keyboard [👨 Male] and [👩 Female]. Stored in PostgreSQL as <code>gender</code> ENUM and blocked from subsequent profile edits.
              </p>
            </div>
          </div>

          {/* Step 3 */}
          <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 font-bold text-xs flex-shrink-0">
              3
            </div>
            <div className="text-xs space-y-1">
              <div className="font-semibold text-slate-100 flex items-center gap-2">
                <span>Ask for Age (Validation)</span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                  18 ≤ age ≤ 99
                </span>
              </div>
              <p className="text-slate-400">
                Parses integer input. Rejects minors (&lt;18) and non-numeric inputs with friendly guidance.
              </p>
            </div>
          </div>

          {/* Step 4 */}
          <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-400 font-bold text-xs flex-shrink-0">
              4
            </div>
            <div className="text-xs space-y-1">
              <div className="font-semibold text-slate-100 flex items-center gap-2">
                <span>Select Iranian Province</span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                  31 Provinces • Paginated Keyboard
                </span>
              </div>
              <p className="text-slate-400">
                Presents an inline interactive matrix of Iranian provinces (Tehran, Isfahan, Fars, Khorasan, Azerbaijan, etc.) with pagination buttons.
              </p>
            </div>
          </div>

          {/* Step 5 */}
          <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400 font-bold text-xs flex-shrink-0">
              5
            </div>
            <div className="text-xs space-y-1">
              <div className="font-semibold text-slate-100 flex items-center gap-2">
                <span>Upload Profile Photo</span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                  Optional • Telegram File ID
                </span>
              </div>
              <p className="text-slate-400">
                Captures Telegram <code>photo.file_id</code> or allows user to skip with an inline [⏭️ Skip Photo] button.
              </p>
            </div>
          </div>

          {/* Step 6 */}
          <div className="flex items-start gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold text-xs flex-shrink-0">
              6
            </div>
            <div className="text-xs space-y-1">
              <div className="font-semibold text-slate-100 flex items-center gap-2">
                <span>Write Short Bio</span>
                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded font-mono">
                  Max 250 chars • Optional
                </span>
              </div>
              <p className="text-slate-400">
                Free-form text input describing hobbies and interests, or skip button.
              </p>
            </div>
          </div>

          {/* Completion */}
          <div className="flex items-start gap-3 bg-gradient-to-r from-emerald-950/40 to-blue-950/40 p-3.5 rounded-xl border border-emerald-500/30">
            <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500 flex items-center justify-center text-emerald-300 font-bold text-xs flex-shrink-0">
              ✓
            </div>
            <div className="text-xs space-y-1">
              <div className="font-semibold text-emerald-300 flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-400" />
                <span>Finalization, Unique ID & Starting Rewards</span>
              </div>
              <p className="text-slate-300">
                Generates unique <code>internal_id</code> (e.g. <code>USER-8291</code>), generates referral link, credits <b>10 coins welcome bonus</b> (+5 if referred, and awards +15 to the referrer), initializes default 1:1 Matching Preferences, and renders the rich Profile Card!
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Advanced Matchmaking & Redis Queue Architecture */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            Redis Matchmaking Engine & Concurrency Safety
          </h3>
          <span className="text-[10px] bg-amber-950 text-amber-300 border border-amber-800/80 px-2 py-0.5 rounded-full font-mono">
            Sub-millisecond Mutex
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-950/70 border border-slate-800/80 p-3.5 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 text-xs flex items-center gap-1.5 text-cyan-400">
              <Shield className="w-4 h-4 text-cyan-400" />
              Multi-Criteria Bidirectional Filter
            </h4>
            <ul className="text-slate-400 space-y-1.5 text-[11px]">
              <li>
                • <b>Gender:</b> Candidate's gender matches user's <code>target_gender</code> AND user's gender matches candidate's <code>target_gender</code>.
              </li>
              <li>
                • <b>Age Compatibility:</b> <code>candidate.age</code> is between <code>user.min-max</code> AND <code>user.age</code> is between <code>candidate.min-max</code>.
              </li>
              <li>
                • <b>Province Rule:</b> Supports <code>same_province</code>, <code>any_province</code>, or specific Iranian provinces.
              </li>
            </ul>
          </div>

          <div className="bg-slate-950/70 border border-slate-800/80 p-3.5 rounded-xl space-y-2">
            <h4 className="font-semibold text-slate-200 text-xs flex items-center gap-1.5 text-amber-400">
              <Lock className="w-4 h-4 text-amber-400" />
              Race Condition Prevention (Double-Pairing Guard)
            </h4>
            <ul className="text-slate-400 space-y-1.5 text-[11px]">
              <li>
                • <b>Distributed Mutex Lock:</b> Acquired with Redis <code>SET lock:match_pairing PX 1500 NX</code> before candidate inspection.
              </li>
              <li>
                • <b>Atomic Pipeline Claim:</b> Removes both users from <code>pool:waiting_users</code> and creates <code>chat:partner</code> mapping in one single Redis transaction.
              </li>
              <li>
                • <b>Zero Double-Matching:</b> Guaranteed safe even under high concurrent traffic.
              </li>
            </ul>
          </div>
        </div>

        {/* In-Chat Controls */}
        <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl space-y-2 text-xs">
          <h4 className="font-semibold text-slate-200 text-xs flex items-center gap-2 text-purple-400">
            <Layers className="w-4 h-4 text-purple-400" />
            In-Chat Anonymous Relays & Session Flow Controls
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-400">
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-bold text-slate-200 font-mono text-cyan-400">/next</span>
              <p>Terminates current chat, notifies partner, and immediately re-enqueues back into search.</p>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-bold text-slate-200 font-mono text-rose-400">/stop</span>
              <p>Ends current chat, notifies partner, and safely returns user to the main menu in <code>idle</code> status.</p>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/70 space-y-1">
              <span className="font-bold text-slate-200 font-mono text-amber-400">/report</span>
              <p>Immediately kills chat for both parties, files record in <code>reports</code>, captures chat snippet, and triggers auto-ban check.</p>
            </div>
          </div>
        </div>

        {/* Moderation, Auto-Ban & Rate Limiting Engine */}
        <div className="bg-slate-950/80 border border-slate-800 p-3.5 rounded-xl space-y-3 text-xs">
          <h4 className="font-semibold text-slate-200 text-xs flex items-center gap-2 text-rose-400">
            <Shield className="w-4 h-4 text-rose-400" />
            Moderation, Auto-Ban & Redis Rate Limiting Engine
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] text-slate-400">
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/70 space-y-1.5">
              <span className="font-bold text-slate-200 font-mono text-rose-300">🛡️ Auto-Ban Threshold</span>
              <p>
                When a user receives &ge; 3 unique reports within 24 hours, the system automatically marks them as <code>banned</code> in PostgreSQL and updates the Redis blacklist set.
              </p>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/70 space-y-1.5">
              <span className="font-bold text-slate-200 font-mono text-amber-300">⚡ Redis Sliding Rate Limiter</span>
              <p>
                Prevents spam flooding: maximum <b>5 messages per 3 seconds</b> and <b>1 search per 5 seconds</b>. Throttles offending requests with friendly Persian cooldown warnings.
              </p>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800/70 space-y-1.5">
              <span className="font-bold text-slate-200 font-mono text-violet-300">👑 Admin Dashboard (/admin)</span>
              <p>
                Restricted to <code>ADMIN_TELEGRAM_IDS</code>. Provides real-time metrics, system broadcast announcements, and one-tap report resolution with <b>[🔨 Ban User]</b> or <b>[❌ Dismiss]</b>.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
