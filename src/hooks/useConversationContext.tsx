import React, { createContext, useContext, ReactNode } from 'react';
import { useConversationManager, UseConversationManagerReturn } from './useConversationManager';

const ConversationContext = createContext<UseConversationManagerReturn | null>(null);

interface ConversationProviderProps {
    children: ReactNode;
}

export const ConversationProvider: React.FC<ConversationProviderProps> = ({ children }) => {
    const conversationManager = useConversationManager();
    
    return (
        <ConversationContext.Provider value={conversationManager}>
            {children}
        </ConversationContext.Provider>
    );
};

export const useConversationContext = (): UseConversationManagerReturn => {
    const context = useContext(ConversationContext);
    if (!context) {
        throw new Error('useConversationContext must be used within a ConversationProvider');
    }
    return context;
};