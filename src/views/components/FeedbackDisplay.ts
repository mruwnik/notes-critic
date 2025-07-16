import { ConversationTurn, UserInput, AiResponse } from '../../types';

const CSS_CLASSES = {
    messages: 'notes-critic-messages',
    userInputElement: 'notes-critic-user-input-element',
    aiResponseElement: 'notes-critic-ai-response-element',
    timestamp: 'notes-critic-timestamp',
    rerunButton: 'notes-critic-rerun-button',
    userInputContent: 'notes-critic-user-input-content',
    thinkingSection: 'notes-critic-thinking-section',
    thinkingContent: 'notes-critic-thinking-content',
    responseContent: 'notes-critic-response-content'
};

export class FeedbackDisplay {
    private container: HTMLElement;
    private onRerunCallback?: (turn: ConversationTurn) => void;

    constructor(parent: Element, onRerun?: (turn: ConversationTurn) => void) {
        this.container = parent.createEl('div', {
            cls: CSS_CLASSES.messages
        });
        this.onRerunCallback = onRerun;
    }

    createConversationTurn(turn: ConversationTurn): HTMLElement {
        // Create user input element
        const userInputEl = this.createUserInputElement(turn);

        // Create AI response element
        const aiResponseEl = this.createAiResponseElement(turn);

        this.scrollToBottom();
        return aiResponseEl; // Return AI response element for updates
    }

    private createUserInputElement(turn: ConversationTurn): HTMLElement {
        const userInputEl = this.container.createEl('div', {
            cls: CSS_CLASSES.userInputElement
        });

        // Create timestamp
        userInputEl.createEl('div', {
            text: turn.timestamp.toLocaleTimeString(),
            cls: CSS_CLASSES.timestamp
        });

        const contentEl = userInputEl.createEl('div', {
            cls: CSS_CLASSES.userInputContent
        });

        // Set content based on input type
        switch (turn.userInput.type) {
            case 'file_change':
                contentEl.innerHTML = `<strong>File changes: ${turn.userInput.filename}</strong><br>${turn.userInput.diff.replace(/\n/g, '<br>')}`;
                break;
            case 'chat_message':
                contentEl.textContent = turn.userInput.message;
                break;
            case 'manual_feedback':
                contentEl.innerHTML = `<strong>Manual feedback: ${turn.userInput.filename}</strong><br>${turn.userInput.content.substring(0, 200)}${turn.userInput.content.length > 200 ? '...' : ''}`;
                break;
        }

        return userInputEl;
    }

    private createAiResponseElement(turn: ConversationTurn): HTMLElement {
        const aiResponseEl = this.container.createEl('div', {
            cls: CSS_CLASSES.aiResponseElement
        });

        const responseContentEl = aiResponseEl.createEl('div', {
            cls: CSS_CLASSES.responseContent
        });

        // Show processing state immediately if there's no content yet
        if (!turn.aiResponse.content && !turn.aiResponse.thinking) {
            responseContentEl.innerHTML = '<span class="processing-dots">Processing</span>';
        }

        // Add rerun button if callback is provided
        if (this.onRerunCallback) {
            const rerunButton = aiResponseEl.createEl('button', {
                cls: CSS_CLASSES.rerunButton,
                attr: { 'aria-label': 'Rerun response' }
            });
            rerunButton.innerHTML = '↻';
            rerunButton.addEventListener('click', () => {
                this.onRerunCallback!(turn);
            });
        }

        return aiResponseEl;
    }

    updateConversationTurn(aiResponseEl: HTMLElement, turn: ConversationTurn, isStreaming: boolean = true): void {
        this.updateThinkingSection(aiResponseEl, turn.aiResponse, isStreaming);
        this.updateResponseContent(aiResponseEl, turn.aiResponse, isStreaming);
        this.scrollToBottom();
    }

    private updateThinkingSection(aiResponseEl: HTMLElement, aiResponse: AiResponse, isStreaming: boolean): void {
        if (!aiResponse.thinking) return;

        let thinkingSection = aiResponseEl.querySelector(`.${CSS_CLASSES.thinkingSection}`) as HTMLDetailsElement;

        if (!thinkingSection) {
            thinkingSection = aiResponseEl.createEl('details', {
                cls: CSS_CLASSES.thinkingSection
            });

            const thinkingSummary = thinkingSection.createEl('summary');
            thinkingSummary.textContent = 'Thinking...';

            thinkingSection.createEl('div', {
                cls: CSS_CLASSES.thinkingContent
            });

            aiResponseEl.insertBefore(thinkingSection, aiResponseEl.firstChild);
        }

        const thinkingContent = thinkingSection.querySelector(`.${CSS_CLASSES.thinkingContent}`) as HTMLElement;
        if (thinkingContent) {
            let displayThinking = aiResponse.thinking;
            // Only show cursor when thinking is being actively streamed and no content exists yet
            if (isStreaming && !aiResponse.thinking.includes('Error:') && !aiResponse.content) {
                displayThinking += '<span class="streaming-cursor">▋</span>';
            }
            thinkingContent.innerHTML = displayThinking.replace(/\n/g, '<br>');
        }
    }

    private updateResponseContent(aiResponseEl: HTMLElement, aiResponse: AiResponse, isStreaming: boolean): void {
        const responseContentEl = aiResponseEl.querySelector(`.${CSS_CLASSES.responseContent}`) as HTMLElement;
        if (responseContentEl) {
            if (aiResponse.error) {
                responseContentEl.innerHTML = `<span style="color: var(--text-error);">Error: ${aiResponse.error}</span>`;
            } else if (aiResponse.content) {
                let displayContent = aiResponse.content;
                if (isStreaming && !aiResponse.isComplete) {
                    displayContent += '<span class="streaming-cursor">▋</span>';
                }
                responseContentEl.innerHTML = displayContent.replace(/\n/g, '<br>');
            } else if (aiResponse.thinking) {
                responseContentEl.innerHTML = '<span class="processing-dots">Generating response</span>';
            }
        }
    }

    private scrollToBottom(): void {
        this.container.scrollTop = this.container.scrollHeight;
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
        this.container.remove();
    }
} 