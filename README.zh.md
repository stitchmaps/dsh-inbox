# dsh-inbox

中文 | [English](README.md)

一个面向个人的 **信息聚合中心 / 统一收件箱** 插件（[DeepSeek Harness](https://github.com/deepseek-ai) / DSH）。把个人邮箱 —— **Gmail** 与 **QQ邮箱** —— 聚合到一个面板：统一列表、未读统计、渠道/账号筛选、搜索、邮件正文预览。

> 本 MVP 范围：**仅邮箱、只读**。QQ / 微信 / 抖音即时消息暂不接入 —— 这些平台没有官方个人消息接口，只能走有封号风险的第三方 Hook。见 [路线图](#路线图)。

## 功能

- 📥 Gmail + QQ邮箱 多账号统一收件箱
- 🔔 各渠道与总体未读计数
- 🔎 按渠道 / 账号筛选，搜索发件人与主题，「仅未读」开关
- 📄 按需预览邮件正文（优先纯文本，纯 HTML 时安全净化后渲染）
- 📎 附件名称/大小列出
- ⚙️ 账号管理：新增 / 编辑 / 删除、自定义 IMAP 主机与端口、连接测试
- 🔐 凭据本地加密存储（AES-256-GCM，密钥在 `DSH_HOME`）
- ⏱ 每 3 分钟后台增量同步 + 手动「同步」

## 安装

```powershell
pwsh -File .\install.ps1
```

脚本会把插件复制到 `%USERPROFILE%\.dsh\profiles\desktop\node_modules\dsh-inbox`，登记 `file:` 依赖，并向 profile 的 `cordis.patch.yml` 追加 loader 行（自动备份）。之后刷新 DSH Web GUI。

卸载：从 `cordis.patch.yml` 删除 `dsh-inbox` 行，并删除 `node_modules\dsh-inbox` 目录。

## 配置邮箱

打开 **信息中心 → 账号设置**，添加账号。

| 渠道 | IMAP 主机:端口 | 密码一栏 |
|---|---|---|
| Gmail | `imap.gmail.com:993` | Google **应用专用密码**（需开启两步验证） |
| QQ邮箱 | `imap.qq.com:993` | 16 位 **授权码**（设置 → 账号与安全 → 开启 IMAP，短信验证后获取） |

不要填主密码，请使用应用专用密码 / 授权码；不再使用时到服务商处吊销。

## 数据与安全

所有数据位于 `%DSH_HOME%\dsh-inbox\`（默认 `~/.dsh/dsh-inbox`）：

- `accounts.json` —— 账号元数据（不含密钥）
- `secrets.json` —— AES-256-GCM 加密后的密码
- `messages.json` —— 邮件摘要（主题/发件人/时间，不含完整正文）
- `cursors.json` —— 各账号同步游标
- `secret.key` —— 32 字节 AES 密钥（首次使用时创建，尽量设为 `0600`）
- `backups/` —— 每个文件保留最近 20 份时间戳备份

完整正文按需拉取，仅缓存在内存。除你自己的 IMAP 服务器外，数据不会发往任何地方。

## 实现说明

- **宿主半侧**（`lib/index.js` + `lib/mail.js` + `lib/store.js`）：基于 [`imapflow`](https://github.com/postalsys/imapflow) 与 [`mailparser`](https://github.com/nodemailer/mailparser) 的 IMAP 同步循环，暴露 `POST /api/dsh-inbox/state`。
- **浏览器半侧**（`lib/client.js`）：注册 `main` 面板与 `sidebar.panellist` 入口，调用宿主路由。
- **零运行时依赖**：`imapflow` 与 `mailparser` 已用 esbuild 预打包为单文件 `lib/vendor.cjs`，安装时不需要 `node_modules`（改动依赖后在本仓库执行 `npm install && npm run build:vendor` 重新生成）。
- **崩溃防护**：每个 IMAP 客户端都挂了 `error` 监听，socket 被重置不会再冒泡成未捕获异常、带走整个 DSH 宿主（2026-10-30 的崩溃即由此而来）；单轮同步上限 90 秒，并用看门狗复位超过 5 分钟的 `running` 标记，循环不会再次卡死。`npm test` 可离线覆盖这两条路径。

> 首次安装或更新了宿主代码后，如发现面板/同步行为不是最新版本，请重启一次 DSH 以加载宿主半侧（已保存数据不受影响）。浏览器半侧刷新页面即可更新。

## 路线图

- P1：通过用户自备的 NapCat / OneBot 端点接入 QQ 消息（非官方、需手动开启）
- P2：微信 / 抖音（非官方 Hook 或 RPA，默认关闭，附风险免责）

## 许可证

MIT
