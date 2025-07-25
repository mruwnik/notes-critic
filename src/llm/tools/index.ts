import { browserToolDefinition } from './Browser';
import { textEditorToolDefinition } from './TextEditor';

export * from './TextEditor';
export * from './Browser';

export const allTools = [
    browserToolDefinition,
    textEditorToolDefinition
]