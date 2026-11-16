// mobile/expo-app/src/theme/styles.js — part 1: layout + auth controls
import { StyleSheet, Appearance } from 'react-native';
import { getColors } from './tokens';

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: getColors('dark').bg },
  container: { flex: 1, padding: 20, justifyContent: 'center', backgroundColor: getColors('dark').bg },
  scrollContent: { padding: 16, paddingBottom: 48, backgroundColor: getColors('dark').bg },
  card: {
    backgroundColor: getColors('dark').card,
    borderColor: getColors('dark').cardBorder,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
  },
  brandRow: { alignItems: 'center', marginBottom: 20 },
  brandIcon: {
    width: 56, height: 56, borderRadius: 18,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
  },
  brandIconText: { color: getColors('dark').primary, fontSize: 26, fontWeight: '800' },
  title: { color: getColors('dark').text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  subtitle: { color: getColors('dark').muted, fontSize: 13, marginTop: 6, textAlign: 'center' },
  label: {
    color: getColors('dark').muted, fontSize: 12, fontWeight: '700',
    letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8, marginTop: 14,
  },
  input: {
    backgroundColor: 'rgba(148, 163, 184, 0.08)',
    borderColor: getColors('dark').cardBorder, borderWidth: 1, borderRadius: 12,
    color: getColors('dark').text, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15,
  },
  textArea: { minHeight: 110, textAlignVertical: 'top' },
  otpInput: { textAlign: 'center', fontSize: 22, letterSpacing: 8, fontWeight: '800' },
  button: {
    backgroundColor: getColors('dark').primary, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center', marginTop: 20,
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: '#04120c', fontSize: 15, fontWeight: '800' },
  ghostButton: {
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
    borderWidth: 1, borderColor: getColors('dark').cardBorder,
  },
  ghostButtonText: { color: getColors('dark').text, fontSize: 14, fontWeight: '600' },
  linkButton: { marginTop: 14, alignItems: 'center' },
  linkText: { color: getColors('dark').primary, fontSize: 13, fontWeight: '700' },
  errorBox: {
    backgroundColor: 'rgba(244, 63, 94, 0.12)',
    borderColor: 'rgba(244, 63, 94, 0.35)',
    borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 14,
  },
  errorText: { color: '#fda4af', fontSize: 13 },
  infoBox: {
    backgroundColor: 'rgba(56, 189, 248, 0.10)',
    borderColor: 'rgba(56, 189, 248, 0.28)',
    borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 14,
  },
  infoText: { color: '#bae6fd', fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center' },
});
