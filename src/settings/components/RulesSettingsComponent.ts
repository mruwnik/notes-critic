import { App, TFile } from 'obsidian';
import { RuleManager } from 'rules/RuleManager';
import { NotesCriticRule } from 'types';

const EXAMPLE_RULE_CONTENT = `---
name: "Example Rule"
globs: 
  - "example/**/*.md"
  - "drafts/**/*.md"
exclude:
  - "**/*-ignore.md"
priority: 10
enabled: true
autoTrigger: true
feedbackThreshold: 2
feedbackCooldownSeconds: 60
maxTokens: 4000
model: "anthropic/claude-3-5-sonnet-latest"
---

# Example Feedback Rule

This is an example rule that demonstrates how to configure Notes Critic behavior for specific files or directories.

## What this rule does:

- **Matches files** in \`example/\` and \`drafts/\` directories
- **Excludes** files ending with \`-ignore.md\`
- **Auto-triggers** feedback after 2 paragraph changes
- **Uses a 60-second cooldown** between feedback sessions
- **Limits responses** to 4000 tokens
- **Uses Claude 3.5 Sonnet** instead of the global model setting

## Feedback Instructions

Provide concise, actionable feedback focusing on:

1. **Clarity** - Is the message clear and easy to understand?
2. **Structure** - Does the content flow logically?
3. **Completeness** - Are there any obvious gaps?

Keep feedback brief and specific. Highlight what works well alongside suggestions for improvement.
`

export class RulesSettingsComponent {
    private app: App;
    private container: HTMLElement;
    private ruleManager: RuleManager;

    constructor(app: App, container: HTMLElement) {
        this.app = app;
        this.container = container;
        this.ruleManager = new RuleManager(app);
    }

    async render(): Promise<void> {
        this.container.empty();
        this.container.className = 'notes-critic-rules-overview';

        this.createDescription();
        this.createActionButtons();
        await this.createRulesList();
    }

    private createDescription(): void {
        const description = this.container.createEl('p');
        description.innerHTML = `Rules are stored in <code>.notes-critic/rules/</code> directories throughout your vault. 
            Create markdown files with YAML frontmatter to configure file-specific behavior.`;
        description.className = 'notes-critic-rules-description';
    }

    private createActionButtons(): void {
        const buttonContainer = this.container.createDiv();
        buttonContainer.className = 'notes-critic-rules-buttons';

        this.createRefreshButton(buttonContainer);
    }

    private createRefreshButton(container: HTMLElement): void {
        const refreshButton = container.createEl('button');
        refreshButton.textContent = 'Refresh Rules';
        refreshButton.className = 'mod-cta';

        refreshButton.onclick = async () => {
            await this.handleRefresh(refreshButton);
        };
    }

    private async handleRefresh(button: HTMLButtonElement): Promise<void> {
        const originalText = button.textContent;
        button.textContent = 'Refreshing...';
        button.disabled = true;

        try {
            await this.ruleManager.refreshRules();
            await this.refreshRulesList();

            button.textContent = 'Refreshed ✓';
            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('Error refreshing rules:', error);
            button.textContent = 'Error';

            setTimeout(() => {
                button.textContent = originalText;
                button.disabled = false;
            }, 2000);
        }
    }

    private async createRulesList(): Promise<void> {
        const rulesList = this.container.createDiv();
        rulesList.className = 'notes-critic-rules-list';

        await this.renderRulesInContainer(rulesList);
    }

    private async refreshRulesList(): Promise<void> {
        const rulesList = this.container.querySelector('.notes-critic-rules-list') as HTMLElement;
        if (rulesList) {
            await this.renderRulesInContainer(rulesList);
        }
    }

    private async renderRulesInContainer(container: HTMLElement): Promise<void> {
        container.empty();

        try {
            await this.ruleManager.initialize();
            const rules = this.ruleManager.getRules();

            if (rules.length === 0) {
                this.renderNoRulesMessage(container);
                return;
            }

            rules.forEach(rule => {
                this.renderRuleCard(container, rule);
            });

        } catch (error) {
            this.renderErrorMessage(container, error);
        }
    }

    private renderNoRulesMessage(container: HTMLElement): void {
        const noRules = container.createEl('p');
        noRules.textContent = 'No rules found. Create a rule file in .notes-critic/rules/ to get started.';
        noRules.className = 'notes-critic-no-rules';
    }

    private renderErrorMessage(container: HTMLElement, error: any): void {
        const errorMsg = container.createEl('p');
        errorMsg.textContent = 'Error loading rules: ' + error.message;
        errorMsg.className = 'notes-critic-error';
    }

    private renderRuleCard(container: HTMLElement, rule: NotesCriticRule): void {
        const ruleCard = container.createDiv();
        ruleCard.className = 'notes-critic-rule-card';

        if (!rule.enabled) {
            ruleCard.classList.add('notes-critic-rule-disabled');
        }

        this.renderRuleHeader(ruleCard, rule);
        this.renderRuleDetails(ruleCard, rule);
    }

    private renderRuleHeader(card: HTMLElement, rule: NotesCriticRule): void {
        const header = card.createDiv();
        header.className = 'notes-critic-rule-header';

        const name = header.createEl('h4');
        name.textContent = rule.name;
        name.className = 'notes-critic-rule-name';

        const path = header.createEl('span');
        path.textContent = rule.filePath;
        path.className = 'notes-critic-rule-path';
    }

    private renderRuleDetails(card: HTMLElement, rule: NotesCriticRule): void {
        const details = card.createDiv();
        details.className = 'notes-critic-rule-details';

        this.addDetailIfPresent(details, 'Patterns', rule.globs?.join(', '));
        this.addDetailIfPresent(details, 'Threshold', rule.feedbackThreshold ? `${rule.feedbackThreshold} paragraphs` : null);
        this.addDetailIfPresent(details, 'Cooldown', rule.feedbackCooldownSeconds ? `${rule.feedbackCooldownSeconds}s` : null);
        this.addDetailIfPresent(details, 'Model', rule.model);

        // Always show auto-trigger status
        const autoTrigger = details.createEl('p');
        autoTrigger.innerHTML = `<strong>Auto-trigger:</strong> ${rule.autoTrigger ? 'Yes' : 'No'}`;

        if (!rule.enabled) {
            const disabled = details.createEl('p');
            disabled.innerHTML = `<strong>Status:</strong> <span style="color: #ff6b6b;">Disabled</span>`;
        }
    }

    private addDetailIfPresent(container: HTMLElement, label: string, value: string | null | undefined): void {
        if (value) {
            const detail = container.createEl('p');
            detail.innerHTML = `<strong>${label}:</strong> ${value}`;
        }
    }

    destroy(): void {
        this.container.empty();
    }
} 