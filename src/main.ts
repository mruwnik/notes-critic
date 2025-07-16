import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { NotesCriticSettings, DEFAULT_SETTINGS, CHAT_VIEW_CONFIG } from 'types';
import { ChatView } from 'views/ChatView';
import { NotesCriticSettingsTab } from 'settings/SettingsTab';
import { OAuthClient } from 'llm/oauthClient';
import { MCP_AUTH_CALLBACK } from './constants';

export default class NotesCritic extends Plugin {
    settings: NotesCriticSettings;

    async onload() {
        await this.loadSettings();

        this.registerView(CHAT_VIEW_CONFIG.type, (leaf) => {
            return new ChatView(leaf, this);
        });

        this.registerObsidianProtocolHandler(MCP_AUTH_CALLBACK, async (e) => {
            const parameters = e as unknown as { code: string, state: string };
            const oauthClient = new OAuthClient(this.settings.mcpServerUrl || '');
            await oauthClient.exchangeCodeForToken(parameters.code, parameters.state);
        });

        this.addRibbonIcon(
            CHAT_VIEW_CONFIG.icon,
            CHAT_VIEW_CONFIG.name,
            async () => {
                const leafs = this.app.workspace.getLeavesOfType(
                    CHAT_VIEW_CONFIG.type
                );
                let leaf: WorkspaceLeaf;
                if (leafs.length === 0) {
                    leaf =
                        this.app.workspace.getRightLeaf(false) ??
                        this.app.workspace.getLeaf();
                    await leaf.setViewState({
                        type: CHAT_VIEW_CONFIG.type,
                    });
                } else {
                    leaf = leafs.first()!;
                }
                await this.app.workspace.revealLeaf(leaf);
            }
        );

        this.addSettingTab(new NotesCriticSettingsTab(this.app, this));
    }

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
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }
}