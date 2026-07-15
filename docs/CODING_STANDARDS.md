# Faith Harbor OS Coding Standards

**Version:** 1.0  
**Author:** Pastor Shawn Miller  
**Status:** Approved

> **Governance:** This document shall be interpreted and maintained in accordance with the Faith Harbor Engineering Handbook.

---

## Purpose

This document defines the coding standards for Faith Harbor OS.

Following these standards ensures the codebase remains consistent, readable,
maintainable, and easy to extend.

---

## General Principles

Code should be:

- Simple
- Readable
- Testable
- Maintainable
- Consistent

Always prefer clarity over cleverness.

---

## Single Responsibility

Each class should have one responsibility.

Each method should perform one task.

If a class becomes difficult to describe in one sentence, it should probably be
split into multiple classes.

---

## Naming

Use descriptive names.

Good examples:

- ProviderRegistry
- ProviderManager
- AIRequestDirector
- OllamaProvider

Avoid abbreviations unless they are universally understood.

---

## Methods

Methods should:

- Be short.
- Perform one task.
- Have descriptive names.
- Return predictable results.

Avoid deeply nested logic.

---

## Comments

Write comments that explain **why**, not **what**.

Good:

```typescript
// Register the provider so it can participate in request routing.
```

Avoid:

```typescript
// Call register().
registry.register(provider);
```

The code already explains what it does.

---

## Interfaces

Depend on interfaces whenever practical.

Application code should depend on abstractions instead of concrete
implementations.

---

## Dependency Injection

Prefer constructor injection.

Avoid creating dependencies inside business logic.

---

## Error Handling

Throw meaningful errors.

Error messages should help developers understand what went wrong.

Example:

```text
No AI provider supports capability "writing".
```

Avoid vague messages like:

```text
Something went wrong.
```

---

## Testing

Every public class should have unit tests.

Tests should be:

- Independent
- Readable
- Repeatable

---

## Formatting

Use the project's formatting tools.

Do not manually fight automated formatting.

Consistency is more important than personal preference.

---

## Imports

Group imports logically:

1. External libraries
2. Internal modules
3. Type imports

Remove unused imports.

---

## Architecture

Never violate the architecture.

Responsibilities belong in their designated layer.

When in doubt, consult:

- ARCHITECTURE.md
- ENGINEERING_STANDARDS.md

---

## Refactoring

Improve code whenever appropriate.

Small, continuous improvements are preferred over large rewrites.

---

## Engineering Principle

Write code for the next developer.

That next developer might be you six months from now.

---

## Faith Harbor Principle

Every line of code should reflect the quality we want associated with the Faith Harbor name.

Choose excellence over shortcuts.

---

End of Coding Standards
