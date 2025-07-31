import React, { useState, useEffect, useCallback } from 'react';
import { ConversationTurn, NotesCriticSettings } from 'types';
import { FeedbackDisplayReact } from 'views/components/FeedbackDisplay';
import { ChatInputReact } from 'views/components/ChatInput';
import { ControlPanelReact } from 'views/components/ControlPanel';
import { useConversationContext } from 'hooks/useConversationContext';

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
        console.log('Registering restore prompt callback');
        onRestorePrompt((prompt: string) => {
            console.log('Restore prompt callback called with:', prompt);
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
        console.log('Manual cancel - lastTurn:', lastTurn);
        console.log('Manual cancel - lastSentPrompt:', lastSentPrompt);
        
        // If the last turn has no meaningful content, restore its prompt
        if (lastTurn && (!lastTurn.steps.length || !lastTurn.steps.some(step => 
            step.content || step.thinking || Object.keys(step.toolCalls).length > 0
        ))) {
            console.log('Restoring prompt from last turn:', lastTurn.userInput.prompt);
            setChatInputValue(lastTurn.userInput.prompt);
        } else if (lastSentPrompt) {
            // Fallback to the last sent prompt we remembered
            console.log('Restoring prompt from lastSentPrompt:', lastSentPrompt);
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
        conversationId
    } = useConversationContext();
    
    // Handle feedback messages from parent
    const sendFeedbackMessage = useCallback(async (prompt: string, files?: any[], overrideSettings?: NotesCriticSettings) => {
        try {
            await newConversationRound({
                prompt,
                files,
                overrideSettings,
                callback: (chunk) => {
                    onChunkReceived?.(chunk, chunk.turn!);
                }
            });
        } catch (error) {
            console.error('Error sending feedback message:', error);
        }
    }, [newConversationRound, onChunkReceived]);

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
        <div className="notes-critic-chat-view" onKeyDown={handleKeyDown}>
            <div className="notes-critic-header-container">
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