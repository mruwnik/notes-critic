import React from 'react';

interface ChatMessageProps {
    message: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
    return (
        <pre className="notes-critic-chat-message">
            {message}
        </pre>
    );
};