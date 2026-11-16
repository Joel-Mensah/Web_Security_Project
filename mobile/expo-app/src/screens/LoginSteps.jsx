// mobile/expo-app/src/screens/LoginSteps.jsx
import { ActivityIndicator, Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { styles } from '../theme/styles';
import { styles2 } from '../theme/styles2';
import { onlyDigits } from './loginState';

export function CredentialsStep({ username, setUsername, password, setPassword, loading, onSubmit, onForgot }) {
  return (
    <View>
      <Text style={styles.label}>Username</Text>
      <TextInput
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Username"
        placeholderTextColor="#64748b"
      />
      <Text style={styles.label}>Password</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="Password"
        placeholderTextColor="#64748b"
        onSubmitEditing={onSubmit}
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={onSubmit}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#04120c" /> : <Text style={styles.buttonText}>Continue</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkButton} onPress={onForgot}>
        <Text style={styles.linkText}>Forgot password?</Text>
      </TouchableOpacity>
    </View>
  );
}

export function QrSetupStep({ qr, code, setCode, loading, onVerify }) {
  return (
    <View>
      {!!qr?.qrDataUrl && (
        <Image source={{ uri: qr.qrDataUrl }} style={styles2.qrCode} resizeMode="contain" />
      )}
      {!!qr?.manualCode && <Text style={styles2.manualCode}>{qr.manualCode}</Text>}
      <Text style={styles.label}>6-digit code</Text>
      <TextInput
        style={[styles.input, styles.otpInput]}
        value={code}
        onChangeText={(v) => setCode(onlyDigits(v))}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="000000"
        placeholderTextColor="#64748b"
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={onVerify}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#04120c" /> : <Text style={styles.buttonText}>Verify and continue</Text>}
      </TouchableOpacity>
    </View>
  );
}

export function CodeStep({
  label,
  code,
  setCode,
  loading,
  primaryLabel,
  onPrimary,
  ghostLabel,
  onGhost,
  backLabel,
  onBack,
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, styles.otpInput]}
        value={code}
        onChangeText={(v) => setCode(onlyDigits(v))}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="000000"
        placeholderTextColor="#64748b"
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={onPrimary}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#04120c" /> : <Text style={styles.buttonText}>{primaryLabel}</Text>}
      </TouchableOpacity>
      {!!ghostLabel && (
        <TouchableOpacity style={styles.ghostButton} onPress={onGhost} disabled={loading}>
          <Text style={styles.ghostButtonText}>{ghostLabel}</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity style={styles.linkButton} onPress={onBack}>
        <Text style={styles.linkText}>{backLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}
