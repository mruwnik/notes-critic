# Notes Critic Plugin Tests

This directory contains comprehensive unit tests for the Notes Critic Obsidian plugin.

## Test Structure

```
tests/
├── __mocks__/              # Mock implementations for external dependencies
├── setup.ts               # Test environment setup and global mocks
├── main.test.ts           # Main plugin functionality tests
├── conversation/          # Conversation management tests
├── llm/                   # LLM provider and related functionality tests
├── views/                 # UI component tests
├── settings/              # Settings and configuration tests
├── rules/                 # Rule management tests
├── types/                 # Type definitions and constants tests
└── README.md              # This file
```

## Running Tests

### Basic Commands

```bash
# Run all tests
npm test

# Run tests in watch mode (automatically re-runs on file changes)
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Advanced Usage

```bash
# Run specific test file
npx jest tests/main.test.ts

# Run tests matching a pattern
npx jest conversation

# Run tests with verbose output
npx jest --verbose

# Run tests and update snapshots
npx jest --updateSnapshot

# Run tests with specific timeout
npx jest --testTimeout=30000
```

## Test Coverage

The test suite aims for high coverage across all components:

- **Core Functionality**: ConversationManager, LLMProvider, main plugin
- **UI Components**: ChatView, settings tabs, feedback display
- **Rule System**: RuleManager, rule matching and parsing
- **Utilities**: File handling, streaming, OAuth client

### Coverage Thresholds

- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

### Coverage Reports

Coverage reports are generated in multiple formats:
- **Text**: Console output during test runs
- **HTML**: Interactive report in `coverage/lcov-report/index.html`
- **LCOV**: Machine-readable format in `coverage/lcov.info`
- **JSON**: Structured data in `coverage/coverage-final.json`

## Test Environment

### Mocked Dependencies

The test environment includes comprehensive mocks for:

- **Obsidian API**: Plugin, Notice, TFile, WorkspaceLeaf, ItemView, etc.
- **DOM APIs**: localStorage, fetch, document elements
- **External Libraries**: LLM providers, MCP client, file utilities

### Test Utilities

Common test utilities are provided in `tests/setup.ts`:

- Mock Obsidian app instance with workspace and vault
- Mock file system operations
- Mock network requests
- Global Jest configuration

## Writing Tests

### Test Structure

Follow this pattern for new tests:

```typescript
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ComponentToTest } from '../../src/path/to/component';

// Mock external dependencies
jest.mock('../../src/dependency', () => ({
  MockedClass: jest.fn()
}));

describe('ComponentToTest', () => {
  let component: ComponentToTest;
  let mockDependency: any;

  beforeEach(() => {
    // Setup test state
    mockDependency = jest.fn();
    component = new ComponentToTest(mockDependency);
  });

  afterEach(() => {
    // Clean up
    jest.clearAllMocks();
  });

  describe('method name', () => {
    it('should do expected behavior', () => {
      // Arrange
      const input = 'test input';
      
      // Act
      const result = component.method(input);
      
      // Assert
      expect(result).toEqual('expected output');
      expect(mockDependency).toHaveBeenCalledWith(input);
    });
  });
});
```

### Best Practices

1. **Test Behavior, Not Implementation**: Focus on what the code does, not how it does it
2. **Comprehensive Coverage**: Test happy paths, error cases, and edge cases
3. **Clear Test Names**: Use descriptive names that explain what is being tested
4. **Isolated Tests**: Each test should be independent and not rely on others
5. **Mock External Dependencies**: Mock Obsidian API, file system, network calls
6. **Async Testing**: Properly handle promises and async operations
7. **Error Testing**: Test error conditions and error handling

### Debugging Tests

```bash
# Run a single test file with debugging
node --inspect-brk node_modules/.bin/jest tests/specific.test.ts --runInBand

# Run with increased timeout for debugging
npx jest --testTimeout=300000

# Run with verbose logging
DEBUG=* npm test
```

## Continuous Integration

Tests should be run in CI/CD pipelines to ensure code quality:

```bash
# Install dependencies
npm ci

# Run linting
npm run lint

# Run tests with coverage
npm run test:coverage

# Build the plugin
npm run build
```

## Troubleshooting

### Common Issues

1. **TypeScript Errors**: Ensure types are properly imported and mocked
2. **Mock Issues**: Check that mocks are properly configured in `setup.ts`
3. **Async Test Failures**: Use proper async/await and test timeouts
4. **DOM Errors**: Ensure jsdom environment is properly configured

### Debugging Tips

1. Use `console.log` in tests for debugging (remove before committing)
2. Use `jest.fn().mockImplementation()` for complex mock behaviors
3. Check mock call history with `expect().toHaveBeenCalledWith()`
4. Use `--verbose` flag to see detailed test output

## Contributing

When adding new functionality:

1. Write tests before implementation (TDD approach preferred)
2. Ensure tests cover both success and failure scenarios
3. Update this README if adding new test patterns or utilities
4. Maintain or improve overall test coverage percentage