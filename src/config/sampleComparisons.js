export const sampleComparisons = {
  debugging_comparison: {
    name: "代码修复任务对比 (Run A vs Run B vs Run C)",
    description: "对比三个不同 Agent 实例修复 anno-runner 测试失败的执行轨迹：Run A 直接定位并修复成功，Run B 修复中途失败并进行重试后成功，Run C 引入语法错误后超时夭折。",
    comparison: {
      id: "comp-debug-001",
      metrics: {
        total_traces: 3,
        completed_traces: 2,
        failed_traces: 1,
        avg_duration_ms: 124000
      },
      traces: [
        {
          traceId: "run-a",
          name: "Run A (最优路径 - 直接修复)",
          events: [
            {
              id: "a1",
              type: "user",
              category: "input",
              name: "用户请求",
              content: "分析 anno-runner 的失败测试，并给出修复方案。",
              time: 1781860000000,
              durationMs: 0,
              status: "success",
              actor: "User"
            },
            {
              id: "a2",
              type: "planning",
              category: "reasoning",
              name: "制定计划",
              content: "读取测试输出，使用 grep 定位失败的代码行，修改并运行 pytest 验证。",
              time: 1781860005000,
              durationMs: 6500,
              status: "success",
              actor: "Agent",
              metadata: { model: "gpt-4o", prompt_tokens: 350, completion_tokens: 120 }
            },
            {
              id: "a3",
              type: "tool_call",
              category: "execution",
              name: "grep_search",
              content: "搜索 failing assertion 和相关 fixture。",
              time: 1781860013000,
              durationMs: 1200,
              status: "success",
              actor: "Tool",
              metadata: { command: "rg 'failing assertion'", exit_code: 0 }
            },
            {
              id: "a4",
              type: "test_run",
              category: "execution",
              name: "pytest_run",
              content: "运行相关失败测试，复现问题。",
              time: 1781860015000,
              durationMs: 4500,
              status: "failed",
              actor: "Tool",
              metadata: { command: "pytest tests/test_parser.py", exit_code: 1 }
            },
            {
              id: "a5",
              type: "tool_call",
              category: "execution",
              name: "write_file",
              content: "在 parser.py 中修正对空列表的处理错误。",
              time: 1781860022000,
              durationMs: 2100,
              status: "success",
              actor: "Tool",
              metadata: { file: "src/parser.py", diff: "- if not val:\n+ if val is None:" }
            },
            {
              id: "a6",
              type: "test_run",
              category: "execution",
              name: "pytest_run",
              content: "重新运行 pytest 进行测试验证。",
              time: 1781860026000,
              durationMs: 4200,
              status: "success",
              actor: "Tool",
              metadata: { command: "pytest tests/test_parser.py", exit_code: 0 }
            },
            {
              id: "a7",
              type: "agent",
              category: "input",
              name: "任务总结",
              content: "分析报告已生成：成功定位 parser.py 中对 None 值的判断漏洞，已统一默认值并测试通过。",
              time: 1781860032000,
              durationMs: 3500,
              status: "success",
              actor: "Agent",
              metadata: { model: "gpt-4o" }
            }
          ]
        },
        {
          traceId: "run-b",
          name: "Run B (重试路径 - 修复失败后纠正)",
          events: [
            {
              id: "b1",
              type: "user",
              category: "input",
              name: "用户请求",
              content: "分析 anno-runner 的失败测试，并给出修复方案。",
              time: 1781860000000,
              durationMs: 0,
              status: "success",
              actor: "User"
            },
            {
              id: "b2",
              type: "planning",
              category: "reasoning",
              name: "制定计划",
              content: "检查报错栈信息，生成临时 patch 并应用，若测试仍失败则回滚并重新制定方案。",
              time: 1781860006000,
              durationMs: 8200,
              status: "success",
              actor: "Agent",
              metadata: { model: "gpt-4o" }
            },
            {
              id: "b3",
              type: "tool_call",
              category: "execution",
              name: "grep_search",
              content: "搜索报错位置。",
              time: 1781860016000,
              durationMs: 1800,
              status: "success",
              actor: "Tool"
            },
            {
              id: "b4",
              type: "test_run",
              category: "execution",
              name: "pytest_run",
              content: "复现测试失败。",
              time: 1781860019000,
              durationMs: 4800,
              status: "failed",
              actor: "Tool"
            },
            {
              id: "b5",
              type: "tool_call",
              category: "execution",
              name: "write_file",
              content: "尝试首次修复：将默认返回值修改为空字典。",
              time: 1781860025000,
              durationMs: 2500,
              status: "success",
              actor: "Tool",
              metadata: { diff: "+ return {}" }
            },
            {
              id: "b6",
              type: "test_run",
              category: "execution",
              name: "pytest_run",
              content: "验证首次修复，发现仍然失败：测试需要空列表而非字典。",
              time: 1781860029000,
              durationMs: 5100,
              status: "failed",
              actor: "Tool",
              metadata: { exit_code: 1, stderr: "AssertionError: {} != []" }
            },
            {
              id: "b7",
              type: "tool_call",
              category: "execution",
              name: "write_file",
              content: "第二次修复：修改默认返回值为合规的空列表。",
              time: 1781860036000,
              durationMs: 2200,
              status: "success",
              actor: "Tool",
              metadata: { diff: "- return {}\n+ return []" }
            },
            {
              id: "b8",
              type: "test_run",
              category: "execution",
              name: "pytest_run",
              content: "重新进行 pytest 验证测试，全绿通过。",
              time: 1781860040000,
              durationMs: 4600,
              status: "success",
              actor: "Tool"
            },
            {
              id: "b9",
              type: "agent",
              category: "input",
              name: "任务总结",
              content: "首次尝试因数据类型不吻合失败，第二次调整回空列表后测试验证成功。",
              time: 1781860047000,
              durationMs: 4000,
              status: "success",
              actor: "Agent"
            }
          ]
        },
        {
          traceId: "run-c",
          name: "Run C (夭折路径 - 引入编译错误)",
          events: [
            {
              id: "c1",
              type: "user",
              category: "input",
              name: "用户请求",
              content: "分析 anno-runner 的失败测试，并给出修复方案。",
              time: 1781860000000,
              durationMs: 0,
              status: "success",
              actor: "User"
            },
            {
              id: "c2",
              type: "planning",
              category: "reasoning",
              name: "制定计划",
              content: "先粗略阅读代码，然后直接去 test 目录下增加 Mock 并修改源码逻辑。",
              time: 1781860007000,
              durationMs: 9100,
              status: "success",
              actor: "Agent"
            },
            {
              id: "c3",
              type: "tool_call",
              category: "execution",
              name: "grep_search",
              content: "搜索对应的解析模块。",
              time: 1781860018000,
              durationMs: 1500,
              status: "success",
              actor: "Tool"
            },
            {
              id: "c4",
              type: "test_run",
              category: "execution",
              name: "pytest_run",
              content: "复现测试失败。",
              time: 1781860021000,
              durationMs: 4900,
              status: "failed",
              actor: "Tool"
            },
            {
              id: "c5",
              type: "tool_call",
              category: "execution",
              name: "write_file",
              content: "错误修改：在语法层面写入了一个未闭合的括号。",
              time: 1781860028000,
              durationMs: 2000,
              status: "success",
              actor: "Tool",
              metadata: { diff: "+ if (val is None" }
            },
            {
              id: "c6",
              type: "error",
              category: "failure",
              name: "语法/编译错误",
              content: "SyntaxError: unexpected EOF while parsing",
              time: 1781860032000,
              durationMs: 0,
              status: "failed",
              actor: "Tool"
            },
            {
              id: "c7",
              type: "agent",
              category: "reasoning",
              name: "陷入混乱",
              content: "无法解析语法错误起因，持续尝试读取错误行，最终执行步数超限夭折。",
              time: 1781860035000,
              durationMs: 15000,
              status: "failed",
              actor: "Agent"
            }
          ]
        }
      ],
      anchors: [
        {
          id: "anchor-task-start",
          label: "任务启动",
          kind: "task_start",
          eventRefs: [
            { traceId: "run-a", eventId: "a1" },
            { traceId: "run-b", eventId: "b1" },
            { traceId: "run-c", eventId: "c1" }
          ],
          confidence: 1.0,
          required: true
        },
        {
          id: "anchor-plan-ready",
          label: "计划生成",
          kind: "plan_ready",
          eventRefs: [
            { traceId: "run-a", eventId: "a2" },
            { traceId: "run-b", eventId: "b2" },
            { traceId: "run-c", eventId: "c2" }
          ],
          confidence: 0.95,
          required: true
        },
        {
          id: "anchor-first-test",
          label: "首轮复现",
          kind: "tool_call",
          eventRefs: [
            { traceId: "run-a", eventId: "a4" },
            { traceId: "run-b", eventId: "b4" },
            { traceId: "run-c", eventId: "c4" }
          ],
          confidence: 0.98,
          required: true
        },
        {
          id: "anchor-fix-applied",
          label: "修正代码",
          kind: "tool_call",
          eventRefs: [
            { traceId: "run-a", eventId: "a5" },
            { traceId: "run-b", eventId: "b7" }
          ],
          confidence: 0.88,
          required: true
        },
        {
          id: "anchor-final-verify",
          label: "最终验证",
          kind: "observation",
          eventRefs: [
            { traceId: "run-a", eventId: "a6" },
            { traceId: "run-b", eventId: "b8" }
          ],
          confidence: 0.99,
          required: true
        },
        {
          id: "anchor-task-complete",
          label: "任务总结",
          kind: "task_complete",
          eventRefs: [
            { traceId: "run-a", eventId: "a7" },
            { traceId: "run-b", eventId: "b9" }
          ],
          confidence: 0.92,
          required: true
        }
      ],
      segments: [
        {
          id: "seg-plan-to-test",
          label: "准备与复现阶段",
          kind: "matched",
          anchorIds: ["anchor-plan-ready", "anchor-first-test"],
          eventRefs: [
            { traceId: "run-a", eventId: "a3" },
            { traceId: "run-b", eventId: "b3" },
            { traceId: "run-c", eventId: "c3" }
          ],
          summary: "所有 Agent 实例均在此阶段成功通过 rg 工具定位代码并完成首轮测试复现。"
        },
        {
          id: "seg-retry-loop",
          label: "首轮修复失败与重试",
          kind: "diverged",
          anchorIds: ["anchor-first-test", "anchor-fix-applied"],
          eventRefs: [
            { traceId: "run-b", eventId: "b5" },
            { traceId: "run-b", eventId: "b6" }
          ],
          severity: "warning",
          summary: "仅 Run B 发生此分歧：首次修改因返回字典类型不符失败，随后触发了重试行为。"
        },
        {
          id: "seg-aborted",
          label: "致命编译错误与异常夭折",
          kind: "diverged",
          anchorIds: ["anchor-first-test"],
          eventRefs: [
            { traceId: "run-c", eventId: "c5" },
            { traceId: "run-c", eventId: "c6" },
            { traceId: "run-c", eventId: "c7" }
          ],
          severity: "critical",
          summary: "仅 Run C 发生此致命分歧：修改文件引入未闭合括号引发 SyntaxError，最终死循环超时夭折。"
        }
      ],
      findings: [
        {
          id: "find-retry-b",
          title: "Run B 中发生了一次修复重试循环",
          description: "在事件 b5 到 b6 阶段，模型由于生成了不符合测试契约的返回类型（字典而非列表），导致断言失败重新修复。建议优化 Prompt 强调输出契约约束。",
          kind: "failure_diff",
          eventRefs: [
            { traceId: "run-b", eventId: "b5" },
            { traceId: "run-b", eventId: "b6" }
          ],
          severity: "warning",
          score: 0.75
        },
        {
          id: "find-syntax-error-c",
          title: "Run C 由于语法错误最终夭折",
          description: "事件 c5 写入了错误的语法代码（括号未闭合），导致 pytest 编译挂掉，且模型缺乏自我纠正语法错的能力，这属于最高优先级的崩溃错误。",
          kind: "failure_diff",
          eventRefs: [
            { traceId: "run-c", eventId: "c5" },
            { traceId: "run-c", eventId: "c6" }
          ],
          severity: "critical",
          score: 0.99
        },
        {
          id: "find-duration-diff",
          title: "执行耗时显著差异",
          description: "Run A 在 32 秒内完成，而 Run B 经历了尝试和修复耗费了 47 秒（多消耗了 46% 的时间），建议分析 Run A生成方案时使用了何种直觉判断。",
          kind: "latency_diff",
          eventRefs: [
            { traceId: "run-a", eventId: "a7" },
            { traceId: "run-b", eventId: "b9" }
          ],
          severity: "info",
          score: 0.4
        }
      ]
    }
  }
};
