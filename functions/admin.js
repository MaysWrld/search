// functions/admin.js
/**
 * Cloudflare Pages Function: /admin
 * * 职责: 
 * 1. 使用 ENV 变量 (ADMIN_USERNAME/ADMIN_PASSWORD) 实现登录认证。
 * 2. 使用 Cookie 和 ENV 变量 (ADMIN_TOKEN) 维护会话状态。
 * 3. 登录成功后，从 KV (API_CONFIG) 读写 api_key, cx_id 和 api_base_url。
 * 4. 确保 HTML 页面使用 UTF-8 编码并居中显示。
 */

const ADMIN_TOKEN_NAME = 'AUTH_TOKEN';
const TOKEN_MAX_AGE = 3600; // 1小时有效期 (秒)

// --- 辅助函数：HTML 模板 ---

// 解决乱码和排版：设置 UTF-8 并在 CSS 中实现居中
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

// 解决乱码和排版：设置 UTF-8 并在 CSS 中实现居中
async function generateAdminPanel(env) {
    // 从 KV 中读取当前的配置信息
    const currentApiKey = await env.API_CONFIG.get('api_key') || 'Not Set (请配置)';
    const currentCxId = await env.API_CONFIG.get('cx_id') || 'Not Set (请配置)';
    const currentApiUrl = await env.API_CONFIG.get('api_base_url') || 'Not Set (请配置)';
    
    // 格式化显示（隐藏部分内容以增加安全）
    const maskedApiKey = currentApiKey.length > 8 ? `${currentApiKey.substring(0, 4)}...${currentApiKey.slice(-4)}` : currentApiKey;
    const maskedCxId = currentCxId.length > 8 ? `${currentCxId.substring(0, 4)}...${currentCxId.slice(-4)}` : currentCxId;

    return `
        <html>
        <head>
            <meta charset="UTF-8">
            <title>Admin Panel</title>
            <style>
                body { font-family: Arial; display: flex; flex-direction: column; align-items: center; padding-top: 50px; background-color: #f4f4f4; }
                .container { max-width: 800px; width: 90%; background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                form { margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 5px; } 
                input { width: 100%; padding: 8px; margin-top: 5px; margin-bottom: 15px; box-sizing: border-box; } 
                button { padding: 10px 15px; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>搜索 API 配置</h1>
                <p><strong>当前配置:</strong></p>
                <ul>
                    <li>API Key: ${maskedApiKey}</li>
                    <li>CX ID: ${maskedCxId}</li>
                    <li>**API 基础 URL:** <code>${currentApiUrl}</code></li>
                </ul>
                
                <hr>
                
                <h2>更新配置 (写入 KV)</h2>
                <form method="POST">
                    <label for="new_api_key">Google API Key:</label><br>
                    <input type="text" id="new_api_key" name="new_api_key" placeholder="输入完整的 API Key" required><br>
                    
                    <label for="new_cx_id">CX ID:</label><br>
                    <input type="text" id="new_cx_id" name="new_cx_id" placeholder="输入完整的 CX ID" required><br>
                    
                    <label for="new_api_base_url">**API 基础 URL**:</label><br>
                    <input type="text" id="new_api_base_url" name="new_api_base_url" placeholder="例如: https://www.googleapis.com/customsearch/v1" required>
                    <p style="font-size: 12px; color: #666;">**提示:** 如果 Google 官方 API 地址无法访问，请在此填写您可访问的代理服务基础 URL。</p>
                    
                    <button type="submit" name="action" value="update_keys">保存配置</button>
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

    // 🌟 最佳实践: 从 ENV 读取 ADMIN_TOKEN
    const ADMIN_TOKEN = env.ADMIN_TOKEN; 

    // 1. 检查登录状态
    const cookieHeader = request.headers.get('Cookie') || '';
    const isLoggedIn = ADMIN_TOKEN && cookieHeader.includes(`${ADMIN_TOKEN_NAME}=${ADMIN_TOKEN}`);

    let loginError = '';

    // 2. 处理 POST 请求 (登录, 登出, 更新配置)
    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');

        if (action === 'login') {
            const inputUser = formData.get('username');
            const inputPass = formData.get('password');
            
            // 使用 CF Environment Variables 进行认证
            if (inputUser === env.ADMIN_USERNAME && inputPass === env.ADMIN_PASSWORD && ADMIN_TOKEN) {
                // 登录成功: 设置 Cookie 并重定向
                const response = new Response("Login Success! Redirecting...", { status: 302 });
                const cookie = `${ADMIN_TOKEN_NAME}=${ADMIN_TOKEN}; HttpOnly; Secure; Max-Age=${TOKEN_MAX_AGE}; Path=/admin`;
                response.headers.set('Set-Cookie', cookie);
                response.headers.set('Location', '/admin');
                return response;
            } else {
                loginError = 'Invalid Username or Password, or ADMIN_TOKEN not set.';
            }
        
        } else if (action === 'logout' && isLoggedIn) {
            // 登出成功: 删除 Cookie
            const response = new Response("Logout Success! Redirecting...", { status: 302 });
            response.headers.set('Set-Cookie', `${ADMIN_TOKEN_NAME}=deleted; HttpOnly; Secure; Max-Age=0; Path=/admin; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
            response.headers.set('Location', '/admin?status=logged_out');
            return response;

        } else if (action === 'update_keys' && isLoggedIn) {
            // 写入配置到 KV
            const newApiKey = formData.get('new_api_key');
            const newCxId = formData.get('new_cx_id');
            const newApiBaseUrl = formData.get('new_api_base_url');

            try {
                await env.API_CONFIG.put('api_key', newApiKey);
                await env.API_CONFIG.put('cx_id', newCxId);
                await env.API_CONFIG.put('api_base_url', newApiBaseUrl);

                // 更新成功后重定向 (保持登录状态)
                const response = new Response("Configuration Updated", { status: 302 });
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
        if (url.searchParams.get('status') === 'config_updated') message = '配置已更新，请重新登录。'; // 建议更新后重新登录以刷新状态
        
        htmlContent = generateLoginForm(message);
    }

    return new Response(htmlContent, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }, // 确保 UTF-8 编码
    });
}
