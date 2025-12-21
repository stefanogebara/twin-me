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

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

// Privacy Settings Hook
export const usePrivacySettings = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch privacy settings
  const {
    data: settings,
    isLoading,
    error,
    refetch,
  } = useQuery<PrivacySettings>({
    queryKey: ['privacy-settings', user?.id],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/privacy-settings`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch privacy settings');
      }

      return response.json();
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Update privacy settings mutation
  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<UpdatePrivacySettingsRequest>) => {
      const response = await fetch(`${API_BASE}/privacy-settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update privacy settings');
      }

      return response.json();
    },
    onSuccess: (data) => {
      queryClient.setQueryData(['privacy-settings', user?.id], data.settings);
      queryClient.invalidateQueries({ queryKey: ['privacy-statistics', user?.id] });
    },
  });

  // Apply audience preset
  const applyPreset = useMutation({
    mutationFn: async (presetKey: string) => {
      const response = await fetch(`${API_BASE}/privacy-settings/presets/${presetKey}/apply`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to apply preset');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['privacy-settings', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['user-clusters', user?.id] });
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
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch all twins
  const {
    data: twins = [],
    isLoading,
    error,
    refetch,
  } = useQuery<ContextualTwin[]>({
    queryKey: ['contextual-twins', user?.id],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/privacy-settings/twins`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch contextual twins');
      }

      const data = await response.json();
      return data.twins;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Get active twin
  const activeTwin = twins.find(twin => twin.isActive);

  // Create twin mutation
  const createTwin = useMutation({
    mutationFn: async (twinData: CreateContextualTwinRequest) => {
      const response = await fetch(`${API_BASE}/privacy-settings/twins`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
        body: JSON.stringify(twinData),
      });

      if (!response.ok) {
        throw new Error('Failed to create twin');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextual-twins', user?.id] });
    },
  });

  // Update twin mutation
  const updateTwin = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: UpdateContextualTwinRequest }) => {
      const response = await fetch(`${API_BASE}/privacy-settings/twins/${id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        throw new Error('Failed to update twin');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextual-twins', user?.id] });
    },
  });

  // Delete twin mutation
  const deleteTwin = useMutation({
    mutationFn: async (twinId: string) => {
      const response = await fetch(`${API_BASE}/privacy-settings/twins/${twinId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to delete twin');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextual-twins', user?.id] });
    },
  });

  // Activate twin mutation
  const activateTwin = useMutation({
    mutationFn: async (twinId: string) => {
      const response = await fetch(`${API_BASE}/privacy-settings/twins/${twinId}/activate`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to activate twin');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextual-twins', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['user-clusters', user?.id] });
    },
  });

  // Deactivate all twins
  const deactivateAllTwins = useMutation({
    mutationFn: async () => {
      const response = await fetch(`${API_BASE}/privacy-settings/twins/deactivate`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to deactivate twins');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contextual-twins', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['user-clusters', user?.id] });
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
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch user cluster settings
  const {
    data: clusters = [],
    isLoading,
    error,
    refetch,
  } = useQuery<UserClusterSetting[]>({
    queryKey: ['user-clusters', user?.id],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/privacy-settings/clusters`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch cluster settings');
      }

      const data = await response.json();
      return data.settings;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Update cluster privacy level
  const updateClusterPrivacy = useMutation({
    mutationFn: async ({ clusterId, privacyLevel }: { clusterId: string; privacyLevel: number }) => {
      const response = await fetch(`${API_BASE}/privacy-settings/clusters/${clusterId}/privacy`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
        body: JSON.stringify({ privacyLevel }),
      });

      if (!response.ok) {
        throw new Error('Failed to update cluster privacy');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-clusters', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['privacy-statistics', user?.id] });
    },
  });

  // Toggle cluster enabled/disabled
  const toggleCluster = useMutation({
    mutationFn: async ({ clusterId, enabled }: { clusterId: string; enabled: boolean }) => {
      const response = await fetch(`${API_BASE}/privacy-settings/clusters/${clusterId}/toggle`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
        body: JSON.stringify({ enabled }),
      });

      if (!response.ok) {
        throw new Error('Failed to toggle cluster');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-clusters', user?.id] });
      queryClient.invalidateQueries({ queryKey: ['privacy-statistics', user?.id] });
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
  const { user } = useAuth();

  const {
    data: statistics,
    isLoading,
    error,
  } = useQuery<PrivacyStatistics>({
    queryKey: ['privacy-statistics', user?.id],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/privacy-settings/statistics`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch privacy statistics');
      }

      const data = await response.json();
      return data.statistics;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  return {
    statistics,
    isLoading,
    error,
  };
};

// Audience Presets Hook
export const useAudiencePresets = () => {
  const { user } = useAuth();

  const {
    data: presets = [],
    isLoading,
    error,
  } = useQuery<AudiencePreset[]>({
    queryKey: ['audience-presets'],
    queryFn: async () => {
      const response = await fetch(`${API_BASE}/privacy-settings/presets`, {
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${user?.token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch audience presets');
      }

      const data = await response.json();
      return data.presets;
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 30, // 30 minutes (presets don't change often)
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