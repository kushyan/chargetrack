# 充电站实时监控

对接一充云平台（`iot.yizhongyun.com`）的 11 台充电桩，实时显示每台设备 10 个端口的占用状态。
零依赖：原生 HTML/CSS/JS 前端，本地用 Node 服务代理上游，线上用 GitHub Actions 定时生成数据快照托管到 GitHub Pages。

## 数据来源（已逆向确认，无需鉴权）

```http
POST http://iot.yizhongyun.com/Appapi/chargingOperation
Content-Type: application/json;charset=UTF-8
{"dev_id":"2022002744","uid":"tSRE_Ki6boBIGPqfXRcfD2xn"}

→ {"code":0,"data":{"socket":[{"channel":"00","status":0,"dev_id":"..."}, ...]}}
```

```http
POST http://iot.yizhongyun.com/Appapi/checkDev
{"dev_id":"2022002744","uid":"..."}
→ {"code":0,"data":{"status":1,"is_online":1}}
```

状态语义：`status = 1` 空闲 / `0` 使用中 / `-1` 故障；`is_online = 0` 表示设备离线。

## 本地运行（真实时数据，10 秒刷新）

```bash
node server.mjs            # → http://127.0.0.1:4175
PORT=8080 node server.mjs  # 换端口（端口占用时会提示）
```

Windows 可直接双击 `启动.bat`。

服务端对上游做 5 秒缓存 + 后台定时刷新，单站失败保留上次成功数据并标记离线。

## 部署到 GitHub Pages

关键限制：GitHub Pages 只有静态托管，而浏览器不能直接请求 `http://` 的上游接口（HTTPS 页面禁止混合内容 + 上游无 CORS 头）。
所以站点用「GitHub Actions 定时抓取 → 生成 `public/data.json` → 部署 Pages」的方式拿到数据，约每 5 分钟更新一次。

1. 新建仓库，把本目录所有文件推上去（`main` 分支）：

   ```bash
   git init
   git add .
   git commit -m "feat: charging station monitor"
   git branch -M main
   git remote add origin git@github.com:<你的用户名>/<仓库名>.git
   git push -u origin main
   ```

2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。

3. 仓库 **Actions** 里手动跑一次 `Update data & deploy Pages`（触发器 `workflow_dispatch`），
   之后每 5 分钟自动跑 `push` + `schedule` 两条触发线。

4. 几十秒后访问 `https://<你的用户名>.github.io/<仓库名>/`。

工作流见 `.github/workflows/deploy.yml`：checkout → `node scripts/fetch-data.mjs` → 上传 `public/` → 部署 Pages。
快照生成失败时不会中断部署，会用上一次的数据兜底并把站点点位标为离线。

想更新更快，可以换成 Cloudflare Workers / Vercel 之类的免费函数做 CORS 代理，再把 `public/js/app.js`
里 `fetchStatus()` 的第一个请求地址指过去即可，其余代码不用动。

## 前端行为

- 先请求 `/api/status`（本地 server.mjs），失败则自动回退到 `data.json`（Pages 环境），无需改代码。
- 本地模式 10 秒轮询；静态快照模式 60 秒轮询一次并在徽标上显示「定时快照」。
- 只更新变化的端口，加一次 0.72s 缩放高亮，不重建 DOM。
- 统计条汇总「空闲端口 / 使用中 / 离线故障 / 站点在线」。
- 右上角：数据来源徽标、最后更新时间、手动刷新、明暗主题（跟随系统、记忆选择）。
- 页脚留了联系方式邮箱，改 `public/index.html` 底部即可。

## 目录

```
chargetrack-clone/
├─ server.mjs                 本地服务：静态托管 + 上游代理 + 缓存
├─ config.mjs                 站点 / 上游 / 端口的唯一配置源
├─ scripts/fetch-data.mjs     抓上游生成 public/data.json（Actions 用）
├─ .github/workflows/deploy.yml  定时抓数据 + 部署 Pages
├─ 启动.bat                   Windows 一键启动
├─ public/
│  ├─ index.html              顶栏 / 统计条 / 站点网格 / 页脚
│  ├─ data.json               Actions 生成的快照（本地抓一次也能直接看）
│  ├─ favicon.svg
│  ├─ css/style.css           明暗双主题
│  └─ js/app.js               轮询、diff、闪烁、主题
├─ _upstream/                 上游 SPA 打包（逆向用，已 gitignore）
├─ _src/                      早期复刻站存档（已 gitignore）
├─ 抓取清单.md                 接口与路径清单
└─ README.md
```

改站点顺序 / 增减设备：编辑 `config.mjs` 的 `stations`，本地与 Actions 同时生效。

仅供个人查看设备占用状态使用。
