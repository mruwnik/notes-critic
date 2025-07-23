import { App, TFile, TAbstractFile } from 'obsidian';
import { LLMFile } from 'types';

export class ObsidianFileProcessor {
    private app: App;

    constructor(app: App) {
        this.app = app;
    }

    async processLLMFile(file: LLMFile): Promise<LLMFile> {
        const processedFile = { ...file };

        if (file.type === 'text') {
            // Read note content using Obsidian's vault API
            if (!file.content) {
                try {
                    const tFile = this.app.vault.getAbstractFileByPath(file.path);
                    if (tFile instanceof TFile) {
                        processedFile.content = await this.app.vault.read(tFile);
                    } else {
                        throw new Error(`Note not found: ${file.path}`);
                    }
                } catch (error) {
                    throw new Error(`Failed to read note ${file.path}: ${error.message}`);
                }
            }
        } else if (file.type === 'image') {
            // Read image file from Obsidian vault
            if (!file.content) {
                try {
                    const tFile = this.app.vault.getAbstractFileByPath(file.path);
                    if (tFile instanceof TFile) {
                        const arrayBuffer = await this.app.vault.readBinary(tFile);
                        const uint8Array = new Uint8Array(arrayBuffer);
                        const binaryString = uint8Array.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
                        processedFile.content = btoa(binaryString);
                    } else {
                        throw new Error(`Image not found: ${file.path}`);
                    }
                } catch (error) {
                    throw new Error(`Failed to read image ${file.path}: ${error.message}`);
                }
            }

            // Infer MIME type from file extension if not provided
            if (!processedFile.mimeType) {
                const ext = file.path.toLowerCase().split('.').pop();
                switch (ext) {
                    case 'png':
                        processedFile.mimeType = 'image/png';
                        break;
                    case 'jpg':
                    case 'jpeg':
                        processedFile.mimeType = 'image/jpeg';
                        break;
                    case 'gif':
                        processedFile.mimeType = 'image/gif';
                        break;
                    case 'webp':
                        processedFile.mimeType = 'image/webp';
                        break;
                    default:
                        processedFile.mimeType = 'image/png'; // Default fallback
                }
            }
        }

        // Set display name if not provided
        if (!processedFile.name) {
            processedFile.name = file.path.split('/').pop() || file.path;
        }

        return processedFile;
    }

    async processAllFiles(files: LLMFile[]): Promise<LLMFile[]> {
        return Promise.all(files.map(file => this.processLLMFile(file)));
    }
}
