import { ItemView, WorkspaceLeaf, TFile, Notice, Plugin } from 'obsidian';
import { CHAT_VIEW_CONFIG, NoteSnapshot, ConversationTurn, UserInput, NotesCriticSettings, LLMFile, TurnStep, ToolCall } from 'types';
import { generateDiff } from 'feedback/feedbackProvider';
import { FeedbackDisplay } from 'views/components/FeedbackDisplay';
import { ChatInput } from 'views/components/ChatInput';
import { ControlPanel } from 'views/components/ControlPanel';
import { FileManager } from 'views/components/FileManager';
import { ConversationManager, ConversationChunk } from 'conversation/ConversationManager';

export class ChatView extends ItemView {
    private currentFile: TFile | null = null;
    private plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> };
    private noteSnapshots: Map<string, NoteSnapshot> = new Map();
    private conversationManager: ConversationManager;
    private lastFeedbackTimes: Map<string, Date> = new Map();

    // Components
    private feedbackDisplay: FeedbackDisplay;
    private chatInput: ChatInput;
    private controlPanel: ControlPanel;
    private fileManager: FileManager;

    constructor(leaf: WorkspaceLeaf, plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> }) {
        super(leaf);
        this.plugin = plugin;
        this.conversationManager = new ConversationManager(plugin.settings, this.app);
        this.fileManager = new FileManager(this.app, this.noteSnapshots, this.onFileChange.bind(this));
    }

    getViewType() {
        return CHAT_VIEW_CONFIG.type;
    }

    getDisplayText() {
        return CHAT_VIEW_CONFIG.name;
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();

        this.buildUI(container);
        this.initializeView();
        this.registerEventListeners();
    }

    private buildUI(container: Element) {
        // Create header with inline controls
        const headerContainer = container.createEl('div', {
            cls: 'notes-critic-header-container'
        });

        headerContainer.createEl('h4', {
            text: 'Writing Feedback',
            cls: 'notes-critic-header'
        });

        // Create components
        this.controlPanel = new ControlPanel(
            headerContainer,
            () => this.triggerFeedback(),
            () => this.clearCurrentNote(),
        );
        this.feedbackDisplay = new FeedbackDisplay(
            container,
            this.rerunConversationTurn.bind(this),
            this.editConversationTurn.bind(this)
        );
        this.chatInput = new ChatInput(container, {
            onSend: this.sendChatMessage.bind(this)
        });
    }

    private initializeView() {
        this.updateActiveFile();
        this.updateUI();
    }

    private registerEventListeners() {
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', () => this.updateActiveFile())
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
        this.feedbackDisplay.redisplayConversation(this.conversationManager.getConversation());
    }

    private async onFileModified(file: TFile) {
        if (!file) return;

        await this.fileManager.updateFileSnapshot(file);
        this.updateUI();

        // Check if we should auto-trigger feedback
        const snapshot = this.noteSnapshots.get(file.path);
        if (snapshot && snapshot.changeCount >= this.plugin.settings.feedbackThreshold) {
            // Check cooldown period
            const now = new Date();
            const cooldownMs = this.plugin.settings.feedbackCooldownSeconds * 1000;
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

    private async sendChatMessage(message: string) {
        if (!message) return;

        try {
            // If inference is already running, cancel it first
            if (this.conversationManager.isInferenceRunning()) {
                this.conversationManager.cancelInference();
            }
            this.updateUI();

            await this.conversationManager.newConversationRound(
                message,
                undefined,
                this.handleConversationChunk.bind(this)
            );
        } catch (error) {
            new Notice(`Error sending message: ${error.message}`);
        }
    }

    private handleConversationChunk(chunk: ConversationChunk) {
        const conversation = this.conversationManager.getConversation();
        const currentTurn = conversation[conversation.length - 1];

        if (!currentTurn) return;

        this.feedbackDisplay.handleConversationChunk(chunk, currentTurn);
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
        const prompt = this.plugin.settings.feedbackPrompt
            .replace(/\${noteName}/g, this.currentFile.basename)
            .replace(/\${diff}/g, diff);

        const files = [{
            type: 'text' as const,
            path: this.currentFile.path,
            name: this.currentFile.basename
        }];

        try {
            await this.conversationManager.newConversationRound(
                prompt,
                files,
                this.handleConversationChunk.bind(this)
            );

            // Update snapshot baseline
            this.fileManager.updateFeedbackBaseline(this.currentFile!);

            // Update last feedback time for this file
            this.lastFeedbackTimes.set(this.currentFile.path, new Date());

            this.updateUI();
        } catch (error) {
            new Notice(`Error generating feedback: ${error.message}`);
        }
    }

    private async rerunConversationTurn(turn: ConversationTurn) {
        try {
            // First, redisplay the conversation with the turns up to the one being rerun
            const currentConversation = this.conversationManager.getConversation();
            const turnIndex = currentConversation.findIndex(t => t.id === turn.id);

            if (turnIndex !== -1) {
                // Show only the turns before the one being rerun
                const conversationBeforeRerun = currentConversation.slice(0, turnIndex);
                this.feedbackDisplay.redisplayConversation(conversationBeforeRerun);
            }

            // Then rerun the turn (this will add the new turn and stream the response)
            await this.conversationManager.rerunConversationTurn(
                turn.id,
                this.handleConversationChunk.bind(this)
            );
        } catch (error) {
            console.error('Error rerunning conversation turn:', error);
            new Notice('Error rerunning response. Please try again.');
        }
    }

    private async editConversationTurn(turn: ConversationTurn, newMessage: string) {
        try {
            // First, redisplay the conversation with the turns up to the one being edited
            const currentConversation = this.conversationManager.getConversation();
            const turnIndex = currentConversation.findIndex(t => t.id === turn.id);

            if (turnIndex !== -1) {
                // Show only the turns before the one being edited
                const conversationBeforeEdit = currentConversation.slice(0, turnIndex);
                this.feedbackDisplay.redisplayConversation(conversationBeforeEdit);
            }

            // Then rerun the turn with the new message
            await this.conversationManager.rerunConversationTurn(
                turn.id,
                this.handleConversationChunk.bind(this),
                newMessage
            );
        } catch (error) {
            console.error('Error editing conversation turn:', error);
            new Notice('Error editing message. Please try again.');
        }
    }

    private clearCurrentNote() {
        if (!this.currentFile) return;

        this.fileManager.clearNoteData(this.currentFile);

        // Create a new conversation manager to reset the conversation
        this.conversationManager = new ConversationManager(this.plugin.settings, this.app);

        this.updateUI();
        new Notice(`Cleared tracking and feedback for ${this.currentFile.basename}`);
    }

    async onClose() {
        // Clean up components
        this.feedbackDisplay?.destroy();
        this.chatInput?.destroy();
        this.controlPanel?.destroy();
    }
} 