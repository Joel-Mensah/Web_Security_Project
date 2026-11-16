// mobile/expo-app/src/screens/RecoveryStep.jsx
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { styles } from '../theme/styles';
import { onlyDigits } from './loginState';

export function RecoveryStep({
  username, setUsername, resetCode, setResetCode,
  newPassword, setNewPassword, loading, onSendCode, onReset, onBack,
}) {
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
      <TouchableOpacity style={styles.ghostButton} onPress={onSendCode} disabled={loading}>
        <Text style={styles.ghostButtonText}>Send reset code</Text>
      </TouchableOpacity>
      <Text style={styles.label}>6-digit email code</Text>
      <TextInput
        style={[styles.input, styles.otpInput]}
        value={resetCode}
        onChangeText={(v) => setResetCode(onlyDigits(v))}
        keyboardType="number-pad"
        maxLength={6}
        placeholder="000000"
        placeholderTextColor="#64748b"
      />
      <Text style={styles.label}>New password (min 10 chars)</Text>
      <TextInput
        style={styles.input}
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
        placeholder="New password"
        placeholderTextColor="#64748b"
      />
      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={onReset}
        disabled={loading}
      >
        {loading ? <ActivityIndicator color="#04120c" /> : <Text style={styles.buttonText}>Reset password</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.linkButton} onPress={onBack}>
        <Text style={styles.linkText}>Back to sign in</Text>
      </TouchableOpacity>
    </View>
  );
}
