/**
 * PermissionOnboardingScreen
 * ==========================
 * 4-step wizard shown once after login if Android permissions are missing.
 *
 * Step 1 — Usage Access (PACKAGE_USAGE_STATS)
 * Step 2 — Notification Access (BIND_NOTIFICATION_LISTENER_SERVICE)
 * Step 3 — Location (foreground only, optional)
 * Step 4 — Health Connect (wearable data: steps, sleep, HR, workouts)
 *
 * On completion: saves PERMISSIONS_SHOWN flag and calls onDone() so
 * App.tsx can trigger an immediate sync before navigating to HomeScreen.
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  Dimensions,
  Platform,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as Location from 'expo-location';
import { COLORS, STORAGE_KEYS } from '../constants';
import { UsageStatsModule } from '../native/UsageStatsModule';
import { NotificationListenerModule } from '../native/NotificationListenerModule';
import { requestHealthPermissions } from '../services/healthConnect';

const { width } = Dimensions.get('window');

interface Step {
  title: string;
  body: string;
  buttonLabel: string;
  onEnable: () => void;
}

interface Props {
  onDone: () => void;
}

export function PermissionOnboardingScreen({ onDone }: Props) {
  const [stepIndex, setStepIndex] = useState(0);

  async function markShownAndFinish() {
    await SecureStore.setItemAsync(STORAGE_KEYS.PERMISSIONS_SHOWN, 'true');
    onDone();
  }

  async function handleEnable(index: number) {
    if (index === 0) {
      UsageStatsModule.requestUsagePermission();
    } else if (index === 1) {
      NotificationListenerModule.requestNotificationPermission();
    } else if (index === 2) {
      await Location.requestForegroundPermissionsAsync();
    } else if (index === 3) {
      await requestHealthPermissions();
    }
    // Advance to next step (or finish if last step)
    if (index < steps.length - 1) {
      setStepIndex(index + 1);
    } else {
      markShownAndFinish();
    }
  }

  const steps: Step[] = [
    {
      title: 'See how you spend your time',
      body:
        'Twin Me reads which apps you use and when — never what you type.\n\n' +
        'This unlocks insights like "you check Instagram 23x a day" and helps your twin understand your real habits.',
      buttonLabel: 'Enable Usage Access',
      onEnable: () => handleEnable(0),
    },
    {
      title: 'Understand your notification habits',
      body:
        'We track which apps notify you and when — never the content.\n\n' +
        "This reveals patterns like which apps interrupt your focus most and when you're hardest to reach.",
      buttonLabel: 'Enable Notification Access',
      onEnable: () => handleEnable(1),
    },
    {
      title: 'Understand your daily rhythms',
      body:
        'Foreground-only location access lets TwinMe detect your home/work split and weekend routines.\n\n' +
        'Only anonymous cluster patterns are sent — never raw coordinates. Skip if you prefer.',
      buttonLabel: 'Allow Location',
      onEnable: () => handleEnable(2),
    },
    {
      title: 'Connect your fitness data',
      body:
        "Health Connect is your phone's health hub — it securely aggregates data from Garmin, Fitbit, Samsung Health, and other wearables.\n\nTwinMe reads steps, sleep, heart rate, and workouts to understand your body patterns.",
      buttonLabel: 'Connect Health Data',
      onEnable: () => handleEnable(3),
    },
  ];

  const step = steps[stepIndex];

  return (
    <SafeAreaView style={styles.container}>
      {/* Progress dots */}
      <View style={styles.progress}>
        {steps.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === stepIndex && styles.dotActive]}
          />
        ))}
      </View>

      {/* Content */}
      <View style={styles.content}>
        <Text style={styles.stepLabel}>
          Step {stepIndex + 1} of {steps.length}
        </Text>
        <Text style={styles.title}>{step.title}</Text>
        <Text style={styles.body}>{step.body}</Text>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={step.onEnable}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryButtonText}>{step.buttonLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.skipButton}
          onPress={markShownAndFinish}
          activeOpacity={0.6}
        >
          <Text style={styles.skipText}>Skip for now</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingHorizontal: 28,
    paddingTop: Platform.OS === 'android' ? 48 : 20,
  },
  progress: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 48,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  dotActive: {
    backgroundColor: COLORS.primary,
    width: 20,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 40,
  },
  stepLabel: {
    fontSize: 12,
    fontFamily: 'Inter_500Medium',
    color: COLORS.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontFamily: 'InstrumentSerif_400Regular',
    color: COLORS.text,
    letterSpacing: -0.5,
    lineHeight: 36,
    marginBottom: 20,
    maxWidth: width - 56,
  },
  body: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
    lineHeight: 24,
    maxWidth: width - 56,
  },
  actions: {
    paddingBottom: 32,
    gap: 12,
  },
  primaryButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: COLORS.primaryFg,
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.1,
  },
  skipButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  skipText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    color: COLORS.textMuted,
    textDecorationLine: 'underline',
  },
});
