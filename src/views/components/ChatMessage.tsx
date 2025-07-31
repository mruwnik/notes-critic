import React from 'react';

interface ChatMessageProps {
    message: string;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
    return (
        <div className="nc-whitespace-pre-wrap nc-text-base">
            {message}
        </div>
    );
};