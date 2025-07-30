import React, { useState, useEffect, useCallback } from 'react';
import { App, Plugin } from 'obsidian';
import { NotesCriticSettings } from 'types';
import { MCPManager, Tool } from 'llm/mcpClient';
import { allTools } from 'llm/tools';
import { useToolSettings, useSettings, useMCPSettings, SettingsProvider } from 'hooks/useSettings';


interface ToolItemProps {
    name: string;
    description: string;
    enabled: boolean;
    isToolEnabled: boolean;
    onToggle: (toolName: string, enabled: boolean) => void;
}

interface ToolSectionProps {
    title: string;
    tools: { name: string; description: string; enabled?: boolean }[];
    isOpen?: boolean;
    enabledTools: string[];
    onToggleTool: (toolName: string, enabled: boolean) => void;
}

const ToolItem: React.FC<ToolItemProps> = ({ name, description, enabled, isToolEnabled, onToggle }) => {
    return (
        <div className="notes-critic-simple-tool-item">
            <input
                type="checkbox"
                className="notes-critic-tool-checkbox"
                checked={enabled && isToolEnabled}
                disabled={!enabled}
                onChange={(e) => onToggle(name, e.target.checked)}
            />
            <span className="notes-critic-tool-name">{name}</span>
            <span className="notes-critic-tool-description">
                {description || 'No description available'}
            </span>
        </div>
    );
};

const ToolSection: React.FC<ToolSectionProps> = ({ title, tools, isOpen = false, enabledTools, onToggleTool }) => {
    return (
        <details className="notes-critic-tools-section" open={isOpen}>
            <summary className="notes-critic-tools-section-summary">
                {title} ({tools.length})
            </summary>
            {tools.map(tool => (
                <ToolItem
                    key={tool.name}
                    name={tool.name}
                    description={tool.description}
                    enabled={tool.enabled ?? true}
                    isToolEnabled={enabledTools.includes(tool.name)}
                    onToggle={onToggleTool}
                />
            ))}
        </details>
    );
};

export const ToolsSettingsReact: React.FC = () => {
    const { app, plugin } = useSettings();
    const { enabledTools, toggleTool } = useToolSettings();
    const [mcpTools, setMcpTools] = useState<Tool[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mcpManager] = useState(() => new MCPManager(plugin.settings));

    const loadMCPTools = useCallback(async () => {
        try {
            setError(null);
            const tools = await mcpManager.getAllTools(true);
            setMcpTools(tools);
        } catch (err: any) {
            setError(`Failed to load MCP tools: ${err.message}`);
            console.error('Failed to load MCP tools:', err);
        } finally {
            setIsLoading(false);
        }
    }, [mcpManager]);

    useEffect(() => {
        loadMCPTools();
    }, [loadMCPTools]);

    const handleToggleTool = useCallback(async (toolName: string, enabled: boolean) => {
        await toggleTool(toolName, enabled);
    }, [toggleTool]);

    // Group MCP tools by server
    const toolsByServer = React.useMemo(() => {
        const grouped = new Map<string, Tool[]>();
        
        for (const tool of mcpTools) {
            const serverId = tool.serverId || 'unknown';
            if (!grouped.has(serverId)) {
                grouped.set(serverId, []);
            }
            grouped.get(serverId)!.push(tool);
        }
        
        return grouped;
    }, [mcpTools]);

    // Get server sections
    const mcpSections = React.useMemo(() => {
        const sections: { title: string; tools: { name: string; description: string; enabled: boolean; }[] }[] = [];
        
        for (const [serverId, tools] of toolsByServer) {
            const client = mcpManager.getClient(serverId);
            const serverName = client?.getServerConfig().name || serverId;
            const isConnected = client?.isAuthenticated() || false;
            const statusIcon = isConnected ? '✓' : '✗';
            
            sections.push({
                title: `${statusIcon} ${serverName}`,
                tools: tools.map(tool => ({
                    name: tool.name,
                    description: tool.description,
                    enabled: isConnected
                }))
            });
        }
        
        return sections;
    }, [toolsByServer, mcpManager]);

    // Built-in tools section
    const builtInTools = React.useMemo(() => {
        return allTools.map(tool => ({
            name: tool.name,
            description: tool.description,
            enabled: true
        }));
    }, []);

    if (isLoading) {
        return (
            <div className="notes-critic-tools-container">
                <p>Loading tools...</p>
            </div>
        );
    }

    return (
        <div className="notes-critic-tools-container">
            {/* Built-in Tools Section */}
            <ToolSection
                title="Built-in Tools"
                tools={builtInTools}
                enabledTools={enabledTools}
                onToggleTool={handleToggleTool}
            />

            {/* MCP Tools Sections */}
            {mcpSections.map((section, index) => (
                <ToolSection
                    key={index}
                    title={section.title}
                    tools={section.tools}
                    enabledTools={enabledTools}
                    onToggleTool={handleToggleTool}
                />
            ))}

            {/* Error Display */}
            {error && (
                <div className="notes-critic-error">
                    {error}
                </div>
            )}

            {/* Empty State */}
            {!isLoading && mcpTools.length === 0 && !error && (
                <div className="notes-critic-empty-state">
                    No MCP tools available. Configure MCP servers to see additional tools.
                </div>
            )}
        </div>
    );
};
