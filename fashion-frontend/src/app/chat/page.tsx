'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle, Send, Globe, Sparkles, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '@/components/layout/Navbar';
import PaywallBanner from '@/components/PaywallBanner';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { aiApi, paymentApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

const STARTERS_EN = [
  'What should I wear to a beach wedding?',
  'How do I style a kitenge dress for work?',
  'What colors work best with dark skin tones?',
  'How to build a capsule wardrobe on a budget?',
];
const STARTERS_SW = [
  'Nifae nini kwenye harusi ya pwani?',
  'Ninawezaje kuvaa kanzu kwa kikao cha biashara?',
  'Rangi gani zinafaa vizuri na ngozi nyeusi?',
  'Ninawezaje kujenga wardrobe ndogo kwa bajeti ndogo?',
];

export default function ChatPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [language, setLanguage] = useState<'en' | 'sw' | 'auto'>('auto');
  const [sessionId, setSessionId] = useState<string | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!authLoading && !user) { router.replace('/auth/login'); return; }
    paymentApi.mySubscription().then(res => setIsSubscribed(res.data.isActive)).catch(() => setIsSubscribed(false));
  }, [user, authLoading, router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text || input).trim();
    if (!msg) return;

    const userMsg: Message = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await aiApi.chat({ message: msg, sessionId, language });
      const assistantMsg: Message = {
        role: 'assistant',
        content: res.data.response,
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      if (!sessionId) setSessionId(res.data.sessionId);
    } catch (err: any) {
      if (err.response?.status === 402) { setIsSubscribed(false); return; }
      toast.error('Failed to get response. Please try again.');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [input, sessionId, language]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const newChat = () => {
    setMessages([]);
    setSessionId(undefined);
    inputRef.current?.focus();
  };

  if (!authLoading && isSubscribed === false) {
    return <div className="min-h-screen bg-white dark:bg-dark-950"><Navbar /><div className="pt-16"><PaywallBanner /></div></div>;
  }

  const starters = language === 'sw' ? STARTERS_SW : STARTERS_EN;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-950 flex flex-col">
      <Navbar />
      <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full px-4 pt-24 pb-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <MessageCircle size={24} className="text-gold-500" />
              Fashion Assistant
            </h1>
            <p className="text-sm text-gray-400 dark:text-gray-500">Your bilingual AI fashion advisor</p>
          </div>
          <div className="flex items-center gap-2">
            {/* Language switcher */}
            <div className="flex rounded-xl border border-gray-200 dark:border-dark-700 overflow-hidden">
              {[{ v: 'auto', l: 'Auto' }, { v: 'en', l: 'EN' }, { v: 'sw', l: 'SW' }].map(lang => (
                <button
                  key={lang.v}
                  onClick={() => setLanguage(lang.v as any)}
                  className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                    language === lang.v
                      ? 'bg-gold-gradient text-dark-950'
                      : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-800'
                  }`}
                >
                  {lang.l}
                </button>
              ))}
            </div>
            <button onClick={newChat} className="btn-ghost text-xs gap-1.5">
              <Plus size={14} /> New chat
            </button>
          </div>
        </div>

        {/* Chat area */}
        <div className="flex-1 card overflow-y-auto p-4 mb-4 min-h-0" style={{ maxHeight: 'calc(100vh - 280px)' }}>
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center py-8">
              <div className="w-16 h-16 rounded-full bg-gold-gradient flex items-center justify-center mb-4 shadow-xl shadow-gold-500/20">
                <Sparkles size={28} className="text-dark-950" />
              </div>
              <h3 className="font-display text-xl font-bold text-gray-900 dark:text-white mb-2">
                {language === 'sw' ? 'Karibu, Msaidizi wako wa Mitindo!' : 'Welcome to your Fashion Assistant!'}
              </h3>
              <p className="text-sm text-gray-400 dark:text-gray-500 mb-8 max-w-sm">
                {language === 'sw'
                  ? 'Niulize swali lolote kuhusu mitindo, mavazi, au rangi kwa Kiswahili au Kiingereza.'
                  : 'Ask me anything about fashion, styling, colors, or trends in Swahili or English.'}
              </p>
              <div className="grid sm:grid-cols-2 gap-2 w-full max-w-lg">
                {starters.map(s => (
                  <button
                    key={s}
                    onClick={() => sendMessage(s)}
                    className="text-left px-4 py-3 rounded-xl bg-gray-50 dark:bg-dark-800 border border-gray-200 dark:border-dark-700 text-sm text-gray-600 dark:text-gray-400 hover:border-gold-500 hover:text-gold-500 transition-all"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence initial={false}>
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                      msg.role === 'user'
                        ? 'bg-gray-200 dark:bg-dark-700 text-gray-600 dark:text-gray-300'
                        : 'bg-gold-gradient text-dark-950'
                    }`}>
                      {msg.role === 'user' ? (user?.fullName[0] || 'U') : <Sparkles size={14} />}
                    </div>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-gray-100 dark:bg-dark-800 text-gray-800 dark:text-gray-200 rounded-tr-sm'
                        : 'bg-white dark:bg-dark-900 border border-gray-100 dark:border-dark-700 text-gray-700 dark:text-gray-300 rounded-tl-sm'
                    }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex gap-3">
                  <div className="w-8 h-8 rounded-full bg-gold-gradient flex items-center justify-center">
                    <Sparkles size={14} className="text-dark-950" />
                  </div>
                  <div className="bg-white dark:bg-dark-900 border border-gray-100 dark:border-dark-700 rounded-2xl rounded-tl-sm px-4 py-3">
                    <div className="flex gap-1.5 items-center">
                      {[0, 0.2, 0.4].map(d => (
                        <span key={d} className="w-2 h-2 rounded-full bg-gold-500 animate-bounce" style={{ animationDelay: `${d}s` }} />
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Input */}
        <div className="card p-3 flex gap-3 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={language === 'sw' ? 'Andika ujumbe wako...' : 'Ask about fashion, styling, or trends...'}
            rows={1}
            className="flex-1 bg-transparent resize-none focus:outline-none text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-600 max-h-32 py-1"
            style={{ minHeight: '24px' }}
            onInput={e => {
              const t = e.target as HTMLTextAreaElement;
              t.style.height = 'auto';
              t.style.height = Math.min(t.scrollHeight, 128) + 'px';
            }}
          />
          <button
            onClick={() => sendMessage()}
            disabled={loading || !input.trim()}
            className="w-9 h-9 rounded-xl bg-gold-gradient flex items-center justify-center text-dark-950 hover:opacity-90 disabled:opacity-40 transition-all flex-shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-2">
          Press Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}
