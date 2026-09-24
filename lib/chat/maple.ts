export type ChatTurn = { role: "system" | "user" | "assistant"; content: string };

export type MapleResult = {
  text: string;
  provider: "maple" | "ollama" | "openai-compatible" | "template";
  model: string;
};

function env(name: string, fallback = "") {
  return (process.env[name] || fallback).trim();
}

/**
 * Local / privacy-preserving completion.
 * Prefers Maple-compatible OpenAI chat endpoint, then Ollama, else grounded template.
 * Never sends traffic to OpenAI/Anthropic cloud by default.
 */
export async function completeLocally(messages: ChatTurn[], templateFallback: string): Promise<MapleResult> {
  const mapleBase = env("MAPLE_BASE_URL");
  const ollamaBase = env("OLLAMA_BASE_URL", "http://127.0.0.1:11434");
  const model = env("MAPLE_MODEL") || env("OLLAMA_MODEL") || "llama3.2";

  if (mapleBase) {
    const text = await tryOpenAiCompatible(`${mapleBase.replace(/\/$/, "")}/v1/chat/completions`, model, messages);
    if (text) return { text, provider: "maple", model };
  }

  const ollamaChat = await tryOpenAiCompatible(
    `${ollamaBase.replace(/\/$/, "")}/v1/chat/completions`,
    model,
    messages,
  );
  if (ollamaChat) return { text: ollamaChat, provider: "ollama", model };

  const ollamaNative = await tryOllamaGenerate(ollamaBase, model, messages);
  if (ollamaNative) return { text: ollamaNative, provider: "ollama", model };

  return {
    text: templateFallback,
    provider: "template",
    model: "grounded-template",
  };
}

async function tryOpenAiCompatible(url: string, model: string, messages: ChatTurn[]) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.MAPLE_API_KEY ? { authorization: `Bearer ${process.env.MAPLE_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        max_tokens: 500,
      }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  }
}

async function tryOllamaGenerate(base: string, model: string, messages: ChatTurn[]) {
  try {
    const prompt = messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n");
    const res = await fetch(`${base.replace(/\/$/, "")}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, prompt, stream: false }),
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { response?: string };
    return data.response?.trim() || null;
  } catch {
    return null;
  }
}
