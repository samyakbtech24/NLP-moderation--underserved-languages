import { makeProxy } from "@/lib/proxy";

/** Moderation console: /api/mod/* → FastAPI /mod/* */
const proxy = makeProxy("mod");

export { proxy as GET, proxy as POST, proxy as PUT, proxy as DELETE };
