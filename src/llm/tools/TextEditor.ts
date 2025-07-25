import { App, TFile, TFolder, TAbstractFile } from 'obsidian';
import { ToolDefinition } from 'types';

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
    new_str: string;
}

export interface CreateCommand {
    command: 'create';
    path: string;
    file_text?: string;
}

export interface InsertCommand {
    command: 'insert';
    path: string;
    new_str: string;
    insert_line: number; // 1-indexed
}

export type TextEditorCommand = ViewCommand | StrReplaceCommand | CreateCommand | InsertCommand;

export class TextEditorTool {
    private app: App;
    private editHistory: Map<string, string[]> = new Map(); // For potential undo functionality

    constructor(app: App) {
        this.app = app;
    }

    async executeCommand(command: TextEditorCommand): Promise<TextEditorToolResult> {
        try {
            switch (command.command) {
                case 'view':
                    return await this.viewFile(command);
                case 'str_replace':
                    return await this.replaceText(command);
                case 'create':
                    return await this.createFile(command);
                case 'insert':
                    return await this.insertText(command);
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

    private async getFile(path: string): Promise<TFile | TFolder | null | TAbstractFile> {
        const normalizedPath = path.replace(/^\/+/, '');
        return this.app.vault.getAbstractFileByPath(normalizedPath || path);
    }

    private async viewFile(command: ViewCommand): Promise<TextEditorToolResult> {
        const { path, view_range } = command;

        try {
            // Check if path is a directory
            const abstractFile = await this.getFile(path);

            if (abstractFile instanceof TFolder) {
                // List directory contents
                const contents = abstractFile.children
                    .map(child => {
                        const type = child instanceof TFolder ? 'directory' : 'file';
                        return `${type}: ${child.name}`;
                    })
                    .join('\n');

                return {
                    success: true,
                    content: `Directory listing for ${path}:\n${contents}`
                };
            } else if (abstractFile instanceof TFile) {
                // Read file content
                const content = await this.app.vault.read(abstractFile);

                if (view_range) {
                    const lines = content.split('\n');
                    const [startLine, endLine] = view_range;
                    const selectedLines = lines.slice(startLine - 1, endLine);

                    return {
                        success: true,
                        content: selectedLines.join('\n')
                    };
                } else {
                    return {
                        success: true,
                        content: content
                    };
                }
            } else {
                return {
                    success: false,
                    error: `Path not found: ${path}`
                };
            }
        } catch (error) {
            return {
                success: false,
                error: `Failed to view ${path}: ${error.message}`
            };
        }
    }

    private async replaceText(command: StrReplaceCommand): Promise<TextEditorToolResult> {
        const { path, old_str, new_str } = command;

        try {
            const file = await this.getFile(path);

            if (!(file instanceof TFile)) {
                return {
                    success: false,
                    error: `File not found: ${path}`
                };
            }

            const content = await this.app.vault.read(file);

            // Check for matches
            const matches = content.split(old_str).length - 1;

            if (matches === 0) {
                return {
                    success: false,
                    error: `No match found for replacement text. Please check your text and try again.`
                };
            }

            if (matches > 1) {
                return {
                    success: false,
                    error: `Found ${matches} matches for replacement text. Please provide more context to make a unique match.`
                };
            }

            // Save to history for potential undo
            this.saveToHistory(path, content);

            // Perform replacement
            const newContent = content.replace(old_str, new_str);
            await this.app.vault.modify(file, newContent);

            return {
                success: true,
                content: `Successfully replaced text in ${path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to replace text in ${path}: ${error.message}`
            };
        }
    }

    private async createFile(command: CreateCommand): Promise<TextEditorToolResult> {
        const { path, file_text = '' } = command;

        try {
            // Check if file already exists
            const existingFile = await this.getFile(path);
            if (existingFile) {
                return {
                    success: false,
                    error: `File already exists: ${path}`
                };
            }

            // Create the file
            const newFile = await this.app.vault.create(path, file_text);

            return {
                success: true,
                content: `Successfully created file: ${path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to create file ${path}: ${error.message}`
            };
        }
    }

    private async insertText(command: InsertCommand): Promise<TextEditorToolResult> {
        const { path, new_str, insert_line } = command;

        try {
            const file = await this.getFile(path);

            if (!(file instanceof TFile)) {
                return {
                    success: false,
                    error: `File not found: ${path}`
                };
            }

            const content = await this.app.vault.read(file);
            const lines = content.split('\n');

            // Validate line number
            if (insert_line < 1 || insert_line > lines.length + 1) {
                return {
                    success: false,
                    error: `Invalid line number ${insert_line}. File has ${lines.length} lines.`
                };
            }

            // Save to history for potential undo
            this.saveToHistory(path, content);

            // Insert text at specified line
            lines.splice(insert_line - 1, 0, new_str);
            const newContent = lines.join('\n');

            await this.app.vault.modify(file, newContent);

            return {
                success: true,
                content: `Successfully inserted text at line ${insert_line} in ${path}`
            };
        } catch (error) {
            return {
                success: false,
                error: `Failed to insert text in ${path}: ${error.message}`
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
            const history = this.editHistory.get(path);
            if (!history || history.length === 0) {
                return {
                    success: false,
                    error: `No edit history found for ${path}`
                };
            }

            const file = await this.getFile(path);
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
            const file = await this.getFile(path);

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
    description: 'A text editor tool that can view, create, and edit files.',
    parameters: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                enum: ['view', 'str_replace', 'create', 'insert'],
                description: 'The command to execute'
            },
            path: {
                type: 'string',
                description: 'The path to the file or directory'
            },
            view_range: {
                type: 'array',
                items: { type: 'number' },
                minItems: 2,
                maxItems: 2,
                description: 'Optional range of lines to view [start_line, end_line] (1-indexed)'
            },
            old_str: {
                type: 'string',
                description: 'The text to replace (for str_replace command)'
            },
            new_str: {
                type: 'string',
                description: 'The new text to insert or replace with'
            },
            file_text: {
                type: 'string',
                description: 'The content for new files (for create command)'
            },
            insert_line: {
                type: 'number',
                description: 'The line number to insert text at (1-indexed, for insert command)'
            }
        },
        required: ['command', 'path']
    }
};
