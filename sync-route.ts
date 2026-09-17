import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { adminDb } from "@/lib/admin";
import { ensureSheetTab, getSpreadsheetTabs, readTab, readTabSmart, replaceOrUpsertFlatTab } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SUPPLIER_SHEET_ID = process.env.SUPPLIER_SHEET_ID || "1XjBq3f-zM8QUkgLPlDccbz9c1Jy8L0JTJUOrZ0skfHA";
const SUPPLIER_EVAL_TAB = process.env.SUPPLIER_PO_SHEET || "PO for Evaluation";
const SUPPLIER_DATABASE_TAB = process.env.SUPPLIER_DATABASE_SHEET || "DATABASE";
const SUPPLIER_PRF_TAB = process.env.SUPPLIER_PRF_SHEET || "PRF Details v2";
const ROUTING_SHEET_ID = process.env.ROUTING_SHEET_ID || "1h4OvmGWLzhUf2A9xk8uOmeVQgrKV1Xug42n9LH77Avw";
const ROUTING_SOURCE_SHEET_ID = process.env.ROUTING_SOURCE_SHEET_ID || ROUTING_SHEET_ID;
const ROUTETRACK_TAB = process.env.ROUTETRACK_SHEET_NAME || "RouteTrack";

const nowIso = () => new Date().toISOString();

function sourceMetaId(source: string) {
  return `sync-${crypto.createHash("sha1").update(source).digest("hex").slice(0, 32)}`;
}

async function getSyncMeta(source: string) {
  const snap = await adminDb.collection("syncMeta").doc(sourceMetaId(source)).get();
  return snap.exists ? (snap.data() as any) : null;
}

async function saveSyncMeta(source: string, data: Record<string, unknown>) {
  await adminDb.collection("syncMeta").doc(sourceMetaId(source)).set({ source, ...data, updatedAt: nowIso() }, { merge: true });
}

function hashRows(rows: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}
function lowerKey(value: unknown) { return String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function pick(row: Record<string, string>, names: string[]) {
  const entries = Object.entries(row);
  for (const name of names) {
    const target = lowerKey(name);
    const found = entries.find(([key]) => lowerKey(key) === target);
    if (found && String(found[1] ?? "").trim() !== "") return String(found[1]).trim();
  }
  return "";
}
function rowHash(row: Record<string, string>) {
  const normalized = Object.keys(row).filter(k => !k.startsWith("__")).sort().reduce<Record<string,string>>((acc, k) => { acc[k] = String(row[k] ?? ""); return acc; }, {});
  return crypto.createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}
function stableId(prefix: string, value: string) { return `${prefix}-${crypto.createHash("sha1").update(value.trim().toLowerCase()).digest("hex").slice(0, 28)}`; }
function num(value: string) { const n = Number(String(value ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; }
function excelOrDate(value: string) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (n > 20000 && n < 70000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString();
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}
function dateValue(value: string) {
  const normalized = excelOrDate(value);
  const d = new Date(normalized);
  return Number.isNaN(d.getTime()) ? 0 : d.getTime();
}

function completedEvalStatus(row: Record<string,string>, current: any) {
  const raw = pick(row, ["Status", "Evaluation Status", "EvaluationStatus"]).toLowerCase();
  const score = num(pick(row, ["Overall Score", "OverallScore", "Average Score", "FINAL RATING"]));
  const submittedAt = pick(row, ["Submitted At", "Date Evaluated", "Evaluated At", "Evaluation Date"]);
  const currentDone = ["submitted","completed","evaluated","done","complete"].includes(String(current?.status || "").toLowerCase()) || !!current?.submittedAt || num(String(current?.overallScore || "")) > 0;
  if (currentDone || ["submitted","completed","evaluated","done","complete"].includes(raw) || submittedAt || score > 0) return "submitted";
  if (["opened","viewed"].includes(raw)) return "opened";
  if (["sent","emailed","email sent"].includes(raw)) return "sent";
  if (["overdue","past due"].includes(raw)) return "overdue";
  return current?.status || "pending";
}

function evaluationFromDatabaseRow(row: string[], sourceSheet: string, sourceRow: number, current: any = {}) {
  const prf = String(row[0] ?? "").trim();
  const po = String(row[1] ?? "").trim();
  const items = String(row[2] ?? "").trim();
  const date = String(row[3] ?? "").trim();
  const vendor = String(row[4] ?? "").trim();
  const address = String(row[5] ?? "").trim();
  const remarks = String(row[6] ?? "").trim();
  const overall = num(row[28] ?? "");
  if (!po && !prf && !vendor) return [];
  const groups: Array<["purchaser"|"requisitioner"|"amd", string, number[]]> = [
    ["purchaser", "PURCHASING", [7,8,9,10,11]],
    ["requisitioner", "REQUISITIONER", [13,14,15,16]],
    ["amd", "AMD", [18,19,20,21]],
  ];
  return groups.flatMap(([role, label, idxs]) => {
    const scores = idxs.map(i => num(row[i] ?? ""));
    if (!scores.some(v => v > 0) && !overall && !date) return [];
    const rawAverage = role === "purchaser" ? num(row[12] ?? "") : role === "requisitioner" ? num(row[17] ?? "") : num(row[22] ?? "");
    const roleScore = rawAverage || (scores.some(v => v > 0) ? scores.filter(Boolean).reduce((a,b) => a + b, 0) / scores.filter(Boolean).length : overall);
    const id = stableId("legacy-eval", `${sourceSheet}|${sourceRow}|${role}`);
    return [{
      id,
      token: current?.token || crypto.randomBytes(24).toString("hex"),
      poNumber: po,
      prfNo: prf,
      vendorName: vendor,
      supplier: vendor,
      evaluatorName: current?.evaluatorName || "",
      evaluatorEmail: current?.evaluatorEmail || "",
      evaluatorRole: role,
      accurateDelivery: scores[0] || 0,
      competitivePrice: scores[1] || 0,
      timeliness: scores[2] || 0,
      afterSales: scores[3] || 0,
      compliance: scores[4] || 0,
      comments: remarks,
      overallScore: roleScore,
      legacyFinalRating: overall,
      legacyAverage: rawAverage,
      legacyRecommendation: String(row[29] ?? ""),
      itemsDelivered: items,
      evaluationDate: excelOrDate(date),
      address,
      submittedAt: excelOrDate(date),
      status: (overall > 0 || roleScore > 0 || date) ? "submitted" : completedEvalStatus({}, current),
      source: `supplier evaluation spreadsheet · ${sourceSheet}`,
      sourceSheet,
      sourceRow,
      sourceHash: crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex"),
      updatedAt: nowIso(),
      importedAt: current?.importedAt || nowIso(),
      lastExportAt: current?.lastExportAt || nowIso(),
      historical: true,
    }];
  });
}

function routeStatusLabel(raw: string, fallback: string) {
  const s = raw.trim();
  if (!s) return fallback;
  const l = s.toLowerCase();
  if (l.includes("deliver") || l.includes("complete")) return "Completed";
  if (l.includes("return")) return "Returned";
  if (l.includes("cancel")) return "Cancelled";
  if (l.includes("approval")) return "For Approval";
  if (l.includes("account")) return "Forwarded to Accounting";
  if (l.includes("process") || l.includes("canvass")) return "In Process";
  if (l.includes("pending")) return "Pending";
  return s;
}

function routeHistoryFromRow(row: Record<string,string>, isSrf: boolean) {
  const existing = pick(row, ["History JSON", "Route History", "History"]);
  if (existing) { try { const parsed = JSON.parse(existing); if (Array.isArray(parsed)) return parsed; } catch {} }
  const events: any[] = [];
  const add = (action: string, value: string, extra: Record<string,any> = {}) => {
    if (!value) return;
    events.push({ timestamp: excelOrDate(value), action, ...extra });
  };
  if (isSrf) {
    add("SRF filed", pick(row, ["DATE FILED"]));
    add("SRF received by AMD", pick(row, ["DATE RECEIVED BY AMD WITH COMPLETE SPECS AND ATTACHMENT", "DATE RECEIVED BY AMD WITH COMPLETE DETAILS", "DATE RECEIVED BY AMD"]));
    add("SRF encoded / received", pick(row, ["DATE RECEIVED", "Date Received"]));
    add("Canvassing / processing", pick(row, ["CANVASSED DATE", "CANVASSED DATE", "DATE RETURNED"]));
    add("Approval tracking", pick(row, ["APPROVAL TRACKING DATE", "DATE FULLY APPROVED", "FULLY APPROVED DATE RECEIVED"]));
    add("Received by Audit", pick(row, ["DATE RECEIVED BY AUDIT", "RECEIVED DATE"]));
    add("Released by Audit", pick(row, ["DATE RELEASED BY AUDIT", "RELEASED DATE", "RELEASE DATE"]));
    add("SRF completed / endorsed", pick(row, ["DATE OF COMPLETION/ ENDORSED TO AMD AND PURCH", "DATE OF COMPLETION", "DATE OF COMPLETION/ ENDORSED TO AMD"]), { status: "Completed" });
  } else {
    add("PRF filed", pick(row, ["DATE FILED"]));
    add("PRF received by AMD", pick(row, ["DATE RECEIVED BY AMD", "DATE FILED/ FORWARDED TO AMD & PURCHASING"]), { to: "AMD" });
    add("Date received by Purchasing", pick(row, ["Date Received", "DATE RECEIVED"]), { to: "Purchasing" });
    add("Canvassing started", pick(row, ["DATE START PROCESSING/ CANVASSING"]));
    add("Canvassing completed", pick(row, ["DATE END CANVASSED", "DATE PROCESSED/CANVASSED", "DATE RETURNED"]));
    add("Fully approved PRF received", pick(row, ["DATE RECEIVED OF FULLY APPROVED PRF"]));
    add("PO created", pick(row, ["DATE OF PO"]), { status: routeStatusLabel(pick(row,["STATUS IN PURCHASING"]), "PO Created") });
    add("PO forwarded to AMD / Accounting", pick(row, ["DATE OF PO FORWARDED TO AMD AND ACCTNG"]), { to: "AMD / Accounting" });
    add("Delivery date", pick(row, ["Delivery Date", "PO DELIVERY DATE"]));
    add("Actual delivery", pick(row, ["ACTUAL DELIVERY DATE"]), { status: "Completed", to: "Requisitioner", currentHolder: pick(row,["DELIVERY RECEIVED BY"]) });
    add("Forwarded to Accounting", pick(row, ["DATE forwarded to Accounting", "Date Forwarded to Accounting"]), { to: "Accounting", currentHolder: "Accounting" });
    add("Received by Requisitioner", pick(row, ["DATE RECEIVED BY REQUISITIONER", "Date Received by Requisitioner"]), { status: "Completed", to: pick(row, ["REQUISITIONER"]) || "Requisitioner", currentHolder: pick(row, ["REQUISITIONER"]) || "Requisitioner" });
  }
  return events.sort((a,b) => dateValue(String(a.timestamp)) - dateValue(String(b.timestamp)));
}

function textLooksLike(text: string, words: string[]) {
  const value = String(text || "").toLowerCase();
  return words.some(w => value.includes(w.toLowerCase()));
}

function genericRouteState(row: Record<string,string>, isSrf: boolean) {
  const requester = pick(row, ["REQUISITIONER", "REQUESTER", "REQUESTED BY"]);
  const purchaser = pick(row, ["PURCHASER ASSIGNED", "PURCHASER ASSIGNED", "CANVASSED BY", "PURCHASING"]);
  const poNumber = pick(row, ["PO NUMBER", "PO NO.", "PO"]);
  const remarks = Object.values(row).filter(Boolean).join(" | ");
  const statusRaw = pick(row, ["STATUS IN PURCHASING", "STATUS", "PRF Status", "SRF Status"]);
  const auditDate = pick(row, ["DATE RECEIVED BY AUDIT", "DATE RELEASED BY AUDIT", "AUDIT"]);
  const treasury = pick(row, ["TREASURY'S REMARKS", "TREASURY REMARKS", "TREASURY"]);
  const adminApproval = pick(row, ["VP - ADMIN", "VP FOR ADMIN", "ADMIN DEPT.", "ADMIN"]);
  const finance = pick(row, ["FINANCE DEPT.", "FINANCE", "DATE FORWARDED TO ACCOUNTING", "DATE FORWARDED TO ACCOUNTING"]);
  const delivered = pick(row, ["ACTUAL DELIVERY DATE", "DATE OF COMPLETION/ ENDORSED TO AMD AND PURCH", "DATE OF COMPLETION"]);
  const received = pick(row, ["DATE RECEIVED", "DATE RECEIVED BY AMD", "DATE RECEIVED BY AMD WITH COMPLETE SPECS AND ATTACHMENT", "DATE RECEIVED BY AMD WITH COMPLETE DETAILS"]);
  const returned = pick(row, ["DATE RETURNED", "DATE END CANVASSED", "CANVASSED DATE"]);
  const filed = pick(row, ["DATE FILED", "DATE FILED/ FORWARDED TO AMD & PURCHASING"]);
  if (delivered) return { from: "Purchasing / AMD", to: requester || "Requisitioner", currentHolder: requester || "Requisitioner", status: "Completed" };
  if (auditDate || textLooksLike(remarks, ["forward to audit", "received by audit", "for audit"])) return { from: "Purchasing", to: "Audit", currentHolder: "Audit", status: "For Audit" };
  if (finance || textLooksLike(remarks, ["accounting", "forwarded to accounting", "for accounting"])) return { from: "Purchasing", to: "Accounting", currentHolder: "Accounting", status: "Forwarded to Accounting" };
  if (treasury || textLooksLike(remarks, ["treasury", "for treasury"])) return { from: "Purchasing", to: "Treasury", currentHolder: "Treasury", status: "For Treasury" };
  if (adminApproval || textLooksLike(remarks, ["for approval", "approved by", "approval"])) return { from: "AMD / Purchasing", to: "Approver / Admin", currentHolder: "Approver / Admin", status: "For Approval" };
  if (poNumber) return { from: "AMD / Approvals", to: "Purchasing", currentHolder: purchaser || "Purchasing", status: routeStatusLabel(statusRaw, "PO Created") };
  if (returned) return { from: "Purchasing", to: isSrf ? "AMD / Approver" : "AMD", currentHolder: purchaser || "Purchasing", status: routeStatusLabel(statusRaw, "In Process") };
  if (received) return { from: requester || "Requisitioner", to: "AMD / Purchasing", currentHolder: purchaser || "AMD / Purchasing", status: routeStatusLabel(statusRaw, "For Processing") };
  if (filed) return { from: requester || "Requisitioner", to: "AMD / Purchasing", currentHolder: "AMD / Purchasing", status: routeStatusLabel(statusRaw, "For Routing") };
  return { from: requester || "Requisitioner", to: "AMD / Purchasing", currentHolder: "AMD / Purchasing", status: routeStatusLabel(statusRaw, "For Routing") };
}

function latestStage(row: Record<string,string>, stages: Array<{ label:string; names:string[]; from:string; to:string; holder:string; status:string }>, fallback:{from:string;to:string;holder:string;status:string}) {
  const populated = stages
    .map((stage, order) => ({ stage, order, value: pick(row, stage.names) }))
    .filter(x => x.value)
    .sort((a,b) => {
      const da = dateValue(a.value), db = dateValue(b.value);
      if (da !== db) return db - da;
      return b.order - a.order;
    });
  return populated.length ? populated[0].stage : fallback;
}

function routeState(row: Record<string,string>, isSrf: boolean) {
  const statusRaw = pick(row, ["STATUS IN PURCHASING", "PRF Status", "SRF Status", "Status"]);
  const requester = pick(row, ["REQUISITIONER", "Requester", "REQUESTED BY"]);
  const purchaser = pick(row, ["Purchaser Assigned", "PURCHASER ASSIGNED", "CANVASSED BY", "PURCHASING"]);
  const receiver = pick(row, ["DELIVERY RECEIVED BY", "RECEIVED BY"]);

  if (isSrf) {
    const result = latestStage(row, [
      {label:"completed", names:["DATE OF COMPLETION/ ENDORSED TO AMD AND PURCH","DATE OF COMPLETION"], from:"Purchasing / AMD", to:requester || "Requisitioner", holder:requester || "Requisitioner", status:"Completed"},
      {label:"released", names:["DATE RELEASED BY AUDIT","RELEASED DATE","RELEASE DATE"], from:"Audit", to:"AMD / Purchasing", holder:"AMD / Purchasing", status:"Released by Audit"},
      {label:"audit", names:["DATE RECEIVED BY AUDIT","AUDIT DATE","RECEIVED BY AUDIT"], from:"Purchasing", to:"Audit", holder:"Audit", status:"For Audit"},
      {label:"approval", names:["APPROVAL TRACKING DATE","DATE FULLY APPROVED","FULLY APPROVED DATE RECEIVED"], from:"AMD", to:"Approver / Purchasing", holder:"Approver / Purchasing", status:routeStatusLabel(statusRaw,"For Approval")},
      {label:"returned", names:["DATE RETURNED","CANVASSED DATE","DATE RETURNED TO PURCHASING"], from:"Purchasing", to:"AMD / Approver", holder:purchaser || "Purchasing", status:routeStatusLabel(statusRaw,"In Process")},
      {label:"received", names:["DATE RECEIVED BY AMD WITH COMPLETE SPECS AND ATTACHMENT","DATE RECEIVED BY AMD WITH COMPLETE DETAILS","DATE RECEIVED BY AMD","DATE RECEIVED"], from:requester || "Requisitioner", to:"AMD / Purchasing", holder:purchaser || "AMD / Purchasing", status:routeStatusLabel(statusRaw,"For Processing")},
      {label:"filed", names:["DATE FILED"], from:requester || "Requisitioner", to:"AMD", holder:"AMD", status:routeStatusLabel(statusRaw,"For Routing")},
    ], {from:requester || "Requisitioner",to:"AMD",holder:"AMD",status:routeStatusLabel(statusRaw,"For Routing")});
    return result;
  }

  const result = latestStage(row, [
    {label:"received_by_requisitioner", names:["DATE RECEIVED BY REQUISITIONER", "Date Received by Requisitioner"], from:"Purchasing / Accounting", to:requester || "Requisitioner", holder:requester || "Requisitioner", status:"Completed"},
    {label:"actual_delivery", names:["ACTUAL DELIVERY DATE"], from:"Purchasing", to:receiver || requester || "Requisitioner", holder:receiver || requester || "Requisitioner", status:"Completed"},
    {label:"accounting", names:["DATE forwarded to Accounting","DATE FORWARDED TO ACCOUNTING","Date Forwarded to Accounting"], from:"AMD / Purchasing", to:"Accounting", holder:"Accounting", status:"Forwarded to Accounting"},
    {label:"po_forwarded", names:["DATE OF PO FORWARDED TO AMD AND ACCTNG"], from:"Purchasing", to:"AMD / Accounting", holder:"AMD / Accounting", status:routeStatusLabel(statusRaw,"Forwarded")},
    {label:"po_created", names:["DATE OF PO","PO DATE"], from:"AMD / Approvals", to:"Purchasing", holder:purchaser || "Purchasing", status:routeStatusLabel(statusRaw,"PO Created")},
    {label:"fully_approved", names:["DATE RECEIVED OF FULLY APPROVED PRF","DATE FULLY APPROVED","FULLY APPROVED DATE RECEIVED"], from:"Audit / Approvals", to:"Purchasing", holder:"Purchasing", status:routeStatusLabel(statusRaw,"Fully Approved")},
    {label:"canvassed_end", names:["DATE END CANVASSED","DATE PROCESSED/CANVASSED","DATE RETURNED","CANVASSED DATE"], from:"Purchasing", to:"AMD / Approver", holder:purchaser || "Purchasing", status:routeStatusLabel(statusRaw,"In Process")},
    {label:"canvassed_start", names:["DATE START PROCESSING/ CANVASSING","DATE START CANVASSING"], from:"Purchasing", to:"Purchasing", holder:purchaser || "Purchasing", status:routeStatusLabel(statusRaw,"In Process")},
    {label:"received_purchasing", names:["Date Received","DATE RECEIVED"], from:"AMD", to:"Purchasing", holder:purchaser || "Purchasing", status:routeStatusLabel(statusRaw,"For Processing")},
    {label:"received_amd", names:["DATE RECEIVED BY AMD (based on the date SUMBITTED TO AMD WITH COMPLETE SPECS)","DATE RECEIVED BY AMD","DATE FILED/ FORWARDED TO AMD & PURCHASING","DATE FILED/ FORWARDED TO AMD AND PURCHASING"], from:requester || "Requisitioner", to:"AMD", holder:"AMD", status:routeStatusLabel(statusRaw,"For Routing")},
    {label:"filed", names:["DATE FILED"], from:requester || "Requisitioner", to:"AMD", holder:"AMD", status:routeStatusLabel(statusRaw,"For Routing")},
  ], {from:requester || "Requisitioner",to:"AMD / Purchasing",holder:"AMD / Purchasing",status:routeStatusLabel(statusRaw,"For Routing")});
  return result;
}

function routeFromRow(row: Record<string,string>, tab: string) {
  const prfNo = pick(row, ["PRF NO.", "PRF No", "PRF"]);
  const srfNo = pick(row, ["SRF NO.", "SRF No", "SRF"]);
  const poNumber = pick(row, ["PO NUMBER", "PO Number", "PO No.", "PO"]);
  const referenceNo = prfNo || srfNo || poNumber;
  if (!referenceNo) return null;
  const isSrf = !!srfNo || /(^|[^a-z])srf([^a-z]|$)/i.test(tab);
  const state = routeState(row, isSrf);
  const trackingId = `RT-${referenceNo.replace(/\s+/g, "-")}`;
  const sourceKey = `${tab}|${referenceNo}`;
  return {
    id: stableId("route", sourceKey),
    trackingId,
    documentType: isSrf ? "SRF" : "PRF",
    referenceNo,
    prfNo,
    srfNo,
    poNumber,
    documentTitle: pick(row, ["ITEM DESCRIPTION", "Item Description", "SCOPE OF WORK"]),
    requester: pick(row, ["REQUISITIONER", "Requester"]),
    department: pick(row, ["DEPARTMENT", "Department"]),
    from: state.from,
    to: state.to,
    currentHolder: state.holder,
    status: state.status,
    dateRouted: pick(row, ["DATE FILED", "DATE RECEIVED BY AMD", "DATE RECEIVED BY AMD WITH COMPLETE SPECS AND ATTACHMENT", "DATE RECEIVED BY AMD WITH COMPLETE DETAILS"]),
    dateReceived: pick(row, ["DATE RECEIVED", "Date Received", "DATE RECEIVED OF FULLY APPROVED PRF", "FULLY APPROVED DATE RECEIVED"]),
    receivedBy: pick(row, ["DELIVERY RECEIVED BY", "RECEIVED BY AUDIT"]),
    dateReturned: pick(row, ["DATE RETURNED"]),
    remarks: pick(row, ["REMARKS", "AMD REMARKS", "AUDIT REMARKS", "TREASURY'S REMARKS", "NO MOVEMENT?", "Remarks"]),
    history: routeHistoryFromRow(row, isSrf),
    source: `V2 monitoring workbook · ${tab}`,
    sourceSheet: tab,
    sourceRow: Number(row.__rowNumber || 0),
    sourceHeaderRow: Number(row.__headerRow || 1),
  };
}

async function writeBatch<T>(collection: string, writes: Array<{ id: string; data: T }>) {
  for (let i = 0; i < writes.length; i += 400) {
    const batch = adminDb.batch();
    for (const item of writes.slice(i, i + 400)) batch.set(adminDb.collection(collection).doc(item.id), item.data as any, { merge: true });
    await batch.commit();
  }
}

async function importHistoricalEvaluations() {
  const tab = await readTabSmart(SUPPLIER_SHEET_ID, SUPPLIER_DATABASE_TAB, ["PRF No", "PO Number", "Evaluation Date", "Supplier"]);
  const fingerprint = hashRows({ headers: tab.headers, rows: tab.rawRows });
  const source = `sheet:${SUPPLIER_SHEET_ID}:${tab.tab}:historical-evaluations`;
  const meta = await getSyncMeta(source);
  if (meta?.fingerprint === fingerprint && meta?.completed) return { changed: 0, skipped: 0, total: tab.rawRows.length, unchanged: true };

  const existingSnap = await adminDb.collection("evaluations").get();
  const existingMap = new Map<string, any>();
  existingSnap.docs.forEach((d:any)=>existingMap.set(d.id, d.data()));
  const writes: Array<{id:string;data:any}> = [];
  let changed = 0, skipped = 0;
  for (let i = 0; i < tab.rawRows.length; i++) {
    const row = tab.rawRows[i] || [];
    const docs = evaluationFromDatabaseRow(row, tab.tab, tab.headerRow + i + 1);
    for (const data of docs) {
      const current = existingMap.get(data.id) || {};
      const sourceHash = crypto.createHash("sha256").update(JSON.stringify(row)).digest("hex");
      if (current?.sourceHash === sourceHash && current?.sourceSheet === tab.tab && String(current?.status).toLowerCase() === "submitted") { skipped++; continue; }
      const preservedStatus = completedEvalStatus({
        "Status": data.status || "",
        "Evaluation Date": data.submittedAt || "",
        "Overall Score": String(data.overallScore || "")
      }, current);
      writes.push({ id: data.id, data: { ...data, token: current?.token || data.token, evaluatorEmail: current?.evaluatorEmail || data.evaluatorEmail || "", evaluatorName: current?.evaluatorName || data.evaluatorName || "", status: preservedStatus, submittedAt: current?.submittedAt || data.submittedAt, updatedAt: nowIso(), sourceHash, needsExport: false } });
      changed++;
    }
  }
  await writeBatch("evaluations", writes);
  await saveSyncMeta(source, { fingerprint, completed: true, rows: tab.rawRows.length });
  return { changed, skipped, total: tab.rawRows.length, unchanged: false };
}

async function importEvaluationQueue() {
  const tab = await readTabSmart(SUPPLIER_SHEET_ID, SUPPLIER_EVAL_TAB, ["PO Number", "PRF Number", "Supplier", "Email Address"]);
  const fingerprint = hashRows({ headers: tab.headers, rows: tab.rows });
  const source = `sheet:${SUPPLIER_SHEET_ID}:${tab.tab}:evaluation-queue`;
  const meta = await getSyncMeta(source);
  if (meta?.fingerprint === fingerprint && meta?.completed) return { changed: 0, skipped: 0, total: tab.rows.length, unchanged: true };

  const existingSnap = await adminDb.collection("evaluations").get();
  const existing = existingSnap.docs.map((d:any) => ({ id:d.id, data:d.data() as any }));
  const completedKeys = new Set<string>();
  for (const item of existing) {
    const d = item.data;
    if (Number(d.overallScore || 0) > 0 || ["submitted","completed","evaluated"].includes(String(d.status || "").toLowerCase()) || d.submittedAt) {
      completedKeys.add(`${String(d.poNumber||"").trim().toLowerCase()}|${String(d.prfNo||"").trim().toLowerCase()}|${String(d.vendorName||d.supplier||"").trim().toLowerCase()}`);
    }
  }
  const writes: Array<{id:string;data:any}> = [];
  let changed = 0, skipped = 0;
  for (const row of tab.rows) {
    const poNumber = pick(row, ["PO Number", "PO No.", "P.O.", "PO"]);
    const prfNo = pick(row, ["PRF Number", "PRF No.", "PRF No", "PRF"]);
    const email = pick(row, ["Email Address", "Evaluator Email", "Email", "Requisitioner Email"]);
    const vendorName = pick(row, ["Supplier", "Vendor", "Vendor Name", "Supplier Name", "Company Name"]);
    if (!poNumber && !prfNo && !vendorName) continue;
    const keyBase = `${String(poNumber||"").trim().toLowerCase()}|${String(prfNo||"").trim().toLowerCase()}|${String(vendorName||"").trim().toLowerCase()}`;
    const id = stableId("queue-eval", `${poNumber}|${prfNo}|${vendorName}|${email}`);
    const existingDoc = existing.find((x:any) => x.id === id)?.data || {};
    const sourceHash = rowHash(row);
    if (completedKeys.has(keyBase)) {
      for (const match of existing) {
        const d=match.data;
        const k=`${String(d.poNumber||"").trim().toLowerCase()}|${String(d.prfNo||"").trim().toLowerCase()}|${String(d.vendorName||d.supplier||"").trim().toLowerCase()}`;
        if (k===keyBase && !["submitted","completed","evaluated"].includes(String(d.status||"").toLowerCase())) {
          writes.push({ id:match.id, data:{ status:"submitted", updatedAt:nowIso(), reconciledFromHistorical:true, needsExport:false } });
        }
      }
      skipped++;
      continue;
    }
    if (existingDoc?.sourceHash === sourceHash && existingDoc?.sourceSheet === tab.tab) { skipped++; continue; }
    const emailed = pick(row, ["Email Sent", "Date Emailed"]);
    const status = emailed ? "sent" : (existingDoc?.status || "pending");
    writes.push({ id, data: {
      id, token: existingDoc?.token || crypto.randomBytes(24).toString("hex"), poNumber, prfNo, vendorName, supplier: vendorName,
      evaluatorName: pick(row, ["Requisitioner Name", "Evaluator Name", "Name"]), evaluatorEmail: email, evaluatorRole: existingDoc?.evaluatorRole || "requisitioner", status,
      itemsDelivered: pick(row, ["Items Delivered", "Items"]), sentAt: isoOrBlank(emailed), updatedAt: nowIso(), source:`supplier evaluation queue · ${tab.tab}`, sourceSheet:tab.tab, sourceRow:Number(row.__rowNumber||0), sourceHash, lastExportAt: existingDoc?.lastExportAt || "", historical:false, needsExport:false,
    }});
    changed++;
  }
  await writeBatch("evaluations", writes);
  await saveSyncMeta(source, { fingerprint, completed: true, rows: tab.rows.length });
  return { changed, skipped, total: tab.rows.length, unchanged: false };
}

function isoOrBlank(value: string) { return value ? excelOrDate(value) : ""; }


async function upsertMasterRecords(collection: string, records: Array<{id:string; data:any}>) {
  if (!records.length) return { changed: 0, total: 0 };
  const snap = await adminDb.collection(collection).get();
  const existing = new Map<string, any>();
  snap.docs.forEach((d:any) => existing.set(d.id, d.data()));
  const writes: Array<{id:string;data:any}> = [];
  const stamp = nowIso();
  for (const item of records) {
    const current = existing.get(item.id) || {};
    const merged = {
      ...item.data,
      ...Object.fromEntries(Object.entries(current).filter(([k,v]) => v !== undefined && v !== null && v !== "" && !["updatedAt","sourceHash","sourceSheet","sourceRow"].includes(k))),
      id: item.id,
      updatedAt: stamp,
      lastSyncedAt: stamp,
      source: item.data.source || current.source || "spreadsheet",
      sourceSheet: item.data.sourceSheet || current.sourceSheet || "",
      sourceRow: item.data.sourceRow || current.sourceRow || 0,
      sourceHash: item.data.sourceHash || current.sourceHash || "",
    };
    if (JSON.stringify({ ...current, updatedAt: undefined, lastSyncedAt: undefined }) !== JSON.stringify({ ...merged, updatedAt: undefined, lastSyncedAt: undefined })) {
      writes.push({ id: item.id, data: merged });
    }
  }
  await writeBatch(collection, writes);
  return { changed: writes.length, total: records.length };
}

async function importSpreadsheetMasters() {
  const employees: Array<{id:string;data:any}> = [];
  const buyers = new Map<string, {id:string;data:any}>();
  const suppliers = new Map<string, {id:string;data:any}>();
  const now = nowIso();

  const addBuyer = (name: string, sourceSheet: string, sourceRow: number) => {
    const clean = String(name || "").trim();
    if (!clean || /^unassigned|^total/i.test(clean) || clean.length < 2) return;
    const id = stableId("buyer", clean);
    buyers.set(id, { id, data: { id, name: clean, active: true, createdAt: now, source: "spreadsheet", sourceSheet, sourceRow, sourceHash: crypto.createHash("sha256").update(`${sourceSheet}|${sourceRow}|${clean}`).digest("hex") } });
  };
  const addSupplier = (name: string, extra: Record<string,any>, sourceSheet: string, sourceRow: number) => {
    const clean = String(name || "").trim();
    if (!clean || clean.length < 2 || /^supplier$/i.test(clean) || /^company$/i.test(clean)) return;
    const id = stableId("supplier", clean);
    suppliers.set(id, { id, data: { id, name: clean, ...extra, createdAt: now, source: "spreadsheet", sourceSheet, sourceRow, sourceHash: crypto.createHash("sha256").update(`${sourceSheet}|${sourceRow}|${JSON.stringify(extra)}|${clean}`).digest("hex") } });
  };

  // Requisitioners / employees and their email addresses.
  for (const sheetName of ["Requisitioner Details", "Requisitioner Details1"]) {
    try {
      const tab = await readTabSmart(SUPPLIER_SHEET_ID, sheetName, ["Full name", "Email Address"]);
      for (const row of tab.rows) {
        const name = pick(row, ["Full name", "Full Name", "Requisitioner Name", "Name"]);
        const email = pick(row, ["Email Address", "Email Address [Required]", "Email", "Requisitioner Email"]);
        if (!name || name.length < 2) continue;
        const id = stableId("employee", name.toLowerCase());
        employees.push({ id, data: { id, name, email, active: true, source: "spreadsheet", sourceSheet: tab.tab, sourceRow: Number(row.__rowNumber || 0), sourceHash: rowHash(row), updatedAt: now } });
      }
    } catch {}
  }

  // Supplier names, contacts and PO/evaluation associations.
  for (const sheetName of [SUPPLIER_EVAL_TAB, "Supplier Lists", "Summary", "Summary AY 2025-2026"]) {
    try {
      const tab = await readTabSmart(SUPPLIER_SHEET_ID, sheetName, ["Supplier", "Supplier Name", "Company Name", "PO Number"]);
      for (const row of tab.rows) {
        const name = pick(row, ["Supplier", "Supplier Name", "Company Name", "Vendor", "Vendor Name"]);
        const email = pick(row, ["Email Address", "Supplier Email", "Email"]);
        const address = pick(row, ["Address", "Supplier Address"]);
        const contact = pick(row, ["Contact", "Attention", "Contact Person"]);
        if (name) addSupplier(name, { email, address, contact }, tab.tab, Number(row.__rowNumber || 0));
      }
    } catch {}
  }

  // Purchaser names / buyers from the V2 workbook.
  try {
    const tab = await readTabSmart(ROUTING_SOURCE_SHEET_ID, "Name of Purchasers", ["NAME OF PURCHASERS"]);
    for (const row of tab.rows) {
      const name = pick(row, ["NAME OF PURCHASERS", "Name of Purchasers", "Purchaser", "Purchaser Assigned"]);
      addBuyer(name, tab.tab, Number(row.__rowNumber || 0));
    }
  } catch {}

  // Fill buyer list from monitoring records as well.
  try {
    const tabs = await getSpreadsheetTabs(ROUTING_SOURCE_SHEET_ID);
    const candidates = tabs.map(t => t.properties.title).filter(isMonitoringTab);
    for (const title of candidates) {
      try {
        const tab = await readTabSmart(ROUTING_SOURCE_SHEET_ID, title, ["PRF NO.", "SRF NO.", "CANVASSED BY", "PURCHASER ASSIGNED", "PO PREPARED BY"]);
        for (const row of tab.rows) {
          addBuyer(pick(row, ["CANVASSED BY", "PURCHASER ASSIGNED", "PO PREPARED BY", "PURCHASING"]), tab.tab, Number(row.__rowNumber || 0));
        }
      } catch {}
    }
  } catch {}

  const masterPayload = { employees, buyers: [...buyers.values()], suppliers: [...suppliers.values()] };
  const fingerprint = hashRows(masterPayload);
  const source = `sheet:${SUPPLIER_SHEET_ID}:${ROUTING_SOURCE_SHEET_ID}:reference-masters`;
  const meta = await getSyncMeta(source);
  if (meta?.fingerprint === fingerprint && meta?.completed) {
    return {
      employees: { changed: 0, total: employees.length, unchanged: true },
      buyers: { changed: 0, total: buyers.size, unchanged: true },
      suppliers: { changed: 0, total: suppliers.size, unchanged: true },
    };
  }
  const employeeResult = await upsertMasterRecords("employees", employees);
  const buyerResult = await upsertMasterRecords("buyers", [...buyers.values()]);
  const supplierResult = await upsertMasterRecords("suppliers", [...suppliers.values()]);
  await saveSyncMeta(source, { fingerprint, completed: true, employees: employees.length, buyers: buyers.size, suppliers: suppliers.size });
  return { employees: employeeResult, buyers: buyerResult, suppliers: supplierResult };
}

async function importPRFDetails() {
  const tab = await readTabSmart(SUPPLIER_SHEET_ID, SUPPLIER_PRF_TAB, ["PRF NO.", "REQUISITIONER", "ITEM DESCRIPTION"]);
  const fingerprint = hashRows({ headers: tab.headers, rows: tab.rows });
  const source = `sheet:${SUPPLIER_SHEET_ID}:${tab.tab}:prf-details`;
  const meta = await getSyncMeta(source);
  if (meta?.fingerprint === fingerprint && meta?.completed) return { changed: 0, skipped: 0, total: tab.rows.length, unchanged: true };

  const existingSnap = await adminDb.collection("prfDetails").get();
  const existingMap = new Map<string, any>();
  existingSnap.docs.forEach((d:any)=>existingMap.set(d.id, d.data()));
  const writes: Array<{id:string;data:any}> = [];
  let changed = 0, skipped = 0;
  for (const row of tab.rows) {
    const key = pick(row, ["_systemId", "System ID", "PRF No.", "PRF No", "PRF", "Reference No.", "Reference No", "PO Number", "PO No."]);
    if (!key) continue;
    const id = stableId("prf", key);
    const sourceHash = rowHash(row);
    const current = existingMap.get(id) || {};
    if (current?.sourceHash === sourceHash && current?.sourceSheet === tab.tab) { skipped++; continue; }
    writes.push({ id, data: { id, ...row, source: "PRF Details v2 spreadsheet", sourceSheet: tab.tab, sourceRow: Number(row.__rowNumber || 0), sourceHash, lastExportAt: current?.lastExportAt || "", needsExport: false, updatedAt: nowIso() } });
    changed++;
  }
  await writeBatch("prfDetails", writes);
  await saveSyncMeta(source, { fingerprint, completed: true, rows: tab.rows.length });
  return { changed, skipped, total: tab.rows.length, unchanged: false };
}

function isMonitoringTab(title: string) {
  if (!/PRF|SRF/i.test(title)) return false;
  if (/details|database|summary|dashboard|validation|evaluation|report|name of purchasers/i.test(title)) return false;
  return true;
}

async function importRoutes() {
  const all: Array<{id:string;data:any}> = [];
  let changed = 0, skipped = 0, total = 0;
  const tabs = await getSpreadsheetTabs(ROUTING_SOURCE_SHEET_ID);
  const candidates = tabs.map(t => t.properties.title).filter(isMonitoringTab);
  const sourceSnapshots: Array<{tab:string;headers:string[];rows:any[]}> = [];
  for (const title of candidates) {
    try {
      const tab = await readTabSmart(ROUTING_SOURCE_SHEET_ID, title, ["PRF NO.", "SRF NO.", "REQUISITIONER", "DATE OF PO", "STATUS IN PURCHASING", "DATE OF COMPLETION"]);
      const hasRefHeader = tab.headers.some(h => /PRF NO\.?|SRF NO\.?/i.test(h)) || tab.headers.some(h => /PO NUMBER|REFERENCE NO/i.test(h));
      if (!hasRefHeader) continue;
      sourceSnapshots.push({ tab: tab.tab, headers: tab.headers, rows: tab.rows });
      total += tab.rows.length;
    } catch {}
  }
  const fingerprint = hashRows(sourceSnapshots.map(s => ({ tab:s.tab, headers:s.headers, rows:s.rows })));
  const source = `sheet:${ROUTING_SOURCE_SHEET_ID}:routing-monitoring`;
  const meta = await getSyncMeta(source);
  if (meta?.fingerprint === fingerprint && meta?.completed) return { changed: 0, skipped: 0, total, sheets: sourceSnapshots.length, unchanged: true };

  const existingSnap = await adminDb.collection("routes").get();
  const existingMap = new Map<string, any>();
  existingSnap.docs.forEach((d:any)=>existingMap.set(d.id, d.data()));
  for (const snap of sourceSnapshots) {
    for (const row of snap.rows) {
      const mapped = routeFromRow(row, snap.tab);
      if (!mapped) continue;
      const sourceHash = rowHash(row);
      const current = existingMap.get(mapped.id) || {};
      if (current?.sourceHash === sourceHash && current?.sourceSheet === snap.tab) { skipped++; continue; }
      const history = mapped.history?.length ? mapped.history : (current?.history || []);
      all.push({ id: mapped.id, data: { ...current, ...mapped, history, sourceHash, lastSyncedAt: nowIso(), lastExportAt: current?.lastExportAt || "", needsExport: false, updatedAt: nowIso(), sourceImportedAt: current?.sourceImportedAt || nowIso() } });
      changed++;
    }
  }
  await writeBatch("routes", all);
  await saveSyncMeta(source, { fingerprint, completed: true, rows: total, sheets: sourceSnapshots.length });
  return { changed, skipped, total, sheets: sourceSnapshots.length, unchanged: false };
}

async function exportDirty(collection: string, mapper: (data:any, id:string)=>Record<string,unknown>, sheetId: string, tabName: string, predicate?: (data:any)=>boolean) {
  const snap = await adminDb.collection(collection).where("needsExport", "==", true).get();
  const dirty = snap.docs.filter((d:any) => !predicate || predicate(d.data()));
  if (!dirty.length) return { updated: 0, appended: 0, skipped: 0, dirty: 0 };
  const rows = dirty.map((d:any) => mapper(d.data(), d.id));
  const result = await replaceOrUpsertFlatTab(sheetId, tabName, rows);
  const stamp = nowIso();
  await writeBatch(collection, dirty.map((d:any) => ({ id: d.id, data: { lastExportAt: stamp, needsExport: false } })));
  return { ...result, skipped: 0, dirty: dirty.length };
}

export async function GET() {
  let stage = "starting";
  const startedAt = Date.now();
  try {
    stage = "import-historical-evaluations";
    const historical = await importHistoricalEvaluations();
    stage = "import-evaluation-queue";
    const queue = await importEvaluationQueue();
    stage = "import-prf";
    const prf = await importPRFDetails();
    stage = "import-reference-masters";
    const masters = await importSpreadsheetMasters();
    stage = "import-routing";
    const routes = await importRoutes();

    stage = "export-evaluations";
    const evalExport = await exportDirty("evaluations", (d,id)=>({ _systemId:id, "Evaluation ID":id, ...d }), SUPPLIER_SHEET_ID, SUPPLIER_EVAL_TAB);
    stage = "export-prf";
    const prfExport = await exportDirty("prfDetails", (d,id)=>({ _systemId:id, ...d, "System ID":id }), SUPPLIER_SHEET_ID, SUPPLIER_PRF_TAB);
    stage = "export-routing";
    await ensureSheetTab(ROUTING_SHEET_ID, ROUTETRACK_TAB);
    const routeMapper = (d:any,id:string)=>({
      _systemId:id,
      "System ID":id,
      "Tracking ID":d.trackingId || id,
      "Document Type":d.documentType || "",
      "Reference No":d.referenceNo || "",
      "PRF No":d.prfNo || "",
      "SRF No":d.srfNo || "",
      "PO Number":d.poNumber || "",
      "Requester":d.requester || "",
      "Department":d.department || "",
      "From":d.from || "",
      "To":d.to || "",
      "Current Holder":d.currentHolder || "",
      "Status":d.status || "",
      "Date Routed":d.dateRouted || "",
      "Date Received":d.dateReceived || "",
      "Received By":d.receivedBy || "",
      "Date Returned":d.dateReturned || "",
      "Remarks":d.remarks || "",
      "Source Sheet":d.sourceSheet || "",
      "Source Row":d.sourceRow || "",
      "History JSON":JSON.stringify(d.history || []),
      "Last Synced At":d.lastSyncedAt || nowIso(),
    });
    const routeExport = await exportDirty("routes", routeMapper, ROUTING_SHEET_ID, ROUTETRACK_TAB);
    let routeV2Export: any = { updated: 0, appended: 0, skipped: 0 };
    if (ROUTING_SOURCE_SHEET_ID !== ROUTING_SHEET_ID) {
      await ensureSheetTab(ROUTING_SOURCE_SHEET_ID, ROUTETRACK_TAB);
      routeV2Export = await exportDirty("routes", routeMapper, ROUTING_SOURCE_SHEET_ID, ROUTETRACK_TAB);
    }

    return NextResponse.json({
      ok: true,
      mode: "full-source-import + delta-export",
      evaluationRecordsImported: historical.changed + queue.changed,
      evaluationRecordsSkipped: historical.skipped + queue.skipped,
      historicalEvaluationRecords: historical.changed,
      evaluationQueueRecords: queue.changed,
      prfRecordsImported: prf.changed,
      prfRecordsSkipped: prf.skipped,
      masterData: masters,
      routeRecordsImported: routes.changed,
      routeRecordsSkipped: routes.skipped,
      routeSourceSheets: routes.sheets,
      evaluationSheet: evalExport,
      prfSheet: prfExport,
      routingSheet: routeExport,
      routingSheetV2: routeV2Export,
      routingSheetName: ROUTETRACK_TAB,
      syncedAt: nowIso(),
      elapsedMs: Date.now() - startedAt,
      message: "All historical source records are reconciled; only changed/new application records are exported.",
    }, { headers:{"Cache-Control":"no-store"} });
  } catch (error:any) {
    console.error("/api/sync failed at", stage, error);
    const raw = String(error?.message || error || "Spreadsheet synchronization failed.");
    const quota = /RESOURCE_EXHAUSTED|quota exceeded/i.test(raw);
    const message = quota
      ? "Firestore daily quota is exhausted. Sync has been paused to prevent repeated quota failures. Wait for the quota reset or enable billing, then run Sync again."
      : raw;
    return NextResponse.json({ ok:false, stage, code: quota ? "RESOURCE_EXHAUSTED" : "SYNC_ERROR", message, retryable: !quota, elapsedMs: Date.now() - startedAt }, { status: quota ? 429 : 503, headers:{"Cache-Control":"no-store"} });
  }
}
