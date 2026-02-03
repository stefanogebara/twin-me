# TwinMe Agent Swarm 🐝

## Overview

An autonomous multi-agent system that works 24/7 to continuously improve TwinMe.
Coordinated by Moltbot, executed via Claude Code, with human checkpoints.

## Architecture

```
                         ┌─────────────────────┐
                         │   👤 HUMAN (Stefano) │
                         │   Final approval    │
                         └──────────┬──────────┘
                                    │ checkpoints
                         ┌──────────▼──────────┐
                         │   🤖 ORCHESTRATOR   │
                         │   (Moltbot/Main)    │
                         │   Coordinates all   │
                         └──────────┬──────────┘
                                    │
       ┌────────────────┬───────────┼───────────┬────────────────┐
       │                │           │           │                │
  ┌────▼─────┐    ┌─────▼─────┐ ┌───▼───┐ ┌─────▼─────┐    ┌─────▼─────┐
  │ 🎯 LEAD  │◄──►│ 🔧 TECH   │◄│►─────◄│►│ 🧪 TEST   │◄──►│ 📊 QA     │
  │ Planning │    │ Building  │ │       │ │ Testing   │    │ Quality   │
  └────┬─────┘    └─────┬─────┘ │       │ └─────┬─────┘    └─────┬─────┘
       │                │       │       │       │                │
  ┌────▼─────┐    ┌─────▼─────┐ │       │ ┌─────▼─────┐    ┌─────▼─────┐
  │ Tasks:   │    │ Tasks:    │ │       │ │ Tasks:    │    │ Tasks:    │
  │ • PRD    │    │ • UI/UX   │ │       │ │ • Unit    │    │ • Review  │
  │ • Plan   │    │ • Backend │ │       │ │ • E2E     │    │ • Security│
  │ • Prio   │    │ • Refactor│ │       │ │ • Regress │    │ • Audit   │
  └──────────┘    └───────────┘ │       │ └───────────┘    └───────────┘
                                │       │
                          Shared state via
                          .agents/status.json
```

## Agents

### 👤 Human (Stefano)
- **Role**: Final decision maker, strategic direction, approval gates
- **Notified**: At checkpoints, on blockers, daily summary
- **Powers**: Approve/reject merges, override priorities, pause swarm

### 🤖 Orchestrator (Moltbot)
- **Role**: Coordinates all agents, manages task queue, handles communication
- **Runs**: Always active via heartbeat
- **Powers**: Can spawn any agent, access all files, cross-agent messaging

### 🎯 Lead Agent (Planning)
- **Role**: Product direction, prioritization, task creation
- **Sub-agents**: 
  - `prd-writer` - Creates/updates PRDs
  - `project-task-planner` - Breaks down into tasks
- **Output**: `tasks/`, `docs/PRD.md`, `docs/ROADMAP.md`

### 🔧 Tech Agent (Building)
- **Role**: Actual code implementation
- **Sub-agents**:
  - `frontend-designer` - UI/UX implementation
  - `code-refactorer` - Code improvements
  - `vibe-coding-coach` - Code quality guidance
- **Output**: `src/`, `api/`, actual code changes

### 🧪 Test Agent (Testing) ← NEW
- **Role**: Automated testing, coverage, regression prevention
- **Tools**:
  - `jest/vitest` - Backend unit & integration tests
  - `playwright` - Frontend E2E tests
  - `supertest` - API endpoint tests
- **Output**: `.agents/test-reports/`, test files in `tests/`

### 📊 QA Agent (Quality)
- **Role**: Code review, security, final approval
- **Sub-agents**:
  - `code-review` - Reviews all changes
  - `security-auditor` - Security analysis
  - `design-review` - UI consistency
- **Output**: `reviews/`, `issues/`, security reports

## Human Checkpoints 🚦

The swarm pauses and notifies Stefano at these points:

### 🟡 CHECKPOINT 1: Planning Approval
**When**: After Lead Agent creates task breakdown
**What you see**: Proposed tasks, priorities, estimates
**Actions**: 
- ✅ Approve → Work begins
- 🔄 Modify → Adjust tasks/priorities
- ❌ Reject → Back to planning

### 🟡 CHECKPOINT 2: Implementation Review
**When**: After Tech Agent completes feature (before testing)
**What you see**: Code summary, what changed, demo link
**Actions**:
- ✅ Approve → Proceed to testing
- 🔄 Feedback → Back to Tech for changes
- ❌ Reject → Abort feature

### 🟡 CHECKPOINT 3: Pre-Merge Review
**When**: After Test + QA pass, before merge to main
**What you see**: Full test report, QA review, diff summary
**Actions**:
- ✅ Merge → Code goes to main
- 🔄 Hold → Wait for specific fix
- ❌ Reject → Don't merge, investigate

### 🔴 CRITICAL: Architecture Changes
**When**: Any agent proposes major changes
**Examples**: New dependencies, DB schema changes, API breaking changes
**Actions**: Must explicitly approve before any work begins

## Task Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  1. Orchestrator identifies work needed                         │
│           ↓                                                     │
│  2. Lead Agent creates/prioritizes tasks                        │
│           ↓                                                     │
│  ════════════════════════════════════════                       │
│  ║  🚦 CHECKPOINT 1: Human approves plan  ║                     │
│  ════════════════════════════════════════                       │
│           ↓                                                     │
│  3. Tech Agent picks up task, implements                        │
│           ↓                                                     │
│  ════════════════════════════════════════                       │
│  ║  🚦 CHECKPOINT 2: Human reviews impl   ║                     │
│  ════════════════════════════════════════                       │
│           ↓                                                     │
│  4. Test Agent runs backend + Playwright tests                  │
│           ↓                                                     │
│  5. QA Agent reviews, approves/rejects                          │
│           ↓                                                     │
│  ════════════════════════════════════════                       │
│  ║  🚦 CHECKPOINT 3: Human approves merge ║                     │
│  ════════════════════════════════════════                       │
│           ↓                                                     │
│  6. Orchestrator merges to main                                 │
│           ↓                                                     │
│  7. Repeat continuously                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Notification System

How you'll be notified:

| Event | Channel | Urgency |
|-------|---------|---------|
| Checkpoint reached | WhatsApp | Normal |
| Blocker/error | WhatsApp | High |
| Daily summary | WhatsApp | Low (morning) |
| Security issue | WhatsApp + loud | Critical |

### Message Format
```
🚦 CHECKPOINT 1: Planning Approval

Task: TWIN-005 - Add Netflix integration
Proposed by: Lead Agent

Work breakdown:
1. Backend extractor (4h)
2. OAuth flow (2h)
3. Frontend UI (3h)
4. Tests (2h)

Reply:
✅ - Approve and start
🔄 - I have feedback
❌ - Don't do this
```

## Autonomy Rules

### What agents CAN do autonomously:
- Read any file in the repo
- Create/modify code in feature branches
- Run tests
- Create issues/tasks
- Communicate with each other
- Commit to feature branches

### What requires HUMAN approval:
- ✋ Merge to main branch
- ✋ Major architecture changes
- ✋ New external dependencies
- ✋ API breaking changes
- ✋ Delete critical files
- ✋ Deploy to production

## Schedule

| Time | Action |
|------|--------|
| Every 4h | Orchestrator heartbeat - check all agents |
| Daily 09:00 | Lead Agent - prioritize day's work → Checkpoint if new tasks |
| Continuous | Tech Agent - work on approved tasks |
| On commit | Test Agent - run full test suite |
| On tests pass | QA Agent - review changes |
| Weekly | Full security audit |

## Files

```
.agents/
├── SWARM.md              # This file
├── status.json           # Current state of all agents
├── tasks/
│   ├── backlog.json      # All pending tasks
│   ├── active.json       # Currently being worked on
│   ├── done.json         # Completed tasks
│   └── awaiting-human.json  # Waiting for checkpoint approval
├── prompts/
│   ├── orchestrator.md   # Orchestrator instructions
│   ├── lead-agent.md     # Lead agent instructions
│   ├── tech-agent.md     # Tech agent instructions
│   ├── test-agent.md     # Test agent instructions
│   └── qa-agent.md       # QA agent instructions
├── test-reports/
│   └── *.md              # Test run reports
├── reviews/
│   └── *.md              # Code review reports
├── messages/
│   └── *.json            # Inter-agent messages
└── logs/
    └── *.log             # Agent activity logs
```

## Getting Started

1. Orchestrator (Moltbot) reads this file
2. Initializes task queue from `tasks/backlog.json`
3. Spawns agents as needed via `sessions_spawn`
4. Monitors progress via status files
5. Notifies human at checkpoints
6. Handles escalations

## Current State

- [x] Initial setup complete
- [x] Task queue initialized (4 tasks)
- [x] Agent prompts created
- [ ] Test Agent integrated
- [ ] First autonomous run
- [ ] Notification system tested

## Quick Commands (for Stefano)

In chat with me, you can say:
- **"swarm status"** → See what all agents are doing
- **"approve [task]"** → Approve a checkpoint
- **"reject [task]"** → Reject with reason
- **"pause swarm"** → Stop all autonomous work
- **"resume swarm"** → Continue work
- **"priority [task]"** → Bump task to top
