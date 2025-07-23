module.exports = {
  RuleManager: jest.fn().mockImplementation(() => ({
    loadRules: jest.fn(() => Promise.resolve([])),
    saveRules: jest.fn(() => Promise.resolve()),
    getRules: jest.fn(() => []),
    addRule: jest.fn(),
    removeRule: jest.fn(),
    updateRule: jest.fn(),
    getEnabledRules: jest.fn(() => [])
  }))
};