import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import type {
  PrivacySettings,
  ContextualTwin,
  UserClusterSetting,
  AudiencePreset,
  PrivacyStatistics,
  UpdatePrivacySettingsRequest,
  CreateContextualTwinRequest,
  UpdateContextualTwinRequest,
} from '@/types/privacy';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3004/api';

// --- Demo mode fallback data (no API calls needed) ---
// These are partial shapes — the real API returns richer objects, but the
// PrivacySpectrumDashboard page accesses them loosely via `as unknown` casts,
// so only the fields actually read at runtime need to be present.
/* eslint-disable @typescript-eslint/no-explicit-any */
const DEMO_PRIVACY_SETTINGS = {
  global_privacy: 65,
} as any as PrivacySettings;

const DEMO_TWINS = [
  {
    id: 'demo-twin-professional',
    name: 'Professional Twin',
    description: 'Shares career and skills info only',
    isActive: false,
    is_active: false,
    twin_type: 'professional',
    cluster_settings: {},
    color: '#3B82F6',
    icon: 'Briefcase',
    activation_count: 3,
    is_default: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'demo-twin-social',
    name: 'Social Twin',
    description: 'Personality, hobbies, music taste',
    isActive: true,
    is_active: true,
    twin_type: 'social',
    cluster_settings: {},
    color: '#10B981',
    icon: 'Users',
    activation_count: 12,
    is_default: false,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
] as any as ContextualTwin[];

const DEMO_CLUSTERS = [
  { clusterId: 'cl-music', id: 'cl-music', name: 'Music & Listening', category: 'creative', privacyLevel: 80, privacy_level: 80, isEnabled: true, is_enabled: true },
  { clusterId: 'cl-fitness', id: 'cl-fitness', name: 'Fitness & Health', category: 'personal', privacyLevel: 50, privacy_level: 50, isEnabled: true, is_enabled: true },
  { clusterId: 'cl-career', id: 'cl-career', name: 'Career & Skills', category: 'professional', privacyLevel: 30, privacy_level: 30, isEnabled: true, is_enabled: true },
  { clusterId: 'cl-social', id: 'cl-social', name: 'Social Life', category: 'personal', privacyLevel: 70, privacy_level: 70, isEnabled: true, is_enabled: true },
  { clusterId: 'cl-content', id: 'cl-content', name: 'Content & Media', category: 'creative', privacyLevel: 85, privacy_level: 85, isEnabled: false, is_enabled: false },
  { clusterId: 'cl-schedule', id: 'cl-schedule', name: 'Daily Routine', category: 'personal', privacyLevel: 45, privacy_level: 45, isEnabled: true, is_enabled: true },
] as any as UserClusterSetting[];

const DEMO_STATISTICS = {
  averageRevelation: 60,
  totalClusters: 6,
  activeClusters: 5,
  enabledClusters: 5,
  averagePrivacyLevel: 60,
  twinCount: 2,
} as any as PrivacyStatistics;

const DEMO_PRESETS = [
  { id: 'p-open', name: 'Open Book', key: 'open', label: 'Open Book', level: 90, global_privacy: 90, description: 'Share almost everything', default_cluster_levels: {}, icon: 'Eye', color: '#10B981', is_system_preset: true, is_custom: false },
  { id: 'p-balanced', name: 'Balanced', key: 'balanced', label: 'Balanced', level: 65, global_privacy: 65, description: 'A healthy middle ground', default_cluster_levels: {}, icon: 'Scale', color: '#c17e2c', is_system_preset: true, is_custom: false },
  { id: 'p-private', name: 'Private', key: 'private', label: 'Private', level: 30, global_privacy: 30, description: 'Share only the essentials', default_cluster_levels: {}, icon: 'Lock', color: '#EF4444', is_system_preset: true, is_custom: false },
  { id: 'p-vault', name: 'Vault', key: 'vault', label: 'Vault', level: 5, global_privacy: 5, description: 'Maximum privacy', default_cluster_levels: {}, icon: 'Shield', color: '#6B7280', is_system_preset: true, is_custom: false },
] as any as AudiencePreset[];
/* eslint-enable @typescript-eslint/no-explicit-any */

// Privacy Settings Hook
export const usePrivacySettings = () => {
  const { user, authToken, isDemoMode } = useAuth();
  const queryClient = useQueryClient();

  // Fetch privacy settings
  const {
    data: settings,
    isLoading,
    error,
    refetch,
  } = useQuery<PrivacySettings>({
    queryKey: ['privacy-settings', isDemoMode ? 'demo' : user?.id],
    queryFn: isDemoMode
      ? () => Promise.resolve(DEMO_PRIVACY_SETTINGS)
      : async () => {
          const response = await fetch(`${API_BASE}/privacy-settings`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
          });

          if (!response.ok) {
            throw new Error('Failed to fetch privacy settings');
          }

          return response.json();
        },
    enabled: isDemoMode || !!user?.id,
    staleTime: isDemoMode ? Infinity : 1000 * 60 * 5,
  });

  // Update privacy settings mutation
  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<UpdatePrivacySettingsRequest>) => {
      if (isDemoMode) return { settings: { ...DEMO_PRIVACY_SETTINGS, ...updates } };

      const response = await fetch(`${API_BASE}/privacy-settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update privacy settings');
      }

      return response.json();
    },
    onSuccess: (data) => {
      const key = isDemoMode ? 'demo' : user?.id;
      queryClient.setQueryData(['privacy-settings', key], data.settings);
      queryClient.invalidateQueries({ queryKey: ['privacy-statistics', key] });
    },
  });

  // Apply audience preset
  const applyPreset = useMutation({
    mutationFn: async (presetKey: string) => {
      if (isDemoMode) return { success: true };

      const response = await fetch(`${API_BASE}/privacy-settings/presets/${presetKey}/apply`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to apply preset');
      }

      return response.json();
    },
    onSuccess: () => {
      const key = isDemoMode ? 'demo' : user?.id;
      queryClient.invalidateQueries({ queryKey: ['privacy-settings', key] });
      queryClient.invalidateQueries({ queryKey: ['user-clusters', key] });
    },
  });

  return {
    settings,
    isLoading,
    error,
    refetch,
    updateSettings: updateSettings.mutate,
    applyPreset: applyPreset.mutate,
    isUpdating: updateSettings.isPending,
    isApplyingPreset: applyPreset.isPending,
  };
};

// Contextual Twins Hook
export const useContextualTwins = () => {
  const { user, authToken, isDemoMode } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all twins
  const {
    data: twins = [],
    isLoading,
    error,
    refetch,
  } = useQuery<ContextualTwin[]>({
    queryKey: ['contextual-twins', isDemoMode ? 'demo' : user?.id],
    queryFn: isDemoMode
      ? () => Promise.resolve(DEMO_TWINS)
      : async () => {
          const response = await fetch(`${API_BASE}/privacy-settings/twins`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
          });

          if (!response.ok) {
            throw new Error('Failed to fetch contextual twins');
          }

          const data = await response.json();
          return data.twins;
        },
    enabled: isDemoMode || !!user?.id,
    staleTime: isDemoMode ? Infinity : 1000 * 60 * 5,
  });

  // Get active twin
  const activeTwin = twins.find(twin => twin.isActive);

  const queryKeyId = isDemoMode ? 'demo' : user?.id;

  // Create twin mutation
  const createTwin = useMutation({
    mutationFn: async (twinData: CreateContextualTwinRequest) => {
      if (isDemoMode) return { twin: { ...twinData, id: `demo-${Date.now()}` } };

      const response = await fetch(`${API_BASE}/privacy-settings/twins`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(twinData),
      });

      if (!response.ok) {
        throw new Error('Failed to create twin');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextual-twins', queryKeyId] });
    },
  });

  // Update twin mutation
  const updateTwin = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateContextualTwinRequest }) => {
      if (isDemoMode) return { twin: { id, ...updates } };

      const response = await fetch(`${API_BASE}/privacy-settings/twins/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update twin');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextual-twins', queryKeyId] });
    },
  });

  // Delete twin mutation
  const deleteTwin = useMutation({
    mutationFn: async (twinId: string) => {
      if (isDemoMode) return { success: true };

      const response = await fetch(`${API_BASE}/privacy-settings/twins/${twinId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete twin');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextual-twins', queryKeyId] });
    },
  });

  // Activate twin mutation
  const activateTwin = useMutation({
    mutationFn: async (twinId: string) => {
      if (isDemoMode) return { success: true };

      const response = await fetch(`${API_BASE}/privacy-settings/twins/${twinId}/activate`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to activate twin');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextual-twins', queryKeyId] });
      queryClient.invalidateQueries({ queryKey: ['user-clusters', queryKeyId] });
    },
  });

  // Deactivate all twins
  const deactivateAllTwins = useMutation({
    mutationFn: async () => {
      if (isDemoMode) return { success: true };

      const response = await fetch(`${API_BASE}/privacy-settings/twins/deactivate`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to deactivate twins');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextual-twins', queryKeyId] });
      queryClient.invalidateQueries({ queryKey: ['user-clusters', queryKeyId] });
    },
  });

  return {
    twins,
    activeTwin,
    isLoading,
    error,
    refetch,
    createTwin: createTwin.mutate,
    updateTwin: updateTwin.mutate,
    deleteTwin: deleteTwin.mutate,
    activateTwin: activateTwin.mutate,
    deactivateAllTwins: deactivateAllTwins.mutate,
    isCreating: createTwin.isPending,
    isUpdating: updateTwin.isPending,
    isDeleting: deleteTwin.isPending,
    isActivating: activateTwin.isPending,
  };
};

// User Clusters Hook
export const useUserClusters = () => {
  const { user, authToken, isDemoMode } = useAuth();
  const queryClient = useQueryClient();
  const queryKeyId = isDemoMode ? 'demo' : user?.id;

  // Fetch user cluster settings
  const {
    data: clusters = [],
    isLoading,
    error,
    refetch,
  } = useQuery<UserClusterSetting[]>({
    queryKey: ['user-clusters', queryKeyId],
    queryFn: isDemoMode
      ? () => Promise.resolve(DEMO_CLUSTERS)
      : async () => {
          const response = await fetch(`${API_BASE}/privacy-settings/clusters`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
          });

          if (!response.ok) {
            throw new Error('Failed to fetch cluster settings');
          }

          const data = await response.json();
          return data.settings;
        },
    enabled: isDemoMode || !!user?.id,
    staleTime: isDemoMode ? Infinity : 1000 * 60 * 5,
  });

  // Update cluster privacy level
  const updateClusterPrivacy = useMutation({
    mutationFn: async ({ clusterId, privacyLevel }: { clusterId: string; privacyLevel: number }) => {
      if (isDemoMode) return { success: true };

      const response = await fetch(`${API_BASE}/privacy-settings/clusters/${clusterId}/privacy`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ privacyLevel }),
      });

      if (!response.ok) {
        throw new Error('Failed to update cluster privacy');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-clusters', queryKeyId] });
      queryClient.invalidateQueries({ queryKey: ['privacy-statistics', queryKeyId] });
    },
  });

  // Toggle cluster enabled/disabled
  const toggleCluster = useMutation({
    mutationFn: async ({ clusterId, enabled }: { clusterId: string; enabled: boolean }) => {
      if (isDemoMode) return { success: true };

      const response = await fetch(`${API_BASE}/privacy-settings/clusters/${clusterId}/toggle`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle cluster');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-clusters', queryKeyId] });
      queryClient.invalidateQueries({ queryKey: ['privacy-statistics', queryKeyId] });
    },
  });

  return {
    clusters,
    isLoading,
    error,
    refetch,
    updateClusterPrivacy: updateClusterPrivacy.mutate,
    toggleCluster: toggleCluster.mutate,
    isUpdatingPrivacy: updateClusterPrivacy.isPending,
    isToggling: toggleCluster.isPending,
  };
};

// Privacy Statistics Hook
export const usePrivacyStatistics = () => {
  const { user, authToken, isDemoMode } = useAuth();

  const {
    data: statistics,
    isLoading,
    error,
  } = useQuery<PrivacyStatistics>({
    queryKey: ['privacy-statistics', isDemoMode ? 'demo' : user?.id],
    queryFn: isDemoMode
      ? () => Promise.resolve(DEMO_STATISTICS)
      : async () => {
          const response = await fetch(`${API_BASE}/privacy-settings/statistics`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
          });

          if (!response.ok) {
            throw new Error('Failed to fetch privacy statistics');
          }

          const data = await response.json();
          return data.statistics;
        },
    enabled: isDemoMode || !!user?.id,
    staleTime: isDemoMode ? Infinity : 1000 * 60 * 5,
  });

  return {
    statistics,
    isLoading,
    error,
  };
};

// Audience Presets Hook
export const useAudiencePresets = () => {
  const { user, isDemoMode, authToken } = useAuth();

  const {
    data: presets = [],
    isLoading,
    error,
  } = useQuery<AudiencePreset[]>({
    queryKey: ['audience-presets', isDemoMode ? 'demo' : 'live'],
    queryFn: isDemoMode
      ? () => Promise.resolve(DEMO_PRESETS)
      : async () => {
          const response = await fetch(`${API_BASE}/privacy-settings/presets`, {
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${authToken}`,
            },
          });

          if (!response.ok) {
            throw new Error('Failed to fetch audience presets');
          }

          const data = await response.json();
          return data.presets;
        },
    enabled: isDemoMode || !!user?.id,
    staleTime: isDemoMode ? Infinity : 1000 * 60 * 30,
  });

  return {
    presets,
    isLoading,
    error,
  };
};

// Privacy settings debounced update hook for sliders
export const useDebouncedPrivacyUpdate = (delay = 500) => {
  const { updateSettings } = usePrivacySettings();
  const [timer, setTimer] = useState<NodeJS.Timeout | null>(null);

  const debouncedUpdate = useCallback(
    (updates: Partial<UpdatePrivacySettingsRequest>) => {
      if (timer) {
        clearTimeout(timer);
      }

      const newTimer = setTimeout(() => {
        updateSettings(updates);
      }, delay);

      setTimer(newTimer);
    },
    [updateSettings, delay, timer]
  );

  useEffect(() => {
    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [timer]);

  return debouncedUpdate;
};