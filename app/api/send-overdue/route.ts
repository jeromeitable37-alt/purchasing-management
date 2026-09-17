import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const emails = Array.isArray(body?.emails) ? body.emails.map((x: any) => String(x).trim()).filter(Boolean) : [];
    const orders = Array.isArray(body?.orders) ? body.orders : [];
    if (!emails.length) return NextResponse.json({ ok: false, message: "At least one recipient email is required." }, { status: 400 });
    if (!orders.length) return NextResponse.json({ ok: false, message: "No overdue purchase orders were supplied." }, { status: 400 });
    const apiKey = process.env.RESEND_API_KEY;
    const rawFrom = String(process.env.EMAIL_FROM || "").trim();
    const from = (!rawFrom || /yourdomain\.com|example\.(com|org|net)/i.test(rawFrom)) ? "Purchasing Management System <onboarding@resend.dev>" : rawFrom;
    if (/@resend\.dev[>\s]*$/i.test(from)) {
      const allowed = String(process.env.RESEND_TEST_RECIPIENT || "").trim().toLowerCase();
      const bad = emails.find((e:string)=>e.toLowerCase() !== allowed);
      if (!allowed || bad) return NextResponse.json({ok:false,sent:false,message:"Resend test sender is enabled. Verify your sending domain and set EMAIL_FROM before sending notifications to operational recipients."},{status:409});
    }
    if (!apiKey || !from) return NextResponse.json({ ok: false, sent: false, message: "RESEND_API_KEY and EMAIL_FROM must be configured." }, { status: 200 });
    const rows = orders.map((o: any) => `<tr><td style="padding:8px;border-bottom:1px solid #eee">${String(o.poNumber || "—")}</td><td style="padding:8px;border-bottom:1px solid #eee">${String(o.vendorName || "—")}</td><td style="padding:8px;border-bottom:1px solid #eee">${String(o.expectedDate || "—")}</td><td style="padding:8px;border-bottom:1px solid #eee">₱${Number(o.total || 0).toLocaleString()}</td></tr>`).join("");
    const html = `<div style="font-family:Arial,sans-serif;color:#111827"><h2>Overdue Purchase Order Notification</h2><p>The following purchase orders are past their expected delivery date and are not yet marked delivered/completed.</p><table style="border-collapse:collapse;width:100%"><thead><tr><th style="text-align:left;padding:8px;background:#f8fafc">PO</th><th style="text-align:left;padding:8px;background:#f8fafc">Supplier</th><th style="text-align:left;padding:8px;background:#f8fafc">Expected Delivery</th><th style="text-align:left;padding:8px;background:#f8fafc">Total</th></tr></thead><tbody>${rows}</tbody></table><p style="margin-top:18px;color:#6b7280;font-size:12px">Sent by Purchasing Management System.</p></div>`;
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: emails, subject: `Overdue Purchase Orders · ${orders.length} item(s)`, html }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return NextResponse.json({ ok: false, sent: false, message: data?.message || "Resend rejected the notification." }, { status: r.status });
    return NextResponse.json({ ok: true, sent: true, id: data?.id || null });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message || "Unable to send overdue notification." }, { status: 500 });
  }
}
