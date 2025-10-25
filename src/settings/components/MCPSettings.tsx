import React, { useState, useCallback } from 'react';
import { MCPServerConfig } from 'types';
import { MCPClient } from 'llm/mcpClient';
import { OAuthClient } from 'llm/oauthClient';
import { useMCPSettings, useSettings } from 'hooks/useSettings';

interface MCPServerItemProps {
    server: MCPServerConfig;
    onUpdate: (updatedServer: MCPServerConfig) => Promise<void>;
    onDelete: (serverId: string) => void;
}

interface AuthButtonProps {
    server: MCPServerConfig;
}

const AuthButton: React.FC<AuthButtonProps> = ({ server }) => {
    const [authState, setAuthState] = useState<'no-url' | 'idle' | 'authorizing' | 'waiting' | 'authenticated' | 'error'>('idle');
    const [isWaitingForCallback, setIsWaitingForCallback] = useState(false);

    const getOAuthClient = useCallback((): OAuthClient | null => {
        if (!server.url || server.url.trim().length === 0) {
            return null;
        }
        try {
            return new OAuthClient(server.url);
        } catch (error) {
            console.warn('Invalid MCP server URL for OAuth:', error);
            return null;
        }
    }, [server.url]);

    const updateAuthState = useCallback(() => {
        const oauthClient = getOAuthClient();
        
        if (!oauthClient) {
            setAuthState('no-url');
        } else if (isWaitingForCallback) {
            setAuthState('waiting');
        } else if (oauthClient.isAuthenticated()) {
            setAuthState('authenticated');
        } else {
            setAuthState('idle');
        }
    }, [getOAuthClient, isWaitingForCallback]);

    React.useEffect(() => {
        updateAuthState();
    }, [updateAuthState]);

    // Listen for auth completion events
    React.useEffect(() => {
        const handleAuthComplete = (e: CustomEvent) => {
            if (e.detail.serverUrl === server.url) {
                setIsWaitingForCallback(false);
                updateAuthState();
            }
        };

        window.addEventListener('mcp-auth-complete', handleAuthComplete as EventListener);
        return () => window.removeEventListener('mcp-auth-complete', handleAuthComplete as EventListener);
    }, [server.url, updateAuthState]);

    const handleAuth = async () => {
        const oauthClient = getOAuthClient();
        if (!oauthClient) return;

        try {
            if (oauthClient.isAuthenticated()) {
                await oauthClient.logout();
                setIsWaitingForCallback(false);
                updateAuthState();
            } else {
                setAuthState('authorizing');
                
                try {
                    const authUrl = await oauthClient.authorize();
                    window.open(authUrl, '_blank');
                    setIsWaitingForCallback(true);
                    updateAuthState();
                } catch (error) {
                    console.error('Failed to authorize:', error);
                    setAuthState('error');
                    setTimeout(() => updateAuthState(), 3000);
                }
            }
        } catch (error) {
            setAuthState('error');
            setTimeout(() => updateAuthState(), 3000);
        }
    };

    const getButtonText = () => {
        switch (authState) {
            case 'no-url': return 'No Server URL';
            case 'authorizing': return 'Authorizing...';
            case 'waiting': return 'Complete Auth';
            case 'authenticated': return 'Logout';
            case 'error': return '✗ Error';
            default: return 'Authorize';
        }
    };

    const getButtonClass = () => {
        const baseClasses = 'nc-btn nc-btn--sm';
        return authState === 'error' ? `${baseClasses} nc-btn--invalid` : `${baseClasses} nc-btn--secondary`;
    };

    return (
        <button
            className={getButtonClass()}
            onClick={handleAuth}
            disabled={authState === 'no-url' || authState === 'authorizing'}
            title={authState === 'no-url' ? 'Enter a valid MCP server URL first' : 
                   authState === 'waiting' ? 'Complete authorization in browser, then click here' :
                   authState === 'authenticated' ? 'Logout from MCP server' : 'Authorize with MCP server'}
        >
            {getButtonText()}
        </button>
    );
};

const MCPServerItem: React.FC<MCPServerItemProps> = ({ server, onUpdate, onDelete }) => {
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'connected' | 'failed' | 'error'>('idle');

    const handleServerUpdate = async (field: keyof MCPServerConfig, value: any) => {
        const updatedServer = { ...server, [field]: value };
        await onUpdate(updatedServer);
    };

    const handleTest = async () => {
        if (!server.url) {
            setTestStatus('error');
            return;
        }

        setTestStatus('testing');

        try {
            const client = new MCPClient(server);
            const isValid = await client.testConnection();
            
            setTestStatus(isValid ? 'connected' : 'failed');
            
            setTimeout(() => {
                setTestStatus('idle');
            }, 3000);
        } catch (error) {
            console.error('MCP server test failed:', error);
            setTestStatus('error');
            
            setTimeout(() => {
                setTestStatus('idle');
            }, 3000);
        }
    };

    const getTestButtonText = () => {
        switch (testStatus) {
            case 'testing': return 'Testing...';
            case 'connected': return '✓ Connected';
            case 'failed': return '✗ Failed';
            case 'error': return '✗ Error';
            default: return 'Test';
        }
    };

    const getTestButtonClass = () => {
        const baseClasses = 'nc-btn nc-btn--sm nc-ml-2';
        switch (testStatus) {
            case 'connected': return `${baseClasses} nc-btn--valid`;
            case 'failed':
            case 'error': return `${baseClasses} nc-btn--invalid`;
            default: return `${baseClasses} nc-btn--secondary`;
        }
    };

    return (
        <div className="nc-card nc-card--padded">
            {/* Server Header */}
            <div className="nc-flex nc-justify-between nc-items-center nc-pb-2 nc-border-b nc-mb-4">
                <div className="nc-font-medium nc-text-normal">
                    {server.name || server.id}
                </div>
                <div className="nc-flex nc-items-center nc-gap-3">
                    <label className="nc-flex nc-items-center nc-gap-2 nc-text-sm nc-text-muted nc-cursor-pointer">
                        <input
                            type="checkbox"
                            checked={server.enabled}
                            onChange={(e) => handleServerUpdate('enabled', e.target.checked)}
                        />
                        Enabled
                    </label>
                    <label className="nc-flex nc-items-center nc-gap-2 nc-text-sm nc-text-muted nc-cursor-pointer">
                        <input
                            type="checkbox"
                            checked={server.clientSideOnly ?? false}
                            onChange={(e) => handleServerUpdate('clientSideOnly', e.target.checked)}
                        />
                        Client-side Only
                    </label>
                    <button
                        className="nc-btn nc-btn--ghost nc-text-error nc-text-lg nc-p-1 nc-rounded-sm"
                        onClick={() => onDelete(server.id)}
                        title="Delete server"
                    >
                        🗑️
                    </button>
                </div>
            </div>

            {/* Server Details */}
            <div>
                {/* Name Setting */}
                <div className="setting-item">
                    <div className="setting-item-info">
                        <div className="setting-item-name">Server Name</div>
                        <div className="setting-item-description">Display name for this MCP server</div>
                    </div>
                    <div className="setting-item-control">
                        <input
                            type="text"
                            value={server.name}
                            onChange={(e) => handleServerUpdate('name', e.target.value)}
                        />
                    </div>
                </div>

                {/* URL Setting */}
                <div className="setting-item">
                    <div className="setting-item-info">
                        <div className="setting-item-name">Server URL</div>
                        <div className="setting-item-description">The URL of the MCP server</div>
                    </div>
                    <div className="setting-item-control">
                        <input
                            type="text"
                            value={server.url}
                            onChange={(e) => handleServerUpdate('url', e.target.value)}
                            className="nc-w-96 nc-min-w-96"
                        />
                        <button
                            className={getTestButtonClass()}
                            onClick={handleTest}
                            disabled={testStatus === 'testing'}
                            title="Test server connection"
                        >
                            {getTestButtonText()}
                        </button>
                    </div>
                </div>

                {/* Authorization Setting */}
                <div className="setting-item">
                    <div className="setting-item-info">
                        <div className="setting-item-name">Authorization</div>
                        <div className="setting-item-description">Authorize with this MCP server using OAuth 2.1</div>
                    </div>
                    <div className="setting-item-control">
                        <AuthButton server={server} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export const MCPSettingsReact: React.FC = () => {
    const { app, plugin } = useSettings();
    const { mcpServers, updateMCPServer, addMCPServer, removeMCPServer } = useMCPSettings();

    const handleServerUpdate = useCallback(async (updatedServer: MCPServerConfig) => {
        await updateMCPServer(updatedServer.id, updatedServer);
    }, [updateMCPServer]);

    const handleAddServer = useCallback(async () => {
        const newServer: MCPServerConfig = {
            id: `mcp-server-${Date.now()}`,
            name: `MCP Server ${mcpServers.length + 1}`,
            url: '',
            enabled: true,
            transport: 'websocket',
            clientSideOnly: true // Default to client-side for new servers (safer default)
        };

        await addMCPServer(newServer);
    }, [mcpServers.length, addMCPServer]);

    const handleDeleteServer = useCallback(async (serverId: string) => {
        await removeMCPServer(serverId);
    }, [removeMCPServer]);

    return (
        <div className="nc-card-container">
            {/* Header */}
            <div className="nc-flex nc-justify-between nc-items-center nc-pb-2 nc-border-b nc-mb-4">
                <div className="nc-text-lg nc-font-semibold nc-text-normal">MCP Servers</div>
                <button 
                    className="nc-btn nc-btn--primary nc-btn--sm"
                    onClick={handleAddServer}
                >
                    + Add Server
                </button>
            </div>

            {/* Server List */}
            <div className="nc-flex nc-flex-col nc-gap-3">
                {mcpServers.length === 0 ? (
                    <div className="nc-text-center nc-text-muted nc-italic nc-p-8 nc-bg-primary nc-rounded nc-border nc-border-faint" style={{borderStyle: 'dashed'}}>
                        No MCP servers configured. Click "Add Server" to get started.
                    </div>
                ) : (
                    mcpServers.map(server => (
                        <MCPServerItem
                            key={server.id}
                            server={server}
                            onUpdate={handleServerUpdate}
                            onDelete={handleDeleteServer}
                        />
                    ))
                )}
            </div>
        </div>
    );
};
