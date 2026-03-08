import React from 'react';
import {
  Sparkles,
  Link2,
  Search,
  Database,
  Settings,
  AlertCircle,
  Bell,
  ShieldCheck,
  Loader2,
  PackageOpen,
  Filter,
  Download,
  Zap
} from 'lucide-react';
import { EmptyState, EmptyStateProps } from './EmptyState';
import { useNavigate } from 'react-router-dom';

// No Data Yet - Get Started
export const NoPlatformsConnectedEmptyState: React.FC<{ onConnect?: () => void }> = ({ onConnect }) => {
  const navigate = useNavigate();

  return (
    <EmptyState
      icon={Link2}
      title="I'm ready when you are"
      description="Connect a platform and I'll start learning what makes you tick — your music, your schedule, your patterns."
      primaryAction={{
        label: 'Connect Your First Platform',
        onClick: onConnect || (() => navigate('/get-started')),
        icon: Zap
      }}
      secondaryAction={{
        label: 'Learn More',
        onClick: () => navigate('/'),
        variant: 'outline'
      }}
    />
  );
};

// No Soul Signature Yet
export const NoSoulSignatureEmptyState: React.FC<{ onConnect?: () => void }> = ({ onConnect }) => {
  const navigate = useNavigate();

  return (
    <EmptyState
      icon={Sparkles}
      title="Still getting to know you"
      description="Connect a platform so I can start noticing patterns — your real ones, not just what's on your resume."
      primaryAction={{
        label: 'Connect Platforms',
        onClick: onConnect || (() => navigate('/get-started')),
        icon: Link2
      }}
      variant="centered"
    />
  );
};

// No Search Results
export const NoSearchResultsEmptyState: React.FC<{
  searchQuery: string;
  onClearSearch?: () => void;
}> = ({ searchQuery, onClearSearch }) => {
  return (
    <EmptyState
      icon={Search}
      title="No Results Found"
      description={`Nothing matching "${searchQuery}" — try different words or clear the search.`}
      primaryAction={onClearSearch ? {
        label: 'Clear Search',
        onClick: onClearSearch,
        variant: 'outline'
      } : undefined}
      variant="compact"
    />
  );
};

// No Filtered Results
export const NoFilteredResultsEmptyState: React.FC<{
  filterName?: string;
  onClearFilters?: () => void;
}> = ({ filterName, onClearFilters }) => {
  return (
    <EmptyState
      icon={Filter}
      title="No Matches Found"
      description={`No platforms found with the current filters${filterName ? ` (${filterName})` : ''}. Try adjusting your filter criteria.`}
      primaryAction={onClearFilters ? {
        label: 'Clear All Filters',
        onClick: onClearFilters,
        variant: 'outline',
        icon: Filter
      } : undefined}
      variant="compact"
    />
  );
};

// No Data Extracted
export const NoDataExtractedEmptyState: React.FC<{ onExtract?: () => void }> = ({ onExtract }) => {
  return (
    <EmptyState
      icon={Database}
      title="No data pulled yet"
      description="Give me a moment to pull data from your connected platforms — it usually takes a minute or two the first time."
      primaryAction={onExtract ? {
        label: 'Start Extraction',
        onClick: onExtract,
        icon: Download
      } : undefined}
      variant="compact"
    />
  );
};

// No Privacy Settings Configured
export const NoPrivacySettingsEmptyState: React.FC<{ onConfigure?: () => void }> = ({ onConfigure }) => {
  const navigate = useNavigate();

  return (
    <EmptyState
      icon={ShieldCheck}
      title="Privacy Controls Not Set"
      description="Configure your privacy settings to control what aspects of your soul signature are revealed to different audiences."
      primaryAction={{
        label: 'Configure Privacy',
        onClick: onConfigure || (() => navigate('/privacy-spectrum')),
        icon: Settings
      }}
    />
  );
};

// Error Loading
export const ErrorLoadingEmptyState: React.FC<{
  errorMessage?: string;
  onRetry?: () => void;
}> = ({ errorMessage, onRetry }) => {
  return (
    <EmptyState
      icon={AlertCircle}
      iconClassName="bg-red-900/20"
      title="Failed to Load Data"
      description={errorMessage || 'Something went wrong while loading your data. Please try again or contact support if the problem persists.'}
      primaryAction={onRetry ? {
        label: 'Try Again',
        onClick: onRetry,
        icon: Loader2
      } : undefined}
      variant="compact"
    />
  );
};

// Feature Coming Soon
export const ComingSoonEmptyState: React.FC<{
  featureName: string;
  onNotify?: () => void;
}> = ({ featureName, onNotify }) => {
  return (
    <EmptyState
      icon={Bell}
      title={`${featureName} Coming Soon`}
      description="We're working hard to bring you this feature. Sign up to be notified when it launches."
      primaryAction={onNotify ? {
        label: 'Notify Me',
        onClick: onNotify,
        icon: Bell
      } : undefined}
      variant="centered"
    />
  );
};

// Permission Required
export const PermissionRequiredEmptyState: React.FC<{
  permissionType: string;
  onGrantAccess?: () => void;
}> = ({ permissionType, onGrantAccess }) => {
  return (
    <EmptyState
      icon={ShieldCheck}
      title="Permission Required"
      description={`To access this feature, we need permission to ${permissionType}. Your data will be handled securely and you can revoke access at any time.`}
      primaryAction={onGrantAccess ? {
        label: 'Grant Access',
        onClick: onGrantAccess,
        icon: ShieldCheck
      } : undefined}
    />
  );
};

// No Recent Activity
export const NoRecentActivityEmptyState: React.FC = () => {
  return (
    <EmptyState
      icon={PackageOpen}
      title="Nothing here yet"
      description="As you chat with your twin and connect platforms, activity will start showing up here."
      variant="compact"
    />
  );
};

// General No Data
export const NoDataEmptyState: React.FC<{
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}> = ({
  title = "Nothing here yet",
  description = "Data will show up here once your platforms start syncing.",
  actionLabel,
  onAction
}) => {
  return (
    <EmptyState
      icon={Database}
      title={title}
      description={description}
      primaryAction={actionLabel && onAction ? {
        label: actionLabel,
        onClick: onAction
      } : undefined}
      variant="compact"
    />
  );
};

// Loading State (not technically empty, but useful)
export const LoadingEmptyState: React.FC<{ message?: string }> = ({
  message = "Loading your data..."
}) => {
  return (
    <EmptyState
      icon={Loader2}
      iconClassName="bg-transparent"
      title="Loading"
      description={message}
      variant="compact"
      animate={false}
    />
  );
};
