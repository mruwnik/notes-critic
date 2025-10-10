import { App } from 'obsidian';
import { ToolDefinition } from 'types';
import * as fileOps from './fileOperations';

export interface MemoryToolResult {
    success: boolean;
    content?: string;
    error?: string;
}

export interface MemoryViewCommand {
    command: 'view';
    path: string;
    view_range?: [number, number]; // [start_line, end_line] - 1-indexed
}

export interface MemoryStrReplaceCommand {
    command: 'str_replace';
    path: string;
    old_str: string;
    new_str: string;
}

export interface MemoryCreateCommand {
    command: 'create';
    path: string;
    file_text?: string;
}

export interface MemoryInsertCommand {
    command: 'insert';
    path: string;
    insert_text: string;
    insert_line: number; // 1-indexed
}

export interface MemoryDeleteCommand {
    command: 'delete';
    path: string;
}

export interface MemoryRenameCommand {
    command: 'rename';
    old_path: string;
    new_path: string;
}

export type MemoryCommand = MemoryViewCommand | MemoryStrReplaceCommand | MemoryCreateCommand | MemoryInsertCommand | MemoryDeleteCommand | MemoryRenameCommand;

export class MemoryTool {
    private app: App;
    private maxCharacters?: number;
    private readonly MEMORY_DIR: string;

    constructor(app: App, memoryDirectory: string = 'memories', maxCharacters?: number) {
        this.app = app;
        // Normalize memory directory - strip leading/trailing slashes for Obsidian API
        this.MEMORY_DIR = memoryDirectory.replace(/^\/+/, '').replace(/\/+$/, '');
        this.maxCharacters = maxCharacters;
    }

    async executeCommand(command: MemoryCommand): Promise<MemoryToolResult> {
        try {
            // Validate path for all commands
            const pathToValidate = 'old_path' in command ? command.old_path : command.path;
            const validation = this.validatePath(pathToValidate);
            if (!validation.valid) {
                return { success: false, error: validation.error };
            }

            // Also validate new_path for rename
            if ('new_path' in command) {
                const newValidation = this.validatePath(command.new_path);
                if (!newValidation.valid) {
                    return { success: false, error: newValidation.error };
                }
            }

            let result: MemoryToolResult;
            switch (command.command) {
                case 'view':
                    result = await fileOps.viewFile(this.app, validation.normalized!, command.view_range, this.maxCharacters);
                    break;
                case 'str_replace':
                    result = await fileOps.replaceText(this.app, validation.normalized!, command.old_str, command.new_str);
                    break;
                case 'insert':
                    result = await fileOps.insertText(this.app, validation.normalized!, command.insert_text, command.insert_line);
                    break;
                case 'create':
                    result = await this.createFile(command, validation.normalized!);
                    break;
                case 'delete':
                    result = await this.deleteFile(command, validation.normalized!);
                    break;
                case 'rename':
                    result = await this.renameFile(command);
                    break;
                default:
                    result = {
                        success: false,
                        error: `Unknown command: ${(command as MemoryCommand).command}`
                    };
            }

            return this.translateResult(result);
        } catch (error) {
            return {
                success: false,
                error: `Error executing command: ${error.message}`
            };
        }
    }

    private validatePath(path: string): { valid: boolean; error?: string; normalized?: string } {
        let normalized = path.replace(/^\/+/, '');

        // Map /memories to the actual configured directory
        // This allows Claude to consistently use /memories regardless of configuration
        if (normalized === 'memories' || normalized.startsWith('memories/')) {
            normalized = normalized.replace(/^memories/, this.MEMORY_DIR);
        }

        // Path must start with MEMORY_DIR/ or be exactly MEMORY_DIR
        if (!normalized.startsWith(this.MEMORY_DIR + '/') && normalized !== this.MEMORY_DIR) {
            return {
                valid: false,
                error: `Path must be within /memories directory. Got: ${path}`
            };
        }

        // Check for path traversal attempts
        if (normalized.includes('..')) {
            return {
                valid: false,
                error: `Path traversal not allowed: ${path}`
            };
        }

        return { valid: true, normalized };
    }

    private translatePathToMemories(text: string): string {
        // Replace actual configured directory with /memories in messages
        if (this.MEMORY_DIR === 'memories') {
            return text;
        }

        // Escape special regex characters in the directory path
        const escapedDir = this.MEMORY_DIR.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match at start of string, after whitespace, or after common path delimiters
        const regex = new RegExp(`(^|\\s|:)${escapedDir}(?=/|\\s|$|:)`, 'g');
        return text.replace(regex, '$1memories');
    }

    private translateResult(result: MemoryToolResult): MemoryToolResult {
        return {
            ...result,
            content: result.content ? this.translatePathToMemories(result.content) : result.content,
            error: result.error ? this.translatePathToMemories(result.error) : result.error
        };
    }

    private async createFile(command: MemoryCreateCommand, normalizedPath: string): Promise<MemoryToolResult> {
        const { file_text = '' } = command;
        // Memory tool always overwrites existing files
        return await fileOps.createFile(this.app, normalizedPath, file_text, true);
    }

    private async deleteFile(command: MemoryDeleteCommand, normalizedPath: string): Promise<MemoryToolResult> {
        // Don't allow deleting the root memories directory
        if (normalizedPath === this.MEMORY_DIR) {
            return {
                success: false,
                error: `Cannot delete the root memory directory: /memories`
            };
        }

        return await fileOps.deleteFile(this.app, normalizedPath);
    }

    private async renameFile(command: MemoryRenameCommand): Promise<MemoryToolResult> {
        const { old_path, new_path } = command;

        const oldValidation = this.validatePath(old_path);

        // Don't allow renaming the root memories directory
        if (oldValidation.normalized === this.MEMORY_DIR) {
            return {
                success: false,
                error: `Cannot rename the root memory directory: /memories`
            };
        }

        const newValidation = this.validatePath(new_path);
        return await fileOps.renameFile(this.app, oldValidation.normalized!, newValidation.normalized!);
    }
}

// Tool definition for LLM integration
export const memoryToolDefinition: ToolDefinition = {
    name: 'memory',
    description: 'A memory tool that allows you to store and retrieve information across conversations through a memory file directory. All operations are restricted to the /memories directory.',
    parameters: {
        type: 'object',
        properties: {
            command: {
                type: 'string',
                enum: ['view', 'str_replace', 'create', 'insert', 'delete', 'rename'],
                description: 'The command to execute'
            },
            path: {
                type: 'string',
                description: 'The path to the file or directory (must be within /memories)'
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
                description: 'The new text to replace with (for str_replace command)'
            },
            file_text: {
                type: 'string',
                description: 'The content for new files (for create command)'
            },
            insert_text: {
                type: 'string',
                description: 'The text to insert (for insert command)'
            },
            insert_line: {
                type: 'number',
                description: 'The line number to insert text at (1-indexed, for insert command)'
            },
            old_path: {
                type: 'string',
                description: 'The current path (for rename command)'
            },
            new_path: {
                type: 'string',
                description: 'The new path (for rename command)'
            }
        },
        required: ['command']
    }
};

