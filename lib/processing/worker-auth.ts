import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

export function isAuthorizedWorker(request: NextRequest | Request) {
  const expected = process.env.DOCUMENT_WORKER_TOKEN;
  if (!expected || expected.length < 32) return false;
  const supplied = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
