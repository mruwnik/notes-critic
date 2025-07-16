import { ItemView, WorkspaceLeaf, TFile, Notice, Plugin } from 'obsidian';
import { CHAT_VIEW_CONFIG, NoteSnapshot, ConversationTurn, UserInput, NotesCriticSettings, LLMFile } from 'types';
import { getFeedback, generateDiff } from 'feedback/feedbackProvider';
import { FeedbackDisplay } from './components/FeedbackDisplay';
import { ChatInput } from './components/ChatInput';
import { ControlPanel } from './components/ControlPanel';
import { FileManager } from './components/FileManager';

export class ChatView extends ItemView {
    private currentFile: TFile | null = null;
    private plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> };
    private noteSnapshots: Map<string, NoteSnapshot> = new Map();
    private conversation: ConversationTurn[] = [];
    private lastFeedbackTimes: Map<string, Date> = new Map();

    // Components
    private feedbackDisplay: FeedbackDisplay;
    private chatInput: ChatInput;
    private controlPanel: ControlPanel;
    private fileManager: FileManager;

    constructor(leaf: WorkspaceLeaf, plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> }) {
        super(leaf);
        this.plugin = plugin;
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
            () => this.clearCurrentNote()
        );
        this.feedbackDisplay = new FeedbackDisplay(container, this.rerunConversationTurn.bind(this));
        this.chatInput = new ChatInput(container, this.sendChatMessage.bind(this));
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
        // Update control panel state based on current file
        this.controlPanel.updateFeedbackButton(this.fileManager.hasChangesToFeedback(this.currentFile));
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

        const userInput: UserInput = {
            type: 'chat_message',
            message,
            prompt: message
        };

        await this.createConversationTurn(userInput);
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
        const userInput: UserInput = {
            type: 'file_change',
            filename: this.currentFile.basename,
            diff,
            prompt: this.plugin.settings.feedbackPrompt.replace(/\${noteName}/g, this.currentFile.basename).replace(/\${diff}/g, diff),
            files: [{
                type: 'text',
                path: this.currentFile.path,
                name: this.currentFile.basename
            }]
        };

        await this.createConversationTurn(userInput);

        // Update snapshot baseline
        this.fileManager.updateFeedbackBaseline(this.currentFile!);

        // Update last feedback time for this file
        this.lastFeedbackTimes.set(this.currentFile.path, new Date());

        this.updateUI();
    }

    private async createConversationTurn(userInput: UserInput) {
        const turn: ConversationTurn = {
            id: Date.now().toString(),
            timestamp: new Date(),
            userInput,
            aiResponse: {
                thinking: '',
                content: '',
                isComplete: false
            }
        };

        this.conversation.push(turn);
        await this.streamResponse(turn);
    }

    private async streamResponse(turn: ConversationTurn) {
        const aiResponseEl = this.feedbackDisplay.createConversationTurn(turn);
        let streamedThinking = '';
        let streamedContent = '';

        try {
            for await (const chunk of getFeedback(
                turn.userInput,
                this.conversation.slice(0, -1), // All previous turns
                this.plugin.settings,
                this.app
            )) {
                if (chunk.type === 'thinking') {
                    streamedThinking += chunk.content;
                    turn.aiResponse.thinking = streamedThinking;
                } else if (chunk.type === 'content') {
                    streamedContent += chunk.content;
                    turn.aiResponse.content = streamedContent;
                } else if (chunk.type === 'error') {
                    turn.aiResponse.error = chunk.content;
                    turn.aiResponse.isComplete = true;
                    this.feedbackDisplay.updateConversationTurn(aiResponseEl, turn, false);
                    return;
                }

                this.feedbackDisplay.updateConversationTurn(aiResponseEl, turn, true);
            }

            // Mark as complete
            turn.aiResponse.isComplete = true;
            this.feedbackDisplay.updateConversationTurn(aiResponseEl, turn, false);

        } catch (error) {
            turn.aiResponse.error = error.message;
            turn.aiResponse.isComplete = true;
            this.feedbackDisplay.updateConversationTurn(aiResponseEl, turn, false);
        }
    }

    private async rerunConversationTurn(turn: ConversationTurn) {
        try {
            // Find the turn in the conversation
            const turnIndex = this.conversation.findIndex(t => t.id === turn.id);
            if (turnIndex === -1) return;

            // Remove this turn and all subsequent turns
            this.conversation = this.conversation.slice(0, turnIndex);

            // Create a new turn with reset response
            const newTurn: ConversationTurn = {
                ...turn,
                id: Date.now().toString(),
                timestamp: new Date(),
                aiResponse: {
                    thinking: '',
                    content: '',
                    isComplete: false
                }
            };

            // Add the turn back and redisplay
            this.feedbackDisplay.redisplayConversation(this.conversation);
            this.conversation.push(newTurn);

            // Rerun the response
            await this.streamResponse(newTurn);
        } catch (error) {
            console.error('Error rerunning conversation turn:', error);
            new Notice('Error rerunning response. Please try again.');
        }
    }

    private clearCurrentNote() {
        if (!this.currentFile) return;

        this.fileManager.clearNoteData(this.currentFile);

        this.conversation = [];

        this.feedbackDisplay.redisplayConversation(this.conversation);
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