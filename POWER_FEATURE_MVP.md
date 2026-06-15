# Power 功能最小闭环实现说明

本文档用于指导 agent 在 **SoC跨代数据库 / 3DIC平台** 中落地第一版 Power 功能。

第一版目标不是实现完整功耗建模系统，而是建立一个 **轻量、正确、可升级** 的最小闭环：

```text
SQLite 数据库
↓
FastAPI 后端 API
↓
React TypeScript 前端
↓
Application Power 页面展示真实功耗数据
```

---

# 1. 设计目标

## 1.1 核心问题

Power 数据不应该直接绑定在逻辑模块上。

错误设计：

```text
component_instance.power_w = 3.8
tier.power_w = 7.2
design_option.power_w = 15.6
```

原因是功耗并不是模块的静态属性，而是以下条件共同决定的结果：

```text
应用场景
子系统用例
工作电压 / 频率
物理映射方式
时间窗口
开发阶段
数据来源
统计口径
模块颗粒度
```

因此第一版需要采用：

```text
Power Observation = 条件化功耗观测值
```

而不是：

```text
Power = Block 静态属性
```

---

## 1.2 第一版要回答的问题

第一版 Power 功能至少要能回答：

```text
在某个设计方案、某个物理映射、某个应用场景、某组工作点下，
某个对象在某个时间窗口内的功耗是多少？
```

更具体地说：

```text
Design Option = 3DIC Option A
Physical Mapping = Mapping V02
Application Scenario = Camera 4K60 Recording
Operating Point Set = Camera Performance
Scope = NPU_TOP
Time Window = Burst
Power Type = Total
Statistic = Average
Power = 1.8W
```

---

## 1.3 第一版必须守住的三条红线

### 红线 1：不要把功耗写死在模块上

不要在 `component_instance` 中新增：

```text
power_w
dynamic_power_w
leakage_power_w
```

正确做法是把功耗写入：

```text
power_observation
```

---

### 红线 2：功耗必须绑定条件

任何功耗数据至少需要绑定：

```text
design_option_id
physical_mapping_id
application_scenario_id
operating_point_set_id
scope_type
scope_name
statistic_type
power_type
development_stage
confidence
```

---

### 红线 3：可加功耗与不可加功耗必须区分

不要默认：

$$
P_{total} = \sum_i P_i
$$

因为有些功耗是父级总量、硅后测量值、电源轨测量值或参考值，不能和子模块功耗直接相加。

第一版必须支持字段：

```text
is_additive
```

含义：

```text
is_additive = true  → 可以参与模块功耗加总
is_additive = false → 参考值、父级总量或非独立观测值，不参与直接加总
```

---

# 2. 第一版功能范围

## 2.1 Included

第一版实现以下功能：

```text
1. 新增 Power 相关 SQLite 表
2. 新增 seed demo 数据
3. 新增 FastAPI 只读 API
4. 新增 Application Power 前端页面
5. 支持按条件筛选 Power Observation
6. 支持简单功耗聚合
7. 支持 component / shared_resource / interaction / power_rail / residual 等 scope_type
8. 支持 average / peak 等 statistic_type
9. 支持 architecture_estimate / rtl_power / post_pnr_power / silicon_measurement 等 development_stage
10. 支持 additive 与 non-additive reference 的区分
```

---

## 2.2 Not Included

第一版暂不实现：

```text
1. 完整 subsystem_use_case 表
2. 完整 time_window 表
3. 完整 operating_point 拆表
4. component_allocation 表
5. power_trace 大文件存储
6. 复杂 shared resource 分摊算法
7. 自动 roll-up 规则引擎
8. EDA report 自动解析
9. AI 功耗分析
10. PostgreSQL 迁移
11. 权限系统
12. 审批流
```

但第一版字段设计必须为这些能力预留扩展空间。

---

# 3. 最小数据模型

第一版只实现 7 张核心表：

```text
project
design_option
component_instance
application_scenario
physical_mapping
operating_point_set
power_observation
```

---

# 4. 表结构设计

## 4.1 project

表示 SoC 项目。

```sql
CREATE TABLE IF NOT EXISTS project (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    product_family TEXT,
    generation TEXT,
    description TEXT
);
```

示例：

```text
Mobile SoC Gen-A
```

---

## 4.2 design_option

表示架构或实现方案。

注意：不要再用 `scenario` 表示设计方案，避免与应用场景混淆。

```sql
CREATE TABLE IF NOT EXISTS design_option (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    option_type TEXT,
    process_combo TEXT,
    description TEXT,
    FOREIGN KEY (project_id) REFERENCES project(id)
);
```

示例：

```text
2D Baseline
3DIC Option A
3DIC Option B
Cost-Reduced Option
```

---

## 4.3 component_instance

表示 SoC 逻辑模块层次。

注意：本表不要存功耗字段。

```sql
CREATE TABLE IF NOT EXISTS component_instance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    parent_id INTEGER,
    name TEXT NOT NULL,
    instance_type TEXT,
    resource_type TEXT,
    function_domain TEXT,
    hierarchy_path TEXT,
    estimated_area_mm2 REAL,
    logic_mtr REAL,
    memory_mb REAL,
    FOREIGN KEY (project_id) REFERENCES project(id),
    FOREIGN KEY (parent_id) REFERENCES component_instance(id)
);
```

允许保存：

```text
estimated_area_mm2
logic_mtr
memory_mb
```

不允许保存：

```text
power_w
dynamic_power_w
leakage_power_w
```

示例：

```text
SOC_TOP
CPU_CLUSTER
GPU_TOP
NPU_TOP
NPU_SRAM_BANKS
ISP_TOP
DDR_PHY
```

---

## 4.4 application_scenario

表示 SoC 级应用场景。

```sql
CREATE TABLE IF NOT EXISTS application_scenario (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    category TEXT,
    description TEXT,
    FOREIGN KEY (project_id) REFERENCES project(id)
);
```

示例：

```text
Camera 4K60 Recording
Mobile Gaming Sustained
AI Photo Enhancement Burst
Video Playback
Standby Always-on
```

第一版不用单独建 `subsystem_use_case` 表。  
可以先在 `power_observation.use_case_name` 中记录用例名称。

---

## 4.5 physical_mapping

表示某个设计方案下的具体物理映射版本。

```sql
CREATE TABLE IF NOT EXISTS physical_mapping (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    design_option_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    mapping_version TEXT,
    description TEXT,
    mapping_json TEXT,
    FOREIGN KEY (design_option_id) REFERENCES design_option(id)
);
```

示例：

```text
2D_BASELINE_MAPPING_V01
3DIC_A_MAPPING_V01
3DIC_A_MAPPING_V02_NPU_SRAM_ON_MIDDLE
```

第一版不实现完整 `component_allocation` 表。  
可以先用 `mapping_json` 保存轻量信息。

示例：

```json
{
  "NPU_TOP": "T0/T1 split",
  "NPU_SRAM_BANKS": "T1",
  "DDR_PHY": "T2 fixed",
  "GPU_TOP": "T0/T1 split"
}
```

后续可升级为：

```text
component_allocation
tier
region
```

---

## 4.6 operating_point_set

表示一组 SoC 工作点。

```sql
CREATE TABLE IF NOT EXISTS operating_point_set (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    op_json TEXT,
    FOREIGN KEY (project_id) REFERENCES project(id)
);
```

示例：

```text
Camera_Perf_OP_Set
Gaming_Sustained_OP_Set
AI_Burst_OP_Set
```

`op_json` 示例：

```json
{
  "CPU_CLUSTER": {"voltage_v": 0.75, "frequency_mhz": 1800},
  "GPU_TOP": {"voltage_v": 0.60, "frequency_mhz": 350},
  "NPU_TOP": {"voltage_v": 0.70, "frequency_mhz": 1000},
  "ISP_TOP": {"voltage_v": 0.65, "frequency_mhz": 600},
  "DDR": {"data_rate_mbps": 4266}
}
```

后续可升级为：

```text
operating_point
operating_point_assignment
```

但第一版不要拆得过细。

---

## 4.7 power_observation

这是第一版 Power 功能的核心表。

```sql
CREATE TABLE IF NOT EXISTS power_observation (
    id INTEGER PRIMARY KEY AUTOINCREMENT,

    project_id INTEGER NOT NULL,
    design_option_id INTEGER NOT NULL,
    physical_mapping_id INTEGER NOT NULL,
    application_scenario_id INTEGER NOT NULL,
    operating_point_set_id INTEGER NOT NULL,

    scope_type TEXT NOT NULL,
    scope_id INTEGER,
    scope_name TEXT NOT NULL,

    use_case_name TEXT,
    time_window_name TEXT,
    statistic_type TEXT NOT NULL,
    power_type TEXT NOT NULL,
    power_value_w REAL NOT NULL,

    development_stage TEXT,
    source_type TEXT,
    confidence TEXT,
    is_additive INTEGER DEFAULT 1,

    context_json TEXT,
    note TEXT,

    FOREIGN KEY (project_id) REFERENCES project(id),
    FOREIGN KEY (design_option_id) REFERENCES design_option(id),
    FOREIGN KEY (physical_mapping_id) REFERENCES physical_mapping(id),
    FOREIGN KEY (application_scenario_id) REFERENCES application_scenario(id),
    FOREIGN KEY (operating_point_set_id) REFERENCES operating_point_set(id)
);
```

---

# 5. 字段语义

## 5.1 scope_type

`scope_type` 表示功耗归属对象类型。

第一版允许以下值：

```text
soc
component
tier
power_rail
shared_resource
interaction
residual
```

含义：

| scope_type | 含义 | 示例 |
|---|---|---|
| soc | SoC 总体 | SOC_TOTAL |
| component | 逻辑模块 | NPU_TOP |
| tier | 3DIC tier | Top Tier |
| power_rail | 电源轨 | VDD_NPU |
| shared_resource | 共享资源 | NoC, DDR Controller |
| interaction | 交互功耗 | NPU_TO_DDR_TRAFFIC |
| residual | 未解释剩余功耗 | VDD_NPU_RESIDUAL |

当 `scope_type = component` 时：

```text
scope_id = component_instance.id
scope_name = component_instance.name
```

当 `scope_type != component` 时，第一版允许：

```text
scope_id = NULL
scope_name = 手动填写
```

---

## 5.2 use_case_name

第一版不单独建 `subsystem_use_case` 表，先用文本记录。

示例：

```text
ISP_4K60_PIPELINE
NPU_AI_DENOISE
GPU_PREVIEW_RENDER
CPU_APP_CONTROL
DDR_FRAME_BUFFER_TRAFFIC
Camera_4K60_System
```

后续升级为：

```text
subsystem_use_case
application_scenario_use_case
```

---

## 5.3 time_window_name

第一版不单独建 `time_window` 表，先用文本记录。

允许值示例：

```text
whole_scenario
steady_state
warmup
burst
frame_0010_0020
thermal_stable
```

后续升级为：

```text
time_window
```

---

## 5.4 statistic_type

表示时间统计口径。

第一版允许：

```text
average
peak
p95
p99
rms
energy
sample
```

第一版至少支持：

```text
average
peak
```

---

## 5.5 power_type

表示功耗类型。

第一版允许：

```text
total
dynamic
leakage
clock
memory
interconnect
io
regulator_loss
```

第一版重点支持：

```text
total
dynamic
leakage
interconnect
```

---

## 5.6 development_stage

表示数据来自哪个开发阶段。

第一版允许：

```text
architecture_estimate
rtl_power
gate_level_power
post_pnr_power
thermal_aware_power
silicon_measurement
```

第一版重点支持：

```text
architecture_estimate
rtl_power
post_pnr_power
silicon_measurement
```

---

## 5.7 source_type

表示数据来源类型。

第一版允许：

```text
manual_seed
excel_import
architecture_model
rtl_saif
gate_vcd
post_pnr_report
silicon_lab
```

第一版可先使用：

```text
manual_seed
```

---

## 5.8 confidence

表示数据可信度。

第一版允许：

```text
draft
review
approved
measured
```

建议含义：

| confidence | 含义 |
|---|---|
| draft | 早期估算或未经审查 |
| review | 待专家确认 |
| approved | 已确认工程数据 |
| measured | 硅后测量或实验数据 |

---

## 5.9 is_additive

表示该功耗观测是否可直接参与聚合求和。

允许：

```text
1 = true
0 = false
```

示例：

```text
component dynamic power          → is_additive = 1
shared NoC interconnect power    → is_additive = 1
interaction NPU_TO_DDR power     → is_additive = 1
SoC measured total power         → is_additive = 0
power rail measured total power  → is_additive = 0
```

---

## 5.10 context_json

用于保留暂时不想拆表的上下文。

示例：

```json
{
  "corner": "TT_0p75V_85C",
  "temperature_c": 85,
  "activity_source": "estimated",
  "tool": "manual_model",
  "comment": "early architecture estimation"
}
```

后续可逐步拆成：

```text
analysis_run
source_artifact
activity_profile
time_window
```

---

# 6. Seed Demo 数据要求

第一版 seed 数据需要覆盖以下场景。

## 6.1 Project

至少 1 个：

```text
Mobile SoC Gen-A
```

---

## 6.2 Design Options

至少 2 个：

```text
2D Baseline
3DIC Option A
```

---

## 6.3 Physical Mappings

至少 2 个：

```text
2D_BASELINE_MAPPING_V01
3DIC_A_MAPPING_V02
```

---

## 6.4 Application Scenarios

至少 3 个：

```text
Camera 4K60 Recording
Mobile Gaming Sustained
AI Photo Enhancement Burst
```

---

## 6.5 Operating Point Sets

至少 3 个：

```text
Camera_Perf_OP_Set
Gaming_Sustained_OP_Set
AI_Burst_OP_Set
```

---

## 6.6 Component Instances

至少包含：

```text
SOC_TOP
CPU_CLUSTER
GPU_TOP
NPU_TOP
NPU_SRAM_BANKS
ISP_TOP
VPU_TOP
DDR_PHY
NoC
```

其中 `NoC` 可以作为 `component` 或后续作为 `shared_resource`。  
第一版建议在 `power_observation` 中用：

```text
scope_type = shared_resource
scope_name = NoC
```

---

## 6.7 Power Observations

至少插入 20 条 demo 数据，覆盖：

```text
component power
shared_resource power
interaction power
power_rail reference
soc reference
residual
architecture_estimate
rtl_power
silicon_measurement
average
peak
steady_state
burst
```

示例数据：

```text
Camera 4K60 / 3DIC_A_MAPPING_V02 / Camera_Perf_OP_Set

ISP_TOP total average steady_state = 1.4W, additive
NPU_TOP total average burst = 1.8W, additive
GPU_TOP total average steady_state = 0.8W, additive
CPU_CLUSTER total average steady_state = 0.6W, additive
VPU_TOP total average steady_state = 1.1W, additive
DDR_PHY total average steady_state = 0.7W, additive
NoC interconnect average steady_state = 0.45W, additive
NPU_TO_DDR_TRAFFIC interconnect average burst = 0.25W, additive
VDD_NPU power_rail total average steady_state = 2.7W, non-additive
SOC_TOTAL total average steady_state = 8.1W, non-additive
```

---

# 7. API 设计

## 7.1 基础列表 API

需要实现：

```text
GET /api/projects
GET /api/design-options
GET /api/components
GET /api/application-scenarios
GET /api/physical-mappings
GET /api/operating-point-sets
GET /api/power-observations
```

---

## 7.2 GET /api/power-observations

支持 query 参数：

```text
project_id
design_option_id
physical_mapping_id
application_scenario_id
operating_point_set_id
scope_type
statistic_type
power_type
development_stage
confidence
is_additive
```

示例：

```text
GET /api/power-observations?design_option_id=2&application_scenario_id=1&operating_point_set_id=1
```

返回示例：

```json
[
  {
    "id": 1,
    "scope_type": "component",
    "scope_id": 4,
    "scope_name": "NPU_TOP",
    "use_case_name": "NPU_AI_DENOISE",
    "time_window_name": "burst",
    "statistic_type": "average",
    "power_type": "total",
    "power_value_w": 1.8,
    "development_stage": "rtl_power",
    "confidence": "review",
    "is_additive": true
  }
]
```

---

## 7.3 GET /api/power-summary

这是第一版最关键的 API。

### Query 参数

必选：

```text
design_option_id
physical_mapping_id
application_scenario_id
operating_point_set_id
```

可选：

```text
statistic_type
power_type
time_window_name
development_stage
```

默认：

```text
statistic_type = average
power_type = total
```

示例：

```text
GET /api/power-summary?design_option_id=2&physical_mapping_id=2&application_scenario_id=1&operating_point_set_id=1&statistic_type=average&power_type=total
```

---

## 7.4 power-summary 聚合逻辑

### Step 1：筛选 power_observation

按以下条件筛选：

```text
design_option_id
physical_mapping_id
application_scenario_id
operating_point_set_id
statistic_type
power_type
time_window_name 可选
development_stage 可选
```

---

### Step 2：计算 additive total

只聚合：

```text
is_additive = 1
```

计算：

```text
total_additive_power_w = sum(power_value_w where is_additive = 1)
```

---

### Step 3：找 non-additive reference

筛选：

```text
is_additive = 0
scope_type in ('soc', 'power_rail')
```

若存在 `scope_type = soc` 的 total reference，则：

```text
non_additive_reference_power_w = SOC_TOTAL power_value_w
```

如果没有 SoC reference，但有 power rail reference，可以返回：

```text
non_additive_references = [...]
```

---

### Step 4：计算 residual

如果存在 SoC reference：

$$
P_{residual} = P_{reference} - P_{additive}
$$

即：

```text
residual_power_w = non_additive_reference_power_w - total_additive_power_w
```

如果没有 SoC reference：

```text
residual_power_w = null
```

---

### Step 5：按 scope_type 聚合

只聚合：

```text
is_additive = 1
```

输出：

```json
"by_scope_type": {
  "component": 7.0,
  "shared_resource": 0.8,
  "interaction": 0.5,
  "residual": 0.3
}
```

---

### Step 6：按 component 聚合

只聚合：

```text
is_additive = 1
scope_type = component
```

输出：

```json
"by_component": {
  "CPU_CLUSTER": 1.2,
  "GPU_TOP": 2.0,
  "NPU_TOP": 1.8,
  "ISP_TOP": 1.4
}
```

---

### Step 7：按 development_stage 统计

统计行数即可，不要求加权：

```json
"by_stage": {
  "architecture_estimate": 4,
  "rtl_power": 3,
  "post_pnr_power": 0,
  "silicon_measurement": 1
}
```

---

### Step 8：输出 raw observations

为了调试，第一版建议返回匹配到的原始 observation 列表。

---

## 7.5 power-summary 返回格式

示例：

```json
{
  "filters": {
    "design_option_id": 2,
    "physical_mapping_id": 2,
    "application_scenario_id": 1,
    "operating_point_set_id": 1,
    "statistic_type": "average",
    "power_type": "total"
  },
  "total_additive_power_w": 7.1,
  "non_additive_reference_power_w": 8.1,
  "residual_power_w": 1.0,
  "by_scope_type": {
    "component": 6.4,
    "shared_resource": 0.45,
    "interaction": 0.25
  },
  "by_component": {
    "ISP_TOP": 1.4,
    "NPU_TOP": 1.8,
    "GPU_TOP": 0.8,
    "CPU_CLUSTER": 0.6,
    "VPU_TOP": 1.1,
    "DDR_PHY": 0.7
  },
  "by_stage": {
    "architecture_estimate": 5,
    "rtl_power": 2,
    "silicon_measurement": 1
  },
  "non_additive_references": [
    {
      "scope_type": "soc",
      "scope_name": "SOC_TOTAL",
      "power_value_w": 8.1,
      "development_stage": "architecture_estimate"
    }
  ],
  "observations": []
}
```

---

# 8. 前端页面要求

## 8.1 新增页面

新增页面：

```text
Application Power
```

建议路径：

```text
frontend/src/pages/ApplicationPowerPage.tsx
```

在侧边栏新增入口：

```text
应用功耗
```

---

## 8.2 页面筛选器

页面顶部提供 4 个核心选择器：

```text
Design Option
Physical Mapping
Application Scenario
Operating Point Set
```

可选高级筛选器：

```text
Statistic Type
Power Type
Time Window
Development Stage
```

默认：

```text
statistic_type = average
power_type = total
```

---

## 8.3 页面展示内容

页面至少展示 5 个区域。

### 区域 1：总览卡片

显示：

```text
Total Additive Power
Non-additive Reference Power
Residual Power
Observation Count
```

---

### 区域 2：按 Scope Type 分解

显示：

```text
component
shared_resource
interaction
residual
```

可以用卡片或简单条形列表。

---

### 区域 3：按 Component 分解

显示：

```text
CPU_CLUSTER
GPU_TOP
NPU_TOP
ISP_TOP
VPU_TOP
DDR_PHY
```

按功耗从大到小排序。

---

### 区域 4：开发阶段分布

显示：

```text
architecture_estimate
rtl_power
post_pnr_power
silicon_measurement
```

用于判断数据成熟度。

---

### 区域 5：Power Observation 明细表

字段：

```text
scope_type
scope_name
use_case_name
time_window_name
statistic_type
power_type
power_value_w
development_stage
confidence
is_additive
```

---

# 9. 前端 API 文件建议

建议新增：

```text
frontend/src/api/power.ts
```

包含：

```ts
export async function fetchPowerObservations(filters: PowerObservationFilters): Promise<PowerObservation[]>;

export async function fetchPowerSummary(filters: PowerSummaryFilters): Promise<PowerSummary>;
```

建议新增类型文件：

```text
frontend/src/types/power.ts
```

定义：

```ts
export type ScopeType =
  | "soc"
  | "component"
  | "tier"
  | "power_rail"
  | "shared_resource"
  | "interaction"
  | "residual";

export type StatisticType =
  | "average"
  | "peak"
  | "p95"
  | "p99"
  | "rms"
  | "energy"
  | "sample";

export type PowerType =
  | "total"
  | "dynamic"
  | "leakage"
  | "clock"
  | "memory"
  | "interconnect"
  | "io"
  | "regulator_loss";

export type DevelopmentStage =
  | "architecture_estimate"
  | "rtl_power"
  | "gate_level_power"
  | "post_pnr_power"
  | "thermal_aware_power"
  | "silicon_measurement";

export interface PowerObservation {
  id: number;
  project_id: number;
  design_option_id: number;
  physical_mapping_id: number;
  application_scenario_id: number;
  operating_point_set_id: number;
  scope_type: ScopeType;
  scope_id: number | null;
  scope_name: string;
  use_case_name: string | null;
  time_window_name: string | null;
  statistic_type: StatisticType;
  power_type: PowerType;
  power_value_w: number;
  development_stage: DevelopmentStage | null;
  source_type: string | null;
  confidence: string | null;
  is_additive: boolean;
  context_json: string | null;
  note: string | null;
}

export interface PowerSummary {
  filters: Record<string, unknown>;
  total_additive_power_w: number;
  non_additive_reference_power_w: number | null;
  residual_power_w: number | null;
  by_scope_type: Record<string, number>;
  by_component: Record<string, number>;
  by_stage: Record<string, number>;
  non_additive_references: PowerObservation[];
  observations: PowerObservation[];
}
```

---

# 10. 后端实现建议

## 10.1 技术栈

当前阶段使用：

```text
FastAPI
SQLModel 或 SQLAlchemy
SQLite
```

不要引入：

```text
Docker
PostgreSQL
Alembic
复杂权限
```

---

## 10.2 文件结构建议

```text
backend/
├── main.py
├── demo_soc_3dic.db
├── requirements.txt
├── models.py
├── seed.py
├── routers/
│   ├── power.py
│   ├── projects.py
│   ├── components.py
│   └── options.py
└── services/
    └── power_summary.py
```

如果 agent 为了快速实现，也可以先把所有内容放在 `main.py` 中。  
但建议至少把 `power_summary` 聚合逻辑独立出来，便于测试。

---

## 10.3 启动行为

后端启动时应该：

```text
1. 检查 SQLite DB 是否存在
2. 自动创建表
3. 如果表为空，插入 seed demo 数据
4. 启动 API 服务
```

---

## 10.4 CORS

需要允许前端本地访问：

```text
http://localhost:5173
```

FastAPI 需启用 CORS middleware。

---

# 11. 测试与验收标准

## 11.1 后端验收

启动：

```bash
uvicorn main:app --reload
```

以下 API 必须可访问：

```text
GET http://localhost:8000/api/projects
GET http://localhost:8000/api/design-options
GET http://localhost:8000/api/application-scenarios
GET http://localhost:8000/api/physical-mappings
GET http://localhost:8000/api/operating-point-sets
GET http://localhost:8000/api/power-observations
GET http://localhost:8000/api/power-summary
```

---

## 11.2 power-summary 验收

使用 demo 数据调用：

```text
GET /api/power-summary?design_option_id=2&physical_mapping_id=2&application_scenario_id=1&operating_point_set_id=1&statistic_type=average&power_type=total
```

必须返回：

```text
total_additive_power_w > 0
by_scope_type 包含 component
by_component 包含 NPU_TOP 或 ISP_TOP
by_stage 非空
observations 非空
```

如果 seed 数据中有 SoC reference，则：

```text
non_additive_reference_power_w != null
residual_power_w != null
```

---

## 11.3 前端验收

前端启动：

```bash
npm run dev
```

Application Power 页面必须满足：

```text
1. 能加载 Design Option 列表
2. 能加载 Physical Mapping 列表
3. 能加载 Application Scenario 列表
4. 能加载 Operating Point Set 列表
5. 修改筛选器后能重新请求 power-summary
6. 能显示总功耗、reference功耗、residual功耗
7. 能显示按 component 分解
8. 能显示按 scope_type 分解
9. 能显示 observation 明细表
10. 页面不再依赖前端 mock power 数据
```

---

# 12. 后续升级路径

第一版字段设计必须支持后续升级，不需要推倒重来。

## 12.1 subsystem use case

当前：

```text
power_observation.use_case_name
```

后续升级为：

```text
subsystem_use_case
application_scenario_use_case
power_observation.use_case_id
```

---

## 12.2 time window

当前：

```text
power_observation.time_window_name
```

后续升级为：

```text
time_window
power_observation.time_window_id
```

---

## 12.3 operating point

当前：

```text
operating_point_set.op_json
```

后续升级为：

```text
operating_point
operating_point_assignment
```

---

## 12.4 physical mapping

当前：

```text
physical_mapping.mapping_json
```

后续升级为：

```text
tier
region
component_allocation
```

---

## 12.5 shared resource / interaction

当前：

```text
scope_type = shared_resource
scope_name = NoC

scope_type = interaction
scope_name = NPU_TO_DDR_TRAFFIC
```

后续升级为：

```text
shared_resource
power_interaction_scope
power_coupling_relation
```

---

## 12.6 analysis run / source traceability

当前：

```text
development_stage
source_type
context_json
confidence
```

后续升级为：

```text
analysis_run
source_artifact
activity_profile
```

---

## 12.7 database

当前：

```text
SQLite
```

后续升级为：

```text
PostgreSQL
```

只要第一版字段语义不乱，迁移成本可控。

---

# 13. Agent 实施顺序

建议 agent 按以下顺序执行，不要一次性改太多。

## Step 1：后端表结构和 seed 数据

```text
1. 新增或更新 SQLite schema
2. 创建 7 张核心表
3. 插入 demo 数据
4. 确保后端启动自动初始化
```

---

## Step 2：Power API

```text
1. 实现 /api/power-observations
2. 实现 /api/power-summary
3. 实现 power_summary 聚合逻辑
4. 手动测试 API 返回
```

---

## Step 3：基础列表 API

```text
1. /api/design-options
2. /api/application-scenarios
3. /api/physical-mappings
4. /api/operating-point-sets
```

---

## Step 4：前端类型和 API client

```text
1. 新增 frontend/src/types/power.ts
2. 新增 frontend/src/api/power.ts
3. 新增相关 list API client
```

---

## Step 5：Application Power 页面

```text
1. 新增页面
2. 新增侧边栏入口
3. 加筛选器
4. 调用 /api/power-summary
5. 展示 summary cards
6. 展示 breakdown
7. 展示 observation table
```

---

## Step 6：清理和文档

```text
1. 更新 README
2. 写明启动方式
3. 写明 Power 数据模型原则
4. 写明当前限制和后续升级路径
```

---

# 14. 对 agent 的关键提醒

请严格遵守：

```text
1. 不要在 component_instance 里新增 power 字段。
2. 不要把 design_option 和 application_scenario 混用。
3. 不要默认所有 power_observation 都可以求和。
4. 不要实现复杂权限或 PostgreSQL。
5. 不要引入 Docker。
6. 第一版以 SQLite + FastAPI + React 页面闭环为目标。
7. 所有 demo 数据必须能通过 API 返回并在前端展示。
8. power-summary 的聚合逻辑必须区分 additive 与 non-additive。
9. 所有 power 数据必须可追溯到 development_stage、source_type、confidence。
10. 保留 context_json，为后续升级预留空间。
```

---

# 15. 第一版完成后的判断标准

如果第一版完成后，系统可以完成以下演示，即认为 Power MVP 成功：

```text
1. 打开 Application Power 页面
2. 选择 3DIC Option A
3. 选择 3DIC_A_MAPPING_V02
4. 选择 Camera 4K60 Recording
5. 选择 Camera_Perf_OP_Set
6. 页面显示 additive total power
7. 页面显示 non-additive SoC reference power
8. 页面显示 residual power
9. 页面显示 NPU_TOP / ISP_TOP / GPU_TOP 等模块功耗
10. 页面显示 NoC / NPU_TO_DDR_TRAFFIC 等共享或交互功耗
11. 页面显示 architecture_estimate / rtl_power / silicon_measurement 的数据成熟度分布
12. 页面显示 Power Observation 明细
```

这说明系统已经从“模块静态功耗”升级为“场景化功耗观测”，并且后续可以优雅扩展到更完整的 SoC / 3DIC 功耗数据库。
