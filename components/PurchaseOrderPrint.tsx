"use client";

import React from "react";

export type POPrintItem = {
  qty: number;
  unit: string;
  particulars: string;
  unitPrice: number;
};

export type POPrintData = {
  poNumber: string;
  date: string;
  deliveryDate?: string;
  terms?: string;
  companyName?: string;
  companyAddress?: string;
  companyPhone?: string;
  companyFax?: string;
  supplierName?: string;
  supplierAddress?: string;
  supplierContact?: string;
  requisitioner?: string;
  prfNo?: string;
  purpose?: string;
  preparedBy?: string;
  approvedBy?: string;
  conformee?: string;
  items: POPrintItem[];
  notes?: string;
};

function money(n: unknown) {
  const value = Number(n || 0);
  return value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function wordsUnderMillion(value: number): string {
  const ones = ["", "ONE", "TWO", "THREE", "FOUR", "FIVE", "SIX", "SEVEN", "EIGHT", "NINE", "TEN", "ELEVEN", "TWELVE", "THIRTEEN", "FOURTEEN", "FIFTEEN", "SIXTEEN", "SEVENTEEN", "EIGHTEEN", "NINETEEN"];
  const tens = ["", "", "TWENTY", "THIRTY", "FORTY", "FIFTY", "SIXTY", "SEVENTY", "EIGHTY", "NINETY"];
  if (value < 20) return ones[value];
  if (value < 100) return tens[Math.floor(value / 10)] + (value % 10 ? `-${ones[value % 10]}` : "");
  if (value < 1000) return `${ones[Math.floor(value / 100)]} HUNDRED${value % 100 ? ` ${wordsUnderMillion(value % 100)}` : ""}`;
  if (value < 1000000) return `${wordsUnderMillion(Math.floor(value / 1000))} THOUSAND${value % 1000 ? ` ${wordsUnderMillion(value % 1000)}` : ""}`;
  return "";
}

export function amountInWords(value: number) {
  const whole = Math.floor(Math.max(0, value));
  const cents = Math.round((Math.max(0, value) - whole) * 100);
  let result = whole === 0 ? "ZERO" : wordsUnderMillion(whole);
  if (!result) result = whole.toLocaleString("en-PH");
  return cents ? `${result} PESOS AND ${String(cents).padStart(2, "0")} CENTAVOS` : `${result} PESOS`;
}

export default function PurchaseOrderPrint({ data }: { data: POPrintData }) {
  const rows = Array.from({ length: Math.max(6, data.items.length) }, (_, index) => data.items[index]);
  const total = data.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);

  return (
    <div className="po-print-shell">
      <style jsx global>{`
        @page { size: A4 portrait; margin: 8mm; }
        @media print {
          body { background: #fff !important; }
          body * { visibility: hidden !important; }
          .po-print-root, .po-print-root * { visibility: visible !important; }
          .po-print-root { position: absolute !important; inset: 0 !important; width: 100% !important; }
          .po-print-page { box-shadow: none !important; border: 0 !important; }
        }
        .po-print-shell { background: rgba(20,24,40,.72); position: fixed; inset: 0; z-index: 5000; overflow: auto; padding: 24px; }
        .po-print-toolbar { display:flex; justify-content:flex-end; gap:10px; margin:0 auto 12px; max-width:790px; }
        .po-print-toolbar button { border:0; border-radius:8px; padding:10px 16px; font-weight:700; cursor:pointer; }
        .po-print-page { width: 794px; min-height:1123px; margin:0 auto; background:#fff; color:#111; padding:52px 66px 50px; box-sizing:border-box; font-family: Arial, Helvetica, sans-serif; font-size:11px; line-height:1.18; box-shadow:0 18px 45px rgba(0,0,0,.2); }
        .po-head { text-align:center; margin-bottom:18px; }
        .po-company { font-size:17px; font-weight:800; letter-spacing:.2px; }
        .po-addr { font-size:10px; margin-top:3px; font-weight:700; }
        .po-contact { font-size:9px; font-weight:700; margin-top:2px; }
        .po-top { display:grid; grid-template-columns:1fr 1fr; column-gap:44px; align-items:start; margin-bottom:14px; }
        .po-left-line, .po-right-line { display:flex; gap:7px; min-height:18px; }
        .po-label { font-weight:800; min-width:103px; }
        .po-right-line .po-label { min-width:98px; }
        .po-title { font-size:12px; font-weight:800; margin:10px 0 10px; }
        .po-table { width:100%; border-collapse:collapse; table-layout:fixed; }
        .po-table th { text-align:center; font-size:9px; padding:3px 2px 6px; border-bottom:1px solid #000; font-weight:800; }
        .po-table td { padding:4px 2px; vertical-align:top; font-size:10px; }
        .po-table td.num, .po-table th.num { text-align:center; }
        .po-table td.money, .po-table th.money { text-align:right; padding-right:3px; }
        .po-table th:nth-child(1) { width:8%; }
        .po-table th:nth-child(2) { width:10%; }
        .po-table th:nth-child(3) { width:50%; }
        .po-table th:nth-child(4) { width:14%; }
        .po-table th:nth-child(5) { width:18%; }
        .po-total-row td { padding-top:7px; font-weight:800; }
        .po-separator { border-top:1px solid #000; margin-top:2px; }
        .po-bottom-grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px 40px; margin-top:30px; }
        .po-meta-line { display:flex; gap:8px; margin-bottom:3px; }
        .po-meta-label { min-width:95px; font-weight:800; }
        .po-words { margin-top:24px; font-weight:700; }
        .po-notes { margin-top:20px; font-size:9px; }
        .po-signatures { display:grid; grid-template-columns: 1fr 1fr 1fr; gap:34px; margin-top:34px; }
        .po-sig { min-height:78px; }
        .po-sig-title { font-weight:700; margin-bottom:18px; }
        .po-sig-line { border-bottom:1px solid #000; height:38px; margin-bottom:3px; }
        .po-sig-name { font-size:9px; font-weight:700; }
        .po-print-button { background:#111827; color:#fff; }
        .po-close-button { background:#fff; color:#111827; border:1px solid #d1d5db !important; }
      `}</style>

      <div className="po-print-root">
        <div className="po-print-toolbar">
          <button className="po-close-button" onClick={() => window.location.reload()}>Close</button>
          <button className="po-print-button" onClick={() => window.print()}>Print / Save PDF</button>
        </div>

        <div className="po-print-page">
          <div className="po-head">
            <div className="po-company">{data.companyName || "TROPICAL PALMS FASHION HOUSE, INC."}</div>
            <div className="po-addr">{data.companyAddress || "1281 Tropical Ave. Cor. Luxembourg St. BF International"}</div>
            <div className="po-addr">Las Piñas City, Philippines</div>
            <div className="po-contact">{data.companyPhone || "Tel Nos: (632) 8256374"}</div>
            <div className="po-contact">{data.companyFax || "(632) 8208702 (632) 8208715  Fax No. (632) 8256358"}</div>
          </div>

          <div className="po-top">
            <div>
              <div className="po-left-line"><span className="po-label">PURCHASE ORDER</span></div>
              <div className="po-left-line"><span className="po-label">Company Name:</span><span>{data.supplierName || ""}</span></div>
              <div className="po-left-line"><span className="po-label">Attention:</span><span>{data.supplierContact || ""}</span></div>
              <div className="po-left-line"><span className="po-label">Tel./Fax No.:</span><span>{data.supplierAddress || ""}</span></div>
            </div>
            <div>
              <div className="po-right-line"><span className="po-label">P.O.</span><span>{data.poNumber}</span></div>
              <div className="po-right-line"><span className="po-label">Date:</span><span>{data.date}</span></div>
              <div className="po-right-line"><span className="po-label">Delivery Date:</span><span>{data.deliveryDate || ""}</span></div>
              <div className="po-right-line"><span className="po-label">Terms:</span><span>{data.terms || "50% DP  50% FD"}</span></div>
            </div>
          </div>

          <div className="po-title">Please deliver to us the following:</div>

          <table className="po-table">
            <thead>
              <tr><th className="num">QTY</th><th className="num">UNIT</th><th>PARTICULARS</th><th className="money">UNIT PRICE</th><th className="money">TOTAL AMOUNT</th></tr>
            </thead>
            <tbody>
              {rows.map((item, index) => (
                <tr key={index}>
                  <td className="num">{item ? item.qty : ""}</td>
                  <td className="num">{item ? item.unit : ""}</td>
                  <td>{item?.particulars || ""}</td>
                  <td className="money">{item ? money(item.unitPrice) : ""}</td>
                  <td className="money">{item ? money(Number(item.qty || 0) * Number(item.unitPrice || 0)) : ""}</td>
                </tr>
              ))}
              <tr className="po-total-row"><td colSpan={4} style={{textAlign:"right"}}>Total:</td><td className="money">{money(total)}</td></tr>
            </tbody>
          </table>

          <div className="po-separator" />
          <div className="po-bottom-grid">
            <div>
              <div className="po-meta-line"><span className="po-meta-label">REQUISITIONER:</span><span>{data.requisitioner || ""}</span></div>
              <div className="po-meta-line"><span className="po-meta-label">PRF No:</span><span>{data.prfNo || ""}</span></div>
              <div className="po-meta-line"><span className="po-meta-label">Purpose:</span><span>{data.purpose || ""}</span></div>
            </div>
            <div />
          </div>

          <div className="po-words">Total Amount in words: <span>{amountInWords(total)}</span></div>

          <div className="po-notes">
            <div>(1) Supplier must affix signature and refax to us if there is any correction in the amount in order to facilitate processing of payment.</div>
            <div style={{marginTop:6}}>(2) Delivery of all items listed above are to be made thru Asset Management Department.</div>
            {data.notes ? <div style={{marginTop:6}}>{data.notes}</div> : null}
          </div>

          <div className="po-signatures">
            <div className="po-sig"><div className="po-sig-title">Prepared by:</div><div className="po-sig-line" /><div className="po-sig-name">{data.preparedBy || ""}</div></div>
            <div className="po-sig"><div className="po-sig-title">Verified/Approved by:</div><div className="po-sig-line" /><div className="po-sig-name">{data.approvedBy || ""}</div></div>
            <div className="po-sig"><div className="po-sig-title">Conforme:</div><div className="po-sig-line" /><div className="po-sig-name">{data.conformee || "Name:"}</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}
