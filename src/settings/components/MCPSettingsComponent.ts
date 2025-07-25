import { App, Plugin, Setting } from 'obsidian';
import { NotesCriticSettings, MCPServerConfig } from 'types';
import { MCPClient } from 'llm/mcpClient';
import { OAuthClient } from 'llm/oauthClient';

export class MCPSettingsComponent {
    private app: App;
    private container: HTMLElement;
    private plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> };

    constructor(
        app: App,
        container: HTMLElement,
        plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> }
    ) {
        this.app = app;
        this.container = container;
        this.plugin = plugin;
    }

    async render(): Promise<void> {
        this.container.empty();
        this.createMCPServersSection();
    }

    private createMCPServersSection(): void {
        const serversContainer = this.container.createDiv();
        serversContainer.className = 'notes-critic-mcp-servers-container';

        // Header with add button
        const headerContainer = serversContainer.createDiv();
        headerContainer.className = 'notes-critic-mcp-servers-header';

        const headerText = headerContainer.createEl('div', { text: 'MCP Servers' });
        headerText.className = 'notes-critic-mcp-servers-title';

        const addButton = headerContainer.createEl('button', { text: '+ Add Server' });
        addButton.className = 'notes-critic-add-server-button';
        addButton.onclick = () => this.addNewMCPServer(serversContainer);

        // List existing servers
        this.renderMCPServersList(serversContainer);
    }

    private renderMCPServersList(container: HTMLElement): void {
        // Remove existing server list if it exists
        const existingList = container.querySelector('.notes-critic-mcp-servers-list');
        if (existingList) {
            existingList.remove();
        }

        const serversList = container.createDiv();
        serversList.className = 'notes-critic-mcp-servers-list';

        if (this.plugin.settings.mcpServers.length === 0) {
            const emptyState = serversList.createEl('div', {
                text: 'No MCP servers configured. Click "Add Server" to get started.'
            });
            emptyState.className = 'notes-critic-empty-state';
            return;
        }

        for (const server of this.plugin.settings.mcpServers) {
            this.createMCPServerItem(serversList, server);
        }
    }

    private createMCPServerItem(container: HTMLElement, server: MCPServerConfig): void {
        const serverItem = container.createDiv();
        serverItem.className = 'notes-critic-mcp-server-item';

        // Server header with name and actions
        const serverHeader = serverItem.createDiv();
        serverHeader.className = 'notes-critic-mcp-server-header';

        const serverTitle = serverHeader.createDiv();
        serverTitle.className = 'notes-critic-mcp-server-title';
        serverTitle.textContent = server.name || server.id;

        const serverActions = serverHeader.createDiv();
        serverActions.className = 'notes-critic-mcp-server-actions';

        // Enable/disable toggle
        const enableToggle = serverActions.createEl('input', { type: 'checkbox' });
        enableToggle.checked = server.enabled;
        enableToggle.onchange = async () => {
            server.enabled = enableToggle.checked;
            await this.plugin.saveSettings();
        };

        const enableLabel = serverActions.createEl('label', { text: 'Enabled' });
        enableLabel.prepend(enableToggle);

        // Delete button
        const deleteButton = serverActions.createEl('button', { text: '🗑️' });
        deleteButton.className = 'notes-critic-delete-server-button';
        deleteButton.title = 'Delete server';
        deleteButton.onclick = () => this.deleteMCPServer(server.id, container.parentElement!);

        // Server details
        const serverDetails = serverItem.createDiv();
        serverDetails.className = 'notes-critic-mcp-server-details';

        let authButton: any;

        // Name field
        new Setting(serverDetails)
            .setName('Server Name')
            .setDesc('Display name for this MCP server')
            .addText(text => {
                text.setValue(server.name)
                    .onChange(async (value) => {
                        server.name = value;
                        serverTitle.textContent = value || server.id;
                        await this.plugin.saveSettings();
                    });
            });

        // URL field
        new Setting(serverDetails)
            .setName('Server URL')
            .setDesc('The URL of the MCP server')
            .addText(text => {
                text.setValue(server.url)
                    .onChange(async (value) => {
                        server.url = value;
                        // Update auth button state based on new URL
                        if ((authButton as any)?.updateAuthButton) {
                            (authButton as any).updateAuthButton();
                        }
                        await this.plugin.saveSettings();
                    });
                text.inputEl.className = 'notes-critic-api-key-input';
            })
            .addButton(button => {
                button.setButtonText('Test')
                    .setTooltip('Test server connection')
                    .setClass('notes-critic-test-button')
                    .onClick(async () => {
                        await this.testMCPServer(button, server);
                    });
            });

        // Auth button
        new Setting(serverDetails)
            .setName('Authorization')
            .setDesc('Authorize with this MCP server using OAuth 2.1')
            .addButton(button => {
                const { authButton: createdButton, updateButton } = this.createAuthButton(button, server);
                authButton = createdButton;
                // Store updateButton reference for URL changes
                (authButton as any).updateAuthButton = updateButton;
            });
    }

    private async testMCPServer(button: any, server: MCPServerConfig): Promise<void> {
        if (!server.url) {
            button.setButtonText('No URL');
            return;
        }

        button.setButtonText('Testing...');
        button.setDisabled(true);

        try {
            const client = new MCPClient(server);
            const isValid = await client.testConnection();

            if (isValid) {
                button.setButtonText('✓ Connected');
                button.buttonEl.className = 'notes-critic-test-button notes-critic-test-button-valid';
            } else {
                button.setButtonText('✗ Failed');
                button.buttonEl.className = 'notes-critic-test-button notes-critic-test-button-invalid';
            }

            setTimeout(() => {
                button.setButtonText('Test');
                button.setDisabled(false);
                button.buttonEl.className = 'notes-critic-test-button';
            }, 3000);
        } catch (error) {
            console.error('MCP server test failed:', error);
            button.setButtonText('✗ Error');
            button.buttonEl.className = 'notes-critic-test-button notes-critic-test-button-invalid';

            setTimeout(() => {
                button.setButtonText('Test');
                button.setDisabled(false);
                button.buttonEl.className = 'notes-critic-test-button';
            }, 3000);
        }
    }

    private createAuthButton(button: any, server: MCPServerConfig): { authButton: any; updateButton: () => void } {
        let isWaitingForCallback = false;

        // Create OAuthClient based on current server URL
        const getOAuthClient = (): OAuthClient | null => {
            if (!server.url || server.url.trim().length === 0) {
                return null;
            }

            try {
                return new OAuthClient(server.url);
            } catch (error) {
                console.warn('Invalid MCP server URL for OAuth:', error);
                return null;
            }
        };

        const updateButton = () => {
            const oauthClient = getOAuthClient();

            if (!oauthClient) {
                button.setButtonText('No Server URL')
                    .setTooltip('Enter a valid MCP server URL first')
                    .setClass('notes-critic-test-button')
                    .setDisabled(true);
            } else if (isWaitingForCallback) {
                button.setButtonText('Complete Auth')
                    .setTooltip('Complete authorization in browser, then click here')
                    .setClass('notes-critic-test-button');
            } else if (oauthClient.isAuthenticated()) {
                button.setButtonText('Logout')
                    .setTooltip('Logout from MCP server')
                    .setClass('notes-critic-test-button');
            } else {
                button.setButtonText('Authorize')
                    .setTooltip('Authorize with MCP server')
                    .setClass('notes-critic-test-button');
            }
        };

        updateButton();

        button.onClick(async () => {
            const oauthClient = getOAuthClient();
            if (!oauthClient) return;

            try {
                if (oauthClient.isAuthenticated()) {
                    await oauthClient.logout();
                    updateButton();
                } else {
                    button.setButtonText('Authorizing...');
                    button.setDisabled(true);

                    try {
                        const authUrl = await oauthClient.authorize();
                        window.open(authUrl, '_blank');
                        isWaitingForCallback = true;
                        updateButton();
                        button.setDisabled(false);
                    } catch (error) {
                        console.error('Failed to authorize:', error);
                        button.setButtonText('✗ Error');
                        button.buttonEl.className = 'notes-critic-test-button notes-critic-test-button-invalid';

                        setTimeout(() => {
                            updateButton();
                            button.setDisabled(false);
                        }, 3000);
                    }
                }
            } catch (error) {
                button.setButtonText('✗ Error');
                button.buttonEl.className = 'notes-critic-test-button notes-critic-test-button-invalid';

                setTimeout(() => {
                    updateButton();
                    button.setDisabled(false);
                }, 3000);
            }
        });

        return { authButton: button, updateButton };
    }

    private addNewMCPServer(container: HTMLElement): void {
        const newServer: MCPServerConfig = {
            id: `mcp-server-${Date.now()}`,
            name: `MCP Server ${this.plugin.settings.mcpServers.length + 1}`,
            url: '',
            enabled: true,
            transport: 'websocket'
        };

        this.plugin.settings.mcpServers.push(newServer);
        this.plugin.saveSettings();
        this.renderMCPServersList(container);
    }

    private deleteMCPServer(serverId: string, container: HTMLElement): void {
        const index = this.plugin.settings.mcpServers.findIndex(s => s.id === serverId);
        if (index !== -1) {
            this.plugin.settings.mcpServers.splice(index, 1);
            this.plugin.saveSettings();
            this.renderMCPServersList(container);
        }
    }
} 