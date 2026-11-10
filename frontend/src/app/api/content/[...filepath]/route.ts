import { NextResponse } from "next/server";
import { fetchContent } from "@/lib/session/content-storage";

/* Serves chapter content (the slides PDF) from object storage through this app's own origin,
   so the storage key stays on the server and the browser needs no CORS access to the storage. */
export async function GET(_request: Request, { params }: { params: Promise<{ filepath: string[] }> }) {
  const { filepath } = await params;

  // Never leave the storage root.
  if (!filepath?.length || filepath.some((segment) => !segment || segment === "." || segment === ".." || segment.includes("\\"))) {
    return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
  }

  try {
    const response = await fetchContent(filepath.map(encodeURIComponent).join("/"));
    if (!response) {
      return NextResponse.json({ error: "Content storage is not configured" }, { status: 503 });
    }
    if (!response.ok) {
      return new NextResponse("File not found", { status: 404 });
    }

    return new NextResponse(response.body, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "application/octet-stream",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Content storage request failed:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
