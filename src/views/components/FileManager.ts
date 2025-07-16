import { TFile, MarkdownView, Notice } from 'obsidian';
import { NoteSnapshot } from '../../types';

export class FileManager {
    private app: any;
    private noteSnapshots: Map<string, NoteSnapshot>;
    private onFileChange: (file: TFile) => void;

    constructor(
        app: any,
        noteSnapshots: Map<string, NoteSnapshot>,
        onFileChange: (file: TFile) => void
    ) {
        this.app = app;
        this.noteSnapshots = noteSnapshots;
        this.onFileChange = onFileChange;
    }

    getCurrentFile(): TFile | null {
        // Try to get the active file directly first
        let file = this.app.workspace.getActiveFile();

        // If that doesn't work, try getting it from the active MarkdownView
        if (!file) {
            const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
            file = activeView?.file || null;
        }

        return file;
    }

    async initializeFileSnapshot(file: TFile): Promise<void> {
        try {
            const content = await this.app.vault.cachedRead(file);
            this.createOrUpdateSnapshot(file, content);
            this.onFileChange(file);
        } catch (error) {
            console.error('Error initializing file snapshot:', error);
            new Notice('Error reading file content');
        }
    }

    async updateFileSnapshot(file: TFile): Promise<number> {
        try {
            const content = await this.app.vault.cachedRead(file);
            const fileId = file.path;
            const snapshot = this.noteSnapshots.get(fileId);

            if (snapshot) {
                const oldParagraphs = this.countParagraphs(snapshot.current);
                snapshot.current = content;
                const newParagraphs = this.countParagraphs(content);
                const paragraphDiff = Math.abs(newParagraphs - oldParagraphs);
                snapshot.changeCount += paragraphDiff;
                return paragraphDiff;
            }
            return 0;
        } catch (error) {
            console.error('Error processing file modification:', error);
            return 0;
        }
    }

    private countParagraphs(text: string): number {
        // Split by double newlines or single newlines, filter out empty strings
        const paragraphs = text.split(/\n+/).filter(p => p.trim().length > 0);
        return paragraphs.length;
    }

    private createOrUpdateSnapshot(file: TFile, content: string): void {
        const fileId = file.path;
        if (!this.noteSnapshots.has(fileId)) {
            this.noteSnapshots.set(fileId, {
                baseline: content,
                current: content,
                changeCount: 0
            });
        } else {
            const snapshot = this.noteSnapshots.get(fileId)!;
            snapshot.current = content;
        }
    }

    hasChangesToFeedback(file: TFile | null): boolean {
        if (!file) return false;

        const snapshot = this.noteSnapshots.get(file.path);
        if (!snapshot) return false;

        return snapshot.baseline !== snapshot.current;
    }

    clearNoteData(file: TFile): void {
        const fileId = file.path;
        const snapshot = this.noteSnapshots.get(fileId);

        if (snapshot) {
            snapshot.baseline = snapshot.current;
            snapshot.changeCount = 0;
        }
    }

    updateFeedbackBaseline(file: TFile): void {
        const snapshot = this.noteSnapshots.get(file.path);
        if (snapshot) {
            snapshot.baseline = snapshot.current;
            snapshot.changeCount = 0;
        }
    }
} 