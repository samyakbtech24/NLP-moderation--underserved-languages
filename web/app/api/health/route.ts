import { NextResponse } from "next/server";

const API_URL = process.env.FAIRMOD_API_URL ?? "http://127.0.0.1:7860";

export async function GET() {
  try {
    const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
    const data = await res.json().catch(() => ({ detail: res.statusText }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        status: "down",
        error:
          "FairMod API is unreachable. Start the backend with `python app.py` on port 7860.",
      },
      { status: 503 },
    );
  }
}
