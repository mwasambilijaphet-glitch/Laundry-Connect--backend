'use client';
import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Sparkles, Mail, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import Button from '@/components/ui/Button';
import { authApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

export default function VerifyPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login } = useAuth();
  const userId = searchParams.get('userId') || '';

  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (!userId) { router.replace('/auth/signup'); return; }
    const timer = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { setCanResend(true); clearInterval(timer); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [userId, router]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = otp.join('');
    if (code.length !== 6) { toast.error('Enter the complete 6-digit code'); return; }
    setLoading(true);
    try {
      const res = await authApi.verifyOtp({ userId, otp: code });
      const { token, user } = res.data;
      login(token, user);
      toast.success('Email verified! Welcome to Fashion.co.tz 🎉');
      router.push('/dashboard');
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Invalid code. Please try again.');
      setOtp(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    try {
      await authApi.resendOtp(userId);
      toast.success('New code sent to your email');
      setCountdown(60);
      setCanResend(false);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to resend code');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white dark:bg-dark-950 px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md text-center"
      >
        <Link href="/" className="inline-flex items-center gap-2 mb-10">
          <Sparkles size={22} className="text-gold-500" />
          <span className="font-display text-xl font-bold gold-text">Fashion.co.tz</span>
        </Link>

        <div className="w-16 h-16 rounded-full bg-gold-gradient flex items-center justify-center mx-auto mb-6 shadow-xl shadow-gold-500/30">
          <Mail size={28} className="text-dark-950" />
        </div>

        <h1 className="font-display text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Check your email
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mb-8">
          We sent a 6-digit verification code to your email address. Enter it below.
        </p>

        <div className="flex gap-3 justify-center mb-8" onPaste={handlePaste}>
          {otp.map((digit, i) => (
            <input
              key={i}
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={e => handleChange(i, e.target.value)}
              onKeyDown={e => handleKeyDown(i, e)}
              className="w-12 h-14 text-center text-xl font-bold rounded-xl border-2
                         border-gray-200 dark:border-dark-700 bg-gray-50 dark:bg-dark-900
                         text-gray-900 dark:text-white
                         focus:outline-none focus:border-gold-500 focus:ring-2 focus:ring-gold-500/20
                         transition-all duration-200"
            />
          ))}
        </div>

        <Button onClick={handleVerify} loading={loading} className="w-full !py-3.5 mb-4">
          Verify email
        </Button>

        <div className="text-sm text-gray-500 dark:text-gray-400">
          Didn't receive it?{' '}
          {canResend ? (
            <button
              onClick={handleResend}
              disabled={resendLoading}
              className="text-gold-500 font-medium hover:underline disabled:opacity-50"
            >
              {resendLoading ? 'Sending...' : 'Resend code'}
            </button>
          ) : (
            <span className="text-gray-400">Resend in {countdown}s</span>
          )}
        </div>

        <Link href="/auth/login" className="inline-flex items-center gap-1.5 mt-6 text-sm text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <ArrowLeft size={14} /> Back to sign in
        </Link>
      </motion.div>
    </div>
  );
}
