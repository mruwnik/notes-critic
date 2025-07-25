import { setIcon } from 'obsidian';
import { History } from 'conversation/HistoryManager';

const CSS_CLASSES = {
    controls: 'notes-critic-controls',
    button: 'notes-critic-button',
    iconButton: 'notes-critic-icon-button',
    historySelect: 'notes-critic-history-select'
};

export class ControlPanel {
    private container: HTMLElement;
    private feedbackButton: HTMLButtonElement;
    private clearButton: HTMLButtonElement;
    private historySelect: HTMLSelectElement;
    private conversationId: string;
    private history: History[];
    private onFeedback: () => void;
    private onClear: () => void;
    private onLoadHistory: (id: string) => void;

    constructor(
        parent: Element,
        onFeedback: () => void,
        onClear: () => void,
        onLoadHistory: (id: string) => void
    ) {
        this.onFeedback = onFeedback;
        this.onClear = onClear;
        this.onLoadHistory = onLoadHistory;
        this.container = this.createControlsContainer(parent);
    }

    private createHistorySelect(parent: Element): HTMLSelectElement {
        if (!this.historySelect) {
            return parent.createEl('select', {
                cls: CSS_CLASSES.historySelect
            });
        }
        return this.historySelect;
    }

    public updateHistory(history: History[], selectedId: string): void {
        if (!this.historySelect) {
            return;
        }
        this.historySelect.empty();
        history.forEach(history => this.historySelect.createEl('option', {
            text: history.title || history.id,
            value: history.id,
            attr: history.id === selectedId ? { selected: true } : {}
        }));
        this.historySelect.onchange = () => this.onLoadHistory(this.historySelect.value);
    }

    private createControlsContainer(parent: Element): HTMLElement {
        parent.createEl('h4', {
            text: 'Writing Feedback',
            cls: 'notes-critic-header'
        });
        this.historySelect = this.createHistorySelect(parent);

        const controlsContainer = parent.createEl('div', {
            cls: CSS_CLASSES.controls
        });

        this.feedbackButton = this.createIconButton(controlsContainer, 'message-circle', 'Get Feedback', this.onFeedback);
        this.clearButton = this.createIconButton(controlsContainer, 'trash', 'Clear Current', this.onClear);

        return controlsContainer;
    }

    private createIconButton(parent: Element, iconName: string, title: string, onClick: () => void): HTMLButtonElement {
        const button = parent.createEl('button', {
            cls: CSS_CLASSES.iconButton,
            attr: { title }
        });
        setIcon(button, iconName);
        button.onclick = onClick;
        return button;
    }

    destroy(): void {
        this.container.remove();
    }
} 