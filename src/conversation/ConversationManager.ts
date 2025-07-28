import { ConversationTurn, UserInput, TurnStep, LLMStreamChunk, NotesCriticSettings, LLMFile, TurnChunk } from 'types';
import { App } from 'obsidian';
import { LLMProvider } from 'llm/llmProvider';
import { History, HistoryManager } from 'conversation/HistoryManager';

// Generic UUID v4 generator that works across environments
function generateUUID(): string {
    // Try browser crypto API first
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }

    // Fallback implementation
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export interface ConversationChunk {
    type: 'thinking' | 'content' | 'tool_call' | 'tool_call_result' | 'error' | 'step_complete' | 'turn_complete' | 'turn_start' | 'step_start';
    content?: string;
    toolCall?: {
        id: string;
        name: string;
        input: any;
    };
    toolCallResult?: {
        id: string;
        result: any;
    };
    step?: TurnStep;
    turn?: ConversationTurn;
    error?: string;
}

export type ConversationCallback = (chunk: ConversationChunk) => void;

interface NewRoundParams {
    prompt: string;
    files?: LLMFile[];
    callback?: ConversationCallback;
    overrideSettings?: NotesCriticSettings;
    abortController?: AbortController;
}

interface RerunTurnParams {
    turnId: string;
    callback?: ConversationCallback;
    prompt?: string;
    files?: LLMFile[];
    overrideSettings?: NotesCriticSettings;
}

interface StreamTurnParams {
    turn: ConversationTurn;
    callback?: ConversationCallback;
    stepsLeft?: number;
    abortController?: AbortController;
    overrideSettings?: NotesCriticSettings;
}

const MAX_TURN_STEPS = 10;
const ABORT_ERROR_MESSAGE = 'Inference was cancelled';

export class ConversationManager {
    private conversation: ConversationTurn[] = [];
    private turnAbortControllers = new Map<string, AbortController>();
    public conversationId: string = generateUUID();
    private historyManager: HistoryManager;
    public title: string = '';

    constructor(
        private readonly settings: NotesCriticSettings,
        private readonly app: App,
        history: History | undefined = undefined
    ) {
        this.conversation = history?.conversation || [];
        this.conversationId = history?.id || generateUUID();
        this.title = history?.title || '';
        this.historyManager = new HistoryManager(this.settings, this.app);
    }

    public getConversation(): ConversationTurn[] {
        return [...this.conversation];
    }

    public isInferenceRunning(): boolean {
        return this.turnAbortControllers.size > 0;
    }

    public cancelInference(): void {
        for (const turnId of this.turnAbortControllers.keys()) {
            this.cancelTurn(turnId);
        }
    }

    public cancelTurn(turnId: string): void {
        const controller = this.turnAbortControllers.get(turnId);
        if (!controller) return;

        controller.abort();
        this.turnAbortControllers.delete(turnId);

        const turn = this.findTurn(turnId);
        if (turn) {
            this.removeEmptyCurrentStep(turn);
        }
    }

    public async newConversationRound(params: NewRoundParams): Promise<ConversationTurn> {
        this.validateNoRunningInference();

        const userInput = this.createUserInput(params);
        const turn = this.createConversationTurn(userInput);

        this.conversation.push(turn);
        params.callback?.({ type: 'turn_start', turn });

        await this.streamTurnResponse({
            turn,
            callback: params.callback,
            overrideSettings: params.overrideSettings,
            abortController: params.abortController
        });

        return turn;
    }

    public async rerunConversationTurn(params: RerunTurnParams): Promise<ConversationTurn> {
        const originalTurn = this.findAndRemoveTurnFromHistory(params.turnId);
        await this.cancelInference();

        return this.newConversationRound({
            prompt: params.prompt ?? originalTurn.userInput.prompt,
            files: params.files ?? originalTurn.userInput.files,
            callback: params.callback,
            overrideSettings: params.overrideSettings
        });
    }

    private validateNoRunningInference(): void {
        if (this.isInferenceRunning()) {
            throw new Error('Inference is already running. Please wait for it to complete or cancel it first.');
        }
    }

    private createUserInput({ prompt, files }: Pick<NewRoundParams, 'prompt' | 'files'>): UserInput {
        return {
            type: 'chat_message',
            message: prompt,
            prompt,
            files
        };
    }

    private createConversationTurn(userInput: UserInput): ConversationTurn {
        return {
            id: Date.now().toString(),
            timestamp: new Date(),
            userInput,
            steps: [this.createEmptyStep()],
            isComplete: false,
            error: undefined
        };
    }

    private createEmptyStep(): TurnStep {
        return {
            thinking: '',
            content: undefined,
            toolCalls: {},
            chunks: []
        };
    }

    private findTurn(turnId: string): ConversationTurn | undefined {
        return this.conversation.find(turn => turn.id === turnId);
    }

    private findAndRemoveTurnFromHistory(turnId: string): ConversationTurn {
        const turnIndex = this.conversation.findIndex(t => t.id === turnId);
        if (turnIndex === -1) {
            throw new Error(`Turn with ID ${turnId} not found in conversation history`);
        }

        const originalTurn = this.conversation[turnIndex];
        this.conversation = this.conversation.slice(0, turnIndex);
        return originalTurn;
    }

    private async streamTurnResponse(params: StreamTurnParams): Promise<void> {
        const { turn, callback, stepsLeft = MAX_TURN_STEPS, overrideSettings } = params;
        let { abortController } = params;

        // Initialize abort controller if not provided
        if (!abortController) {
            abortController = new AbortController();
            this.turnAbortControllers.set(turn.id, abortController);
        }

        callback?.({ type: 'step_start', turn });

        try {
            const completedStep = await this.streamSingleStep(turn, callback, abortController, overrideSettings);

            if (this.shouldContinueToNextStep(completedStep, stepsLeft)) {
                await this.processNextStep(turn, callback, stepsLeft, abortController, overrideSettings, completedStep);
            } else {
                this.completeTurn(turn, callback);
            }
        } catch (error) {
            this.handleTurnError(turn, error, callback);
        } finally {
            this.turnAbortControllers.delete(turn.id);
        }

        this.title = await this.historyManager.saveHistory(this.toHistory());
    }

    public toHistory(): History {
        return {
            id: this.conversationId,
            title: this.title,
            conversation: this.conversation
        };
    }

    private async streamSingleStep(
        turn: ConversationTurn,
        callback: ConversationCallback | undefined,
        abortController: AbortController,
        overrideSettings: NotesCriticSettings | undefined
    ): Promise<TurnStep> {
        const step = turn.steps[turn.steps.length - 1];

        const provider = new LLMProvider(overrideSettings || this.settings, this.app);
        for await (const chunk of provider.callLLM(this.conversation)) {
            if (abortController.signal.aborted) {
                throw new Error(ABORT_ERROR_MESSAGE);
            }

            this.processStreamChunk(chunk, step, callback);
        }

        return step;
    }

    private processStreamChunk(
        chunk: LLMStreamChunk,
        step: TurnStep,
        callback: ConversationCallback | undefined,
    ): void {
        let lastChunk = step.chunks?.[step.chunks.length - 1];

        if (lastChunk?.type === 'tool_call' && chunk.type === 'tool_call_result') {
            if (chunk.toolCallResult?.result) {
                lastChunk.toolCall!.result = chunk.toolCallResult?.result;
            }
        } else if (lastChunk?.id !== chunk.id) {
            lastChunk = {
                type: chunk.type as TurnChunk['type'],
                id: chunk.id,
                content: chunk.content
            }
            step.chunks?.push(lastChunk);
        } else if (chunk.isComplete) {
            lastChunk.content = chunk.content;
        } else {
            lastChunk.content += chunk.content;
        }

        switch (chunk.type) {
            case 'thinking':
                step.thinking = step.chunks?.filter(c => c.type === 'thinking').map(c => c.content).join('');
                callback?.({ type: 'thinking', content: lastChunk.content });
                break;

            case 'signature':
                step.signature = chunk.content;
                break;

            case 'content':
                step.content = step.chunks?.filter(c => c.type === 'content').map(c => c.content).join('');
                callback?.({ type: 'content', content: lastChunk.content });
                break;

            case 'tool_call':
                lastChunk.toolCall = chunk.toolCall;
                this.processToolCall(chunk, step, callback);
                break;

            case 'tool_call_result':
                this.processToolCallResult(chunk, step, callback);
                break;

            case 'error':
                throw new Error(chunk.content);
        }
    }

    private processToolCall(chunk: LLMStreamChunk, step: TurnStep, callback: ConversationCallback | undefined): void {
        const toolCall = {
            id: chunk.toolCall?.id || '',
            name: chunk.toolCall?.name || '',
            input: chunk.toolCall?.input || {},
            is_server_call: false,
            ...chunk.toolCall
        };
        step.toolCalls[toolCall.id] = toolCall;
        callback?.({ type: 'tool_call', toolCall });
    }

    private processToolCallResult(chunk: LLMStreamChunk, step: TurnStep, callback: ConversationCallback | undefined): void {
        const toolCallId = chunk.toolCallResult?.id || '';
        const toolCall = step.toolCalls[toolCallId];

        if (toolCall) {
            toolCall.result = chunk.toolCallResult?.result || {};
        }

        callback?.({
            type: 'tool_call_result',
            toolCallResult: chunk.toolCallResult?.result
        });
    }

    private shouldContinueToNextStep(step: TurnStep, stepsLeft: number): boolean {
        const toolCallsNeeded = Object.values(step.toolCalls).filter(tool => !tool.is_server_call);
        return toolCallsNeeded.length > 0 && stepsLeft > 0;
    }

    private async processNextStep(
        turn: ConversationTurn,
        callback: ConversationCallback | undefined,
        stepsLeft: number,
        abortController: AbortController,
        overrideSettings: NotesCriticSettings | undefined,
        completedStep: TurnStep
    ): Promise<void> {
        const newStep = this.createEmptyStep();
        turn.steps.push(newStep);
        callback?.({ type: 'step_complete', step: completedStep });

        await this.streamTurnResponse({
            turn,
            callback,
            stepsLeft: stepsLeft - 1,
            abortController,
            overrideSettings
        });
    }

    private completeTurn(turn: ConversationTurn, callback: ConversationCallback | undefined): void {
        turn.isComplete = true;
        callback?.({ type: 'turn_complete', turn });
    }

    private handleTurnError(turn: ConversationTurn, error: Error, callback: ConversationCallback | undefined): void {
        turn.error = error.name === 'AbortError' ? ABORT_ERROR_MESSAGE : error.message;
        turn.isComplete = true;
        callback?.({ type: 'error', error: turn.error, turn });
    }

    private removeEmptyCurrentStep(turn: ConversationTurn): void {
        if (turn.steps.length === 0) return;

        const currentStep = turn.steps[turn.steps.length - 1];
        if (!this.isStepEmpty(currentStep)) return;

        turn.steps.pop();

        if (turn.steps.length === 0) {
            this.removeEmptyTurn(turn);
        }
    }

    private removeEmptyTurn(turn: ConversationTurn): void {
        const turnIndex = this.conversation.findIndex(t => t.id === turn.id);
        if (turnIndex !== -1) {
            this.conversation.splice(turnIndex, 1);
        }
    }

    private isStepEmpty(step: TurnStep): boolean {
        return !step.content &&
            !step.thinking &&
            Object.keys(step.toolCalls).length === 0;
    }

} 