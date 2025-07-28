import { LLMProvider } from "llm/llmProvider";
import { App } from "obsidian";
import { ConversationTurn, NotesCriticSettings } from "types";

export interface History {
    id: string;
    title: string;
    conversation?: ConversationTurn[];
}

const shortItem = ({ id, title }: History): History => ({ id, title });

const loadTurn = (turn: ConversationTurn): ConversationTurn => ({
    ...turn,
    timestamp: new Date(turn.timestamp)
});
const parseHistory = ({ id, title, conversation }: History): History => ({ id, title, conversation: conversation?.map(loadTurn) });


export class HistoryManager {
    private history: Record<string, History> = {};

    constructor(
        private readonly settings: NotesCriticSettings,
        private readonly app: App
    ) {
    }

    private logName(id: string): string {
        return `${this.settings.logPath}/${id}.json`;
    }

    public async makeTitle(conversation: ConversationTurn[]): Promise<string> {
        const provider = new LLMProvider({ ...this.settings, model: this.settings.summarizerModel }, this.app);
        const title = await provider.makeTitle(conversation);
        return title;
    }

    public async saveHistory(history: History): Promise<string> {
        if (!history.conversation || history.conversation.length === 0) {
            return history.id;
        }
        history.title = await this.makeTitle(history.conversation);
        if (!await this.app.vault.adapter.exists(this.settings.logPath)) {
            await this.app.vault.adapter.mkdir(this.settings.logPath);
        }
        await this.app.vault.adapter.write(this.logName(history.id), JSON.stringify(history));
        this.history[history.id] = shortItem(history);
        return history.title;
    }

    public async loadHistory(id: string): Promise<History | undefined> {
        if (!await this.app.vault.adapter.exists(this.logName(id))) {
            return undefined;
        }
        const historyFile = await this.app.vault.adapter.read(this.logName(id));
        if (!historyFile) {
            return undefined;
        }
        return parseHistory(JSON.parse(historyFile));
    }

    public async listHistory(): Promise<History[]> {
        const historyFiles = await this.app.vault.adapter.list(this.settings.logPath);
        if (!historyFiles) {
            return [];
        }

        const extractItem = async (file: string): Promise<History | undefined> => {
            const historyFile = await this.app.vault.adapter.read(file);
            return historyFile ? shortItem(JSON.parse(historyFile)) : undefined;
        }

        const items = await Promise.all(historyFiles.files.map(extractItem));
        return items.filter(item => item !== undefined && item.id !== undefined) as History[];
    }
}