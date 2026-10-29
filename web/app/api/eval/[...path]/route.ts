import { makeProxy } from "@/lib/proxy";

/** Evaluation bench: /api/eval/* → FastAPI /eval/* */
const proxy = makeProxy("eval");

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
