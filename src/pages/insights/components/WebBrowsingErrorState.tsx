import React from 'react';
import { ArrowLeft, Layout } from 'lucide-react';
import { Page, PageHead, List, Row } from '@/components/register';

interface WebBrowsingErrorStateProps {
  navigate: (path: string) => void;
}

/** No browsing data could load: the page's head, the extension row, one quiet line. */
export const WebBrowsingErrorState: React.FC<WebBrowsingErrorStateProps> = ({ navigate }) => {
  return (
    <Page>
      <button type="button" onClick={() => navigate('/identity')} className="rg-iconbtn ri-back" aria-label="Back">
        <ArrowLeft aria-hidden="true" />
      </button>
      <PageHead title="What you read" line="What your browsing says about you" />
      <List>
        <Row
          icon={<Layout />}
          title="Install the browser extension"
          line="Once your browsing flows in, your twin will share what it notices."
          onClick={() => navigate('/get-started')}
        />
      </List>
    </Page>
  );
};
