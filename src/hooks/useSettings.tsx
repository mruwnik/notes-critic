import React, { useState, useCallback, useContext, createContext, ReactNode, useEffect } from 'react';
import { App, Plugin, Events } from 'obsidian';
import { NotesCriticSettings } from 'types';

interface SettingsContextType {
    settings: NotesCriticSettings;
    updateSetting: <K extends keyof NotesCriticSettings>(key: K, value: NotesCriticSettings[K]) => Promise<void>;
    updateSettings: (updates: Partial<NotesCriticSettings>) => Promise<void>;
    app: App;
    plugin: Plugin & { 
        settings: NotesCriticSettings; 
        saveSettings(): Promise<void>;
        settingsEvents?: Events;
    };
}

const SettingsContext = createContext<SettingsContextType | null>(null);

interface SettingsProviderProps {
    children: ReactNode;
    app: App;
    plugin: Plugin & { 
        settings: NotesCriticSettings; 
        saveSettings(): Promise<void>;
        settingsEvents?: Events;
    };
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({
    children,
    app,
    plugin
}) => {
    const [settings, setSettings] = useState<NotesCriticSettings>(plugin.settings);

    // Listen for external settings changes
    useEffect(() => {
        if (plugin.settingsEvents) {
            const handleSettingsChange = (newSettings: NotesCriticSettings) => {
                setSettings({ ...newSettings });
            };

            plugin.settingsEvents.on('settings-changed', handleSettingsChange);

            return () => {
                plugin.settingsEvents?.off('settings-changed', handleSettingsChange);
            };
        }
    }, [plugin.settingsEvents]);

    const updateSetting = useCallback(async <K extends keyof NotesCriticSettings>(
        key: K,
        value: NotesCriticSettings[K]
    ) => {
        // Update the plugin settings directly
        plugin.settings[key] = value;

        // Update local state to trigger re-renders
        setSettings({ ...plugin.settings });

        // Save to disk
        await plugin.saveSettings();
    }, [plugin]);

    const updateSettings = useCallback(async (updates: Partial<NotesCriticSettings>) => {
        // Update plugin settings with all changes
        Object.assign(plugin.settings, updates);

        // Update local state to trigger re-renders
        setSettings({ ...plugin.settings });

        // Save to disk
        await plugin.saveSettings();
    }, [plugin]);

    const contextValue: SettingsContextType = {
        settings,
        updateSetting,
        updateSettings,
        app,
        plugin
    };

    return (
        <SettingsContext.Provider value= { contextValue } >
        { children }
        </SettingsContext.Provider>
    );
};

export const useSettings = (): SettingsContextType => {
    const context = useContext(SettingsContext);
    if (!context) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};

// Convenience hooks for common operations
export const useModelSettings = () => {
    const { settings, updateSetting } = useSettings();

    const updateModel = useCallback(async (model: string) => {
        await updateSetting('model', model);
    }, [updateSetting]);

    const updateSummarizerModel = useCallback(async (model: string) => {
        await updateSetting('summarizerModel', model);
    }, [updateSetting]);

    return {
        model: settings.model,
        summarizerModel: settings.summarizerModel,
        updateModel,
        updateSummarizerModel
    };
};

export const useApiKeySettings = () => {
    const { settings, updateSetting } = useSettings();

    const updateAnthropicApiKey = useCallback(async (key: string) => {
        await updateSetting('anthropicApiKey', key);
    }, [updateSetting]);

    const updateOpenaiApiKey = useCallback(async (key: string) => {
        await updateSetting('openaiApiKey', key);
    }, [updateSetting]);

    return {
        anthropicApiKey: settings.anthropicApiKey,
        openaiApiKey: settings.openaiApiKey,
        updateAnthropicApiKey,
        updateOpenaiApiKey
    };
};

export const useMCPSettings = () => {
    const { settings, updateSetting } = useSettings();

    const updateMCPServers = useCallback(async (servers: typeof settings.mcpServers) => {
        await updateSetting('mcpServers', servers);
    }, [updateSetting]);

    const addMCPServer = useCallback(async (server: typeof settings.mcpServers[0]) => {
        const newServers = [...settings.mcpServers, server];
        await updateMCPServers(newServers);
    }, [settings.mcpServers, updateMCPServers]);

    const updateMCPServer = useCallback(async (serverId: string, updates: Partial<typeof settings.mcpServers[0]>) => {
        const newServers = settings.mcpServers.map(server =>
            server.id === serverId ? { ...server, ...updates } : server
        );
        await updateMCPServers(newServers);
    }, [settings.mcpServers, updateMCPServers]);

    const removeMCPServer = useCallback(async (serverId: string) => {
        const newServers = settings.mcpServers.filter(server => server.id !== serverId);
        await updateMCPServers(newServers);
    }, [settings.mcpServers, updateMCPServers]);

    return {
        mcpServers: settings.mcpServers,
        updateMCPServers,
        addMCPServer,
        updateMCPServer,
        removeMCPServer
    };
};

export const useToolSettings = () => {
    const { settings, updateSetting } = useSettings();

    const updateEnabledTools = useCallback(async (tools: string[]) => {
        await updateSetting('enabledTools', tools);
    }, [updateSetting]);

    const toggleTool = useCallback(async (toolName: string, enabled: boolean) => {
        const enabledTools = settings.enabledTools.filter(t => t !== toolName);
        if (enabled) {
            enabledTools.push(toolName);
        }
        await updateEnabledTools(enabledTools);
    }, [settings.enabledTools, updateEnabledTools]);

    return {
        enabledTools: settings.enabledTools,
        updateEnabledTools,
        toggleTool
    };
};