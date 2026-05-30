# Wallet API

## 目录结构

```
project/
├── package.json
├── scripts/                        ← 上传的动态路由脚本存放在这里
│   └── order.js.example            ← 示例脚本（改名为 .js 即可测试）
└── src/
    ├── app.js                      ← 入口
    ├── utils/
    │   └── helpers.js              ← 公共工具（prisma、校验、响应）
    └── routes/
        ├── index.js                ← 静态路由注册表
        ├── user.js                 ← /dev/api/v1/user/*
        ├── wallet.js               ← /dev/api/v1/wallet/*
        └── script.js               ← /dev/api/v1/script/* + 动态加载器
```

## 启动

```bash
npm install

# 开发（热重载，修改 src/ 或 scripts/ 自动重启）
npm run dev

# 生产
npm start
```

## 静态接口

| Method | Path | 说明 |
|--------|------|------|
| POST | /dev/api/v1/user/login | 登录 |
| POST | /dev/api/v1/wallet/balance | 余额查询 |
| POST | /dev/api/v1/wallet/bet | 下注 |
| POST | /dev/api/v1/wallet/payout | 派彩 |
| POST | /dev/api/v1/wallet/rollback | 回滚 |
| POST | /dev/api/v1/script/upload | 上传脚本（自动挂载） |
| POST | /dev/api/v1/script/list | 列出已上传脚本 |
| POST | /dev/api/v1/script/delete | 删除脚本 |

---

## 上传脚本 → 自动变成新接口

### 1. 准备脚本文件

脚本必须是 ESM 格式，default export 一个 Express Router：

```js
// order.js
import { Router } from 'express';
import crypto from 'crypto';

const router = Router();

router.post('/create', async (req, res) => {
  res.json({ requestId: req.body.requestId, success: true, data: { orderId: crypto.randomUUID() } });
});

export default router;
```

### 2. 上传

```bash
curl -X POST http://localhost:4000/dev/api/v1/script/upload \
  -H "Content-Type: application/json" \
  -H "x-api-key: ak_live_demo" \
  -d '{
    "requestId": "req-001",
    "requestAt": 1700000000000,
    "fileName": "order.js",
    "encoding": "utf8",
    "content": "import { Router } from \"express\";\nconst router = Router();\nrouter.post(\"/create\", (req, res) => res.json({ success: true, data: { orderId: \"123\" } }));\nexport default router;"
  }'
```

响应：
```json
{
  "requestId": "req-001",
  "success": true,
  "data": {
    "fileName": "order.js",
    "mountedAt": "/dev/api/v1/order",
    "size": 180,
    "uploadedAt": "2024-01-01T00:00:00.000Z"
  }
}
```

### 3. 立即可用

```bash
curl -X POST http://localhost:4000/dev/api/v1/order/create \
  -H "Content-Type: application/json" \
  -d '{ "requestId": "req-002" }'
```

上传即生效，**无需重启**。再次上传同名文件即覆盖更新。

---

## 热重载说明

| 场景 | 机制 |
|------|------|
| 修改 `src/` 下的文件 | nodemon 监听，自动重启进程 |
| 上传新脚本到 `scripts/` | 动态加载器在下次请求时重新挂载，**无需重启** |
| 修改已存在的脚本文件 | 同上，mtime 变化触发重新 import |
