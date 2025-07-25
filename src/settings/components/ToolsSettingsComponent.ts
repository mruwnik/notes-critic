import { App, Plugin } from 'obsidian';
import { NotesCriticSettings } from 'types';
import { MCPManager, Tool } from 'llm/mcpClient';
import { allTools } from 'llm/tools';

export class ToolsSettingsComponent {
    private app: App;
    private container: HTMLElement;
    private plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> };
    private mcpManager: MCPManager;

    constructor(
        app: App,
        container: HTMLElement,
        plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> }
    ) {
        this.app = app;
        this.container = container;
        this.plugin = plugin;
        this.mcpManager = new MCPManager(plugin.settings);
    }

    async render(): Promise<void> {
        this.container.empty();

        const toolsContainer = this.container.createDiv();
        toolsContainer.className = 'notes-critic-tools-container';

        // Built-in tools section
        this.renderBuiltInTools(toolsContainer);

        // MCP server tools sections
        await this.renderMCPTools(toolsContainer);
    }

    private renderBuiltInTools(container: HTMLElement): void {
        const builtInSection = container.createEl('details');
        builtInSection.className = 'notes-critic-tools-section';

        const summary = builtInSection.createEl('summary', { text: `Built-in Tools (${allTools.length})` });
        summary.className = 'notes-critic-tools-section-summary';

        for (const tool of allTools) {
            this.createSimpleToolItem(builtInSection, tool.name, tool.description);
        }
    }

    private async renderMCPTools(container: HTMLElement): Promise<void> {
        try {
            const mcpTools = await this.mcpManager.getAllTools(true);

            // Group tools by server
            const toolsByServer = new Map<string, Tool[]>();

            for (const tool of mcpTools) {
                const serverId = tool.serverId || 'unknown';
                if (!toolsByServer.has(serverId)) {
                    toolsByServer.set(serverId, []);
                }
                toolsByServer.get(serverId)!.push(tool);
            }

            // Create a section for each server
            for (const [serverId, tools] of toolsByServer) {
                const client = this.mcpManager.getClient(serverId);
                const serverName = client?.getServerConfig().name || serverId;
                const isConnected = client?.isAuthenticated() || false;
                const statusIcon = isConnected ? '✓' : '✗';

                const serverSection = container.createEl('details');
                serverSection.className = 'notes-critic-tools-section';

                const summary = serverSection.createEl('summary', { text: `${statusIcon} ${serverName} (${tools.length})` });
                summary.className = 'notes-critic-tools-section-summary';

                for (const tool of tools) {
                    this.createSimpleToolItem(serverSection, tool.name, tool.description, isConnected);
                }
            }
        } catch (error) {
            console.error('Failed to load MCP tools:', error);
        }
    }

    private createSimpleToolItem(container: HTMLElement, name: string, description: string, enabled: boolean = true): void {
        const toolItem = container.createDiv();
        toolItem.className = 'notes-critic-simple-tool-item';

        const checkbox = toolItem.createEl('input', { type: 'checkbox' });
        checkbox.checked = enabled && this.plugin.settings.enabledTools.includes(name);
        checkbox.className = 'notes-critic-tool-checkbox';
        checkbox.addEventListener('change', () => {
            const enabledTools = this.plugin.settings.enabledTools.filter(t => t !== name);
            if (checkbox.checked) {
                enabledTools.push(name);
            }
            this.plugin.settings.enabledTools = enabledTools;
            this.plugin.saveSettings();
        });

        const toolName = toolItem.createEl('span', { text: name });
        toolName.className = 'notes-critic-tool-name';

        const toolDescription = toolItem.createEl('span', { text: description || 'No description available' });
        toolDescription.className = 'notes-critic-tool-description';
    }
}