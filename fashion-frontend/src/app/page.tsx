'use client';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, Wand2, Shirt, MessageCircle, ArrowRight, Star, Zap, Globe } from 'lucide-react';
import Navbar from '@/components/layout/Navbar';

const features = [
  {
    icon: Wand2,
    title: 'AI Fashion Designer',
    description: 'Describe your dream outfit and watch our AI bring it to life with stunning design illustrations, fabric suggestions, and color palettes.',
  },
  {
    icon: Shirt,
    title: 'Smart Outfit Recommender',
    description: 'Input your occasion, weather, and style preference — get a complete, curated outfit with accessories and shoes.',
  },
  {
    icon: MessageCircle,
    title: 'Bilingual AI Assistant',
    description: 'Chat with your personal fashion advisor in Swahili or English. Get real-time advice tailored to East African style.',
  },
  {
    icon: Globe,
    title: 'Designer Portfolio',
    description: 'Showcase your designs, receive AI-powered feedback, and connect with the Fashion.co.tz community.',
  },
];

const testimonials = [
  { name: 'Amina Hassan', role: 'Fashion Blogger, Dar es Salaam', quote: 'Fashion.co.tz completely transformed how I approach design. The AI suggestions are incredible!' },
  { name: 'David Mwangi', role: 'Independent Designer', quote: 'The bilingual assistant in Swahili is a game-changer. Finally a platform that understands our market.' },
  { name: 'Fatuma Juma', role: 'Stylist, Zanzibar', quote: 'The outfit recommender saves me hours every week. My clients are always impressed.' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-dark-950">
      <Navbar />

      {/* Hero */}
      <section className="relative pt-24 pb-20 md:pt-36 md:pb-32 px-4 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gold-500/10 via-transparent to-transparent pointer-events-none" />

        <div className="max-w-5xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-gold-500/30 bg-gold-500/10 text-gold-500 text-sm font-medium mb-8">
              <Zap size={14} />
              Powered by GPT-4 & DALL·E 3
            </div>

            <h1 className="font-display text-5xl md:text-7xl font-black text-gray-900 dark:text-white mb-6 leading-[1.05]">
              Your AI-Powered<br />
              <span className="gold-text">Fashion Platform</span>
            </h1>

            <p className="text-lg md:text-xl text-gray-500 dark:text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed">
              Design clothes with AI, get personalized outfit recommendations, and chat with your bilingual fashion assistant — all built for Tanzania.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/auth/signup" className="btn-gold text-base !py-3.5 !px-8">
                Start designing for free
                <ArrowRight size={18} />
              </Link>
              <Link href="/portfolio" className="btn-outline text-base !py-3.5 !px-8">
                Browse designs
              </Link>
            </div>
          </motion.div>

          {/* Hero image placeholder */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.8 }}
            className="mt-20 relative mx-auto max-w-4xl"
          >
            <div className="relative rounded-2xl overflow-hidden border border-gold-500/20 shadow-2xl shadow-gold-500/10">
              <div className="bg-dark-gradient aspect-[16/7] flex items-center justify-center">
                <div className="grid grid-cols-3 gap-4 p-8 w-full max-w-2xl">
                  {[1,2,3].map(i => (
                    <div key={i} className="aspect-square rounded-xl bg-dark-900 border border-dark-800 flex items-center justify-center">
                      <Sparkles size={32} className="text-gold-500 opacity-50" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="py-24 px-4 bg-gray-50 dark:bg-dark-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">Everything you need</h2>
            <p className="text-gray-500 dark:text-gray-400 text-lg max-w-xl mx-auto">
              From AI-generated designs to bilingual fashion advice — Fashion.co.tz is your complete fashion toolkit.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="card p-6"
              >
                <div className="w-12 h-12 rounded-xl bg-gold-gradient flex items-center justify-center mb-4 shadow-lg shadow-gold-500/20">
                  <f.icon size={22} className="text-dark-950" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">{f.title}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{f.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 px-4">
        <div className="max-w-lg mx-auto text-center">
          <h2 className="section-title mb-4">Simple pricing</h2>
          <p className="text-gray-500 dark:text-gray-400 mb-12">One plan. Everything included.</p>
          <motion.div
            whileHover={{ scale: 1.02 }}
            className="card p-10 border-gold-500/30 relative overflow-hidden"
          >
            <div className="absolute top-0 inset-x-0 h-1 bg-gold-gradient" />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gold-500/10 text-gold-500 text-xs font-semibold mb-6">
              <Star size={12} fill="currentColor" /> MOST POPULAR
            </div>
            <div className="mb-2">
              <span className="font-display text-6xl font-black text-gray-900 dark:text-white">5,000</span>
              <span className="text-2xl text-gray-500 ml-1">TZS</span>
            </div>
            <div className="text-gold-500 font-medium mb-8">per week · cancel anytime</div>
            <ul className="space-y-3 text-left mb-10">
              {['AI Clothing Design (unlimited)', 'Smart Outfit Recommendations', 'Bilingual Fashion Assistant (Swahili + English)', 'Designer Portfolio', 'Save & download designs', 'Priority AI processing'].map(f => (
                <li key={f} className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <span className="w-5 h-5 rounded-full bg-gold-gradient flex-shrink-0 flex items-center justify-center">
                    <span className="text-dark-950 text-xs">✓</span>
                  </span>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/auth/signup" className="btn-gold w-full justify-center text-base !py-4">
              Get started now
              <ArrowRight size={18} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-4 bg-gray-50 dark:bg-dark-900/50">
        <div className="max-w-5xl mx-auto">
          <h2 className="section-title text-center mb-12">Loved by designers</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="card p-6"
              >
                <div className="flex mb-4">
                  {[1,2,3,4,5].map(s => <Star key={s} size={14} fill="#c9a96e" className="text-gold-500" />)}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 leading-relaxed italic">"{t.quote}"</p>
                <div>
                  <div className="font-semibold text-sm text-gray-900 dark:text-white">{t.name}</div>
                  <div className="text-xs text-gray-400">{t.role}</div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 dark:border-dark-800 py-12 px-4">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-gold-500" />
            <span className="font-display font-bold gold-text">Fashion.co.tz</span>
          </div>
          <p className="text-sm text-gray-400">© {new Date().getFullYear()} Fashion.co.tz · All rights reserved</p>
          <div className="flex gap-6 text-sm text-gray-400">
            <Link href="/privacy" className="hover:text-gold-500 transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-gold-500 transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
