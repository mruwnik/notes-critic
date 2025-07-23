import { Plugin } from 'obsidian';
import { NotesCriticSettings } from 'types';
import { ModelSelector } from './ModelSelector';

const CSS_CLASSES = {
    inputContainer: 'notes-critic-message-input-container',
    inputWrapper: 'notes-critic-message-input-wrapper',
    textArea: 'notes-critic-message-textarea',
    sendButton: 'notes-critic-message-send-button'
};

export interface ChatInputOptions {
    placeholder?: string;
    initialValue?: string;
    showContainer?: boolean;
    onSend: (message: string) => Promise<void>;
    onCancel?: () => void;
    plugin?: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> };
}

export class ChatInput {
    private container: HTMLElement;
    private textArea: HTMLTextAreaElement;
    private sendButton: HTMLButtonElement;
    private modelSelector: ModelSelector;
    private options: ChatInputOptions;

    constructor(parent: Element, options: ChatInputOptions) {
        this.options = options;
        this.container = this.createInputContainer(parent);
        this.setupEventHandlers();
    }

    private createInputContainer(parent: Element): HTMLElement {
        const inputContainer = this.options.showContainer === false ?
            parent as HTMLElement :
            parent.createEl('div', { cls: CSS_CLASSES.inputContainer });

        const inputWrapper = inputContainer.createEl('div', {
            cls: CSS_CLASSES.inputWrapper
        });

        this.textArea = inputWrapper.createEl('textarea', {
            cls: CSS_CLASSES.textArea,
            attr: {
                placeholder: this.options.placeholder || 'Type your message...',
                rows: '1'
            }
        });

        if (this.options.initialValue) {
            this.textArea.value = this.options.initialValue;
        }

        // Create model selector container only if plugin is provided
        if (this.options.plugin) {
            const modelSelectorContainer = inputWrapper.createEl('div', {
                cls: 'notes-critic-chat-model-selector'
            });
            this.modelSelector = new ModelSelector(modelSelectorContainer, this.options.plugin);
        }

        this.sendButton = inputWrapper.createEl('button', {
            cls: CSS_CLASSES.sendButton,
            attr: { title: 'Send message' }
        });
        this.sendButton.innerHTML = '➤';

        return inputContainer;
    }

    private setupEventHandlers(): void {
        // Handle Enter key (send message) and Shift+Enter (new line)
        this.textArea.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                await this.handleSend();
            } else if (e.key === 'Escape' && this.options.onCancel) {
                this.options.onCancel();
            }
        });

        // Handle send button click
        this.sendButton.addEventListener('click', async () => {
            await this.handleSend();
        });

        // Auto-resize textarea
        this.textArea.addEventListener('input', () => {
            this.autoResize();
        });
    }

    private async handleSend(): Promise<void> {
        const message = this.textArea.value.trim();
        if (message) {
            this.clearInput();
            this.setDisabled(true);
            try {
                await this.options.onSend(message);
            } catch (error) {
                // Re-enable after error
                console.error('Send error:', error);
            } finally {
                this.setDisabled(false);
            }
        }
    }

    private clearInput(): void {
        this.textArea.value = '';
    }

    private autoResize(): void {
        this.textArea.style.height = 'auto';
        this.textArea.style.height = Math.max(this.textArea.scrollHeight, 20) + 'px';
    }

    getValue(): string {
        return this.textArea.value;
    }

    setValue(value: string): void {
        this.textArea.value = value || '';
        // Trigger auto-resize
        const event = new Event('input', { bubbles: true });
        this.textArea.dispatchEvent(event);
    }

    focus(): void {
        this.textArea.focus();
    }

    select(): void {
        this.textArea.select();
    }

    setDisabled(disabled: boolean): void {
        this.textArea.disabled = disabled;
        this.sendButton.disabled = disabled;
    }

    clear(): void {
        this.textArea.value = '';
        this.textArea.style.height = 'auto';
    }

    refreshModelSelector(): void {
        if (this.modelSelector && this.options.plugin) {
            this.modelSelector.updateModel(this.options.plugin.settings.model);
        }
    }

    destroy(): void {
        this.modelSelector?.destroy();
        this.container.remove();
    }
} 