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
        // We no longer manually manage tokens since Better Auth sets secure cookies.
        // We just update the Zustand store with the user data for UI purposes.
        setAuth('better-auth-session', data.user as any);
        router.push('/chat');
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
          <div className="w-16 h-16 bg-[#00A884] rounded-full flex items-center justify-center mb-4 shadow-[0_0_20px_rgba(0,168,132,0.4)]">
            <svg viewBox="0 0 24 24" className="w-8 h-8 text-white" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
            </svg>
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
