import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.FAIRMOD_API_URL ?? "http://127.0.0.1:7860";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  try {
    const res = await fetch(`${API_URL}/classify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ detail: res.statusText }));
    return NextResponse.json(data, { status: res.status });
  } catch {
    return NextResponse.json(
      {
        error:
          "FairMod API is unreachable. Start the backend with `python app.py` on port 7860.",
      },
      { status: 503 },
    );
  }
}
