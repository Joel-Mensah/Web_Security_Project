// mobile/expo-app/src/screens/useLoginFlow.js
import { useState } from 'react';
import { useRouter } from 'expo-router';
import { authApi } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { onlyDigits, startLogin } from './loginState';

export function useLoginFlow() {
  const router = useRouter();
  const { login } = useAuth();
  const [step, setStep] = useState('credentials');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingToken, setPendingToken] = useState('');
  const [qr, setQr] = useState({ qrDataUrl: '', manualCode: '' });
  const [maskedEmail, setMaskedEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const submitCredentials = async () => {
    setError('');
    setNotice('');
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setLoading(true);
    try {
      const result = await startLogin(username, password);
      setPendingToken(result.pendingToken);
      setCode('');
      if (result.qr) setQr(result.qr);
      setStep(result.next);
    } catch (err) {
      setError(err.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const verifyWith = async (kind) => {
    if (onlyDigits(code).length !== 6) {
      setError('Enter the 6-digit code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data =
        kind === 'totp'
          ? await authApi.verify2fa(pendingToken, code.trim())
          : await authApi.verifyEmailOtp(pendingToken, code.trim());
      await login(data);
      router.replace('/(tabs)/dashboard');
    } catch (err) {
      setError(err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  const switchToEmail = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await authApi.sendEmailOtp(pendingToken);
      setMaskedEmail(data.maskedEmail || '');
      setCode('');
      setStep('email-otp');
    } catch (err) {
      setError(err.message || 'Failed to send verification email');
    } finally {
      setLoading(false);
    }
  };

  const sendResetCode = async () => {
    if (!username.trim()) {
      setError('Enter your username first, then request a reset code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await authApi.requestPasswordReset(username.trim().toLowerCase());
      setNotice(data.message || 'If an active account matches that username, a code was sent.');
    } catch (err) {
      setError(err.message || 'Could not request a reset code.');
    } finally {
      setLoading(false);
    }
  };

  const submitReset = async () => {
    if (onlyDigits(resetCode).length !== 6 || newPassword.length < 10) {
      setError('Enter the 6-digit email code and a password of at least 10 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await authApi.resetPassword(
        username.trim().toLowerCase(),
        resetCode.trim(),
        newPassword
      );
      setNotice(data.message || 'Password reset. Sign in with your new password.');
      setStep('credentials');
      setPassword('');
    } catch (err) {
      setError(err.message || 'Could not reset the password.');
    } finally {
      setLoading(false);
    }
  };

  return {
    step, setStep, setError, setNotice,
    username, setUsername, password, setPassword,
    code, setCode, qr, maskedEmail, resetCode, setResetCode,
    newPassword, setNewPassword, error, notice, loading,
    submitCredentials, verifyWith, switchToEmail, sendResetCode, submitReset,
  };
}
