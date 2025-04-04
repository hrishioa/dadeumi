# Dadeumi Test Suite

This directory contains tests for the Dadeumi translation tool.

## Running Tests

To run all tests:

```bash
bun test
```

To run only unit tests:

```bash
bun test:unit
```

To run only integration tests:

```bash
bun test:integration
```

To generate coverage reports:

```bash
bun test:coverage
```

## Test Structure

- `test/unit/`: Unit tests for individual components
- `test/integration/`: Integration tests for combined components
- `test/fixtures/`: Test data files
- `test/mocks/`: Mock implementations for testing

## Writing Tests

### Unit Tests

Unit tests should test individual functions or classes in isolation. Use mocks to avoid dependencies on external systems.

```typescript
import { describe, test, expect } from "bun:test";
import { myFunction } from "../../src/utils/myModule";

describe("My Function", () => {
  test("should return expected result", () => {
    const result = myFunction(input);
    expect(result).toBe(expectedOutput);
  });
});
```

### Integration Tests

Integration tests verify that multiple components work together correctly.

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { ComponentA } from "../../src/componentA";
import { ComponentB } from "../../src/componentB";

describe("Component Integration", () => {
  let componentA: ComponentA;
  let componentB: ComponentB;

  beforeEach(() => {
    componentA = new ComponentA();
    componentB = new ComponentB(componentA);
  });

  test("components should work together", () => {
    const result = componentB.performOperationUsingA();
    expect(result).toEqual(expectedOutput);
  });
});
```

## Mocks

The `mocks` directory contains mock implementations for external dependencies:

- `ai-service.mock.ts`: Mocks the AI service for testing without API calls

Example usage:

```typescript
import { MockAiService } from "../mocks/ai-service.mock";

const mockService = new MockAiService();
// Configure mock responses
mockService.getProvider().setMockResponse("keyword", "Mock response");

// Use in tests
const result = await myFunction(mockService);
```
