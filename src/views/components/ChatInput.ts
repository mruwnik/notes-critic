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
    }

    private async handleSend(): Promise<void> {
        const message = this.textArea.value.trim();
        if (message) {
            this.clearInput();
            await this.options.onSend(message);
        }
    }

    private clearInput(): void {
        this.textArea.value = '';
    }

    getValue(): string {
        return this.textArea.value;
    }

    focus(): void {
        this.textArea.focus();
    }

    select(): void {
        this.textArea.select();
    }

    destroy(): void {
        this.container.remove();
    }
} 