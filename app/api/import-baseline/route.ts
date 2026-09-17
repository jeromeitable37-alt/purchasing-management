import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import crypto from "node:crypto";
import { adminDb } from "@/lib/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const now = () => new Date().toISOString();
function key(v: unknown) { return String(v ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, ""); }
function pick(row: Record<string, any>, names: string[]) {
  for (const n of names) { const k = key(n); const hit = Object.keys(row).find(x => key(x) === k); if (hit && String(row[hit] ?? "").trim()) return String(row[hit]).trim(); }
  return "";
}
function num(v: any) { const n = Number(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; }
function stable(prefix: string, value: string) { return `${prefix}-${crypto.createHash("sha1").update(value.trim().toLowerCase()).digest("hex").slice(0, 28)}`; }
function hash(v: unknown) { return crypto.createHash("sha256").update(JSON.stringify(v)).digest("hex"); }
async function commit(collection: string, docs: Array<{id:string,data:any}>) {
  for (let i=0;i<docs.length;i+=400) { const batch = adminDb.batch(); for (const d of docs.slice(i,i+400)) batch.set(adminDb.collection(collection).doc(d.id), d.data, {merge:true}); await batch.commit(); }
}

function evaluationFromGeneric(row: Record<string, any>, sourceSheet: string) {
  const po = pick(row,["PO Number","PO No.","PO"]); const vendor = pick(row,["Company Name","Vendor","Supplier","Vendor Name"]); const prf = pick(row,["PRF No.","PRF No","PRF"]); if (!po && !vendor && !prf) return null;
  const id = pick(row,["System ID","Evaluation ID","_systemId"]) || stable("legacy-eval",`${sourceSheet}|${po}|${vendor}|${pick(row,["Evaluation Date","Date Evaluated"])}`);
  const overall = num(pick(row,["FINAL RATING","Overall Score","Average","Average Score","AC"]));
  const date = pick(row,["Evaluation Date","Date Evaluated"]);
  return { id, token: crypto.randomBytes(24).toString("hex"), poNumber:po, prfNo:prf, vendorName:vendor, supplier:vendor, evaluatorName:pick(row,["Evaluator Name","Requisitioner","Name"]), evaluatorEmail:pick(row,["Evaluator Email","Email"]), evaluatorRole:pick(row,["Evaluator Role","Role"])||"requisitioner", accurateDelivery:num(pick(row,["Accurate Delivery / Quality","Accurate Delivery"])), competitivePrice:num(pick(row,["Competitive Price"])), timeliness:num(pick(row,["Timeliness of Delivery","Timeliness"])), afterSales:num(pick(row,["After Sales Services","After Sales"])), compliance:num(pick(row,["Compliance","Compliance with Regulatory Requirements and School Policies"])), comments:pick(row,["Remarks","Comments"]), overallScore:overall, submittedAt:date, status:(overall||date)?"submitted":"pending", source:`legacy workbook · ${sourceSheet}`, sourceSheet, sourceHash:hash(row), lastExportAt:now(), updatedAt:now(), importedAt:now() };
}

function evaluationFromDatabaseRow(row: any[], sourceSheet: string, rowNumber: number) {
  const prf=String(row[0]??"").trim(), po=String(row[1]??"").trim(), vendor=String(row[4]??"").trim();
  if (!po && !prf && !vendor) return [];
  const items=String(row[2]??"").trim(), date=String(row[3]??"").trim(), remarks=String(row[6]??"").trim(), overall=num(row[28]);
  const groups:[string,string,number[]][]=[
    ["purchasing","Purchasing",[7,8,9,10,11]],
    ["requisitioner","Requisitioner",[13,14,15,16]],
    ["amd","AMD",[18,19,20,21]]
  ];
  const docs:any[]=[];
  for (const [role,label,indexes] of groups) {
    const scores=indexes.map(i=>num(row[i]));
    if (!scores.some(v=>v>0) && !overall) continue;
    const id=stable("legacy-eval",`${sourceSheet}|${rowNumber}|${role}`);
    const final = role === "purchasing" ? overall : (scores.filter(v=>v>0).length ? Math.round(scores.filter(v=>v>0).reduce((a,b)=>a+b,0)/scores.filter(v=>v>0).length*10)/10 : overall);
    docs.push({id,token:crypto.randomBytes(24).toString("hex"),poNumber:po,prfNo:prf,vendorName:vendor,supplier:vendor,evaluatorRole:role,evaluatorName:label,accurateDelivery:scores[0]||0,competitivePrice:scores[1]||0,timeliness:scores[2]||0,afterSales:scores[3]||0,compliance:scores[4]||0,comments:remarks,overallScore:final,submittedAt:date,status:(final||date)?"submitted":"pending",itemsDelivered:items,source:`legacy workbook · ${sourceSheet}`,sourceSheet,sourceRow:rowNumber,sourceHash:hash(row),lastExportAt:now(),updatedAt:now(),importedAt:now(),legacyFinalRating:overall,legacyAverage:label === "Purchasing" ? num(row[12]) : label === "Requisitioner" ? num(row[17]) : num(row[22]),legacyRecommendation:String(row[29]??"")});
  }
  return docs;
}

function excelDate(v: any) {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const n = Number(raw);
    if (n > 20000 && n < 70000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString();
  }
  const d = new Date(raw); return Number.isNaN(d.getTime()) ? raw : d.toISOString();
}
function first(row: Record<string,any>, names: string[]) { return pick(row,names); }
function routeState(row: Record<string,any>, isSrf: boolean) {
  const requester=first(row,["REQUISITIONER","Requester"]), purchaser=first(row,["Purchaser Assigned","CANVASSED BY"]), status=first(row,["STATUS IN PURCHASING","PRF Status","Status"]);
  const actual=first(row,["ACTUAL DELIVERY DATE"]), receiver=first(row,["DELIVERY RECEIVED BY"]);
  if (isSrf) {
    if (first(row,["DATE OF COMPLETION/ ENDORSED TO AMD AND PURCH","DATE OF COMPLETION","DATE OF COMPLETION/ ENDORSED TO AMD"])) return {from:"Purchasing / AMD",to:requester||"Requisitioner",currentHolder:requester||"Requisitioner",status:"Completed"};
    if (first(row,["DATE RELEASED BY AUDIT","RELEASED DATE","RELEASE DATE"])) return {from:"Audit",to:"AMD / Purchasing",currentHolder:"AMD / Purchasing",status:"Released by Audit"};
    if (first(row,["DATE RECEIVED BY AUDIT","RECEIVED DATE"])) return {from:"Purchasing",to:"Audit",currentHolder:"Audit",status:"For Audit"};
    if (first(row,["APPROVAL TRACKING DATE","DATE FULLY APPROVED","FULLY APPROVED DATE RECEIVED"])) return {from:"AMD",to:"Approver / Purchasing",currentHolder:"Approver / Purchasing",status:status||"For Approval"};
    if (first(row,["DATE RETURNED","CANVASSED DATE"])) return {from:"Purchasing",to:"AMD / Approver",currentHolder:purchaser||"Purchasing",status:status||"In Process"};
    return {from:requester||"Requisitioner",to:"AMD",currentHolder:"AMD",status:status||"For Routing"};
  }
  if (actual) return {from:"Purchasing",to:receiver||requester||"Requisitioner",currentHolder:receiver||requester||"Requisitioner",status:"Completed"};
  if (first(row,["DATE forwarded to Accounting","Date Forwarded to Accounting"])) return {from:"Purchasing",to:"Accounting",currentHolder:"Accounting",status:"Forwarded to Accounting"};
  if (first(row,["DATE OF PO FORWARDED TO AMD AND ACCTNG"])) return {from:"Purchasing",to:"AMD / Accounting",currentHolder:"AMD / Accounting",status:status||"Forwarded"};
  if (first(row,["PO NUMBER","PO Number","PO No.","PO"])) return {from:"AMD / Approvals",to:"Purchasing",currentHolder:purchaser||"Purchasing",status:status||"PO Created"};
  if (first(row,["DATE RECEIVED OF FULLY APPROVED PRF"])) return {from:"Audit / Approvals",to:"Purchasing",currentHolder:"Purchasing",status:status||"Fully Approved"};
  if (first(row,["DATE END CANVASSED","DATE PROCESSED/CANVASSED","DATE RETURNED"])) return {from:"Purchasing",to:"Purchasing",currentHolder:purchaser||"Purchasing",status:status||"In Process"};
  return {from:requester||"Requisitioner",to:"AMD",currentHolder:"AMD",status:status||"For Routing"};
}
function buildRoutes(rows: Record<string,any>[], sheet:string, sourceRowOffset=1) {
  return rows.map((r,i)=>{
    const prf=pick(r,["PRF NO.","PRF No","PRF"]), srf=pick(r,["SRF NO.","SRF No","SRF"]), po=pick(r,["PO NUMBER","PO Number","PO No.","PO"]); if(!prf&&!srf&&!po) return null;
    const isSrf=!!srf||/\bsrf\b/i.test(sheet); const ref=srf||prf||po; const state=routeState(r,isSrf); const history:any[]=[];
    const add=(action:string, names:string[], extra:any={})=>{const v=pick(r,names); if(v) history.push({timestamp:excelDate(v),action,...extra});};
    if(isSrf){ add("SRF filed",["DATE FILED"]); add("SRF received by AMD",["DATE RECEIVED BY AMD WITH COMPLETE SPECS AND ATTACHMENT","DATE RECEIVED BY AMD WITH COMPLETE DETAILS","DATE RECEIVED BY AMD"]); add("SRF received / encoded",["DATE RECEIVED","Date Received"]); add("Canvassing / processing",["CANVASSED DATE","DATE RETURNED"]); add("Approval tracking",["APPROVAL TRACKING DATE","DATE FULLY APPROVED","FULLY APPROVED DATE RECEIVED"]); add("Received by Audit",["DATE RECEIVED BY AUDIT","RECEIVED DATE"]); add("Released by Audit",["DATE RELEASED BY AUDIT","RELEASED DATE"]); add("Completed / endorsed",["DATE OF COMPLETION/ ENDORSED TO AMD AND PURCH","DATE OF COMPLETION","DATE OF COMPLETION/ ENDORSED TO AMD"],{status:"Completed"}); }
    else { add("PRF filed",["DATE FILED"]); add("PRF received by AMD",["DATE RECEIVED BY AMD","DATE FILED/ FORWARDED TO AMD & PURCHASING"],{to:"AMD"}); add("Date received by Purchasing",["DATE RECEIVED","Date Received"],{to:"Purchasing"}); add("Canvassing started",["DATE START PROCESSING/ CANVASSING"]); add("Canvassing completed",["DATE END CANVASSED","DATE PROCESSED/CANVASSED","DATE RETURNED"]); add("Fully approved PRF received",["DATE RECEIVED OF FULLY APPROVED PRF"]); add("PO created",["DATE OF PO"],{status:state.status}); add("PO forwarded to AMD / Accounting",["DATE OF PO FORWARDED TO AMD AND ACCTNG"],{to:"AMD / Accounting"}); add("Delivery date",["Delivery Date","PO DELIVERY DATE"]); add("Actual delivery",["ACTUAL DELIVERY DATE"],{status:"Completed",to:"Requisitioner",currentHolder:first(r,["DELIVERY RECEIVED BY"]) }); add("Forwarded to Accounting",["DATE forwarded to Accounting","Date Forwarded to Accounting"],{to:"Accounting",currentHolder:"Accounting"}); }
    history.sort((a,b)=>new Date(a.timestamp).getTime()-new Date(b.timestamp).getTime());
    return {id:stable("route",`${sheet}|${ref}`),trackingId:`RT-${ref.replace(/\s+/g,"-")}`,documentType:isSrf?"SRF":"PRF",referenceNo:ref,prfNo:prf||"",srfNo:srf||"",poNumber:po||"",documentTitle:first(r,["ITEM DESCRIPTION","SCOPE OF WORK"]),requester:first(r,["REQUISITIONER"]),department:first(r,["DEPARTMENT"]),from:state.from,to:state.to,currentHolder:state.currentHolder,status:state.status,dateRouted:first(r,["DATE FILED","DATE RECEIVED BY AMD","DATE RECEIVED BY AMD WITH COMPLETE SPECS AND ATTACHMENT"]),dateReceived:first(r,["DATE RECEIVED","Date Received","DATE RECEIVED OF FULLY APPROVED PRF"]),receivedBy:first(r,["DELIVERY RECEIVED BY","RECEIVED BY AUDIT"]),dateReturned:first(r,["DATE RETURNED"]),remarks:first(r,["REMARKS","AMD REMARKS","AUDIT REMARKS","TREASURY'S REMARKS"]),history,source:`legacy workbook · ${sheet}`,sourceSheet:sheet,sourceRow:i+sourceRowOffset,sourceHash:hash(r),lastExportAt:now(),updatedAt:now(),importedAt:now()};
  }).filter(Boolean);
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file"); const kind = String(form.get("kind") || "");
    if (!(file instanceof File)) return NextResponse.json({ok:false,message:"Excel file is required."},{status:400});
    if (!file.name.toLowerCase().match(/\.(xlsx|xls|xlsm)$/)) return NextResponse.json({ok:false,message:"Upload an Excel workbook (.xlsx/.xls/.xlsm)."},{status:400});
    const bytes = await file.arrayBuffer(); const wb = XLSX.read(Buffer.from(bytes), {type:"buffer", cellDates:false, raw:true});
    if (kind === "evaluation") {
      const preferred = ["DATABASE", "Copy of DATABASE", "DATABASE1", "SEARCH", "PO for Evaluation"];
      const docsMap = new Map<string, any>();
      let sheetsUsed: string[] = [];
      for (const name of preferred) {
        if (!wb.Sheets[name]) continue;
        sheetsUsed.push(name);
        const matrix:any[][]=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:""});
        if (/DATABASE|SEARCH/i.test(name)) {
          for (let i=2;i<matrix.length;i++) for (const d of evaluationFromDatabaseRow(matrix[i],name,i+1)) docsMap.set(d.id,d);
        } else {
          const headers=(matrix[0]||[]).map(v=>String(v??""));
          for(let i=1;i<matrix.length;i++) { const row:any={}; headers.forEach((h,j)=>{if(h) row[h]=matrix[i][j]??""}); const doc=evaluationFromGeneric(row,name); if(doc){ docsMap.set(doc.id, doc); } }
        }
      }
      const docs=[...docsMap.values()];
      await commit("evaluations",docs.map(d=>({id:d.id,data:d}))); return NextResponse.json({ok:true,kind,sourceFile:file.name,sheets:sheetsUsed,recordsImported:docs.length,message:`Imported ${docs.length} supplier-evaluation records across the historical database and evaluation queue. Future syncs reconcile changes/new records.`});
    }
    if (kind === "routing") {
      const docsMap = new Map<string, any>();
      const usedSheets:string[]=[];
      for (const name of wb.SheetNames) {
        if (!/\b(PRF|SRF)\b/i.test(name) || /details|database|summary|dashboard|validation|evaluation|report/i.test(name)) continue;
        const matrix:any[][]=XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:""});
        const headerIndex=Math.max(0,matrix.slice(0,12).findIndex(r=>r.some((v:any)=>/^(PRF\s*NO\.?|SRF\s*NO\.?)$/i.test(String(v??""))) && r.some((v:any)=>/REQUISITIONER/i.test(String(v??"")))));
        const headers=(matrix[headerIndex]||[]).map(v=>String(v??""));
        const hasStage=headers.some(h=>/DATE RECEIVED BY AMD|DATE OF PO|ACTUAL DELIVERY DATE|DATE OF COMPLETION|STATUS IN PURCHASING|DATE RETURNED|DATE RELEASED/i.test(h));
        const hasRef=headers.some(h=>/^(PRF\s*NO\.?|SRF\s*NO\.?)$/i.test(h));
        if(!hasRef || !hasStage) continue;
        usedSheets.push(name);
        const rows:any[]=[];
        for(let i=headerIndex+1;i<matrix.length;i++){const r:any={}; headers.forEach((h,j)=>{if(h) r[h]=matrix[i][j]??""}); r.__rowNumber=i+1; if(Object.values(r).some(v=>String(v??"").trim())) rows.push(r); }
        for(const d of buildRoutes(rows,name,1)) docsMap.set(d.id,d);
      }
      const docs=[...docsMap.values()]; await commit("routes",docs.map((d:any)=>({id:d.id,data:d}))); return NextResponse.json({ok:true,kind,sourceFile:file.name,sheets:usedSheets,recordsImported:docs.length,message:`Imported ${docs.length} historical RouteTrack records from ${usedSheets.length} PRF/SRF monitoring sheets.`});
    }
    return NextResponse.json({ok:false,message:"Unknown baseline import type."},{status:400});
  } catch (error:any) { console.error("/api/import-baseline",error); return NextResponse.json({ok:false,message:error?.message||"Baseline import failed."},{status:500}); }
}
