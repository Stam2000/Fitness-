import { NextRequest, NextResponse } from "next/server";
import { open, stat } from "fs/promises";
import path from "path";
import { mediaFilePath, TYPE_BY_EXT } from "@/lib/media-store";
import { requireApiUser } from "@/lib/session";

// Sert les médias rapatriés localement (images et vidéos de démonstration).
// Supporte les requêtes Range, indispensables à la lecture vidéo (Safari/iOS
// exige des réponses 206 pour <video>).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  const { file } = await params;
  const filePath = mediaFilePath(file);
  if (!filePath) {
    return NextResponse.json({ error: "Nom invalide" }, { status: 400 });
  }

  let size: number;
  try {
    size = (await stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: "Média introuvable" }, { status: 404 });
  }

  const type =
    TYPE_BY_EXT[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream";
  const baseHeaders = {
    "Content-Type": type,
    "Cache-Control": "public, max-age=31536000, immutable",
    "Accept-Ranges": "bytes",
  };

  const range = req.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  const start = range?.[1] ? parseInt(range[1], 10) : null;
  const end = range?.[2] ? parseInt(range[2], 10) : null;

  const handle = await open(filePath, "r");
  try {
    if (range && (start != null || end != null)) {
      // « bytes=a-b », « bytes=a- » ou « bytes=-n » (n derniers octets).
      const from = start ?? Math.max(0, size - (end ?? 0));
      const to = start != null && end != null ? Math.min(end, size - 1) : size - 1;
      if (from >= size || from > to) {
        return new NextResponse(null, {
          status: 416,
          headers: { ...baseHeaders, "Content-Range": `bytes */${size}` },
        });
      }
      const length = to - from + 1;
      const { buffer } = await handle.read(Buffer.alloc(length), 0, length, from);
      return new NextResponse(new Uint8Array(buffer), {
        status: 206,
        headers: {
          ...baseHeaders,
          "Content-Range": `bytes ${from}-${to}/${size}`,
          "Content-Length": String(length),
        },
      });
    }

    const { buffer } = await handle.read(Buffer.alloc(size), 0, size, 0);
    return new NextResponse(new Uint8Array(buffer), {
      headers: { ...baseHeaders, "Content-Length": String(size) },
    });
  } finally {
    await handle.close();
  }
}
