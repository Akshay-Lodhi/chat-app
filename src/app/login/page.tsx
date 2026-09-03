'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/useAuthStore';
import { authClient } from '../../lib/auth';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Phone, ShieldCheck, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState<'PHONE' | 'OTP'>('PHONE');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const setAuth = useAuthStore(state => state.setAuth);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const digitsOnly = phoneNumber.replace(/\D/g, '');
    if (digitsOnly.length !== 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await authClient.phoneNumber.sendOtp({ phoneNumber });
      if (error) {
        setError(error.message || 'Failed to send OTP');
      } else {
        setStep('OTP');
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const { data, error } = await authClient.phoneNumber.verify({ phoneNumber, code: otp });
      if (error) {
        setError(error.message || 'Invalid OTP');
      } else if (data) {
        setAuth('better-auth-session', data.user as any);
        window.location.href = '/chat';
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-background overflow-hidden flex items-center justify-center p-4 font-sans text-text-primary selection:bg-primary/30">
      {/* Background gradients */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-accent/20 blur-[120px] animate-pulse" style={{ animationDelay: '2s' }} />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md relative z-10"
      >
        <div className="glass rounded-3xl p-8 shadow-2xl">
          <div className="flex flex-col items-center mb-10">
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
              className="w-20 h-20 mb-6 bg-gradient-to-tr from-primary to-accent rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20"
            >
              <img src="/logo.svg" alt="Logo" className="w-12 h-12 object-contain filter invert opacity-90" />
            </motion.div>
            <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/60 mb-3 tracking-tight">NexusChat</h1>
            <p className="text-text-secondary text-sm text-center font-medium">
              {step === 'PHONE' ? 'Sign in to sync your messages' : 'Verify your identity'}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-danger/10 border border-danger/20 text-danger p-4 rounded-xl mb-6 text-sm text-center flex items-center justify-center gap-2"
              >
                <ShieldCheck size={16} /> {error}
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait">
            {step === 'PHONE' ? (
              <motion.form 
                key="phone-form"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                onSubmit={handleRequestOtp} 
                className="space-y-6"
              >
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-text-tertiary group-focus-within:text-primary transition-colors">
                    <Phone size={18} />
                  </div>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full bg-surface/50 text-text-primary border border-surface-border focus:border-primary focus:ring-1 focus:ring-primary/50 outline-none pl-12 pr-4 py-4 rounded-xl transition-all placeholder:text-text-tertiary"
                    placeholder="Enter phone number"
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={!phoneNumber || isLoading}
                  className="w-full bg-primary text-white font-medium py-4 rounded-xl hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 group shadow-lg shadow-primary/20"
                >
                  {isLoading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>Continue <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" /></>
                  )}
                </button>
              </motion.form>
            ) : (
              <motion.form 
                key="otp-form"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleVerifyOtp} 
                className="space-y-6"
              >
                <div className="relative">
                  <input
                    type="text"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="w-full bg-surface/50 text-text-primary border border-surface-border focus:border-primary focus:ring-1 focus:ring-primary/50 outline-none px-4 py-4 rounded-xl transition-all placeholder:text-text-tertiary text-center tracking-[1em] font-mono text-2xl"
                    placeholder="----"
                    maxLength={4}
                    autoFocus
                  />
                </div>
                <button
                  type="submit"
                  disabled={otp.length !== 4 || isLoading}
                  className="w-full bg-primary text-white font-medium py-4 rounded-xl hover:bg-primary-hover transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2 shadow-lg shadow-primary/20"
                >
                  {isLoading ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>Verify & Login <ShieldCheck size={18} /></>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setStep('PHONE')}
                  className="w-full bg-transparent text-text-secondary font-medium py-3 rounded-xl hover:bg-surface transition-colors text-sm"
                >
                  Change phone number
                </button>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
        <p className="text-center text-text-tertiary text-xs mt-6 flex items-center justify-center gap-1">
          <ShieldCheck size={14} className="text-success" /> Secured by end-to-end encryption.
        </p>
      </motion.div>
    </div>
  );
}
