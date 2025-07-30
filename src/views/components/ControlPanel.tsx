import React, { useState, useEffect } from 'react';
import { History, useHistoryManager } from 'hooks/useHistoryManager';
import { NotesCriticSettings } from 'types';
import { App } from 'obsidian';

interface ControlPanelReactProps {
    settings: NotesCriticSettings;
    app: App;
    selectedHistoryId: string;
    onFeedback: () => void;
    onClear: () => void;
    onLoadHistory: (id: string) => void;
}

export const ControlPanelReact: React.FC<ControlPanelReactProps> = ({
    settings,
    app,
    selectedHistoryId,
    onFeedback,
    onClear,
    onLoadHistory
}) => {
    const historyManager = useHistoryManager(settings, app);
    const [history, setHistory] = useState<History[]>([]);

    // Load history list only once
    useEffect(() => {
        const loadHistory = async () => {
            const historyList = await historyManager.listHistory();
            setHistory(historyList);
        };
        
        loadHistory();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Load only once on mount
    return (
        <>
            <select 
                className="notes-critic-history-select"
                value={selectedHistoryId}
                onChange={(e) => onLoadHistory(e.target.value)}
            >
                {/* Show "New Conversation" when cleared or not in saved history */}
                {(!selectedHistoryId || !history.find(item => item.id === selectedHistoryId)) && (
                    <option key="new" value={selectedHistoryId || ''}>
                        New Conversation
                    </option>
                )}
                {history.map(item => (
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