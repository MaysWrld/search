// functions/admin.js (完整代码 - 优化后)

const ADMIN_TOKEN_NAME = 'AUTH_TOKEN';
const TOKEN_MAX_AGE = 3600; // 1小时有效期 (秒)

// --- 辅助函数：HTML 模板 ---

// 生成登录表单 HTML (保持不变，已包含居中和 UTF-8)
function generateLoginForm(message = '') {
    return `
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Admin Login</title>
            <style>
                body { font-family: Arial; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; background-color: #f4f4f4; } 
                form { max-width: 400px; padding: 30px; border: 1px solid #ccc; border-radius: 8px; background-color: #fff; box-shadow: 0 4px 6px rgba(0,0,0,0.1); } 
                input, button { width: 100%; padding: 10px; margin-bottom: 10px; box-sizing: border-box; } 
                .error { color: red; text-align: center; }
            </style>
        </head>
        <body>
            <form method="POST" action="/admin">
                <h2>后台管理登录</h2>
                ${message ? `<p class="error">${message}</p>` : ''}
                <label for="username">用户名:</label>
                <input type="text" id="username" name="username" required>
                <label for="password">密码:</label>
                <input type="password" id="password" name="password" required>
                <button type="submit" name="action" value="login">登录</button>
            </form>
        </body>
        </html>
    `;
}

// 🌟 更新：显示完整配置，修改措辞，增加填写提示
async function generateAdminPanel(env) {
    // 从 KV 中读取当前的完整配置信息
    const currentApiKey = await env.API_CONFIG.get('api_key') || '未设置 (Required)';
    const currentCxId = await env.API_CONFIG.get('cx_id') || '未设置 (Required)';
    const currentApiUrl = await env.API_CONFIG.get('api_base_url') || '未设置 (Required)';

    // 设置用于显示的配置项
    const configItems = [
        { label: 'API Key', value: currentApiKey, id: 'display_api_key' },
        { label: 'CX ID (Search Engine ID)', value: currentCxId, id: 'display_cx_id' },
        { label: 'API 基础 URL', value: currentApiUrl, id: 'display_api_url' }
    ];

    const configHtml = configItems.map(item => `
        <div style="margin-bottom: 15px;">
            <strong>${item.label}:</strong>
            <textarea id="${item.id}" rows="1" readonly style="width:100%; resize:none; font-family: monospace; padding: 5px; background-color: #eee; border: 1px solid #ccc; cursor: copy;">${item.value}</textarea>
        </div>
    `).join('');

    return `
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Admin Panel</title>
            <style>
                body { font-family: Arial; display: flex; flex-direction: column; align-items: center; padding-top: 50px; background-color: #f4f4f4; }
                .container { max-width: 800px; width: 90%; background-color: #fff; padding: 20px 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                form { margin-top: 20px; padding: 15px; border: 1px solid #eee; border-radius: 5px; } 
                input[type="text"] { width: 100%; padding: 8px; margin-top: 5px; margin-bottom: 5px; box-sizing: border-box; } 
                button { padding: 10px 15px; margin-top: 10px; }
                .hint { font-size: 12px; color: #666; margin-bottom: 15px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>搜索 API 配置管理</h1>
                
                <h2>当前完整配置 (KV 存储)</h2>
                ${configHtml}
                
                <hr>
                
                <h2>保存新的配置</h2>
                <form method="POST">
                    
                    <label for="new_api_key">1. Google API Key:</label><br>
                    <input type="text" id="new_api_key" name="new_api_key" placeholder="AIzaSyC..." required><br>
                    <p class="hint">填写从 Google Cloud 控制台获取的 API 密钥。这是您的应用程序身份凭证。</p>
                    
                    <label for="new_cx_id">2. CX ID (Custom Search Engine ID):</label><br>
                    <input type="text" id="new_cx_id" name="new_cx_id" placeholder="230d3b5a85cab4c35..." required><br>
                    <p class="hint">填写从 Google Programmable Search Engine 获取的唯一 ID，用于指定您的搜索实例。</p>
                    
                    <label for="new_api_base_url">3. API 基础 URL:</label><br>
                    <input type="text" id="new_api_base_url" name="new_api_base_url" placeholder="例如: https://www.googleapis.com/customsearch/v1" required><br>
                    <p class="hint">如果 Google 官方 API 地址无法访问，请在此填写您可访问的代理服务基础 URL。**官方默认值为：https://www.googleapis.com/customsearch/v1**</p>
                    
                    <button type="submit" name="action" value="update_keys">保存配置到 KV</button>
                </form>
                <hr>
                <form method="POST">
                    <button type="submit" name="action" value="logout">安全登出</button>
                </form>
            </div>
        </body>
        </html>
    `;
}

// --- 主要 Worker 逻辑 ---

export async function onRequest(context) {
    const { env, request } = context;
    const url = new URL(request.url);

    // 从 ENV 读取 ADMIN_TOKEN
    const ADMIN_TOKEN = env.ADMIN_TOKEN; 

    // 1. 检查登录状态
    const cookieHeader = request.headers.get('Cookie') || '';
    const isLoggedIn = ADMIN_TOKEN && cookieHeader.includes(`${ADMIN_TOKEN_NAME}=${ADMIN_TOKEN}`);

    let loginError = '';

    // 2. 处理 POST 请求 (登录, 登出, 保存配置)
    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');

        if (action === 'login') {
            const inputUser = formData.get('username');
            const inputPass = formData.get('password');
            
            if (inputUser === env.ADMIN_USERNAME && inputPass === env.ADMIN_PASSWORD && ADMIN_TOKEN) {
                const response = new Response("Login Success! Redirecting...", { status: 302 });
                const cookie = `${ADMIN_TOKEN_NAME}=${ADMIN_TOKEN}; HttpOnly; Secure; Max-Age=${TOKEN_MAX_AGE}; Path=/admin`;
                response.headers.set('Set-Cookie', cookie);
                response.headers.set('Location', '/admin');
                return response;
            } else {
                loginError = 'Invalid Username or Password, or ADMIN_TOKEN not set.';
            }
        
        } else if (action === 'logout' && isLoggedIn) {
            const response = new Response("Logout Success! Redirecting...", { status: 302 });
            response.headers.set('Set-Cookie', `${ADMIN_TOKEN_NAME}=deleted; HttpOnly; Secure; Max-Age=0; Path=/admin; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
            response.headers.set('Location', '/admin?status=logged_out');
            return response;

        } else if (action === 'update_keys' && isLoggedIn) { // 逻辑上是保存，action 值保持不变
            const newApiKey = formData.get('new_api_key');
            const newCxId = formData.get('new_cx_id');
            const newApiBaseUrl = formData.get('new_api_base_url');

            try {
                // 写入 KV Namespace (覆盖旧值)
                await env.API_CONFIG.put('api_key', newApiKey);
                await env.API_CONFIG.put('cx_id', newCxId);
                await env.API_CONFIG.put('api_base_url', newApiBaseUrl);

                // 更新成功后重定向
                const response = new Response("Configuration Saved", { status: 302 });
                response.headers.set('Location', '/admin?status=config_updated');
                const cookie = `${ADMIN_TOKEN_NAME}=${ADMIN_TOKEN}; HttpOnly; Secure; Max-Age=${TOKEN_MAX_AGE}; Path=/admin`;
                response.headers.set('Set-Cookie', cookie);
                return response;
            } catch (e) {
                return new Response(`KV Write Error: ${e.message}`, { status: 500 });
            }
        }
    }

    // 3. 处理 GET 请求 (显示页面)
    let htmlContent;
    
    if (isLoggedIn) {
        // 已登录，显示管理面板
        htmlContent = await generateAdminPanel(env);
    } else {
        // 未登录，显示登录表单
        let message = loginError;
        if (url.searchParams.get('status') === 'logged_out') message = '您已成功登出。';
        else if (url.searchParams.get('status') === 'config_updated') message = '配置已保存，请重新登录。'; 
        
        htmlContent = generateLoginForm(message);
    }

    return new Response(htmlContent, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
}
