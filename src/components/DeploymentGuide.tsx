import React, { useState } from 'react';
import { Terminal, Copy, Check, Server, Shield, Sparkles } from 'lucide-react';

export const DeploymentGuide: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const dockerCompose = `version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: matchmaking_db
    restart: always
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres_secure_password
      POSTGRES_DB: telegram_matchmaking
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
`;

  const webhookSetup = `import { botInstance } from './src/bot/bot';

// In production, register the webhook with Telegram:
const APP_URL = process.env.APP_URL; // e.g. https://your-domain.com
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

await botInstance.api.setWebhook(\`\${APP_URL}/api/bot/webhook\`, {
  secret_token: WEBHOOK_SECRET,
  allowed_updates: ['message', 'callback_query'],
  drop_pending_updates: true,
});
console.log('Telegram Webhook registered successfully!');
`;

  return (
    <div className="space-y-6 text-slate-200">
      {/* Intro Banner */}
      <div className="bg-slate-900 border border-slate-800 p-5 rounded-2xl">
        <h3 className="font-bold text-sm text-slate-100 flex items-center gap-2 mb-2">
          <Server className="w-4 h-4 text-cyan-400" />
          Production Deployment & Infrastructure Guide
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          This architecture is designed for responsive Telegram bot matchmaking with zero dropped updates. Follow these steps to deploy to production with PostgreSQL and Drizzle ORM (with self-contained in-memory queuing).
        </p>
      </div>

      {/* Step 1: Docker Compose */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="bg-slate-800/80 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-emerald-400" />
            <span className="font-mono font-bold text-xs text-slate-200">docker-compose.yml</span>
          </div>
          <button
            onClick={() => copy(dockerCompose, 'docker')}
            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1"
          >
            {copiedKey === 'docker' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>Copy</span>
          </button>
        </div>
        <div className="p-3 bg-slate-950 font-mono text-xs overflow-x-auto text-emerald-400/90">
          <pre>{dockerCompose}</pre>
        </div>
      </div>

      {/* Step 2: Drizzle ORM Migrations */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-xl space-y-3">
        <h4 className="font-bold text-xs text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
          Database Migration Workflow (Drizzle Kit)
        </h4>
        <div className="space-y-2 text-xs">
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono flex items-center justify-between">
            <span className="text-cyan-300">npm run db:push</span>
            <span className="text-slate-500 text-[11px]">Instant schema sync directly into Postgres</span>
          </div>
          <div className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 font-mono flex items-center justify-between">
            <span className="text-purple-300">npm run db:generate</span>
            <span className="text-slate-500 text-[11px]">Generate versioned SQL migration files</span>
          </div>
        </div>
      </div>

      {/* Step 3: Webhook vs Long-Polling */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="bg-slate-800/80 px-4 py-2.5 border-b border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-400" />
            <span className="font-mono font-bold text-xs text-slate-200">
              Webhook Configuration (grammY)
            </span>
          </div>
          <button
            onClick={() => copy(webhookSetup, 'webhook')}
            className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 px-2.5 py-1 rounded border border-slate-700 flex items-center gap-1"
          >
            {copiedKey === 'webhook' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>Copy</span>
          </button>
        </div>
        <div className="p-3 bg-slate-950 font-mono text-xs overflow-x-auto text-blue-300">
          <pre>{webhookSetup}</pre>
        </div>
      </div>
    </div>
  );
};
