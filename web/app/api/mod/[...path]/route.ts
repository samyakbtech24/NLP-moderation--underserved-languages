import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.FAIRMOD_API_URL ?? "http://127.0.0.1:7860";

type Ctx = { params: Promise<{ path: string[] }> };

/** Pass-through proxy for the moderation console: /api/mod/* → FastAPI /mod/* */
async function proxy(req: NextRequest, { params }: Ctx) {
  const { path } = await params;
  const target = `${API_URL}/mod/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;
  const hasBody = req.method !== "GET" && req.method !== "DELETE";

  try {
    const res = await fetch(target, {
      method: req.method,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? await req.text() : undefined,
      cache: "no-store",
    });
    const contentType = res.headers.get("content-type") ?? "application/json";
    if (!contentType.includes("application/json")) {
      return new NextResponse(await res.arrayBuffer(), {
        status: res.status,
        headers: {
          "Content-Type": contentType,
          "Content-Disposition": res.headers.get("content-disposition") ?? "",
        },
      });
    }
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

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
