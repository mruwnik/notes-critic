import React, { createContext, useContext, ReactNode } from 'react';
import { useHistoryManager } from './useHistoryManager';

const HistoryContext = createContext<ReturnType<typeof useHistoryManager> | null>(null);

interface HistoryProviderProps {
    children: ReactNode;
}

export const HistoryProvider: React.FC<HistoryProviderProps> = ({ children }) => {
    const historyManager = useHistoryManager();
    
    return (
        <HistoryContext.Provider value={historyManager}>
            {children}
        </HistoryContext.Provider>
    );
};

export const useHistoryContext = () => {
    const context = useContext(HistoryContext);
    if (!context) {
        throw new Error('useHistoryContext must be used within a HistoryProvider');
    }
    return context;
};