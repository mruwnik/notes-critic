import { ItemView, WorkspaceLeaf, TFile, Notice, Plugin } from 'obsidian';
import { CHAT_VIEW_CONFIG, NoteSnapshot, ConversationTurn, NotesCriticSettings } from 'types';
import { generateDiff } from 'diffs';
import { ChatViewComponent } from 'views/components/Chat';
import { FileManager } from 'FileManager';
import { ApiKeySetup } from 'views/components/ApiKeySetup';
import { ConversationChunk } from 'hooks/useConversationManager';
import { RuleManager } from 'rules/RuleManager';
import React from 'react';
import { createRoot } from 'react-dom/client';

export class ChatView extends ItemView {
    private currentFile: TFile | null = null;
    private plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> };
    private noteSnapshots: Map<string, NoteSnapshot> = new Map();
    private lastFeedbackTimes: Map<string, Date> = new Map();
    private ruleManager: RuleManager;
    // Components
    private reactRoot: any;
    private reactContainer: HTMLElement;
    private updateReactComponents: () => void = () => { };
    private chatInputRef: React.RefObject<HTMLTextAreaElement> = React.createRef();
    private getCurrentConversation: () => ConversationTurn[] = () => [];
    private sendFeedbackMessage: (prompt: string, files?: any[], overrideSettings?: NotesCriticSettings) => Promise<void> = async () => { };
    private fileManager: FileManager;

    constructor(leaf: WorkspaceLeaf, plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> }) {
        super(leaf);
        this.plugin = plugin;
        this.fileManager = new FileManager(this.app, this.noteSnapshots, this.onFileChange.bind(this));
        this.ruleManager = new RuleManager(this.app);
    }

    getViewType() {
        return CHAT_VIEW_CONFIG.type;
    }

    getDisplayText() {
        return CHAT_VIEW_CONFIG.name;
    }

    getIcon() {
        return CHAT_VIEW_CONFIG.icon;
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();

        // Check if API key is configured
        if (!ApiKeySetup.isApiKeyConfigured(this.plugin.settings)) {
            new ApiKeySetup(
                container,
                this.plugin.settings,
                () => this.onOpen()
            );
            return;
        }

        this.buildUI(container);
        this.initializeView();
        this.registerEventListeners();

        // Initialize rule manager
        await this.ruleManager.initialize();
    }

    private buildUI(container: Element) {
        this.reactContainer = container.createDiv();
        this.setupReactComponents();
    }

    private setupReactComponents() {
        this.reactRoot = createRoot(this.reactContainer);

        const renderComponents = () => {
            this.reactRoot.render(
                React.createElement(ChatViewComponent, {
                    settings: this.plugin.settings,
                    app: this.app,
                    onFeedback: this.triggerFeedback.bind(this),
                    onClear: this.clearCurrentNote.bind(this),
                    onChunkReceived: this.handleConversationChunk.bind(this),
                    onConversationChange: (conversation: ConversationTurn[]) => {
                        this.getCurrentConversation = () => conversation;
                    },
                    onTriggerFeedbackMessage: (feedbackFunction) => {
                        this.sendFeedbackMessage = feedbackFunction;
                    },
                    chatInputRef: this.chatInputRef
                })
            );
        };

        this.updateReactComponents = renderComponents;
        renderComponents();
    }

    private initializeView() {
        this.updateActiveFile();
        this.updateUI();
    }

    private registerEventListeners() {
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => {
                this.updateActiveFile();
            })
        );

        this.registerEvent(
            this.app.workspace.on('file-open', () => this.updateActiveFile())
        );

        this.registerEvent(
            this.app.vault.on('modify', (file) => {
                if (file instanceof TFile && file === this.currentFile) {
                    this.onFileModified(file);
                }
            })
        );
    }

    private updateActiveFile() {
        const newFile = this.fileManager.getCurrentFile();
        if (newFile !== this.currentFile) {
            this.currentFile = newFile;
            if (newFile) {
                this.fileManager.initializeFileSnapshot(newFile);
            }
        }
    }

    private onFileChange(file: TFile) {
        this.updateUI();
    }

    private updateUI() {
        this.updateReactComponents();
    }

    private async currentConfig(): Promise<NotesCriticSettings | undefined> {
        return this.currentFile ? await this.ruleManager.getEffectiveConfig(this.currentFile.path, this.plugin.settings) : undefined;
    }

    private async onFileModified(file: TFile) {
        if (!file) return;

        await this.fileManager.updateFileSnapshot(file);
        this.updateUI();

        // Check if auto-triggering is enabled for this file
        const shouldAutoTrigger = await this.ruleManager.shouldAutoTrigger(file.path);
        if (!shouldAutoTrigger) return;

        // Get effective configuration for this file
        const config = await this.currentConfig();

        // Check if we should auto-trigger feedback
        const snapshot = this.noteSnapshots.get(file.path);
        if (snapshot && snapshot.changeCount >= (config?.feedbackThreshold ?? 0)) {
            // Check cooldown period
            const now = new Date();
            const cooldownMs = (config?.feedbackCooldownSeconds ?? 0) * 1000;
            const lastFeedbackTime = this.lastFeedbackTimes.get(file.path);
            const timeSinceLastFeedback = lastFeedbackTime ?
                now.getTime() - lastFeedbackTime.getTime() :
                cooldownMs; // If no previous feedback, allow trigger

            if (timeSinceLastFeedback >= cooldownMs) {
                this.lastFeedbackTimes.set(file.path, now);
                this.triggerFeedback();
            }
        }
    }


    private handleConversationChunk(chunk: ConversationChunk) {
        this.updateReactComponents();
    }

    public async triggerFeedback() {
        this.updateActiveFile();

        if (!this.currentFile) {
            new Notice('No active note detected. Please open a markdown file first.');
            return;
        }

        const snapshot = this.noteSnapshots.get(this.currentFile.path);
        if (!snapshot) {
            new Notice('No snapshot available for current note. Please wait for initialization.');
            return;
        }

        const diff = generateDiff(snapshot.baseline, snapshot.current);

        const feedbackPrompt = await this.ruleManager.getFeedbackPrompt(this.currentFile.path, this.plugin.settings);
        const prompt = feedbackPrompt
            .replace(/\${notePath}/g, this.currentFile.path)
            .replace(/\${noteTitle}/g, this.currentFile.basename)
            .replace(/\${diff}/g, diff);

        const files = [{
            type: 'text' as const,
            path: this.currentFile.path,
            name: this.currentFile.basename
        }];

        try {
            await this.sendFeedbackMessage(prompt, files, await this.currentConfig());

            // Update snapshot baseline
            this.fileManager.updateFeedbackBaseline(this.currentFile!);

            // Update last feedback time for this file
            this.lastFeedbackTimes.set(this.currentFile.path, new Date());

            this.updateUI();
        } catch (error) {
            new Notice(`Error generating feedback: ${error.message}`);
        }
    }


    private clearCurrentNote() {
        const currentConversation = this.getCurrentConversation();
        if (!this.currentFile && currentConversation.length === 0) return;

        this.currentFile && this.fileManager.clearNoteData(this.currentFile);

        this.updateUI();
        new Notice(`Cleared tracking and feedback for ${this.currentFile?.basename}`);
    }

    async onClose() {
        if (this.reactRoot) {
            this.reactRoot.unmount();
        }
    }
} 