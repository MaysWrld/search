// functions/api/search.js
/**
 * Cloudflare Pages Function: /api/search
 * 职责: 
 * 1. 从 URL 查询参数中获取搜索词 (q)。
 * 2. 从 KV Namespace (API_CONFIG) 中安全读取配置。
 * 3. 调用配置的 API 基础 URL (Google 或代理)。
 * 4. 增强错误处理和日志记录，用于调试配置或网络问题。
 * 5. 返回 JSON 结果给前端。
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
    const apiBaseUrl = await env.API_CONFIG.get('api_base_url');

    if (!apiKey || !cxId || !apiBaseUrl) {
       console.error('Configuration Missing in KV:', { apiKey: !!apiKey, cxId: !!cxId, apiBaseUrl: !!apiBaseUrl });
       return new Response(JSON.stringify({ 
           error: 'Search configuration is incomplete. Please log in to /admin and set all required fields.' 
       }), {
           status: 500,
           headers: { 'Content-Type': 'application/json; charset=utf-8' },
       });
    }

    // 3. 构建完整的 API URL
    const googleApiUrl = `${apiBaseUrl}?key=${apiKey}&cx=${cxId}&q=${encodeURIComponent(query)}`;

    // 4. 向 API 发起请求
    const apiResponse = await fetch(googleApiUrl);

    // 🚨 调试日志 1: 记录 HTTP 状态码
    console.log(`Upstream API Request URL: ${googleApiUrl}`);
    console.log(`Upstream API Status: ${apiResponse.status}`);
    
    // 如果状态码不是 2xx，则表明请求失败，提前返回错误
    if (!apiResponse.ok) {
        // 尝试获取响应文本，以便在日志中查看错误内容
        const errorText = await apiResponse.text();
        console.error('Upstream API non-OK Response Text:', errorText);
        
        return new Response(JSON.stringify({ 
            error: `Upstream API request failed with status ${apiResponse.status}. Check Worker logs for error details.`,
            upstream_status: apiResponse.status 
        }), {
            status: 502, // Bad Gateway
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
    }

    // 5. 尝试解析 JSON
    // 在解析之前先获取文本，以便在解析失败时打印内容
    const responseText = await apiResponse.text();

    try {
        const data = JSON.parse(responseText);
        
        // 6. 检查 Google API 返回的 JSON 中是否包含错误信息
        if (data.error) {
            console.error('Google API JSON Error:', data.error.message);
            return new Response(JSON.stringify({ 
                error: `Google API Error: ${data.error.message}`,
                reason: data.error.reason || 'API returned internal error'
            }), {
                status: 400, // 认证或配额问题通常返回 400级错误
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
            });
        }

        // 7. 返回结果给前端
        return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
        
    } catch (e) {
        // 捕获到解析 JSON 时的错误 (例如收到 HTML)
        console.error('JSON Parsing Error. Received Content Snippet:', responseText.substring(0, 500));
        console.error('JSON Parsing Exception:', e.message);
        return new Response(JSON.stringify({ 
            error: `Failed to parse upstream response as JSON. Received non-JSON data (e.g., HTML).`,
            snippet: responseText.substring(0, 100),
            debug_info: 'Check Worker logs for upstream response status and content.'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json; charset=utf-8' },
        });
    }

  } catch (error) {
    // 捕获请求本身失败的错误 (例如网络连接问题)
    console.error('API Proxy Function Fatal Error:', error);
    return new Response(JSON.stringify({ 
        error: `Internal server error while processing the request: ${error.message}` 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }
}
