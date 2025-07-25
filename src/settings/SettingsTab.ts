import { App, Plugin, PluginSettingTab, Setting } from 'obsidian';
import { NotesCriticSettings } from 'types';
import { LLMProvider } from 'llm/llmProvider';
import { RulesSettingsComponent } from 'settings/components/RulesSettingsComponent';
import { MCPSettingsComponent } from 'settings/components/MCPSettingsComponent';
import { ToolsSettingsComponent } from 'settings/components/ToolsSettingsComponent';
import { ModelSelector } from 'views/components/ModelSelector';

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
                        button.setButtonText('Testing...');
                        button.setDisabled(true);

                        try {
                            const isValid = await LLMProvider.testApiKey(displayValue, options.provider, this.app);

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
                            console.error('Failed to test API key:', error);
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

    async display(): Promise<void> {
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

        // Use the shared ModelSelector component
        new ModelSelector(this.containerEl, this.plugin, 'Model', 'AI model for feedback', 'model');
        new ModelSelector(this.containerEl, this.plugin, 'Summarizer Model', 'AI model for summarizing conversations', 'summarizer');

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
        await this.createMCPSettings();

        // Tools Overview
        this.createSectionHeader('Available Tools');
        await this.createToolsOverview();

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

        this.createSectionHeader('Logging');
        this.createTextSetting({
            name: 'Log Path',
            desc: 'Path to the directory where logs will be saved',
            placeholder: '.notes-critic/conversations',
            field: 'logPath'
        });

        // Rules Management Section
        this.createSectionHeader('Rules Management');
        await this.createRulesOverview();
    }

    private async createMCPSettings(): Promise<void> {
        const container = this.containerEl.createDiv();
        const mcpComponent = new MCPSettingsComponent(this.app, container, this.plugin);
        await mcpComponent.render();
    }

    private async createToolsOverview(): Promise<void> {
        const container = this.containerEl.createDiv();
        const toolsComponent = new ToolsSettingsComponent(this.app, container, this.plugin);
        await toolsComponent.render();
    }

    private async createRulesOverview(): Promise<void> {
        const container = this.containerEl.createDiv();
        const rulesComponent = new RulesSettingsComponent(this.app, container);
        await rulesComponent.render();
    }
} 