# 工作项跟踪：GitHub

工作项与工作项规格记录在 GitHub Issues，使用 `gh` CLI。通过 `rtk proxy git remote -v` 核对目标仓库，在其克隆目录中操作；多远端或跨仓库时显式指定 `--repo <owner>/<repo>`，API 路径使用同一目标。

## 读取与写入

- **读取**：`rtk proxy gh issue view <number> --comments`，另取标签；列表按任务过滤状态与标签，按需选择 JSON 字段，避免默认加载所有正文和评论。
- **写入**：遵循仓库的[任务边界](../../AGENTS.md#任务边界)。技能要求“发布到工作项跟踪系统”时，目标是 GitHub Issue；已有发布授权则执行，否则先准备可审阅的正文与目标，再请求该动作的授权。读取、研究或本地实现不自动授权创建、评论、分配、改标签或关闭工作项。
- **正文**：用文件写入工具保存多行正文，再用 `rtk proxy gh issue create --title '...' --body-file <path>`；更新与评论使用对应的 `edit` / `comment --body-file <path>`。其他命令参数按需查 `rtk proxy gh issue <command> --help`。
- **核验**：写入后读回目标，核对正文、标签、负责人或状态；响应不明确时先查实际状态，再决定是否重试，避免重复发布。

## PR 作为分诊入口

**PRs as a request surface: no.**

外部 PR 当前不作为功能请求入口；显式的 PR 审查任务仍可执行。只有用户决定启用后，才改为 `yes`，对 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE` 的外部 PR 使用 Issue 的标签与状态流转，命令改为对应的 `gh pr` 操作；排除 `OWNER`、`MEMBER` 和 `COLLABORATOR`。

Issue 与 PR 共用编号空间。对象类型不明确时先用 `rtk proxy gh pr view <number>` 核对；仅在确定不是 PR 时改查 Issue，认证、网络或权限错误应先诊断。

## Map 工作流

仅在任务采用 Map 工作流（如 `/wayfinder`）时使用，写操作仍受上述授权约束。

- **Map**：单个 Issue，标签 `wayfinder:map`，正文保留 Notes / Decisions-so-far / Fog。
- **子工作项**：用 `gh api` 关联为 Map 的 GitHub 子 Issue；不可用时在 Map 正文维护任务列表，并在子项正文开头写 `Part of #<map>`。标签为 `wayfinder:research`、`wayfinder:prototype`、`wayfinder:grilling` 或 `wayfinder:task`。
- **阻塞**：优先用 GitHub 原生依赖：`rtk proxy gh api --method POST repos/<owner>/<repo>/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`。阻塞项的数字 database id 由 `rtk proxy gh api repos/<owner>/<repo>/issues/<n> --jq .id` 获取，不是 Issue 编号或 `node_id`。不可用时在正文开头记录 `Blocked by: #<n>, #<n>`。
- **前沿**：只在 Map 的子项或任务列表范围内，按 Map 顺序选择第一个未关闭、无负责人且无开放阻塞项的工作项。`issue_dependencies_summary.blocked_by` 统计尚未关闭的阻塞项，须为零；使用文本回退时逐项核对阻塞 Issue 均已关闭。
- **认领与解决**：授权推进 Map 后，认领是该工作流的首次写操作，将子项分配给实际负责者；当前操作者负责时使用 `rtk proxy gh issue edit <n> --add-assignee @me`。完成后发布结果、关闭子项，再在 Map 的 Decisions-so-far 追加结果链接；仅在另有发布授权时创建 gist。
