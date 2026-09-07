# 分诊标签

分诊角色到仓库标签的唯一映射如下。写入标签遵循 [工作项跟踪](issue-tracker.md) 中的授权与核验规则；`ready-for-agent` 表示规格就绪，不授予执行或发布权限。

| 分诊角色 | 本仓库标签 | 含义 |
| --- | --- | --- |
| `needs-triage` | `status: needs triage` | 需要维护者评估该工作项 |
| `needs-info` | `status: needs information` | 等待报告者补充信息 |
| `ready-for-agent` | `ready-for-agent` | 规格完整，可交给自主代理执行 |
| `ready-for-human` | `status: ready` | 范围明确，可由人类开始处理 |
| `wontfix` | `resolution: not planned` | 当前不计划继续处理 |
