import { NextResponse } from "next/server";
import { readCanvasPageRegistry } from "@/content/canvas/pages";

export async function GET() {
  const pages = await readCanvasPageRegistry();
  return NextResponse.json({ pages });
}
