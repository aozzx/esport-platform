import { NextRequest } from "next/server";

export function isValidOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  try {
    const originHost = new URL(origin).host;
    const requestHost = req.headers.get("host");
    return originHost === requestHost;
  } catch {
    return false;
  }
}
