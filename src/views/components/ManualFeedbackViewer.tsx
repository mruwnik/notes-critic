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
        <div className="nc-space-y-1">
            <div className="nc-font-semibold nc-text-sm">Manual feedback: {filename}</div>
            <div className="nc-text-sm nc-text-muted">
                {truncateText(content, maxLength)}
            </div>
        </div>
    );
};