# SoC Cross-Die Database / 3DIC Platform Development Context

## 项目目标

本项目是一个 SoC 跨代架构数据库与 3DIC 方案评估平台原型。

第一阶段目标不是做完整企业级系统，而是先跑通最小工程闭环：

React TypeScript 前端 → FastAPI 后端 → SQLite 数据库 → 页面展示真实数据。

当前优先使用 SQLite，而不是 PostgreSQL / Docker，降低本地部署复杂度。

## 技术栈

Frontend:
- React
- TypeScript
- Vite
- Tailwind CSS
- lucide-react
- framer-motion

Backend:
- Python
- FastAPI
- SQLModel 或 SQLAlchemy
- SQLite

暂时不要使用:
- Docker
- PostgreSQL
- Alembic
- 复杂权限系统
- AI Copilot
- 自动 partition 优化
- thermal surrogate model

## 第一阶段 MVP 范围

需要实现以下模块：

1. Project 管理
2. Scenario 管理
3. Component / Block 层次结构
4. Process Node 管理
5. Tier / 3D Stack 管理
6. Component Metric 管理
7. 基础 Dashboard
8. Block Tree 页面
9. Tier 页面
10. Scenario 对比页面
11. 简单数据质量检查

## 第一阶段建议数据库表

先实现这些 SQLite 表：

### project
- id
- name
- product_family
- generation
- owner
- phase
- description
- created_at
- updated_at

### scenario
- id
- project_id
- name
- scenario_type
- process_combo
- description
- status
- created_at
- updated_at

### component_instance
- id
- project_id
- parent_id
- name
- instance_type
- resource_type
- function_domain
- hierarchy_path
- description
- created_at
- updated_at

### process_node
- id
- foundry
- node_name
- logic_density_mtr_per_mm2
- sram_density_mb_per_mm2
- voltage_nominal
- cost_factor
- maturity_level
- description

### tier
- id
- scenario_id
- tier_index
- name
- process_id
- role
- orientation
- thickness_um
- area_limit_mm2
- description

### component_metric
- id
- scenario_id
- instance_id
- metric_name
- metric_value
- metric_unit
- metric_category
- corner
- workload
- confidence
- created_at

后续再加：
- component_allocation
- source_artifact
- import_job
- data_quality_issue

## 第一阶段 API

优先实现只读 API：

- GET /api/projects
- GET /api/scenarios
- GET /api/components
- GET /api/components/tree
- GET /api/tiers
- GET /api/metrics
- GET /api/dashboard

然后再实现写入 API。

## 前端要求

当前已有一个单文件 App.tsx 原型，需要逐步拆分为：

frontend/src/
- api/
  - client.ts
  - projects.ts
  - scenarios.ts
  - components.ts
  - tiers.ts
  - metrics.ts
- types/
  - project.ts
  - scenario.ts
  - component.ts
  - tier.ts
  - metric.ts
- components/
  - Badge.tsx
  - Card.tsx
  - MetricCard.tsx
  - TreeNode.tsx
- pages/
  - DashboardPage.tsx
  - HierarchyPage.tsx
  - TiersPage.tsx
  - ComparePage.tsx
  - ImportsPage.tsx
  - QualityPage.tsx
  - SchemaPage.tsx

目标是把 mock data 从 App.tsx 移到后端 SQLite，并通过 API 获取。

## 开发原则

1. 优先跑通闭环，不要过度设计。
2. 先只读，再写入。
3. 先标准化数据结构，再考虑 AI。
4. 页面先可用，不追求完美后台管理。
5. 数据库结构要清晰，方便未来迁移 PostgreSQL。
6. 不要在前端写死业务数据。
7. 后端启动时可以自动创建 SQLite 表并插入 demo seed 数据。
8. 所有 API 返回字段命名保持前后端一致。
9. 保留未来 source traceability 和 data quality check 的扩展空间。

## 当前最优先任务

请先完成以下任务：

1. 创建 backend 目录
2. 实现 FastAPI + SQLite 后端
3. 定义 Project、Scenario、ComponentInstance、ProcessNode、Tier、ComponentMetric 模型
4. 启动时自动创建数据库
5. 插入与现有前端 mock data 等价的 seed 数据
6. 提供以下 API：
   - GET /api/projects
   - GET /api/scenarios
   - GET /api/components
   - GET /api/components/tree
   - GET /api/tiers
   - GET /api/metrics
   - GET /api/dashboard
7. 修改前端 App.tsx，让 Dashboard、Block层次、Tier、Scenario 对比页面从 API 读取数据。
