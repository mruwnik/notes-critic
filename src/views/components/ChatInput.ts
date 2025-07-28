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
}

export class ChatInput {
    private container: HTMLElement;
    private textArea: HTMLTextAreaElement;
    private sendButton: HTMLButtonElement;
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
        const message = this.getValue();
        if (message) {
            this.clearInput();

            try {
                await this.options.onSend(message);
            } catch (error) {
                console.error('Send error:', error);
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

    getValue(): string | null {
        return this.textArea.value.trim() || null;
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

    destroy(): void {
        this.container.remove();
    }
} 