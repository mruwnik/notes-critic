import { ConversationTurn, UserInput, TurnStep } from '../../types';
import { ChatInput } from './ChatInput';

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
    timestamp: 'notes-critic-timestamp',
    rerunButton: 'notes-critic-rerun-button',
} as const;

const DIFF_CLASSES = {
    container: 'diff-container',
    hunk: 'diff-hunk',
    header: 'diff-header',
    added: 'diff-added',
    removed: 'diff-removed',
    meta: 'diff-meta',
    context: 'diff-context',
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
    private onRerunCallback?: (turn: ConversationTurn) => void;
    private onEditCallback?: (turn: ConversationTurn, newMessage: string) => void;

    constructor(parent: Element, onRerun?: (turn: ConversationTurn) => void, onEdit?: (turn: ConversationTurn, newMessage: string) => void) {
        this.container = this.createElement(parent, 'div', CSS_CLASSES.messages);
        this.onRerunCallback = onRerun;
        this.onEditCallback = onEdit;
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
        if (content.isHtml) {
            contentEl.innerHTML = content.text;
        } else {
            contentEl.textContent = content.text;
        }

        // Make chat messages editable
        if (userInput.type === 'chat_message' && this.onEditCallback) {
            contentEl.classList.add('notes-critic-editable');
            contentEl.title = 'Click to edit';
            contentEl.addEventListener('click', () => this.startEditingMessage(contentEl, turn));
        }
    }

    private startEditingMessage(contentEl: HTMLElement, turn: ConversationTurn): void {
        const currentText = turn.userInput.type === 'chat_message' ? turn.userInput.message : '';
        if (contentEl.children.length > 0) {
            return;
        }
        contentEl.innerHTML = '';
        const input = new ChatInput(contentEl, {
            initialValue: currentText,
            onSend: async (message: string) => {
                this.onEditCallback?.(turn, message);
                return Promise.resolve();
            }
        });
    }

    private formatUserInputContent(userInput: UserInput): { text: string; isHtml: boolean } {
        const formatters = {
            file_change: () => {
                const input = userInput as Extract<UserInput, { type: 'file_change' }>;
                return {
                    text: `<strong>File changes: ${input.filename}</strong><br>${this.formatDiff(input.diff)}`,
                    isHtml: true
                };
            },
            chat_message: () => {
                const input = userInput as Extract<UserInput, { type: 'chat_message' }>;
                return {
                    text: input.message,
                    isHtml: false
                };
            },
            manual_feedback: () => {
                const input = userInput as Extract<UserInput, { type: 'manual_feedback' }>;
                return {
                    text: `<strong>Manual feedback: ${input.filename}</strong><br>${this.truncateText(input.content, 200)}`,
                    isHtml: true
                };
            }
        };

        return formatters[userInput.type]?.() || { text: '', isHtml: false };
    }

    private truncateText(text: string, maxLength: number): string {
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    private formatDiff(diff: string): string {
        if (!diff) return '';

        const lineFormatters = [
            { prefix: '@@', class: DIFF_CLASSES.hunk },
            { prefix: ['+++', '---'], class: DIFF_CLASSES.header },
            { prefix: '+', class: DIFF_CLASSES.added },
            { prefix: '-', class: DIFF_CLASSES.removed },
            { prefix: '\\', class: DIFF_CLASSES.meta },
        ];

        const formatLine = (line: string): string => {
            const formatter = lineFormatters.find(f =>
                Array.isArray(f.prefix)
                    ? f.prefix.some(p => line.startsWith(p))
                    : line.startsWith(f.prefix)
            );

            const className = formatter?.class || DIFF_CLASSES.context;
            return `<span class="${className}">${this.escapeHtml(line)}</span>`;
        };

        const formattedLines = diff.split('\n').map(formatLine);
        return `<div class="${DIFF_CLASSES.container}">${formattedLines.join('<br>')}</div>`;
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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

    // ==================== THINKING SECTION ====================

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
            summary.innerHTML = `Thinking${STREAMING_INDICATORS.dots}${STREAMING_INDICATORS.dotsEnd}`;
            displayThinking += STREAMING_INDICATORS.cursor;
        } else {
            summary.textContent = 'Thinking';
        }

        thinkingContent.innerHTML = displayThinking.replace(/\n/g, '<br>');
    }

    // ==================== TOOL CALLS SECTION ====================

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
        const sections = [];

        if (toolCall.input) {
            const inputJson = this.formatJson(toolCall.input);
            sections.push(`<div><strong>Input:</strong><br><code>${inputJson}</code></div>`);
        }

        if (toolCall.result) {
            const resultJson = this.formatJson(toolCall.result);
            sections.push(`<div><strong>Result:</strong><br><code>${resultJson}</code></div>`);
        } else if (streamingState.isStreaming) {
            sections.push(`<div>${STREAMING_INDICATORS.dots}Running tool${STREAMING_INDICATORS.dotsEnd}</div>`);
        }

        toolContent.innerHTML = sections.join('');
    }

    private formatJson(obj: any): string {
        return JSON.stringify(obj, null, 2).replace(/\n/g, '<br>');
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
            displayContent += STREAMING_INDICATORS.cursor;
        }
        responseContentEl.innerHTML = displayContent;
    }

    private renderProcessingState(responseContentEl: HTMLElement, step: TurnStep, streamingState: StreamingState): void {
        if (streamingState.hasThinking && !streamingState.hasContent) {
            responseContentEl.innerHTML = '';
            return;
        }

        const message = streamingState.hasToolCalls
            ? this.getToolProcessingMessage(step)
            : 'Processing';

        responseContentEl.innerHTML = `${STREAMING_INDICATORS.dots}${message}${STREAMING_INDICATORS.dotsEnd}`;
    }

    private getToolProcessingMessage(step: TurnStep): string {
        const runningTools = Object.values(step.toolCalls).filter((tool: any) => !tool.result);
        return runningTools.length > 0 ? 'Running tools' : 'Processing tool results';
    }

    // ==================== UTILITY METHODS ====================

    private createDetailsSection(parent: HTMLElement, title: string): HTMLDetailsElement {
        const detailsSection = this.createElement(parent, 'details', CSS_CLASSES.detailsSection) as HTMLDetailsElement;
        this.createElement(detailsSection, 'summary', undefined, { textContent: title });
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