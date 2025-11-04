import React, { useState, useEffect, useCallback } from 'react';
import { ConversationTurn, NotesCriticSettings, UserInput, LLMFile } from 'types';
import { Vault } from 'obsidian';
import { loadLLMFileContent } from './FilePicker';
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
    onTriggerFileFeedbackMessage?: (fileFeedbackFunction: (filename: string, diff: string, prompt: string, files?: any[], overrideSettings?: NotesCriticSettings) => Promise<void>) => void;
    vault?: Vault;
}

const MainChatInput = ({onSend, conversation, cancelInference, onRestorePrompt, fullConversation, vault}: {
    onSend: (message: string, files?: LLMFile[]) => void;
    conversation: ConversationTurn[];
    cancelInference: () => void;
    onRestorePrompt: (callback: (prompt: string) => void) => void;
    fullConversation: ConversationTurn[];
    vault?: Vault;
}) => {
    const [chatInputValue, setChatInputValue] = useState('');
    const [lastSentPrompt, setLastSentPrompt] = useState('');
    
    // Register the restore prompt callback
    useEffect(() => {
        onRestorePrompt((prompt: string) => {
            setChatInputValue(prompt);
        });
    }, [onRestorePrompt]);

    const handleSend = async (message: string, files?: LLMFile[]) => {
        setLastSentPrompt(message); // Remember the last sent prompt
        setChatInputValue('');
        onSend(message, files);
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
            vault={vault}
        />
    )
}

export const ChatViewComponent: React.FC<ChatViewComponentProps> = ({
    onFeedback,
    onChunkReceived,
    onTriggerFeedbackMessage,
    onTriggerFileFeedbackMessage,
    vault,
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
    const sendFeedbackMessage = useCallback(async (prompt: string, files?: LLMFile[], overrideSettings?: NotesCriticSettings) => {
        try {
            // Lazy load file contents if files are provided
            let loadedFiles: LLMFile[] = [];
            if (files && vault) {
                for (const file of files) {
                    const loaded = await loadLLMFileContent(vault, file);
                    loadedFiles.push(...loaded);
                }
                
                // Remove duplicates based on path
                const uniqueFiles = loadedFiles.filter((file, index, self) => 
                    index === self.findIndex(f => f.path === file.path)
                );
                loadedFiles = uniqueFiles;
            }
            
            await newConversationRound({
                prompt,
                files: loadedFiles.length > 0 ? loadedFiles : undefined,
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
    }, [newConversationRound, onChunkReceived, handleTurnComplete, vault]);

    // Handle file change feedback with structured diff display
    const sendFileFeedbackMessage = useCallback(async (
        filename: string, 
        diff: string, 
        prompt: string, 
        files?: LLMFile[], 
        overrideSettings?: NotesCriticSettings
    ) => {
        try {
            // Lazy load file contents if files are provided
            let loadedFiles: LLMFile[] = [];
            if (files && vault) {
                for (const file of files) {
                    const loaded = await loadLLMFileContent(vault, file);
                    loadedFiles.push(...loaded);
                }
                
                // Remove duplicates based on path
                const uniqueFiles = loadedFiles.filter((file, index, self) => 
                    index === self.findIndex(f => f.path === file.path)
                );
                loadedFiles = uniqueFiles;
            }
            
            const userInput: UserInput = {
                type: 'file_change',
                filename,
                diff,
                prompt,
                files: loadedFiles.length > 0 ? loadedFiles : undefined
            };

            await newConversationRound({
                prompt, // Still need prompt for LLM processing
                files: loadedFiles.length > 0 ? loadedFiles : undefined,
                overrideSettings,
                userInput, // Pass structured user input
                callback: (chunk) => {
                    if (chunk.type === 'turn_complete' && chunk.turn) {
                        handleTurnComplete(chunk.turn);
                    }
                    onChunkReceived?.(chunk, chunk.turn!);
                }
            });
        } catch (error) {
            console.error('Error sending file feedback message:', error);
        }
    }, [newConversationRound, onChunkReceived, handleTurnComplete, vault]);

    // Expose feedback message functions to parent
    useEffect(() => {
        onTriggerFeedbackMessage?.(sendFeedbackMessage);
    }, [sendFeedbackMessage, onTriggerFeedbackMessage]);

    useEffect(() => {
        onTriggerFileFeedbackMessage?.(sendFileFeedbackMessage);
    }, [sendFileFeedbackMessage, onTriggerFileFeedbackMessage]);

    // Handle restoring prompts when turns are cancelled without content
    const handleRestorePrompt = useCallback((callback: (prompt: string) => void) => {
        setOnTurnCancelledWithoutContent(callback);
    }, [setOnTurnCancelledWithoutContent]);

    const handleSend = async (message: string, files?: LLMFile[]) => {
        try {
            // Lazy load file contents before sending
            let loadedFiles: LLMFile[] = [];
            if (files && vault) {
                for (const file of files) {
                    const loaded = await loadLLMFileContent(vault, file);
                    loadedFiles.push(...loaded);
                }
                
                // Remove duplicates based on path
                const uniqueFiles = loadedFiles.filter((file, index, self) => 
                    index === self.findIndex(f => f.path === file.path)
                );
                loadedFiles = uniqueFiles;
            }
            
            await newConversationRound({
                prompt: message,
                files: loadedFiles.length > 0 ? loadedFiles : undefined,
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

    const scrollContainerRef = React.useRef<HTMLDivElement>(null);

    return (
        <div className="nc-flex nc-flex-col nc-h-full" onKeyDown={handleKeyDown}>
            <div ref={scrollContainerRef} className="nc-flex-1 nc-overflow-y-auto nc-min-h-0">
                <div className="nc-sticky nc-top-0 nc-z-10 nc-bg-primary nc-p-3 nc-border-b">
                    <ControlPanelReact
                        onFeedback={onFeedback}
                        onClear={handleClear}
                    />
                </div>
                
                <FeedbackDisplayReact 
                    conversation={conversation}
                    isInferenceRunning={isInferenceRunning}
                    onRerun={handleRerun}
                    scrollContainerRef={scrollContainerRef}
                />
            </div>
            
            <MainChatInput 
                onSend={handleSend} 
                conversation={conversation}
                fullConversation={fullConversation}
                cancelInference={cancelInference}
                onRestorePrompt={handleRestorePrompt}
                vault={vault}
            />
        </div>
    );
};