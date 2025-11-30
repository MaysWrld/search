// functions/api/search.js
/**
 * Cloudflare Pages Function: /api/search
 * * 职责: 
 * 1. 从 URL 查询参数中获取搜索词 (q)。
 * 2. 从 KV Namespace (API_CONFIG) 中安全读取 api_key, cx_id 和 api_base_url。
 * 3. 使用这些配置调用 Google Custom Search API (或其代理)。
 * 4. 返回 JSON 结果给前端。
 */

export async function onRequest(context) {
  const { env, request } = context;
  const url = new URL(request.url);
  
  // 1. 获取搜索查询参数
  const query = url.searchParams.get('q');

  if (!query) {
    return new Response(JSON.stringify({ error: "Missing query parameter 'q'." }), {
      status: 400,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  try {
    // 2. 从绑定的 KV Namespace (API_CONFIG) 中获取所有配置
    const apiKey = await env.API_CONFIG.get('api_key');
    const cxId = await env.API_CONFIG.get('cx_id');
    const apiBaseUrl = await env.API_CONFIG.get('api_base_url'); // 可配置的 API 基础 URL

    if (!apiKey || !cxId || !apiBaseUrl) {
       return new Response(JSON.stringify({ 
           error: 'Search configuration is incomplete. Please log in to /admin and set all required fields.' 
       }), {
           status: 500,
           headers: { 'Content-Type': 'application/json; charset=utf-8' },
       });
    }

    // 3. 构建完整的 API URL
    // URL 格式: [apiBaseUrl]?key=[apiKey]&cx=[cxId]&q=[query]
    const googleApiUrl = `${apiBaseUrl}?key=${apiKey}&cx=${cxId}&q=${encodeURIComponent(query)}`;

    // 4. 向 API 发起请求
    const apiResponse = await fetch(googleApiUrl);
    const data = await apiResponse.json();
    
    // 5. 检查 Google API 是否返回错误
    if (data.error) {
        console.error('Google API Error:', data.error.message);
        return new Response(JSON.stringify({ 
            error: `Google API Error: ${data.error.message}` 
        }), {
            status: apiResponse.status,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
    }

    // 6. 返回结果
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

  } catch (error) {
    console.error('API Proxy Function Error:', error);
    return new Response(JSON.stringify({ error: `Internal server error: ${error.message}` }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
