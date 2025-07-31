import React from 'react';
import { useHistoryManager } from 'hooks/useHistoryManager';
import { useConversationContext } from 'hooks/useConversationContext';

interface ControlPanelReactProps {
    onFeedback: () => void;
    onClear: () => void;
}

export const ControlPanelReact: React.FC<ControlPanelReactProps> = ({
    onFeedback,
    onClear,
}) => {
    const { history, historyList, listHistory, loadHistory: loadHistoryFromFile, deleteHistory } = useHistoryManager();
    const { conversationId, loadHistory: loadHistoryIntoConversation, clearConversation } = useConversationContext();
    const [isOpen, setIsOpen] = React.useState(false);
    const [hoveredItem, setHoveredItem] = React.useState<string | null>(null);
    
    // Load history list on mount
    React.useEffect(() => {
        listHistory();
    }, [listHistory]);

    // Close dropdown when clicking outside
    React.useEffect(() => {
        const handleClickOutside = () => setIsOpen(false);
        if (isOpen) {
            document.addEventListener('click', handleClickOutside);
            return () => document.removeEventListener('click', handleClickOutside);
        }
    }, [isOpen]);

    const handleSelectHistory = async (historyId: string) => {
        if (historyId) {
            const fullHistory = await loadHistoryFromFile(historyId);
            if (fullHistory) {
                loadHistoryIntoConversation(fullHistory);
            }
        }
        setIsOpen(false);
    };

    const handleDeleteHistory = async (e: React.MouseEvent, historyId: string) => {
        e.stopPropagation();
        
        // If we're deleting the currently loaded conversation, clear it
        if (historyId === conversationId) {
            clearConversation();
        }
        
        await deleteHistory(historyId);
    };

    // Get current selection display text
    const currentSelection = conversationId && history.has(conversationId) 
        ? historyList.find(item => item.id === conversationId)
        : null;
    const displayText = currentSelection?.title || currentSelection?.id || 'New Conversation';

    return (
        <div className="notes-critic-control-panel">
            <div className="notes-critic-history-dropdown">
                {/* Dropdown button */}
                <button
                    className="notes-critic-history-select"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(!isOpen);
                    }}
                >
                    <span>{displayText}</span>
                </button>

                {/* Dropdown menu */}
                {isOpen && (
                    <div className="notes-critic-history-dropdown-menu">
                        {/* New Conversation option */}
                        <div
                            className={`notes-critic-history-new-conversation ${historyList.length === 0 ? 'no-border' : ''}`}
                            onClick={() => {
                                clearConversation();
                                setIsOpen(false);
                            }}
                        >
                            New Conversation
                        </div>

                        {/* History items */}
                        {historyList.map(item => (
                            <div
                                key={item.id}
                                className="notes-critic-history-item"
                                onMouseEnter={() => setHoveredItem(item.id)}
                                onMouseLeave={() => setHoveredItem(null)}
                                onClick={() => handleSelectHistory(item.id)}
                            >
                                <span className="notes-critic-history-item-text">
                                    {item.title || item.id}
                                </span>
                                
                                {/* Delete button - positioned absolutely to overlay */}
                                {hoveredItem === item.id && (
                                    <button
                                        className="notes-critic-history-delete-button"
                                        onClick={(e) => handleDeleteHistory(e, item.id)}
                                        title="Delete this history item"
                                    >
                                        🗑️
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            <div className="notes-critic-controls">
                <button
                    className="notes-critic-icon-button"
                    title="Get Feedback"
                    onClick={onFeedback}
                >
                    💬
                </button>
                <button
                    className="notes-critic-icon-button"
                    title="Clear Current"
                    onClick={onClear}
                >
                    🗑️
                </button>
            </div>
        </div>
    );
};