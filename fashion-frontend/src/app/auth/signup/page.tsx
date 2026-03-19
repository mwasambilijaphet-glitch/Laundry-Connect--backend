'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sparkles, Mail, Lock, User, Globe } from 'lucide-react';
import toast from 'react-hot-toast';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { authApi } from '@/lib/api';

export default function SignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '', email: '', password: '', preferredLanguage: 'en',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'Full name is required';
    if (!/\S+@\S+\.\S+/.test(form.email)) e.email = 'Valid email required';
    if (form.password.length < 8) e.password = 'Password must be at least 8 characters';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await authApi.signup(form);
      const userId = res.data.userId;
      toast.success('Account created! Check your email for a verification code.');
      router.push(`/auth/verify?userId=${userId}`);
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Signup failed. Please try again.';
      toast.error(msg);
      if (err.response?.data?.errors) {
        const apiErrors: Record<string, string> = {};
        err.response.data.errors.forEach((e: any) => { apiErrors[e.path] = e.msg; });
        setErrors(apiErrors);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel */}
      <div className="hidden lg:flex lg:w-1/2 bg-dark-950 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-gold-500/20 via-transparent to-transparent" />
        <div className="relative">
          <Link href="/" className="flex items-center gap-2">
            <Sparkles size={24} className="text-gold-500" />
            <span className="font-display text-2xl font-bold gold-text">Fashion.co.tz</span>
          </Link>
        </div>
        <div className="relative">
          <div className="font-display text-4xl font-bold text-white leading-tight mb-4">
            Design the future<br />of <span className="gold-text">African fashion</span>
          </div>
          <p className="text-gray-400 leading-relaxed">
            Join thousands of designers, stylists, and fashion lovers building the future of East African style with AI.
          </p>
        </div>
        <div className="relative text-sm text-gray-500">
          Already used by 1,000+ designers in Tanzania
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-6 bg-white dark:bg-dark-950">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <Sparkles size={22} className="text-gold-500" />
            <span className="font-display text-xl font-bold gold-text">Fashion.co.tz</span>
          </div>

          <h1 className="font-display text-3xl font-bold text-gray-900 dark:text-white mb-2">Create account</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">Start your AI fashion journey today</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full name"
              placeholder="Amina Hassan"
              icon={<User size={16} />}
              value={form.fullName}
              onChange={e => setForm({ ...form, fullName: e.target.value })}
              error={errors.fullName}
              autoComplete="name"
            />
            <Input
              label="Email address"
              type="email"
              placeholder="you@example.com"
              icon={<Mail size={16} />}
              value={form.email}
              onChange={e => setForm({ ...form, email: e.target.value })}
              error={errors.email}
              autoComplete="email"
            />
            <Input
              label="Password"
              type="password"
              placeholder="Min. 8 characters"
              icon={<Lock size={16} />}
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              error={errors.password}
              autoComplete="new-password"
            />

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                <Globe size={14} className="inline mr-1.5 mb-0.5" />
                Preferred language
              </label>
              <select
                value={form.preferredLanguage}
                onChange={e => setForm({ ...form, preferredLanguage: e.target.value })}
                className="input-field"
              >
                <option value="en">English</option>
                <option value="sw">Kiswahili</option>
              </select>
            </div>

            <Button type="submit" loading={loading} className="w-full !py-3.5">
              Create account
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-gold-500 font-medium hover:underline">Sign in</Link>
          </p>

          <p className="mt-4 text-center text-xs text-gray-400">
            By creating an account you agree to our{' '}
            <Link href="/terms" className="underline">Terms</Link> and{' '}
            <Link href="/privacy" className="underline">Privacy Policy</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
