/**
 * PlatformConnectionsStep — Step 1: Lists all platform categories with
 * connected/disconnected tiles, Google Workspace, data upload, and verification.
 */

import React from 'react';
import { DataProvider } from '@/types/data-integration';
import { PlatformStatusData } from './onboardingTypes';
import { AVAILABLE_CONNECTORS } from '../../onboarding/components/connectorConfig';
import { PlatformTile } from '../../onboarding/components/PlatformTile';
import SoulRichnessBar from '../../../components/onboarding/SoulRichnessBar';
import { DataUploadPanel } from '@/components/brain/DataUploadPanel';
import GoogleWorkspaceConnect from '../settings/GoogleWorkspaceConnect';
import { SectionLabel, Divider } from './SectionLabel';

interface PlatformConnectionsStepProps {
  userId: string | undefined;
  isDemoMode: boolean;
  connectedServices: DataProvider[];
  activeConnections: DataProvider[];
  platformStatusData: PlatformStatusData;
  connectingProvider: DataProvider | null;
  disconnectingProvider: DataProvider | null;
  discoveredSet: Set<string>;
  connectService: (provider: DataProvider) => void;
  disconnectService: (provider: DataProvider) => void;
  navigate: (path: string) => void;
}

function sortConnectors(
  connectors: typeof AVAILABLE_CONNECTORS,
  connectedServices: DataProvider[],
  discoveredSet: Set<string>,
) {
  return [...connectors].sort((a, b) => {
    const aConnected = connectedServices.includes(a.provider);
    const bConnected = connectedServices.includes(b.provider);
    if (aConnected && !bConnected) return -1;
    if (!aConnected && bConnected) return 1;
    const aDiscovered = discoveredSet.has(a.provider);
    const bDiscovered = discoveredSet.has(b.provider);
    if (aDiscovered && !bDiscovered) return -1;
    if (!aDiscovered && bDiscovered) return 1;
    return 0;
  });
}

export const PlatformConnectionsStep: React.FC<PlatformConnectionsStepProps> = ({
  userId,
  isDemoMode,
  connectedServices,
  activeConnections,
  platformStatusData,
  connectingProvider,
  disconnectingProvider,
  discoveredSet,
  connectService,
  disconnectService,
  navigate,
}) => {
  const availableConnectors = AVAILABLE_CONNECTORS.filter(c => !c.comingSoon);
  const sort = (list: typeof AVAILABLE_CONNECTORS) => sortConnectors(list, connectedServices, discoveredSet);

  const entertainmentConnectors = sort(availableConnectors.filter(c => c.category === 'entertainment'));
  const healthConnectors = sort(availableConnectors.filter(c => c.category === 'health'));
  const socialConnectors = sort(availableConnectors.filter(c => c.category === 'social'));
  const professionalConnectors = sort(availableConnectors.filter(c => c.category === 'professional'));
  const browsingConnectors = sort(availableConnectors.filter(c => c.category === 'browsing'));

  const renderUnconnectedTiles = (connectors: typeof AVAILABLE_CONNECTORS) =>
    sort(connectors)
      .filter(c => !connectedServices.includes(c.provider))
      .map(c => (
        <PlatformTile
          key={c.provider}
          name={c.name}
          description={c.description}
          icon={c.icon}
          color={c.color}
          connected={false}
          comingSoon={c.comingSoon}
          syncing={connectingProvider === c.provider}
          onConnect={() => connectService(c.provider)}
        />
      ));

  return (
    <div className="space-y-8">
      <SoulRichnessBar connectedPlatforms={activeConnections} />

      {/* Connected Section */}
      {connectedServices.length > 0 && (
        <>
          <SectionLabel label="Connected" />
          <div className="space-y-2">
            {sort(availableConnectors)
              .filter(c => connectedServices.includes(c.provider))
              .map(c => {
                const status = platformStatusData[c.provider];
                const needsReconnect = status?.tokenExpired || status?.status === 'token_expired';
                return (
                  <PlatformTile
                    key={c.provider}
                    name={c.name}
                    description={c.description}
                    icon={c.icon}
                    color={c.color}
                    connected={true}
                    needsReconnect={needsReconnect}
                    syncing={connectingProvider === c.provider}
                    onConnect={() => connectService(c.provider)}
                    onManage={() => disconnectService(c.provider)}
                  />
                );
              })}
          </div>
          <Divider />
        </>
      )}

      {/* Google Workspace */}
      <SectionLabel label="Google Workspace" />
      <p
        className="text-[13px] -mt-2 mb-4 leading-relaxed"
        style={{ color: 'rgba(255,255,255,0.40)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
      >
        Access emails, calendar, Drive files, Docs, and Sheets — your twin reads and understands your work
      </p>
      <GoogleWorkspaceConnect
        connectorStatus={platformStatusData}
        isDemoMode={isDemoMode}
        navigate={navigate}
      />
      <p
        className="text-[11px] mt-3"
        style={{ color: 'rgba(255,255,255,0.25)', fontFamily: "'Geist', 'Inter', system-ui, sans-serif" }}
      >
        Your data stays yours. We never train AI on your personal data or sell it.
      </p>

      {/* Entertainment */}
      {entertainmentConnectors.some(c => !connectedServices.includes(c.provider)) && (
        <>
          <Divider />
          <SectionLabel label="Entertainment" />
          <div className="space-y-2">
            {renderUnconnectedTiles(entertainmentConnectors)}
          </div>
        </>
      )}

      {/* Health & Fitness */}
      {healthConnectors.some(c => !connectedServices.includes(c.provider)) && (
        <>
          <Divider />
          <SectionLabel label="Health & Fitness" />
          <div className="space-y-2">
            {renderUnconnectedTiles(healthConnectors)}
          </div>
        </>
      )}

      {/* Social & Community */}
      {socialConnectors.some(c => !connectedServices.includes(c.provider)) && (
        <>
          <Divider />
          <SectionLabel label="Social & Community" />
          <div className="space-y-2">
            {renderUnconnectedTiles(socialConnectors)}
          </div>
        </>
      )}

      {/* Professional */}
      {[...professionalConnectors, ...browsingConnectors].some(c => !connectedServices.includes(c.provider)) && (
        <>
          <Divider />
          <SectionLabel label="Professional" />
          <div className="space-y-2">
            {renderUnconnectedTiles([...professionalConnectors, ...browsingConnectors])}
          </div>
        </>
      )}

      {/* Upload historical data */}
      {userId && (
        <>
          <Divider />
          <SectionLabel label="Upload Historical Data" />
          <DataUploadPanel userId={userId} />
        </>
      )}
    </div>
  );
};
