---
name: fh-security
description: Review Faith Harbor systems for input validation, authorization, secrets management, secure sessions, dependency risk, logging, backups, and recovery readiness.
---

# Faith Harbor Security

Use for security reviews, hardening, authentication, authorization, secrets, APIs, WordPress, SaaS, and deployment.

## Review Areas

- Input validation
- Output encoding
- Authentication
- Authorization
- Tenant isolation
- Session and cookie security
- CSRF protection
- Rate limiting
- Dependency health
- Secret handling
- Logging
- Backups
- Recovery

## Rules

- Never disable security controls merely to make something work.
- Never store plaintext passwords.
- Never expose stack traces in production.
- Never trust client-side authorization.
- Never log tokens or sensitive personal information.
- Document risk and remediation clearly.

## References

- `10-Security/`
- `09-SaaS/Authentication.md`
- `09-SaaS/Authorization-RBAC.md`
- Relevant review checklists
