import { useState, useCallback, useRef, useEffect } from 'react';
import { ConversationTurn, UserInput, TurnStep, LLMStreamChunk, NotesCriticSettings, LLMFile, TurnChunk } from 'types';
import { LLMProvider } from 'llm/llmProvider';
import { History } from 'hooks/useHistoryManager';
import { useApp, useSettings } from './useSettings';
import { TokenTracker } from '../services/TokenTracker';

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
    userInput?: UserInput; // Allow passing custom user input
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
    fullConversation: ConversationTurn[];
    conversationId: string;
    title: string;
    isInferenceRunning: boolean;
    newConversationRound: (params: NewRoundParams) => Promise<ConversationTurn>;
    rerunConversationTurn: (params: RerunTurnParams) => Promise<ConversationTurn>;
    cancelInference: (preserveContent?: boolean) => void;
    cancelTurn: (turnId: string, preserveContent?: boolean) => void;
    loadHistory: (history: History) => void;
    clearConversation: () => void;
    toHistory: () => History;
    setTitle: (title: string) => void;
    onTurnCancelledWithoutContent?: (prompt: string) => void;
    setOnTurnCancelledWithoutContent: (callback: ((prompt: string) => void) | undefined) => void;
}

export function useConversationManager(): UseConversationManagerReturn {
    const app = useApp();
    const { settings } = useSettings();
    const [conversation, setConversation] = useState<ConversationTurn[]>([]);
    const [conversationId, setConversationId] = useState<string>(generateUUID());
    const [title, setTitle] = useState<string>('');

    const [isInferenceRunning, setIsInferenceRunning] = useState(false);
    const turnAbortControllers = useRef(new Map<string, AbortController>());
    const preserveContentOnCancel = useRef(new Set<string>());
    const turnsToIgnoreInErrorHandler = useRef(new Set<string>());
    const [onTurnCancelledWithoutContent, setOnTurnCancelledWithoutContent] = useState<((prompt: string) => void) | undefined>();
    
    // Remove auto-save for now to avoid circular dependency issues
    // TODO: Re-implement auto-save after fixing the circular dependency

    const createUserInput = useCallback(({ prompt, files, userInput }: Pick<NewRoundParams, 'prompt' | 'files' | 'userInput'>): UserInput => {
        // If custom userInput is provided, use it
        if (userInput) {
            return userInput;
        }
        
        // Default to chat_message type
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

    const cancelTurn = useCallback((turnId: string, preserveContent: boolean = false): void => {
        const controller = turnAbortControllers.current.get(turnId);
        if (!controller) return;

        const turn = conversation.find(t => t.id === turnId);
        
        if (preserveContent && turn) {
            // Check if there's meaningful content before deciding to preserve
            const hasContent = turn.steps.some(step => 
                step.content || 
                step.thinking || 
                Object.keys(step.toolCalls).length > 0 ||
                (step.chunks && step.chunks.some(chunk => chunk.content && chunk.type !== 'done'))
            );
            
            if (hasContent) {
                // Mark this turn ID for content preservation before aborting
                preserveContentOnCancel.current.add(turnId);
            } else {
                // No meaningful content, remove immediately
                turnsToIgnoreInErrorHandler.current.add(turnId);
                
                // Notify that a turn was cancelled without content so UI can restore the prompt
                if (onTurnCancelledWithoutContent && turn) {
                    onTurnCancelledWithoutContent(turn.userInput.prompt);
                }
                
                setConversation(prev => prev.filter(t => t.id !== turnId));
            }
        }

        controller.abort();
        turnAbortControllers.current.delete(turnId);
        setIsInferenceRunning(turnAbortControllers.current.size > 0);

        if (turn && !preserveContent) {
            // Only remove empty steps if not preserving content
            removeEmptyCurrentStep(turn);
        }
    }, [conversation, removeEmptyCurrentStep]);

    const cancelInference = useCallback((preserveContent: boolean = false): void => {
        for (const turnId of turnAbortControllers.current.keys()) {
            cancelTurn(turnId, preserveContent);
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
            case 'usage':
                // Handle token usage tracking
                if (chunk.tokenUsage) {
                    // Get the plugin instance from app to access tokenTracker
                    const plugin = (app as any).plugins?.plugins?.['notes-critic'];
                    if (plugin?.tokenTracker) {
                        plugin.tokenTracker.addUsage(conversation.id, chunk.tokenUsage);
                    }
                }
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
            setIsInferenceRunning(true);
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
            // Check if this turn should be ignored (was removed due to no content)
            const shouldIgnore = turnsToIgnoreInErrorHandler.current.has(turn.id);
            
            if (shouldIgnore) {
                return; // Early return, don't process this error
            }
            
            // Check if this turn should preserve content on cancellation
            const shouldPreserveContent = preserveContentOnCancel.current.has(turn.id);
            
            if (shouldPreserveContent) {
                // Check if there's actually meaningful content to preserve
                const hasContent = turn.steps.some(step => 
                    step.content || 
                    step.thinking || 
                    Object.keys(step.toolCalls).length > 0 ||
                    (step.chunks && step.chunks.some(chunk => chunk.content && chunk.type !== 'done'))
                );
                
                if (hasContent) {
                    // This was cancelled with preserve content and has meaningful content
                    turn.isComplete = true;
                    callback?.({ type: 'turn_complete', turn });
                } else {
                    // No meaningful content - turn should have been removed already by cancelTurn
                    // Don't add error or do anything, just let it be cleaned up
                }
            } else {
                // Check if turn still exists in conversation (it might have been removed by cancelTurn)
                setConversation(prev => {
                    const stillExists = prev.some(t => t.id === turn.id);
                    if (stillExists && !turn.isComplete) {
                        // Regular error or cancelled without preserve content
                        turn.error = error.name === 'AbortError' ? ABORT_ERROR_MESSAGE : error.message;
                        turn.isComplete = true;
                        callback?.({ type: 'error', error: turn.error, turn });
                    }
                    return prev;
                });
            }
        } finally {
            turnAbortControllers.current.delete(turn.id);
            preserveContentOnCancel.current.delete(turn.id); // Clean up the preserve flag
            // Don't clean up turnsToIgnoreInErrorHandler here - let it persist until the turn is actually removed
            setIsInferenceRunning(turnAbortControllers.current.size > 0);
        }

        // Note: History saving is now handled by the parent component that uses useHistoryManager
    }, [conversationId, title, conversation, streamSingleStep, shouldContinueToNextStep, createEmptyStep]);

    const newConversationRound = useCallback(async (params: NewRoundParams): Promise<ConversationTurn> => {
        // If inference is running, cancel it but keep the generated content
        if (isInferenceRunning) {
            cancelInference(true); // preserveContent = true
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
    }, [isInferenceRunning, createUserInput, createConversationTurn, streamTurnResponse, conversation]);


    const rerunConversationTurn = useCallback(async (params: RerunTurnParams): Promise<ConversationTurn> => {
        // First get the turn index and calculate the truncated conversation
        const turnIndex = conversation.findIndex(t => t.id === params.turnId);
        if (turnIndex === -1) {
            throw new Error(`Turn with ID ${params.turnId} not found in conversation history`);
        }

        const originalTurn = conversation[turnIndex];
        const truncatedConversation = conversation.slice(0, turnIndex);
        
        // Update the conversation state
        setConversation(truncatedConversation);
        cancelInference(false);

        const promptToUse = params.prompt ?? originalTurn.userInput.prompt;

        // Create the new turn and add it to the truncated conversation
        const userInput = createUserInput({ prompt: promptToUse, files: params.files ?? originalTurn.userInput.files });
        const turn = createConversationTurn(userInput);

        const newConversation = [...truncatedConversation, turn];
        setConversation(newConversation);
        params.callback?.({ type: 'turn_start', turn });

        await streamTurnResponse({
            turn,
            callback: params.callback,
            overrideSettings: params.overrideSettings,
            currentConversation: newConversation
        });

        return turn;
    }, [conversation, cancelInference, createUserInput, createConversationTurn, streamTurnResponse]);

    const loadHistory = useCallback((history: History) => {
        // Force a clean state update by first clearing, then setting
        setConversation([]);
        setConversationId(history.id);
        setTitle(history.title || '');
        
        // Clear all ignore flags when loading new history
        turnsToIgnoreInErrorHandler.current.clear();
        preserveContentOnCancel.current.clear();
        
        cancelInference(false); // Cancel any running inference when loading new history
        
        // Set conversation after a brief delay to ensure clean state
        setTimeout(() => {
            // Force a completely new array reference to ensure React detects the change
            const newConversation = history.conversation ? [...history.conversation] : [];
            setConversation(newConversation);
        }, 0);
    }, [cancelInference]);

    const clearConversation = useCallback(() => {
        cancelInference(false);
        setConversation([]);
        setConversationId(generateUUID());
        setTitle('');
        
        // Clear all ignore flags when clearing conversation
        turnsToIgnoreInErrorHandler.current.clear();
        preserveContentOnCancel.current.clear();
    }, [cancelInference]);

    const toHistory = useCallback((): History => {
        return {
            id: conversationId,
            title,
            conversation
        };
    }, [conversationId, title, conversation]);

    // Clean up ignore flags for turns that are no longer in conversation
    useEffect(() => {
        const conversationIds = new Set(conversation.map(turn => turn.id));
        const toRemove = Array.from(turnsToIgnoreInErrorHandler.current).filter(id => 
            !conversationIds.has(id)
        );
        toRemove.forEach(id => turnsToIgnoreInErrorHandler.current.delete(id));
    }, [conversation]);

    // Filter out turns that are marked to be ignored in UI
    const visibleConversation = conversation.filter(turn => 
        !turnsToIgnoreInErrorHandler.current.has(turn.id)
    );

    return {
        conversation: visibleConversation,
        fullConversation: conversation,
        conversationId,
        title,
        isInferenceRunning,
        newConversationRound,
        rerunConversationTurn,
        cancelInference,
        cancelTurn,
        loadHistory,
        clearConversation,
        toHistory,
        setTitle,
        onTurnCancelledWithoutContent,
        setOnTurnCancelledWithoutContent
    };
}