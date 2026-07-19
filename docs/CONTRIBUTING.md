# Faith Harbor OS Contributing Guide

**Version:** 1.0  
**Author:** Pastor Shawn Miller  
**Status:** Approved

> **Governance:** This document shall be interpreted and maintained in accordance with the Faith Harbor Engineering Handbook.

---

## Welcome

Thank you for contributing to Faith Harbor OS.

Every contribution should improve the quality, reliability, and maintainability
of the platform.

---

## Before You Begin

Please read the following documents first:

- ENGINEERING_STANDARDS.md
- ARCHITECTURE.md
- TESTING_GUIDE.md
- GIT_WORKFLOW.md

Understanding these documents will ensure consistency across the project.

---

## Contribution Process

1. Create a feature branch.
2. Implement one focused change.
3. Add or update tests.
4. Run the validation commands.

   ```bash
   npm run typecheck
   npm test
   ```

5. Update documentation if necessary.
6. Commit your changes.
7. Push your branch.
8. Open a Pull Request.

---

## Coding Expectations

Every contribution should:

- Follow the architecture.
- Be easy to understand.
- Include meaningful comments where appropriate.
- Avoid duplication.
- Keep classes focused on a single responsibility.

---

## Documentation

Documentation is considered part of the feature.

If behavior changes, documentation should be updated.

---

## Testing

Every new feature should include automated tests.

Bug fixes should include regression tests.

---

## Questions to Ask Before Submitting

- Does this solve a real problem?
- Is the implementation simple?
- Is it well tested?
- Does it follow the Engineering Standards?
- Would I be proud to ship this?

If the answer to any question is "No," continue improving the contribution.

---

End of Contributing Guide
