'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Sparkles, Mail, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/Button';
import { authApi } from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isAuthenticated } = useAuth();
  const [form, setForm] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) router.replace('/dashboard');
    if (searchParams.get('expired')) toast.error('Your session has expired. Please log in again.');
  }, [isAuthenticated, router, searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!form.email) errs.email = 'Email required';
    if (!form.password) errs.password = 'Password required';
    if (Object.keys(errs).length) { setErrors(errs); return; }

    setLoading(true);
    try {
      const res = await authApi.login(form);
      const { token, user } = res.data;
      login(token, user);
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}!`);
      router.push('/dashboard');
    } catch (err: any) {
      const data = err.response?.data;
      if (data?.code === 'UNVERIFIED') {
        toast.error(data.message);
        router.push(`/auth/verify?userId=${data.userId}`);
        return;
      }
      toast.error(data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-dark-950 flex-col justify-between p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-gold-500/20 via-transparent to-transparent" />
        <div className="relative">
          <Link href="/" className="flex items-center gap-2">
            <Sparkles size={24} className="text-gold-500" />
            <span className="font-display text-2xl font-bold gold-text">Fashion.co.tz</span>
          </Link>
        </div>
        <div className="relative">
          <div className="font-display text-4xl font-bold text-white leading-tight mb-4">
            Welcome back to<br /><span className="gold-text">Fashion.co.tz</span>
          </div>
          <p className="text-gray-400">Your AI fashion studio is waiting for you.</p>
        </div>
        <div className="text-sm text-gray-500 relative">© {new Date().getFullYear()} Fashion.co.tz</div>
      </div>

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

          <h1 className="font-display text-3xl font-bold text-gray-900 dark:text-white mb-2">Sign in</h1>
          <p className="text-gray-500 dark:text-gray-400 mb-8">Enter your credentials to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
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
            <div>
              <Input
                label="Password"
                type="password"
                placeholder="Your password"
                icon={<Lock size={16} />}
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                error={errors.password}
                autoComplete="current-password"
              />
              <div className="flex justify-end mt-1.5">
                <Link href="/auth/forgot-password" className="text-xs text-gold-500 hover:underline">
                  Forgot password?
                </Link>
              </div>
            </div>
            <Button type="submit" loading={loading} className="w-full !py-3.5">
              Sign in
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
            Don't have an account?{' '}
            <Link href="/auth/signup" className="text-gold-500 font-medium hover:underline">Create one free</Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
