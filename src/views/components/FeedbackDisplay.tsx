import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ConversationTurn, UserInput, TurnStep, TurnChunk } from 'types';
import { ChatInputReact } from 'views/components/ChatInput';
import { formatJson } from 'views/formatters';
import { FileChangeViewer } from 'views/components/FileChangeViewer';
import { ChatMessage } from 'views/components/ChatMessage';
import { ManualFeedbackViewer } from 'views/components/ManualFeedbackViewer';
const CSS_CLASSES = {
    messages: 'nc-flex-1 nc-overflow-y-auto nc-p-4 nc-space-y-3',
    stepContainer: 'nc-space-y-2',
    detailsSection: 'nc-bg-primary-alt nc-rounded nc-p-2',
    userInputElement: 'nc-border nc-rounded-lg nc-p-4 nc-bg-secondary',
    userInputContent: 'nc-mt-1',
    aiResponseElement: 'nc-border nc-rounded-lg nc-p-4 nc-bg-primary-alt nc-relative',
    responseContent: 'nc-whitespace-pre-wrap nc-text-base',
    thinkingContent: 'nc-whitespace-pre-wrap nc-text-xs nc-text-muted nc-italic',
    toolCallContent: 'nc-space-y-1 nc-text-xs nc-text-muted',
    signatureContent: 'nc-text-xs nc-text-muted nc-italic',
    blockContent: 'nc-whitespace-pre-wrap nc-text-base nc-bg-secondary nc-p-2 nc-rounded',
    timestamp: 'nc-text-sm nc-text-muted nc-font-medium nc-mb-2',
    rerunButton: 'nc-btn nc-btn--secondary nc-btn--xs nc-absolute nc-bottom-2 nc-right-2 nc-opacity-30 nc-hover:opacity-80',
} as const;


interface StreamingState {
    isStreaming: boolean;
    isLastStep: boolean;
    hasThinking: boolean;
    hasToolCalls: boolean;
    hasContent: boolean;
}

interface FeedbackDisplayProps {
    conversation: ConversationTurn[];
    isInferenceRunning: boolean;
    onRerun?: (turn: ConversationTurn, newMessage?: string) => void;
}

const FormattedUserInput: React.FC<{ userInput: UserInput }> = ({ userInput }) => {
    switch (userInput.type) {
        case 'file_change':
            return (
                <FileChangeViewer 
                    filename={userInput.filename} 
                    diff={userInput.diff} 
                />
            );
        case 'chat_message':
            return (
                <ChatMessage message={userInput.message} />
            );
        case 'manual_feedback':
            return (
                <ManualFeedbackViewer 
                    filename={userInput.filename} 
                    content={userInput.content} 
                />
            );
        default:
            return null;
    }
};

const UserInputElement: React.FC<{
    turn: ConversationTurn;
    onRerun?: (turn: ConversationTurn, newMessage?: string) => void;
}> = ({ turn, onRerun }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [originalContent, setOriginalContent] = useState('');

    const handleEditClick = () => {
        if (turn.userInput.type === 'chat_message' && onRerun) {
            setOriginalContent(turn.userInput.message);
            setIsEditing(true);
        }
    };

    const handleSend = async (message: string) => {
        setIsEditing(false);
        onRerun?.(turn, message);
    };

    const handleCancel = () => {
        setIsEditing(false);
    };

    return (
        <div className={CSS_CLASSES.userInputElement} data-turn-id={turn.id}>
            <div className={CSS_CLASSES.timestamp}>
                {turn.timestamp.toLocaleTimeString()}
            </div>
            <div className={CSS_CLASSES.userInputContent}>
                {isEditing ? (
                    <ChatInputReact
                        initialValue={turn.userInput.type === 'chat_message' ? turn.userInput.message : ''}
                        showContainer={false}
                        onSend={handleSend}
                        onCancel={handleCancel}
                    />
                ) : (
                    <div
                        className={turn.userInput.type === 'chat_message' && onRerun ? 'nc-cursor-pointer nc-hover:bg-secondary nc-p-1 nc-rounded' : ''}
                        title={turn.userInput.type === 'chat_message' && onRerun ? 'Click to edit' : ''}
                        onClick={handleEditClick}
                    >
                        <FormattedUserInput userInput={turn.userInput} />
                    </div>
                )}
            </div>
        </div>
    );
};

const ProcessingIndicator: React.FC<{ message: string }> = ({ message }) => (
    <div className={CSS_CLASSES.responseContent}>
        <span className="nc-text-muted nc-animate-pulse">{message}...</span>
    </div>
);

const DetailsSection: React.FC<{ title: string | React.ReactNode; children: React.ReactNode }> = ({ title, children }) => (
    <details className={CSS_CLASSES.detailsSection}>
        <summary>{title}</summary>
        {children}
    </details>
);

const ChunkRenderer: React.FC<{
    chunk: TurnChunk;
    shouldShowCursor: boolean;
}> = ({ chunk, shouldShowCursor }) => {
    switch (chunk.type) {
        case 'thinking':
            return (
                <DetailsSection title="Thinking">
                    <div className={CSS_CLASSES.thinkingContent}>
                        {chunk.content || ''}{shouldShowCursor && '▋'}
                    </div>
                </DetailsSection>
            );
        
        case 'content':
            return (
                <div className={CSS_CLASSES.responseContent}>
                    {chunk.content || ''}{shouldShowCursor && '▋'}
                </div>
            );
        
        case 'tool_call':
        case 'tool_call_result':
            if (!chunk.toolCall) return null;
            const toolCall = chunk.toolCall;
            const title = chunk.toolCall.result ? 
                toolCall.name : 
                <span>calling {toolCall.name} <span className="nc-animate-pulse">...</span></span>;
            
            return (
                <DetailsSection title={title}>
                    <div className={CSS_CLASSES.toolCallContent}>
                        <div>
                            <strong className="nc-text-normal">Input:</strong><br />
                            <div className="nc-bg-primary nc-p-2 nc-rounded nc-text-xs nc-mt-1 nc-border nc-overflow-x-auto nc-whitespace-pre-wrap nc-break-words nc-max-w-full"><code>{formatJson(toolCall.input)}</code></div>
                        </div>
                        {chunk.toolCall.result && (
                            <div>
                                <strong className="nc-text-normal">Result:</strong><br />
                                <pre className="nc-bg-primary nc-p-2 nc-rounded nc-text-xs nc-font-mono nc-mt-1 nc-border nc-overflow-x-auto nc-whitespace-pre-wrap nc-break-words nc-max-w-full"><code>{formatJson(chunk.toolCall.result)}</code></pre>
                            </div>
                        )}
                    </div>
                </DetailsSection>
            );
        
        case 'signature':
            return (
                <div className={CSS_CLASSES.signatureContent}>
                    Signature: {chunk.content || ''}{shouldShowCursor && '▋'}
                </div>
            );
        
        case 'block':
            return (
                <pre className={CSS_CLASSES.blockContent}>
                    {chunk.content || ''}{shouldShowCursor && '▋'}
                </pre>
            );
        
        case 'done':
            return null;
        
        default:
            console.warn('Unknown chunk type:', chunk.type);
            return null;
    }
};

const StepElement: React.FC<{
    step: TurnStep;
    streamingState: StreamingState;
}> = ({ step, streamingState }) => {
    if (step.chunks && step.chunks.length > 0) {
        return (
            <div className={CSS_CLASSES.stepContainer}>
                {step.chunks.map((chunk, index) => {
                    const isLastChunk = index === step.chunks!.length - 1;
                    const shouldShowCursor = streamingState.isStreaming && isLastChunk;
                    
                    return (
                        <ChunkRenderer
                            key={index}
                            chunk={chunk}
                            shouldShowCursor={shouldShowCursor}
                        />
                    );
                })}
            </div>
        );
    } else {
        return (
            <div className={CSS_CLASSES.stepContainer}>
                <ProcessingIndicator message="Processing" />
            </div>
        );
    }
};

const AIResponseElement: React.FC<{
    turn: ConversationTurn;
    isStreaming: boolean;
    onRerun?: (turn: ConversationTurn) => void;
}> = ({ turn, isStreaming, onRerun }) => {
    const getStreamingState = (step: TurnStep, index: number, totalSteps: number): StreamingState => ({
        isStreaming: isStreaming && index === totalSteps - 1,
        isLastStep: index === totalSteps - 1,
        hasThinking: !!step.thinking,
        hasToolCalls: Object.keys(step.toolCalls).length > 0,
        hasContent: !!step.content
    });

    const hasContent = turn.steps.some(step => 
        step.content || 
        step.thinking || 
        Object.keys(step.toolCalls).length > 0 ||
        (step.chunks && step.chunks.length > 0)
    );

    // Only show processing indicator for streaming turns, not completed turns without content
    const shouldShowProcessing = !turn.steps.length && isStreaming;

    return (
        <div className={CSS_CLASSES.aiResponseElement}>
            {shouldShowProcessing && <ProcessingIndicator message="Processing" />}
            
            {turn.steps.map((step, index) => (
                    <StepElement
                        key={index}
                        step={step}
                        streamingState={getStreamingState(step, index, turn.steps.length)}
                    />
            ))}
            
            {turn.error && (
                <div className={CSS_CLASSES.responseContent}>
                    <span className="nc-text-danger">
                        Error: {turn.error}
                    </span>
                </div>
            )}
            
            {onRerun && (
                <button
                    className={CSS_CLASSES.rerunButton}
                    aria-label="Rerun response"
                    onClick={() => onRerun(turn)}
                >
                    ↻
                </button>
            )}
        </div>
    );
};

export const FeedbackDisplayReact: React.FC<FeedbackDisplayProps> = ({
    conversation,
    isInferenceRunning,
    onRerun,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [conversation, scrollToBottom]);


    return (
        <div ref={containerRef} className={CSS_CLASSES.messages}>
            {conversation.map(turn => (
                <React.Fragment key={turn.id}>
                    <UserInputElement turn={turn} onRerun={onRerun} />
                    <AIResponseElement
                        turn={turn}
                        isStreaming={isInferenceRunning && !turn.isComplete}
                        onRerun={onRerun}
                    />
                </React.Fragment>
            ))}
        </div>
    );
};

