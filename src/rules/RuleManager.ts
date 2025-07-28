import { App, normalizePath } from 'obsidian';
import { NotesCriticRule, RuleMatch, NotesCriticSettings } from 'types';
import { Minimatch } from 'minimatch';

interface RuleFile {
    content: string;
    path: string;
}

export class RuleManager {
    private app: App;
    private rules: NotesCriticRule[] = [];
    private ruleCache = new Map<string, RuleMatch[]>();
    private lastScanTime = 0;

    constructor(app: App) {
        this.app = app;
    }

    async initialize(): Promise<void> {
        await this.scanAndLoadRules();
    }

    async fetchFile(path: string): Promise<RuleFile> {
        const content = await this.app.vault.adapter.read(path);
        return { content, path };
    }

    private async getRuleFiles(path: string = "/"): Promise<RuleFile[]> {
        const files = await this.app.vault.adapter.list(path);
        return [
            ...await Promise.all(files.files.filter(file => file?.includes('.notes-critic/rules/')).map(file => this.fetchFile(file))),
            ...await Promise.all(files.folders.map(folder => this.getRuleFiles(folder)))
        ].flat()

    }

    /**
     * Scan for rule files in .notes-critic/rules/ directories throughout the vault
     */
    private async scanAndLoadRules(): Promise<void> {
        this.rules = [];
        this.ruleCache.clear();

        const files = await this.getRuleFiles();
        for (const file of files) {
            try {
                const rule = await this.parseRuleFile(file);
                if (rule && rule.enabled) {
                    this.rules.push(rule);
                }
            } catch (error) {
                console.error(`Error parsing rule file ${file.path}:`, error);
            }
        }

        // Sort by priority (higher priority first)
        this.rules.sort((a, b) => (b.priority || 0) - (a.priority || 0));
        this.lastScanTime = Date.now();
    }

    /**
     * Parse a markdown rule file with YAML frontmatter
     */
    private async parseRuleFile(file: RuleFile): Promise<NotesCriticRule | null> {
        const content = file.content;

        // Split frontmatter and content
        const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
        if (!frontmatterMatch) {
            console.warn(`Rule file ${file.path} missing frontmatter`);
            return null;
        }

        const [, frontmatterText, markdownContent] = frontmatterMatch;

        try {
            const frontmatter = this.parseYaml(frontmatterText);

            return {
                name: frontmatter.name || file.path,
                enabled: frontmatter.enabled ?? true,
                priority: frontmatter.priority || 0,
                globs: Array.isArray(frontmatter.globs) ? frontmatter.globs : [],
                exclude: frontmatter.exclude || [],
                autoTrigger: frontmatter.autoTrigger ?? true,
                feedbackThreshold: frontmatter.feedbackThreshold,
                feedbackCooldownSeconds: frontmatter.feedbackCooldownSeconds,
                model: frontmatter.model,
                maxTokens: frontmatter.maxTokens,
                maxHistoryTokens: frontmatter.maxHistoryTokens,
                thinkingBudgetTokens: frontmatter.thinkingBudgetTokens,
                filePath: file.path,
                content: markdownContent.trim()
            };
        } catch (error) {
            console.error(`Error parsing frontmatter in ${file.path}:`, error);
            return null;
        }
    }

    /**
     * Simple YAML parser for frontmatter (basic implementation)
     */
    private parseYaml(yamlText: string): any {
        const result: any = {};
        const lines = yamlText.split('\n');
        let currentKey: string | null = null;
        let currentArray: string[] | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const trimmed = line.trim();

            if (!trimmed || trimmed.startsWith('#')) continue;

            // Check if this is an array item continuation
            if (currentArray && trimmed.startsWith('-')) {
                const item = trimmed.slice(1).trim().replace(/^["']|["']$/g, '');
                if (item) {
                    currentArray.push(item);
                }
                continue;
            }

            // If we were building an array and this line doesn't start with '-', finish the array
            if (currentArray && currentKey) {
                result[currentKey] = currentArray;
                currentArray = null;
                currentKey = null;
            }

            // Handle key-value pairs
            const colonIndex = trimmed.indexOf(':');
            if (colonIndex === -1) continue;

            const key = trimmed.slice(0, colonIndex).trim();
            let value = trimmed.slice(colonIndex + 1).trim();

            // Parse different value types
            if (value.startsWith('[') && value.endsWith(']')) {
                // Inline array
                const arrayContent = value.slice(1, -1);
                result[key] = arrayContent.split(',')
                    .map(item => item.trim().replace(/^["']|["']$/g, ''))
                    .filter(item => item.length > 0);
            } else if (value === '' || value === '-') {
                // Start of multi-line array or empty value
                // Look ahead to see if next line is an array item
                if (i + 1 < lines.length && lines[i + 1].trim().startsWith('-')) {
                    currentKey = key;
                    currentArray = [];
                } else {
                    result[key] = '';
                }
            } else if (value === 'true') {
                result[key] = true;
            } else if (value === 'false') {
                result[key] = false;
            } else if (!isNaN(Number(value))) {
                result[key] = Number(value);
            } else {
                // String value (remove quotes if present)
                result[key] = value.replace(/^["']|["']$/g, '');
            }
        }

        // Don't forget the last array if we ended while building one
        if (currentArray && currentKey) {
            result[currentKey] = currentArray;
        }

        return result;
    }

    /**
     * Find matching rules for a given file path
     */
    async getMatchingRules(filePath: string): Promise<RuleMatch[]> {
        // Check if we need to rescan rules
        if (Date.now() - this.lastScanTime > 10000) { // 10 seconds cache
            await this.scanAndLoadRules();
        }

        // Check cache first
        if (this.ruleCache.has(filePath)) {
            return this.ruleCache.get(filePath)!;
        }

        const matches: RuleMatch[] = [];
        const normalizedPath = normalizePath(filePath);

        for (const rule of this.rules) {
            // Check exclude patterns first
            if (rule.exclude?.some(pattern => new Minimatch(pattern).match(normalizedPath))) {
                continue;
            }

            // Check include patterns
            for (const glob of (rule.globs || [])) {
                if (new Minimatch(glob).match(normalizedPath)) {
                    matches.push({ rule, matchedPattern: glob });
                    break; // Only count first match per rule
                }
            }
        }

        // Cache the result
        this.ruleCache.set(filePath, matches);
        return matches;
    }

    /**
     * Get effective configuration for a file by merging global settings with rule overrides
     */
    async getEffectiveConfig(filePath: string, globalSettings: NotesCriticSettings): Promise<NotesCriticSettings & { matchedRules: RuleMatch[] }> {
        const matches = await this.getMatchingRules(filePath);

        // Start with global settings
        let effectiveConfig = { ...globalSettings };

        // Apply rule overrides in priority order (highest first)
        for (const match of matches) {
            const rule = match.rule;

            // Override settings if defined in rule
            if (rule.feedbackThreshold !== undefined) effectiveConfig.feedbackThreshold = rule.feedbackThreshold;
            if (rule.feedbackCooldownSeconds !== undefined) effectiveConfig.feedbackCooldownSeconds = rule.feedbackCooldownSeconds;
            if (rule.systemPrompt !== undefined) effectiveConfig.systemPrompt = rule.systemPrompt;
            if (rule.model !== undefined) effectiveConfig.model = rule.model;
            if (rule.maxTokens !== undefined) effectiveConfig.maxTokens = rule.maxTokens;
            if (rule.maxHistoryTokens !== undefined) effectiveConfig.maxHistoryTokens = rule.maxHistoryTokens;
            if (rule.thinkingBudgetTokens !== undefined) effectiveConfig.thinkingBudgetTokens = rule.thinkingBudgetTokens;
            if (rule.content) {
                effectiveConfig.feedbackPrompt = rule.content;
            }
        }

        return {
            ...effectiveConfig,
            matchedRules: matches
        };
    }

    async getFeedbackPrompt(filePath: string, globalSettings: NotesCriticSettings): Promise<string> {
        const config = await this.getEffectiveConfig(filePath, globalSettings);
        return config.feedbackPrompt;
    }

    /**
     * Check if auto-triggering is enabled for a file
     */
    async shouldAutoTrigger(filePath: string): Promise<boolean> {
        const matches = await this.getMatchingRules(filePath);

        // If any matching rule has autoTrigger: false, don't auto-trigger
        return matches.length === 0 || matches.every(match => match.rule.autoTrigger !== false);
    }

    /**
     * Get all currently loaded rules
     */
    getRules(): NotesCriticRule[] {
        return [...this.rules];
    }

    /**
     * Force refresh rules from disk
     */
    async refreshRules(): Promise<void> {
        await this.scanAndLoadRules();
    }
} 