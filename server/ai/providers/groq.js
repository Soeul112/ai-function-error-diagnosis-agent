import { fetchWithTimeout } from "../http.js";

export async function callGroqJson({ apiKey, model, timeoutMs, systemPrompt, userPrompt }) {
  const data = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.35,
        max_tokens: 1200,
        response_format: { type: "json_object" },
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
