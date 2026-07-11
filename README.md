# Faith Harbor OS

![Version](https://img.shields.io/badge/version-v4.1.0-blue)
![Node.js](https://img.shields.io/badge/Node.js-20%2B-339933)
![TypeScript](https://img.shields.io/badge/TypeScript-5%2B-3178C6)
![Status](https://img.shields.io/badge/status-workflow%20foundation-success)

> Technology is our tool. People are our purpose. Christ is our foundation.

Faith Harbor OS is the operating platform for Faith Harbor LLC.

## Version 4.1

Version 4.1 introduces the first governed Workflow Engine.

Current capabilities:

- Create workflows
- Assign departmental ownership
- Submit and start workflows
- Require human approval
- Approve or reject workflows
- Complete workflows
- Record audit history
- Expose workflow APIs

## Workflow API

```text
GET    /api/v1/workflows
GET    /api/v1/workflows/:id
POST   /api/v1/workflows
POST   /api/v1/workflows/:id/submit
POST   /api/v1/workflows/:id/start
POST   /api/v1/workflows/:id/approve
POST   /api/v1/workflows/:id/reject
POST   /api/v1/workflows/:id/complete
GET    /api/v1/workflows/:id/history
```

## Validate

```powershell
npm install
npm run validate
```
