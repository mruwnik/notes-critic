module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/__tests__/**/*.+(ts|tsx|js)',
    '**/*.(test|spec).+(ts|tsx|js)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/tests/__mocks__/obsidian.js',
    '^types$': '<rootDir>/src/types/index.ts',
    '^types/(.*)$': '<rootDir>/src/types/$1',
    '^views/(.*)$': '<rootDir>/tests/__mocks__/views/$1.js',
    '^settings/(.*)$': '<rootDir>/tests/__mocks__/settings/$1.js',
    '^llm/(.*)$': '<rootDir>/tests/__mocks__/llm/$1.js',
    '^conversation/(.*)$': '<rootDir>/src/conversation/$1',
    '^feedback/(.*)$': '<rootDir>/tests/__mocks__/feedback/$1.js',
    '^rules/(.*)$': '<rootDir>/src/rules/$1',
    '^diffs$': '<rootDir>/src/diffs.ts',
    'src/llm/mcpClient': '<rootDir>/tests/__mocks__/llm/mcpClient.js'
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/constants.ts',
    '!src/main.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  testTimeout: 30000,
  maxWorkers: 1
};