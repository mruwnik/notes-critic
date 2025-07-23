import { Plugin, Setting } from 'obsidian';
import { NotesCriticSettings } from 'types';

const CSS_CLASSES = {
    container: 'notes-critic-model-selector',
    label: 'notes-critic-model-label'
};

// Model choices that match the settings tab
const MODEL_CHOICES = {
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
};

export class ModelSelector {
    private container: HTMLElement;
    private plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> };
    private setting: Setting;
    private title: string;
    private desc: string;
    private modelKind: 'model' | 'summarizer';

    constructor(
        parent: Element,
        plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> },
        title: string = "Model",
        desc: string = "AI model for feedback",
        modelKind: 'model' | 'summarizer' = 'model'
    ) {
        this.plugin = plugin;
        this.title = title;
        this.desc = desc;
        this.modelKind = modelKind;
        this.container = this.createContainer(parent);
    }

    private getModelSetting(): keyof NotesCriticSettings {
        switch (this.modelKind) {
            case 'model':
                return 'model';
            case 'summarizer':
                return 'summarizerModel';
        }
    }

    private setModelSetting(value: string): void {
        if (this.modelKind === 'model') {
            this.plugin.settings.model = value;
        } else {
            this.plugin.settings.summarizerModel = value;
        }
    }

    private createContainer(parent: Element): HTMLElement {
        const container = parent.createEl('div', {
            cls: CSS_CLASSES.container
        });

        // Create the setting using Obsidian's Setting class
        this.setting = new Setting(container)
            .setName(this.title)
            .setDesc(this.desc)
            .addDropdown(dropdown => dropdown
                .addOptions(MODEL_CHOICES)
                .setValue(this.plugin.settings[this.getModelSetting()] as string)
                .onChange(async (value) => {
                    this.setModelSetting(value);
                    await this.plugin.saveSettings();
                }));

        return container;
    }

    updateModel(newModel: string): void {
        if (this.setting && this.setting.components[0]) {
            const dropdown = this.setting.components[0] as any;
            if (dropdown.setValue) {
                dropdown.setValue(newModel);
            }
        }
    }

    getCurrentModel(): string {
        return this.plugin.settings[this.getModelSetting()] as string;
    }

    destroy(): void {
        this.container.remove();
    }
} 