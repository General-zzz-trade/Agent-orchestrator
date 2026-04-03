# Agent Orchestrator

Agent Orchestrator 是一个面向 UI 与工具工作流的工程级认知 Agent Runtime。

它现在还不是 AGI。当前更准确的定位是一个可恢复、可观测、可复用经验的 Agent 平台，已经具备：

- 结合规则规划器、知识模板与 LLM 规划器进行任务规划
- 执行浏览器、视觉、HTTP、文件与代码动作
- 在动作前后观察环境状态
- 对动作结果、状态结果与目标结果做验证
- 通过假设驱动实验与重规划进行失败恢复
- 从历史运行中提炼 procedural memory，并反向影响规划与恢复
- 通过 `inspect-run` 与 HTTP API 暴露 cognition trace

## 当前定位

项目已经明显超过简单的 orchestrator 原型。当前运行时已经包含：

- [runtime.ts](/home/ubuntu/Agent-orchestrator/src/core/runtime.ts) 中的 cognition loop
- [cognition/](/home/ubuntu/Agent-orchestrator/src/cognition) 中的结构化 world state 与 observation tracking
- [verifier/](/home/ubuntu/Agent-orchestrator/src/verifier) 中的 verifier 层
- [escalation-policy.ts](/home/ubuntu/Agent-orchestrator/src/escalation-policy.ts) 中的恢复策略与 LLM 升级决策
- [knowledge/](/home/ubuntu/Agent-orchestrator/src/knowledge) 中的 procedural memory 提炼与检索
- [planner/](/home/ubuntu/Agent-orchestrator/src/planner) 中的 prior-aware planning / replanning
- [api/routes/runs.ts](/home/ubuntu/Agent-orchestrator/src/api/routes/runs.ts) 中的 cognition trace API

从能力上说，当前 agent 已经能做到：

- rule + LLM 混合规划
- cognition-aware execution
- hypothesis-driven recovery
- procedural memory reuse
- 带 decision trace 的运行检查

## 它现在还不是什么

当前项目距离 AGI 级能力仍然很远。

它还不具备：

- 强长期语义记忆
- 通用因果世界模型
- 自主目标管理
- 跨域抽象与迁移
- 基于大规模经验的持续策略学习
- 稳定的多领域通用智能

因此现在更准确的描述是：

`一个面向 UI 与工具任务的可恢复认知 Agent Runtime`

而不是：

`一个通用 AGI`

## 文档

- 英文 README: [README.md](/home/ubuntu/Agent-orchestrator/README.md)
- AGI 愿景与路线图: [docs/agi-agent-vision.md](/home/ubuntu/Agent-orchestrator/docs/agi-agent-vision.md)
- AGI 愿景中文版: [docs/agi-agent-vision.zh-CN.md](/home/ubuntu/Agent-orchestrator/docs/agi-agent-vision.zh-CN.md)
- 企业 / API 计划: [docs/superpowers/plans/2026-04-01-enterprise-phase1-api-database.md](/home/ubuntu/Agent-orchestrator/docs/superpowers/plans/2026-04-01-enterprise-phase1-api-database.md)

## 常用命令

核心验证：

```bash
npm run test:unit:planner
npm run test:smoke
node --import tsx src/api/server.test.ts
```

运行检查：

```bash
npm run inspect:run -- artifacts/runs/<run-id>.json
```

Moonshot 验证：

```bash
npm run verify:moonshot:env
scripts/run-online-worker.sh verify
```

## 项目方向

项目正在从：

`goal -> planner -> executor -> replanner`

逐步演进到：

`goal -> state -> observation -> verification -> hypothesis -> experiment -> belief update -> recovery -> memory extraction`

下一阶段的重点不是“再加更多 planner”，而是继续强化认知核心：

- 更强的 semantic memory
- 更清晰的 world-state 建模
- 更丰富的低风险 experiment policy
- 能根据历史结果改变未来行为的 learning loop
