import React, { useState, useEffect, useRef } from 'react';
import {
  Send,
  Image as ImageIcon,
  RotateCcw,
  Sparkles,
  Bot,
  User as UserIcon,
  ShieldAlert,
  Coins,
  ChevronRight,
  CheckCheck,
} from 'lucide-react';
import { BotMessagePayload, BotInlineButton } from '../types';

interface TelegramSimulatorProps {
  currentTelegramId: string;
  onSelectUser: (id: string) => void;
  onDataChanged: () => void;
}

export const TelegramSimulator: React.FC<TelegramSimulatorProps> = ({
  currentTelegramId,
  onSelectUser,
  onDataChanged,
}) => {
  const [messages, setMessages] = useState<BotMessagePayload[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeAlert, setActiveAlert] = useState<string | null>(null);
  const [simulatedPhoto, setSimulatedPhoto] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sample avatar photos for simulation
  const sampleAvatars = [
    'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=400&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=400&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=400&auto=format&fit=crop&q=80',
  ];

  const fetchMessages = async () => {
    try {
      const res = await fetch(`/api/simulate/messages?telegramId=${currentTelegramId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch (e) {
      console.error('Failed to load messages', e);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [currentTelegramId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (textToSend?: string, photoUrl?: string) => {
    const text = textToSend !== undefined ? textToSend : inputText;
    if (!text.trim() && !photoUrl) return;

    setIsLoading(true);
    setInputText('');
    setSimulatedPhoto(null);

    try {
      const res = await fetch('/api/simulate/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: currentTelegramId,
          text,
          photoUrl,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        if (data.alert) {
          showAlert(data.alert);
        }
        onDataChanged();
      }
    } catch (e) {
      console.error('Error sending message', e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCallbackClick = async (button: BotInlineButton) => {
    if (!button.callback_data) return;

    setIsLoading(true);
    try {
      const res = await fetch('/api/simulate/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          telegramId: currentTelegramId,
          callbackData: button.callback_data,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
        if (data.alert) {
          showAlert(data.alert);
        }
        onDataChanged();
      }
    } catch (e) {
      console.error('Error executing callback', e);
    } finally {
      setIsLoading(false);
    }
  };

  const showAlert = (msg: string) => {
    setActiveAlert(msg);
    setTimeout(() => {
      setActiveAlert(null);
    }, 4000);
  };

  return (
    <div className="flex flex-col h-full bg-slate-950 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl relative">
      {/* Alert Banner / Toast */}
      {activeAlert && (
        <div className="absolute top-16 left-4 right-4 z-50 bg-amber-500/95 text-slate-950 font-semibold px-4 py-2.5 rounded-xl shadow-lg border border-amber-400 backdrop-blur-md flex items-center justify-between text-sm transition-all animate-bounce">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-slate-950 flex-shrink-0" />
            <span>{activeAlert}</span>
          </div>
          <button
            onClick={() => setActiveAlert(null)}
            className="text-xs uppercase tracking-wider bg-slate-950/20 hover:bg-slate-950/40 px-2 py-1 rounded"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Telegram Chat Header */}
      <div className="bg-slate-900/90 border-b border-slate-800 px-4 py-3 flex items-center justify-between backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-white shadow-md">
              <Bot className="w-5 h-5" />
            </div>
            <span className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-slate-900 rounded-full"></span>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-bold text-slate-100 text-sm tracking-wide">Matchmaker Bot</h2>
              <span className="text-[10px] bg-blue-500/20 text-blue-400 border border-blue-500/30 font-mono px-1.5 py-0.5 rounded">
                BOT
              </span>
            </div>
            <p className="text-xs text-slate-400">grammY • PostgreSQL • Redis</p>
          </div>
        </div>

        {/* User Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400 font-mono hidden sm:inline">Active Client:</span>
          <select
            value={currentTelegramId}
            onChange={(e) => onSelectUser(e.target.value)}
            className="bg-slate-800 text-slate-200 text-xs rounded-lg px-2.5 py-1.5 border border-slate-700 focus:outline-none focus:border-cyan-500"
          >
            <option value="100000003">New User (Unregistered #3)</option>
            <option value="100000001">Sara Rad (USER-1001 • 25 Coins)</option>
            <option value="100000002">Arman Kiani (USER-2002 • 10 Coins)</option>
            <option value="100000004">Reza Moradi (USER-4004 • 0 Coins)</option>
            <option value="999999999">🛡️ Super Admin (ID: 999999999 • ADMIN)</option>
          </select>
        </div>
      </div>

      {/* Quick Command Bar */}
      <div className="bg-slate-900/70 border-b border-slate-800/80 px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto text-[11px] text-slate-300 no-scrollbar">
        <span className="text-slate-500 font-mono text-[10px] uppercase tracking-wider flex-shrink-0">
          Fast Commands:
        </span>
        <button
          onClick={() => handleSendMessage('/search')}
          className="bg-amber-950/60 hover:bg-amber-900/60 px-2.5 py-1 rounded-md text-amber-300 border border-amber-800/60 transition-colors flex-shrink-0 font-mono font-medium"
        >
          🔍 /search
        </button>
        <button
          onClick={() => handleSendMessage('/report')}
          className="bg-rose-950/70 hover:bg-rose-900/70 px-2.5 py-1 rounded-md text-rose-300 border border-rose-800/70 transition-colors flex-shrink-0 font-mono font-medium flex items-center gap-1"
          title="Report current active chat partner and terminate session"
        >
          🚨 /report
        </button>
        <button
          onClick={() => handleSendMessage('/admin')}
          className="bg-violet-950/70 hover:bg-violet-900/70 px-2.5 py-1 rounded-md text-violet-300 border border-violet-800/70 transition-colors flex-shrink-0 font-mono font-medium flex items-center gap-1"
          title="Open Admin Moderation & Stats Dashboard"
        >
          🛡️ /admin
        </button>
        <button
          onClick={() => handleSendMessage('/balance')}
          className="bg-emerald-950/60 hover:bg-emerald-900/60 px-2.5 py-1 rounded-md text-emerald-300 border border-emerald-800/60 transition-colors flex-shrink-0 font-mono font-medium"
        >
          💰 /balance
        </button>
        <button
          onClick={() => handleSendMessage('/start ref_REF-SARA99')}
          className="bg-purple-950/60 hover:bg-purple-900/60 px-2.5 py-1 rounded-md text-purple-300 border border-purple-800/60 transition-colors flex-shrink-0 font-mono font-medium"
          title="Simulate entering bot with Sara's referral code (+5 / +15 coins)"
        >
          🎁 /start ref_REF-SARA99
        </button>
        <button
          onClick={() => handleSendMessage('/filters')}
          className="bg-cyan-950/60 hover:bg-cyan-900/60 px-2.5 py-1 rounded-md text-cyan-300 border border-cyan-800/60 transition-colors flex-shrink-0 font-mono font-medium"
        >
          ⚙️ /filters
        </button>
        <button
          onClick={() => handleSendMessage('/next')}
          className="bg-blue-950/60 hover:bg-blue-900/60 px-2.5 py-1 rounded-md text-blue-300 border border-blue-800/60 transition-colors flex-shrink-0 font-mono font-medium"
        >
          ⏭️ /next
        </button>
        <button
          onClick={() => handleSendMessage('/stop')}
          className="bg-slate-800 hover:bg-slate-700 px-2.5 py-1 rounded-md text-rose-300 border border-slate-700/60 transition-colors flex-shrink-0 font-mono font-medium"
        >
          ⏹️ /stop
        </button>
        <button
          onClick={() => handleSendMessage('/help')}
          className="bg-indigo-950/60 hover:bg-indigo-900/60 px-2.5 py-1 rounded-md text-indigo-300 border border-indigo-800/60 transition-colors flex-shrink-0 font-mono font-medium"
          title="Display friendly bot guide & commands in Persian & English"
        >
          📖 /help
        </button>
        <button
          onClick={() => handleSendMessage('/daily')}
          className="bg-yellow-950/60 hover:bg-yellow-900/60 px-2.5 py-1 rounded-md text-yellow-300 border border-yellow-800/60 transition-colors flex-shrink-0 font-mono font-medium"
          title="Claim daily bonus coins"
        >
          🎁 /daily
        </button>
        <button
          onClick={() => handleSendMessage('/history')}
          className="bg-teal-950/60 hover:bg-teal-900/60 px-2.5 py-1 rounded-md text-teal-300 border border-teal-800/60 transition-colors flex-shrink-0 font-mono font-medium"
          title="View past chat history & reconnect"
        >
          📜 /history
        </button>
        <button
          onClick={() => handleSendMessage('/find_id USER-1001')}
          className="bg-emerald-950/60 hover:bg-emerald-900/60 px-2.5 py-1 rounded-md text-emerald-300 border border-emerald-800/60 transition-colors flex-shrink-0 font-mono font-medium"
          title="Send direct anonymous message via internal ID"
        >
          🆔 /find_id USER-1001
        </button>
        <button
          onClick={async () => {
            for (let i = 1; i <= 6; i++) {
              await handleSendMessage(`Spam test message #${i}`);
            }
          }}
          className="bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2 py-1 rounded-md font-mono text-[10px] flex-shrink-0 font-semibold"
          title="Send 6 rapid messages to trigger anti-spam Redis rate limiter"
        >
          ⚡ Test Anti-Spam (6 msgs)
        </button>
      </div>

      {/* Chat Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-radial from-slate-900 to-slate-950">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 mb-1">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-slate-200">Interactive Telegram Bot Sandbox</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              Test the grammY 6-step onboarding wizard, deep-link referral rewards, and matching queue in real-time.
            </p>
            <button
              onClick={() => handleSendMessage('/start')}
              className="mt-2 inline-flex items-center gap-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold px-4 py-2 rounded-xl text-xs transition-all shadow-lg"
            >
              Send /start to Begin Onboarding
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {messages.map((msg) => {
          const isUser = msg.from === 'user';
          return (
            <div
              key={msg.id}
              className={`flex flex-col ${isUser ? 'items-end' : 'items-start'} max-w-full`}
            >
              {/* Message Bubble */}
              <div
                className={`rounded-2xl px-4 py-3 max-w-[88%] text-sm shadow-md break-words ${
                  isUser
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-slate-800/90 text-slate-200 border border-slate-700/80 rounded-bl-none'
                }`}
              >
                {/* Photo attachment */}
                {msg.photoUrl && (
                  <div className="mb-2.5 rounded-xl overflow-hidden border border-slate-700/60 max-w-[280px]">
                    <img
                      src={msg.photoUrl}
                      alt="Telegram Attachment"
                      className="w-full h-40 object-cover"
                    />
                  </div>
                )}

                {/* HTML Formatted Text */}
                <div
                  className="leading-relaxed prose prose-invert prose-sm text-[13.5px]"
                  dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br/>') }}
                />

                <div
                  className={`mt-1.5 text-[10px] flex items-center justify-end gap-1 ${
                    isUser ? 'text-blue-200/80' : 'text-slate-400'
                  }`}
                >
                  <span>{msg.timestamp}</span>
                  {isUser && <CheckCheck className="w-3.5 h-3.5 text-blue-300" />}
                </div>
              </div>

              {/* Inline Keyboard Buttons */}
              {msg.replyMarkup?.inline_keyboard && (
                <div className="mt-2 flex flex-col gap-1.5 w-full max-w-[88%]">
                  {msg.replyMarkup.inline_keyboard.map((row, rIdx) => (
                    <div key={rIdx} className="grid grid-flow-col auto-cols-fr gap-1.5">
                      {row.map((btn, bIdx) => {
                        const isLockedGender = btn.callback_data === 'edit:gender_locked';
                        const isSkip = btn.callback_data?.includes('skip');

                        return (
                          <button
                            key={bIdx}
                            disabled={isLoading}
                            onClick={() => handleCallbackClick(btn)}
                            className={`px-3 py-2 rounded-xl text-xs font-medium text-center transition-all flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] ${
                              isLockedGender
                                ? 'bg-amber-950/40 text-amber-300 hover:bg-amber-900/50 border border-amber-600/40'
                                : isSkip
                                ? 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200 border border-slate-700'
                                : 'bg-slate-800/95 hover:bg-cyan-950/60 text-slate-100 hover:text-cyan-300 border border-slate-700/80 hover:border-cyan-500/50'
                            }`}
                          >
                            <span>{btn.text}</span>
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Photo Picker Drawer */}
      {simulatedPhoto && (
        <div className="bg-slate-900 border-t border-slate-800 p-2.5 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <img src={simulatedPhoto} alt="Selected" className="w-8 h-8 rounded-lg object-cover" />
            <span>Ready to send simulated profile photo</span>
          </div>
          <button
            onClick={() => handleSendMessage('', simulatedPhoto)}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold px-3 py-1 rounded-lg text-xs"
          >
            Send Photo
          </button>
        </div>
      )}

      {/* Input Message Area */}
      <div className="p-3 bg-slate-900/95 border-t border-slate-800 flex items-center gap-2">
        {/* Photo selector dropdown */}
        <div className="relative group">
          <button
            type="button"
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors border border-slate-700/60"
            title="Attach simulated photo"
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <div className="absolute bottom-12 left-0 hidden group-hover:flex flex-col bg-slate-800 border border-slate-700 rounded-xl p-2 shadow-2xl z-20 w-44 space-y-1.5">
            <span className="text-[10px] text-slate-400 font-semibold px-1">Pick Avatar Photo:</span>
            {sampleAvatars.map((url, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setSimulatedPhoto(url)}
                className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-700 text-left text-xs text-slate-200"
              >
                <img src={url} alt={`Avatar ${i}`} className="w-7 h-7 rounded-full object-cover" />
                <span>Avatar #{i + 1}</span>
              </button>
            ))}
          </div>
        </div>

        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSendMessage();
          }}
          placeholder="Type a message or /command..."
          className="flex-1 bg-slate-950 text-slate-100 text-xs sm:text-sm px-4 py-2.5 rounded-xl border border-slate-800 focus:outline-none focus:border-cyan-500 placeholder-slate-500"
        />

        <button
          onClick={() => handleSendMessage()}
          disabled={isLoading || (!inputText.trim() && !simulatedPhoto)}
          className="p-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-md"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
