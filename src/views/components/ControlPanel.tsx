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
    const { history, historyList, listHistory, loadHistory: loadHistoryFromFile } = useHistoryManager();
    const { conversationId, loadHistory: loadHistoryIntoConversation } = useConversationContext();
    
    // Load history list on mount
    React.useEffect(() => {
        listHistory();
    }, [listHistory]);

    return (
        <>
            <select 
                className="notes-critic-history-select"
                value={conversationId}
                onChange={async (e) => {
                    const historyId = e.target.value;
                    if (historyId) {
                        const fullHistory = await loadHistoryFromFile(historyId);
                        if (fullHistory) {
                            loadHistoryIntoConversation(fullHistory);
                        }
                    }
                }}
            >
                {/* Show "New Conversation" when cleared or not in saved history */}
                {(!conversationId || !history.has(conversationId)) && (
                    <option key="new" value={conversationId || ''}>
                        New Conversation
                    </option>
                )}
                {historyList.map(item => (
                    <option key={item.id} value={item.id}>
                        {item.title || item.id}
                    </option>
                ))}
            </select>
            
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
        </>
    );
};