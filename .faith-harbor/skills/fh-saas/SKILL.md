---
name: fh-saas
description: >-
  Design and build secure, reliable SaaS products using Faith Harbor Node, API,
  PostgreSQL, authentication, RBAC, multi-tenancy, billing, webhook, job,
  observability, and recovery standards.
---

# Faith Harbor SaaS

Use for SaaS applications, APIs, Node.js, Express, PostgreSQL, billing,
background jobs, and multi-tenant systems.

## Rules

- Separate routing, business logic, and persistence.
- Validate untrusted input.
- Enforce authorization on the server.
- Use migrations and parameterized queries.
- Define tenant boundaries explicitly.
- Test cross-tenant access denial.
- Use audit logs for sensitive actions.
- Verify webhook signatures.
- Make payment and critical writes idempotent.
- Use retry-safe background jobs.
- Keep logs free of secrets.
- Test backup restoration.

## References

- `05-Node/`
- `06-PostgreSQL/`
- `09-SaaS/`
- `10-Security/`
- `16-Checklists/Backend-SaaS-Review.md`
