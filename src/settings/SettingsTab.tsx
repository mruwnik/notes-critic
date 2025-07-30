import { App, Plugin, PluginSettingTab } from 'obsidian';
import { NotesCriticSettings } from 'types';
import { SettingsTabReact } from 'settings/components/SettingsTab';
import { SettingsProvider } from 'hooks/useSettings';
import React from 'react';
import { createRoot } from 'react-dom/client';

export class NotesCriticSettingsTab extends PluginSettingTab {
    plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> };
    private reactRoot: any;

    constructor(app: App, plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> }) {
        super(app, plugin);
        this.plugin = plugin;
    }

    async display(): Promise<void> {
        const { containerEl } = this;
        containerEl.empty();

        // Create React root and render the React component with SettingsProvider
        this.reactRoot = createRoot(containerEl);
        this.reactRoot.render(
            <SettingsProvider app={this.app} plugin={this.plugin}>
                <SettingsTabReact />
            </SettingsProvider>
        );
    }

    hide(): void {
        // Clean up React root when hiding
        if (this.reactRoot) {
            this.reactRoot.unmount();
            this.reactRoot = null;
        }
        super.hide();
    }
} 