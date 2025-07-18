import { ConversationTurn, UserInput, TurnStep, ToolCall, LLMStreamChunk, NotesCriticSettings, LLMFile } from 'types';
import { getFeedback } from 'feedback/feedbackProvider';
import { App } from 'obsidian';

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

export class ConversationManager {
    private conversation: ConversationTurn[] = [];
    private settings: NotesCriticSettings;
    private app: App;
    private turnAbortControllers: Map<string, AbortController> = new Map();

    constructor(settings: NotesCriticSettings, app: App) {
        this.settings = settings;
        this.app = app;
    }

    public getConversation(): ConversationTurn[] {
        return [...this.conversation];
    }

    public isInferenceRunning(): boolean {
        return this.turnAbortControllers.size > 0;
    }

    public cancelInference(): void {
        // Cancel all active streaming calls
        for (const [turnId, controller] of this.turnAbortControllers) {
            this.cancelTurn(turnId);
        }
    }

    public cancelTurn(turnId: string): void {
        const controller = this.turnAbortControllers.get(turnId);
        if (controller) {
            controller.abort();
            this.turnAbortControllers.delete(turnId);
        }
        // Remove the current step if it's empty (no content, thinking, or tool calls)
        const turn = this.conversation.find(t => t.id === turnId);
        if (turn) {
            this.removeEmptyCurrentStep(turn);
        }
    }

    public async newConversationRound(
        prompt: string,
        files?: LLMFile[],
        callback?: ConversationCallback
    ): Promise<ConversationTurn> {
        if (this.isInferenceRunning()) {
            throw new Error('Inference is already running. Please wait for it to complete or cancel it first.');
        }

        const userInput: UserInput = {
            type: 'chat_message',
            message: prompt,
            prompt,
            files
        };

        const turn = this.createConversationTurn(userInput);
        this.conversation.push(turn);

        // Immediately notify that the turn has started
        callback?.({ type: 'turn_start', turn });

        await this.streamTurnResponse(turn, callback);
        return turn;
    }

    public async rerunConversationTurn(
        turnId: string,
        callback?: ConversationCallback,
        prompt?: string,
        files?: LLMFile[]
    ): Promise<ConversationTurn> {
        if (this.isInferenceRunning()) {
            throw new Error('Inference is already running. Please wait for it to complete or cancel it first.');
        }

        // Find the turn in the conversation
        const turnIndex = this.conversation.findIndex(t => t.id === turnId);
        if (turnIndex === -1) {
            throw new Error(`Turn with ID ${turnId} not found in conversation history`);
        }

        const originalTurn = this.conversation[turnIndex];

        // Remove this turn and all subsequent turns
        this.conversation = this.conversation.slice(0, turnIndex);

        // Use provided prompt/files or fall back to original
        const finalPrompt = prompt ?? originalTurn.userInput.prompt;
        const finalFiles = files ?? originalTurn.userInput.files;

        return this.newConversationRound(finalPrompt, finalFiles, callback);
    }

    private createConversationTurn(userInput: UserInput): ConversationTurn {
        return {
            id: Date.now().toString(),
            timestamp: new Date(),
            userInput,
            steps: [this.newStep({})],
            isComplete: false,
            error: undefined
        };
    }

    private newStep({ thinking, content, toolCalls }: { thinking?: string, content?: string, toolCalls?: Record<string, ToolCall> } = {}): TurnStep {
        return {
            thinking: thinking || '',
            content: content || undefined,
            toolCalls: toolCalls || {},
        };
    }

    private async streamTurnResponse(
        turn: ConversationTurn,
        callback?: ConversationCallback,
        stepsLeft: number = 10,
        abortController?: AbortController
    ): Promise<void> {
        // If this is the first call, create the abort controller and mark as running
        if (!abortController) {
            abortController = new AbortController();
            this.turnAbortControllers.set(turn.id, abortController);
        }

        callback?.({ type: 'step_start', turn });
        try {
            const updatedStep = await this.streamResponse(turn, callback, abortController);

            if (Object.keys(updatedStep.toolCalls).length > 0 && stepsLeft > 0) {
                const newStep = this.newStep({});
                turn.steps.push(newStep);
                callback?.({ type: 'step_complete', step: updatedStep });
                await this.streamTurnResponse(turn, callback, stepsLeft - 1, abortController);
            } else {
                turn.isComplete = true;
                callback?.({ type: 'turn_complete', turn });
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                turn.error = 'Inference was cancelled';
            } else {
                turn.error = error.message;
            }
            turn.isComplete = true;
            callback?.({ type: 'error', error: turn.error, turn });
        } finally {
            // Clean up the abort controller for this turn
            this.turnAbortControllers.delete(turn.id);
        }
    }

    private async streamResponse(
        turn: ConversationTurn,
        callback: ConversationCallback | undefined,
        abortController: AbortController
    ): Promise<TurnStep> {
        let streamedThinking = '';
        let streamedContent = '';

        const step = turn.steps[turn.steps.length - 1];

        for await (const chunk of getFeedback(
            this.conversation, // All previous turns
            this.settings,
            this.app
        )) {
            // Check if this specific call should abort
            if (abortController.signal.aborted) {
                throw new Error('Inference was cancelled');
            }

            if (chunk.type === 'thinking') {
                streamedThinking += chunk.content;
                step.thinking = streamedThinking;
                callback?.({ type: 'thinking', content: chunk.content });
            } else if (chunk.type === 'signature') {
                step.signature = chunk.content;
            } else if (chunk.type === 'content') {
                streamedContent += chunk.content;
                step.content = streamedContent;
                callback?.({ type: 'content', content: chunk.content });
            } else if (chunk.type === 'tool_call') {
                const toolCall = {
                    id: chunk.toolCall?.id || '',
                    name: chunk.toolCall?.name || '',
                    input: chunk.toolCall?.input || {}
                };
                step.toolCalls[toolCall.id] = toolCall;
                callback?.({ type: 'tool_call', toolCall });
            } else if (chunk.type === 'tool_call_result') {
                const toolCall = step.toolCalls[chunk.toolCallResult?.id || ''];
                if (toolCall) {
                    toolCall.result = chunk.toolCallResult?.result || {};
                }
                callback?.({
                    type: 'tool_call_result',
                    toolCallResult: chunk.toolCallResult
                });
            } else if (chunk.type === 'error') {
                throw new Error(chunk.content);
            }
        }

        return step;
    }

    private removeEmptyCurrentStep(turn: ConversationTurn): void {
        if (turn.steps.length === 0) return;

        const currentStep = turn.steps[turn.steps.length - 1];
        const isEmpty = this.isStepEmpty(currentStep);

        if (isEmpty) {
            turn.steps.pop();

            // If the turn now has no steps, remove the entire turn
            if (turn.steps.length === 0) {
                const turnIndex = this.conversation.findIndex(t => t.id === turn.id);
                if (turnIndex !== -1) {
                    this.conversation.splice(turnIndex, 1);
                }
            }
        }
    }

    private isStepEmpty(step: TurnStep): boolean {
        return !step.content &&
            !step.thinking &&
            Object.keys(step.toolCalls).length === 0;
    }
} 