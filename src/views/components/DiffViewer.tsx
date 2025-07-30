import React from 'react';

const DIFF_CLASSES = {
    container: 'diff-container',
    hunk: 'diff-hunk',
    header: 'diff-header',
    added: 'diff-added',
    removed: 'diff-removed',
    meta: 'diff-meta',
    context: 'diff-context',
} as const;

interface DiffViewerProps {
    diff: string;
}

const DiffLine: React.FC<{ line: string }> = ({ line }) => {
    // Handle empty lines
    if (line.trim() === '') {
        return <div className={DIFF_CLASSES.context}>&nbsp;</div>;
    }

    // Match diff patterns more precisely
    let className: string = DIFF_CLASSES.context;

    if (line.startsWith('@@') && line.includes('@@')) {
        className = DIFF_CLASSES.hunk;
    } else if (line.startsWith('+++') || line.startsWith('---')) {
        className = DIFF_CLASSES.header;
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
        className = DIFF_CLASSES.added;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
        className = DIFF_CLASSES.removed;
    } else if (line.startsWith('\\')) {
        className = DIFF_CLASSES.meta;
    }

    return <div className={className}>{line}</div>;
};

export const DiffViewer: React.FC<DiffViewerProps> = ({ diff }) => {
    if (!diff) return null;

    const lines = diff.split('\n');

    return (
        <div className={DIFF_CLASSES.container}>
            {lines.map((line, index) => (
                <DiffLine key={index} line={line} />
            ))}
        </div>
    );
};