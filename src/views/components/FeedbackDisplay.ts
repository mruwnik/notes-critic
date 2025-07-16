import { FeedbackEntry } from '../../types';

const CSS_CLASSES = {
    messages: 'notes-critic-messages',
    feedbackEntry: 'notes-critic-feedback-entry',
    timestamp: 'notes-critic-timestamp',
    thinkingSection: 'notes-critic-thinking-section',
    thinkingContent: 'notes-critic-thinking-content',
    contentSection: 'notes-critic-content-section',
    userMessage: 'notes-critic-user-message'
};

export class FeedbackDisplay {
    private container: HTMLElement;

    constructor(parent: Element) {
        this.container = parent.createEl('div', {
            cls: CSS_CLASSES.messages
        });
    }

    createFeedbackElement(entry: FeedbackEntry): HTMLElement {
        const feedbackEl = this.container.createEl('div', {
            cls: CSS_CLASSES.feedbackEntry
        });

        feedbackEl.createEl('div', {
            text: entry.timestamp.toLocaleTimeString(),
            cls: CSS_CLASSES.timestamp
        });

        const contentSection = feedbackEl.createEl('div', {
            cls: CSS_CLASSES.contentSection
        });

        // Show processing state immediately if there's no feedback content yet
        if (!entry.feedback && !entry.thinking) {
            contentSection.innerHTML = '<span class="processing-dots">Processing</span>';
        }

        this.scrollToBottom();
        return feedbackEl;
    }

    createUserMessage(message: string): HTMLElement {
        const userMessageEl = this.container.createEl('div', {
            cls: CSS_CLASSES.userMessage
        });

        userMessageEl.createEl('div', {
            text: new Date().toLocaleTimeString(),
            cls: CSS_CLASSES.timestamp
        });

        userMessageEl.createEl('div', {
            text: message,
            cls: CSS_CLASSES.contentSection
        });

        this.scrollToBottom();
        return userMessageEl;
    }

    updateFeedbackDisplay(feedbackEl: HTMLElement, entry: FeedbackEntry, isStreaming: boolean = true): void {
        this.updateThinkingSection(feedbackEl, entry, isStreaming);
        this.updateContentSection(feedbackEl, entry, isStreaming);
        this.scrollToBottom();
    }

    private updateThinkingSection(feedbackEl: HTMLElement, entry: FeedbackEntry, isStreaming: boolean): void {
        if (!entry.thinking) return;

        let thinkingSection = feedbackEl.querySelector(`.${CSS_CLASSES.thinkingSection}`) as HTMLDetailsElement;

        if (!thinkingSection) {
            const contentSection = feedbackEl.querySelector(`.${CSS_CLASSES.contentSection}`) as HTMLElement;
            thinkingSection = feedbackEl.createEl('details', {
                cls: CSS_CLASSES.thinkingSection
            });

            const thinkingSummary = thinkingSection.createEl('summary');
            thinkingSummary.textContent = 'Thinking...';

            thinkingSection.createEl('div', {
                cls: CSS_CLASSES.thinkingContent
            });

            feedbackEl.insertBefore(thinkingSection, contentSection);
        }

        const thinkingContent = thinkingSection.querySelector(`.${CSS_CLASSES.thinkingContent}`) as HTMLElement;
        if (thinkingContent) {
            let displayThinking = entry.thinking;
            // Only show cursor when thinking is being actively streamed AND no feedback content exists yet
            if (isStreaming && !entry.thinking.includes('Error:') && !entry.feedback) {
                displayThinking += '<span class="streaming-cursor">▋</span>';
            }
            thinkingContent.innerHTML = displayThinking.replace(/\n/g, '<br>');
        }
    }

    private updateContentSection(feedbackEl: HTMLElement, entry: FeedbackEntry, isStreaming: boolean): void {
        const contentSection = feedbackEl.querySelector(`.${CSS_CLASSES.contentSection}`) as HTMLElement;
        if (contentSection) {
            if (entry.feedback) {
                // Show actual feedback content with cursor when streaming
                let displayContent = entry.feedback;
                if (isStreaming && !entry.feedback.includes('Error:')) {
                    displayContent += '<span class="streaming-cursor">▋</span>';
                }
                contentSection.innerHTML = displayContent.replace(/\n/g, '<br>');
            } else if (entry.thinking) {
                // Show "Generating response..." when thinking is happening but no reply yet
                contentSection.innerHTML = '<span class="processing-dots">Generating response</span>';
            }
        }
    }

    private scrollToBottom(): void {
        this.container.scrollTop = this.container.scrollHeight;
    }

    clear(): void {
        this.container.empty();
    }

    redisplayFeedback(feedbackHistory: FeedbackEntry[]): void {
        this.clear();
        feedbackHistory.forEach(entry => {
            const feedbackEl = this.createFeedbackElement(entry);
            this.updateFeedbackDisplay(feedbackEl, entry, false);
        });
    }

    destroy(): void {
        this.container.remove();
    }
} 