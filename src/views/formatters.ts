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

    const lineFormatters = [
        { prefix: '@@', class: DIFF_CLASSES.hunk },
        { prefix: ['+++', '---'], class: DIFF_CLASSES.header },
        { prefix: '+', class: DIFF_CLASSES.added },
        { prefix: '-', class: DIFF_CLASSES.removed },
        { prefix: '\\', class: DIFF_CLASSES.meta },
    ];

    const formatLine = (line: string): string => {
        const formatter = lineFormatters.find(f =>
            Array.isArray(f.prefix)
                ? f.prefix.some(p => line.startsWith(p))
                : line.startsWith(f.prefix)
        );

        const className = formatter?.class || DIFF_CLASSES.context;
        return `<span class="${className}">${escapeHtml(line)}</span>`;
    };

    const formattedLines = diff.split('\n').map(formatLine);
    return `<div class="${DIFF_CLASSES.container}">${formattedLines.join('<br/>')}</div>`;
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