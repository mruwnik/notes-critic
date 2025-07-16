const CSS_CLASSES = {
    inputContainer: 'notes-critic-input-container',
    inputWrapper: 'notes-critic-input-wrapper',
    textArea: 'notes-critic-textarea',
    sendButton: 'notes-critic-send-button'
};

export class ChatInput {
    private container: HTMLElement;
    private textArea: HTMLTextAreaElement;
    private sendButton: HTMLButtonElement;
    private onSendMessage: (message: string) => Promise<void>;

    constructor(parent: Element, onSendMessage: (message: string) => Promise<void>) {
        this.onSendMessage = onSendMessage;
        this.container = this.createInputContainer(parent);
        this.setupEventHandlers();
    }

    private createInputContainer(parent: Element): HTMLElement {
        const inputContainer = parent.createEl('div', {
            cls: CSS_CLASSES.inputContainer
        });

        const inputWrapper = inputContainer.createEl('div', {
            cls: CSS_CLASSES.inputWrapper
        });

        this.textArea = inputWrapper.createEl('textarea', {
            cls: CSS_CLASSES.textArea,
            attr: { placeholder: 'Type your message...', rows: '1' }
        });

        this.sendButton = inputWrapper.createEl('button', {
            text: 'Send',
            cls: CSS_CLASSES.sendButton
        });

        return inputContainer;
    }

    private setupEventHandlers(): void {
        // Auto-resize textarea
        this.textArea.addEventListener('input', () => {
            this.textArea.style.height = 'auto';
            this.textArea.style.height = this.textArea.scrollHeight + 'px';
        });

        // Handle Enter key (send message) and Shift+Enter (new line)
        this.textArea.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                await this.handleSend();
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
            await this.onSendMessage(message);
        }
    }

    private clearInput(): void {
        this.textArea.value = '';
        this.textArea.style.height = 'auto';
    }

    destroy(): void {
        this.container.remove();
    }
} 