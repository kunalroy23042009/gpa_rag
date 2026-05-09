/* ═══════════════════════════════════════════════════════════════
   GPA API Proxy — Cloudflare Worker
   Securely proxies Gemini API calls, hiding the API key server-side.
   
   Routes:
     POST /api/chat    → Gemini generateContent
     POST /api/embed   → Gemini embedContent
     GET  /api/health  → Health check
   ═══════════════════════════════════════════════════════════════ */

// ─── Configuration ───
const ALLOWED_ORIGINS = [
    'https://anantanand259.github.io',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5500',
    'http://localhost:8080',
];

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const CHAT_MODELS = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite'];
const EMBED_MODEL = 'text-embedding-004';
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1500; // ms

// Rate limit: 60 requests per minute per IP
const RATE_LIMIT_WINDOW = 60_000; // 1 minute in ms
const RATE_LIMIT_MAX = 60;

// In-memory rate limit store (resets on Worker restart, which is fine)
const rateLimitMap = new Map();

// ─── Main Handler ───
export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return handleCORS(request);
        }

        // Validate origin
        const origin = request.headers.get('Origin') || '';
        if (!isAllowedOrigin(origin)) {
            return jsonResponse({ error: 'Forbidden: Origin not allowed' }, 403);
        }

        // Rate limiting
        const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
        if (isRateLimited(clientIP)) {
            return corsResponse(
                jsonResponse({ error: 'Rate limit exceeded. Please slow down.' }, 429),
                origin
            );
        }

        // Check API key is configured
        const apiKey = env.HF_API_KEY;
        if (!apiKey) {
            return corsResponse(
                jsonResponse({ error: 'Server misconfiguration: API key not set' }, 500),
                origin
            );
        }

        // Route handling
        const url = new URL(request.url);
        const path = url.pathname;

        try {
            let response;

            if (path === '/api/chat' && request.method === 'POST') {
                response = await handleChat(request, apiKey);
            } else if (path === '/api/embed' && request.method === 'POST') {
                response = await handleEmbed(request, apiKey);
            } else if (path === '/api/health' && request.method === 'GET') {
                response = jsonResponse({
                    status: 'ok',
                    timestamp: new Date().toISOString(),
                    message: 'GPA API Proxy is running'
                }, 200);
            } else {
                response = jsonResponse({ error: 'Not found' }, 404);
            }

            return corsResponse(response, origin);
        } catch (err) {
            return corsResponse(
                jsonResponse({ error: 'Internal server error', detail: err.message }, 500),
                origin
            );
        }
    }
};


// ═══════════════════════════════════════════════════════════════
// ROUTE HANDLERS
// ═══════════════════════════════════════════════════════════════

async function handleChat(request, apiKey) {
    const body = await request.json();

    const userMessage = body.contents?.[0]?.parts?.[0]?.text || "";

    try {
        const hfResponse = await fetch(
            "https://router.huggingface.co/hf-inference/models/google/flan-t5-large",
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    inputs: `Answer clearly:\n${userMessage}`,
                    parameters: {
                        max_new_tokens: 200,
                        temperature: 0.7
                    }
                })
            }
        );

        const text = await hfResponse.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            return jsonResponse({ error: text }, 500);
        }

        let output = "No response";

        if (Array.isArray(data)) {
            output = data[0]?.generated_text || output;
        } else if (data.generated_text) {
            output = data.generated_text;
        } else if (data.error) {
            return jsonResponse({ error: data.error }, 500);
        }

        return jsonResponse({
            candidates: [
                {
                    content: {
                        parts: [{ text: output }]
                    }
                }
            ]
        }, 200);

    } catch (err) {
        return jsonResponse({ error: err.message }, 500);
    }
}
async function handleEmbed(request, apiKey) {
    const body = await request.json();

    // Validate structure
    if (!body.content || !body.content.parts) {
        return jsonResponse({ error: 'Invalid request: "content.parts" is required' }, 400);
    }

    // Forward to Gemini embedding API
    const geminiUrl = `${GEMINI_BASE}/${EMBED_MODEL}:embedContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: `models/${EMBED_MODEL}`,
            ...body
        }),
    });

    const data = await geminiResponse.json();

    if (!geminiResponse.ok) {
        return jsonResponse(
            { error: data?.error?.message || `Embedding API error: ${geminiResponse.status}` },
            geminiResponse.status
        );
    }

    return jsonResponse(data, 200);
}


// ═══════════════════════════════════════════════════════════════
// CORS + SECURITY HELPERS
// ═══════════════════════════════════════════════════════════════

function isAllowedOrigin(origin) {
    return true;
}

function handleCORS(request) {
    const origin = request.headers.get('Origin') || '';
    if (!isAllowedOrigin(origin)) {
        return new Response('Forbidden', { status: 403 });
    }

    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
            'Access-Control-Max-Age': '86400',
        }
    });
}

function corsResponse(response, origin) {
    const newHeaders = new Headers(response.headers);
    if (origin && isAllowedOrigin(origin)) {
        newHeaders.set('Access-Control-Allow-Origin', origin);
        newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        newHeaders.set('Access-Control-Allow-Headers', 'Content-Type');
    }
    return new Response(response.body, {
        status: response.status,
        headers: newHeaders
    });
}

function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}


// ═══════════════════════════════════════════════════════════════
// RATE LIMITING (simple in-memory, per-IP)
// ═══════════════════════════════════════════════════════════════

function isRateLimited(ip) {
    const now = Date.now();
    const record = rateLimitMap.get(ip);

    if (!record || now - record.windowStart > RATE_LIMIT_WINDOW) {
        // New window
        rateLimitMap.set(ip, { windowStart: now, count: 1 });
        return false;
    }

    record.count++;
    if (record.count > RATE_LIMIT_MAX) {
        return true;
    }

    return false;
}
