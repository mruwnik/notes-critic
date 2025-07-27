import { UserInput } from 'types';

const DIFF_CLASSES = {
    container: 'diff-container',
    hunk: 'diff-hunk',
    header: 'diff-header',
    added: 'diff-added',
    removed: 'diff-removed',
    meta: 'diff-meta',
    context: 'diff-context',
} as const;

export const truncateText = (text: string, maxLength: number): string => {
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
}

export const formatDiff = (diff: string): string => {
    if (!diff) return '';

    const lines = diff.split('\n');

    const formatLine = (line: string): string => {
        // Handle empty lines
        if (line.trim() === '') {
            return `<div class="${DIFF_CLASSES.context}">&nbsp;</div>`;
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

        return `<div class="${className}">${escapeHtml(line)}</div>`;
    };

    const formattedLines = lines.map(formatLine).join('');
    return `<div class="${DIFF_CLASSES.container}">${formattedLines}</div>`;
}

export const escapeHtml = (text: string): string => {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

export const formatFileChangeContent = (userInput: UserInput): string => {
    const input = userInput as Extract<UserInput, { type: 'file_change' }>;
    return `<strong>File changes: ${input.filename}</strong><br>${formatDiff(input.diff)}`;
}

export const formatChatMessageContent = (userInput: UserInput): string => {
    const input = userInput as Extract<UserInput, { type: 'chat_message' }>;
    return escapeHtml(input.message).replace(/\n/g, '<br/>');
}

export const formatManualFeedbackContent = (userInput: UserInput): string => {
    const input = userInput as Extract<UserInput, { type: 'manual_feedback' }>;
    return `<strong>Manual feedback: ${input.filename}</strong><br>${truncateText(input.content, 200)}`;
}

export const formatJson = (obj: any): string => {
    return JSON.stringify(obj, null, 2);
}