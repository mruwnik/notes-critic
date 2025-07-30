import { useCallback, useState } from "react";
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

const parseHistory = ({ id, title, conversation }: History): History => ({
    id,
    title,
    conversation: conversation?.map(loadTurn)
});

export const useHistoryManager = (settings: NotesCriticSettings, app: App) => {
    const [history, setHistory] = useState<Record<string, History>>({});

    const logName = useCallback((id: string): string => {
        return `${settings.logPath}/${id}.json`;
    }, [settings.logPath]);

    const makeTitle = useCallback(async (conversation: ConversationTurn[]): Promise<string> => {
        const provider = new LLMProvider({ ...settings, model: settings.summarizerModel }, app);
        const title = await provider.makeTitle(conversation);
        return title;
    }, [settings, app]);

    const saveHistory = useCallback(async (historyItem: History): Promise<string> => {
        if (!historyItem.conversation || historyItem.conversation.length === 0) {
            return historyItem.id;
        }

        historyItem.title = await makeTitle(historyItem.conversation);

        if (!await app.vault.adapter.exists(settings.logPath)) {
            await app.vault.adapter.mkdir(settings.logPath);
        }

        await app.vault.adapter.write(logName(historyItem.id), JSON.stringify(historyItem));

        setHistory(prev => ({
            ...prev,
            [historyItem.id]: shortItem(historyItem)
        }));

        return historyItem.title;
    }, [settings.logPath, app, logName, makeTitle]);

    const loadHistory = useCallback(async (id: string): Promise<History | undefined> => {
        if (!await app.vault.adapter.exists(logName(id))) {
            return undefined;
        }

        const historyFile = await app.vault.adapter.read(logName(id));
        if (!historyFile) {
            return undefined;
        }

        return parseHistory(JSON.parse(historyFile));
    }, [app, logName]);

    const listHistory = useCallback(async (): Promise<History[]> => {
        const historyFiles = await app.vault.adapter.list(settings.logPath);
        if (!historyFiles) {
            return [];
        }

        const extractItem = async (file: string): Promise<History | undefined> => {
            const historyFile = await app.vault.adapter.read(file);
            return historyFile ? shortItem(JSON.parse(historyFile)) : undefined;
        };

        const items = await Promise.all(historyFiles.files.map(extractItem));
        return items.filter(item => item !== undefined && item.id !== undefined) as History[];
    }, [app, settings.logPath]);

    return {
        history,
        saveHistory,
        loadHistory,
        listHistory,
        makeTitle
    };
};

