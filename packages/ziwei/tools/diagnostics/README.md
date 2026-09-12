# 外部故障诊断

这里保留不属于 Ziwei 产品或正常分发流程的定向复现。工具继续由根 mise 任务调用，不增加包依赖或公开 API。

## pnpm ppc64le 启动故障

- 入口：`mise run diagnose:pnpm -- --output <新目录> --qemu baseline`；完整参数、固定样本和现场结论见[候选平台记录](../../../../docs/engineering/native-candidate-platforms.md#独立-pnpm-启动诊断)。
- 范围：只验证官方 pnpm 的启动，不构建或挂载 Ziwei；GDB 仅用于独立手动 CI，基线、超时、摘要、失败退出及证据保留规则不变。
- 测试：参数、结果分类与工作流约束继续在跨平台 `check:node:tools` 中执行；需要 Linux shell 的检查由 `check:node:tools:linux` 执行，并接入主 CI 的 Linux 原生任务，不用跳过测试代替隔离。
- 维护终点：定位上游修复后，先验证修复版本的原始启动与完整候选消费。之后收敛到必要的回归用例，保留固定摘要、运行链接及结论，再撤下过时对照模式。不因为故障仍存在就继续扩展无假设的版本矩阵。

Windows 日常验收不放入本目录：运行环境／材料校验由 `windows-runtime.ts` 负责，Docker 就绪与只读故障证据由 `windows-docker.ts` 负责，`windows-container.ts` 负责容器及消费场景编排。完整 CRT 对照仍须显式选择，不进入默认验收场景。
