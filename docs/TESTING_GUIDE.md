# Faith Harbor OS Testing Guide

**Version:** 1.0  
**Author:** Pastor Shawn Miller  
**Status:** Approved

---

## Purpose

Testing ensures that Faith Harbor OS remains reliable as the platform grows.

Every new feature should include automated tests.

---

## Philosophy

We do not test to increase coverage numbers.

We test to ensure confidence.

A passing test suite means developers can safely improve the system without fear
of breaking existing functionality.

---

## Testing Framework

Faith Harbor OS uses:

- Vitest

All tests should be deterministic.

Tests should never depend on external AI services.

---

## Unit Tests

Every public class should include tests covering:

- Construction
- Successful execution
- Failure scenarios
- Edge cases

---

## Mocking

External services should always be mocked.

Examples include:

- OpenAI
- Anthropic
- OpenRouter
- Ollama

Tests should never require Internet connectivity.

---

## Naming Convention

Every source file should have a matching test file.

Example:

```text
ProviderRegistry.ts
ProviderRegistry.test.ts
```

---

## Test Organization

Arrange

↓

Act

↓

Assert

Keep each section clearly separated.

---

## Test Independence

Every test must be capable of running independently.

Tests should never depend on execution order.

---

## Coverage Goals

Focus on meaningful coverage rather than percentages.

Priority:

1. Business logic
2. Provider routing
3. AI execution
4. Failure handling

---

## Regression Testing

Whenever a bug is fixed:

Create a test first.

Then implement the fix.

The bug should never return.

---

## Continuous Validation

Before every commit:

```shell
npm run typecheck
npm test
```

Both commands must succeed before code is committed.

---

## Build Pipeline

Development follows this workflow:

Implement Feature

↓

Type Check

↓

Run Tests

↓

Review

↓

Commit

↓

Push

↓

Pull Request

↓

Merge

---

## Engineering Principle

A feature is not complete until it is tested.

---

End of Testing Guide
