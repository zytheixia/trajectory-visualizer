export const sampleTraces = {
  debug: {
    name: "调试修复示例",
    events: [
      {
        id: "evt-1",
        type: "user",
        name: "用户请求",
        content: "分析 anno-runner 的失败测试，并给出修复方案。",
        time: "2026-07-08T09:00:00Z",
        status: "success",
        actor: "User"
      },
      {
        id: "evt-2",
        type: "planning",
        category: "reasoning",
        name: "规划",
        content: "读取测试输出，定位失败路径，优先复现最小问题。",
        time: "2026-07-08T09:00:08Z",
        duration: 12,
        status: "success",
        parent_id: "evt-1",
        actor: "Agent",
        metadata: {
          model: "gpt-5-codex",
          tokens: 428
        }
      },
      {
        id: "evt-3",
        type: "shell_command",
        category: "execution",
        name: "rg",
        content: "搜索 failing assertion 和相关 fixture。",
        time: "2026-07-08T09:00:24Z",
        duration: 3,
        status: "success",
        parent_id: "evt-2",
        actor: "Shell",
        metadata: {
          command: "rg failing assertion",
          cwd: "/home/zyt/projects/anno-runner"
        }
      },
      {
        id: "evt-4",
        type: "observation",
        name: "观察",
        content: "发现 parser 对缺失 optional 字段处理不一致。",
        time: "2026-07-08T09:00:32Z",
        status: "success",
        parent_id: "evt-3",
        actor: "Agent"
      },
      {
        id: "evt-5",
        type: "test_run",
        category: "execution",
        name: "pytest",
        content: "运行 tests/test_harbor_parser.py::test_missing_optional_fields。",
        time: "2026-07-08T09:00:46Z",
        duration: 8,
        status: "failed",
        parent_id: "evt-4",
        actor: "Pytest",
        metadata: {
          command: "pytest tests/test_harbor_parser.py::test_missing_optional_fields",
          exit_code: 1
        }
      },
      {
        id: "evt-6",
        type: "error",
        name: "断言失败",
        content: "expected empty list, got None。",
        time: "2026-07-08T09:00:55Z",
        status: "failed",
        parent_id: "evt-5",
        actor: "Pytest"
      },
      {
        id: "evt-7",
        type: "patch",
        category: "execution",
        name: "修改代码",
        content: "统一 normalize 阶段的默认值，并补充回归测试。",
        time: "2026-07-08T09:01:11Z",
        duration: 45,
        status: "success",
        parent_id: "evt-5",
        actor: "Agent",
        files_changed: ["packages/harbor_ingest/parser.py", "tests/test_harbor_parser.py"]
      },
      {
        id: "evt-8",
        type: "test_run",
        category: "execution",
        name: "pytest",
        content: "运行相关测试文件。",
        time: "2026-07-08T09:02:02Z",
        duration: 14,
        status: "success",
        parent_id: "evt-7",
        actor: "Pytest",
        metadata: {
          command: "pytest tests/test_harbor_parser.py",
          exit_code: 0
        }
      },
      {
        id: "evt-9",
        type: "final_answer",
        category: "reasoning",
        name: "总结",
        content: "报告修改点、验证结果和剩余风险。",
        time: "2026-07-08T09:02:24Z",
        status: "success",
        parent_id: "evt-8",
        actor: "Agent"
      }
    ]
  },
  minimal: {
    name: "最小字段示例",
    events: [
      { type: "user", content: "帮我检查这个 bug" },
      { type: "thought", content: "需要先复现问题" },
      { type: "tool", name: "npm test", status: "failed" },
      { type: "error", content: "TypeError: Cannot read properties of undefined" },
      { type: "assistant", content: "定位到空值分支，建议补默认值" }
    ]
  },
  aliases: {
    name: "字段别名示例",
    events: [
      {
        event_id: "alias-1",
        kind: "human",
        title: "外部系统字段",
        message: "这个事件没有使用我们的标准字段名。",
        started_at: "2026-07-08T09:30:00Z",
        outcome: "success",
        trace_id: "trace-ext-001"
      },
      {
        node_id: "alias-2",
        event_type: "llm_call",
        phase: "reasoning",
        label: "模型节点",
        text: "字段通过 aliases 映射到内部模型。",
        ts: "2026-07-08T09:30:05Z",
        latency_ms: 1320,
        state: "success",
        attributes: {
          model: "claude-4-sonnet",
          input_tokens: 980,
          output_tokens: 143
        }
      },
      {
        step_id: "alias-3",
        node_type: "function",
        group: "execution",
        action: "lookupCustomer",
        output: "查询客户等级和历史工单。",
        created_at: "2026-07-08T09:30:09Z",
        elapsed_ms: 410,
        extra: {
          endpoint: "/internal/customers/cus_1024",
          http_status: 200
        }
      }
    ]
  },
  llm: {
    name: "LLM 调用示例",
    events: [
      {
        id: "llm-1",
        type: "user_message",
        category: "input",
        name: "需求",
        content: "生成一个账单解释摘要。",
        time: "2026-07-08T10:00:00Z"
      },
      {
        id: "llm-2",
        type: "retrieval",
        category: "execution",
        name: "检索账单上下文",
        content: "读取用户过去 3 个月账单。",
        time: "2026-07-08T10:00:04Z",
        duration_ms: 620,
        datasource: "billing-ledger",
        rows: 42
      },
      {
        id: "llm-3",
        type: "llm_call",
        category: "reasoning",
        name: "生成摘要",
        content: "调用模型生成解释。",
        time: "2026-07-08T10:00:06Z",
        duration_ms: 1840,
        status: "success",
        metadata: {
          provider: "openai",
          model: "gpt-5",
          prompt_tokens: 1380,
          completion_tokens: 212,
          cost_usd: 0.0184,
          temperature: 0.2
        }
      },
      {
        id: "llm-4",
        type: "guardrail_check",
        category: "observation",
        name: "安全检查",
        content: "检查是否包含敏感财务建议。",
        time: "2026-07-08T10:00:09Z",
        duration_ms: 240,
        policy: "finance-advice-v2",
        flagged: false
      }
    ]
  },
  browser: {
    name: "浏览器 Agent 示例",
    events: [
      {
        id: "web-1",
        type: "task",
        category: "input",
        name: "用户任务",
        content: "打开后台，导出今天的订单 CSV。",
        time: "2026-07-08T11:20:00Z"
      },
      {
        id: "web-2",
        type: "browser_navigate",
        category: "execution",
        name: "打开登录页",
        content: "访问运营后台。",
        time: "2026-07-08T11:20:05Z",
        url: "https://admin.example.com/orders",
        tab_id: "tab-7"
      },
      {
        id: "web-3",
        type: "browser_click",
        category: "execution",
        name: "点击导出",
        content: "点击订单表格右上角导出按钮。",
        time: "2026-07-08T11:20:18Z",
        selector: "[data-testid='export-orders']",
        screenshot: "artifacts/order-export-click.png"
      },
      {
        id: "web-4",
        type: "download",
        category: "observation",
        name: "下载完成",
        content: "生成 orders-2026-07-08.csv。",
        time: "2026-07-08T11:20:31Z",
        file_name: "orders-2026-07-08.csv",
        bytes: 83412,
        checksum: "sha256:9d2f..."
      }
    ]
  },
  business: {
    name: "业务审批示例",
    events: [
      {
        id: "biz-1",
        type: "ticket_created",
        category: "input",
        name: "审批单",
        content: "客户申请提高 API 限额。",
        time: "2026-07-08T13:00:00Z",
        customer_id: "cus_1024",
        priority: "high"
      },
      {
        id: "biz-2",
        type: "risk_score",
        category: "execution",
        name: "风险评分",
        content: "调用内部风控服务。",
        time: "2026-07-08T13:00:03Z",
        score: 0.18,
        rules_hit: ["account_age_ok", "payment_ok"]
      },
      {
        id: "biz-3",
        type: "human_approval",
        category: "observation",
        name: "人工审批",
        content: "运营同意临时提高限额 7 天。",
        time: "2026-07-08T13:05:42Z",
        approver: "ops@example.com",
        sla_minutes: 15
      },
      {
        id: "biz-4",
        type: "quota_update",
        category: "execution",
        name: "更新限额",
        content: "把每日请求限制从 10k 提升到 50k。",
        time: "2026-07-08T13:06:12Z",
        old_limit: 10000,
        new_limit: 50000,
        expires_at: "2026-07-15T13:06:12Z"
      }
    ]
  }
};
