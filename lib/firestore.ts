import {
  collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, setDoc, updateDoc,
  deleteDoc, where, limit, Timestamp
} from "firebase/firestore";
import { db } from "./firebase";

export type Role = "admin" | "purchasing" | "head" | "requisitioner" | "amd" | "approver" | "viewer";
export type UserProfile = { id: string; email: string; displayName: string; role: Role; active: boolean; department?: string; photoURL?: string };

export type PurchaseRequest = {
  id: string; prfNo: string; requester: string; department: string; purpose: string;
  items: string; priority: "Normal" | "Urgent"; status: string; createdAt: string;
  assignedTo?: string; remarks?: string; attachmentUrl?: string;
};

export type PurchaseOrderItem = { qty: number; unit: string; particulars: string; unitPrice: number };

export type PurchaseOrder = {
  id: string; poNumber: string; prfNo?: string; vendorId?: string; vendorName: string;
  supplierAddress?: string; supplierContact?: string; deliveryAddress: string; expectedDate?: string; deliveryDate?: string; actualDeliveryDate?: string;
  subtotal: number; discountPct: number; discountAmt: number; total: number;
  buyerName?: string; requisitioner?: string; requisitionerEmail?: string; purpose?: string; evaluatorRole?: "purchaser" | "requisitioner" | "amd"; autoSendEvaluation?: boolean;
  terms?: string; preparedBy?: string; approvedBy?: string; conformee?: string; items?: PurchaseOrderItem[];
  status: string; createdAt: string; receivedBy?: string; notes?: string; updatedAt?: string;
};

export type RouteHistoryEntry = {
  timestamp: string;
  action: string;
  status?: string;
  from?: string;
  to?: string;
  currentHolder?: string;
  actor?: string;
  remarks?: string;
};

export type RouteRecord = {
  id: string; trackingId: string; documentType: string; referenceNo: string; prfNo?: string; srfNo?: string; poNumber?: string;
  documentTitle?: string; requester?: string; department?: string; from?: string; to?: string;
  currentHolder?: string; status: string; dateRouted?: string; dateReceived?: string;
  receivedBy?: string; dateReturned?: string; remarks?: string; source?: string;
  history?: RouteHistoryEntry[];
  updatedAt: string; lastSyncedAt?: string; lastExportAt?: string; sourceHash?: string; sourceSheet?: string; sourceRow?: number;
};

export type Supplier = {
  id: string; name: string; contact?: string; email?: string; phone?: string; address?: string;
  city?: string; paymentTerms?: string; notes?: string; createdAt: string;
};

export type Buyer = { id: string; name: string; title?: string; email?: string; active?: boolean; createdAt?: string; updatedAt?: string };
export type Address = { id: string; name: string; address: string; active?: boolean; createdAt?: string; updatedAt?: string };
export type Employee = { id: string; name: string; email?: string; department?: string; title?: string; active?: boolean; createdAt?: string; updatedAt?: string };

export type SupplierEvaluation = {
  id: string; token: string; poNumber: string; prfNo?: string; vendorId?: string; vendorName: string;
  evaluatorName?: string; evaluatorEmail?: string; evaluatorRole: "purchaser" | "requisitioner" | "amd";
  status: "pending" | "sent" | "opened" | "submitted" | "overdue";
  sentAt?: string; submittedAt?: string; updatedAt?: string; lastExportAt?: string; sourceHash?: string; sourceSheet?: string; sourceRow?: number;
  accurateDelivery: number; competitivePrice: number; timeliness: number; afterSales: number; compliance: number;
  comments?: string; overallScore?: number; totalAmount?: number; deliveryDate?: string; expectedDeliveryDate?: string; actualDeliveryDate?: string;
};

export type DocumentRecord = {
  id: string; referenceNo: string; type: string; name: string; url: string; storageKey?: string;
  contentType?: string; size?: number; uploadedBy?: string; uploadedAt: string;
};

const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();

export function listenCollection<T>(name: string, onNext: (data: T[]) => void, onError?: (e: any) => void) {
  const q = query(collection(db, name), orderBy("updatedAt", "desc"));
  return onSnapshot(q, s => onNext(s.docs.map(d => ({ id: d.id, ...d.data() }) as T)), onError);
}

export async function getCollection<T>(name: string) {
  const snap = await getDocs(collection(db, name));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }) as T);
}

export async function saveEntity<T extends { id: string }>(name: string, value: T) {
  await setDoc(doc(db, name, value.id), { ...value, updatedAt: (value as any).updatedAt || now() }, { merge: true });
  return value;
}
export async function removeEntity(name: string, id: string) { await deleteDoc(doc(db, name, id)); }

export async function ensureProfile(user: any): Promise<UserProfile> {
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return { id: snap.id, ...snap.data() } as UserProfile;

  // Support admin pre-provisioning by email: if an administrator created
  // a profile for this email before the first login, carry its role/access
  // settings onto the authenticated uid instead of defaulting to purchasing.
  let role: Role = "purchasing";
  let active = true;
  let department = "";
  let displayName = user.displayName || user.email?.split("@")[0] || "User";
  if (user.email) {
    const pre = await getDocs(query(collection(db, "users"), where("email", "==", user.email), limit(1)));
    if (!pre.empty) {
      const data = pre.docs[0].data() as any;
      role = (data.role || "purchasing") as Role;
      active = data.active !== false;
      department = data.department || "";
      displayName = data.displayName || displayName;
      if (role === "admin" || active !== false) {
        await updateDoc(pre.docs[0].ref, { linkedUid: user.uid, lastLoginUid: user.uid, updatedAt: now() });
      }
    }
  }
  const profile: UserProfile = { id: user.uid, email: user.email || "", displayName, role, active, department };
  await setDoc(ref, profile);
  return profile;
}

export const getOpenRoutes = async () => (await getCollection<RouteRecord>("routes")).filter(r => !["Completed","Cancelled"].includes(r.status));
export const getPendingEvaluations = async () => (await getCollection<SupplierEvaluation>("evaluations")).filter(e => e.status !== "submitted");
