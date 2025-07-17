import { ConversationTurn, UserInput, TurnStep } from '../../types';

const CSS_CLASSES = {
    // Container classes
    messages: 'notes-critic-messages',
    stepContainer: 'notes-critic-step-container',
    detailsSection: 'notes-critic-details-section',

    // User input classes
    userInputElement: 'notes-critic-user-input-element',
    userInputContent: 'notes-critic-user-input-content',

    // AI response classes
    aiResponseElement: 'notes-critic-ai-response-element',
    responseContent: 'notes-critic-response-content',

    // Content type classes
    thinkingContent: 'notes-critic-thinking-content',
    toolCallContent: 'notes-critic-tool-call-content',

    // UI elements
    timestamp: 'notes-critic-timestamp',
    rerunButton: 'notes-critic-rerun-button',
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
    private onRerunCallback?: (turn: ConversationTurn) => void;

    constructor(parent: Element, onRerun?: (turn: ConversationTurn) => void) {
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

    destroy(): void {
        // Clean up any event listeners if needed
    }

    // User input creation
    private createUserInputElement(turn: ConversationTurn): HTMLElement {
        const userInputEl = this.createElement(this.container, 'div', CSS_CLASSES.userInputElement);

        this.createTimestamp(userInputEl, turn.timestamp);
        this.createUserInputContent(userInputEl, turn.userInput);

        return userInputEl;
    }

    private createTimestamp(parent: HTMLElement, timestamp: Date): void {
        this.createElement(parent, 'div', CSS_CLASSES.timestamp, {
            textContent: timestamp.toLocaleTimeString()
        });
    }

    private createUserInputContent(parent: HTMLElement, userInput: UserInput): void {
        const contentEl = this.createElement(parent, 'div', CSS_CLASSES.userInputContent);

        const content = this.formatUserInputContent(userInput);
        if (content.isHtml) {
            contentEl.innerHTML = content.text;
        } else {
            contentEl.textContent = content.text;
        }
    }

    private formatUserInputContent(userInput: UserInput): { text: string; isHtml: boolean } {
        switch (userInput.type) {
            case 'file_change':
                return {
                    text: `<strong>File changes: ${userInput.filename}</strong><br>${this.formatDiff(userInput.diff)}`,
                    isHtml: true
                };
            case 'chat_message':
                return {
                    text: userInput.message,
                    isHtml: false
                };
            case 'manual_feedback':
                const truncated = userInput.content.length > 200
                    ? userInput.content.substring(0, 200) + '...'
                    : userInput.content;
                return {
                    text: `<strong>Manual feedback: ${userInput.filename}</strong><br>${truncated}`,
                    isHtml: true
                };
            default:
                return { text: '', isHtml: false };
        }
    }

    private formatDiff(diff: string): string {
        if (!diff) return '';

        const lines = diff.split('\n');
        const formattedLines = lines.map(line => {
            if (line.startsWith('@@')) {
                // Hunk header
                return `<span class="diff-hunk">${this.escapeHtml(line)}</span>`;
            } else if (line.startsWith('+++') || line.startsWith('---')) {
                // File headers
                return `<span class="diff-header">${this.escapeHtml(line)}</span>`;
            } else if (line.startsWith('+')) {
                // Added line
                return `<span class="diff-added">${this.escapeHtml(line)}</span>`;
            } else if (line.startsWith('-')) {
                // Removed line
                return `<span class="diff-removed">${this.escapeHtml(line)}</span>`;
            } else if (line.startsWith('\\')) {
                // No newline at end of file
                return `<span class="diff-meta">${this.escapeHtml(line)}</span>`;
            } else {
                // Context line
                return `<span class="diff-context">${this.escapeHtml(line)}</span>`;
            }
        });

        return `<div class="diff-container">${formattedLines.join('<br>')}</div>`;
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    // AI response creation and updates
    private createAiResponseElement(turn: ConversationTurn): HTMLElement {
        const aiResponseEl = this.createElement(this.container, 'div', CSS_CLASSES.aiResponseElement);

        this.createInitialProcessingState(aiResponseEl, turn);
        this.createRerunButton(aiResponseEl, turn);

        return aiResponseEl;
    }

    private createInitialProcessingState(aiResponseEl: HTMLElement, turn: ConversationTurn): void {
        const hasNoContent = !turn.steps.length ||
            (!turn.steps[0].content && !turn.steps[0].thinking);

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

    // Step creation and management
    private createStepElement(step: TurnStep, streamingState: StreamingState): HTMLElement {
        const stepEl = document.createElement('div');
        stepEl.classList.add(CSS_CLASSES.stepContainer);

        if (step.thinking) {
            this.createThinkingSection(stepEl, step, streamingState);
        }

        if (Object.keys(step.toolCalls).length > 0) {
            this.createToolCallsSections(stepEl, step, streamingState);
        }

        this.createResponseContent(stepEl, step, streamingState);

        return stepEl;
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

    // Thinking section
    private createThinkingSection(container: HTMLElement, step: TurnStep, streamingState: StreamingState): void {
        const thinkingSection = this.createDetailsSection(container, 'Thinking');
        const thinkingContent = this.createElement(thinkingSection, 'div', CSS_CLASSES.thinkingContent);

        this.updateThinkingContent(thinkingSection, thinkingContent, step, streamingState);
    }

    private updateThinkingContent(
        thinkingSection: HTMLDetailsElement,
        thinkingContent: HTMLElement,
        step: TurnStep,
        streamingState: StreamingState
    ): void {
        const summary = thinkingSection.querySelector('summary')!;
        let displayThinking = step.thinking || '';

        if (streamingState.isStreaming && !streamingState.hasContent && !streamingState.hasToolCalls) {
            summary.textContent = 'Thinking';
            summary.innerHTML += '<span class="processing-dots"></span>';
            displayThinking += '<span class="streaming-cursor">▋</span>';
        } else {
            summary.textContent = 'Thinking';
        }

        thinkingContent.innerHTML = displayThinking.replace(/\n/g, '<br>');
    }

    // Tool calls section
    private createToolCallsSections(container: HTMLElement, step: TurnStep, streamingState: StreamingState): void {
        this.removeExistingToolSections(container);

        Object.values(step.toolCalls).forEach(toolCall => {
            this.createToolCallSection(container, toolCall, streamingState);
        });
    }

    private createToolCallSection(container: HTMLElement, toolCall: any, streamingState: StreamingState): void {
        const toolSection = this.createDetailsSection(container, toolCall.name);
        const toolContent = this.createElement(toolSection, 'div', CSS_CLASSES.toolCallContent);

        this.populateToolContent(toolContent, toolCall, streamingState);
    }

    private populateToolContent(toolContent: HTMLElement, toolCall: any, streamingState: StreamingState): void {
        if (toolCall.input) {
            const inputJson = JSON.stringify(toolCall.input, null, 2).replace(/\n/g, '<br>');
            toolContent.innerHTML += `<div><strong>Input:</strong><br><code>${inputJson}</code></div>`;
        }

        if (toolCall.result) {
            const resultJson = JSON.stringify(toolCall.result, null, 2).replace(/\n/g, '<br>');
            toolContent.innerHTML += `<div><strong>Result:</strong><br><code>${resultJson}</code></div>`;
        } else if (streamingState.isStreaming) {
            toolContent.innerHTML += `<div><span class="processing-dots">Running tool</span></div>`;
        }
    }

    private removeExistingToolSections(container: HTMLElement): void {
        const existingToolSections = container.querySelectorAll(`.${CSS_CLASSES.detailsSection}`);
        existingToolSections.forEach(section => {
            if (section.querySelector(`.${CSS_CLASSES.toolCallContent}`)) {
                section.remove();
            }
        });
    }

    // Response content
    private createResponseContent(container: HTMLElement, step: TurnStep, streamingState: StreamingState): void {
        const responseContentEl = this.createElement(container, 'div', CSS_CLASSES.responseContent);
        this.updateResponseContent(responseContentEl, step, streamingState);
    }

    private updateResponseContent(responseContentEl: HTMLElement, step: TurnStep, streamingState: StreamingState): void {
        if (step.content) {
            this.renderStepContent(responseContentEl, step.content, streamingState);
        } else if (streamingState.isStreaming) {
            this.renderProcessingState(responseContentEl, step, streamingState);
        } else {
            responseContentEl.innerHTML = '';
        }
    }

    private renderStepContent(responseContentEl: HTMLElement, content: string, streamingState: StreamingState): void {
        let displayContent = content.replace(/\n/g, '<br>');
        if (streamingState.isStreaming) {
            displayContent += '<span class="streaming-cursor">▋</span>';
        }
        responseContentEl.innerHTML = displayContent;
    }

    private renderProcessingState(responseContentEl: HTMLElement, step: TurnStep, streamingState: StreamingState): void {
        if (streamingState.hasThinking && !streamingState.hasContent) {
            responseContentEl.innerHTML = '';
        } else if (streamingState.hasToolCalls) {
            const runningTools = Object.values(step.toolCalls).filter((tool: any) => !tool.result);
            const message = runningTools.length > 0 ? 'Running tools' : 'Processing tool results';
            responseContentEl.innerHTML = `<span class="processing-dots">${message}</span>`;
        } else {
            responseContentEl.innerHTML = '<span class="processing-dots">Processing</span>';
        }
    }

    // Utility methods
    private createDetailsSection(parent: HTMLElement, title: string): HTMLDetailsElement {
        const detailsSection = this.createElement(parent, 'details', CSS_CLASSES.detailsSection) as HTMLDetailsElement;
        this.createElement(detailsSection, 'summary', undefined, { textContent: title });
        return detailsSection;
    }

    private createProcessingIndicator(parent: HTMLElement, message: string): HTMLElement {
        return this.createElement(parent, 'div', CSS_CLASSES.responseContent, {
            innerHTML: `<span class="processing-dots">${message}</span>`
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

        if (className) {
            element.classList.add(className);
        }

        if (options?.textContent) {
            element.textContent = options.textContent;
        }

        if (options?.innerHTML) {
            element.innerHTML = options.innerHTML;
        }

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