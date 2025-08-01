import React, { useState, useEffect, useCallback } from 'react';
import { ConversationTurn, NotesCriticSettings } from 'types';
import { FeedbackDisplayReact } from 'views/components/FeedbackDisplay';
import { ChatInputReact } from 'views/components/ChatInput';
import { ControlPanelReact } from 'views/components/ControlPanel';
import { useConversationContext } from 'hooks/useConversationContext';
import { useHistoryContext } from 'hooks/useHistoryContext';

interface ChatViewComponentProps {
    // External event handlers that still need to be handled by ChatView
    onFeedback: () => void;
    onChunkReceived?: (chunk: any, turn: ConversationTurn) => void;
    onTriggerFeedbackMessage?: (feedbackFunction: (prompt: string, files?: any[], overrideSettings?: NotesCriticSettings) => Promise<void>) => void;
}

const MainChatInput = ({onSend, conversation, cancelInference, onRestorePrompt, fullConversation}: {
    onSend: (message: string) => void;
    conversation: ConversationTurn[];
    cancelInference: () => void;
    onRestorePrompt: (callback: (prompt: string) => void) => void;
    fullConversation: ConversationTurn[];
}) => {
    const [chatInputValue, setChatInputValue] = useState('');
    const [lastSentPrompt, setLastSentPrompt] = useState('');
    
    // Register the restore prompt callback
    useEffect(() => {
        onRestorePrompt((prompt: string) => {
            setChatInputValue(prompt);
        });
    }, [onRestorePrompt]);

    const handleSend = async (message: string) => {
        setLastSentPrompt(message); // Remember the last sent prompt
        setChatInputValue('');
        onSend(message);
    }

    const handleCancel = () => {
        // First try to find the most recent turn from the full conversation
        const lastTurn = fullConversation[fullConversation.length - 1];
        
        // If the last turn has no meaningful content, restore its prompt
        if (lastTurn && (!lastTurn.steps.length || !lastTurn.steps.some(step => 
            step.content || step.thinking || Object.keys(step.toolCalls).length > 0
        ))) {
            setChatInputValue(lastTurn.userInput.prompt);
        } else if (lastSentPrompt) {
            // Fallback to the last sent prompt we remembered
            setChatInputValue(lastSentPrompt);
            setLastSentPrompt(''); // Clear it after using
        } else {
            setChatInputValue('');
        }
        cancelInference();
    };

    return (
        <ChatInputReact
            initialValue={chatInputValue}
            onSend={handleSend}
            onCancel={handleCancel}
        />
    )
}

export const ChatViewComponent: React.FC<ChatViewComponentProps> = ({
    onFeedback,
    onChunkReceived,
    onTriggerFeedbackMessage,
}) => {
    const { 
        conversation,
        fullConversation,
        isInferenceRunning,
        newConversationRound, 
        rerunConversationTurn, 
        clearConversation,
        cancelInference,
        setOnTurnCancelledWithoutContent,
        conversationId,
        title,
        toHistory,
        setTitle
    } = useConversationContext();
    
    const { saveHistory, listHistory } = useHistoryContext();
    
    // Auto-save conversation when turns are completed
    const handleTurnComplete = useCallback(async (turn: ConversationTurn) => {
        try {
            // Allow React state updates to complete
            await new Promise(resolve => setTimeout(resolve, 50));
            
            let history = toHistory();
            
            // Ensure the completed turn is included in the conversation
            if (!history.conversation || history.conversation.length === 0) {
                // Build conversation from existing turns plus the completed turn
                const existingTurns = fullConversation.filter(t => t.id !== turn.id);
                history = {
                    ...history,
                    conversation: [...existingTurns, turn]
                };
            }
            
            // Save and update title
            const newTitle = await saveHistory(history);
            setTitle(newTitle);
            
            // Update the dropdown list
            await listHistory();
        } catch (error) {
            console.error('Failed to auto-save conversation:', error);
        }
    }, [toHistory, saveHistory, setTitle, fullConversation, listHistory]);
    
    // Handle feedback messages from parent
    const sendFeedbackMessage = useCallback(async (prompt: string, files?: any[], overrideSettings?: NotesCriticSettings) => {
        try {
            await newConversationRound({
                prompt,
                files,
                overrideSettings,
                callback: (chunk) => {
                    if (chunk.type === 'turn_complete' && chunk.turn) {
                        handleTurnComplete(chunk.turn);
                    }
                    onChunkReceived?.(chunk, chunk.turn!);
                }
            });
        } catch (error) {
            console.error('Error sending feedback message:', error);
        }
    }, [newConversationRound, onChunkReceived, handleTurnComplete]);

    // Expose feedback message function to parent
    useEffect(() => {
        onTriggerFeedbackMessage?.(sendFeedbackMessage);
    }, [sendFeedbackMessage, onTriggerFeedbackMessage]);

    // Handle restoring prompts when turns are cancelled without content
    const handleRestorePrompt = useCallback((callback: (prompt: string) => void) => {
        setOnTurnCancelledWithoutContent(callback);
    }, [setOnTurnCancelledWithoutContent]);

    const handleSend = async (message: string) => {
        try {
            await newConversationRound({
                prompt: message,
                callback: (chunk) => {
                    if (chunk.type === 'turn_complete' && chunk.turn) {
                        handleTurnComplete(chunk.turn);
                    }
                    onChunkReceived?.(chunk, chunk.turn!);
                }
            });
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    const handleRerun = async (turn: ConversationTurn, newMessage?: string) => {
        try {
            await rerunConversationTurn({
                turnId: turn.id,
                prompt: newMessage,
                callback: (chunk) => {
                    if (chunk.type === 'turn_complete' && chunk.turn) {
                        handleTurnComplete(chunk.turn);
                    }
                    onChunkReceived?.(chunk, chunk.turn!);
                }
            });
        } catch (error) {
            console.error('Error rerunning turn:', error);
        }
    };

    const handleClear = () => {
        clearConversation();
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            // Cancel current inference instead of sending a message
            const lastTurn = conversation[conversation.length - 1];
            if (lastTurn && !lastTurn.isComplete) {
                cancelInference();
            }
        }
    };

    return (
        <div className="nc-flex nc-flex-col nc-h-full" onKeyDown={handleKeyDown}>
            <div className="nc-p-3 nc-border-b">
                <ControlPanelReact
                    onFeedback={onFeedback}
                    onClear={handleClear}
                />
            </div>
            
            <FeedbackDisplayReact 
                conversation={conversation}
                isInferenceRunning={isInferenceRunning}
                onRerun={handleRerun} 
            />
            
            <MainChatInput 
                onSend={handleSend} 
                conversation={conversation}
                fullConversation={fullConversation}
                cancelInference={cancelInference}
                onRestorePrompt={handleRestorePrompt}
            />
        </div>
    );
};