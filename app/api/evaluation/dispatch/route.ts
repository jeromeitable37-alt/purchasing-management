import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/admin";
import crypto from "node:crypto";

function clean(v: unknown) { return String(v ?? "").trim(); }
function normalizeEmail(v: unknown) { return clean(v).toLowerCase(); }
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
    const email = normalizeEmail(body.email || body.requisitionerEmail);
    const poNumber = clean(body.poNumber);
    if (!email || !poNumber) return NextResponse.json({ ok: false, message: "PO number and evaluator email are required." }, { status: 400 });

    const existing = await adminDb.collection("evaluations")
      .where("poNumber", "==", poNumber)
      .where("evaluatorEmail", "==", email)
      .limit(1).get();

    const ref = existing.empty ? adminDb.collection("evaluations").doc() : existing.docs[0].ref;
    const current = existing.empty ? {} : existing.docs[0].data();
    const token = clean(current.token) || crypto.randomBytes(24).toString("hex");
    const now = new Date().toISOString();
    const evaluation = {
      id: ref.id, token, poNumber, prfNo: clean(body.prfNo), vendorName: clean(body.vendorName), supplier: clean(body.vendorName),
      evaluatorEmail: email, evaluatorName: clean(body.evaluatorName), evaluatorRole: clean(body.evaluatorRole || "requisitioner") || "requisitioner",
      deliveryDate: clean(body.actualDeliveryDate || body.deliveryDate), expectedDeliveryDate: clean(body.expectedDeliveryDate), actualDeliveryDate: clean(body.actualDeliveryDate),
      totalAmount: Number(body.totalAmount || 0), itemsDelivered: clean(body.itemsDelivered), status: ["submitted","completed","evaluated"].includes(String(current.status || "").toLowerCase()) ? current.status : "pending", createdAt: current.createdAt || now, updatedAt: now,
      autoEmail: true,
      needsExport: false,
    };
    await ref.set(evaluation, { merge: true });

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    if (!appUrl) return NextResponse.json({ ok: false, message: "NEXT_PUBLIC_APP_URL is not configured.", evaluationId: ref.id }, { status: 500 });
    const link = `${appUrl.replace(/\/$/, "")}/evaluate/${encodeURIComponent(token)}`;
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return NextResponse.json({ ok: true, sent: false, evaluationId: ref.id, link, message: "Evaluation created. Configure RESEND_API_KEY to send automatically." });

    let from = getFromAddress();
    const testRecipient = normalizeEmail(process.env.RESEND_TEST_RECIPIENT);
    if (isResendTestSender(from)) {
      if (!testRecipient || email !== testRecipient) return NextResponse.json({ ok:false, sent:false, evaluationId: ref.id, link, message:"Resend is in testing mode. Set RESEND_TEST_RECIPIENT to the permitted test inbox or verify a sending domain." }, { status:409 });
    }

    const subject = `Supplier Evaluation – ${poNumber}${body.vendorName ? ` · ${clean(body.vendorName)}` : ""}`;
    const html = `<!doctype html><html><body style="margin:0;background:#f4f7fb;font-family:Arial,sans-serif;color:#12203a"><div style="max-width:680px;margin:30px auto;background:#fff;border:1px solid #e3e8f0;border-radius:16px;overflow:hidden"><div style="padding:26px 30px;background:linear-gradient(135deg,#0f5f52,#12856f);color:#fff"><div style="font-size:11px;letter-spacing:1px;font-weight:700;opacity:.85">PURCHASING MANAGEMENT SYSTEM</div><h1 style="margin:8px 0 0;font-size:25px">Supplier Evaluation Request</h1></div><div style="padding:30px"><p style="font-size:15px">Hello ${clean(body.evaluatorName) || "Evaluator"},</p><p style="font-size:14px;line-height:1.65">Please complete the supplier evaluation for <b>${clean(body.vendorName) || "the supplier"}</b> related to Purchase Order <b>${poNumber}</b>.</p><div style="background:#f7f9fc;border:1px solid #e8edf4;border-radius:12px;padding:18px;margin:20px 0"><div style="font-size:11px;color:#738095;text-transform:uppercase;font-weight:700">Evaluation</div><div style="margin-top:6px;font-size:16px;font-weight:800">${clean(body.vendorName) || "Supplier"}</div><div style="margin-top:4px;font-size:13px;color:#617087">PO ${poNumber}${body.prfNo ? ` · PRF ${clean(body.prfNo)}` : ""}</div></div><a href="${link}" style="display:inline-block;background:#0f7b65;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:800">Open Supplier Evaluation</a><p style="font-size:12px;color:#7a8698;line-height:1.6;margin-top:22px">This link is unique to your evaluation. Please do not forward it.</p></div></div></body></html>`;

    let r = await sendResend(apiKey, from, email, subject, html);
    if (!r.ok) {
      const text = await r.text();
      if (/domain is not verified|from.*domain/i.test(text) && testRecipient && email === testRecipient) {
        from = "Purchasing Management System <onboarding@resend.dev>";
        r = await sendResend(apiKey, from, email, subject, html);
      }
      if (!r.ok) return NextResponse.json({ ok: false, sent: false, evaluationId: ref.id, link, message: formatResendError(await r.text().catch(() => text)) }, { status: 502 });
    }

    await ref.set({ status: "sent", sentAt: now, lastEmailSentAt: now, evaluatorEmail: email, emailProvider:"resend", emailFrom:from, emailTestMode:isResendTestSender(from), updatedAt: now, needsExport: true }, { merge: true });
    return NextResponse.json({ ok: true, sent: true, evaluationId: ref.id, link, testMode:isResendTestSender(from) });
  } catch (error: any) {
    return NextResponse.json({ ok: false, message: error?.message || "Unable to dispatch supplier evaluation." }, { status: 500 });
  }
}
