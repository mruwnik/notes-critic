import { setIcon } from 'obsidian';

const CSS_CLASSES = {
    controls: 'notes-critic-controls',
    button: 'notes-critic-button',
    iconButton: 'notes-critic-icon-button'
};

export class ControlPanel {
    private container: HTMLElement;
    private feedbackButton: HTMLButtonElement;
    private clearButton: HTMLButtonElement;
    private onFeedback: () => void;
    private onClear: () => void;

    constructor(
        parent: Element,
        onFeedback: () => void,
        onClear: () => void
    ) {
        this.onFeedback = onFeedback;
        this.onClear = onClear;
        this.container = this.createControlsContainer(parent);
    }

    private createControlsContainer(parent: Element): HTMLElement {
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

    updateFeedbackButton(enabled: boolean): void {
        this.feedbackButton.toggleAttribute('disabled', !enabled);
    }

    destroy(): void {
        this.container.remove();
    }
} 