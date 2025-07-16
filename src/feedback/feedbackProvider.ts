import { ConversationTurn, UserInput, LLMMessage, LLMStreamChunk, NotesCriticSettings } from 'types';
import { LLMProvider } from 'llm/llmProvider';
import { App } from 'obsidian';


export async function* getFeedback(
    userInput: UserInput,
    history: ConversationTurn[],
    settings: NotesCriticSettings,
    app: App
): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const provider = new LLMProvider(settings, app);

    // Construct history messages from recent turns
    const historyMessages: LLMMessage[] = [];
    const recentHistory = history.slice(-10); // Last 10 turns

    for (const turn of recentHistory) {
        // Only include turns with complete responses
        if (turn.aiResponse.isComplete && turn.aiResponse.content && turn.aiResponse.content.trim() !== '') {
            // Convert userInput to user message
            const userMessage = getUserInputMessage(turn.userInput);
            historyMessages.push({ role: 'user', content: userMessage });
            historyMessages.push({ role: 'assistant', content: turn.aiResponse.content });
        }
    }

    // Construct the messages array
    const messages: LLMMessage[] = [
        ...historyMessages,
        {
            role: 'user',
            content: userInput.prompt,
            files: userInput.files
        }
    ];

    // Stream the response
    yield* provider.callLLM(messages);
}

function getUserInputMessage(userInput: UserInput): string {
    let message = '';

    switch (userInput.type) {
        case 'chat_message':
            message = userInput.message;
            break;
        case 'file_change':
            message = `Changes made to "${userInput.filename}":\n${userInput.diff}`;
            break;
        case 'manual_feedback':
            message = `Please provide feedback on "${userInput.filename}".`;
            break;
        default:
            message = '';
    }

    // Add note about attached files if they exist
    if (userInput.files && userInput.files.length > 0) {
        const fileNames = userInput.files.map(f => f.name || f.path).join(', ');
        message += `\n\nAttached files: ${fileNames}`;
    }

    return message;
}

export function generateDiff(baseline: string, current: string): string {
    if (baseline === current) {
        return 'No changes detected';
    }

    const baselineLines = baseline.split('\n');
    const currentLines = current.split('\n');

    const hunks = generateHunks(baselineLines, currentLines);

    if (hunks.length === 0) {
        return 'No changes detected';
    }

    const output = hunks.map(hunk => formatHunk(hunk)).join('\n');
    return output;
}

interface DiffHunk {
    baselineStart: number;
    baselineCount: number;
    currentStart: number;
    currentCount: number;
    lines: Array<{ type: 'context' | 'removed' | 'added', content: string }>;
}

function generateHunks(baselineLines: string[], currentLines: string[]): DiffHunk[] {
    const hunks: DiffHunk[] = [];
    const contextLines = 3;
    const maxLines = Math.max(baselineLines.length, currentLines.length);

    let i = 0;
    while (i < maxLines) {
        // Find next change
        while (i < maxLines && baselineLines[i] === currentLines[i]) {
            i++;
        }

        if (i >= maxLines) break;

        // Found a change, start a hunk
        const hunkStart = Math.max(0, i - contextLines);
        const hunk: DiffHunk = {
            baselineStart: hunkStart + 1, // 1-based
            baselineCount: 0,
            currentStart: hunkStart + 1, // 1-based
            currentCount: 0,
            lines: []
        };

        // Add leading context
        for (let j = hunkStart; j < i; j++) {
            if (baselineLines[j] !== undefined) {
                hunk.lines.push({ type: 'context', content: baselineLines[j] });
                hunk.baselineCount++;
                hunk.currentCount++;
            }
        }

        // Add changes
        while (i < maxLines && baselineLines[i] !== currentLines[i]) {
            const baseLine = baselineLines[i];
            const currentLine = currentLines[i];

            if (baseLine !== undefined && currentLine !== undefined) {
                // Line changed
                hunk.lines.push({ type: 'removed', content: baseLine });
                hunk.lines.push({ type: 'added', content: currentLine });
                hunk.baselineCount++;
                hunk.currentCount++;
            } else if (baseLine !== undefined) {
                // Line removed
                hunk.lines.push({ type: 'removed', content: baseLine });
                hunk.baselineCount++;
            } else if (currentLine !== undefined) {
                // Line added
                hunk.lines.push({ type: 'added', content: currentLine });
                hunk.currentCount++;
            }
            i++;
        }

        // Add trailing context
        const contextEnd = Math.min(maxLines, i + contextLines);
        for (let j = i; j < contextEnd; j++) {
            if (baselineLines[j] !== undefined) {
                hunk.lines.push({ type: 'context', content: baselineLines[j] });
                hunk.baselineCount++;
                hunk.currentCount++;
            }
        }

        hunks.push(hunk);
    }

    return hunks;
}

function formatHunk(hunk: DiffHunk): string {
    const header = `@@ -${hunk.baselineStart},${hunk.baselineCount} +${hunk.currentStart},${hunk.currentCount} @@`;

    const lines = hunk.lines.map(line => {
        switch (line.type) {
            case 'context':
                return ` ${line.content}`;
            case 'removed':
                return `-${line.content}`;
            case 'added':
                return `+${line.content}`;
            default:
                return line.content;
        }
    });

    return [header, ...lines].join('\n');
}

export function calculateDiffSize(baseline: string, current: string): number {
    return Math.abs(current.length - baseline.length);
} 