import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { NotesCriticSettings } from 'types';
import { LLMProvider } from 'llm/llmProvider';
import { MCPClient } from 'llm/mcpClient';
import { OAuthClient } from 'llm/oauthClient';

export class NotesCriticSettingsTab extends PluginSettingTab {
    plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> };

    constructor(app: App, plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> }) {
        super(app, plugin);
        this.plugin = plugin;
    }

    private createSectionHeader(title: string): void {
        const header = this.containerEl.createEl('h3', { text: title });
        header.className = 'notes-critic-settings-section';
    }

    private createTextSetting<T>(options: {
        name: string;
        desc: string;
        placeholder: string;
        field: keyof NotesCriticSettings;
        parser?: (value: string) => T | undefined;
        isPassword?: boolean;
        isWide?: boolean;
    }): Setting {
        const currentValue = this.plugin.settings[options.field];
        const displayValue = typeof currentValue === 'string' ? currentValue : currentValue?.toString() || '';

        return new Setting(this.containerEl)
            .setName(options.name)
            .setDesc(options.desc)
            .addText(text => {
                text.setPlaceholder(options.placeholder)
                    .setValue(displayValue);

                if (options.isPassword) {
                    text.inputEl.type = 'password';
                }

                if (options.isWide) {
                    text.inputEl.className = 'notes-critic-api-key-input';
                }

                text.onChange(async (value) => {
                    let parsedValue: any;

                    if (options.parser) {
                        parsedValue = options.parser(value);
                        if (parsedValue === undefined) {
                            return; // Invalid input, don't save
                        }
                    } else {
                        parsedValue = value;
                    }

                    (this.plugin.settings as any)[options.field] = parsedValue;
                    await this.plugin.saveSettings();
                });

                return text;
            });
    }

    private createApiKeySetting(options: {
        name: string;
        desc: string;
        placeholder: string;
        field: keyof NotesCriticSettings;
        provider: 'anthropic' | 'openai';
    }): Setting {
        const currentValue = this.plugin.settings[options.field];
        let displayValue = typeof currentValue === 'string' ? currentValue : '';

        return new Setting(this.containerEl)
            .setName(options.name)
            .setDesc(options.desc)
            .addText(text => {
                text.setPlaceholder(options.placeholder)
                    .setValue(displayValue);

                text.inputEl.type = 'password';
                text.inputEl.className = 'notes-critic-api-key-input';

                text.onChange(async (value) => {
                    displayValue = value; // Update local reference
                    (this.plugin.settings as any)[options.field] = value;
                    await this.plugin.saveSettings();
                });

                return text;
            })
            .addButton(button => {
                button.setButtonText('Test')
                    .setTooltip('Test API key connection')
                    .setClass('notes-critic-test-button')
                    .onClick(async () => {
                        const originalText = button.buttonEl.textContent;
                        button.setButtonText('Testing...');
                        button.setDisabled(true);

                        try {
                            const isValid = await LLMProvider.testApiKey(displayValue, options.provider);

                            if (isValid) {
                                button.setButtonText('✓ Valid');
                                button.buttonEl.className = 'notes-critic-test-button notes-critic-test-button-valid';
                            } else {
                                button.setButtonText('✗ Invalid');
                                button.buttonEl.className = 'notes-critic-test-button notes-critic-test-button-invalid';
                            }

                            setTimeout(() => {
                                button.setButtonText('Test');
                                button.setDisabled(false);
                                button.buttonEl.className = 'notes-critic-test-button';
                            }, 3000);
                        } catch (error) {
                            button.setButtonText('✗ Error');
                            button.buttonEl.className = 'notes-critic-test-button notes-critic-test-button-invalid';

                            setTimeout(() => {
                                button.setButtonText('Test');
                                button.setDisabled(false);
                                button.buttonEl.className = 'notes-critic-test-button';
                            }, 3000);
                        }
                    });
            });
    }

    private createTextAreaSetting(options: {
        name: string;
        desc: string;
        placeholder: string;
        field: keyof NotesCriticSettings;
    }): Setting {
        const currentValue = this.plugin.settings[options.field];
        const displayValue = typeof currentValue === 'string' ? currentValue : '';

        // Create a custom container instead of using Setting's default layout
        const container = this.containerEl.createDiv();
        container.className = 'setting-item notes-critic-textarea-setting';

        // Create the header part (name and description)
        const headerDiv = container.createDiv();
        headerDiv.className = 'setting-item-info';

        const nameDiv = headerDiv.createDiv();
        nameDiv.className = 'setting-item-name';
        nameDiv.textContent = options.name;

        const descDiv = headerDiv.createDiv();
        descDiv.className = 'setting-item-description';
        descDiv.textContent = options.desc;

        // Create textarea below the description
        const textareaContainer = container.createDiv();
        textareaContainer.className = 'notes-critic-textarea-container';

        const textarea = textareaContainer.createEl('textarea');
        textarea.placeholder = options.placeholder;
        textarea.value = displayValue;
        textarea.rows = 8;
        textarea.className = 'notes-critic-textarea';

        textarea.addEventListener('input', async () => {
            (this.plugin.settings as any)[options.field] = textarea.value;
            await this.plugin.saveSettings();
        });

        // Return a dummy setting for consistency
        return new Setting(this.containerEl.createDiv());
    }

    private createDropdownSetting(options: {
        name: string;
        desc: string;
        field: keyof NotesCriticSettings;
        choices: { [key: string]: string };
    }): Setting {
        const currentValue = this.plugin.settings[options.field];
        const displayValue = typeof currentValue === 'string' ? currentValue : '';

        return new Setting(this.containerEl)
            .setName(options.name)
            .setDesc(options.desc)
            .addDropdown(dropdown => dropdown
                .addOptions(options.choices)
                .setValue(displayValue)
                .onChange(async (value) => {
                    (this.plugin.settings as any)[options.field] = value;
                    await this.plugin.saveSettings();
                }));
    }

    private createMCPServerSetting(): Setting {
        const currentValue = this.plugin.settings.mcpServerUrl;
        const displayValue = typeof currentValue === 'string' ? currentValue : '';

        return new Setting(this.containerEl)
            .setName('MCP Server URL')
            .setDesc('URL of the MCP server for enhanced context (leave empty to disable)')
            .addText(text => {
                text.setPlaceholder('http://localhost:8000')
                    .setValue(displayValue);

                text.inputEl.className = 'notes-critic-api-key-input';

                text.onChange(async (value) => {
                    this.plugin.settings.mcpServerUrl = value;
                    await this.plugin.saveSettings();
                });

                return text;
            })
            .addButton(button => {
                button.setButtonText('Test')
                    .setTooltip('Test MCP server connection')
                    .setClass('notes-critic-test-button')
                    .onClick(async () => {
                        const originalText = button.buttonEl.textContent;
                        button.setButtonText('Testing...');
                        button.setDisabled(true);

                        try {
                            const mcpClient = new MCPClient(this.plugin.settings);
                            const tools = await mcpClient.getTools(true);
                            const isValid = tools.length > 0;

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
                    });
            });
    }

    private createMCPAuthSetting(): Setting {
        const oauthClient = new OAuthClient(this.plugin.settings.mcpServerUrl || '');

        return new Setting(this.containerEl)
            .setName('MCP Authorization')
            .setDesc('Authorize with MCP server using OAuth 2.1')
            .addButton(button => {
                let isWaitingForCallback = false;

                const updateButton = () => {
                    if (isWaitingForCallback) {
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
                    await oauthClient.logout();
                    try {
                        button.setButtonText('Authorizing...');
                        button.setDisabled(true);

                        try {
                            const authUrl = await oauthClient.authorize();

                            // Open authorization URL in browser
                            window.open(authUrl, '_blank');

                        } catch (error) {
                            console.error('Failed to authorize:', error);
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
            });
    }

    display(): void {
        const { containerEl } = this;

        containerEl.empty();

        // AI Model Configuration
        this.createSectionHeader('AI Model Configuration');

        this.createTextAreaSetting({
            name: 'System Prompt',
            desc: 'Instructions for the AI model on how to provide feedback',
            placeholder: 'You are a helpful writing assistant...',
            field: 'systemPrompt'
        });

        this.createTextAreaSetting({
            name: 'Feedback Prompt',
            desc: 'Instructions for the AI model on how to provide feedback',
            placeholder: 'You are a helpful writing assistant...',
            field: 'feedbackPrompt'
        });

        this.createDropdownSetting({
            name: 'Model',
            desc: 'Select which AI model to use for feedback',
            field: 'model',
            choices: {
                'anthropic/claude-opus-4-20250514': 'Claude Opus 4',
                'anthropic/claude-sonnet-4-20250514': 'Claude Sonnet 4',
                'anthropic/claude-3-7-sonnet-latest': 'Claude 3.7 Sonnet',
                'anthropic/claude-3-5-sonnet-latest': 'Claude 3.5 Sonnet',
                'anthropic/claude-3-5-haiku-latest': 'Claude 3.5 Haiku',
                'openai/gpt-3.5-turbo': 'GPT-3.5 Turbo',
                'openai/gpt-4.1': 'GPT-4.1',
                'openai/gpt-4.1-mini': 'GPT-4.1 Mini',
                'openai/gpt-4.1-nano': 'GPT-4.1 Nano',
                'openai/gpt-4.5-preview': 'GPT-4.5 Preview',
                'openai/gpt-4o': 'GPT-4o',
                'openai/gpt-4o-mini': 'GPT-4o Mini',
                'openai/o1': 'O1',
                'openai/o1-pro': 'O1 Pro',
                'openai/o3-pro': 'O3 Pro',
                'openai/o3': 'O3',
                'openai/o4-mini': 'O4 Mini',
                'openai/o3-mini': 'O3 Mini',
                'openai/o1-mini': 'O1 Mini'
            }
        });

        // API Keys
        this.createSectionHeader('API Keys');

        this.createApiKeySetting({
            name: 'Anthropic API Key',
            desc: 'Your Anthropic API key for Claude models',
            placeholder: 'sk-ant-...',
            field: 'anthropicApiKey',
            provider: 'anthropic'
        });

        this.createApiKeySetting({
            name: 'OpenAI API Key',
            desc: 'Your OpenAI API key for GPT models',
            placeholder: 'sk-...',
            field: 'openaiApiKey',
            provider: 'openai'
        });

        // General Settings
        this.createSectionHeader('General Settings');

        // MCP Settings
        this.createSectionHeader('Model Context Protocol (MCP)');

        this.createMCPServerSetting();
        this.createMCPAuthSetting();

        this.createDropdownSetting({
            name: 'MCP Mode',
            desc: 'How to handle MCP integration',
            field: 'mcpMode',
            choices: {
                'disabled': 'Disabled',
                'enabled': 'Enabled',
                'required': 'Required (fail if unavailable)'
            }
        });

        // Feedback Settings
        this.createSectionHeader('Feedback Settings');

        this.createTextSetting({
            name: 'Feedback Threshold',
            desc: 'Number of paragraphs that must change before auto-triggering feedback',
            placeholder: '3',
            field: 'feedbackThreshold',
            parser: (value) => {
                const threshold = parseInt(value);
                return (!isNaN(threshold) && threshold > 0) ? threshold : undefined;
            }
        });

        this.createTextSetting({
            name: 'Feedback Cooldown',
            desc: 'Minimum seconds between auto-triggered feedback',
            placeholder: '30',
            field: 'feedbackCooldownSeconds',
            parser: (value) => {
                const cooldown = parseInt(value);
                return (!isNaN(cooldown) && cooldown >= 0) ? cooldown : undefined;
            }
        });

        this.createTextSetting({
            name: 'Max Tokens',
            desc: 'Maximum number of tokens to include from conversation history',
            placeholder: '4000',
            field: 'maxTokens',
            parser: (value) => {
                const tokens = parseInt(value);
                return (!isNaN(tokens) && tokens > 0) ? tokens : undefined;
            }
        });

        this.createTextSetting({
            name: 'Thinking Budget Tokens',
            desc: 'Maximum number of tokens to include from conversation history',
            placeholder: '4000',
            field: 'thinkingBudgetTokens',
            parser: (value) => {
                const tokens = parseInt(value);
                return (!isNaN(tokens) && tokens > 0) ? tokens : undefined;
            }
        });

        this.createTextSetting({
            name: 'Max History Tokens',
            desc: 'Maximum number of tokens to include from conversation history',
            placeholder: '4000',
            field: 'maxHistoryTokens',
            parser: (value) => {
                const tokens = parseInt(value);
                return (!isNaN(tokens) && tokens > 0) ? tokens : undefined;
            }
        });
    }
} 