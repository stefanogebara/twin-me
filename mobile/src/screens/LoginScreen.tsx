import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { COLORS } from '../constants';

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
}

export function LoginScreen({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      await onLogin(email.trim(), password);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      Alert.alert('Login failed', msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.inner}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/flower-hero.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Twin Me</Text>
          <Text style={styles.subtitle}>Your soul signature, in your pocket</Text>
        </View>

        {/* Glass card form */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome back</Text>

          <Text style={styles.label}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={COLORS.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={COLORS.textMuted}
            secureTextEntry
            autoComplete="password"
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.buttonText}>Sign in</Text>
            }
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>
          Use the same credentials as the TwinMe web app.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: {
    width: 96,
    height: 96,
    marginBottom: 20,
  },
  title: {
    fontSize: 38,
    fontFamily: 'Halant_600SemiBold',
    color: COLORS.text,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
    marginTop: 6,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 24,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cardTitle: {
    fontSize: 20,
    fontFamily: 'Halant_500Medium',
    color: COLORS.text,
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontFamily: 'Inter_500Medium',
    color: COLORS.text,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: COLORS.text,
    backgroundColor: 'rgba(255,255,255,0.7)',
    marginBottom: 16,
  },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
  },
  hint: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
    marginTop: 28,
  },
});
