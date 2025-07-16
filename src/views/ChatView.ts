import { ItemView, WorkspaceLeaf, TFile, Notice, Plugin } from 'obsidian';
import { CHAT_VIEW_CONFIG, NoteSnapshot, ConversationTurn, UserInput, NotesCriticSettings, LLMFile, TurnStep, ToolCall } from 'types';
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

    private newStep({ thinking, content, toolCalls }: { thinking?: string, content?: string, toolCalls?: Record<string, ToolCall> }): TurnStep {
        return {
            thinking: thinking || '',
            content: content || undefined,
            toolCalls: toolCalls || {},
        }
    }

    private async createConversationTurn(userInput: UserInput) {
        const turn: ConversationTurn = {
            id: Date.now().toString(),
            timestamp: new Date(),
            userInput,
            steps: [this.newStep({})],
            isComplete: false,
            error: undefined
        };

        this.conversation.push(turn);
        console.log("conversation", this.conversation);
        await this.streamTurnResponse(turn);
    }

    private async streamResponse(step: TurnStep): Promise<TurnStep> {
        let streamedThinking = '';
        let streamedContent = '';

        for await (const chunk of getFeedback(
            step,
            this.conversation, // All previous turns
            this.plugin.settings,
            this.app
        )) {
            if (chunk.type === 'thinking') {
                streamedThinking += chunk.content;
                step.thinking = streamedThinking;
            } else if (chunk.type === 'signature') {
                step.signature = chunk.content;
            } else if (chunk.type === 'content') {
                streamedContent += chunk.content;
                step.content = streamedContent;
            } else if (chunk.type === 'tool_call') {
                const toolCall = {
                    id: chunk.toolCall?.id || '',
                    name: chunk.toolCall?.name || '',
                    input: chunk.toolCall?.input || {}
                };
                step.toolCalls[toolCall.id] = toolCall;
            } else if (chunk.type === 'tool_call_result') {
                const toolCall = step.toolCalls[chunk.toolCallResult?.id || ''];
                if (toolCall) {
                    toolCall.result = chunk.toolCallResult?.result || {};
                }
            } else if (chunk.type === 'error') {
                throw new Error(chunk.content);
            }
        }
        return step;
    }

    private async streamTurnResponse(turn: ConversationTurn, stepsLeft: number = 10) {
        const aiResponseEl = this.feedbackDisplay.createConversationTurn(turn);
        try {
            const updatedTurn = await this.streamResponse(turn.steps[turn.steps.length - 1]);
            if (Object.keys(updatedTurn.toolCalls).length > 0 && stepsLeft > 0) {
                const newStep = this.newStep({});
                turn.steps.push(newStep);
                await this.streamTurnResponse(turn, stepsLeft - 1);
            }
            this.feedbackDisplay.updateConversationTurn(aiResponseEl, turn, false);
        } catch (error) {
            turn.error = error.message;
            turn.isComplete = true;
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
                steps: [{
                    thinking: '',
                    content: undefined,
                    toolCalls: {}
                }]
            };

            // Add the turn back and redisplay
            this.feedbackDisplay.redisplayConversation(this.conversation);
            this.conversation.push(newTurn);

            // Rerun the response
            await this.streamTurnResponse(newTurn);
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