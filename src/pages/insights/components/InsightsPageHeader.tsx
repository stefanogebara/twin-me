import React from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { PageHead } from '@/components/register';

interface InsightsPageHeaderProps {
  title: string;
  /** The one grey line under the title. */
  line: string;
  onBack: () => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

/**
 * An insights page's head in the register: a back icon button above the
 * Cosmos title, its one grey line, and the refresh icon button at the end.
 */
export const InsightsPageHeader: React.FC<InsightsPageHeaderProps> = ({
  title,
  line,
  onBack,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <>
      <button type="button" onClick={onBack} className="rg-iconbtn ri-back" aria-label="Back">
        <ArrowLeft aria-hidden="true" />
      </button>
      <PageHead
        title={title}
        line={line}
        action={
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="rg-iconbtn"
            title="Get a fresh observation"
            aria-label={isRefreshing ? 'Refreshing' : 'Refresh observation'}
          >
            <RefreshCw className={isRefreshing ? 'animate-spin' : undefined} aria-hidden="true" />
          </button>
        }
      />
    </>
  );
};
