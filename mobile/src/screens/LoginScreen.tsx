import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Image,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView,
} from 'react-native';
import { COLORS } from '../constants';

interface Props {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, firstName: string, lastName: string) => Promise<void>;
  onGoogleLogin: () => Promise<void>;
}

export function LoginScreen({ onLogin, onSignup, onGoogleLogin }: Props) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setError('');

    if (!email.trim() || !password.trim()) {
      setError('Please enter your email and password.');
      return;
    }
    if (mode === 'signup' && !firstName.trim()) {
      setError('Please enter your first name.');
      return;
    }
    if (mode === 'signup' && password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }

    setLoading(true);
    try {
      if (mode === 'signin') {
        await onLogin(email.trim(), password);
      } else {
        await onSignup(email.trim(), password, firstName.trim(), lastName.trim());
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  function switchMode() {
    setMode(m => m === 'signin' ? 'signup' : 'signin');
    setError('');
  }

  const isSignUp = mode === 'signup';

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
        {/* Header */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/flower-hero.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>
            {isSignUp ? 'Create Your\nSoul Signature' : 'Discover Your\nSoul Signature'}
          </Text>
          <Text style={styles.subtitle}>
            {isSignUp
              ? 'Begin your journey of authentic self-discovery'
              : 'Sign in to continue your journey'}
          </Text>
        </View>

        {/* Error */}
        {error !== '' && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Card */}
        <View style={styles.card}>

          {/* Sign up extra fields */}
          {isSignUp && (
            <View style={styles.nameRow}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>First name</Text>
                <TextInput
                  style={styles.input}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="Jane"
                  placeholderTextColor="#B5B0A8"
                  autoCapitalize="words"
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.label}>Last name</Text>
                <TextInput
                  style={styles.input}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Smith"
                  placeholderTextColor="#B5B0A8"
                  autoCapitalize="words"
                />
              </View>
            </View>
          )}

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#B5B0A8"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password{isSignUp ? ' (min. 8 characters)' : ''}</Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#B5B0A8"
              secureTextEntry
              autoComplete={isSignUp ? 'new-password' : 'password'}
            />
          </View>

          {/* Primary button */}
          <TouchableOpacity
            style={[styles.btnPrimary, loading && styles.btnDisabled]}
            onPress={handleSubmit}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading
              ? <ActivityIndicator color={COLORS.primaryFg} size="small" />
              : <Text style={styles.btnPrimaryText}>
                  {isSignUp ? 'CREATE ACCOUNT' : 'SIGN IN'}
                </Text>
            }
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerLabel}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Google sign-in */}
          <TouchableOpacity
            style={[styles.btnGoogle, googleLoading && styles.btnDisabled]}
            onPress={async () => {
              setError('');
              setGoogleLoading(true);
              try {
                await onGoogleLogin();
              } catch (err: unknown) {
                setError(err instanceof Error ? err.message : 'Google sign-in failed.');
              } finally {
                setGoogleLoading(false);
              }
            }}
            disabled={googleLoading || loading}
            activeOpacity={0.85}
          >
            {googleLoading ? (
              <ActivityIndicator color={COLORS.text} size="small" />
            ) : (
              <View style={styles.btnGoogleInner}>
                <Text style={styles.btnGoogleIcon}>G</Text>
                <Text style={styles.btnGoogleText}>CONTINUE WITH GOOGLE</Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Switch mode */}
          <TouchableOpacity onPress={switchMode} activeOpacity={0.7} style={styles.switchRow}>
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
              <Text style={styles.switchLink}>
                {isSignUp ? 'Sign in' : 'Create one'}
              </Text>
            </Text>
          </TouchableOpacity>

          {/* Benefits (sign in only) */}
          {!isSignUp && (
            <>
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerLabel}>what you'll get</Text>
                <View style={styles.dividerLine} />
              </View>
              {[
                'Soul signature built from your digital footprint',
                'Privacy controls — you decide what to share',
                'AI twin that actually knows you',
              ].map((b, i) => (
                <View key={i} style={styles.benefitRow}>
                  <Text style={styles.benefitCheck}>✓</Text>
                  <Text style={styles.benefitText}>{b}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        <Text style={styles.footer}>
          By continuing, you agree to our Terms of Service and Privacy Policy.
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

  header: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 64, height: 64, marginBottom: 20 },
  title: {
    fontFamily: 'InstrumentSerif_400Regular',
    fontSize: 32,
    color: COLORS.text,
    letterSpacing: -1,
    lineHeight: 38,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    color: COLORS.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },

  errorBox: {
    backgroundColor: 'rgba(255,235,235,0.8)',
    borderWidth: 1,
    borderColor: 'rgba(220,38,38,0.2)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  errorText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: '#991b1b',
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    padding: 24,
    gap: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },

  nameRow: { flexDirection: 'row', gap: 12 },

  fieldGroup: { gap: 6 },
  label: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    color: COLORS.textMuted,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: COLORS.inputBg,
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: COLORS.text,
  },

  btnPrimary: {
    backgroundColor: COLORS.primary,
    borderRadius: 9999,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  btnDisabled: { opacity: 0.5 },
  btnPrimaryText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.primaryFg,
    letterSpacing: 2,
  },

  btnGoogle: {
    backgroundColor: COLORS.card,
    borderRadius: 9999,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.inputBorder,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  btnGoogleInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnGoogleIcon: {
    fontFamily: 'Inter_600SemiBold',
    fontSize: 13,
    color: '#4285F4',
  },
  btnGoogleText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.text,
    letterSpacing: 2,
  },

  switchRow: { alignItems: 'center', paddingVertical: 2 },
  switchText: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
  },
  switchLink: {
    fontFamily: 'Inter_500Medium',
    color: COLORS.text,
    textDecorationLine: 'underline',
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.inputBorder },
  dividerLabel: {
    fontFamily: 'Inter_500Medium',
    fontSize: 9,
    color: COLORS.textMuted,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  benefitRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  benefitCheck: { fontSize: 12, color: COLORS.success, marginTop: 2 },
  benefitText: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    color: COLORS.textMuted,
    lineHeight: 19,
  },

  footer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    color: COLORS.textMuted,
    textAlign: 'center',
    marginTop: 20,
    lineHeight: 17,
  },
});
