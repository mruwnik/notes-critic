import { App, TFile } from 'obsidian';
import { ToolDefinition } from 'types';
import * as fileOps from './fileOperations';

export interface TextEditorToolResult {
    success: boolean;
    content?: string;
    error?: string;
}

export interface ViewCommand {
    command: 'view';
    path: string;
    view_range?: [number, number]; // [start_line, end_line] - 1-indexed
}

export interface StrReplaceCommand {
    command: 'str_replace';
    path: string;
    old_str: string;
    new_str?: string; // Optional - omitting deletes the matched text
}

export interface CreateCommand {
    command: 'create';
    path: string;
    file_text?: string;
}

export interface InsertCommand {
    command: 'insert';
    path: string;
    insert_text: string;
    insert_line: number; // 0-indexed: 0=beginning, N=after line N, file_length=end
}

export type TextEditorCommand = ViewCommand | StrReplaceCommand | CreateCommand | InsertCommand;

export class TextEditorTool {
    private app: App;
    private editHistory: Map<string, string[]> = new Map(); // For potential undo functionality
    private maxCharacters?: number;

    constructor(app: App, maxCharacters?: number) {
        this.app = app;
        this.maxCharacters = maxCharacters;
    }

    async executeCommand(command: TextEditorCommand): Promise<TextEditorToolResult> {
        try {
            const normalizedPath = 'path' in command ? this.normalizePath(command.path) : '';

            switch (command.command) {
                case 'view':
                    return await fileOps.viewFile(this.app, normalizedPath, command.view_range, this.maxCharacters);
                case 'str_replace':
                    return await this.replaceText(command, normalizedPath);
                case 'create':
                    return await this.createFile(command, normalizedPath);
                case 'insert':
                    return await this.insertText(command, normalizedPath);
                default:
                    return {
                        success: false,
                        error: `Unknown command: ${(command as any).command}`
                    };
            }
        } catch (error) {
            return {
                success: false,
                error: `Error executing command: ${error.message}`
            };
        }
    }

    private normalizePath(path: string): string {
        return path.replace(/^\/+/, '');
    }

    private async getFileAndSaveHistory(normalizedPath: string, originalPath: string): Promise<{ file: TFile; content: string } | TextEditorToolResult> {
        const file = this.app.vault.getAbstractFileByPath(normalizedPath);

        if (!(file instanceof TFile)) {
            return {
                success: false,
                error: `File not found: ${originalPath}`
            };
        }

        const content = await this.app.vault.read(file);
        this.saveToHistory(normalizedPath, content);

        return { file, content };
    }

    private async replaceText(command: StrReplaceCommand, normalizedPath: string): Promise<TextEditorToolResult> {
        const { old_str, new_str = '' } = command;

        try {
            const result = await this.getFileAndSaveHistory(normalizedPath, command.path);
            if ('success' in result) return result;

            return await fileOps.replaceText(this.app, normalizedPath, old_str, new_str);
        } catch (error) {
            return {
                success: false,
                error: `Failed to replace text in ${command.path}: ${error.message}`
            };
        }
    }

    private async createFile(command: CreateCommand, normalizedPath: string): Promise<TextEditorToolResult> {
        const { file_text = '' } = command;
        return await fileOps.createFile(this.app, normalizedPath, file_text, false);
    }

    private async insertText(command: InsertCommand, normalizedPath: string): Promise<TextEditorToolResult> {
        const { insert_text, insert_line } = command;

        try {
            const result = await this.getFileAndSaveHistory(normalizedPath, command.path);
            if ('success' in result) return result;

            return await fileOps.insertText(this.app, normalizedPath, insert_text, insert_line);
        } catch (error) {
            return {
                success: false,
                error: `Failed to insert text in ${command.path}: ${error.message}`
            };
        }
    }

    private saveToHistory(path: string, content: string): void {
        if (!this.editHistory.has(path)) {
            this.editHistory.set(path, []);
        }
        const history = this.editHistory.get(path)!;
        history.push(content);

        // Keep only last 10 versions to prevent memory issues
        if (history.length > 10) {
            history.shift();
        }
    }

    // Optional: Add undo functionality
    async undoLastEdit(path: string): Promise<TextEditorToolResult> {
        try {
            const normalizedPath = this.normalizePath(path);
            const history = this.editHistory.get(normalizedPath);
            if (!history || history.length === 0) {
                return {
                    success: false,
                    error: `No edit history found for ${path}`
                };
            }

            const file = this.app.vault.getAbstractFileByPath(normalizedPath);
            if (!(file instanceof TFile)) {
                return {
                    success: false,
                    error: `File not found: ${path}`
                };
            }

            const previousContent = history.pop()!;
            await this.app.vault.modify(file, previousContent);

            return {
                success: true,
                content: `Successfully undid last edit in ${path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to undo edit in ${path}: ${error.message}`
            };
        }
    }

    // Helper method to get file stats
    async getFileStats(path: string): Promise<TextEditorToolResult> {
        try {
            const normalizedPath = this.normalizePath(path);
            const file = this.app.vault.getAbstractFileByPath(normalizedPath);

            if (!(file instanceof TFile)) {
                return {
                    success: false,
                    error: `File not found: ${path}`
                };
            }

            const content = await this.app.vault.read(file);
            const lines = content.split('\n');
            const stats = {
                name: file.name,
                path: file.path,
                size: content.length,
                lines: lines.length,
                extension: file.extension,
                created: new Date(file.stat.ctime).toISOString(),
                modified: new Date(file.stat.mtime).toISOString()
            };

            return {
                success: true,
                content: JSON.stringify(stats, null, 2)
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to get file stats for ${path}: ${error.message}`
            };
        }
    }

    // Helper method to list all files in vault
    async listAllFiles(): Promise<TextEditorToolResult> {
        try {
            const files = this.app.vault.getFiles();
            const fileList = files.map(file => ({
                path: file.path,
                name: file.name,
                extension: file.extension,
                size: file.stat.size,
                modified: new Date(file.stat.mtime).toISOString()
            }));

            return {
                success: true,
                content: JSON.stringify(fileList, null, 2)
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to list files: ${error.message}`
            };
        }
    }
}

// Tool definition for LLM integration
export const textEditorToolDefinition: ToolDefinition = {
    name: 'str_replace_based_edit_tool',
    description: `Tool for viewing, creating and editing text files.

The view command supports viewing directories (lists files/directories up to 2 levels), image files (.jpg, .jpeg, .png), and text files (displays numbered lines).

The create command creates new text files with the content specified in file_text. It will fail if the file already exists.

The str_replace command replaces text in a file. Requires an exact, unique match of old_str (whitespace sensitive). Will fail if old_str doesn't exist or appears multiple times. Omitting new_str deletes the matched text.

The insert command inserts the text insert_text at line insert_line. 0 places text at the beginning of the file, N places text after line N, and using the total number of lines in the file places text at the end. insert_text must end with a newline character for the new text to appear on a separate line from any existing text that follows the insertion point.`,
    parameters: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                enum: ['view', 'str_replace', 'create', 'insert'],
                description: 'The command to execute: view, create, str_replace, or insert'
            },
            path: {
                type: 'string',
                description: 'Path to the file or directory (required for all commands)'
            },
            view_range: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                description: 'Optional range of lines to view [start_line, end_line] for view command'
            },
            old_str: {
                type: 'string',
                description: 'The text to replace (required for str_replace command, must match exactly including whitespace)'
            },
            new_str: {
                type: 'string',
                description: 'The new text to replace with (optional for str_replace command - omit to delete matched text)'
            },
            file_text: {
                type: 'string',
                description: 'The content for new files (required for create command)'
            },
            insert_line: {
                type: 'number',
                description: 'The line number to insert at (required for insert command): 0=beginning, N=after line N, file_length=end'
            },
            insert_text: {
                type: 'string',
                description: 'The text to insert (required for insert command). Must end with newline for text to appear on separate line.'
            }
        },
        required: ['command', 'path']
    }
};
