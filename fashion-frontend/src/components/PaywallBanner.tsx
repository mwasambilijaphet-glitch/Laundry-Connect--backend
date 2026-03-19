'use client';
import Link from 'next/link';
import { Lock, Star } from 'lucide-react';
import { motion } from 'framer-motion';

export default function PaywallBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4"
    >
      <div className="w-20 h-20 rounded-full bg-gold-gradient flex items-center justify-center mb-6 shadow-xl shadow-gold-500/30">
        <Lock size={32} className="text-dark-950" />
      </div>
      <h2 className="font-display text-3xl font-bold text-gray-900 dark:text-white mb-3">
        Premium Feature
      </h2>
      <p className="text-gray-500 dark:text-gray-400 max-w-md mb-8 leading-relaxed">
        This feature requires an active Fashion.co.tz subscription.
        Subscribe for just <strong className="text-gold-500">5,000 TZS/week</strong> and unlock
        AI Fashion Design, Smart Outfit Recommendations, and your personal Bilingual Fashion Assistant.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link href="/subscribe" className="btn-gold gap-2">
          <Star size={18} />
          Subscribe — 5,000 TZS/week
        </Link>
        <Link href="/dashboard" className="btn-outline">
          Back to Dashboard
        </Link>
      </div>
      <div className="mt-8 grid grid-cols-3 gap-4 text-center max-w-sm w-full">
        {['AI Design', 'Outfit AI', 'Assistant'].map(f => (
          <div key={f} className="text-xs text-gray-400 dark:text-gray-600">
            <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-dark-800 flex items-center justify-center mx-auto mb-1.5">
              <Star size={14} className="text-gold-500" />
            </div>
            {f}
          </div>
        ))}
      </div>
    </motion.div>
  );
}
