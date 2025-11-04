import { TokenUsage } from 'types';
import { AVAILABLE_MODELS } from '../constants';

export interface ConversationTokens {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    lastUpdateTime: number;
    conversationId: string;
}

export interface SessionTokens {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalTokens: number;
    conversationCount: number;
    startTime: number;
    lastUpdateTime: number;
}

export class TokenTracker {
    private conversationTokens = new Map<string, ConversationTokens>();
    private sessionTokens: SessionTokens;
    private listeners: Set<() => void> = new Set();

    constructor() {
        this.sessionTokens = {
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalTokens: 0,
            conversationCount: 0,
            startTime: Date.now(),
            lastUpdateTime: Date.now()
        };
    }

    addUsage(conversationId: string, usage: TokenUsage): void {
        const now = Date.now();

        // Update conversation tokens
        console.log("adding usage", conversationId, usage);
        let convTokens = this.conversationTokens.get(conversationId);
        if (!convTokens) {
            convTokens = {
                totalInputTokens: 0,
                totalOutputTokens: 0,
                totalTokens: 0,
                lastUpdateTime: now,
                conversationId
            };
            this.conversationTokens.set(conversationId, convTokens);
            this.sessionTokens.conversationCount++;
        }

        convTokens.totalInputTokens += usage.inputTokens;
        convTokens.totalOutputTokens += usage.outputTokens;
        convTokens.totalTokens += usage.totalTokens;
        convTokens.lastUpdateTime = now;

        // Update session tokens
        this.sessionTokens.totalInputTokens += usage.inputTokens;
        this.sessionTokens.totalOutputTokens += usage.outputTokens;
        this.sessionTokens.totalTokens += usage.totalTokens;
        this.sessionTokens.lastUpdateTime = now;

        // Notify listeners of the update
        this.notifyListeners();
    }

    getConversationTokens(conversationId: string): ConversationTokens | null {
        return this.conversationTokens.get(conversationId) || null;
    }

    getSessionTokens(): SessionTokens {
        return { ...this.sessionTokens };
    }

    clearConversation(conversationId: string): void {
        this.conversationTokens.delete(conversationId);
    }

    restoreConversationTokens(conversationTokens: ConversationTokens): void {
        // Restore conversation tokens from saved history without affecting session tokens
        this.conversationTokens.set(conversationTokens.conversationId, conversationTokens);
        this.notifyListeners();
    }

    resetSession(): void {
        this.conversationTokens.clear();
        this.sessionTokens = {
            totalInputTokens: 0,
            totalOutputTokens: 0,
            totalTokens: 0,
            conversationCount: 0,
            startTime: Date.now(),
            lastUpdateTime: Date.now()
        };
    }

    estimateCost(usage: TokenUsage, model?: string): { inputCost: number; outputCost: number; totalCost: number } {
        const rates = this.getModelRates(model);

        const inputCost = (usage.inputTokens / 1000000) * rates.inputCostPer1M;
        const outputCost = (usage.outputTokens / 1000000) * rates.outputCostPer1M;

        return {
            inputCost,
            outputCost,
            totalCost: inputCost + outputCost
        };
    }

    private getModelRates(model?: string): { inputCostPer1M: number; outputCostPer1M: number } {
        const modelConfig = AVAILABLE_MODELS[model as keyof typeof AVAILABLE_MODELS];
        if (modelConfig) {
            return {
                inputCostPer1M: modelConfig.inputCostPer1M || 0,
                outputCostPer1M: modelConfig.outputCostPer1M || 0
            };
        }

        return { inputCostPer1M: 3, outputCostPer1M: 15 };
    }

    // Format tokens for display
    formatTokenCount(count: number): string {
        if (count < 1000) {
            return count.toString();
        }
        if (count < 1000000) {
            return `${(count / 1000).toFixed(1)}K`;
        }
        return `${(count / 1000000).toFixed(1)}M`;
    }

    // Format cost for display
    formatCost(cost: number): string {
        if (cost < 0.01) {
            return '<$0.01';
        }
        return `$${cost.toFixed(cost < 1 ? 3 : 2)}`;
    }

    // Event system for real-time updates
    addListener(callback: () => void): () => void {
        this.listeners.add(callback);
        // Return unsubscribe function
        return () => {
            this.listeners.delete(callback);
        };
    }

    private notifyListeners(): void {
        this.listeners.forEach(callback => {
            try {
                callback();
            } catch (error) {
                console.error('Error in token tracker listener:', error);
            }
        });
    }
}