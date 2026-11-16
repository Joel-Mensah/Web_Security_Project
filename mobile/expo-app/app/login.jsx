// mobile/expo-app/app/login.jsx — composes the split login steps
import { KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { styles } from '../src/theme/styles';
import { LoginShell } from '../src/screens/LoginShared';
import { CodeStep, CredentialsStep, QrSetupStep } from '../src/screens/LoginSteps';
import { RecoveryStep } from '../src/screens/RecoveryStep';
import { useLoginFlow } from '../src/screens/useLoginFlow';

const TITLES = {
  credentials: ['Enterprise Auth', 'Sign in with your account password'],
  'qr-setup': ['Set up 2FA', 'Scan this code in your authenticator app'],
  totp: ['Two-factor check', 'Enter your 6-digit authenticator code'],
  'email-otp': ['Email backup code', 'Enter the code sent to your email'],
  'password-recovery': ['Recover your account', 'Reset your password by email'],
};

export default function LoginScreen() {
  const f = useLoginFlow();
  const [title, subtitle] = TITLES[f.step];
  const emailSubtitle =
    f.step === 'email-otp' && f.maskedEmail ? `${subtitle} (${f.maskedEmail})` : subtitle;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <LoginShell title={title} subtitle={emailSubtitle} error={f.error} notice={f.notice}>
          {f.step === 'credentials' && (
            <CredentialsStep
              username={f.username}
              setUsername={f.setUsername}
              password={f.password}
              setPassword={f.setPassword}
              loading={f.loading}
              onSubmit={f.submitCredentials}
              onForgot={() => {
                f.setError('');
                f.setNotice('');
                f.setStep('password-recovery');
              }}
            />
          )}
          {f.step === 'qr-setup' && (
            <QrSetupStep qr={f.qr} code={f.code} setCode={f.setCode} loading={f.loading} onVerify={() => f.verifyWith('totp')} />
          )}
          {f.step === 'totp' && (
            <CodeStep
              label="Authenticator code"
              code={f.code}
              setCode={f.setCode}
              loading={f.loading}
              primaryLabel="Verify"
              onPrimary={() => f.verifyWith('totp')}
              ghostLabel="Use email code instead"
              onGhost={f.switchToEmail}
              backLabel="Back to sign in"
              onBack={() => {
                f.setStep('credentials');
                f.setError('');
              }}
            />
          )}
          {f.step === 'email-otp' && (
            <CodeStep
              label="Email code"
              code={f.code}
              setCode={f.setCode}
              loading={f.loading}
              primaryLabel="Verify email code"
              onPrimary={() => f.verifyWith('email')}
              ghostLabel="Resend email code"
              onGhost={f.switchToEmail}
              backLabel="Back to authenticator"
              onBack={() => {
                f.setStep('totp');
                f.setError('');
              }}
            />
          )}
          {f.step === 'password-recovery' && (
            <RecoveryStep
              username={f.username}
              setUsername={f.setUsername}
              resetCode={f.resetCode}
              setResetCode={f.setResetCode}
              newPassword={f.newPassword}
              setNewPassword={f.setNewPassword}
              loading={f.loading}
              onSendCode={f.sendResetCode}
              onReset={f.submitReset}
              onBack={() => {
                f.setStep('credentials');
                f.setError('');
              }}
            />
          )}
        </LoginShell>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
