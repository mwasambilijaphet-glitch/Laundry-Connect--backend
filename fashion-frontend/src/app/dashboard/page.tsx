'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Wand2, Shirt, MessageCircle, Star, ArrowRight, Calendar, TrendingUp, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '@/components/layout/Navbar';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import { useAuth } from '@/providers/AuthProvider';
import { userApi } from '@/lib/api';

interface DashboardData {
  user: any;
  subscription: { isActive: boolean; status: string; expiryDate: string | null; startDate: string | null };
  stats: { designsCount: number; outfitsCount: number; chatsCount: number };
  recentDesigns: any[];
  recentOutfits: any[];
}

const quickActions = [
  { href: '/designer', icon: Wand2, label: 'AI Designer', desc: 'Generate clothing designs', color: 'bg-purple-500/10 text-purple-400' },
  { href: '/outfits', icon: Shirt, label: 'Outfit Recommender', desc: 'Get outfit suggestions', color: 'bg-blue-500/10 text-blue-400' },
  { href: '/chat', icon: MessageCircle, label: 'Fashion Assistant', desc: 'Chat in Swahili or English', color: 'bg-green-500/10 text-green-400' },
  { href: '/subscribe', icon: Star, label: 'Subscription', desc: 'Manage your plan', color: 'bg-gold-500/10 text-gold-500' },
];

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) { router.replace('/auth/login'); return; }
    if (user) {
      userApi.dashboard()
        .then(res => setData(res.data))
        .catch(() => toast.error('Failed to load dashboard'))
        .finally(() => setLoading(false));
    }
  }, [user, authLoading, router]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-dark-950 flex items-center justify-center">
        <LoadingSpinner size={40} />
      </div>
    );
  }

  if (!user || !data) return null;

  const { subscription, stats, recentDesigns } = data;
  const daysLeft = subscription.expiryDate
    ? Math.max(0, Math.ceil((new Date(subscription.expiryDate).getTime() - Date.now()) / 86400000))
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-950">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
          <h1 className="font-display text-4xl font-bold text-gray-900 dark:text-white mb-1">
            Good {new Date().getHours() < 12 ? 'morning' : 'afternoon'},{' '}
            <span className="gold-text">{user.fullName.split(' ')[0]}</span> 👋
          </h1>
          <p className="text-gray-500 dark:text-gray-400">Here's your fashion studio overview</p>
        </motion.div>

        {/* Subscription banner */}
        {!subscription.isActive && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-5 rounded-2xl bg-gradient-to-r from-gold-500/10 to-gold-400/5 border border-gold-500/20"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-gold-500 font-semibold mb-1">
                  <Star size={16} fill="currentColor" />
                  Unlock Premium Features
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Subscribe for 5,000 TZS/week to access AI Design, Outfit Recommender & your Fashion Assistant.
                </p>
              </div>
              <Link href="/subscribe" className="btn-gold whitespace-nowrap !py-2.5">
                Subscribe now <ArrowRight size={16} />
              </Link>
            </div>
          </motion.div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Saved Designs', value: stats.designsCount, icon: Wand2, color: 'text-purple-400' },
            { label: 'Saved Outfits', value: stats.outfitsCount, icon: Shirt, color: 'text-blue-400' },
            { label: 'Chat Sessions', value: stats.chatsCount, icon: MessageCircle, color: 'text-green-400' },
            subscription.isActive
              ? { label: 'Days Left', value: daysLeft, icon: Calendar, color: 'text-gold-500' }
              : { label: 'Subscription', value: 'Inactive', icon: TrendingUp, color: 'text-red-400' },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="card p-5"
            >
              <stat.icon size={20} className={`${stat.color} mb-3`} />
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{stat.value}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stat.label}</div>
            </motion.div>
          ))}
        </div>

        {/* Quick actions */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {quickActions.map((action, i) => (
            <motion.div
              key={action.href}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 + i * 0.05 }}
            >
              <Link href={action.href} className="card p-5 block hover:border-gold-500/30 group transition-all">
                <div className={`w-10 h-10 rounded-xl ${action.color} flex items-center justify-center mb-3`}>
                  <action.icon size={20} />
                </div>
                <div className="font-semibold text-gray-900 dark:text-white text-sm mb-0.5">{action.label}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">{action.desc}</div>
                <ArrowRight size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-gold-500 mt-3 transition-colors" />
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Recent designs */}
        {recentDesigns.length > 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl font-bold text-gray-900 dark:text-white">Recent Designs</h2>
              <Link href="/designer" className="text-sm text-gold-500 hover:underline flex items-center gap-1">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {recentDesigns.map(design => (
                <div key={design.id} className="group relative aspect-square rounded-xl overflow-hidden card">
                  <img
                    src={design.imageUrl}
                    alt={design.prompt}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2">
                    <p className="text-white text-xs line-clamp-2">{design.prompt}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Subscription card if active */}
        {subscription.isActive && subscription.expiryDate && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="mt-8 card p-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="badge-active">
                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                    Active Subscription
                  </span>
                </div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 flex items-center gap-1.5">
                  <Clock size={14} />
                  Renews on {new Date(subscription.expiryDate).toLocaleDateString('en-TZ', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
              <Link href="/subscribe" className="btn-outline text-sm">Manage</Link>
            </div>
          </motion.div>
        )}
      </main>
    </div>
  );
}
