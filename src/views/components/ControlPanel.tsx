import React from 'react';
import { useHistoryContext } from 'hooks/useHistoryContext';
import { useConversationContext } from 'hooks/useConversationContext';

interface ControlPanelReactProps {
    onFeedback: () => void;
    onClear: () => void;
}

export const ControlPanelReact: React.FC<ControlPanelReactProps> = ({
    onFeedback,
    onClear,
}) => {
    const { history, historyList, listHistory, loadHistory: loadHistoryFromFile, deleteHistory } = useHistoryContext();
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
        <div className="nc-flex nc-items-center nc-gap-2 nc-w-full nc-max-w-full">
            <div className="nc-relative nc-flex-1 nc-min-w-0">
                {/* Dropdown button */}
                <button
                    className="nc-btn nc-w-full nc-text-left nc-justify-between nc-border nc-rounded nc-bg-primary nc-text-normal nc-py-2 nc-px-3 nc-min-w-0"
                    onClick={(e) => {
                        e.stopPropagation();
                        setIsOpen(!isOpen);
                    }}
                >
                    <span className="nc-truncate nc-mr-2 nc-flex-shrink nc-min-w-0">{displayText}</span>
                </button>

                {/* Dropdown menu */}
                {isOpen && (
                    <div className="nc-absolute nc-w-full nc-bg-primary nc-border nc-rounded nc-shadow-md nc-overflow-y-auto nc-top-full nc-left-0 nc-z-1000 nc-max-h-48">
                        {/* New Conversation option */}
                        <div
                            className={`nc-px-3 nc-py-2 nc-cursor-pointer nc-interactive ${historyList.length > 0 ? 'nc-border-b' : ''}`}
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
                                className="nc-relative nc-px-3 nc-py-2 nc-cursor-pointer nc-interactive nc-flex nc-items-center nc-min-h-8"
                                onMouseEnter={() => setHoveredItem(item.id)}
                                onMouseLeave={() => setHoveredItem(null)}
                                onClick={() => handleSelectHistory(item.id)}
                            >
                                <span className="nc-flex-1 nc-truncate nc-pr-8">
                                    {item.title || item.id}
                                </span>
                                
                                {/* Delete button - positioned absolutely to overlay */}
                                {hoveredItem === item.id && (
                                    <button
                                        className="nc-btn nc-btn--danger nc-btn--xs nc-absolute nc-right-2 nc-top-1/2 nc--translate-y-1/2 nc-z-1"
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
            
            <div className="nc-flex nc-gap-2 nc-flex-shrink-0">
                <button
                    className="nc-btn nc-btn--secondary nc-btn--base"
                    title="Get Feedback"
                    onClick={onFeedback}
                >
                    💬
                </button>
                <button
                    className="nc-btn nc-btn--secondary nc-btn--base"
                    title="Clear Current"
                    onClick={onClear}
                >
                    🗑️
                </button>
            </div>
        </div>
    );
};