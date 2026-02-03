# How to Run the Swarm

## Via Moltbot (Recommended)

### Manual Trigger
Ask Moltbot: "Run a swarm iteration on twin-me"

### Scheduled (Cron)
The orchestrator runs automatically via heartbeat or cron job.

## What Happens

1. **Orchestrator wakes up** (Moltbot main session)
2. **Reads state** from `.agents/status.json`
3. **Picks task** from `.agents/tasks/backlog.json`
4. **Spawns agent** via `sessions_spawn`:

```javascript
// Example spawn for Lead Agent
sessions_spawn({
  task: `
    You are the Lead Agent for TwinMe.
    Read .agents/prompts/lead-agent.md for your instructions.
    Your current task: TWIN-001 - Analyze current codebase state
    Work in: /root/clawd/twin-me
    Output to: .agents/analysis/TWIN-001.md
  `,
  label: "lead-agent-TWIN-001",
  model: "anthropic/claude-sonnet-4-5",
  runTimeoutSeconds: 600
})
```

5. **Agent works** in isolated session
6. **Reports back** when done
7. **Orchestrator moves task** to done/active
8. **Repeat**

## Manual Agent Run (Claude Code)

If you want to run agents manually via Claude Code:

```bash
cd /root/clawd/twin-me

# Run a specific agent
claude --agent .claude/agents/code-review.md

# Or with a specific task
claude --agent .claude/agents/frontend-designer.md --task "Design the dashboard component"
```

## Task Status Flow

```
backlog.json → (assigned) → active.json → (completed) → done.json
                    ↑                           |
                    └─── (rejected/blocked) ────┘
```

## Monitoring

Check current state:
```bash
cat .agents/status.json | jq
cat .agents/tasks/active.json | jq
```

Check logs:
```bash
tail -f .agents/logs/$(date +%Y-%m-%d).log
```
