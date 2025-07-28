module.exports = {
  RuleManager: jest.fn().mockImplementation(() => ({
    loadRules: jest.fn(() => Promise.resolve([])),
    saveRules: jest.fn(() => Promise.resolve()),
    getRules: jest.fn(() => []),
    addRule: jest.fn(),
    removeRule: jest.fn(),
    updateRule: jest.fn(),
    getEnabledRules: jest.fn(() => []),
    initialize: jest.fn(() => Promise.resolve()),
    getMatchingRules: jest.fn(() => []),
    getEffectiveConfig: jest.fn(() => Promise.resolve({})),
    shouldAutoTrigger: jest.fn(() => Promise.resolve(false)),
    getFeedbackPrompt: jest.fn(() => Promise.resolve('Mock feedback prompt for ${notePath}: ${diff}'))
  }))
};