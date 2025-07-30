import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ConversationTurn, NotesCriticSettings } from 'types';
import { FeedbackDisplayReact } from 'views/components/FeedbackDisplay';
import { ChatInputReact } from 'views/components/ChatInput';
import { ControlPanelReact } from 'views/components/ControlPanel';
import { History, useHistoryManager } from 'hooks/useHistoryManager';
import { useConversationManager } from 'hooks/useConversationManager';
import { App } from 'obsidian';

interface ChatViewComponentProps {
    settings: NotesCriticSettings;
    app: App;
    initialHistory?: History;
    
    // External event handlers that still need to be handled by ChatView
    onFeedback: () => void;
    onClear: () => void;
    onChunkReceived?: (chunk: any, turn: ConversationTurn) => void;
    onConversationChange?: (conversation: ConversationTurn[]) => void;
    onTriggerFeedbackMessage?: (feedbackFunction: (prompt: string, files?: any[], overrideSettings?: NotesCriticSettings) => Promise<void>) => void;
    
    chatInputRef?: React.RefObject<HTMLTextAreaElement>;
}

export const ChatViewComponent: React.FC<ChatViewComponentProps> = ({
    settings,
    app,
    initialHistory,
    onFeedback,
    onClear,
    onChunkReceived,
    onConversationChange,
    onTriggerFeedbackMessage,
    chatInputRef
}) => {
    const conversationManager = useConversationManager(settings, app, initialHistory);
    const historyManager = useHistoryManager(settings, app);
    const [chatInputValue, setChatInputValue] = useState('');
    
    // Manage selected history internally
    const [selectedHistoryId, setSelectedHistoryId] = useState<string>(
        initialHistory?.id || ''
    );

    // Load history when selectedHistoryId changes
    useEffect(() => {
        if (selectedHistoryId && selectedHistoryId !== conversationManager.conversationId) {
            // Load the selected history item
            historyManager.loadHistory(selectedHistoryId).then(historyItem => {
                if (historyItem) {
                    conversationManager.loadHistory(historyItem);
                }
            });
        }
    }, [selectedHistoryId, conversationManager.conversationId]); // Only depend on the specific values we need

    // Notify parent of conversation changes
    useEffect(() => {
        onConversationChange?.(conversationManager.conversation);
    }, [conversationManager.conversation, onConversationChange]);

    // Update selected history ID when conversation changes (new conversation started or cleared)
    useEffect(() => {
        // Only sync if selectedHistoryId is not empty (we set it to empty when clearing)
        if (selectedHistoryId && conversationManager.conversationId !== selectedHistoryId) {
            setSelectedHistoryId(conversationManager.conversationId);
        }
    }, [conversationManager.conversationId]); // Remove selectedHistoryId from deps to prevent loops

    // Auto-save conversation when it has content (separate effect to avoid loops)
    useEffect(() => {
        const currentHistory = conversationManager.toHistory();
        if (currentHistory.conversation && currentHistory.conversation.length > 0) {
            historyManager.saveHistory(currentHistory);
        }
    }, [conversationManager.conversation.length, conversationManager.title]); // Only trigger on conversation length or title changes

    // Handle feedback messages from parent
    const sendFeedbackMessage = useCallback(async (prompt: string, files?: any[], overrideSettings?: NotesCriticSettings) => {
        try {
            await conversationManager.newConversationRound({
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
    }, [conversationManager, onChunkReceived]);

    // Expose feedback message function to parent
    useEffect(() => {
        onTriggerFeedbackMessage?.(sendFeedbackMessage);
    }, [sendFeedbackMessage, onTriggerFeedbackMessage]);

    const handleSend = async (message: string) => {
        setChatInputValue('');
        try {
            await conversationManager.newConversationRound({
                prompt: message,
                callback: (chunk) => {
                    onChunkReceived?.(chunk, chunk.turn!);
                }
            });
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    const handleCancel = () => {
        const lastTurn = conversationManager.conversation[conversationManager.conversation.length - 1];
        setChatInputValue( !lastTurn.steps.length ? lastTurn.userInput.prompt : "");
        conversationManager.cancelInference();
    };

    const handleRerun = async (turn: ConversationTurn, newMessage?: string) => {
        try {
            await conversationManager.rerunConversationTurn({
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
        conversationManager.clearConversation();
        // Clear selectedHistoryId to prevent loading old history
        setSelectedHistoryId('');
        onClear(); // Also clear file tracking data in ChatView
    };

    const handleLoadHistory = (id: string) => {
        setSelectedHistoryId(id); // This will trigger the useEffect to load the history
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            handleCancel();
        }
    };

    return (
        <div className="notes-critic-chat-view" onKeyDown={handleKeyDown}>
            <div className="notes-critic-header-container">
                <ControlPanelReact
                    settings={settings}
                    app={app}
                    selectedHistoryId={selectedHistoryId}
                    onFeedback={onFeedback}
                    onClear={handleClear}
                    onLoadHistory={handleLoadHistory}
                />
            </div>
            
            <FeedbackDisplayReact
                conversation={conversationManager.conversation}
                onRerun={handleRerun}
                isStreaming={conversationManager.isInferenceRunning}
                currentTurnId={conversationManager.conversation.length > 0 ? 
                    conversationManager.conversation[conversationManager.conversation.length - 1].id : 
                    undefined}
            />
            
            <ChatInputReact
                initialValue={chatInputValue}
                onSend={handleSend}
                onCancel={handleCancel}
                ref={chatInputRef}
            />
        </div>
    );
};