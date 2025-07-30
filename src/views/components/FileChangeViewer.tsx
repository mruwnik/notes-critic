import React from 'react';
import { DiffViewer } from './DiffViewer';

interface FileChangeViewerProps {
    filename: string;
    diff: string;
}

export const FileChangeViewer: React.FC<FileChangeViewerProps> = ({ filename, diff }) => {
    return (
        <div>
            <strong>File changes: {filename}</strong>
            <DiffViewer diff={diff} />
        </div>
    );
};