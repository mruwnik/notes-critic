import React, { useState, useCallback } from 'react';
import { MCPServerConfig } from 'types';
import { MCPClient } from 'llm/mcpClient';
import { OAuthClient } from 'llm/oauthClient';
import { useMCPSettings, useSettings, SettingsProvider } from 'hooks/useSettings';

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
        return authState === 'error' ? 'notes-critic-test-button notes-critic-test-button-invalid' : 'notes-critic-test-button';
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
        const baseClass = 'notes-critic-test-button';
        switch (testStatus) {
            case 'connected': return `${baseClass} notes-critic-test-button-valid`;
            case 'failed':
            case 'error': return `${baseClass} notes-critic-test-button-invalid`;
            default: return baseClass;
        }
    };

    return (
        <div className="notes-critic-mcp-server-item">
            {/* Server Header */}
            <div className="notes-critic-mcp-server-header">
                <div className="notes-critic-mcp-server-title">
                    {server.name || server.id}
                </div>
                <div className="notes-critic-mcp-server-actions">
                    <label>
                        <input
                            type="checkbox"
                            checked={server.enabled}
                            onChange={(e) => handleServerUpdate('enabled', e.target.checked)}
                        />
                        Enabled
                    </label>
                    <button
                        className="notes-critic-delete-server-button"
                        onClick={() => onDelete(server.id)}
                        title="Delete server"
                    >
                        🗑️
                    </button>
                </div>
            </div>

            {/* Server Details */}
            <div className="notes-critic-mcp-server-details">
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
                            className="notes-critic-api-key-input"
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
            transport: 'websocket'
        };

        await addMCPServer(newServer);
    }, [mcpServers.length, addMCPServer]);

    const handleDeleteServer = useCallback(async (serverId: string) => {
        await removeMCPServer(serverId);
    }, [removeMCPServer]);

    return (
        <div className="notes-critic-mcp-servers-container">
            {/* Header */}
            <div className="notes-critic-mcp-servers-header">
                <div className="notes-critic-mcp-servers-title">MCP Servers</div>
                <button 
                    className="notes-critic-add-server-button"
                    onClick={handleAddServer}
                >
                    + Add Server
                </button>
            </div>

            {/* Server List */}
            <div className="notes-critic-mcp-servers-list">
                {mcpServers.length === 0 ? (
                    <div className="notes-critic-empty-state">
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
