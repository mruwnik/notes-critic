import { useState, useCallback, useRef, useEffect } from 'react';
import { ConversationTurn, UserInput, TurnStep, LLMStreamChunk, NotesCriticSettings, LLMFile, TurnChunk } from 'types';
import { App } from 'obsidian';
import { LLMProvider } from 'llm/llmProvider';
import { History } from 'hooks/useHistoryManager';

// Generic UUID v4 generator that works across environments
function generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
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
    currentConversation?: ConversationTurn[];
}

const MAX_TURN_STEPS = 10;
const ABORT_ERROR_MESSAGE = 'Inference was cancelled';

export interface UseConversationManagerReturn {
    conversation: ConversationTurn[];
    conversationId: string;
    title: string;
    isInferenceRunning: boolean;
    newConversationRound: (params: NewRoundParams) => Promise<ConversationTurn>;
    rerunConversationTurn: (params: RerunTurnParams) => Promise<ConversationTurn>;
    cancelInference: () => void;
    cancelTurn: (turnId: string) => void;
    loadHistory: (history: History) => void;
    clearConversation: () => void;
    toHistory: () => History;
}

export function useConversationManager(
    settings: NotesCriticSettings,
    app: App,
    initialHistory?: History
): UseConversationManagerReturn {
    const [conversation, setConversation] = useState<ConversationTurn[]>(initialHistory?.conversation || []);
    const [conversationId, setConversationId] = useState<string>(initialHistory?.id || generateUUID());
    const [title, setTitle] = useState<string>(initialHistory?.title || '');

    const turnAbortControllers = useRef(new Map<string, AbortController>());

    const isInferenceRunning = turnAbortControllers.current.size > 0;

    const findTurn = useCallback((turnId: string): ConversationTurn | undefined => {
        return conversation.find(turn => turn.id === turnId);
    }, [conversation]);

    const createUserInput = useCallback(({ prompt, files }: Pick<NewRoundParams, 'prompt' | 'files'>): UserInput => {
        return {
            type: 'chat_message',
            message: prompt,
            prompt,
            files
        };
    }, []);

    const createConversationTurn = useCallback((userInput: UserInput): ConversationTurn => {
        return {
            id: Date.now().toString(),
            timestamp: new Date(),
            userInput,
            steps: [createEmptyStep()],
            isComplete: false,
            error: undefined
        };
    }, []);

    const createEmptyStep = useCallback((): TurnStep => {
        return {
            thinking: '',
            content: undefined,
            toolCalls: {},
            chunks: []
        };
    }, []);

    const removeEmptyCurrentStep = useCallback((turn: ConversationTurn) => {
        if (turn.steps.length === 0) return;

        const currentStep = turn.steps[turn.steps.length - 1];
        const isStepEmpty = !currentStep.content &&
            !currentStep.thinking &&
            Object.keys(currentStep.toolCalls).length === 0;

        if (!isStepEmpty) return;

        turn.steps.pop();

        if (turn.steps.length === 0) {
            setConversation(prev => prev.filter(t => t.id !== turn.id));
        }
    }, []);

    const cancelTurn = useCallback((turnId: string): void => {
        const controller = turnAbortControllers.current.get(turnId);
        if (!controller) return;

        controller.abort();
        turnAbortControllers.current.delete(turnId);

        const turn = conversation.find(t => t.id === turnId);
        if (turn) {
            removeEmptyCurrentStep(turn);
        }
    }, [conversation, removeEmptyCurrentStep]);

    const cancelInference = useCallback((): void => {
        for (const turnId of turnAbortControllers.current.keys()) {
            cancelTurn(turnId);
        }
    }, [cancelTurn]);

    const processStreamChunk = useCallback((
        chunk: LLMStreamChunk,
        step: TurnStep,
        callback: ConversationCallback | undefined,
    ): void => {
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
                const toolCall = {
                    id: chunk.toolCall?.id || '',
                    name: chunk.toolCall?.name || '',
                    input: chunk.toolCall?.input || {},
                    is_server_call: false,
                    ...chunk.toolCall
                };
                step.toolCalls[toolCall.id] = toolCall;
                callback?.({ type: 'tool_call', toolCall });
                break;

            case 'tool_call_result':
                const toolCallId = chunk.toolCallResult?.id || '';
                const existingToolCall = step.toolCalls[toolCallId];
                if (existingToolCall) {
                    existingToolCall.result = chunk.toolCallResult?.result || {};
                }
                callback?.({
                    type: 'tool_call_result',
                    toolCallResult: chunk.toolCallResult?.result
                });
                break;

            case 'error':
                throw new Error(chunk.content);
        }
    }, []);

    const streamSingleStep = useCallback(async (
        turn: ConversationTurn,
        callback: ConversationCallback | undefined,
        abortController: AbortController,
        overrideSettings: NotesCriticSettings | undefined,
        conversationToUse: ConversationTurn[]
    ): Promise<TurnStep> => {
        const step = turn.steps[turn.steps.length - 1];
        const provider = new LLMProvider(overrideSettings || settings, app);

        for await (const chunk of provider.callLLM(conversationToUse)) {
            if (abortController.signal.aborted) {
                throw new Error(ABORT_ERROR_MESSAGE);
            }
            processStreamChunk(chunk, step, callback);
        }

        return step;
    }, [settings, app, processStreamChunk]);

    const shouldContinueToNextStep = useCallback((step: TurnStep, stepsLeft: number): boolean => {
        const toolCallsNeeded = Object.values(step.toolCalls).filter(tool => !tool.is_server_call);
        return toolCallsNeeded.length > 0 && stepsLeft > 0;
    }, []);

    const streamTurnResponse = useCallback(async (params: StreamTurnParams): Promise<void> => {
        const { turn, callback, stepsLeft = MAX_TURN_STEPS, overrideSettings, currentConversation } = params;
        let { abortController } = params;

        if (!abortController) {
            abortController = new AbortController();
            turnAbortControllers.current.set(turn.id, abortController);
        }

        callback?.({ type: 'step_start', turn });

        try {
            const conversationToUse = currentConversation || conversation;
            const completedStep = await streamSingleStep(turn, callback, abortController, overrideSettings, conversationToUse);

            if (shouldContinueToNextStep(completedStep, stepsLeft)) {
                const newStep = createEmptyStep();
                turn.steps.push(newStep);
                callback?.({ type: 'step_complete', step: completedStep });

                await streamTurnResponse({
                    turn,
                    callback,
                    stepsLeft: stepsLeft - 1,
                    abortController,
                    overrideSettings,
                    currentConversation: conversationToUse
                });
            } else {
                turn.isComplete = true;
                callback?.({ type: 'turn_complete', turn });
            }
        } catch (error) {
            turn.error = error.name === 'AbortError' ? ABORT_ERROR_MESSAGE : error.message;
            turn.isComplete = true;
            callback?.({ type: 'error', error: turn.error, turn });
        } finally {
            turnAbortControllers.current.delete(turn.id);
        }

        // Note: History saving is now handled by the parent component that uses useHistoryManager
    }, [conversationId, title, conversation, streamSingleStep, shouldContinueToNextStep, createEmptyStep]);

    const newConversationRound = useCallback(async (params: NewRoundParams): Promise<ConversationTurn> => {
        if (isInferenceRunning) {
            throw new Error('Inference is already running. Please wait for it to complete or cancel it first.');
        }

        const userInput = createUserInput(params);
        const turn = createConversationTurn(userInput);

        const newConversation = [...conversation, turn];
        setConversation(newConversation);
        params.callback?.({ type: 'turn_start', turn });

        await streamTurnResponse({
            turn,
            callback: params.callback,
            overrideSettings: params.overrideSettings,
            abortController: params.abortController,
            currentConversation: newConversation
        });

        return turn;
    }, [isInferenceRunning, createUserInput, createConversationTurn, streamTurnResponse]);

    const findAndRemoveTurnFromHistory = useCallback((turnId: string): ConversationTurn => {
        const turnIndex = conversation.findIndex(t => t.id === turnId);
        if (turnIndex === -1) {
            throw new Error(`Turn with ID ${turnId} not found in conversation history`);
        }

        const originalTurn = conversation[turnIndex];
        setConversation(prev => prev.slice(0, turnIndex));
        return originalTurn;
    }, [conversation]);

    const rerunConversationTurn = useCallback(async (params: RerunTurnParams): Promise<ConversationTurn> => {
        const originalTurn = findAndRemoveTurnFromHistory(params.turnId);
        cancelInference();

        return newConversationRound({
            prompt: params.prompt ?? originalTurn.userInput.prompt,
            files: params.files ?? originalTurn.userInput.files,
            callback: params.callback,
            overrideSettings: params.overrideSettings
        });
    }, [findAndRemoveTurnFromHistory, cancelInference, newConversationRound]);

    const loadHistory = useCallback((history: History) => {
        setConversation(history.conversation || []);
        setConversationId(history.id);
        setTitle(history.title || '');
        cancelInference(); // Cancel any running inference when loading new history
    }, [cancelInference]);

    const clearConversation = useCallback(() => {
        cancelInference();
        setConversation([]);
        setConversationId(generateUUID());
        setTitle('');
    }, [cancelInference]);

    const toHistory = useCallback((): History => {
        return {
            id: conversationId,
            title,
            conversation
        };
    }, [conversationId, title, conversation]);

    return {
        conversation,
        conversationId,
        title,
        isInferenceRunning,
        newConversationRound,
        rerunConversationTurn,
        cancelInference,
        cancelTurn,
        loadHistory,
        clearConversation,
        toHistory
    };
}