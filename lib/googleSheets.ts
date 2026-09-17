import crypto from "node:crypto";

type TokenResponse = { access_token: string; expires_in: number };
type SheetTab = { properties: { sheetId: number; title: string } };
export type SmartTab = {
  tab: string;
  headers: string[];
  rows: Record<string, string>[];
  rawRows: string[][];
  headerRow: number;
};

function base64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function normalizePrivateKey(raw: string) {
  let key = String(raw || "").trim();
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) key = key.slice(1, -1);
  key = key.replace(/\\n/g, "\n").replace(/\r/g, "");
  key = key.replace(/\\"/g, '"');
  if (!key.includes("BEGIN PRIVATE KEY") || !key.includes("END PRIVATE KEY")) {
    throw new Error("GOOGLE_SHEETS_PRIVATE_KEY is not a valid PEM private key. Paste the private_key value from the Google service-account JSON, including BEGIN/END PRIVATE KEY lines.");
  }
  return key;
}

function getCredentials() {
  const clientEmail = (process.env.GOOGLE_SHEETS_CLIENT_EMAIL || process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = normalizePrivateKey(process.env.GOOGLE_SHEETS_PRIVATE_KEY || process.env.FIREBASE_PRIVATE_KEY || "");
  if (!clientEmail) throw new Error("GOOGLE_SHEETS_CLIENT_EMAIL is not configured.");
  return { clientEmail, privateKey };
}

let tokenCache: { token: string; expiresAt: number } | null = null;
let tabsCache = new Map<string, { expiresAt: number; tabs: SheetTab[] }>();
const TABS_CACHE_MS = 30_000;

async function getAccessToken() {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const { clientEmail, privateKey } = getCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(JSON.stringify({ iss: clientEmail, scope: "https://www.googleapis.com/auth/spreadsheets", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  signer.end();
  const jwt = `${header}.${claim}.${base64url(signer.sign(privateKey))}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }),
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google OAuth failed (${response.status}): ${text.slice(0, 400)}`);
  }
  const data = (await response.json()) as TokenResponse;
  tokenCache = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

async function sheetsFetch(path: string, init?: RequestInit) {
  const token = await getAccessToken();
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Google Sheets API ${response.status}: ${text.slice(0, 700)}`);
  }
  return response.json();
}

export async function getSpreadsheetTabs(spreadsheetId: string) {
  const cached = tabsCache.get(spreadsheetId);
  if (cached && cached.expiresAt > Date.now()) return cached.tabs;
  const data = await sheetsFetch(`${spreadsheetId}?fields=sheets.properties`);
  const tabs = (data.sheets || []) as SheetTab[];
  tabsCache.set(spreadsheetId, { expiresAt: Date.now() + TABS_CACHE_MS, tabs });
  return tabs;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function headerScore(headers: string[], patterns: string[]) {
  const joined = headers.map(normalizeHeader);
  let score = 0;
  for (const pattern of patterns) {
    const target = normalizeHeader(pattern);
    if (!target) continue;
    if (joined.some(h => h === target)) score += 8;
    else if (joined.some(h => h.includes(target))) score += 4;
  }
  if (joined.some(h => /^(prf no\.?|srf no\.?)$/.test(h))) score += 8;
  if (joined.some(h => h.includes("requisitioner"))) score += 4;
  return score;
}

export async function readTab(spreadsheetId: string, title?: string) {
  const tabs = await getSpreadsheetTabs(spreadsheetId);
  const tab = (title ? tabs.find((t) => t.properties.title === title) : tabs[0]);
  if (!tab) throw new Error(`Sheet tab not found${title ? `: ${title}` : "."}`);
  const data = await sheetsFetch(`${spreadsheetId}/values/${encodeURIComponent(tab.properties.title)}?majorDimension=ROWS`);
  const values = (data.values || []) as string[][];
  const headers = (values[0] || []).map((h) => String(h || "").trim());
  const rows = values.slice(1).map((row, index) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => { if (header) obj[header] = row[i] ?? ""; });
    obj.__rowNumber = String(index + 2);
    return obj;
  });
  return { tab: tab.properties.title, headers, rows, headerRow: 1 };
}

export async function readTabSmart(spreadsheetId: string, title: string, patterns: string[] = []) : Promise<SmartTab> {
  const tabs = await getSpreadsheetTabs(spreadsheetId);
  const tab = tabs.find(t => t.properties.title === title);
  if (!tab) throw new Error(`Sheet tab not found: ${title}`);
  const data = await sheetsFetch(`${spreadsheetId}/values/${encodeURIComponent(tab.properties.title)}?majorDimension=ROWS`);
  const values = (data.values || []) as string[][];
  const scan = Math.min(values.length, 12);
  let bestRow = 0;
  let bestScore = -1;
  for (let i = 0; i < scan; i++) {
    const headers = (values[i] || []).map(v => String(v ?? "").trim());
    const score = headerScore(headers, patterns);
    if (score > bestScore) { bestScore = score; bestRow = i; }
  }
  const headers = (values[bestRow] || []).map((h) => String(h || "").trim());
  const rawRows = values.slice(bestRow + 1).map(row => row.map(v => String(v ?? "")));
  const rows = rawRows.map((row, index) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, i) => { if (header) obj[header] = row[i] ?? ""; });
    obj.__rowNumber = String(bestRow + index + 2);
    obj.__headerRow = String(bestRow + 1);
    return obj;
  });
  return { tab: tab.properties.title, headers, rows, rawRows, headerRow: bestRow + 1 };
}

export async function ensureSheetTab(spreadsheetId: string, title: string) {
  const tabs = await getSpreadsheetTabs(spreadsheetId);
  if (tabs.some(t => t.properties.title === title)) return;
  await sheetsFetch(`${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ requests: [{ addSheet: { properties: { title } } }] }),
  });
  tabsCache.delete(spreadsheetId);
}

function sheetA1Range(title: string, range: string) {
  const safe = title.replace(/'/g, "''");
  return `'${safe}'!${range}`;
}

function columnLetter(n: number) {
  let out = "";
  let x = Math.max(1, n);
  while (x > 0) {
    const r = (x - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    x = Math.floor((x - 1) / 26);
  }
  return out;
}

export async function replaceOrUpsertFlatTab(spreadsheetId: string, title: string, rows: Record<string, unknown>[]) {
  await ensureSheetTab(spreadsheetId, title);
  const current = await readTab(spreadsheetId, title).catch(() => ({ tab: title, headers: [], rows: [], headerRow: 1 }));
  const union = new Set<string>(current.headers.filter(Boolean));
  rows.forEach((row) => Object.keys(row).forEach((key) => { if (!key.startsWith("__")) union.add(key); }));
  const headers = Array.from(union);
  if (!headers.length) return { updated: 0, appended: 0, headers: [] as string[] };
  const existingByKey = new Map<string, number>();
  current.rows.forEach((row, idx) => {
    const key = String(row._systemId || row["System ID"] || row["Evaluation ID"] || row["Tracking ID"] || row["PO Number"] || row["PO No."] || row["PRF No."] || row["SRF NO."] || "").trim();
    if (key) existingByKey.set(key, idx + 2);
  });
  const updates: Array<[number, string[]]> = [];
  const appends: string[][] = [];
  for (const row of rows) {
    const normalized = { ...row } as Record<string, unknown>;
    if (normalized._systemId === undefined && normalized.id !== undefined) normalized._systemId = normalized.id;
    const key = String(normalized._systemId || normalized["System ID"] || normalized.id || normalized["Tracking ID"] || normalized["PO Number"] || normalized["PO No."] || normalized["PRF No."] || normalized["SRF NO."] || "").trim();
    const values = headers.map(h => valueToString(normalized[h] ?? normalized[aliasFor(h)] ?? ""));
    const targetRow = Number(normalized.__targetRow || 0);
    const rowNumber = targetRow || (key ? existingByKey.get(key) : undefined);
    if (rowNumber) updates.push([rowNumber, values]); else appends.push(values);
  }
  await sheetsFetch(`${spreadsheetId}/values/${encodeURIComponent(title)}:A1`, { method: "PUT", body: JSON.stringify({ range: sheetA1Range(title, "A1"), majorDimension: "ROWS", values: [headers], valueInputOption: "USER_ENTERED" }) });

  // Google Sheets allows multiple explicit ranges in one values:batchUpdate call.
  // This is critical for large baselines (thousands of evaluations/routes):
  // one API request per row can make /api/sync take several minutes and cause
  // the browser to report `Failed to fetch`. Keep each batch reasonably small.
  for (let i = 0; i < updates.length; i += 250) {
    const chunk = updates.slice(i, i + 250);
    await sheetsFetch(`${spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({
        valueInputOption: "USER_ENTERED",
        data: chunk.map(([rowNumber, values]) => ({
          range: sheetA1Range(title, `A${rowNumber}:${columnLetter(headers.length)}${rowNumber}`),
          majorDimension: "ROWS",
          values: [values],
        })),
      }),
    });
  }

  if (appends.length) {
    await sheetsFetch(`${spreadsheetId}/values/${encodeURIComponent(title)}!A:A:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: "POST",
      body: JSON.stringify({ range: sheetA1Range(title, "A:A"), majorDimension: "ROWS", values: appends }),
    });
  }

  return { updated: updates.length, appended: appends.length, headers };
}

export async function upsertTabRows(spreadsheetId: string, title: string, rows: Record<string, unknown>[]) {
  return replaceOrUpsertFlatTab(spreadsheetId, title, rows);
}

function aliasFor(header: string) {
  const key = header.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aliases: Record<string, string> = {
    po: "poNumber", ponumber: "poNumber", pono: "poNumber", supplier: "vendorName", suppliername: "vendorName", vendor: "vendorName", vendorname: "vendorName",
    prf: "prfNo", prfno: "prfNo", srf: "srfNo", srfno: "srfNo", trackingid: "trackingId", email: "evaluatorEmail", evaluatoremail: "evaluatorEmail",
    status: "status", overallscore: "overallScore", submittedat: "submittedAt", updatedat: "updatedAt", sentat: "sentAt",
  };
  return aliases[key] || header;
}

function valueToString(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}
