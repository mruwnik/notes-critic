import { ItemView, WorkspaceLeaf, TFile, Notice, Plugin } from 'obsidian';
import { CHAT_VIEW_CONFIG, NoteSnapshot, FeedbackEntry, NotesCriticSettings } from 'types';
import { getFeedback, generateDiff } from 'feedback/feedbackProvider';
import { FeedbackDisplay } from './components/FeedbackDisplay';
import { ChatInput } from './components/ChatInput';
import { ControlPanel } from './components/ControlPanel';
import { FileManager } from './components/FileManager';

export class ChatView extends ItemView {
    private currentFile: TFile | null = null;
    private plugin: Plugin & { settings: NotesCriticSettings; saveSettings(): Promise<void> };
    private noteSnapshots: Map<string, NoteSnapshot> = new Map();
    private feedbackHistory: FeedbackEntry[] = [];

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
        this.feedbackDisplay = new FeedbackDisplay(container);
        this.chatInput = new ChatInput(container, this.sendMessage.bind(this));
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

    private async onFileModified(file: TFile) {
        if (!file) return;

        const lengthDiff = await this.fileManager.updateFileSnapshot(file);
        this.updateUI();

        // Check if we should auto-trigger feedback
        const snapshot = this.noteSnapshots.get(file.path);
        if (snapshot && snapshot.changeCount >= this.plugin.settings.feedbackThreshold) {
            this.triggerFeedback();
        }
    }

    private updateUI() {
        this.controlPanel.updateFeedbackButton(this.fileManager.hasChangesToFeedback(this.currentFile));
    }

    private async sendMessage(message: string) {
        if (!message) return;

        try {
            this.feedbackDisplay.createUserMessage(message);

            const aiResponseEntry: FeedbackEntry = {
                timestamp: new Date(),
                noteId: this.currentFile?.path || 'chat',
                noteName: this.currentFile?.basename || 'Chat',
                content: this.currentFile ? await this.app.vault.cachedRead(this.currentFile) : '',
                ai_message: message,
                diff: '',
                feedback: '',
                thinking: ''
            };

            this.feedbackHistory.push(aiResponseEntry);
            await this.streamFeedbackResponse(aiResponseEntry);
        } catch (error) {
            console.error('Error sending message:', error);
            new Notice('Error sending message. Please try again.');
        }
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

        try {
            await this.processFeedbackRequest(snapshot);
        } catch (error) {
            console.error('Error generating feedback:', error);
            new Notice('Error generating feedback. Please try again.');
        }
    }

    private async processFeedbackRequest(snapshot: NoteSnapshot) {
        const diff = generateDiff(snapshot.baseline, snapshot.current);

        const feedbackEntry: FeedbackEntry = {
            timestamp: new Date(),
            noteId: this.currentFile!.path,
            noteName: this.currentFile!.basename,
            content: snapshot.current,
            ai_message: `Changes made to "${this.currentFile!.basename}":\n${diff}`,
            diff: diff,
            feedback: '',
            thinking: ''
        };

        this.feedbackHistory.push(feedbackEntry);
        await this.streamFeedbackResponse(feedbackEntry);

        // Update snapshot baseline
        this.fileManager.updateFeedbackBaseline(this.currentFile!);
        this.updateUI();
    }

    private async streamFeedbackResponse(feedbackEntry: FeedbackEntry) {
        const feedbackEl = this.feedbackDisplay.createFeedbackElement(feedbackEntry);
        let streamedThinking = '';
        let streamedContent = '';

        try {
            const isChat = !feedbackEntry.diff || feedbackEntry.diff.trim() === '';
            const contentToSend = isChat ? feedbackEntry.ai_message : feedbackEntry.content;

            for await (const chunk of getFeedback(
                this.currentFile?.basename || 'Chat',
                contentToSend,
                feedbackEntry.diff,
                this.feedbackHistory.slice(0, -1),
                this.plugin.settings
            )) {
                if (chunk.type === 'thinking') {
                    streamedThinking += chunk.content;
                    feedbackEntry.thinking = streamedThinking;
                } else if (chunk.type === 'content') {
                    streamedContent += chunk.content;
                    feedbackEntry.feedback = streamedContent;
                } else if (chunk.type === 'error') {
                    feedbackEntry.feedback = `Error: ${chunk.content}`;
                    this.feedbackDisplay.updateFeedbackDisplay(feedbackEl, feedbackEntry, false);
                    return;
                }

                this.feedbackDisplay.updateFeedbackDisplay(feedbackEl, feedbackEntry, true);
            }

            // Final update without streaming cursor
            this.feedbackDisplay.updateFeedbackDisplay(feedbackEl, feedbackEntry, false);
        } catch (error) {
            feedbackEntry.feedback = `Error: ${error.message}`;
            this.feedbackDisplay.updateFeedbackDisplay(feedbackEl, feedbackEntry, false);
        }
    }

    private clearCurrentNote() {
        if (!this.currentFile) return;

        const fileId = this.currentFile.path;
        this.fileManager.clearNoteData(this.currentFile);

        // Clear feedback messages for this note
        this.feedbackHistory = this.feedbackHistory.filter(entry => entry.noteId !== fileId);
        this.feedbackDisplay.redisplayFeedback(this.feedbackHistory);

        this.updateUI();
        new Notice(`Cleared tracking and feedback for ${this.currentFile.basename}`);
    }

    async onClose() {
        // Clean up components
        this.feedbackDisplay?.destroy();
        this.chatInput?.destroy();
        this.controlPanel?.destroy();

        // Event listeners are automatically cleaned up by registerEvent
    }
} 