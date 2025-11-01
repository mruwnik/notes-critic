import { App, TFile, TFolder } from 'obsidian';

function isPromise<T>(value: any): value is Promise<T> {
    return value && typeof value.then === 'function';
}

async function getAbstractFile(app: App, path: string): Promise<any> {
    const maybeFile = app.vault.getAbstractFileByPath(path);
    return isPromise(maybeFile) ? await maybeFile : maybeFile;
}

export interface FileOperationResult {
    success: boolean;
    content?: string;
    error?: string;
}

// Helper to get file content using vault or adapter API
async function getFileContent(app: App, path: string): Promise<{ content: string; file: TFile | null }> {
    const file = await getAbstractFile(app, path);

    if (file instanceof TFile) {
        const content = await app.vault.read(file);
        return { content, file };
    }

    // Fallback to adapter for hidden files
    const exists = await app.vault.adapter.exists(path);
    if (!exists) {
        throw new Error(`File not found: ${path}`);
    }

    const stat = await app.vault.adapter.stat(path);
    if (stat?.type !== 'file') {
        throw new Error(`File not found: ${path}`);
    }

    const content = await app.vault.adapter.read(path);
    return { content, file: null };
}

// Helper to write file content using vault or adapter API
async function writeFileContent(app: App, path: string, content: string, file: TFile | null): Promise<void> {
    if (file instanceof TFile) {
        await app.vault.modify(file, content);
    } else {
        await app.vault.adapter.write(path, content);
    }
}

export async function viewFile(
    app: App,
    path: string,
    viewRange?: [number, number],
    maxCharacters?: number
): Promise<FileOperationResult> {
    try {
        const abstractFile = await getAbstractFile(app, path);

        // Handle directories
        if (abstractFile instanceof TFolder) {
            const contents = abstractFile.children
                .map(child => {
                    const type = child instanceof TFolder ? 'directory' : 'file';
                    return `${type}: ${child.name}`;
                })
                .join('\n');

            return {
                success: true,
                content: `Directory: ${path}\n${contents || '(empty)'}`
            };
        }

        // Handle files
        if (abstractFile instanceof TFile) {
            let content = await app.vault.read(abstractFile);

            if (viewRange) {
                const lines = content.split('\n');
                const [startLine, endLine] = viewRange;
                content = lines.slice(startLine - 1, endLine).join('\n');
            }

            if (maxCharacters && content.length > maxCharacters) {
                content = content.substring(0, maxCharacters);
            }

            return {
                success: true,
                content: content
            };
        }

        // Fallback to adapter API for hidden files/directories
        const exists = await app.vault.adapter.exists(path);
        if (!exists) {
            // Try to create directory
            try {
                await app.vault.adapter.mkdir(path);
            } catch (error) {
                // Ignore if already exists
            }
        }

        const stat = await app.vault.adapter.stat(path);
        if (stat?.type === 'folder') {
            const listing = await app.vault.adapter.list(path);
            const contents = [
                ...listing.folders.map(f => `directory: ${f.split('/').pop()}`),
                ...listing.files.map(f => `file: ${f.split('/').pop()}`)
            ].join('\n');

            return {
                success: true,
                content: `Directory: ${path}\n${contents || '(empty)'}`
            };
        }

        if (stat?.type === 'file') {
            let content = await app.vault.adapter.read(path);

            if (viewRange) {
                const lines = content.split('\n');
                const [startLine, endLine] = viewRange;
                content = lines.slice(startLine - 1, endLine).join('\n');
            }

            if (maxCharacters && content.length > maxCharacters) {
                content = content.substring(0, maxCharacters);
            }

            return {
                success: true,
                content: content
            };
        }

        return {
            success: false,
            error: `Path not found: ${path}`
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to view ${path}: ${error.message}`
        };
    }
}

export async function replaceText(
    app: App,
    path: string,
    oldStr: string,
    newStr: string
): Promise<FileOperationResult> {
    try {
        const { content, file } = await getFileContent(app, path);

        // Check for matches
        const matches = content.split(oldStr).length - 1;

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

        // Perform replacement
        const newContent = content.replace(oldStr, newStr);
        await writeFileContent(app, path, newContent, file);

        return {
            success: true,
            content: `Successfully replaced text in ${path}`
        };
    } catch (error) {
        return {
            success: false,
            error: error.message?.includes('File not found') ? error.message : `Failed to replace text in ${path}: ${error.message}`
        };
    }
}

export async function insertText(
    app: App,
    path: string,
    textToInsert: string,
    insertLine: number
): Promise<FileOperationResult> {
    try {
        const { content, file } = await getFileContent(app, path);
        const lines = content.split('\n');

        // Validate line number
        if (insertLine < 0 || insertLine > lines.length) {
            return {
                success: false,
                error: `Invalid line number ${insertLine}. File has ${lines.length} lines. Use 0 for beginning, ${lines.length} for end.`
            };
        }

        // Insert text at specified line
        const linesToInsert = textToInsert.split('\n');
        lines.splice(insertLine, 0, ...linesToInsert);
        const newContent = lines.join('\n');

        await writeFileContent(app, path, newContent, file);

        return {
            success: true,
            content: `Successfully inserted text at line ${insertLine} in ${path}`
        };
    } catch (error) {
        return {
            success: false,
            error: error.message?.includes('File not found') ? error.message : `Failed to insert text in ${path}: ${error.message}`
        };
    }
}

export async function createFile(
    app: App,
    path: string,
    fileText: string = '',
    overwrite: boolean = false
): Promise<FileOperationResult> {
    try {
        // Check if file already exists
        const existingFile = await getAbstractFile(app, path);

        if (existingFile instanceof TFile) {
            if (overwrite) {
                await app.vault.modify(existingFile, fileText);
                return {
                    success: true,
                    content: `Successfully overwrote file: ${path}`
                };
            } else {
                return {
                    success: false,
                    error: `File already exists: ${path}`
                };
            }
        }

        // Check with adapter for hidden files
        if (!existingFile) {
            const adapterExists = await app.vault.adapter.exists(path);
            if (adapterExists) {
                const stat = await app.vault.adapter.stat(path);
                if (stat?.type === 'file') {
                    if (overwrite) {
                        await app.vault.adapter.write(path, fileText);
                        return {
                            success: true,
                            content: `Successfully overwrote file: ${path}`
                        };
                    } else {
                        return {
                            success: false,
                            error: `File already exists: ${path}`
                        };
                    }
                }
            }
        }

        // Ensure parent directories exist
        const parentPath = path.substring(0, path.lastIndexOf('/'));
        if (parentPath) {
            await ensureDirectoryExists(app, parentPath);
        }

        // Create the file - use adapter for hidden files
        if (path.startsWith('.') || path.includes('/.')) {
            await app.vault.adapter.write(path, fileText);
        } else {
            await app.vault.create(path, fileText);
        }

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

async function ensureDirectoryExists(app: App, path: string): Promise<void> {
    const parts = path.split('/').filter(p => p);
    let currentPath = '';

    for (const part of parts) {
        currentPath += (currentPath ? '/' : '') + part;
        const exists = await getAbstractFile(app, currentPath);

        if (!exists) {
            // Check with adapter for hidden directories
            const adapterExists = await app.vault.adapter.exists(currentPath);
            if (!adapterExists) {
                try {
                    // Use adapter.mkdir for hidden directories
                    await app.vault.adapter.mkdir(currentPath);
                } catch (error) {
                    // Folder might already exist due to race condition, ignore
                    if (!error.message?.includes('already exists')) {
                        throw error;
                    }
                }
            }
        }
    }
}

export async function deleteFile(
    app: App,
    path: string
): Promise<FileOperationResult> {
    try {
        const abstractFile = await getAbstractFile(app, path);

        if (abstractFile) {
            await app.vault.delete(abstractFile);
        } else {
            // Fallback to adapter for hidden files
            const exists = await app.vault.adapter.exists(path);
            if (!exists) {
                return {
                    success: false,
                    error: `Path not found: ${path}`
                };
            }
            await app.vault.adapter.remove(path);
        }

        return {
            success: true,
            content: `Successfully deleted: ${path}`
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to delete ${path}: ${error.message}`
        };
    }
}

export async function renameFile(
    app: App,
    oldPath: string,
    newPath: string
): Promise<FileOperationResult> {
    try {
        const abstractFile = await getAbstractFile(app, oldPath);

        if (abstractFile) {
            await app.fileManager.renameFile(abstractFile, newPath);
        } else {
            // Fallback to adapter for hidden files (copy then remove)
            const exists = await app.vault.adapter.exists(oldPath);
            if (!exists) {
                return {
                    success: false,
                    error: `Path not found: ${oldPath}`
                };
            }
            const content = await app.vault.adapter.read(oldPath);
            await app.vault.adapter.write(newPath, content);
            await app.vault.adapter.remove(oldPath);
        }

        return {
            success: true,
            content: `Successfully renamed ${oldPath} to ${newPath}`
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to rename ${oldPath}: ${error.message}`
        };
    }
}

