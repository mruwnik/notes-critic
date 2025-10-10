import { browserToolDefinition } from './Browser';
import { textEditorToolDefinition } from './TextEditor';
import { memoryToolDefinition } from './Memory';

export * from './TextEditor';
export * from './Browser';
export * from './Memory';

export const allTools = [
    browserToolDefinition,
    textEditorToolDefinition,
    memoryToolDefinition
]