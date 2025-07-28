import { NotesCriticSettings } from 'types';

const CSS_CLASSES = {
    setup: 'notes-critic-api-key-setup',
    title: 'notes-critic-setup-title',
    description: 'notes-critic-setup-description',
    steps: 'notes-critic-setup-steps',
    refreshButton: 'notes-critic-refresh-button'
};

interface ApiKeyInfo {
    provider: string;
    keyField: keyof NotesCriticSettings;
    key: string;
}

export class ApiKeySetup {
    private container: HTMLElement;
    private settings: NotesCriticSettings;
    private onRefresh: () => void;

    constructor(
        parent: Element,
        settings: NotesCriticSettings,
        onRefresh: () => void
    ) {
        this.settings = settings;
        this.onRefresh = onRefresh;
        this.container = parent.createEl('div', {
            cls: CSS_CLASSES.setup
        });

        this.buildUI();
    }

    public static isApiKeyConfigured(settings: NotesCriticSettings): boolean {
        const modelString = settings.model;
        if (!modelString) return false;

        const [provider] = modelString.split('/');

        switch (provider) {
            case 'anthropic':
                return !!(settings.anthropicApiKey && settings.anthropicApiKey.trim() !== '');
            case 'openai':
                return !!(settings.openaiApiKey && settings.openaiApiKey.trim() !== '');
            default:
                return false;
        }
    }

    private getRequiredApiKey(): ApiKeyInfo | null {
        const modelString = this.settings.model;
        if (!modelString) return null;

        const [provider] = modelString.split('/');

        switch (provider) {
            case 'anthropic':
                return {
                    provider: 'Anthropic',
                    keyField: 'anthropicApiKey',
                    key: this.settings.anthropicApiKey
                };
            case 'openai':
                return {
                    provider: 'OpenAI',
                    keyField: 'openaiApiKey',
                    key: this.settings.openaiApiKey
                };
            default:
                return null;
        }
    }

    private buildUI() {
        const apiKeyInfo = this.getRequiredApiKey();

        this.container.createEl('h2', {
            text: 'API Key Required',
            cls: CSS_CLASSES.title
        });

        const description = this.container.createEl('div', {
            cls: CSS_CLASSES.description
        });

        if (apiKeyInfo) {
            description.createEl('p', {
                text: `Notes Critic requires a ${apiKeyInfo.provider} API key to function. Your current model (${this.settings.model}) uses the ${apiKeyInfo.provider} provider.`
            });
        } else {
            description.createEl('p', {
                text: 'Notes Critic requires an API key to function, but the current model configuration is not recognized.'
            });
        }

        this.buildSetupSteps(apiKeyInfo);
        this.buildRefreshButton();
    }

    private buildSetupSteps(apiKeyInfo: ApiKeyInfo | null) {
        const stepsContainer = this.container.createEl('div', {
            cls: CSS_CLASSES.steps
        });

        stepsContainer.createEl('h3', { text: 'Setup Steps:' });

        const stepsList = stepsContainer.createEl('ol');

        stepsList.createEl('li', {
            text: 'Open Settings'
        });

        stepsList.createEl('li', {
            text: 'Navigate to Community Plugins → Notes Critic'
        });

        if (apiKeyInfo) {
            const step3 = stepsList.createEl('li');
            step3.createSpan({ text: 'Add your ' });
            step3.createEl('strong', { text: `${apiKeyInfo.provider} API Key` });
            step3.createSpan({ text: ' in the API Keys section' });

            if (apiKeyInfo.provider === 'Anthropic') {
                stepsList.createEl('li', {
                    text: 'Get your API key from: https://console.anthropic.com/'
                });
            } else if (apiKeyInfo.provider === 'OpenAI') {
                stepsList.createEl('li', {
                    text: 'Get your API key from: https://platform.openai.com/account/api-keys'
                });
            }
        } else {
            stepsList.createEl('li', {
                text: 'Configure your API key for the selected model provider'
            });
        }

        stepsList.createEl('li', {
            text: 'Close and reopen this view to start using Notes Critic'
        });
    }

    private buildRefreshButton() {
        const refreshButton = this.container.createEl('button', {
            text: 'Refresh View',
            cls: CSS_CLASSES.refreshButton
        });

        refreshButton.addEventListener('click', () => {
            this.onRefresh();
        });
    }

    public destroy() {
        this.container.remove();
    }
} 