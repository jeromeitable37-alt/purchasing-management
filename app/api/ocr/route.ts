import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { image, prompt } = await req.json();
    if (!image) return NextResponse.json({ ok: false, message: "Image is required." }, { status: 400 });
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({
      ok: false,
      message: "GEMINI_API_KEY is not configured. The scan file can still be attached, but automatic OCR is disabled until you add the key."
    }, { status: 503 });

    const base64 = String(image).split(",")[1] || String(image);
    const mimeType = String(image).match(/^data:([^;]+);/)?.[1] || "image/jpeg";
    const body = {
      contents: [{
        parts: [
          { text: prompt || "Read this purchasing document. Return strict JSON with prfNo, poNumber, vendorName, requester, department, items, documentDate, total and notes. Use empty strings when not visible." },
          { inline_data: { mime_type: mimeType, data: base64 } }
        ]
      }],
      generationConfig: { responseMimeType: "application/json" }
    };
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
    });
    const data = await res.json();
    if (!res.ok) return NextResponse.json({ ok: false, message: data?.error?.message || "OCR provider error" }, { status: 502 });
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return NextResponse.json({ ok: true, data: JSON.parse(text) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || "OCR failed" }, { status: 500 });
  }
}