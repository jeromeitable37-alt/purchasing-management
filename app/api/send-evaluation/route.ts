import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/admin";

function clean(v: unknown) { return String(v ?? "").trim(); }
function getFromAddress() {
  const raw = clean(process.env.EMAIL_FROM);
  if (!raw || /yourdomain\.com|example\.(com|org|net)/i.test(raw)) return "Purchasing Management System <onboarding@resend.dev>";
  return raw;
}
function isResendTestSender(from: string) { return /@resend\.dev[>\s]*$/i.test(from); }
function formatResendError(text: string) {
  if (/domain is not verified|from.*domain/i.test(text)) return "Email could not be sent because the sender domain is not verified in Resend. Verify your domain, or for local testing use EMAIL_FROM=Purchasing Management System <onboarding@resend.dev> and RESEND_TEST_RECIPIENT set to the permitted test inbox.";
  return text;
}

async function sendResend(apiKey: string, from: string, to: string, subject: string, html: string) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html }),
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const evaluationId = String(body.evaluationId || "");
    const email = String(body.email || "").trim().toLowerCase();
    if (!evaluationId || !email) return NextResponse.json({ ok: false, message: "Evaluation ID and email are required." }, { status: 400 });

    const snap = await adminDb.collection("evaluations").doc(evaluationId).get();
    if (!snap.exists) return NextResponse.json({ ok: false, message: "Evaluation not found." }, { status: 404 });
    const ev = snap.data() as any;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    if (!appUrl) return NextResponse.json({ ok: false, message: "NEXT_PUBLIC_APP_URL is not configured." }, { status: 500 });
    const link = `${appUrl.replace(/\/$/, "")}/evaluate/${encodeURIComponent(ev.token)}`;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: true, sent: false, link, message: "Email provider is not configured. The evaluation link was generated successfully." });

    const now = new Date().toISOString();
    let from = getFromAddress();
    let testMode = isResendTestSender(from);
    const configuredTestRecipient = clean(process.env.RESEND_TEST_RECIPIENT).toLowerCase();
    if (testMode && configuredTestRecipient && email !== configuredTestRecipient) {
      return NextResponse.json({ ok:false, sent:false, message:`Resend testing is limited to ${configuredTestRecipient}. Verify a sending domain to email other requisitioners.` }, { status:409 });
    }
    if (testMode && !configuredTestRecipient) {
      return NextResponse.json({ ok:false, sent:false, message:"Resend is in testing mode. Set RESEND_TEST_RECIPIENT to the same inbox permitted by your Resend account, or verify a sending domain and set EMAIL_FROM to that domain." }, { status:409 });
    }

    const subject = `Supplier Evaluation – ${ev.poNumber || ev.vendorName || "Purchase Order"}`;
    const html = `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden"><div style="padding:24px;background:linear-gradient(135deg,#0f5f52,#12856f);color:#fff"><div style="font-size:11px;font-weight:700;letter-spacing:1px;opacity:.85">PURCHASING MANAGEMENT SYSTEM</div><div style="font-size:24px;font-weight:800;margin-top:6px">Supplier Evaluation</div></div><div style="padding:28px"><p>Hello ${ev.evaluatorName || "Evaluator"},</p><p>Please complete the supplier evaluation for <b>${ev.vendorName || ev.supplier || "the supplier"}</b> related to PO <b>${ev.poNumber || ""}</b>.</p><p style="margin:24px 0"><a href="${link}" style="display:inline-block;background:#0f7b65;color:#fff;padding:12px 18px;border-radius:9px;text-decoration:none;font-weight:700">Open Evaluation</a></p><div style="font-size:12px;color:#6b7280">Secure evaluation link: ${link}</div></div></div>`;

    let r = await sendResend(apiKey, from, email, subject, html);
    if (!r.ok) {
      const txt = await r.text();
      // In local/testing mode, automatically fall back to Resend's test sender
      // when the configured domain is not verified and the destination is the
      // explicitly allowed test inbox. This makes local testing deterministic.
      if (/domain is not verified|from.*domain/i.test(txt) && configuredTestRecipient && email === configuredTestRecipient) {
        from = "Purchasing Management System <onboarding@resend.dev>";
        testMode = true;
        r = await sendResend(apiKey, from, email, subject, html);
      }
      if (!r.ok) return NextResponse.json({ ok: false, sent:false, message: formatResendError(await r.text().catch(() => txt)) }, { status: 502 });
    }

    await adminDb.collection("evaluations").doc(evaluationId).set({ evaluatorEmail: email, status: ev.status === "submitted" ? "submitted" : "sent", sentAt: now, lastEmailSentAt: now, emailProvider: "resend", emailTestMode: testMode, emailFrom: from, updatedAt: now, needsExport: true }, { merge: true });
    return NextResponse.json({ ok: true, sent: true, link, testMode });
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message || "Could not send evaluation." }, { status: 500 });
  }
}
