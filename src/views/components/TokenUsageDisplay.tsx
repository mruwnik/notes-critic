import React, { useState, useCallback, useRef, useEffect } from 'react';
import { TokenUsage } from 'types';
import { TokenTracker, ConversationTokens, SessionTokens } from 'services/TokenTracker';

interface TokenUsageDisplayProps {
    tokenTracker: TokenTracker;
    currentConversationId?: string;
    currentModel?: string;
    className?: string;
}

interface DetailedViewProps {
    conversationTokens: ConversationTokens | null;
    sessionTokens: SessionTokens;
    tokenTracker: TokenTracker;
    currentModel?: string;
    onClose: () => void;
}

const DetailedView: React.FC<DetailedViewProps> = ({ 
    conversationTokens, 
    sessionTokens, 
    tokenTracker, 
    currentModel,
    onClose 
}) => {
    const popupRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (popupRef.current && !popupRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        const handleEscapeKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                onClose();
            }
        };

        // Add event listeners
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscapeKey);
        
        // Cleanup event listeners on component unmount
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscapeKey);
        };
    }, [onClose]);
    const formatDuration = (ms: number) => {
        const minutes = Math.floor(ms / 60000);
        const hours = Math.floor(minutes / 60);
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        }
        return `${minutes}m`;
    };

    const sessionDuration = Date.now() - sessionTokens.startTime;
    const sessionCost = tokenTracker.estimateCost({
        inputTokens: sessionTokens.totalInputTokens,
        outputTokens: sessionTokens.totalOutputTokens,
        totalTokens: sessionTokens.totalTokens
    }, currentModel);

    const conversationCost = conversationTokens ? tokenTracker.estimateCost({
        inputTokens: conversationTokens.totalInputTokens,
        outputTokens: conversationTokens.totalOutputTokens,
        totalTokens: conversationTokens.totalTokens
    }, currentModel) : null;

    return (
        <div 
            ref={popupRef} 
            className="nc-card nc-absolute nc-z-1000 nc-bg-primary nc-border nc-rounded-lg nc-shadow-md nc-text-sm nc-left-0 nc-p-3"
            style={{
                top: '-220px',
                minWidth: '200px',
                maxWidth: '250px'
            }}
        >
            <div className="nc-flex nc-justify-between nc-items-center nc-mb-2">
                <strong>Token Usage Details</strong>
                <button 
                    onClick={onClose}
                    className="nc-btn nc-btn--ghost nc-btn--xs"
                    title="Close"
                >
                    ✕
                </button>
            </div>

            {conversationTokens && (
                <div className="nc-mb-3">
                    <div className="nc-font-semibold nc-mb-2">Current Conversation</div>
                    <div className="nc-text-xs nc-leading-normal nc-space-y-1">
                        <div className="nc-flex nc-justify-between">
                            <span>Input:</span>
                            <span>{tokenTracker.formatTokenCount(conversationTokens.totalInputTokens)}</span>
                        </div>
                        <div className="nc-flex nc-justify-between">
                            <span>Output:</span>
                            <span>{tokenTracker.formatTokenCount(conversationTokens.totalOutputTokens)}</span>
                        </div>
                        <div className="nc-flex nc-justify-between">
                            <span>Total:</span>
                            <span>{tokenTracker.formatTokenCount(conversationTokens.totalTokens)}</span>
                        </div>
                        {conversationCost && (
                            <div className="nc-flex nc-justify-between">
                                <span>Cost:</span>
                                <span>{tokenTracker.formatCost(conversationCost.totalCost)}</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            <div>
                <div className="nc-font-semibold nc-mb-2">Session ({formatDuration(sessionDuration)})</div>
                <div className="nc-text-xs nc-leading-normal nc-space-y-1">
                    <div className="nc-flex nc-justify-between">
                        <span>Input:</span>
                        <span>{tokenTracker.formatTokenCount(sessionTokens.totalInputTokens)}</span>
                    </div>
                    <div className="nc-flex nc-justify-between">
                        <span>Output:</span>
                        <span>{tokenTracker.formatTokenCount(sessionTokens.totalOutputTokens)}</span>
                    </div>
                    <div className="nc-flex nc-justify-between">
                        <span>Total:</span>
                        <span>{tokenTracker.formatTokenCount(sessionTokens.totalTokens)}</span>
                    </div>
                    <div className="nc-flex nc-justify-between">
                        <span>Cost:</span>
                        <span>{tokenTracker.formatCost(sessionCost.totalCost)}</span>
                    </div>
                    <div className="nc-flex nc-justify-between">
                        <span>Conversations:</span>
                        <span>{sessionTokens.conversationCount}</span>
                    </div>
                    {currentModel && (
                        <div className="nc-mt-1">
                            <div className="nc-font-medium nc-text-xs nc-text-muted">
                                Model: {currentModel.split('/').pop()}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="nc-mt-2 nc-pt-2 nc-border-t nc-text-xs nc-text-muted">
                Cost estimates are approximate and may vary by provider
            </div>
        </div>
    );
};

export const TokenUsageDisplay: React.FC<TokenUsageDisplayProps> = ({ 
    tokenTracker, 
    currentConversationId, 
    currentModel,
    className = '' 
}) => {
    const [showDetailed, setShowDetailed] = useState(false);
    const [, forceUpdate] = useState({});

    // Force component re-render when tokens are updated
    useEffect(() => {
        const unsubscribe = tokenTracker.addListener(() => {
            forceUpdate({});
        });

        return unsubscribe;
    }, [tokenTracker]);

    const sessionTokens = tokenTracker.getSessionTokens();
    const conversationTokens = currentConversationId ? 
        tokenTracker.getConversationTokens(currentConversationId) : null;

    const handleClick = useCallback(() => {
        setShowDetailed(!showDetailed);
    }, [showDetailed]);

    const handleClose = useCallback(() => {
        setShowDetailed(false);
    }, []);

    // Show most relevant token count - conversation if available, otherwise session
    const displayTokens = conversationTokens || sessionTokens;
    const displayCount = tokenTracker.formatTokenCount(displayTokens.totalTokens);
    
    const cost = tokenTracker.estimateCost({
        inputTokens: displayTokens.totalInputTokens,
        outputTokens: displayTokens.totalOutputTokens,
        totalTokens: displayTokens.totalTokens
    }, currentModel);

    return (
        <div 
            className={`token-usage-display nc-relative ${className}`}
        >
            <div
                onClick={handleClick}
                className={`nc-interactive nc-px-2 nc-py-1 nc-rounded nc-text-xs nc-flex nc-items-center nc-gap-2 nc-text-muted ${showDetailed ? 'nc-bg-modifier-hover' : ''}`}
                title={`Click for details\nInput: ${tokenTracker.formatTokenCount(displayTokens.totalInputTokens)} | Output: ${tokenTracker.formatTokenCount(displayTokens.totalOutputTokens)}\nEstimated cost: ${tokenTracker.formatCost(cost.totalCost)}`}
            >
                <span>🪙</span>
                <span>{displayCount}</span>
                {cost.totalCost > 0 && (
                    <span className="nc-text-xs">({tokenTracker.formatCost(cost.totalCost)})</span>
                )}
            </div>

            {showDetailed && (
                <DetailedView
                    conversationTokens={conversationTokens}
                    sessionTokens={sessionTokens}
                    tokenTracker={tokenTracker}
                    currentModel={currentModel}
                    onClose={handleClose}
                />
            )}
        </div>
    );
};