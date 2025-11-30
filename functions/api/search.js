// functions/api/search.js

// Cloudflare Pages Functions 默认使用 ES Module 导出
export async function onRequest(context) {
  // context 包含 request, env (环境变量和 KV 绑定), params 等信息
  const { env, request } = context;
  const url = new URL(request.url);
  
  // 1. 获取搜索查询参数
  const query = url.searchParams.get('q');

  if (!query) {
    return new Response(JSON.stringify({ error: "Missing query parameter 'q'." }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 2. 从绑定的 KV Namespace (API_CONFIG) 中获取配置
  // 确保您已在 CF Pages 设置中将 KV Namespace 绑定到 API_CONFIG 变量名
  try {
    const apiKey = await env.API_CONFIG.get('api_key');
    const cxId = await env.API_CONFIG.get('cx_id');

    if (!apiKey || !cxId) {
       // 如果 KV 中没有配置，返回错误提示
       return new Response(JSON.stringify({ 
           error: 'Search configuration is missing. Please log in to /admin to set API Key and CX ID.' 
       }), {
           status: 500,
           headers: { 'Content-Type': 'application/json' },
       });
    }

    // 3. 构建 Google Custom Search API URL
    const googleApiUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cxId}&q=${encodeURIComponent(query)}`;

    // 4. 向 Google API 发起请求
    const apiResponse = await fetch(googleApiUrl);
    const data = await apiResponse.json();
    
    // 5. 检查 Google API 是否返回错误（例如配额用尽）
    if (data.error) {
        console.error('Google API Error:', data.error.message);
        return new Response(JSON.stringify({ 
            error: `Google API Error: ${data.error.message}` 
        }), {
            status: apiResponse.status,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    // 6. 返回结果给前端
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('API Proxy Function Error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error while processing the request.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
