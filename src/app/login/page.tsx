'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/useAuthStore';
import { authClient } from '../../lib/auth';

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
        // Force full page reload to /chat so Better Auth initializes session with fresh cookies
        window.location.href = '/chat';
      }
    } catch (err) {
      setError('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111B21] flex items-center justify-center p-4 font-sans text-[#E9EDEF]">
      <div className="w-full max-w-md bg-[#202C33] rounded-lg shadow-2xl p-8 transform transition-all">
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 mb-4 flex items-center justify-center">
            <img src="/logo.svg" alt="Logo" className="w-full h-full object-contain" />
          </div>
          <h1 className="text-2xl font-light text-white mb-2">NexusChat</h1>
          <p className="text-[#8696A0] text-sm text-center">
            {step === 'PHONE' ? 'Enter your phone number to continue' : 'Enter the OTP sent to your phone'}
          </p>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded mb-6 text-sm text-center">
            {error}
          </div>
        )}

        {step === 'PHONE' ? (
          <form onSubmit={handleRequestOtp} className="space-y-6">
            <div>
              <label className="block text-[#8696A0] text-xs font-semibold mb-2 uppercase tracking-wider">Phone Number</label>
              <input
                type="text"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                className="w-full bg-[#2A3942] text-[#E9EDEF] border-b-2 border-[#00A884] focus:outline-none focus:border-[#00A884] px-4 py-3 rounded-t transition-colors placeholder-[#8696A0]"
                placeholder="+1 234 567 8900"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!phoneNumber || isLoading}
              className="w-full bg-[#00A884] text-[#111B21] font-bold py-3 px-4 rounded hover:bg-[#00BFA5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide text-sm flex justify-center items-center"
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5 text-[#111B21]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : 'Next'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp} className="space-y-6">
            <div>
              <label className="block text-[#8696A0] text-xs font-semibold mb-2 uppercase tracking-wider">OTP Code (Default: 4321)</label>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                className="w-full bg-[#2A3942] text-[#E9EDEF] border-b-2 border-[#00A884] focus:outline-none focus:border-[#00A884] px-4 py-3 rounded-t transition-colors placeholder-[#8696A0] text-center tracking-[1em] font-mono text-xl"
                placeholder="----"
                maxLength={4}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={otp.length !== 4 || isLoading}
              className="w-full bg-[#00A884] text-[#111B21] font-bold py-3 px-4 rounded hover:bg-[#00BFA5] transition-colors disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wide text-sm flex justify-center items-center"
            >
              {isLoading ? (
                <svg className="animate-spin h-5 w-5 text-[#111B21]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              ) : 'Verify & Login'}
            </button>
            <button
              type="button"
              onClick={() => setStep('PHONE')}
              className="w-full bg-transparent text-[#00A884] font-semibold py-3 px-4 rounded hover:bg-[#2A3942] transition-colors uppercase tracking-wide text-xs mt-2"
            >
              Back to Phone
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
