#!/bin/bash
# 获取一个有效的 Token (这里我们只能模拟或假设有一个，或者跳过 Auth 验证进行测试? 不行，必须 Auth)
# 我们直接在代码里加一个临时的免认证路由用于测试? 不太好。
# 我们检查代码逻辑是否正确。

# 尝试 curl 本地接口，看是否 404
curl -v -X POST http://localhost:3000/api/tasks/node-task   -H "Content-Type: application/json"   -d '{"nodeId":"test-node","taskId":"test-task"}'
