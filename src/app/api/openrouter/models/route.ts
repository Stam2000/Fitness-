import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/session";

// La route lit la session (cookie) : elle ne peut plus être mise en cache au
// niveau de la page. Le catalogue OpenRouter reste, lui, mis en cache une
// heure par le `fetch` ci-dessous.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireApiUser();
  if (user instanceof NextResponse) return user;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      return NextResponse.json(
        { error: "OpenRouter indisponible" },
        { status: 502 }
      );
    }
    const json = await res.json();
    const models = (json.data ?? [])
      .map((m: { id: string; name?: string }) => ({
        id: m.id,
        name: m.name ?? m.id,
      }))
      .sort((a: { name: string }, b: { name: string }) =>
        a.name.localeCompare(b.name)
      );
    return NextResponse.json(models);
  } catch {
    return NextResponse.json(
      { error: "OpenRouter injoignable" },
      { status: 502 }
    );
  }
}
