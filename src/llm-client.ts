import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { LlmConfig } from "./config.js";

export interface LlmImage {
  mediaType: "image/jpeg" | "image/png";
  /** Base64 data without the data URL prefix */
  data: string;
}

export interface LlmPrompt {
  system?: string;
  user: string;
  images?: LlmImage[];
}

export interface LlmReply {
  text: string;
  /** Reasoning text if the provider returned any, otherwise empty */
  reasoning: string;
}

/**
 * Sends a single-turn prompt to the configured LLM provider.
 */
export async function callLlm(
  llmConfig: LlmConfig,
  prompt: LlmPrompt,
): Promise<LlmReply> {
  if (llmConfig.provider === "anthropic") {
    return callAnthropic(llmConfig, prompt);
  }
  return callOpenAI(llmConfig, prompt);
}

/**
 * Returns the HTTP status of an SDK error, if any.
 */
export function getLlmErrorStatus(err: unknown): number | undefined {
  const status = (err as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : undefined;
}

async function callOpenAI(
  llmConfig: LlmConfig,
  prompt: LlmPrompt,
): Promise<LlmReply> {
  const openai = new OpenAI({
    baseURL: llmConfig.baseUrl,
    apiKey: llmConfig.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const images = prompt.images ?? [];
  const userContent =
    images.length > 0
      ? [
          ...images.map((image) => ({
            type: "image_url" as const,
            image_url: { url: `data:${image.mediaType};base64,${image.data}` },
          })),
          { type: "text" as const, text: prompt.user },
        ]
      : prompt.user;

  const messages: OpenAI.ChatCompletionMessageParam[] = [];
  if (prompt.system) {
    messages.push({ role: "system", content: prompt.system });
  }
  messages.push({ role: "user", content: userContent });

  const completion = await openai.chat.completions.create({
    messages,
    model: llmConfig.model,
    thinking: { type: "enabled" },
    reasoning_effort: llmConfig.reasoningEffort,
    stream: false,
  } as any);

  const message = completion.choices[0]?.message;
  return {
    text: message?.content || "",
    // Non-standard field used by DeepSeek-style providers
    reasoning: (message as { reasoning_content?: string } | undefined)
      ?.reasoning_content || "",
  };
}

async function callAnthropic(
  llmConfig: LlmConfig,
  prompt: LlmPrompt,
): Promise<LlmReply> {
  const anthropic = new Anthropic({
    // The SDK appends "/v1/messages" itself, so drop a trailing "/v1" if present
    baseURL: llmConfig.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, ""),
    apiKey: llmConfig.apiKey,
    dangerouslyAllowBrowser: true,
  });

  const content: Anthropic.ContentBlockParam[] = [
    // Images go before the text, as recommended for vision prompts
    ...(prompt.images ?? []).map(
      (image): Anthropic.ImageBlockParam => ({
        type: "image",
        source: { type: "base64", media_type: image.mediaType, data: image.data },
      }),
    ),
    { type: "text", text: prompt.user },
  ];

  // Stream to avoid HTTP timeouts on long thinking, then collect the final message
  const message = await anthropic.messages
    .stream({
      model: llmConfig.model,
      max_tokens: 16000,
      ...(prompt.system ? { system: prompt.system } : {}),
      messages: [{ role: "user", content }],
      thinking: { type: "adaptive" },
      output_config: {
        effort: llmConfig.reasoningEffort as Anthropic.OutputConfig["effort"],
      },
    })
    .finalMessage();

  if (message.stop_reason === "refusal") {
    throw new Error(
      `Request refused by the model (${message.stop_details?.category ?? "unknown"})`,
    );
  }

  let text = "";
  let reasoning = "";
  for (const block of message.content) {
    if (block.type === "text") {
      text += block.text;
    } else if (block.type === "thinking") {
      reasoning += block.thinking;
    }
  }
  return { text, reasoning };
}
