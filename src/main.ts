import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { NotesCriticSettings, CHAT_VIEW_CONFIG } from 'types';
import { ChatView } from 'views/ChatView';
import { NotesCriticSettingsTab } from 'settings/SettingsTab';
import { OAuthClient } from 'llm/oauthClient';
import { MCP_AUTH_CALLBACK, DEFAULT_SETTINGS } from './constants';
import { MCPClient, MCPManager } from 'llm/mcpClient';

export default class NotesCritic extends Plugin {
    settings: NotesCriticSettings;
    mcpManager: MCPManager;

    async activateView() {
        const { workspace } = this.app;

        let leaf: WorkspaceLeaf | null = null;
        const leaves = workspace.getLeavesOfType(CHAT_VIEW_CONFIG.type);

        if (leaves.length > 0) {
            // A leaf with our view already exists, use that
            leaf = leaves[0];
        } else {
            // Our view could not be found in the workspace, create a new leaf
            // in the right sidebar for it
            leaf = workspace.getRightLeaf(false);
            if (leaf) {
                await leaf.setViewState({ type: CHAT_VIEW_CONFIG.type, active: true });
            }
        }

        // "Reveal" the leaf in case it is in a collapsed sidebar
        if (leaf) {
            workspace.revealLeaf(leaf);
        }
    }

    async onload() {
        await this.loadSettings();
        this.mcpManager = new MCPManager(this.settings);

        this.registerView(CHAT_VIEW_CONFIG.type, (leaf) => {
            return new ChatView(leaf, this);
        });

        this.registerObsidianProtocolHandler(MCP_AUTH_CALLBACK, async (e) => {
            const parameters = e as unknown as { code: string, state: string, serverUrl: string };

            const decodedServerUrl = decodeURIComponent(parameters.serverUrl);
            const oauthClient = new OAuthClient(decodedServerUrl);
            const tokens = await oauthClient.exchangeCodeForToken(parameters.code, parameters.state);

            const config = this.settings.mcpServers.find(s => s.url === decodedServerUrl);
            if (!config) {
                throw new Error(`No MCP client found for server URL: ${parameters.serverUrl}`);
            }

            config.apiKey = tokens.access_token;
            const server = new MCPClient(config);
            if (!this.settings.mcpClients) {
                this.settings.mcpClients = [];
            }
            this.settings.mcpClients.push(server);
            const tools = await server.getTools();
            this.settings.enabledTools = [...this.settings.enabledTools, ...tools.map(t => t.name)];
            this.saveSettings();
        });

        this.addRibbonIcon(
            CHAT_VIEW_CONFIG.icon,
            CHAT_VIEW_CONFIG.name,
            this.activateView.bind(this)
        );

        this.addSettingTab(new NotesCriticSettingsTab(this.app, this));
    }

    async triggerFeedbackForCurrentNote() {
        const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_CONFIG.type);
        if (leaves.length > 0) {
            const chatView = leaves[0].view as ChatView;
            if (chatView && typeof chatView.triggerFeedback === 'function') {
                await chatView.triggerFeedback();
            }
        } else {
            new Notice('Please open the feedback view first');
        }
    }

    onunload() {
        // Cleanup if needed
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
        this.settings.mcpClients = this.settings.mcpServers.map(s => new MCPClient(s));
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.refreshChatViewModelSelectors();
    }

    private refreshChatViewModelSelectors() {
        const leaves = this.app.workspace.getLeavesOfType(CHAT_VIEW_CONFIG.type);
        leaves.forEach(leaf => {
            const view = leaf.view as any;
            if (view && typeof view.refreshModelSelector === 'function') {
                view.refreshModelSelector();
            }
        });
    }
}