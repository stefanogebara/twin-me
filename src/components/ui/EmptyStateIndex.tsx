/**
 * EmptyState Component System
 *
 * This module provides a comprehensive empty state system for the Twin AI Learn platform.
 *
 * Usage:
 *
 * 1. Use preset empty states for common scenarios:
 *    import { NoPlatformsConnectedEmptyState } from '@/components/ui/EmptyStatePresets';
 *
 * 2. Create custom empty states with the base component:
 *    import { EmptyState } from '@/components/ui/EmptyState';
 *
 * Available Presets:
 * - NoPlatformsConnectedEmptyState - When no platforms are connected yet
 * - NoSoulSignatureEmptyState - When soul signature hasn't been built
 * - NoSearchResultsEmptyState - When search returns no results
 * - NoFilteredResultsEmptyState - When filters return no results
 * - NoDataExtractedEmptyState - When no data has been extracted
 * - NoPrivacySettingsEmptyState - When privacy settings aren't configured
 * - ErrorLoadingEmptyState - When there's an error loading data
 * - ComingSoonEmptyState - For features not yet available
 * - PermissionRequiredEmptyState - When user permissions are needed
 * - NoRecentActivityEmptyState - When there's no recent activity
 * - NoDataEmptyState - Generic no data state
 * - LoadingEmptyState - Loading indicator
 */

export { EmptyState } from './EmptyState';
export type { EmptyStateProps, EmptyStateAction } from './EmptyState';

export {
  NoPlatformsConnectedEmptyState,
  NoSoulSignatureEmptyState,
  NoSearchResultsEmptyState,
  NoFilteredResultsEmptyState,
  NoDataExtractedEmptyState,
  NoPrivacySettingsEmptyState,
  ErrorLoadingEmptyState,
  ComingSoonEmptyState,
  PermissionRequiredEmptyState,
  NoRecentActivityEmptyState,
  NoDataEmptyState,
  LoadingEmptyState
} from './EmptyStatePresets';
