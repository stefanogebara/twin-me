import React from 'react';
import { Linking, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../constants';
import type { User } from '../types';

const WEB_INTERVIEW_URL = 'https://www.twinme.me/soul-interview';

type Props = {
  user: User;
};

export function SoulInterviewScreen({ user }: Props) {
  const open = () => {
    Linking.openURL(WEB_INTERVIEW_URL).catch(() => {});
  };

  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.title}>Soul Interview</Text>
        <Text style={styles.body}>
          The Soul Interview is a guided conversation that deepens your twin. It runs best on
          the web, where we can capture longer reflections.
        </Text>
        <Text style={styles.meta}>Signed in as {user.email}</Text>
        <TouchableOpacity style={styles.button} onPress={open} accessibilityRole="button">
          <Text style={styles.buttonText}>Continue on web</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 20,
    justifyContent: 'center',
  },
  card: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: '600',
    color: COLORS.text,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.textMuted,
  },
  meta: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  button: {
    marginTop: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 100,
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: COLORS.primaryFg,
    fontSize: 15,
    fontWeight: '600',
  },
});
