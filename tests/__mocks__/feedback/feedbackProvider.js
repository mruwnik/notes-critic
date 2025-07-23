// Create a more flexible mock that can be overridden per test
const defaultMockImplementation = async function* (conversation, settings, app) {
  // Check if this is a test scenario based on the conversation content
  const lastMessage = conversation[conversation.length - 1]?.userInput?.prompt || '';
  
  if (lastMessage.includes('Test abort')) {
    // Abort test scenario - yield one chunk, then yield another to trigger abort check
    yield { type: 'thinking', content: 'thinking...', id: 'think-1' };
    // This second yield should trigger the abort check
    yield { type: 'content', content: 'should not see this', id: 'content-1' };
    return;
  } else if (lastMessage.includes('error')) {
    // Error test scenario
    yield { type: 'error', content: 'Stream error', id: 'error-1' };
  } else if (lastMessage.includes('Test with tools')) {
    // Tool call test scenario
    yield {
      type: 'tool_call',
      id: 'tool-1',
      toolCall: {
        id: 'call-1',
        name: 'test_tool',
        input: { param: 'value' }
      }
    };
    yield {
      type: 'tool_call_result',
      id: 'tool-1',
      toolCallResult: {
        id: 'call-1',
        result: { output: 'result' }
      }
    };
    yield { type: 'content', content: 'Final response', id: 'content-1', isComplete: true };
  } else if (lastMessage.includes('Updated prompt')) {
    // Rerun test scenario
    yield { type: 'content', content: 'updated response', id: 'update-1', isComplete: true };
  } else {
    // Default scenario
    yield { type: 'thinking', content: 'thinking...', id: 'step-1' };
    yield { type: 'content', content: 'response content', id: 'step-2', isComplete: true };
  }
};

module.exports = {
  getFeedback: jest.fn().mockImplementation(defaultMockImplementation),
  generateDiff: jest.fn(() => 'mock diff')
};