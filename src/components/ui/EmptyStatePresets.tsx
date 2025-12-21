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
      title="No Platforms Connected Yet"
      description="Connect your entertainment and lifestyle platforms to begin discovering your authentic soul signature."
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
      title="Your Soul Signature Awaits"
      description="Connect platforms and extract data to discover the authentic patterns that make you uniquely you. Your soul signature will emerge as we analyze your digital footprints."
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
      description={`We couldn't find anything matching "${searchQuery}". Try adjusting your search terms or filters.`}
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
      title="No Data Extracted Yet"
      description="Start extracting data from your connected platforms to build your soul signature. This may take a few minutes depending on your activity."
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
      iconClassName="bg-red-50"
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
      title="No Recent Activity"
      description="You don't have any recent activity yet. As you connect platforms and interact with your soul signature, your activity will appear here."
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
  title = "No Data Available",
  description = "There's no data to display at the moment.",
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
