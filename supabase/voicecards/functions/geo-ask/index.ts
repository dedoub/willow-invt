/**
 * GEO 측정용 Gemini 그라운딩 프록시.
 *
 * 배포처는 보이스카드 Supabase 프로젝트(juyitkynbavhllyjidhz)이고, 호출자는 윌로우
 * 대시보드의 주간 GEO 측정(src/lib/geo-runner.ts)이다. 여기 두는 이유는 하나뿐이다 —
 * 그 프로젝트의 GEMINI_API_KEY는 카드 생성에 쓰는 결제된 키인데, 대시보드가 들고 있던
 * 무료 티어 키는 그라운딩 일일 한도가 낮아 주간 한 회차도 못 채웠다. 키를 복사해 옮기는
 * 대신 호출만 빌린다. 키가 한 곳에만 있으니 교체·회수도 거기서 한 번이면 된다.
 *
 * 배포: mcp__supabase__deploy_edge_function (프로젝트에 supabase/ 디렉터리가 없어
 * CLI 배포 대상이 아니다). 이 파일은 형상 보관용 사본이다.
 *
 * verify_jwt: true — 대시보드가 service_role 키로 호출한다.
 */

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
const MODEL = 'gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  if (!GEMINI_API_KEY) return json({ error: 'config', message: 'GEMINI_API_KEY 없음' }, 500);

  let body: { question?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (!question || question.length > 500) return json({ error: 'invalid_request' }, 400);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: question }] }],
        tools: [{ google_search: {} }],
      }),
    },
  );

  if (!res.ok) {
    // 상태코드를 본문에 실어 넘긴다. 호출자가 429를 알아보고 재시도해야 한다.
    const text = await res.text();
    return json({ error: 'gemini_failed', status: res.status, message: text.slice(0, 300) }, 502);
  }

  const data = await res.json();
  const c = data?.candidates?.[0];
  const answer = (c?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text)
    .filter(Boolean)
    .join('\n');
  // grounding uri는 리다이렉트 래퍼라 호스트가 안 보인다. title에 실제 도메인이 온다.
  const sources: string[] = (c?.groundingMetadata?.groundingChunks ?? [])
    .map((x: { web?: { title?: string; uri?: string } }) => x.web?.title || x.web?.uri || '')
    .filter(Boolean);

  return json({ answer, sources });
});
