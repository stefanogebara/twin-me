#!/usr/bin/env python3
"""
Script to integrate PlatformConnectionCard into SoulSignatureDashboard
"""

def main():
    # Read the file
    with open('src/pages/SoulSignatureDashboard.tsx', 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Add import for PlatformConnectionCard
    import_line = "import { SoulDataExtractor } from '@/components/SoulDataExtractor';"
    new_import = import_line + "\nimport { PlatformConnectionCard } from '@/components/PlatformConnectionCard';"

    if "import { PlatformConnectionCard }" not in content:
        content = content.replace(import_line, new_import)
        print("[OK] Added PlatformConnectionCard import")
    else:
        print("[INFO] PlatformConnectionCard already imported")

    # 2. Add disconnect and reconnect handlers after handleConnectorClick
    if "const handleReconnect" not in content:
        # Find the end of handleConnectorClick function
        handler_insert_pos = content.find("  const extractSoulSignature")
        if handler_insert_pos > 0:
            new_handlers = """
  // Handle platform reconnection (for expired tokens)
  const handleReconnect = async (connectorKey: string) => {
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

      // First disconnect the expired/failed connection
      await fetch(`${apiUrl}/oauth/disconnect/${connectorKey}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id || 'current-user' })
      });

      // Then initiate fresh OAuth flow
      const response = await fetch(`${apiUrl}/entertainment/connect/${connectorKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id || 'current-user' })
      });

      const data = await response.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      }
    } catch (error) {
      console.error(`Failed to reconnect ${connectorKey}:`, error);
    }
  };

  // Handle platform disconnection
  const handleDisconnect = async (connectorKey: string) => {
    if (!confirm(`Are you sure you want to disconnect ${connectorKey}?`)) {
      return;
    }

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
      const response = await fetch(`${apiUrl}/oauth/disconnect/${connectorKey}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id || 'current-user' })
      });

      if (response.ok) {
        // Refetch platform status to update UI
        if (refetch) {
          refetch();
        }
      }
    } catch (error) {
      console.error(`Failed to disconnect ${connectorKey}:`, error);
    }
  };

"""
            content = content[:handler_insert_pos] + new_handlers + content[handler_insert_pos:]
            print("[OK] Added reconnect and disconnect handlers")
        else:
            print("[WARNING] Could not find insertion point for handlers")
    else:
        print("[INFO] Handlers already added")

    # 3. Get refetch from usePlatformStatus
    old_hook_usage = """  // Use unified platform status hook
  const {
    data: platformStatus,
    hasConnectedServices: platformsConnected,
    connectedProviders
  } = usePlatformStatus(user?.id);"""

    new_hook_usage = """  // Use unified platform status hook
  const {
    data: platformStatus,
    hasConnectedServices: platformsConnected,
    connectedProviders,
    refetch
  } = usePlatformStatus(user?.id);"""

    if "refetch" not in content or old_hook_usage in content:
        content = content.replace(old_hook_usage, new_hook_usage)
        print("[OK] Updated usePlatformStatus to include refetch")
    else:
        print("[INFO] refetch already included")

    # 4. Replace the platform connector rendering with PlatformConnectionCard
    old_connector_block = """              <div className="space-y-3">
                {currentCluster.connectors.map((connector) => (
                  <button
                    key={connector.key}
                    onClick={() => handleConnectorClick(activeCluster, connector.key)}
                    className={cn(
                      "w-full p-3 rounded-lg bg-[hsl(var(--claude-surface-raised))]",
                      "flex items-center justify-between",
                      connector.status ? 'border border-[hsl(var(--claude-accent))]' : 'border border-[hsl(var(--claude-border))]'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span style={{ color: '#141413' }}>{connector.icon}</span>
                      <span
                        style={{
                          fontFamily: 'var(--_typography---font--tiempos)',
                          color: 'hsl(var(--claude-text))'
                        }}
                      >
                        {connector.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {connector.status ? (
                        <>
                          <Badge
                            className="bg-[hsl(var(--claude-surface-raised))] text-[hsl(var(--claude-accent))] border border-[hsl(var(--claude-accent))]"
                          >
                            ✓ Connected
                          </Badge>
                          {hasExtractedData && (
                            <Badge
                              className="bg-green-500/10 text-green-600 border border-green-500/20"
                              title="Data extracted successfully"
                            >
                              Extracted
                            </Badge>
                          )}
                        </>
                      ) : (
                        <ChevronRight className="w-4 h-4" style={{ color: '#6B7280' }} />
                      )}
                    </div>
                  </button>
                ))}"""

    new_connector_block = """              <div className="space-y-3">
                {currentCluster.connectors.map((connector) => (
                  <PlatformConnectionCard
                    key={connector.key}
                    connector={connector}
                    platformStatus={platformStatus[connector.key]}
                    hasExtractedData={hasExtractedData}
                    onConnect={() => handleConnectorClick(activeCluster, connector.key)}
                    onReconnect={() => handleReconnect(connector.key)}
                    onDisconnect={() => handleDisconnect(connector.key)}
                  />
                ))}"""

    if old_connector_block in content:
        content = content.replace(old_connector_block, new_connector_block)
        print("[OK] Replaced platform rendering with PlatformConnectionCard")
    else:
        print("[WARNING] Could not find exact connector block to replace - manual update may be needed")

    # Write the file back
    with open('src/pages/SoulSignatureDashboard.tsx', 'w', encoding='utf-8') as f:
        f.write(content)

    print("\n[SUCCESS] Successfully updated SoulSignatureDashboard with enhanced UI")

if __name__ == '__main__':
    main()