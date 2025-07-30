import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ConversationTurn, UserInput, TurnStep, TurnChunk } from 'types';
import { ChatInputReact } from 'views/components/ChatInput';
import { formatJson } from 'views/formatters';
import { FileChangeViewer } from 'views/components/FileChangeViewer';
import { ChatMessage } from 'views/components/ChatMessage';
import { ManualFeedbackViewer } from 'views/components/ManualFeedbackViewer';

const CSS_CLASSES = {
    messages: 'notes-critic-messages',
    stepContainer: 'notes-critic-step-container',
    detailsSection: 'notes-critic-details-section',
    userInputElement: 'notes-critic-user-input-element',
    userInputContent: 'notes-critic-user-input-content',
    aiResponseElement: 'notes-critic-ai-response-element',
    responseContent: 'notes-critic-response-content',
    thinkingContent: 'notes-critic-thinking-content',
    toolCallContent: 'notes-critic-tool-call-content',
    signatureContent: 'notes-critic-signature-content',
    blockContent: 'notes-critic-block-content',
    timestamp: 'notes-critic-timestamp',
    rerunButton: 'notes-critic-rerun-button',
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
    onRerun?: (turn: ConversationTurn, newMessage?: string) => void;
    isStreaming?: boolean;
    currentTurnId?: string;
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
                        className={turn.userInput.type === 'chat_message' && onRerun ? 'notes-critic-editable' : ''}
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
        <span className="processing-dots">{message}</span>
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
                    <pre className={CSS_CLASSES.thinkingContent}>
                        {chunk.content || ''}{shouldShowCursor && '▋'}
                    </pre>
                </DetailsSection>
            );
        
        case 'content':
            return (
                <pre className={CSS_CLASSES.responseContent}>
                    {chunk.content || ''}{shouldShowCursor && '▋'}
                </pre>
            );
        
        case 'tool_call':
        case 'tool_call_result':
            if (!chunk.toolCall) return null;
            const toolCall = chunk.toolCall;
            const title = chunk.toolCall.result ? 
                toolCall.name : 
                <span>calling {toolCall.name} <span className="processing-dots"></span></span>;
            
            return (
                <DetailsSection title={title}>
                    <div className={CSS_CLASSES.toolCallContent}>
                        <div>
                            <strong>Input:</strong><br />
                            <pre><code>{formatJson(toolCall.input)}</code></pre>
                        </div>
                        {chunk.toolCall.result && (
                            <div>
                                <strong>Result:</strong><br />
                                <pre><code>{formatJson(chunk.toolCall.result)}</code></pre>
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

    return (
        <div className={CSS_CLASSES.aiResponseElement}>
            {!turn.steps.length  && <ProcessingIndicator message="Processing" />}
            
            {turn.steps.map((step, index) => (
                    <StepElement
                        key={index}
                        step={step}
                        streamingState={getStreamingState(step, index, turn.steps.length)}
                    />
            ))}
            
            {turn.error && (
                <div className={CSS_CLASSES.responseContent}>
                    <span className="notes-critic-error-message">
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
    onRerun,
    isStreaming = false,
    currentTurnId
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
                        isStreaming={isStreaming && turn.id === currentTurnId}
                        onRerun={onRerun}
                    />
                </React.Fragment>
            ))}
        </div>
    );
};

