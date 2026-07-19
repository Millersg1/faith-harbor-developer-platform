# Workflow Engine

## Purpose

The Workflow Engine coordinates governed work across Faith Harbor OS.

## Three Questions Rule

Every workflow must identify:

1. Which department owns it?
2. What process does it coordinate?
3. Does it require human approval?

## Lifecycle

```text
draft
  |
ready
  |
running
  |
waiting_for_approval
  |
approved
  |
completed
  |
archived
```

Alternative terminal states include `rejected`, `failed`, and `cancelled`.

## Approval

High-impact workflows must pause in `waiting_for_approval` until an authorized
human approves or rejects them.

## Audit

Every creation and state transition records:

- Workflow ID
- Action
- Actor
- Previous state
- New state
- Timestamp
