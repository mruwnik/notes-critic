import { browserToolDefinition } from './Browser';
import { textEditorToolDefinition } from './TextEditor';
import { memoryToolDefinition } from './Memory';
import { ToolDefinition } from 'types';

export * from './TextEditor';
export * from './Browser';
export * from './Memory';

export const allTools = [
    browserToolDefinition,
    textEditorToolDefinition,
    memoryToolDefinition
]

export const createFunctionTool = (tool: ToolDefinition) => ({
    type: 'function',
    function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
    }
})
