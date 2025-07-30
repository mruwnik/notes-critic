import React from 'react';

interface ManualFeedbackViewerProps {
    filename: string;
    content: string;
    maxLength?: number;
}

const truncateText = (text: string, maxLength: number): string => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
};

export const ManualFeedbackViewer: React.FC<ManualFeedbackViewerProps> = ({ 
    filename, 
    content, 
    maxLength = 200 
}) => {
    return (
        <div>
            <strong>Manual feedback: {filename}</strong>
            <br />
            {truncateText(content, maxLength)}
        </div>
    );
};