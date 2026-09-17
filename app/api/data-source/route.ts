import { NextResponse } from "next/server";
import { getSpreadsheetTabs, readTab } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SOURCES = {
  supplier: {
    id: process.env.SUPPLIER_SHEET_ID || "1XjBq3f-zM8QUkgLPlDccbz9c1Jy8L0JTJUOrZ0skfHA",
    label: "Supplier Evaluation Workbook",
  },
  routing: {
    id: process.env.ROUTING_SHEET_ID || "1h4OvmGWLzhUf2A9xk8uOmeVQgrKV1Xug42n9LH77Avw",
    label: "PRF & SRF Monitoring Workbook",
  },
} as const;

type SourceKey = keyof typeof SOURCES;
function validSource(value: string | null): value is SourceKey {
  return value === "supplier" || value === "routing";
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sourceParam = url.searchParams.get("source");
    if (!validSource(sourceParam)) return NextResponse.json({ ok: false, message: "source must be supplier or routing" }, { status: 400 });
    const source = SOURCES[sourceParam];
    const tab = url.searchParams.get("tab");
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 50), 5), 100);

    const tabs = await getSpreadsheetTabs(source.id);
    if (!tab) {
      return NextResponse.json({
        ok: true,
        source: { key: sourceParam, label: source.label, spreadsheetId: source.id },
        tabs: tabs.map((t) => ({ title: t.properties.title, sheetId: t.properties.sheetId })),
      });
    }

    if (!tabs.some((t) => t.properties.title === tab)) return NextResponse.json({ ok: false, message: `Sheet tab not found: ${tab}` }, { status: 404 });
    const result = await readTab(source.id, tab);
    const rows = result.rows.slice(0, limit);
    return NextResponse.json({
      ok: true,
      source: { key: sourceParam, label: source.label, spreadsheetId: source.id },
      tab: result.tab,
      headers: result.headers,
      rowCount: result.rows.length,
      previewCount: rows.length,
      rows,
      truncated: rows.length < result.rows.length,
      headerRow: result.headerRow,
    });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message || "Could not read spreadsheet data." }, { status: 500 });
  }
}
