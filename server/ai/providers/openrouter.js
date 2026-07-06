import { fetchWithTimeout } from "../http.js";

export async function callOpenRouterJson({ apiKey, model, timeoutMs, systemPrompt, userPrompt, schema, schemaName }) {
  const data = await fetchWithTimeout(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": "http://127.0.0.1:5173",
        "X-Title": "AI Tutor Error Diagnosis Demo",
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 1200,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: schemaName,
            strict: true,
            schema,
          },
        },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    },
    timeoutMs
  );
  return data.choices?.[0]?.message?.content ?? "";
}
