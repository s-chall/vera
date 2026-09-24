import { NextResponse } from "next/server";
import { fetchPoolSnapshot } from "@/lib/fund/bitcoin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await fetchPoolSnapshot();
    return NextResponse.json(snapshot);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to watch Bitcoin pool" },
      { status: 503 },
    );
  }
}
