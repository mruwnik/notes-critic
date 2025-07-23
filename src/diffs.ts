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