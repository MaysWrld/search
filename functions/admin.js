// functions/admin.js

// ❗ 注意：请将 'your-admin-auth-token' 替换为一个您自定义的、足够长的秘密字符串
// 这是一个简单的静态 token，用于在 cookie 中标记登录状态
const ADMIN_TOKEN = 'your-admin-auth-token-replace-me-with-long-secret';
const ADMIN_TOKEN_NAME = 'AUTH_TOKEN';
const TOKEN_MAX_AGE = 3600; // 1小时有效期 (秒)

// --- 辅助函数：HTML 模板 ---

// 生成登录表单 HTML
function generateLoginForm(message = '') {
    return `
        <html>
        <head>
            <title>Admin Login</title>
            <style>body{font-family: Arial;} form{max-width:300px; margin: 50px auto; padding: 20px; border: 1px solid #ccc; border-radius: 5px;} input, button{width: 100%; padding: 10px; margin-bottom: 10px; box-sizing: border-box;} .error{color:red;}</style>
        </head>
        <body>
            <form method="POST" action="/admin">
                <h2>Admin Login</h2>
                ${message ? `<p class="error">${message}</p>` : ''}
                <label for="username">Username:</label>
                <input type="text" id="username" name="username" required>
                <label for="password">Password:</label>
                <input type="password" id="password" name="password" required>
                <button type="submit" name="action" value="login">Login</button>
            </form>
        </body>
        </html>
    `;
}

// 生成管理面板 HTML
async function generateAdminPanel(env) {
    // 从 KV 中读取当前的配置信息
    const currentApiKey = await env.API_CONFIG.get('api_key') || 'Not Set (请配置)';
    const currentCxId = await env.API_CONFIG.get('cx_id') || 'Not Set (请配置)';

    // 格式化显示（隐藏部分内容以增加安全）
    const maskedApiKey = currentApiKey.length > 8 ? `${currentApiKey.substring(0, 4)}...${currentApiKey.slice(-4)}` : currentApiKey;
    const maskedCxId = currentCxId.length > 8 ? `${currentCxId.substring(0, 4)}...${currentCxId.slice(-4)}` : currentCxId;

    return `
        <html>
        <head>
            <title>Admin Panel</title>
            <style>body{font-family: Arial;} form{margin-bottom: 20px; padding: 15px; border: 1px solid #eee; border-radius: 5px;} input{width: 300px; padding: 8px; margin-top: 5px; margin-bottom: 15px;} button{padding: 10px 15px;}</style>
        </head>
        <body>
            <h1>Search API Configuration</h1>
            <p><strong>当前配置:</strong></p>
            <ul>
                <li>API Key: ${maskedApiKey}</li>
                <li>CX ID: ${maskedCxId}</li>
            </ul>
            
            <hr>
            
            <h2>更新配置 (写入 KV)</h2>
            <form method="POST">
                <label for="new_api_key">New Google API Key:</label><br>
                <input type="text" id="new_api_key" name="new_api_key" placeholder="输入完整的 API Key" required><br>
                
                <label for="new_cx_id">New CX ID:</label><br>
                <input type="text" id="new_cx_id" name="new_cx_id" placeholder="输入完整的 CX ID" required><br>
                
                <button type="submit" name="action" value="update_keys">保存配置</button>
            </form>
            <hr>
            <form method="POST">
                <button type="submit" name="action" value="logout">安全登出</button>
            </form>
            <p><small>Username/Password set via Cloudflare Environment Variables.</small></p>
        </body>
        </html>
    `;
}

// --- 主要 Worker 逻辑 ---

export async function onRequest(context) {
    const { env, request } = context;
    const url = new URL(request.url);

    // 1. 检查登录状态
    const cookieHeader = request.headers.get('Cookie') || '';
    const isLoggedIn = cookieHeader.includes(`${ADMIN_TOKEN_NAME}=${ADMIN_TOKEN}`);

    let statusMessage = url.searchParams.get('status');
    let loginError = '';

    // 2. 处理 POST 请求 (登录, 登出, 更新配置)
    if (request.method === 'POST') {
        const formData = await request.formData();
        const action = formData.get('action');

        if (action === 'login') {
            const inputUser = formData.get('username');
            const inputPass = formData.get('password');
            
            // 使用 CF Environment Variables 进行认证
            if (inputUser === env.ADMIN_USERNAME && inputPass === env.ADMIN_PASSWORD) {
                // 登录成功: 设置 Cookie 并重定向
                const response = new Response("Login Success! Redirecting...", { status: 302 });
                // HttpOnly, Secure 是安全性要求
                const cookie = `${ADMIN_TOKEN_NAME}=${ADMIN_TOKEN}; HttpOnly; Secure; Max-Age=${TOKEN_MAX_AGE}; Path=/admin`;
                response.headers.set('Set-Cookie', cookie);
                response.headers.set('Location', '/admin');
                return response;
            } else {
                loginError = 'Invalid Username or Password.';
                // 保持在登录页
            }
        
        } else if (action === 'logout' && isLoggedIn) {
            // 登出成功: 删除 Cookie 并重定向到登录页
            const response = new Response("Logout Success! Redirecting...", { status: 302 });
            // 设置过期时间为过去，强制浏览器删除 Cookie
            response.headers.set('Set-Cookie', `${ADMIN_TOKEN_NAME}=deleted; HttpOnly; Secure; Max-Age=0; Path=/admin; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
            response.headers.set('Location', '/admin?status=logged_out');
            return response;

        } else if (action === 'update_keys' && isLoggedIn) {
            // 写入配置到 KV
            const newApiKey = formData.get('new_api_key');
            const newCxId = formData.get('new_cx_id');

            try {
                // 使用 KV 绑定写入数据
                await env.API_CONFIG.put('api_key', newApiKey);
                await env.API_CONFIG.put('cx_id', newCxId);

                // 更新成功后重定向 (保持登录状态)
                const response = new Response("Configuration Updated", { status: 302 });
                response.headers.set('Location', '/admin?status=config_updated');
                // 重新设置 Cookie 以延长有效期 (可选)
                const cookie = `${ADMIN_TOKEN_NAME}=${ADMIN_TOKEN}; HttpOnly; Secure; Max-Age=${TOKEN_MAX_AGE}; Path=/admin`;
                response.headers.set('Set-Cookie', cookie);
                return response;
            } catch (e) {
                // 写入 KV 失败
                return new Response(`KV Write Error: ${e.message}`, { status: 500 });
            }
        }
    }

    // 3. 处理 GET 请求 (显示页面)
    let htmlContent;
    let responseStatus = 200;

    if (isLoggedIn) {
        // 已登录，显示管理面板
        htmlContent = await generateAdminPanel(env);
    } else {
        // 未登录，显示登录表单
        let message = '';
        if (loginError) message = loginError;
        else if (statusMessage === 'logged_out') message = '您已成功登出。';
        
        htmlContent = generateLoginForm(message);
    }

    return new Response(htmlContent, {
        status: responseStatus,
        headers: { 'Content-Type': 'text/html' },
    });
}
