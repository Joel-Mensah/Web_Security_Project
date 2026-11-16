// mobile/expo-app/src/screens/LoginShared.jsx
import { Text, View } from 'react-native';
import { styles } from '../theme/styles';
import { API_BASE_URL } from '../api/client';

export function LoginShell({ title, subtitle, error, notice, children }) {
  return (
    <View style={styles.card}>
      <View style={styles.brandRow}>
        <View style={styles.brandIcon}>
          <Text style={styles.brandIconText}>EA</Text>
        </View>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
      </View>
      {!!error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}
      {!!notice && (
        <View style={styles.infoBox}>
          <Text style={styles.infoText}>{notice}</Text>
        </View>
      )}
      {children}
      <Text style={[styles.subtitle, { marginTop: 18, fontSize: 11 }]}>API: {API_BASE_URL}</Text>
    </View>
  );
}
