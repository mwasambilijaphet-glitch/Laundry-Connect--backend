'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Star, Phone, CheckCircle, XCircle, Clock, Loader2, ArrowRight } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '@/components/layout/Navbar';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { paymentApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

type PaymentState = 'idle' | 'initiating' | 'polling' | 'success' | 'failed';

const POLL_INTERVAL_MS = 5000;
const MAX_POLLS = 36; // 3 minutes

export default function SubscribePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [state, setState] = useState<PaymentState>('idle');
  const [subscriptionId, setSubscriptionId] = useState<string | null>(null);
  const [expiryDate, setExpiryDate] = useState<string | null>(null);
  const [currentSub, setCurrentSub] = useState<any>(null);
  const [pollCount, setPollCount] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) { router.replace('/auth/login'); return; }
    paymentApi.mySubscription().then(res => setCurrentSub(res.data)).catch(() => {});
  }, [user, authLoading, router]);

  const pollStatus = useCallback(async (subId: string, count: number) => {
    if (count >= MAX_POLLS) {
      setState('failed');
      toast.error('Payment verification timed out. If you were charged, please contact support.');
      return;
    }
    try {
      const res = await paymentApi.pollStatus(subId);
      const { status, expiryDate: exp } = res.data;
      if (status === 'active') {
        setState('success');
        setExpiryDate(exp);
        toast.success('Subscription activated! 🎉');
        return;
      }
      if (status === 'failed') {
        setState('failed');
        toast.error('Payment failed or was cancelled.');
        return;
      }
      // Still pending — poll again
      setPollCount(count + 1);
      setTimeout(() => pollStatus(subId, count + 1), POLL_INTERVAL_MS);
    } catch {
      setTimeout(() => pollStatus(subId, count + 1), POLL_INTERVAL_MS);
    }
  }, []);

  const handleSubscribe = async () => {
    const cleanPhone = phone.trim();
    if (!/^(\+?255|0)[67]\d{8}$/.test(cleanPhone)) {
      setPhoneError('Enter a valid Tanzanian number (e.g. 0712345678)');
      return;
    }
    setPhoneError('');
    setState('initiating');

    try {
      const res = await paymentApi.subscribe(cleanPhone);
      const { subscriptionId: subId } = res.data;
      setSubscriptionId(subId);
      setState('polling');
      setPollCount(0);
      toast.success('Check your phone for the M-Pesa prompt!');
      setTimeout(() => pollStatus(subId, 0), POLL_INTERVAL_MS);
    } catch (err: any) {
      setState('idle');
      toast.error(err.response?.data?.message || 'Payment initiation failed. Please try again.');
    }
  };

  if (!authLoading && !user) return null;

  const isActive = currentSub?.isActive;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-950">
      <Navbar />
      <main className="max-w-2xl mx-auto px-4 pt-24 pb-16">

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-10">
            <div className="w-16 h-16 rounded-full bg-gold-gradient flex items-center justify-center mx-auto mb-4 shadow-xl shadow-gold-500/30">
              <Star size={28} className="text-dark-950" fill="currentColor" />
            </div>
            <h1 className="font-display text-4xl font-bold text-gray-900 dark:text-white mb-2">
              {isActive ? 'Your Subscription' : 'Subscribe to Fashion.co.tz'}
            </h1>
            <p className="text-gray-500 dark:text-gray-400">
              {isActive ? 'Your subscription is active and running' : 'Unlock all AI-powered features for just 5,000 TZS per week'}
            </p>
          </div>

          {/* Active subscription */}
          {isActive && currentSub.subscription && (
            <div className="card p-8 mb-6 border-green-500/20 bg-green-500/5">
              <div className="flex items-center gap-3 mb-6">
                <CheckCircle size={24} className="text-green-500" />
                <h2 className="font-semibold text-gray-900 dark:text-white text-lg">Subscription Active</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-dark-900 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1">Started</div>
                  <div className="font-semibold text-gray-800 dark:text-white">
                    {new Date(currentSub.subscription.start_date).toLocaleDateString('en-TZ', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-dark-900 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1">Expires</div>
                  <div className="font-semibold text-gray-800 dark:text-white">
                    {new Date(currentSub.subscription.expiry_date).toLocaleDateString('en-TZ', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-dark-900 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1">Amount</div>
                  <div className="font-semibold text-gray-800 dark:text-white">5,000 TZS</div>
                </div>
                <div className="bg-gray-50 dark:bg-dark-900 rounded-xl p-4">
                  <div className="text-xs text-gray-400 mb-1">Status</div>
                  <div className="badge-active">Active</div>
                </div>
              </div>
              <Button
                onClick={() => router.push('/dashboard')}
                className="w-full mt-6"
              >
                Go to Dashboard <ArrowRight size={16} />
              </Button>
            </div>
          )}

          {/* Success state */}
          {state === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="card p-8 text-center border-green-500/20 bg-green-500/5"
            >
              <CheckCircle size={48} className="text-green-500 mx-auto mb-4" />
              <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">Payment Successful!</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                Your subscription is now active.
                {expiryDate && ` It expires on ${new Date(expiryDate).toLocaleDateString('en-TZ', { weekday: 'long', month: 'long', day: 'numeric' })}.`}
              </p>
              <Button onClick={() => router.push('/dashboard')}>
                Start designing <ArrowRight size={16} />
              </Button>
            </motion.div>
          )}

          {/* Failed state */}
          {state === 'failed' && (
            <div className="card p-8 text-center mb-6 border-red-500/20">
              <XCircle size={48} className="text-red-500 mx-auto mb-4" />
              <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">Payment Failed</h2>
              <p className="text-gray-500 dark:text-gray-400 mb-6">The payment was not completed. Please try again.</p>
              <Button onClick={() => setState('idle')} variant="outline">Try again</Button>
            </div>
          )}

          {/* Polling state */}
          {state === 'polling' && (
            <div className="card p-8 text-center mb-6">
              <div className="w-16 h-16 rounded-full bg-gold-gradient flex items-center justify-center mx-auto mb-4 animate-pulse-gold">
                <Clock size={28} className="text-dark-950" />
              </div>
              <h2 className="font-display text-2xl font-bold text-gray-900 dark:text-white mb-2">
                Waiting for payment...
              </h2>
              <p className="text-gray-500 dark:text-gray-400 mb-4">
                Complete the M-Pesa prompt on your phone. This page will update automatically.
              </p>
              <div className="flex items-center justify-center gap-2 text-gold-500 text-sm">
                <Loader2 size={16} className="animate-spin" />
                Checking payment status... ({Math.round((MAX_POLLS - pollCount) * POLL_INTERVAL_MS / 60000)} min remaining)
              </div>
            </div>
          )}

          {/* Subscribe form */}
          {!isActive && state === 'idle' && (
            <>
              {/* Plan card */}
              <div className="card p-8 mb-6 relative overflow-hidden">
                <div className="absolute top-0 inset-x-0 h-1 bg-gold-gradient" />
                <div className="flex items-start justify-between mb-6">
                  <div>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-gold-500/10 text-gold-500 text-xs font-semibold mb-3">
                      <Star size={12} fill="currentColor" /> PREMIUM WEEKLY
                    </div>
                    <div className="font-display text-5xl font-black text-gray-900 dark:text-white">
                      5,000 <span className="text-2xl text-gray-400 font-normal">TZS</span>
                    </div>
                    <div className="text-gold-500 font-medium mt-1">per week · cancel anytime</div>
                  </div>
                </div>
                <ul className="space-y-3 mb-0">
                  {['AI Clothing Design (unlimited)', 'Smart Outfit Recommendations', 'Bilingual Assistant (Swahili + English)', 'Designer Portfolio access', 'Save & download designs', '7-day access'].map(f => (
                    <li key={f} className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                      <CheckCircle size={16} className="text-green-500 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Phone input */}
              <div className="card p-6">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-4">Pay via M-Pesa</h3>
                <Input
                  label="Your Tanzanian phone number"
                  type="tel"
                  placeholder="0712345678 or +255712345678"
                  icon={<Phone size={16} />}
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  error={phoneError}
                />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-2 mb-4">
                  You will receive an M-Pesa push notification to complete the payment of 5,000 TZS.
                </p>
                <Button
                  onClick={handleSubscribe}
                  loading={state === 'initiating'}
                  className="w-full !py-4 text-base"
                >
                  Pay 5,000 TZS via M-Pesa
                </Button>
                <p className="text-xs text-center text-gray-400 mt-3">
                  Payments processed securely by Snippe.sh · No card required
                </p>
              </div>
            </>
          )}
        </motion.div>
      </main>
    </div>
  );
}
