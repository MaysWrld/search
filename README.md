
# 📖 自定义搜索引擎项目最终部署说明

## 1\. 项目概览与文件结构

本项目采用 Cloudflare Pages Functions 架构：静态文件 (HTML/CSS) 部署在 `public` 目录下，而后端逻辑 (API 代理和管理员认证) 部署在 `functions` 目录下。

**请确认您的 GitHub 仓库包含以下结构，且代码已更新为最新版本：**

```
/your-search-project
├── public/
│   ├── index.html     # 搜索页面前端
│   └── style.css
└── functions/
    ├── api/
    │   └── search.js  # API 代理 Worker (从 KV 读取配置)
    └── admin.js       # 后台管理 Worker (处理认证和 KV 读写)
```

## 2\. 第一步：获取 Google 搜索 API 凭证（先决条件）

项目运行需要以下两个凭证，它们将在部署后通过后台管理页面配置到 KV 存储中。

| 凭证名称 | 来源 | 作用 |
| :--- | :--- | :--- |
| **API Key** | Google Cloud Console -\> API 和服务 -\> 凭据 | 验证您的应用身份 |
| **CX ID** | Programmable Search Engine 控制台 | 指定您创建的搜索实例 |

### 获取步骤简述：

1.  **获取 CX ID:** 访问 [Programmable Search Engine 控制台](https://programmablesearchengine.google.com/)，创建新的搜索引擎，并复制其 **搜索引擎 ID (CX ID)**。
2.  **获取 API Key:** 访问 [Google Cloud 控制台](https://console.cloud.google.com/)，创建一个新项目，启用 **Custom Search API**，然后在 **凭据** 中创建并复制 **API Key**。

## 3\. 第二步：Cloudflare 环境配置（部署前准备）

在 Cloudflare 控制台中设置安全参数和 KV 存储。

### 3.1 配置环境变量 (ENV)

这些变量用于后台认证 (`/admin`) 和会话管理。

1.  登录 Cloudflare，进入 Pages 项目（或创建新的项目）。
2.  导航到 **设置 (Settings)** -\> **环境 (Environment)** -\> **环境变量**。
3.  在 **生产环境 (Production)** 下设置以下变量：

| 变量名 | 作用 | 必须是长且随机的秘密字符串 |
| :--- | :--- | :--- |
| `ADMIN_USERNAME` | 后台登录用户名 | |
| `ADMIN_PASSWORD` | 后台登录密码 | |
| `ADMIN_TOKEN` | 会话安全令牌 | 确保此值足够复杂，且与 `functions/admin.js` 中 `env.ADMIN_TOKEN` 的读取逻辑匹配。|

### 3.2 配置 KV 命名空间绑定

KV 用于存储 API 密钥、CX ID 和 API URL，以便动态更新。

1.  **创建 KV Namespace:**
      * 导航到 **Workers & Pages** -\> **KV**，创建一个新的命名空间，例如命名为 `Search_API_Config`。
2.  **绑定到 Pages 项目:**
      * 在您的 Pages 项目设置中，导航到 **设置 (Settings)** -\> **函数 (Functions)**。
      * 找到 **KV 命名空间绑定** 并点击 **添加绑定**：
          * **变量名 (Variable name in code):** `API_CONFIG`
          * **KV 命名空间:** 选择您刚刚创建的 `Search_API_Config`。

## 4\. 第三步：通过 GitHub 部署代码

1.  **连接 GitHub 仓库:**
      * 在 Cloudflare 控制台，选择 **Workers & Pages** -\> **创建应用程序** -\> **Pages**。
      * 选择 **连接到 Git**，并授权 Cloudflare 访问您的 GitHub 仓库。
      * 选择您的项目仓库。
2.  **配置构建设置:**
      * **项目名称:** 填写您想要的名称。
      * **生产分支 (Production branch):** 确认是您要部署的分支（例如 `main`）。
      * **构建命令 (Build command):** `echo ""`
      * **构建输出目录 (Build output directory):** `public`
3.  **部署:** 点击 **保存并部署**。Cloudflare Pages 将自动识别 `public` 目录和 `functions` 目录，并开始部署。

## 5\. 第四步：首次使用与配置

部署成功后，您的自定义搜索引擎即可通过分配的域名访问。

1.  **登录后台：**
      * 访问 `https://您的域名/admin`。
      * 使用您在 **3.1 节** 中设置的 `ADMIN_USERNAME` 和 `ADMIN_PASSWORD` 登录。
2.  **设置 API 配置：**
      * 在后台管理页面，输入以下三项：
          * **Google API Key** (从 Google Cloud 获取)
          * **CX ID** (从 Programmable Search Engine 获取)
          * **API 基础 URL:** 默认填入 `https://www.googleapis.com/customsearch/v1`。如果您的环境无法直接访问 Google 官方 API，请在此处填写您的代理服务 URL。
      * 点击 **保存配置**。
3.  **测试：**
      * 访问主页 `https://您的域名/`，输入搜索词进行测试。

至此，您的项目已全部配置并上线！
