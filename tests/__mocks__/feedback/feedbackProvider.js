// Create a more flexible mock that can be overridden per test
const defaultMockImplementation = async function* () {
  yield { type: 'thinking', content: 'thinking...', id: 'step-1' };
  yield { type: 'content', content: 'response content', id: 'step-2' };
  yield { type: 'done', content: '', isComplete: true, id: 'step-3' };
};

module.exports = {
  getFeedback: jest.fn().mockImplementation(defaultMockImplementation),
  generateDiff: jest.fn(() => 'mock diff')
};