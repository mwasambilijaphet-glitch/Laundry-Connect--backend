'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Shirt, Sparkles, Save, RefreshCw, Sun, CloudRain, Wind, Thermometer } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '@/components/layout/Navbar';
import Button from '@/components/ui/Button';
import PaywallBanner from '@/components/PaywallBanner';
import { aiApi, paymentApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

const occasions = ['Wedding ceremony', 'Business meeting', 'Casual day out', 'Evening dinner', 'Beach day', 'Cultural event', 'Graduation', 'Night out', 'Church / Mosque', 'Sports / Gym'];
const weathers = ['Hot & sunny', 'Warm & humid', 'Cool breeze', 'Rainy', 'Cold'];
const styles = ['Traditional African', 'Modern Afro-fusion', 'Western classic', 'Streetwear', 'Elegant & formal', 'Bohemian', 'Minimalist'];

interface OutfitRecommendation {
  outfit: { top?: string; bottom?: string; outerwear?: string; description: string };
  colors: { hex: string; name: string; role: string }[];
  accessories: string[];
  shoes: { style: string; color: string; description: string };
  stylingTips: string[];
}

export default function OutfitsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState<boolean | null>(null);
  const [form, setForm] = useState({ occasion: '', weather: '', stylePreference: '', language: 'en' });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<OutfitRecommendation | null>(null);

  useEffect(() => {
    if (!authLoading && !user) { router.replace('/auth/login'); return; }
    paymentApi.mySubscription().then(res => setIsSubscribed(res.data.isActive)).catch(() => setIsSubscribed(false));
  }, [user, authLoading, router]);

  const handleSubmit = async () => {
    if (!form.occasion || !form.weather || !form.stylePreference) {
      toast.error('Please fill in all fields'); return;
    }
    setLoading(true);
    try {
      const res = await aiApi.recommendOutfit({ ...form, save: false });
      setResult(res.data.recommendation);
    } catch (err: any) {
      if (err.response?.status === 402) { setIsSubscribed(false); return; }
      toast.error('Failed to get recommendation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    try {
      await aiApi.recommendOutfit({ ...form, save: true });
      toast.success('Outfit saved to your collection!');
    } catch {
      toast.error('Failed to save outfit');
    } finally {
      setSaving(false);
    }
  };

  if (!authLoading && isSubscribed === false) {
    return <div className="min-h-screen bg-white dark:bg-dark-950"><Navbar /><div className="pt-16"><PaywallBanner /></div></div>;
  }

  const SelectField = ({ label, value, onChange, options }: any) => (
    <div>
      <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{label}</label>
      <select value={value} onChange={e => onChange(e.target.value)} className="input-field">
        <option value="">Select {label.toLowerCase()}...</option>
        {options.map((o: string) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-950">
      <Navbar />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <h1 className="font-display text-4xl font-bold text-gray-900 dark:text-white flex items-center gap-3 mb-2">
            <Shirt size={32} className="text-gold-500" />
            Smart Outfit Recommender
          </h1>
          <p className="text-gray-500 dark:text-gray-400">Tell us about your occasion and get a complete outfit</p>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-8">
          {/* Form */}
          <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} className="lg:col-span-2 space-y-4">
            <div className="card p-6 space-y-4">
              <SelectField label="Occasion" value={form.occasion} onChange={(v: string) => setForm({ ...form, occasion: v })} options={occasions} />
              <SelectField label="Weather" value={form.weather} onChange={(v: string) => setForm({ ...form, weather: v })} options={weathers} />
              <SelectField label="Style Preference" value={form.stylePreference} onChange={(v: string) => setForm({ ...form, stylePreference: v })} options={styles} />

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Response language</label>
                <div className="flex gap-2">
                  {[{ value: 'en', label: '🇬🇧 English' }, { value: 'sw', label: '🇹🇿 Kiswahili' }].map(lang => (
                    <button
                      key={lang.value}
                      onClick={() => setForm({ ...form, language: lang.value })}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                        form.language === lang.value
                          ? 'bg-gold-gradient text-dark-950 shadow-lg shadow-gold-500/20'
                          : 'bg-gray-100 dark:bg-dark-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-dark-700'
                      }`}
                    >
                      {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <Button onClick={handleSubmit} loading={loading} className="w-full !py-4 text-base">
              <Sparkles size={20} />
              {loading ? 'Creating outfit...' : 'Get outfit recommendation'}
            </Button>
          </motion.div>

          {/* Result */}
          <div className="lg:col-span-3">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="card p-12 flex flex-col items-center justify-center text-center min-h-[400px]">
                  <div className="w-16 h-16 rounded-full bg-gold-gradient flex items-center justify-center mb-4 animate-pulse-gold">
                    <Shirt size={28} className="text-dark-950" />
                  </div>
                  <p className="text-gray-500 dark:text-gray-400">Curating your perfect outfit...</p>
                </motion.div>
              ) : result ? (
                <motion.div key="result" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                  {/* Outfit description */}
                  <div className="card p-6">
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                      <Shirt size={18} className="text-gold-500" /> Complete Outfit
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed mb-4">{result.outfit.description}</p>
                    {[
                      { label: 'Top', value: result.outfit.top },
                      { label: 'Bottom', value: result.outfit.bottom },
                      { label: 'Outerwear', value: result.outfit.outerwear },
                    ].filter(i => i.value).map(item => (
                      <div key={item.label} className="flex gap-3 text-sm mb-2">
                        <span className="font-semibold text-gray-700 dark:text-gray-300 w-20 flex-shrink-0">{item.label}:</span>
                        <span className="text-gray-600 dark:text-gray-400">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  {/* Colors */}
                  {result.colors.length > 0 && (
                    <div className="card p-5">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Color Story</h3>
                      <div className="flex gap-3 flex-wrap">
                        {result.colors.map(c => (
                          <div key={c.hex} className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg shadow-sm" style={{ backgroundColor: c.hex }} />
                            <div>
                              <div className="text-xs font-medium text-gray-700 dark:text-gray-300">{c.name}</div>
                              <div className="text-xs text-gray-400">{c.role}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Accessories + Shoes */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {result.accessories.length > 0 && (
                      <div className="card p-5">
                        <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Accessories</h3>
                        <ul className="space-y-1.5">
                          {result.accessories.map((a, i) => (
                            <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                              <span className="text-gold-500 mt-0.5">•</span>{a}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <div className="card p-5">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Shoes</h3>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{result.shoes.style}</p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{result.shoes.color}</p>
                      <p className="text-sm text-gray-400 mt-1">{result.shoes.description}</p>
                    </div>
                  </div>

                  {/* Styling tips */}
                  {result.stylingTips.length > 0 && (
                    <div className="card p-5">
                      <h3 className="font-semibold text-gray-900 dark:text-white mb-3 text-sm">Styling Tips</h3>
                      <ul className="space-y-2">
                        {result.stylingTips.map((tip, i) => (
                          <li key={i} className="text-sm text-gray-600 dark:text-gray-400 flex items-start gap-2">
                            <span className="w-5 h-5 rounded-full bg-gold-500/10 text-gold-500 flex-shrink-0 flex items-center justify-center text-xs font-bold">{i+1}</span>
                            {tip}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <Button onClick={handleSubmit} variant="outline" className="flex-1" loading={loading}>
                      <RefreshCw size={16} /> New recommendation
                    </Button>
                    <Button onClick={handleSave} variant="ghost" loading={saving}>
                      <Save size={16} /> Save
                    </Button>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                  className="card h-full min-h-[400px] flex flex-col items-center justify-center text-center p-12">
                  <Shirt size={48} className="text-gray-300 dark:text-gray-700 mb-4" />
                  <h3 className="font-semibold text-gray-500 dark:text-gray-400 mb-1">No outfit yet</h3>
                  <p className="text-sm text-gray-400 dark:text-gray-600">Fill in the form and get your personalized outfit</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>
    </div>
  );
}
