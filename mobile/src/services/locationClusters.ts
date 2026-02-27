/**
 * Location Clusters Service
 * =========================
 * On-device location clustering for lifestyle pattern detection.
 *
 * Privacy-first: raw GPS never leaves the device. Only anonymized cluster
 * summaries (centroid + visit patterns) are sent to the server.
 *
 * Architecture:
 *   foreground sampling every SAMPLE_INTERVAL_MS
 *   → on-device clustering (150m radius)
 *   → cluster summaries stored in AsyncStorage
 *   → upload via uploadLocationClusters() during sync
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { authFetch } from './api';

// ── Constants ────────────────────────────────────────────────────────────────

export const CLUSTER_RADIUS_M = 150;
export const SAMPLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const GRID_PRECISION = 3; // ~100m grid for cluster_key — anonymizes raw coords
const STORAGE_KEY = 'location_clusters_v1';
const MAX_CLUSTERS = 30;

// ── Types ────────────────────────────────────────────────────────────────────

interface LocationCluster {
  cluster_key: string;
  centroid_lat: number;
  centroid_lng: number;
  label_hint: string | null;
  visit_count: number;
  typical_hours: number[];
  typical_days: number[];
  _sample_count: number; // internal running-mean denominator, stripped before upload
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeClusterKey(lat: number, lng: number): string {
  return `${lat.toFixed(GRID_PRECISION)},${lng.toFixed(GRID_PRECISION)}`;
}

/** Haversine distance in meters between two lat/lng coordinates. */
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function inferLabel(cluster: LocationCluster): string | null {
  const hasNight = cluster.typical_hours.some((h) => h < 7 || h >= 22);
  const hasWork = cluster.typical_hours.some((h) => h >= 9 && h <= 18);
  const weekdaysOnly =
    cluster.typical_days.length > 0 && cluster.typical_days.every((d) => d >= 1 && d <= 5);

  if (hasNight && cluster.visit_count > 5) return 'home';
  if (hasWork && weekdaysOnly && cluster.visit_count > 3) return 'work';
  return null;
}

function addUnique<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr : [...arr, value];
}

async function loadClusters(): Promise<LocationCluster[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as LocationCluster[]) : [];
  } catch {
    return [];
  }
}

async function saveClusters(clusters: LocationCluster[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clusters));
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Sample the current location and update on-device clusters.
 * Called every SAMPLE_INTERVAL_MS while app is in foreground.
 * No-ops silently if permission not granted.
 */
export async function addLocationSample(): Promise<void> {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') return;

    const loc = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { latitude, longitude } = loc.coords;
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0=Sun … 6=Sat

    const clusters = await loadClusters();

    // Find nearest cluster within CLUSTER_RADIUS_M
    let nearestIdx = -1;
    let nearestDist = Infinity;
    for (let i = 0; i < clusters.length; i++) {
      const d = haversineMeters(latitude, longitude, clusters[i].centroid_lat, clusters[i].centroid_lng);
      if (d < CLUSTER_RADIUS_M && d < nearestDist) {
        nearestDist = d;
        nearestIdx = i;
      }
    }

    let updated: LocationCluster[];

    if (nearestIdx >= 0) {
      // Update existing cluster — running-mean centroid
      updated = clusters.map((c, i) => {
        if (i !== nearestIdx) return c;
        const n = c._sample_count + 1;
        const updatedCluster: LocationCluster = {
          ...c,
          centroid_lat: (c.centroid_lat * c._sample_count + latitude) / n,
          centroid_lng: (c.centroid_lng * c._sample_count + longitude) / n,
          visit_count: c.visit_count + 1,
          typical_hours: addUnique(c.typical_hours, hour),
          typical_days: addUnique(c.typical_days, day),
          _sample_count: n,
          label_hint: null,
        };
        updatedCluster.label_hint = inferLabel(updatedCluster);
        return updatedCluster;
      });
    } else {
      // New cluster
      const newCluster: LocationCluster = {
        cluster_key: makeClusterKey(latitude, longitude),
        centroid_lat: latitude,
        centroid_lng: longitude,
        label_hint: null,
        visit_count: 1,
        typical_hours: [hour],
        typical_days: [day],
        _sample_count: 1,
      };
      // Evict lowest-visit-count clusters when at capacity
      const base =
        clusters.length >= MAX_CLUSTERS
          ? [...clusters].sort((a, b) => b.visit_count - a.visit_count).slice(0, MAX_CLUSTERS - 1)
          : clusters;
      updated = [...base, newCluster];
    }

    await saveClusters(updated);
  } catch (err) {
    // Location sampling is best-effort — never crash the app
    console.warn('[LocationClusters] addLocationSample error:', err);
  }
}

/**
 * Upload cluster summaries to the backend.
 * Called from backgroundSync.ts runSyncNow() and the background task.
 */
export async function uploadLocationClusters(): Promise<void> {
  try {
    const clusters = await loadClusters();
    // Filter noise: only clusters visited at least twice
    const filtered = clusters.filter((c) => c.visit_count >= 2);
    if (filtered.length === 0) return;

    // Strip internal running-mean field before sending
    const payload = filtered.map(({ _sample_count: _, ...rest }) => rest);

    const res = await authFetch('/location/clusters', {
      method: 'POST',
      body: JSON.stringify({ clusters: payload }),
    });

    if (!res.ok) {
      console.warn('[LocationClusters] Upload failed:', res.status);
    } else {
      console.log('[LocationClusters] Uploaded', payload.length, 'clusters');
    }
  } catch (err) {
    console.warn('[LocationClusters] uploadLocationClusters error:', err);
  }
}
