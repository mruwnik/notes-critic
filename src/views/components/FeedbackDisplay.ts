import { ConversationTurn, UserInput, TurnStep, TurnChunk } from 'types';
import { ChatInput } from 'views/components/ChatInput';
import { formatFileChangeContent, formatChatMessageContent, formatManualFeedbackContent, formatJson } from 'views/formatters';


const CSS_CLASSES = {
    messages: 'notes-critic-messages',
    stepContainer: 'notes-critic-step-container',
    detailsSection: 'notes-critic-details-section',
    userInputElement: 'notes-critic-user-input-element',
    userInputContent: 'notes-critic-user-input-content',
    aiResponseElement: 'notes-critic-ai-response-element',
    responseContent: 'notes-critic-response-content',
    thinkingContent: 'notes-critic-thinking-content',
    toolCallContent: 'notes-critic-tool-call-content',
    signatureContent: 'notes-critic-signature-content',
    blockContent: 'notes-critic-block-content',
    timestamp: 'notes-critic-timestamp',
    rerunButton: 'notes-critic-rerun-button',
} as const;


const STREAMING_INDICATORS = {
    cursor: '<span class="streaming-cursor">▋</span>',
    dots: '<span class="processing-dots">',
    dotsEnd: '</span>',
} as const;

interface StreamingState {
    isStreaming: boolean;
    isLastStep: boolean;
    hasThinking: boolean;
    hasToolCalls: boolean;
    hasContent: boolean;
}


export class FeedbackDisplay {
    private container: HTMLElement;
    private onRerunCallback?: (turn: ConversationTurn, newMessage?: string) => void;

    constructor(parent: Element, onRerun?: (turn: ConversationTurn, newMessage?: string) => void) {
        this.container = this.createElement(parent, 'div', CSS_CLASSES.messages);
        this.onRerunCallback = onRerun;
    }

    // Public API
    createConversationTurn(turn: ConversationTurn): HTMLElement {
        this.createUserInputElement(turn);
        const aiResponseEl = this.createAiResponseElement(turn);
        this.scrollToBottom();
        return aiResponseEl;
    }

    updateConversationTurn(aiResponseEl: HTMLElement, turn: ConversationTurn, isStreaming: boolean = true): void {
        this.clearResponseContent(aiResponseEl);
        this.renderSteps(aiResponseEl, turn, isStreaming);
        this.renderError(aiResponseEl, turn);
        this.scrollToBottom();
    }

    clear(): void {
        this.container.empty();
    }

    redisplayConversation(turns: ConversationTurn[]): void {
        this.clear();
        turns.forEach(turn => {
            const aiResponseEl = this.createConversationTurn(turn);
            this.updateConversationTurn(aiResponseEl, turn, false);
        });
    }

    startConversationTurn(turn: ConversationTurn): HTMLElement {
        // Immediately show the turn, even before any LLM response
        const aiResponseEl = this.createConversationTurn(turn);
        this.updateConversationTurn(aiResponseEl, turn, true);
        return aiResponseEl;
    }

    handleConversationChunk(chunk: any, turn: ConversationTurn): void {
        // For streaming updates, check if this turn still exists in the display
        if (chunk.type !== 'turn_start' && !this.isTurnCurrentlyDisplayed(turn)) {
            // Ignore chunks for turns that have been cancelled/removed
            return;
        }

        switch (chunk.type) {
            case 'turn_start':
                this.startConversationTurn(turn);
                break;

            case 'step_start':
            case 'thinking':
            case 'content':
            case 'tool_call':
            case 'tool_call_result':
                this.updateCurrentResponse(turn, true);
                break;

            case 'step_complete':
            case 'turn_complete':
            case 'error':
                this.updateCurrentResponse(turn, false);
                break;
        }
    }

    private isTurnCurrentlyDisplayed(turn: ConversationTurn): boolean {
        // Check if there's a user input element with this turn's ID
        const userInputEl = this.container.querySelector(`[data-turn-id="${turn.id}"]`);
        return userInputEl !== null;
    }

    private updateCurrentResponse(turn: ConversationTurn, isStreaming: boolean): void {
        const currentResponseEl = this.getCurrentResponseElement();
        if (currentResponseEl) {
            this.updateConversationTurn(currentResponseEl, turn, isStreaming);
        }
    }

    private getCurrentResponseElement(): HTMLElement | null {
        const responseElements = this.container.querySelectorAll('.notes-critic-ai-response-element');
        return responseElements[responseElements.length - 1] as HTMLElement || null;
    }

    destroy(): void {
        // Clean up any event listeners if needed
    }

    // ==================== USER INPUT RENDERING ====================

    private createUserInputElement(turn: ConversationTurn): HTMLElement {
        const userInputEl = this.createElement(this.container, 'div', CSS_CLASSES.userInputElement);

        // Store turn ID for later reference
        userInputEl.dataset.turnId = turn.id;

        this.createTimestamp(userInputEl, turn.timestamp);
        this.createUserInputContent(userInputEl, turn.userInput, turn);

        return userInputEl;
    }

    private createTimestamp(parent: HTMLElement, timestamp: Date): void {
        this.createElement(parent, 'div', CSS_CLASSES.timestamp, {
            textContent: timestamp.toLocaleTimeString()
        });
    }

    private createUserInputContent(parent: HTMLElement, userInput: UserInput, turn: ConversationTurn): void {
        const contentEl = this.createElement(parent, 'div', CSS_CLASSES.userInputContent);

        const content = this.formatUserInputContent(userInput);
        contentEl.innerHTML = content;

        // Make chat messages editable
        if (userInput.type === 'chat_message' && this.onRerunCallback) {
            contentEl.classList.add('notes-critic-editable');
            contentEl.title = 'Click to edit';
            contentEl.addEventListener('click', () => this.startEditingMessage(contentEl, turn));
        }
    }

    private startEditingMessage(contentEl: HTMLElement, turn: ConversationTurn): void {
        const currentText = turn.userInput.type === 'chat_message' ? turn.userInput.message : '';
        if (Array.from(contentEl.children).filter(el => el.tagName !== 'BR').length > 0) {
            return;
        }

        // Store original content to restore on cancel
        const originalContent = contentEl.innerHTML;

        contentEl.innerHTML = '';
        const input = new ChatInput(contentEl, {
            initialValue: currentText,
            showContainer: false,
            onSend: async (message: string) => {
                this.onRerunCallback?.(turn, message);
                return Promise.resolve();
            },
            onCancel: () => {
                // Clean up the input and restore original content
                contentEl.innerHTML = originalContent;
            }
        });
    }

    private formatUserInputContent(userInput: UserInput): string {
        const formatters = {
            file_change: formatFileChangeContent,
            chat_message: formatChatMessageContent,
            manual_feedback: formatManualFeedbackContent,
        };

        return formatters[userInput.type](userInput) || '';
    }

    // ==================== AI RESPONSE RENDERING ====================

    private createAiResponseElement(turn: ConversationTurn): HTMLElement {
        const aiResponseEl = this.createElement(this.container, 'div', CSS_CLASSES.aiResponseElement);

        this.createInitialProcessingState(aiResponseEl, turn);
        this.createRerunButton(aiResponseEl, turn);

        return aiResponseEl;
    }

    private createInitialProcessingState(aiResponseEl: HTMLElement, turn: ConversationTurn): void {
        const firstStep = turn.steps[0];
        const hasNoContent = !turn.steps.length || (!firstStep?.content && !firstStep?.thinking);

        if (hasNoContent) {
            this.createProcessingIndicator(aiResponseEl, 'Processing');
        }
    }

    private createRerunButton(aiResponseEl: HTMLElement, turn: ConversationTurn): void {
        if (!this.onRerunCallback) return;

        const rerunButton = this.createElement(aiResponseEl, 'button', CSS_CLASSES.rerunButton, {
            innerHTML: '↻',
            attributes: { 'aria-label': 'Rerun response' }
        });

        rerunButton.addEventListener('click', () => this.onRerunCallback!(turn));
    }

    private clearResponseContent(aiResponseEl: HTMLElement): void {
        const rerunButton = aiResponseEl.querySelector(`.${CSS_CLASSES.rerunButton}`);
        aiResponseEl.innerHTML = '';
        if (rerunButton) {
            aiResponseEl.appendChild(rerunButton);
        }
    }

    private renderSteps(aiResponseEl: HTMLElement, turn: ConversationTurn, isStreaming: boolean): void {
        turn.steps.forEach((step, index) => {
            const streamingState = this.getStreamingState(step, index, turn.steps.length, isStreaming);
            const stepEl = this.createStepElement(step, streamingState);
            this.insertBeforeRerunButton(aiResponseEl, stepEl);
        });
    }

    private renderError(aiResponseEl: HTMLElement, turn: ConversationTurn): void {
        if (!turn.error) return;

        const errorEl = this.createElement(aiResponseEl, 'div', CSS_CLASSES.responseContent, {
            innerHTML: `<span style="color: var(--text-error);">Error: ${turn.error}</span>`
        });
    }

    // ==================== STEP RENDERING ====================

    private createStepElement(step: TurnStep, streamingState: StreamingState): HTMLElement {
        const stepEl = document.createElement('div');
        stepEl.classList.add(CSS_CLASSES.stepContainer);

        // Render chunks if available
        if (step.chunks && step.chunks.length > 0) {
            this.renderChunks(stepEl, step, streamingState);
        } else if (streamingState.isStreaming) {
            // Show processing indicator when streaming but no chunks yet
            this.createProcessingIndicator(stepEl, 'Processing');
        }

        return stepEl;
    }

    private renderChunks(stepEl: HTMLElement, step: TurnStep, streamingState: StreamingState): void {
        step.chunks!.forEach((chunk, index) => {
            const isLastChunk = index === step.chunks!.length - 1;
            const shouldShowCursor = streamingState.isStreaming && isLastChunk;

            this.renderChunk(stepEl, chunk, shouldShowCursor);
        });
    }

    private renderChunk(container: HTMLElement, chunk: TurnChunk, shouldShowCursor: boolean): void {
        switch (chunk.type) {
            case 'thinking':
                this.renderThinkingChunk(container, chunk, shouldShowCursor);
                break;
            case 'content':
                this.renderContentChunk(container, chunk, shouldShowCursor);
                break;
            case 'tool_call':
            case 'tool_call_result':
                this.renderToolCallChunk(container, chunk);
                break;
            case 'signature':
                this.renderSignatureChunk(container, chunk, shouldShowCursor);
                break;
            case 'block':
                this.renderBlockChunk(container, chunk, shouldShowCursor);
                break;
            case 'done':
                break;
            default:
                console.warn('Unknown chunk type:', chunk.type);
        }
    }

    private renderThinkingChunk(container: HTMLElement, chunk: TurnChunk, shouldShowCursor: boolean): void {
        // Look for existing thinking section to append to, or create new one
        const thinkingSection = this.createDetailsSection(container, 'Thinking');
        const thinkingContent = this.createElement(thinkingSection, 'div', CSS_CLASSES.thinkingContent);

        let displayContent = chunk.content || '';
        if (shouldShowCursor) {
            displayContent += STREAMING_INDICATORS.cursor;
        }

        thinkingContent.innerHTML = displayContent.replace(/\n/g, '<br/>');
    }

    private renderContentChunk(container: HTMLElement, chunk: TurnChunk, shouldShowCursor: boolean): void {
        // Look for existing content element to append to, or create new one
        const contentEl = this.createElement(container, 'div', CSS_CLASSES.responseContent);

        let displayContent = chunk.content || '';
        if (shouldShowCursor) {
            displayContent += STREAMING_INDICATORS.cursor;
        }

        contentEl.innerHTML = displayContent.replace(/\n/g, '<br>');
    }

    private renderToolCallChunk(container: HTMLElement, chunk: TurnChunk): void {
        if (!chunk.toolCall) return;

        const toolCall = chunk.toolCall;
        const calling = chunk.toolCall.result ? toolCall.name : ` calling ${toolCall.name} ${STREAMING_INDICATORS.dots}${STREAMING_INDICATORS.dotsEnd}`;
        const toolSection = this.createDetailsSection(container, calling);
        const toolContent = this.createElement(toolSection, 'div', CSS_CLASSES.toolCallContent);

        const inputJson = formatJson(toolCall.input);
        toolContent.innerHTML = `<div><strong>Input:</strong><br><code>${inputJson}</code></div>`;
        if (chunk.toolCall.result) {
            const resultJson = formatJson(chunk.toolCall.result);
            toolContent.innerHTML += `<div><strong>Result:</strong><br><code>${resultJson}</code></div>`;
        }
    }

    private renderSignatureChunk(container: HTMLElement, chunk: any, shouldShowCursor: boolean): void {
        const signatureEl = this.createElement(container, 'div', CSS_CLASSES.signatureContent);
        signatureEl.style.fontStyle = 'italic';
        signatureEl.style.color = 'var(--text-muted)';

        let displayContent = `Signature: ${chunk.content || ''}`;
        if (shouldShowCursor) {
            displayContent += STREAMING_INDICATORS.cursor;
        }

        signatureEl.innerHTML = displayContent;
    }

    private renderBlockChunk(container: HTMLElement, chunk: any, shouldShowCursor: boolean): void {
        const blockEl = this.createElement(container, 'div', CSS_CLASSES.blockContent);
        blockEl.style.border = '1px solid var(--background-modifier-border)';
        blockEl.style.padding = '8px';
        blockEl.style.marginBottom = '8px';
        blockEl.style.borderRadius = '4px';

        let displayContent = chunk.content || '';
        if (shouldShowCursor) {
            displayContent += STREAMING_INDICATORS.cursor;
        }

        blockEl.innerHTML = displayContent.replace(/\n/g, '<br>');
    }

    private getStreamingState(step: TurnStep, index: number, totalSteps: number, isStreaming: boolean): StreamingState {
        return {
            isStreaming: isStreaming && index === totalSteps - 1,
            isLastStep: index === totalSteps - 1,
            hasThinking: !!step.thinking,
            hasToolCalls: Object.keys(step.toolCalls).length > 0,
            hasContent: !!step.content
        };
    }

    // ==================== UTILITY METHODS ====================

    private createDetailsSection(parent: HTMLElement, title: string): HTMLDetailsElement {
        const detailsSection = this.createElement(parent, 'details', CSS_CLASSES.detailsSection) as HTMLDetailsElement;
        this.createElement(detailsSection, 'summary', undefined, { innerHTML: title });
        return detailsSection;
    }

    private createProcessingIndicator(parent: HTMLElement, message: string): HTMLElement {
        return this.createElement(parent, 'div', CSS_CLASSES.responseContent, {
            innerHTML: `${STREAMING_INDICATORS.dots}${message}${STREAMING_INDICATORS.dotsEnd}`
        });
    }

    private createElement(
        parent: HTMLElement | Element,
        tagName: string,
        className?: string,
        options?: {
            textContent?: string;
            innerHTML?: string;
            attributes?: Record<string, string>;
        }
    ): HTMLElement {
        const element = document.createElement(tagName);

        if (className) element.classList.add(className);
        if (options?.textContent) element.textContent = options.textContent;
        if (options?.innerHTML) element.innerHTML = options.innerHTML;
        if (options?.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }

        parent.appendChild(element);
        return element;
    }

    private insertBeforeRerunButton(aiResponseEl: HTMLElement, stepEl: HTMLElement): void {
        const rerunButton = aiResponseEl.querySelector(`.${CSS_CLASSES.rerunButton}`);
        if (rerunButton) {
            aiResponseEl.insertBefore(stepEl, rerunButton);
        } else {
            aiResponseEl.appendChild(stepEl);
        }
    }

    private scrollToBottom(): void {
        this.container.scrollTop = this.container.scrollHeight;
    }
} 