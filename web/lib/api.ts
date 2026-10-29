import type { BulkResponse, ClassifyResponse, HealthResponse } from "./types";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    if (typeof data?.detail === "string") return data.detail;
    if (typeof data?.error === "string") return data.error;
    return JSON.stringify(data);
  } catch {
    return res.statusText || "Request failed";
  }
}

export async function classifyText(text: string): Promise<ClassifyResponse> {
  const res = await fetch("/api/classify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return res.json();
}

export async function bulkRank(texts: string[]): Promise<BulkResponse> {
  const res = await fetch("/api/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ texts }),
  });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return res.json();
}

export async function checkHealth(): Promise<HealthResponse> {
  const res = await fetch("/api/health", { cache: "no-store" });
  if (!res.ok) throw new ApiError(await readError(res), res.status);
  return res.json();
}

export const EXAMPLES = [
  { lang: "Hindi", text: "आज मौसम बहुत अच्छा है" },
  { lang: "Kannada", text: "ನಮಸ್ಕಾರ, ಹೇಗಿದ್ದೀರಾ?" },
  { lang: "Marathi", text: "आज खूप छान दिवस आहे" },
  { lang: "Bengali", text: "আজ আবহাওয়া খুব ভালো" },
] as const;

export const MAX_CHARS = 5000;
export const MAX_CSV_ROWS = 2000;
