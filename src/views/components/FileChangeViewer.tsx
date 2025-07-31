import React from 'react';
import { DiffViewer } from './DiffViewer';

interface FileChangeViewerProps {
    filename: string;
    diff: string;
}

export const FileChangeViewer: React.FC<FileChangeViewerProps> = ({ filename, diff }) => {
    return (
        <div className="nc-space-y-2">
            <div className="nc-font-semibold nc-text-sm">File changes: {filename}</div>
            <DiffViewer diff={diff} />
        </div>
    );
};