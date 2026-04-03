# AGI Agent 愿景

## 说明

这个项目的长期目标，是从一个工程级认知工作流 Agent，逐步演进成一个可自我改进的通用 Agent 系统。

它现在还没有达到这个阶段。

这份文档要明确四件事：

- 当前系统已经是什么
- 在这个仓库里，“AGI 级 Agent”具体意味着什么
- 要往这个方向走，架构上必须补什么
- 哪些工作不能被误当成 AGI 进展

## 当前现实

当前系统已经支持：

- rule 与 LLM 规划
- cognition-aware execution
- world state 更新
- action / state / goal verifier
- 假设驱动的失败分析
- 低风险恢复实验
- rule 与 LLM replanning
- procedural memory 提炼与复用
- 基于 cognition trace 的运行检查

这已经明显超过纯 orchestrator。

但它本质上仍然是一个围绕 UI 与工具工作流构建的工程型 Agent。

当前系统的重心是：

`可靠执行任务并具备恢复能力`

而不是：

`通用智能`

## 在这个仓库里，AGI 级意味着什么

这里的 AGI 级 Agent 不是营销词，而是至少能稳定做到以下六件事：

1. 建立并维护世界模型

- 理解对象、状态、关系与状态转移
- 能解释为什么某个动作改变了环境
- 能识别环境何时偏离预期

2. 在多个层级上从经验中学习

- episodic memory：发生了什么
- procedural memory：什么做法有效
- semantic memory：什么是稳定成立的知识

3. 生成并验证假设

- 为失败生成多个竞争性解释
- 选择低成本实验来降低不确定性
- 在做更大动作之前先更新 belief

4. 跨域泛化

- 在网站、工具、API 与工作流之间复用知识
- 从具体失败提炼抽象经验
- 当表层形式变化但任务结构不变时仍能适应

5. 自主管理目标与子目标

- 分解长程任务
- 当优先级或约束变化时更新计划
- 只在必要时才请求澄清或审批

6. 改进未来行为

- 更新 planning priors 与 recovery 策略
- 根据成功 / 失败分布调整 policy
- 不只是记录历史，而是真正随着交互变强

## 什么不算 AGI 进展

下面这些事情会让系统更完整，但本身并不等于更接近 AGI：

- 增加更多 planner 变体
- 增加更多 provider 接入
- 把 prompt 写得更长
- 增加更多 failure enum
- 增加更多 ledger 计数器
- 不增加新认知能力、只增加更多 smoke suite

这些是工程增强，不是智能增强。

它们重要，但不是最核心的前沿。

## 架构北极星

当前运行时正在逐步围绕：

`goal -> observe -> execute -> verify -> recover`

来组织。

真正面向 AGI 的北极星应该是：

`goal -> state model -> observation -> hypothesis -> experiment -> belief update -> action -> verification -> memory extraction -> policy adaptation`

这要求五个架构支柱。

## 支柱 1：更强的状态与世界建模

项目已经有 `worldState` 与 `worldStateHistory`。

下一步必须显式表示：

- 环境中的实体
- 实体之间的关系
- 动作前的预期
- 动作后的因果解释
- 显式不确定性，而不只是几个状态标签

目标是从：

`execution state`

升级成：

`world model`

## 支柱 2：分层记忆

仓库里的 `knowledge/` 已经开始出现 procedural memory。

下一步要清晰拆分：

- episodic memory：某次运行的经历
- procedural memory：某种上下文下哪些步骤有效
- semantic memory：更稳定、更抽象的知识

长期进展依赖于把重复经验压缩成可复用抽象。

否则系统积累的只是日志，而不是智能。

## 支柱 3：假设驱动认知

项目现在已经有最小版 hypothesis engine 和低风险 experiments。

后续要把它做得更系统：

- 多个候选解释
- 显式 experiment policy
- experiment 成本估计
- 能影响未来策略选择的 belief update

核心原则是：

`不要盲目恢复`

而要：

`在付出更高代价前，先降低不确定性`

## 支柱 4：策略自适应

当前 policy 主要决定：

- 什么时候用 rules
- 什么时候调用 LLM
- 什么时候 fallback

未来的 policy 应该能从结果中学习：

- 哪些 prior 会提升 plan quality
- 哪些 experiment 降低不确定性最快
- 哪些 recovery 策略在什么上下文里有效
- 什么时候 LLM 使用值得它的成本

面向 AGI 的 Agent 不能只“带着 policy 执行”。

它必须“改进 policy”。

## 支柱 5：跨域泛化

当前系统在 UI 与工具工作流上最强。

要往前走，内部抽象必须足够中性，能覆盖：

- browser tasks
- API tasks
- filesystem tasks
- code execution tasks
- 混合工作流

真正的指标不是“接了多少 provider”。

真正的指标是：

`认知、记忆与验证策略能否跨域迁移`

## 具体阶段

### Phase 1：可靠的认知 Runtime

这一阶段已经在推进中。

重点：

- cognition loop
- world state
- verifiers
- hypothesis engine
- recovery experiments
- procedural memory

### Phase 2：真正会学习的 Memory

重点：

- semantic memory extraction
- memory scoring 与 retrieval 质量
- 基于经验的 policy 更新
- 对重复运行形成更强抽象

### Phase 3：更强的决策搜索

重点：

- 比较多条 action branch
- 带成本控制的 experiment policy
- 面向 recovery 选择的反事实推理
- critic model 与更强 verifier

### Phase 4：目标管理

重点：

- 子目标规划
- 长程任务跟踪
- 中断处理
- 在约束内自主排序优先级

### Phase 5：跨域通用 Agent

重点：

- browser / file / HTTP / code execution 之间的一致认知
- 可迁移的 semantic memory
- 域无关 recovery pattern
- 系统级 policy adaptation

## 成功指标

错误的指标是：

`调用了更多 LLM`

正确的指标是：

- 更高的任务成功率
- 更低的 unsafe-action rate
- 更低的 blind-retry rate
- 更低的 fallback rate
- 更多 proven priors 的复用
- prior-aware rewrite 之后更高的计划质量
- experiment 之后更高的恢复成功率
- 基于历史记忆带来的未来结果改善

对 AGI 方向来说，最重要的指标其实是：

`agent 是否因为过去的经验而在未来任务中变强`

## 不可妥协的约束

随着系统能力增强，安全门槛也必须同步提升。

这个项目必须持续保留：

- approval boundary
- secret isolation
- run auditability
- usage accounting
- 受限任务 schema
- 显式 verifier
- 在高风险动作之前先做可逆的低风险 experiment

如果只提升自主性，不提升控制能力，那不是进步。

那只是被延后的失败。

## 最终定位

这个仓库现在不应该自称 AGI。

它可以诚实宣称的是：

`一个具备恢复、记忆与检查原语的认知 Agent Runtime`

长期愿景则是：

`一个能够从交互中学习、建模世界、并在工具与领域之间泛化的自我改进 Agent 系统`

这个愿景是成立的。

真正通向它的路径，只能继续把架构锚定在：

- state
- memory
- verification
- hypothesis testing
- learning loops

而不是把更大的 prompt 或更多 provider 误当成智能本身。
