import { useCallback, useState } from "react";
import { LLMProvider } from "llm/llmProvider";
import { ConversationTurn } from "types";
import { useApp, useSettings } from "./useSettings";

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

export const useHistoryManager = () => {
    const app = useApp();
    const { settings } = useSettings();
    const [history, setHistory] = useState<Map<string, History>>(new Map());
    const [historyList, setHistoryList] = useState<History[]>([]);

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

        const shortHistory = shortItem(historyItem);
        setHistory(prev => new Map(prev.set(historyItem.id, shortHistory)));
        
        // Update the array as well
        setHistoryList(prev => {
            const filtered = prev.filter(item => item.id !== historyItem.id);
            return [shortHistory, ...filtered].sort((a, b) => {
                if (!a.conversation?.[0]?.timestamp || !b.conversation?.[0]?.timestamp) {
                    return 0;
                }
                return b.conversation[0].timestamp.getTime() - a.conversation[0].timestamp.getTime();
            });
        });

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

        const compare = (a: History, b: History) => {
            if (!a.conversation?.[0]?.timestamp) {
                return -1;
            }
            if (a.conversation && b.conversation) {
                return b.conversation[0].timestamp.getTime() - a.conversation[0].timestamp.getTime();
            }
            return 0;
        }

        const items = await Promise.all(historyFiles.files.map(extractItem));
        const filteredItems = items.filter(item => item !== undefined && item.id !== undefined).sort(compare) as History[];
        
        // Update both the Map and the array state
        const historyMap = new Map<string, History>();
        filteredItems.forEach(item => historyMap.set(item.id, item));
        setHistory(historyMap);
        setHistoryList(filteredItems);
        
        return filteredItems;
    }, [app, settings.logPath]);

    return {
        history,
        historyList,
        saveHistory,
        loadHistory,
        listHistory,
        makeTitle
    };
};

