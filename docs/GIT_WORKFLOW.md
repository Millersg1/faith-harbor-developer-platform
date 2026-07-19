# Faith Harbor OS Git Workflow

**Version:** 1.0  
**Author:** Pastor Shawn Miller  
**Status:** Approved

> **Governance:** This document shall be interpreted and maintained in accordance with the Faith Harbor Engineering Handbook.

---

## Purpose

This document defines the standard Git workflow for all Faith Harbor OS
development.

Following a consistent workflow keeps the repository stable, protects the main
branch, and ensures every feature is properly tested before being merged.

---

## Development Philosophy

Every change should be:

- Small
- Focused
- Tested
- Reviewed
- Documented

Never combine unrelated changes into a single commit.

---

## Standard Workflow

```text
Issue or Feature

↓

Create Feature Branch

↓

Develop

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

Review

↓

Merge
```

---

## Creating a Feature Branch

Always create a descriptive feature branch.

Examples:

```text
feature/multi-provider-ai

feature/ollama-support

feature/provider-metadata

feature/documentation

bugfix/provider-health
```

---

## Before Every Commit

Always run:

```bash
npm run typecheck
npm test
```

If either command fails:

Stop.

Fix the issue before committing.

---

## Commit Messages

Commit messages should be short and descriptive.

Examples:

```text
Add Ollama provider

Implement Provider Registry

Create Architecture Guide

Improve AI routing

Fix provider health checks
```

Avoid generic messages such as:

```text
Update

Fix

Changes

Stuff
```

---

## Pull Requests

Every Pull Request should:

- Focus on one feature or bug fix
- Pass all automated tests
- Compile successfully
- Include documentation updates if needed

---

## Main Branch

The main branch should always represent a stable, working version of Faith
Harbor OS.

Direct commits to the main branch are discouraged.

---

## Feature Branches

Delete feature branches after they are merged.

This keeps the repository clean.

---

## Code Reviews

Before merging, ask:

- Does the code follow engineering standards?
- Are tests included?
- Is the implementation simple?
- Can it be understood six months from now?

If the answer is "No," continue improving.

---

## Documentation

When appropriate, update:

- README
- Architecture Guide
- Engineering Standards
- Roadmap

Documentation is considered part of the feature.

---

## Engineering Principle

Working software is important.

Well-maintained software is even more valuable.

---

End of Git Workflow
