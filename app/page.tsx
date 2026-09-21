"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Archive,
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BellRing,
  Boxes,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  ClipboardList,
  Cloud,
  FileText,
  FolderOpen,
  Home,
  Mail,
  Menu,
  PackageCheck,
  Plus,
  RefreshCw,
  Route,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  Smartphone,
  Sparkles,
  Store,
  Truck,
  X,
  Zap
} from "lucide-react";

import * as XLSX from "xlsx";

import {
  subscribeAuth,
  signInGoogle,
  signInEmail,
  registerEmail,
  signOutApp,
  firebaseConfigured
} from "@/lib/firebase";

import {
  ensureProfile,
  listenCollection,
  getCollection,
  saveEntity,
  removeEntity,
  uid,
  type UserProfile,
  type Buyer,
  type Address,
  type Employee,
  type PurchaseRequest,
  type PurchaseOrder,
  type RouteRecord,
  type Supplier,
  type SupplierEvaluation,
  type DocumentRecord
} from "@/lib/firestore";

import { uploadDocument } from "@/lib/storage";
import PurchaseOrderPrint from "@/components/PurchaseOrderPrint";

type View =
  | "dashboard"
  | "requests"
  | "orders"
  | "routing"
  | "deliveries"
  | "evaluations"
  | "suppliers"
  | "documents"
  | "reports"
  | "sync"
  | "settings"
  | "admin";

/* =========================================================
   MAIN APP
========================================================= */

export default function HomePage() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const [view, setView] =
    useState<View>("dashboard");

  const [workspaceMode, setWorkspaceMode] =
    useState<"user" | "admin">("user");

  const [adminSection, setAdminSection] =
    useState<AdminSection>("dashboard");

  const [mobileOpen, setMobileOpen] =
    useState(false);

  const [installable, setInstallable] =
    useState(false);

  const [syncing, setSyncing] =
    useState(false);

  const [toast, setToast] =
    useState("");

  const [routes, setRoutes] =
    useState<RouteRecord[]>([]);

  const [requests, setRequests] =
    useState<PurchaseRequest[]>([]);

  const [orders, setOrders] =
    useState<PurchaseOrder[]>([]);

  const [evals, setEvals] =
    useState<SupplierEvaluation[]>([]);

  const [suppliers, setSuppliers] =
    useState<Supplier[]>([]);

  const [docs, setDocs] =
    useState<DocumentRecord[]>([]);

  /* -------------------------------------------------------
     TOAST
  ------------------------------------------------------- */

  function notify(message: string) {
    setToast(message);

    window.setTimeout(() => {
      setToast((current) =>
        current === message ? "" : current
      );
    }, 3500);
  }

  /* -------------------------------------------------------
     FIREBASE AUTHENTICATION
  ------------------------------------------------------- */

  useEffect(() => {
    const unsubscribe = subscribeAuth(async (firebaseUser) => {
      setUser(firebaseUser);

      if (!firebaseUser) {
        setProfile(null);
        return;
      }

      try {
        const nextProfile =
          await ensureProfile(firebaseUser);

        setProfile(nextProfile);
        if (nextProfile.role === "admin") setWorkspaceMode("admin");
      } catch (error) {
        console.error(
          "Could not load Firebase profile:",
          error
        );

        /*
         * Fallback profile.
         *
         * This prevents the application from crashing
         * when Firestore is temporarily unavailable.
         */
        setProfile({
          id: firebaseUser.uid,
          email: firebaseUser.email || "",
          displayName:
            firebaseUser.displayName ||
            firebaseUser.email?.split("@")[0] ||
            "Purchasing User",
          photoURL:
            firebaseUser.photoURL || "",
          role: "viewer",
          active: true
        });
      }
    });

    /* -----------------------------------------------------
       PWA INSTALL PROMPT
    ----------------------------------------------------- */

    const installHandler = (event: Event) => {
      const installEvent = event as Event & {
        prompt?: () => Promise<void>;
        userChoice?: Promise<unknown>;
      };

      installEvent.preventDefault();

      (window as any).__pwaEvent =
        installEvent;

      setInstallable(true);
    };

    window.addEventListener(
      "beforeinstallprompt",
      installHandler
    );

    /* -----------------------------------------------------
       SERVICE WORKER
    ----------------------------------------------------- */

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => {
          console.log(
            "Purchasing Management System service worker registered."
          );
        })
        .catch((error) => {
          console.error(
            "Service worker registration failed:",
            error
          );
        });
    }

    return () => {
      unsubscribe();

      window.removeEventListener(
        "beforeinstallprompt",
        installHandler
      );
    };
  }, []);

  /* -------------------------------------------------------
     FIRESTORE REAL-TIME LISTENERS
  ------------------------------------------------------- */

  useEffect(() => {
    if (!user) return;

    const unsubscribeRequests =
      listenCollection<PurchaseRequest>(
        "purchaseRequests",
        setRequests,
        (error) =>
          console.error(
            "Purchase request listener:",
            error
          )
      );

    const unsubscribeOrders =
      listenCollection<PurchaseOrder>(
        "purchaseOrders",
        setOrders,
        (error) =>
          console.error(
            "Purchase order listener:",
            error
          )
      );

    const unsubscribeRoutes =
      listenCollection<RouteRecord>(
        "routes",
        setRoutes,
        (error) =>
          console.error(
            "Route listener:",
            error
          )
      );

    const unsubscribeEvaluations =
      listenCollection<SupplierEvaluation>(
        "evaluations",
        setEvals,
        (error) =>
          console.error(
            "Evaluation listener:",
            error
          )
      );

    const unsubscribeSuppliers =
      listenCollection<Supplier>(
        "suppliers",
        setSuppliers,
        (error) =>
          console.error(
            "Supplier listener:",
            error
          )
      );

    const unsubscribeDocuments =
      listenCollection<DocumentRecord>(
        "documents",
        setDocs,
        (error) =>
          console.error(
            "Document listener:",
            error
          )
      );

    /* -----------------------------------------------------
       AUTOMATIC MONITORING SYNC
       Run once on workspace load, then every 15 minutes.
    ----------------------------------------------------- */

    const initialSync = window.setTimeout(() => { void syncNow(true); }, 1200);
    const timer = window.setInterval(() => {
      void syncNow(true);
    }, 15 * 60 * 1000);

    return () => {
      try {
        unsubscribeRequests();
      } catch {}

      try {
        unsubscribeOrders();
      } catch {}

      try {
        unsubscribeRoutes();
      } catch {}

      try {
        unsubscribeEvaluations();
      } catch {}

      try {
        unsubscribeSuppliers();
      } catch {}

      try {
        unsubscribeDocuments();
      } catch {}

      window.clearTimeout(initialSync);
      window.clearInterval(timer);
    };
  }, [user]);

  /* -------------------------------------------------------
     GOOGLE SHEET / ROUTETRACK SYNC
  ------------------------------------------------------- */

  async function syncNow(
    silent = false
  ) {
    setSyncing(true);

    try {
      /*
       * IMPORTANT:
       * Do not expose CRON_SECRET or any secret
       * using NEXT_PUBLIC_* variables in the browser.
       */
      const response = await fetch(
        "/api/sync",
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json"
          }
        }
      );

      const contentType =
        response.headers.get(
          "content-type"
        ) || "";

      const responseText =
        await response.text();

      /*
       * Prevent:
       * Unexpected token '<', "<!DOCTYPE..."
       */
      if (
        !contentType.includes(
          "application/json"
        )
      ) {
        console.error(
          "Sync API returned non-JSON:",
          responseText.slice(0, 1000)
        );

        throw new Error(
          `Sync API returned ${response.status} ${response.statusText}.`
        );
      }

      let data: any;

      try {
        data = JSON.parse(
          responseText
        );
      } catch (error) {
        console.error(
          "Invalid JSON returned by sync API:",
          error
        );

        throw new Error(
          "Sync API returned invalid JSON."
        );
      }

      if (
        !response.ok ||
        !data?.ok
      ) {
        throw new Error(
          data?.message ||
            "Spreadsheet synchronization failed."
        );
      }

      if (!silent) {
        notify(
          `Sync completed: ${data.evaluationRecordsImported ?? 0} evaluation rows, ${data.prfRecordsImported ?? 0} PRF rows and ${data.routeRecordsImported ?? 0} route rows imported; ${data.evaluationSheet?.updated ?? 0} evaluation, ${data.prfSheet?.updated ?? 0} PRF and ${data.routingSheet?.updated ?? 0} routing rows updated.`
        );
      }
    } catch (error: any) {
      console.error(
        "Monitoring synchronization failed:",
        error
      );

      if (!silent) {
        notify(
          error?.message ||
            "Synchronization failed."
        );
      }
    } finally {
      setSyncing(false);
    }
  }

  /* -------------------------------------------------------
     PWA INSTALL
  ------------------------------------------------------- */

  async function installApp() {
    const event = (window as any)
      .__pwaEvent;

    if (!event) return;

    try {
      if (
        typeof event.prompt ===
        "function"
      ) {
        await event.prompt();
      }

      if (event.userChoice) {
        await event.userChoice;
      }
    } catch (error) {
      console.error(
        "PWA installation failed:",
        error
      );
    } finally {
      (window as any).__pwaEvent =
        null;

      setInstallable(false);
    }
  }

  /* -------------------------------------------------------
     FIREBASE CONFIG CHECK
  ------------------------------------------------------- */

  if (!firebaseConfigured()) {
    return <SetupScreen />;
  }

  /* -------------------------------------------------------
     AUTHENTICATION
  ------------------------------------------------------- */

  if (!user) {
    return (
      <Auth
        onGoogle={signInGoogle}
        onEmail={signInEmail}
        onRegister={registerEmail}
      />
    );
  }

  /* -------------------------------------------------------
     NAVIGATION
  ------------------------------------------------------- */

  function navigate(
    nextView: View
  ) {
    setView(nextView);
    setMobileOpen(false);
  }

  /* -------------------------------------------------------
     DASHBOARD COUNTERS
  ------------------------------------------------------- */

  const pendingRoutes =
    routes.filter(
      (route) =>
        ![
          "Completed",
          "Cancelled"
        ].includes(route.status)
    ).length;

  const overdue =
    routes.filter(
      (route) =>
        route.status === "Overdue"
    ).length;

  const pendingEvaluations =
    evals.filter(
      (evaluation) =>
        !["submitted", "completed", "evaluated"].includes(String(evaluation.status || "").toLowerCase())
    ).length;

  const delivered =
    orders.filter(
      (order) =>
        order.status ===
          "Delivered" ||
        order.status ===
          "Completed"
    ).length;

  if (profile?.role === "admin" && workspaceMode === "admin") {
    return (
      <AdminShell
        profile={profile}
        routes={routes}
        evals={evals}
        orders={orders}
        requests={requests}
        suppliers={suppliers}
        onError={notify}
        onSync={() => void syncNow()}
        syncing={syncing}
        onOpenUserWorkspace={(targetView = "dashboard") => { setView(targetView); setWorkspaceMode("user"); }}
      />
    );
  }

  return (
    <div className="app">

      {/* =====================================================
          SIDEBAR
      ===================================================== */}

      <aside
        className={`sidebar ${
          mobileOpen
            ? "open"
            : ""
        }`}
      >
        <div className="brand">
          <div className="brand-logo">
            <img
              src="/icon.svg"
              alt=""
            />
          </div>

          <div>
            <b>Purchasing</b>
            <span>
              Management System
            </span>
          </div>
        </div>

        <div className="workspace-pill">
          <span className="live-dot" />
          LIVE WORKSPACE
        </div>

        <nav>

          <Nav
            label="Overview"
            icon={<Home />}
            active={
              view ===
              "dashboard"
            }
            onClick={() =>
              navigate(
                "dashboard"
              )
            }
          />

          <Nav
            label="Purchase Requests"
            icon={
              <ClipboardList />
            }
            active={
              view ===
              "requests"
            }
            onClick={() =>
              navigate(
                "requests"
              )
            }
          />

          <Nav
            label="Purchase Orders"
            icon={<FileText />}
            active={
              view ===
              "orders"
            }
            onClick={() =>
              navigate(
                "orders"
              )
            }
          />

          <Nav
            label="Routing & Monitoring"
            icon={<Route />}
            active={
              view ===
              "routing"
            }
            onClick={() =>
              navigate(
                "routing"
              )
            }
            badge={
              overdue ||
              undefined
            }
          />

          <Nav
            label="Deliveries"
            icon={<Truck />}
            active={
              view ===
              "deliveries"
            }
            onClick={() =>
              navigate(
                "deliveries"
              )
            }
          />

          <Nav
            label="Supplier Evaluation"
            icon={
              <ClipboardCheck />
            }
            active={
              view ===
              "evaluations"
            }
            onClick={() =>
              navigate(
                "evaluations"
              )
            }
            badge={
              pendingEvaluations ||
              undefined
            }
          />

          <Nav
            label="Suppliers"
            icon={<Store />}
            active={
              view ===
              "suppliers"
            }
            onClick={() =>
              navigate(
                "suppliers"
              )
            }
          />

          <Nav
            label="Documents"
            icon={
              <FolderOpen />
            }
            active={
              view ===
              "documents"
            }
            onClick={() =>
              navigate(
                "documents"
              )
            }
          />

          <Nav
            label="Reports & Analytics"
            icon={
              <BarChart3 />
            }
            active={
              view ===
              "reports"
            }
            onClick={() =>
              navigate(
                "reports"
              )
            }
          />

          <div className="nav-sep" />

          <Nav
            label="Spreadsheet Sync"
            icon={
              <RefreshCw />
            }
            active={
              view ===
              "sync"
            }
            onClick={() =>
              navigate(
                "sync"
              )
            }
          />

          {profile?.role === "admin" && (
            <Nav
              label="Open Admin Console"
              icon={<ShieldCheck />}
              active={false}
              onClick={() => setWorkspaceMode("admin")}
            />
          )}

          <Nav
            label="Settings"
            icon={
              <Settings />
            }
            active={
              view ===
              "settings"
            }
            onClick={() =>
              navigate(
                "settings"
              )
            }
          />

        </nav>

        <div className="side-foot">
          <ShieldCheck />
          <span>
            Firebase cloud storage
          </span>
        </div>
      </aside>

      {/* =====================================================
          MAIN
      ===================================================== */}

      <main className="main">

        <header className="topbar">

          <div className="top-left">

            <button
              className="icon-btn"
              onClick={() =>
                setMobileOpen(
                  (current) =>
                    !current
                )
              }
              type="button"
            >
              <Menu />
            </button>

            <div>
              <div className="crumb">
                Purchasing Management System
              </div>

              <h1>
                {title(view)}
              </h1>
            </div>

          </div>

          <div className="top-actions">

            {installable && (
              <button
                className="btn ghost"
                onClick={() =>
                  void installApp()
                }
                type="button"
              >
                <Smartphone />
                Install App
              </button>
            )}

            <button
              className="icon-btn"
              onClick={() =>
                void syncNow()
              }
              title="Sync monitoring sheet"
              type="button"
            >
              <RefreshCw
                className={
                  syncing
                    ? "spin"
                    : ""
                }
              />
            </button>

            <div className="user">

              <div className="avatar">
                {(
                  profile?.displayName ||
                  user.email ||
                  "U"
                )
                  .slice(0, 1)
                  .toUpperCase()}
              </div>

              <span>
                {profile?.displayName ||
                  user.email ||
                  "Purchasing User"}
              </span>

              <button
                onClick={() =>
                  void signOutApp()
                }
                type="button"
              >
                Sign out
              </button>

            </div>

          </div>

        </header>

        <div className="content">

          {view ===
            "dashboard" && (
            <Dashboard
              pendingRoutes={
                pendingRoutes
              }
              overdue={
                overdue
              }
              pendingEval={
                pendingEvaluations
              }
              delivered={
                delivered
              }
              requests={
                requests
              }
              orders={
                orders
              }
              routes={
                routes
              }
              evals={
                evals
              }
              onNewRequest={() =>
                navigate(
                  "requests"
                )
              }
              onNewPO={() =>
                navigate(
                  "orders"
                )
              }
              onSync={() =>
                void syncNow()
              }
            />
          )}

          {view ===
            "requests" && (
            <CrudPage
              title="Purchase Requests"
              icon={
                <ClipboardList />
              }
              empty="No purchase requests yet."
              button="New Request"
              fields={[
                [
                  "prfNo",
                  "PRF / SRF No."
                ],
                [
                  "requester",
                  "Requisitioner"
                ],
                [
                  "department",
                  "Department"
                ],
                [
                  "purpose",
                  "Purpose"
                ],
                [
                  "items",
                  "Items"
                ],
                [
                  "priority",
                  "Priority"
                ]
              ]}
              collection="purchaseRequests"
              onSaved={(item) =>
                saveEntity(
                  "purchaseRequests",
                  item
                )
              }
              onError={notify}
            />
          )}

          {view ===
            "orders" && (
            <OrdersPage
              orders={
                orders
              }
              suppliers={
                suppliers
              }
              onSave={(item) =>
                saveEntity(
                  "purchaseOrders",
                  item
                )
              }
              onDelete={(id) =>
                removeEntity(
                  "purchaseOrders",
                  id
                )
              }
              onError={notify}
            />
          )}

          {view ===
            "routing" && (
            <RoutingPage
              routes={
                routes
              }
              onSave={(item) =>
                saveEntity(
                  "routes",
                  item
                )
              }
              onDelete={(id) =>
                removeEntity(
                  "routes",
                  id
                )
              }
              onSync={() =>
                void syncNow()
              }
              onError={notify}
            />
          )}

          {view ===
            "deliveries" && (
            <DeliveriesPage
              orders={
                orders
              }
              onSave={(item) =>
                saveEntity(
                  "purchaseOrders",
                  item
                )
              }
              onError={notify}
            />
          )}

          {view ===
            "evaluations" && (
            <EvaluationsPage
              evals={
                evals
              }
              orders={
                orders
              }
              onSave={(item) =>
                saveEntity(
                  "evaluations",
                  item
                )
              }
              onError={notify}
            />
          )}

          {view ===
            "suppliers" && (
            <SuppliersPage
              suppliers={
                suppliers
              }
              onSave={(item) =>
                saveEntity(
                  "suppliers",
                  item
                )
              }
              onDelete={(id) =>
                removeEntity(
                  "suppliers",
                  id
                )
              }
              onError={notify}
            />
          )}

          {view ===
            "documents" && (
            <DocumentsPage
              docs={docs}
              onError={notify}
            />
          )}

          {view ===
            "reports" && (
            <ReportsPage
              requests={
                requests
              }
              orders={
                orders
              }
              routes={
                routes
              }
              evals={
                evals
              }
            />
          )}

          {view ===
            "sync" && (
            <SyncPage
              routes={
                routes
              }
              onSync={() =>
                void syncNow()
              }
              syncing={
                syncing
              }
            />
          )}

          {view ===
            "admin" &&
            profile?.role === "admin" && (
            <AdminOperations
              section={adminSection}
              onSectionChange={setAdminSection}
              routes={routes}
              evals={evals}
              orders={orders}
              requests={requests}
              suppliers={suppliers}
              profile={profile}
              onError={notify}
              onNavigate={navigate}
              onSync={() => void syncNow()}
              syncing={syncing}
            />
          )}

          {view ===
            "settings" && (
            <SettingsPage
              profile={
                profile
              }
            />
          )}

        </div>
      </main>

      {/* =====================================================
          TOAST
      ===================================================== */}

      {toast && (
        <div className="toast">

          <span>{toast}</span>

          <button
            onClick={() =>
              setToast("")
            }
            type="button"
          >
            <X />
          </button>

        </div>
      )}

    </div>
  );
}

/* =========================================================
   TITLE
========================================================= */

function title(
  view: View
) {
  const titles: Record<
    View,
    string
  > = {
    dashboard:
      "Overview",

    requests:
      "Purchase Requests",

    orders:
      "Purchase Orders",

    routing:
      "Routing & Monitoring",

    deliveries:
      "Deliveries & Receiving",

    evaluations:
      "Supplier Evaluation",

    suppliers:
      "Supplier Directory",

    documents:
      "Document Center",

    reports:
      "Reports & Analytics",

    sync:
      "Spreadsheet Sync",

    admin:
      "Admin Console",

    settings:
      "Workspace Settings"
  };

  return titles[view];
}

/* =========================================================
   NAVIGATION ITEM
========================================================= */

function Nav({
  label,
  icon,
  active,
  onClick,
  badge
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      className={`nav ${
        active
          ? "active"
          : ""
      }`}
      onClick={onClick}
      type="button"
    >
      {icon}

      <span>{label}</span>

      {badge ? (
        <em>{badge}</em>
      ) : null}
    </button>
  );
}

/* =========================================================
   SETUP SCREEN
========================================================= */

function SetupScreen() {
  return (
    <div className="setup">

      <div className="setup-card">

        <img
          src="/icon.svg"
          alt="Purchasing Management System"
        />

        <h1>
          Purchasing Management System
        </h1>

        <p>
          Firebase is not configured
          yet. Copy{" "}
          <b>.env.example</b> to{" "}
          <b>.env.local</b> and add
          your Firebase Web App
          settings.
        </p>

      </div>

    </div>
  );
}

/* =========================================================
   AUTH
========================================================= */

function Auth({
  onGoogle,
  onEmail,
  onRegister
}: {
  onGoogle:
    () => Promise<any>;

  onEmail:
    (
      email: string,
      password: string
    ) => Promise<any>;

  onRegister:
    (
      email: string,
      password: string
    ) => Promise<any>;
}) {
  const [email, setEmail] =
    useState("");

  const [password, setPassword] =
    useState("");

  const [register, setRegister] =
    useState(false);

  const [error, setError] =
    useState("");

  const [busy, setBusy] =
    useState(false);

  async function submit() {
    if (busy) return;

    setError("");

    if (!email.trim()) {
      setError(
        "Please enter your email."
      );
      return;
    }

    if (!password) {
      setError(
        "Please enter your password."
      );
      return;
    }

    setBusy(true);

    try {
      if (register) {
        await onRegister(
          email.trim(),
          password
        );
      } else {
        await onEmail(
          email.trim(),
          password
        );
      }
    } catch (error: any) {
      console.error(
        "Authentication error:",
        error
      );

      setError(
        error?.message ||
          "Authentication failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function googleLogin() {
    if (busy) return;

    setBusy(true);
    setError("");

    try {
      await onGoogle();
    } catch (error: any) {
      console.error(
        "Google sign-in error:",
        error
      );

      setError(
        error?.message ||
          "Google sign-in failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">

      <div className="auth-glow" />

      <div className="auth-card">

        <div className="brand-center">

          <img
            src="/icon.svg"
            alt=""
          />

          <span>
            Purchasing Management System
          </span>

        </div>

        <h1>
          {register
            ? "Create your account"
            : "Welcome back"}
        </h1>

        <p>
          One workspace for purchasing,
          routing, delivery and supplier
          performance.
        </p>

        <button
          className="google-btn"
          onClick={() =>
            void googleLogin()
          }
          disabled={busy}
          type="button"
        >
          {busy
            ? "Please wait..."
            : "Continue with Google"}
        </button>

        <div className="or">
          <span />
          or
          <span />
        </div>

        <input
          className="field"
          type="email"
          value={email}
          onChange={(event) =>
            setEmail(
              event.target.value
            )
          }
          placeholder="Work email"
          autoComplete="email"
          disabled={busy}
        />

        <input
          className="field"
          type="password"
          value={password}
          onChange={(event) =>
            setPassword(
              event.target.value
            )
          }
          placeholder="Password"
          autoComplete={
            register
              ? "new-password"
              : "current-password"
          }
          disabled={busy}
        />

        {error && (
          <div className="error">
            {error}
          </div>
        )}

        <button
          className="btn primary full"
          onClick={() =>
            void submit()
          }
          disabled={busy}
          type="button"
        >
          {busy
            ? "Please wait..."
            : register
              ? "Create account"
              : "Sign in"}
        </button>

        <button
          className="text-btn"
          onClick={() => {
            setError("");

            setRegister(
              (current) =>
                !current
            );
          }}
          disabled={busy}
          type="button"
        >
          {register
            ? "Already have an account? Sign in"
            : "Need an account? Register"}
        </button>

      </div>
    </div>
  );
}

/* =========================================================
   DASHBOARD
========================================================= */

function Dashboard({
  pendingRoutes,
  overdue,
  pendingEval,
  delivered,
  requests,
  orders,
  routes,
  evals,
  onNewRequest,
  onNewPO,
  onSync
}: {
  pendingRoutes: number;
  overdue: number;
  pendingEval: number;
  delivered: number;
  requests: PurchaseRequest[];
  orders: PurchaseOrder[];
  routes: RouteRecord[];
  evals: SupplierEvaluation[];
  onNewRequest: () => void;
  onNewPO: () => void;
  onSync: () => void;
}) {
  const totalValue =
    orders.reduce(
      (sum, order) =>
        sum +
        Number(
          order.total || 0
        ),
      0
    );

  return (
    <div className="page">

      <section className="hero-card">

        <div>

          <div className="eyebrow">
            PURCHASING OPERATIONS
          </div>

          <h2>
            Everything in one
            purchasing workspace.
          </h2>

          <p>
            Track requests, purchase
            orders, routed documents,
            deliveries and supplier
            evaluations from one
            professional workspace.
          </p>

          <div className="hero-actions">

            <button
              className="btn primary"
              onClick={onNewRequest}
              type="button"
            >
              <Plus />
              New Request
            </button>

            <button
              className="btn soft"
              onClick={onNewPO}
              type="button"
            >
              <FileText />
              New PO
            </button>

            <button
              className="btn ghost"
              onClick={onSync}
              type="button"
            >
              <RefreshCw />
              Sync Monitor
            </button>

          </div>

        </div>

        <div className="hero-art">

          <div className="orbit" />

          <div className="hero-icon">
            <Zap />
          </div>

          <span className="float f1">
            <Route />
            Routing
          </span>

          <span className="float f2">
            <ClipboardCheck />
            Evaluations
          </span>

        </div>

      </section>

      <div className="stats">

        {[
          [
            "Purchase Requests",
            requests.length,
            ClipboardList
          ],
          [
            "Purchase Orders",
            orders.length,
            FileText
          ],
          [
            "PO Value",
            `₱${totalValue.toLocaleString(
              undefined,
              {
                maximumFractionDigits: 0
              }
            )}`,
            Boxes
          ],
          [
            "Open Routes",
            pendingRoutes,
            Route
          ],
          [
            "Overdue",
            overdue,
            Bell
          ],
          [
            "Pending Evaluations",
            pendingEval,
            ClipboardCheck
          ],
          [
            "Delivered",
            delivered,
            PackageCheck
          ]
        ].map(
          ([label, value, Icon], index) => {
            const IconComponent =
              Icon as React.ElementType;

            return (
              <div
                className={`stat ${
                  index === 4 &&
                  overdue
                    ? "danger"
                    : ""
                }`}
                key={String(label)}
              >
                <div className="stat-icon">
                  <IconComponent />
                </div>

                <div className="stat-label">
                  {String(label)}
                </div>

                <div className="stat-value">
                  {String(value)}
                </div>
              </div>
            );
          }
        )}

      </div>

      <div className="grid-2">

        <section className="card">

          <div className="card-head">

            <div>
              <b>
                Recent Routing Activity
              </b>

              <span>
                Latest monitoring records
              </span>
            </div>

            <Route className="muted" />

          </div>

          {routes
            .slice(0, 6)
            .map((route) => (
              <div
                className="timeline-row"
                key={route.id}
              >

                <div className="status-dot" />

                <div>

                  <b>
                    {route.documentType}
                    {" · "}
                    {route.referenceNo ||
                      route.trackingId}
                  </b>

                  <span>
                    {route.currentHolder ||
                      route.to ||
                      "Purchasing"}
                    {" · "}
                    {route.status}
                  </span>

                </div>

                <small>
                  {route.updatedAt
                    ?.slice(0, 16)
                    .replace(
                      "T",
                      " "
                    )}
                </small>

              </div>
            ))}

          {!routes.length && (
            <Empty text="No routing activity yet." />
          )}

        </section>

        <section className="card">

          <div className="card-head">

            <div>
              <b>
                Supplier Evaluation Queue
              </b>

              <span>
                Pending and recently
                submitted
              </span>
            </div>

            <ClipboardCheck className="muted" />

          </div>

          {evals
            .slice(0, 6)
            .map((evaluation) => (
              <div
                className="list-row"
                key={
                  evaluation.id
                }
              >

                <div className="round-icon">
                  <Store />
                </div>

                <div>

                  <b>
                    {
                      evaluation.vendorName
                    }
                  </b>

                  <span>
                    PO{" "}
                    {
                      evaluation.poNumber
                    }
                    {" · "}
                    {
                      evaluation.status
                    }
                  </span>

                </div>

                <span
                  className={`badge ${
                    evaluation.status ===
                    "submitted"
                      ? "green"
                      : "amber"
                  }`}
                >
                  {
                    evaluation.status
                  }
                </span>

              </div>
            ))}

          {!evals.length && (
            <Empty text="No evaluations yet." />
          )}

        </section>

      </div>

    </div>
  );
}

/* =========================================================
   GENERIC PURCHASE REQUEST PAGE
========================================================= */

function CrudPage({
  title: pageTitle,
  icon,
  empty,
  button,
  fields,
  collection,
  onSaved,
  onError
}: {
  title: string;
  icon: ReactNode;
  empty: string;
  button: string;
  fields: [string, string][];
  collection: string;
  onSaved: (
    item: any
  ) => Promise<any>;
  onError: (
    message: string
  ) => void;
}) {
  const [items, setItems] =
    useState<any[]>([]);

  const [open, setOpen] =
    useState(false);

  const [draft, setDraft] =
    useState<any>({});

  useEffect(() => {
    return listenCollection<any>(
      collection,
      setItems,
      (error) => {
        console.error(
          `Error loading ${collection}:`,
          error
        );

        onError(
          `Could not load ${collection}.`
        );
      }
    );
  }, [
    collection,
    onError
  ]);

  async function save() {
    try {
      const item = {
        id:
          draft.id ||
          uid(),

        ...draft,

        status:
          draft.status ||
          "Submitted",

        createdAt:
          draft.createdAt ||
          new Date().toISOString(),

        updatedAt:
          new Date().toISOString()
      };

      await onSaved(item);

      setOpen(false);
      setDraft({});

      onError(
        "Purchase request saved successfully."
      );
    } catch (error: any) {
      console.error(
        "Could not save purchase request:",
        error
      );

      onError(
        error?.message ||
          "Could not save purchase request."
      );
    }
  }

  return (
    <div className="page">

      <PageHead
        title={pageTitle}
        icon={icon}
        action={
          <button
            className="btn primary"
            onClick={() =>
              setOpen(true)
            }
            type="button"
          >
            <Plus />
            {button}
          </button>
        }
      />

      <div className="card">

        <div className="table-wrap">

          <table>

            <thead>

              <tr>

                {fields.map(
                  ([key, label]) => (
                    <th key={key}>
                      {label}
                    </th>
                  )
                )}

                <th>Status</th>

              </tr>

            </thead>

            <tbody>

              {items.map(
                (item) => (
                  <tr key={item.id}>

                    {fields.map(
                      ([key]) => (
                        <td key={key}>
                          {item[key] ||
                            "—"}
                        </td>
                      )
                    )}

                    <td>
                      <span className="badge blue">
                        {item.status ||
                          "Submitted"}
                      </span>
                    </td>

                  </tr>
                )
              )}

            </tbody>

          </table>

          {!items.length && (
            <Empty text={empty} />
          )}

        </div>

      </div>

      {open && (
        <Modal
          title={button}
          onClose={() =>
            setOpen(false)
          }
        >

          <div className="form-grid">

            {fields.map(
              ([key, label]) => (
                <label
                  className="form-label"
                  key={key}
                >

                  {label}

                  <input
                    className="field"
                    value={
                      draft[key] ||
                      ""
                    }
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        [key]:
                          event.target.value
                      })
                    }
                  />

                </label>
              )
            )}

          </div>

          <div className="modal-actions">

            <button
              className="btn ghost"
              onClick={() =>
                setOpen(false)
              }
              type="button"
            >
              Cancel
            </button>

            <button
              className="btn primary"
              onClick={() =>
                void save()
              }
              type="button"
            >
              Save
            </button>

          </div>

        </Modal>
      )}

    </div>
  );
}

/* =========================================================
   PURCHASE ORDERS
========================================================= */

function OrdersPage({
  orders,
  suppliers,
  onSave,
  onDelete,
  onError
}: {
  orders: PurchaseOrder[];
  suppliers: Supplier[];
  onSave: (item: any) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
  onError: (message: string) => void;
}) {
  const blankItem = { qty: 1, unit: "PCS", particulars: "", unitPrice: 0 };
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>({ status: "Draft", items: [blankItem] });
  const [printOrder, setPrintOrder] = useState<PurchaseOrder | null>(null);
  const [sendingEval, setSendingEval] = useState<string | null>(null);

  function updateItem(index: number, patch: Record<string, unknown>) {
    setDraft((current: any) => ({
      ...current,
      items: (current.items || []).map((item: any, i: number) => i === index ? { ...item, ...patch } : item)
    }));
  }

  function calculatedSubtotal(items: any[]) {
    return items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0), 0);
  }

  async function dispatchEvaluation(order: PurchaseOrder) {
    const email = String(order.requisitionerEmail || order.receivedBy || "").trim();
    if (!email) {
      onError("PO saved, but no requisitioner/evaluator email is configured.");
      return;
    }
    setSendingEval(order.id);
    try {
      const response = await fetch("/api/evaluation/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          poNumber: order.poNumber,
          prfNo: order.prfNo,
          vendorName: order.vendorName,
          evaluatorName: order.requisitioner,
          evaluatorRole: order.evaluatorRole || "requisitioner",
          expectedDeliveryDate: order.expectedDate,
          actualDeliveryDate: order.actualDeliveryDate,
          totalAmount: order.total,
        }),
      });
      const result = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Could not send supplier evaluation.");
      onError(result.sent ? `Supplier evaluation automatically sent to ${email}.` : `Evaluation created. Email is not configured; link: ${result.link}`);
    } catch (error: any) {
      onError(error?.message || "Could not send supplier evaluation.");
    } finally {
      setSendingEval(null);
    }
  }

  async function save() {
    try {
      const items = (draft.items || []).filter((item: any) => String(item.particulars || "").trim());
      const subtotal = calculatedSubtotal(items) || Number(draft.subtotal || 0);
      const discountPct = Number(draft.discountPct || 0);
      const discountAmt = (subtotal * discountPct) / 100;
      const saved: PurchaseOrder = {
        id: draft.id || uid(),
        poNumber: draft.poNumber || `PO-${Date.now()}`,
        prfNo: draft.prfNo || "",
        vendorName: draft.vendorName || "",
        supplierAddress: draft.supplierAddress || "",
        supplierContact: draft.supplierContact || "",
        deliveryAddress: draft.deliveryAddress || "",
        expectedDate: draft.expectedDate || "",
        deliveryDate: draft.deliveryDate || draft.expectedDate || "",
        actualDeliveryDate: draft.actualDeliveryDate || "",
        subtotal,
        discountPct,
        discountAmt,
        total: subtotal - discountAmt,
        buyerName: draft.buyerName || "",
        requisitioner: draft.requisitioner || "",
        requisitionerEmail: draft.requisitionerEmail || "",
        purpose: draft.purpose || "",
        evaluatorRole: draft.evaluatorRole || "requisitioner",
        autoSendEvaluation: Boolean(draft.autoSendEvaluation),
        terms: draft.terms || "50% DP 50% FD",
        preparedBy: draft.preparedBy || draft.buyerName || "",
        approvedBy: draft.approvedBy || "",
        conformee: draft.conformee || "",
        items: items.length ? items : [blankItem],
        notes: draft.notes || "",
        status: draft.status || "Draft",
        receivedBy: draft.receivedBy || draft.requisitionerEmail || "",
        createdAt: draft.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await onSave(saved);
      setOpen(false);
      setDraft({ status: "Draft", items: [blankItem] });
      onError("Purchase order saved successfully.");

      if (saved.autoSendEvaluation && ["Delivered", "Received", "Completed"].includes(saved.status)) {
        await dispatchEvaluation(saved);
      }
    } catch (error: any) {
      console.error("Could not save purchase order:", error);
      onError(error?.message || "Could not save purchase order.");
    }
  }

  async function remove(id: string) {
    try {
      await onDelete(id);
      onError("Purchase order deleted.");
    } catch (error: any) {
      onError(error?.message || "Could not delete purchase order.");
    }
  }

  function openNew() {
    setDraft({
      status: "Draft",
      items: [{ ...blankItem }],
      terms: "50% DP 50% FD",
      autoSendEvaluation: true,
      evaluatorRole: "requisitioner"
    });
    setOpen(true);
  }

  function openPrint(order: PurchaseOrder) {
    setPrintOrder(order);
  }

  return (
    <div className="page">
      <PageHead
        title="Purchase Orders"
        icon={<FileText />}
        action={<button className="btn primary" onClick={openNew} type="button"><Plus /> New PO</button>}
      />

      <div className="info-strip">
        <FileText />
        <div>
          <b>PO document format locked to the supplied original</b>
          <span>Print / Save PDF reproduces the same single-page structure, column order and signature areas.</span>
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead><tr><th>PO Number</th><th>Supplier</th><th>Requisitioner</th><th>Delivery</th><th>Total</th><th>Status</th><th>Evaluation</th><th>Actions</th></tr></thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id}>
                  <td><b className="mono">{order.poNumber}</b></td>
                  <td>{order.vendorName}</td>
                  <td>{order.requisitioner || "—"}</td>
                  <td>{order.actualDeliveryDate || order.expectedDate || "—"}</td>
                  <td>₱{Number(order.total || 0).toLocaleString("en-PH", { minimumFractionDigits: 2 })}</td>
                  <td><span className="badge blue">{order.status}</span></td>
                  <td>
                    {order.requisitionerEmail ? (
                      <button className="btn xs" disabled={sendingEval === order.id} onClick={() => void dispatchEvaluation(order)} type="button">
                        {sendingEval === order.id ? "Sending…" : "Send / Resend"}
                      </button>
                    ) : <span style={{fontSize:11,color:"#9ca3af"}}>No email</span>}
                  </td>
                  <td style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                    <button className="btn xs" onClick={() => openPrint(order)} type="button">Print PO</button>
                    <button className="icon-btn" onClick={() => void remove(order.id)} type="button"><X /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!orders.length && <Empty text="No purchase orders yet." />}
        </div>
      </div>

      {open && (
        <Modal title="Create Purchase Order — Original PO Layout" onClose={() => setOpen(false)}>
          <div className="form-grid">
            <div className="form-2">
              <label className="form-label">PO Number<input className="field" value={draft.poNumber || ""} onChange={(e) => setDraft({...draft, poNumber:e.target.value})} placeholder="e.g. TPF0736" /></label>
              <label className="form-label">PRF No.<input className="field" value={draft.prfNo || ""} onChange={(e) => setDraft({...draft, prfNo:e.target.value})} /></label>
            </div>
            <div className="form-2">
              <label className="form-label">Supplier<input className="field" list="supplier-list" value={draft.vendorName || ""} onChange={(e) => setDraft({...draft, vendorName:e.target.value})} /></label>
              <label className="form-label">Supplier Contact / Attention<input className="field" value={draft.supplierContact || ""} onChange={(e) => setDraft({...draft, supplierContact:e.target.value})} /></label>
            </div>
            <datalist id="supplier-list">{suppliers.map((supplier)=><option key={supplier.id} value={supplier.name} />)}</datalist>
            <label className="form-label">Supplier Address<input className="field" value={draft.supplierAddress || ""} onChange={(e) => setDraft({...draft, supplierAddress:e.target.value})} /></label>
            <div className="form-2">
              <label className="form-label">PO Date<input className="field" type="date" value={draft.poDate || ""} onChange={(e) => setDraft({...draft, poDate:e.target.value})} /></label>
              <label className="form-label">Delivery Date<input className="field" type="date" value={draft.expectedDate || ""} onChange={(e) => setDraft({...draft, expectedDate:e.target.value})} /></label>
            </div>
            <div className="form-2">
              <label className="form-label">Terms<input className="field" value={draft.terms || "50% DP 50% FD"} onChange={(e) => setDraft({...draft, terms:e.target.value})} /></label>
              <label className="form-label">Status<select className="field" value={draft.status || "Draft"} onChange={(e) => setDraft({...draft, status:e.target.value})}><option>Draft</option><option>Pending</option><option>Approved</option><option>Received</option><option>Delivered</option><option>Completed</option><option>Cancelled</option></select></label>
            </div>
            <div className="form-2">
              <label className="form-label">Requisitioner<input className="field" value={draft.requisitioner || ""} onChange={(e) => setDraft({...draft, requisitioner:e.target.value})} /></label>
              <label className="form-label">Requisitioner Email<input className="field" type="email" value={draft.requisitionerEmail || ""} onChange={(e) => setDraft({...draft, requisitionerEmail:e.target.value})} placeholder="name@company.com" /></label>
            </div>
            <div className="form-2">
              <label className="form-label">Buyer / Prepared By<input className="field" value={draft.buyerName || ""} onChange={(e) => setDraft({...draft, buyerName:e.target.value})} /></label>
              <label className="form-label">Purpose<input className="field" value={draft.purpose || ""} onChange={(e) => setDraft({...draft, purpose:e.target.value})} placeholder="FOR SALE IN STUFFSHOP" /></label>
            </div>

            <div style={{marginTop:4}}><div className="section-label">PO Line Items</div>
              <div style={{overflowX:"auto"}}>
                <table className="po-entry-table" style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead><tr><th style={{textAlign:"left"}}>QTY</th><th style={{textAlign:"left"}}>UNIT</th><th style={{textAlign:"left"}}>PARTICULARS</th><th style={{textAlign:"right"}}>UNIT PRICE</th><th style={{textAlign:"right"}}>TOTAL</th><th /></tr></thead>
                  <tbody>
                    {(draft.items || []).map((item: any, index: number) => <tr key={index}>
                      <td><input className="field" type="number" min="0" value={item.qty} onChange={(e)=>updateItem(index,{qty:Number(e.target.value)})} /></td>
                      <td><input className="field" value={item.unit} onChange={(e)=>updateItem(index,{unit:e.target.value})} /></td>
                      <td><input className="field" value={item.particulars} onChange={(e)=>updateItem(index,{particulars:e.target.value})} placeholder="JACKET WHITE PURPLE (DESIGN 13) - S" /></td>
                      <td><input className="field" type="number" min="0" value={item.unitPrice} onChange={(e)=>updateItem(index,{unitPrice:Number(e.target.value)})} /></td>
                      <td style={{textAlign:"right",fontWeight:700}}>₱{(Number(item.qty||0)*Number(item.unitPrice||0)).toLocaleString("en-PH",{minimumFractionDigits:2})}</td>
                      <td><button className="btn xs" type="button" onClick={()=>setDraft((current:any)=>({...current,items:(current.items||[]).filter((_:any,i:number)=>i!==index)}))}>Remove</button></td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                <button className="btn ghost" type="button" onClick={()=>setDraft((current:any)=>({...current,items:[...(current.items||[]),{...blankItem}]}))}><Plus /> Add Item</button>
                <div style={{fontWeight:800}}>Subtotal: ₱{calculatedSubtotal(draft.items||[]).toLocaleString("en-PH",{minimumFractionDigits:2})}</div>
              </div>
            </div>

            <div className="form-2">
              <label className="form-label">Discount %<input className="field" type="number" value={draft.discountPct || 0} onChange={(e)=>setDraft({...draft,discountPct:Number(e.target.value)})} /></label>
              <label className="form-label">Evaluator Role<select className="field" value={draft.evaluatorRole || "requisitioner"} onChange={(e)=>setDraft({...draft,evaluatorRole:e.target.value})}><option value="requisitioner">Requisitioner</option><option value="purchaser">Purchaser</option><option value="amd">AMD Personnel</option></select></label>
            </div>
            <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:700}}><input type="checkbox" checked={Boolean(draft.autoSendEvaluation)} onChange={(e)=>setDraft({...draft,autoSendEvaluation:e.target.checked})} /> Automatically send supplier evaluation when PO reaches Delivered / Received / Completed</label>
            <div className="form-2">
              <label className="form-label">Verified / Approved By<input className="field" value={draft.approvedBy || ""} onChange={(e)=>setDraft({...draft,approvedBy:e.target.value})} /></label>
              <label className="form-label">Conforme / Name<input className="field" value={draft.conformee || ""} onChange={(e)=>setDraft({...draft,conformee:e.target.value})} /></label>
            </div>
            <label className="form-label">Notes<textarea className="field" value={draft.notes || ""} onChange={(e)=>setDraft({...draft,notes:e.target.value})} /></label>
          </div>

          <div className="modal-actions">
            <button className="btn ghost" onClick={() => setOpen(false)} type="button">Cancel</button>
            <button className="btn primary" onClick={() => void save()} type="button">Save PO</button>
          </div>
        </Modal>
      )}

      {printOrder && (
        <PurchaseOrderPrint
          data={{
            poNumber: printOrder.poNumber,
            date: (printOrder as any).poDate || new Date(printOrder.createdAt).toLocaleDateString("en-PH"),
            deliveryDate: printOrder.deliveryDate || printOrder.expectedDate,
            terms: printOrder.terms,
            supplierName: printOrder.vendorName,
            supplierAddress: printOrder.supplierAddress,
            supplierContact: printOrder.supplierContact,
            requisitioner: printOrder.requisitioner,
            prfNo: printOrder.prfNo,
            purpose: printOrder.purpose,
            preparedBy: printOrder.preparedBy || printOrder.buyerName,
            approvedBy: printOrder.approvedBy,
            conformee: printOrder.conformee,
            items: printOrder.items || [],
            notes: printOrder.notes,
          }}
        />
      )}
    </div>
  );
}

/* =========================================================
   ROUTING
========================================================= */

function RoutingPage({
  routes,
  onSave,
  onDelete,
  onSync,
  onError
}: {
  routes: RouteRecord[];
  onSave: (item: any) => Promise<any>;
  onDelete: (id: string) => Promise<any>;
  onSync: () => void;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<RouteRecord | null>(null);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [draft, setDraft] = useState<any>({ status: "For Routing" });

  const filtered = routes.filter((r) => {
    const q = queryText.trim().toLowerCase();
    const matchesQuery = !q || [r.trackingId,r.referenceNo,r.poNumber,r.prfNo,r.currentHolder,r.from,r.to,r.documentType,r.status].some(v => String(v||"").toLowerCase().includes(q));
    const matchesStatus = statusFilter === "all" || r.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  function openNew() {
    setDraft({ status: "For Routing", documentType: "PO", from: "Purchasing" });
    setOpen(true);
  }
  function openEdit(route: RouteRecord) {
    setDraft({ ...route, history: undefined });
    setOpen(true);
  }

  async function save() {
    try {
      const existing = routes.find(r => r.id === draft.id);
      const now = new Date().toISOString();
      const nextStatus = draft.status || "For Routing";
      const history = [...(existing?.history || [])];
      const changed = !existing || existing.status !== nextStatus || existing.from !== draft.from || existing.to !== draft.to || existing.currentHolder !== draft.currentHolder || existing.remarks !== draft.remarks;
      if (changed) history.push({ timestamp: now, action: existing ? "Route updated" : "Route created", status: nextStatus, from: draft.from || "", to: draft.to || "", currentHolder: draft.currentHolder || draft.to || "", actor: "system user", remarks: draft.remarks || "" });
      await onSave({
        id: draft.id || uid(),
        trackingId: draft.trackingId || `RT-${Date.now()}`,
        documentType: draft.documentType || "PO",
        referenceNo: draft.referenceNo || "",
        prfNo: draft.prfNo || "",
        poNumber: draft.poNumber || "",
        documentTitle: draft.documentTitle || "",
        requester: draft.requester || "",
        department: draft.department || "",
        from: draft.from || "Purchasing",
        to: draft.to || "",
        currentHolder: draft.currentHolder || draft.to || "",
        status: nextStatus,
        dateRouted: draft.dateRouted || now,
        dateReceived: draft.dateReceived || (nextStatus === "Received" ? now : ""),
        receivedBy: draft.receivedBy || "",
        dateReturned: draft.dateReturned || (nextStatus === "Returned" ? now : ""),
        remarks: draft.remarks || "",
        history,
        updatedAt: now,
        lastSyncedAt: draft.lastSyncedAt || ""
      });
      setOpen(false); setSelected(null); setDraft({}); onError(existing ? "Routing record updated." : "Routing record created.");
    } catch (error: any) { onError(error?.message || "Could not save routing record."); }
  }

  async function remove(id: string) {
    try { await onDelete(id); setSelected(null); onError("Routing record deleted."); } catch (error: any) { onError(error?.message || "Could not delete routing record."); }
  }

  return (
    <div className="page">
      <PageHead title="Routing & Document Monitoring" icon={<Route />} action={<div className="row-actions"><button className="btn ghost" onClick={onSync} type="button"><RefreshCw /> Sync Spreadsheet</button><button className="btn primary" onClick={openNew} type="button"><Plus /> Add Route</button></div>} />
      <div className="info-strip"><Cloud /><div><b>Live RouteTrack-style monitoring</b><span>Track every handoff, recipient, status change and routing history. Spreadsheet sync reconciles existing and new records.</span></div></div>
      <div className="card" style={{marginBottom:16}}><div className="row-actions" style={{padding:14,flexWrap:"wrap"}}><input className="field" style={{maxWidth:320}} placeholder="Search tracking / PO / PRF / holder" value={queryText} onChange={e=>setQueryText(e.target.value)} /><select className="field" style={{maxWidth:200}} value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">All statuses</option>{["Pending","For Routing","Received","In Process","Returned","Completed","Overdue","Cancelled"].map(x=><option key={x}>{x}</option>)}</select><span style={{fontSize:12,color:"#64748b"}}>{filtered.length} record(s)</span></div></div>
      <div className="card"><div className="table-wrap"><table><thead><tr><th>Tracking</th><th>Document</th><th>Reference</th><th>From → To</th><th>Holder</th><th>Status</th><th>Received</th><th>Updated</th><th>Actions</th></tr></thead><tbody>{filtered.map(route=><tr key={route.id}><td className="mono">{route.trackingId}</td><td>{route.documentType}</td><td>{route.referenceNo || route.poNumber || route.prfNo || "—"}</td><td>{route.from || "—"} → {route.to || "—"}</td><td>{route.currentHolder || "—"}</td><td><span className={`badge ${route.status === "Overdue" ? "red" : route.status === "Completed" ? "green" : route.status === "Returned" ? "amber" : "blue"}`}>{route.status}</span></td><td>{route.dateReceived || "—"}</td><td>{route.updatedAt?.slice(0,16).replace("T"," ") || "—"}</td><td><div className="row-actions"><button className="btn xs" onClick={()=>setSelected(route)} type="button">View</button><button className="btn xs" onClick={()=>openEdit(route)} type="button">Edit</button><button className="btn xs" onClick={()=>void remove(route.id)} type="button">Delete</button></div></td></tr>)}</tbody></table>{!filtered.length && <Empty text="No routing records match your filter." />}</div></div>
      {selected && <Modal title={`Route ${selected.trackingId}`} onClose={()=>setSelected(null)}><div className="info-grid"><div className="info-box"><div className="info-lbl">Document</div><div>{selected.documentType} · {selected.referenceNo || selected.poNumber || selected.prfNo || "—"}</div></div><div className="info-box"><div className="info-lbl">Current Holder</div><div>{selected.currentHolder || "—"}</div></div><div className="info-box"><div className="info-lbl">From</div><div>{selected.from || "—"}</div></div><div className="info-box"><div className="info-lbl">To</div><div>{selected.to || "—"}</div></div><div className="info-box"><div className="info-lbl">Received By</div><div>{selected.receivedBy || "—"}</div></div><div className="info-box"><div className="info-lbl">Remarks</div><div>{selected.remarks || "—"}</div></div></div><div className="section-label">Route History</div><div style={{display:"grid",gap:10}}>{(selected.history || []).slice().reverse().map((h,i)=><div key={i} style={{padding:12,border:"1px solid #e5e7eb",borderRadius:10,background:"#f8fafc"}}><div style={{display:"flex",justifyContent:"space-between",gap:12}}><b>{h.action}</b><span style={{fontSize:11,color:"#64748b"}}>{String(h.timestamp||"").replace("T"," ").slice(0,19)}</span></div><div style={{fontSize:12,color:"#475569",marginTop:4}}>{h.from || "—"} → {h.to || "—"} · {h.currentHolder || "—"} · {h.status || "—"}</div>{h.remarks && <div style={{fontSize:12,color:"#64748b",marginTop:4}}>{h.remarks}</div>}</div>)}{!(selected.history||[]).length && <div style={{fontSize:13,color:"#94a3b8"}}>No route history recorded yet.</div>}</div><div className="modal-actions"><button className="btn ghost" onClick={()=>setSelected(null)} type="button">Close</button><button className="btn primary" onClick={()=>openEdit(selected)} type="button">Edit Route</button></div></Modal>}
      {open && <Modal title={draft.id ? "Edit Routing Record" : "Add Routing Record"} onClose={()=>setOpen(false)}><div className="form-grid"><div className="form-2"><label className="form-label">Tracking ID<input className="field" value={draft.trackingId||""} onChange={e=>setDraft({...draft,trackingId:e.target.value})} /></label><label className="form-label">Document Type<input className="field" value={draft.documentType||"PO"} onChange={e=>setDraft({...draft,documentType:e.target.value})} /></label></div><div className="form-2"><label className="form-label">Reference No.<input className="field" value={draft.referenceNo||""} onChange={e=>setDraft({...draft,referenceNo:e.target.value})} /></label><label className="form-label">PO Number<input className="field" value={draft.poNumber||""} onChange={e=>setDraft({...draft,poNumber:e.target.value})} /></label></div><div className="form-2"><label className="form-label">PRF No.<input className="field" value={draft.prfNo||""} onChange={e=>setDraft({...draft,prfNo:e.target.value})} /></label><label className="form-label">Document Title<input className="field" value={draft.documentTitle||""} onChange={e=>setDraft({...draft,documentTitle:e.target.value})} /></label></div><div className="form-2"><label className="form-label">From<input className="field" value={draft.from||""} onChange={e=>setDraft({...draft,from:e.target.value})} /></label><label className="form-label">To<input className="field" value={draft.to||""} onChange={e=>setDraft({...draft,to:e.target.value})} /></label></div><div className="form-2"><label className="form-label">Current Holder<input className="field" value={draft.currentHolder||""} onChange={e=>setDraft({...draft,currentHolder:e.target.value})} /></label><label className="form-label">Received By<input className="field" value={draft.receivedBy||""} onChange={e=>setDraft({...draft,receivedBy:e.target.value})} /></label></div><div className="form-2"><label className="form-label">Status<select className="field" value={draft.status||"For Routing"} onChange={e=>setDraft({...draft,status:e.target.value})}>{["Pending","For Routing","Received","In Process","Returned","Completed","Overdue","Cancelled"].map(x=><option key={x}>{x}</option>)}</select></label><label className="form-label">Department<input className="field" value={draft.department||""} onChange={e=>setDraft({...draft,department:e.target.value})} /></label></div><label className="form-label">Requester<input className="field" value={draft.requester||""} onChange={e=>setDraft({...draft,requester:e.target.value})} /></label><label className="form-label">Remarks<textarea className="field" value={draft.remarks||""} onChange={e=>setDraft({...draft,remarks:e.target.value})} /></label></div><div className="modal-actions"><button className="btn ghost" onClick={()=>setOpen(false)} type="button">Cancel</button><button className="btn primary" onClick={()=>void save()} type="button">Save Route</button></div></Modal>}
    </div>
  );
}

/* =========================================================
   DELIVERIES
========================================================= */

function DeliveriesPage({
  orders,
  onSave,
  onError
}: {
  orders: PurchaseOrder[];
  onSave: (
    item: any
  ) => Promise<any>;
  onError: (
    message: string
  ) => void;
}) {
  async function mark(
    order: PurchaseOrder,
    status: string
  ) {
    try {
      await onSave({
        ...order,

        status,

        actualDeliveryDate:
          status ===
            "Delivered" ||
          status ===
            "Completed"
            ? new Date()
                .toISOString()
                .slice(
                  0,
                  10
                )
            : order.actualDeliveryDate,

        updatedAt:
          new Date().toISOString()
      });

      onError(
        `PO ${order.poNumber} marked as ${status}.`
      );
    } catch (error: any) {
      console.error(
        "Could not update delivery:",
        error
      );

      onError(
        error?.message ||
          "Could not update delivery."
      );
    }
  }

  return (
    <div className="page">

      <PageHead
        title="Deliveries & Receiving"
        icon={<Truck />}
      />

      <div className="card">

        <div className="table-wrap">

          <table>

            <thead>

              <tr>
                <th>PO</th>
                <th>Supplier</th>
                <th>Expected</th>
                <th>Actual</th>
                <th>Status</th>
                <th>Action</th>
              </tr>

            </thead>

            <tbody>

              {orders.map(
                (order) => (
                  <tr
                    key={order.id}
                  >

                    <td className="mono">
                      {
                        order.poNumber
                      }
                    </td>

                    <td>
                      {
                        order.vendorName
                      }
                    </td>

                    <td>
                      {order.expectedDate ||
                        "—"}
                    </td>

                    <td>
                      {order.actualDeliveryDate ||
                        "—"}
                    </td>

                    <td>
                      <span className="badge blue">
                        {
                          order.status
                        }
                      </span>
                    </td>

                    <td>

                      <div className="row-actions">

                        {[
                          "Partially Delivered",
                          "Delivered",
                          "Completed"
                        ].map(
                          (status) => (
                            <button
                              key={
                                status
                              }
                              className="btn xs"
                              onClick={() =>
                                void mark(
                                  order,
                                  status
                                )
                              }
                              type="button"
                            >
                              {status}
                            </button>
                          )
                        )}

                      </div>

                    </td>

                  </tr>
                )
              )}

            </tbody>

          </table>

          {!orders.length && (
            <Empty text="No orders to receive." />
          )}

        </div>

      </div>

    </div>
  );
}

/* =========================================================
   SUPPLIER EVALUATION
========================================================= */

function EvaluationsPage({
  evals,
  orders,
  onSave,
  onError
}: {
  evals: SupplierEvaluation[];
  orders: PurchaseOrder[];
  onSave: (item: any) => Promise<any>;
  onError: (message: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<any>({ evaluatorRole: "requisitioner", autoEmail: true });
  const [emailTarget, setEmailTarget] = useState<SupplierEvaluation | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function sendEmail(evaluationId: string, targetEmail?: string) {
    const destination = String(targetEmail || email || "").trim();
    if (!destination) { onError("Enter an evaluator email address."); return; }
    setSending(true);
    try {
      const response = await fetch("/api/send-evaluation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ evaluationId, email: destination }) });
      const result = await response.json();
      if (!response.ok || !result?.ok) throw new Error(result?.message || "Could not send evaluation.");
      setEmailTarget(null); setEmail(""); onError(result.sent ? `Evaluation sent to ${destination}.` : `Email is not configured. Evaluation link: ${result.link}`);
    } catch (error: any) { onError(error?.message || "Could not send evaluation."); }
    finally { setSending(false); }
  }

  async function create() {
    try {
      const token = crypto.randomUUID().replaceAll("-", "");
      const order = orders.find((item) => item.poNumber === draft.poNumber);
      const item: any = {
        id: draft.id || uid(), token, poNumber: draft.poNumber || "", prfNo: draft.prfNo || order?.prfNo || "", vendorName: draft.vendorName || order?.vendorName || "",
        evaluatorEmail: draft.evaluatorEmail || "", evaluatorName: draft.evaluatorName || "", evaluatorRole: draft.evaluatorRole || "requisitioner", status: "pending",
        accurateDelivery: 0, competitivePrice: 0, timeliness: 0, afterSales: 0, compliance: 0, comments: "", overallScore: 0,
        totalAmount: Number(draft.totalAmount || order?.total || 0), expectedDeliveryDate: draft.expectedDeliveryDate || order?.expectedDate || "", actualDeliveryDate: draft.actualDeliveryDate || order?.actualDeliveryDate || "",
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()
      };
      await onSave(item);
      setOpen(false);
      setDraft({ evaluatorRole: "requisitioner", autoEmail: true });
      if (draft.autoEmail && draft.evaluatorEmail) await sendEmail(item.id, draft.evaluatorEmail);
      else onError("Supplier evaluation created.");
    } catch (error: any) { onError(error?.message || "Could not create supplier evaluation."); }
  }

  return (
    <div className="page">
      <PageHead title="Supplier Evaluation" icon={<ClipboardCheck />} action={<button className="btn primary" onClick={()=>setOpen(true)} type="button"><Plus /> New Evaluation</button>} />
      <div className="info-strip"><Sparkles /><div><b>Automated supplier evaluation workflow</b><span>Records are stored in the system and reconciled to the shared supplier-evaluation spreadsheet, including historical rows and newly submitted evaluations.</span></div></div>
      <div className="card"><div className="table-wrap"><table><thead><tr><th>Supplier</th><th>PO</th><th>Evaluator</th><th>Email</th><th>Role</th><th>Status</th><th>Score</th><th>Actions</th></tr></thead><tbody>
        {evals.map((evaluation)=><tr key={evaluation.id}>
          <td>{evaluation.vendorName}</td><td><span className="mono">{evaluation.poNumber}</span></td><td>{(evaluation as any).evaluatorName || "—"}</td><td>{evaluation.evaluatorEmail || "—"}</td><td>{evaluation.evaluatorRole}</td>
          <td><span className={`badge ${evaluation.status === "submitted" ? "green" : "amber"}`}>{evaluation.status}</span></td><td>{evaluation.overallScore ? Number(evaluation.overallScore).toFixed(1) : "—"}</td>
          <td style={{display:"flex",gap:6,flexWrap:"wrap"}}><button className="btn xs" onClick={()=>{setEmailTarget(evaluation);setEmail(evaluation.evaluatorEmail || "")}} type="button">Email</button><button className="btn xs" onClick={async()=>{try{await navigator.clipboard.writeText(`${window.location.origin}/evaluate/${evaluation.token}`);onError("Evaluation link copied.")}catch{onError("Could not copy evaluation link.")}}} type="button">Copy link</button></td>
        </tr>)}
      </tbody></table>{!evals.length && <Empty text="No supplier evaluations yet." />}</div></div>

      {open && <Modal title="Create Supplier Evaluation" onClose={()=>setOpen(false)}>
        <div className="form-grid">
          <label className="form-label">PO Number<input className="field" list="evaluation-po-list" value={draft.poNumber||""} onChange={(e)=>{const order=orders.find((item)=>item.poNumber===e.target.value);setDraft({...draft,poNumber:e.target.value,vendorName:order?.vendorName||draft.vendorName,prfNo:order?.prfNo||draft.prfNo,totalAmount:order?.total||draft.totalAmount})}} /></label>
          <datalist id="evaluation-po-list">{orders.map((order)=><option key={order.id} value={order.poNumber}/>)}</datalist>
          <div className="form-2"><label className="form-label">Supplier<input className="field" value={draft.vendorName||""} onChange={(e)=>setDraft({...draft,vendorName:e.target.value})}/></label><label className="form-label">PRF No.<input className="field" value={draft.prfNo||""} onChange={(e)=>setDraft({...draft,prfNo:e.target.value})}/></label></div>
          <div className="form-2"><label className="form-label">Evaluator Name<input className="field" value={draft.evaluatorName||""} onChange={(e)=>setDraft({...draft,evaluatorName:e.target.value})}/></label><label className="form-label">Evaluator Email<input className="field" type="email" value={draft.evaluatorEmail||""} onChange={(e)=>setDraft({...draft,evaluatorEmail:e.target.value})}/></label></div>
          <div className="form-2"><label className="form-label">Role<select className="field" value={draft.evaluatorRole||"requisitioner"} onChange={(e)=>setDraft({...draft,evaluatorRole:e.target.value})}><option value="requisitioner">Requisitioner</option><option value="purchaser">Purchaser</option><option value="amd">AMD Personnel</option></select></label><label className="form-label">PO Total<input className="field" type="number" value={draft.totalAmount||0} onChange={(e)=>setDraft({...draft,totalAmount:Number(e.target.value)})}/></label></div>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:700}}><input type="checkbox" checked={Boolean(draft.autoEmail)} onChange={(e)=>setDraft({...draft,autoEmail:e.target.checked})}/> Send evaluation email immediately after creation</label>
        </div>
        <div className="modal-actions"><button className="btn ghost" onClick={()=>setOpen(false)} type="button">Cancel</button><button className="btn primary" onClick={()=>void create()} type="button">Create Evaluation</button></div>
      </Modal>}

      {emailTarget && <Modal title="Send Supplier Evaluation" onClose={()=>{setEmailTarget(null);setEmail("")}}>
        <div style={{background:"#f7f9ff",border:"1px solid #e3e8ff",borderRadius:12,padding:16,marginBottom:18}}><div style={{fontSize:11,fontWeight:800,color:"#6b7280",textTransform:"uppercase",letterSpacing:.8}}>Evaluation</div><div style={{fontWeight:800,fontSize:17,marginTop:3}}>{emailTarget.vendorName || "Supplier"}</div><div style={{fontSize:13,color:"#6b7280",marginTop:3}}>PO {emailTarget.poNumber} · {emailTarget.evaluatorRole}</div></div>
        <div className="form-grid"><label className="form-label">Recipient email<input className="field" type="email" value={email} onChange={(e)=>setEmail(e.target.value)} placeholder="requisitioner@company.com" autoFocus/></label><div style={{fontSize:12,color:"#6b7280",lineHeight:1.6}}>The system sends a unique secure evaluation link. Resending records the latest send time and never deletes a submitted response.</div></div>
        <div className="modal-actions"><button className="btn ghost" onClick={()=>{setEmailTarget(null);setEmail("")}} type="button">Cancel</button><button className="btn primary" disabled={sending} onClick={()=>void sendEmail(emailTarget.id,email)} type="button">{sending ? "Sending…" : "Send Evaluation Email"}</button></div>
      </Modal>}
    </div>
  );
}

/* =========================================================
   SUPPLIERS
========================================================= */

function SuppliersPage({
  suppliers,
  onSave,
  onDelete,
  onError
}: {
  suppliers: Supplier[];
  onSave: (
    item: any
  ) => Promise<any>;
  onDelete: (
    id: string
  ) => Promise<any>;
  onError: (
    message: string
  ) => void;
}) {
  const [open, setOpen] =
    useState(false);

  const [draft, setDraft] =
    useState<any>({});

  async function save() {
    try {
      await onSave({
        id:
          draft.id ||
          uid(),

        name:
          draft.name ||
          "",

        contact:
          draft.contact ||
          "",

        email:
          draft.email ||
          "",

        phone:
          draft.phone ||
          "",

        address:
          draft.address ||
          "",

        paymentTerms:
          draft.paymentTerms ||
          "",

        notes:
          draft.notes ||
          "",

        createdAt:
          draft.createdAt ||
          new Date().toISOString(),

        updatedAt:
          new Date().toISOString()
      });

      setOpen(false);
      setDraft({});

      onError(
        "Supplier saved successfully."
      );
    } catch (error: any) {
      console.error(
        "Could not save supplier:",
        error
      );

      onError(
        error?.message ||
          "Could not save supplier."
      );
    }
  }

  async function remove(
    id: string
  ) {
    try {
      await onDelete(id);

      onError(
        "Supplier deleted."
      );
    } catch (error: any) {
      console.error(
        "Could not delete supplier:",
        error
      );

      onError(
        error?.message ||
          "Could not delete supplier."
      );
    }
  }

  return (
    <div className="page">

      <PageHead
        title="Supplier Directory"
        icon={
          <Store />
        }
        action={
          <button
            className="btn primary"
            onClick={() =>
              setOpen(true)
            }
            type="button"
          >
            <Plus />
            New Supplier
          </button>
        }
      />

      <div className="supplier-grid">

        {suppliers.map(
          (supplier) => (
            <div
              className="supplier-card"
              key={
                supplier.id
              }
            >

              <div className="supplier-logo">
                {supplier.name
                  .slice(0, 1)
                  .toUpperCase()}
              </div>

              <div>

                <b>
                  {supplier.name}
                </b>

                <span>
                  {supplier.contact ||
                    "No contact"}
                </span>

                <small>
                  {supplier.email ||
                    supplier.phone ||
                    "No contact details"}
                </small>

              </div>

              <button
                className="icon-btn"
                onClick={() =>
                  void remove(
                    supplier.id
                  )
                }
                type="button"
              >
                <X />
              </button>

            </div>
          )
        )}

        {!suppliers.length && (
          <Empty text="No suppliers yet." />
        )}

      </div>

      {open && (
        <Modal
          title="New Supplier"
          onClose={() =>
            setOpen(false)
          }
        >

          <div className="form-grid">

            <label className="form-label">

              Supplier Name

              <input
                className="field"
                value={
                  draft.name ||
                  ""
                }
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    name:
                      event.target.value
                  })
                }
              />

            </label>

            <div className="form-2">

              <label className="form-label">

                Contact

                <input
                  className="field"
                  value={
                    draft.contact ||
                    ""
                  }
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      contact:
                        event.target.value
                    })
                  }
                />

              </label>

              <label className="form-label">

                Email

                <input
                  className="field"
                  type="email"
                  value={
                    draft.email ||
                    ""
                  }
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      email:
                        event.target.value
                    })
                  }
                />

              </label>

            </div>

            <div className="form-2">

              <label className="form-label">

                Phone

                <input
                  className="field"
                  value={
                    draft.phone ||
                    ""
                  }
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      phone:
                        event.target.value
                    })
                  }
                />

              </label>

              <label className="form-label">

                Payment Terms

                <input
                  className="field"
                  value={
                    draft.paymentTerms ||
                    ""
                  }
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      paymentTerms:
                        event.target.value
                    })
                  }
                />

              </label>

            </div>

            <label className="form-label">

              Address

              <textarea
                className="field"
                value={
                  draft.address ||
                  ""
                }
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    address:
                      event.target.value
                  })
                }
              />

            </label>

          </div>

          <div className="modal-actions">

            <button
              className="btn ghost"
              onClick={() =>
                setOpen(false)
              }
              type="button"
            >
              Cancel
            </button>

            <button
              className="btn primary"
              onClick={() =>
                void save()
              }
              type="button"
            >
              Save Supplier
            </button>

          </div>

        </Modal>
      )}

    </div>
  );
}

/* =========================================================
   DOCUMENTS
========================================================= */

function DocumentsPage({
  docs,
  onError
}: {
  docs: DocumentRecord[];
  onError: (
    message: string
  ) => void;
}) {
  const [busy, setBusy] =
    useState(false);

  const [ocr, setOcr] =
    useState<any>(null);

  async function upload(
    file: File
  ) {
    setBusy(true);
    setOcr(null);

    try {
      const info =
        await uploadDocument(
          file,
          "purchasing-documents"
        );

      const record = {
        id: uid(),
        referenceNo: "",
        type:
          "Attachment",
        name: info.name,
        url: info.url,
        storageKey: info.key,
        contentType:
          info.contentType,
        size: info.size,
        uploadedAt:
          new Date().toISOString()
      };

      await saveEntity(
        "documents",
        record
      );

      onError(
        "Document uploaded successfully."
      );

      if (
        file.type.startsWith(
          "image/"
        )
      ) {
        const reader =
          new FileReader();

        reader.onload =
          async () => {
            try {
              const response =
                await fetch(
                  "/api/ocr",
                  {
                    method:
                      "POST",
                    headers: {
                      "Content-Type":
                        "application/json"
                    },
                    body:
                      JSON.stringify(
                        {
                          image:
                            reader.result
                        }
                      )
                  }
                );

              const data =
                await response.json();

              setOcr(data);
            } catch (error) {
              console.error(
                "OCR failed:",
                error
              );

              setOcr({
                ok: false,
                message:
                  "OCR request failed."
              });
            }
          };

        reader.readAsDataURL(
          file
        );
      }
    } catch (error: any) {
      console.error(
        "Document upload failed:",
        error
      );

      onError(
        error?.message ||
          "Document upload failed."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">

      <PageHead
        title="Document Center"
        icon={
          <FolderOpen />
        }
        action={
          <label className="btn primary">

            <Camera />

            Scan / Upload

            <input
              hidden
              type="file"
              accept="image/*,.pdf"
              capture="environment"
              onChange={(event) => {
                const file =
                  event.target.files?.[0];

                if (file) {
                  void upload(
                    file
                  );
                }
              }}
            />

          </label>
        }
      />

      {ocr && (
        <div
          className={`info-strip ${
            ocr.ok
              ? ""
              : "warning"
          }`}
        >

          <Sparkles />

          <div>

            <b>
              {ocr.ok
                ? "OCR extraction ready"
                : "OCR needs setup"}
            </b>

            <span>
              {ocr.ok
                ? JSON.stringify(
                    ocr.data
                  )
                : ocr.message}
            </span>

          </div>

        </div>
      )}

      <div className="doc-grid">

        {docs.map(
          (document) => (
            <a
              className="doc-card"
              href={
                document.url
              }
              target="_blank"
              rel="noreferrer"
              key={
                document.id
              }
            >

              <div className="doc-icon">
                <FileText />
              </div>

              <b>
                {
                  document.name
                }
              </b>

              <span>
                {document.referenceNo ||
                  "No reference"}
              </span>

              <small>
                {document.uploadedAt
                  ?.slice(0, 16)
                  .replace(
                    "T",
                    " "
                  )}
              </small>

            </a>
          )
        )}

        {!docs.length && (
          <Empty
            text={
              busy
                ? "Uploading…"
                : "No documents uploaded yet."
            }
          />
        )}

      </div>

    </div>
  );
}

/* =========================================================
   REPORTS
========================================================= */

function ReportsPage({
  requests,
  orders,
  routes,
  evals
}: {
  requests: PurchaseRequest[];
  orders: PurchaseOrder[];
  routes: RouteRecord[];
  evals: SupplierEvaluation[];
}) {
  const rated =
    evals.filter(
      (evaluation) =>
        Number(
          evaluation.overallScore
        ) > 0
    );

  const averageRating =
    rated.length
      ? rated.reduce(
          (sum, evaluation) =>
            sum +
            Number(
              evaluation.overallScore
            ),
          0
        ) / rated.length
      : 0;

  function exportExcel() {
    const workbook =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        requests
      ),
      "Purchase Requests"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        orders
      ),
      "Purchase Orders"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        routes
      ),
      "Routing"
    );

    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(
        evals
      ),
      "Evaluations"
    );

    XLSX.writeFile(
      workbook,
      `purchasing-report-${new Date()
        .toISOString()
        .slice(
          0,
          10
        )}.xlsx`
    );
  }

  return (
    <div className="page">

      <PageHead
        title="Reports & Analytics"
        icon={
          <BarChart3 />
        }
      />

      <div className="report-grid">

        {[
          [
            "Requests",
            requests.length
          ],
          [
            "Orders",
            orders.length
          ],
          [
            "Routes",
            routes.length
          ],
          [
            "Overdue Routes",
            routes.filter(
              (route) =>
                route.status ===
                "Overdue"
            ).length
          ],
          [
            "Evaluations",
            evals.length
          ],
          [
            "Average Supplier Rating",
            averageRating.toFixed(
              2
            )
          ]
        ].map(
          ([label, value]) => (
            <div
              className="report-card"
              key={String(
                label
              )}
            >

              <span>
                {String(label)}
              </span>

              <strong>
                {String(value)}
              </strong>

            </div>
          )
        )}

      </div>

      <div className="card">

        <div className="card-head">

          <div>

            <b>
              Export workspace data
            </b>

            <span>
              Download clean Excel
              reports.
            </span>

          </div>

          <button
            className="btn primary"
            onClick={
              exportExcel
            }
            type="button"
          >
            <Archive />
            Export Excel
          </button>

        </div>

      </div>

    </div>
  );
}

/* =========================================================
   SYNC PAGE
========================================================= */

function SyncPage({
  routes,
  onSync,
  syncing
}: {
  routes: RouteRecord[];
  onSync: () => void;
  syncing: boolean;
}) {
  const [importing, setImporting] = useState<"evaluation" | "routing" | "">("");
  const [message, setMessage] = useState("");
  const syncedRoutes = routes.filter((route) => route.source && route.source.toLowerCase().includes("workbook") || route.source?.toLowerCase().includes("routing")).length;

  async function importBaseline(kind: "evaluation" | "routing", file?: File) {
    if (!file) return;
    setImporting(kind); setMessage("");
    try {
      const body = new FormData(); body.append("kind", kind); body.append("file", file);
      const response = await fetch("/api/import-baseline", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.ok) throw new Error(data.message || "Baseline import failed.");
      setMessage(data.message || `Imported ${data.recordsImported || 0} records.`);
      onSync();
    } catch (error:any) {
      setMessage(error?.message || "Baseline import failed.");
    } finally { setImporting(""); }
  }

  return (
    <div className="page">
      <PageHead
        title="Spreadsheet Sync Center"
        icon={<RefreshCw />}
        action={<button className="btn primary" onClick={onSync} disabled={syncing} type="button"><RefreshCw className={syncing ? "spin" : ""} />{syncing ? "Syncing changes…" : "Sync Changes"}</button>}
      />

      <div className="sync-hero">
        <div className="sync-check"><CheckCircle2 /></div>
        <div><b>Delta synchronization is enabled</b><span>Use the downloaded Excel files once for the historical baseline. After that, the live sheets only reconcile changed rows and new records.</span></div>
        <span className="sync-badge">Incremental · 15 min</span>
      </div>

      {message && <div className={`info-strip ${message.toLowerCase().includes("failed") || message.toLowerCase().includes("error") ? "warning" : ""}`}><Activity /><div><b>Sync Center</b><span>{message}</span></div></div>}

      <div className="grid-2" style={{marginBottom:16}}>
        <div className="card baseline-card">
          <div className="card-head"><div><b>1 · Import Supplier Evaluation history</b><span>Load your downloaded supplier-evaluation workbook once so the system starts from the complete historical baseline.</span></div><ClipboardCheck className="muted" /></div>
          <div style={{padding:18}}><label className="upload-drop"><Sparkles /><div><b>{importing === "evaluation" ? "Importing…" : "Choose supplier evaluation Excel"}</b><span>.xlsx / .xls / .xlsm · historical rows are merged into Firestore</span></div><input hidden type="file" accept=".xlsx,.xls,.xlsm" disabled={!!importing} onChange={e=>void importBaseline("evaluation", e.target.files?.[0])}/></label></div>
        </div>
        <div className="card baseline-card">
          <div className="card-head"><div><b>2 · Import PRF / SRF Route history</b><span>Load the current V2 monitoring workbook and seed RouteTrack with the existing PRF/SRF routing timeline.</span></div><Route className="muted" /></div>
          <div style={{padding:18}}><label className="upload-drop"><Route /><div><b>{importing === "routing" ? "Importing…" : "Choose V2 PRF / SRF Excel"}</b><span>Uses PRF - SISC / SRF - SISC and builds route history from the dated stages</span></div><input hidden type="file" accept=".xlsx,.xls,.xlsm" disabled={!!importing} onChange={e=>void importBaseline("routing", e.target.files?.[0])}/></label></div>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="stat-icon"><Route /></div><div className="stat-label">Route Records</div><div className="stat-value">{routes.length}</div></div>
        <div className="stat"><div className="stat-icon"><RefreshCw /></div><div className="stat-label">Sync Mode</div><div className="stat-value small">Delta</div></div>
        <div className="stat"><div className="stat-icon"><Zap /></div><div className="stat-label">Automatic</div><div className="stat-value small">15 min</div></div>
      </div>

      <div className="card">
        <div className="card-head"><div><b>How the improved sync works</b><span>Historical baseline first, then lightweight reconciliation.</span></div></div>
        <div className="workflow">
          <Step n="01" t="Seed history" d="Upload the current Excel snapshots once. The system imports existing evaluation and routing history in batches." />
          <Step n="02" t="Fingerprint rows" d="Each source row gets a hash so unchanged records are skipped on later syncs." />
          <Step n="03" t="Reconcile changes" d="Only new/changed evaluation, PRF and routing rows are written to Firestore." />
          <Step n="04" t="Push app changes" d="PO, route and evaluation changes made in the system are exported back to the live sheets." />
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   ADMIN SHELL
========================================================= */
type AdminSection = "dashboard" | "orders" | "suppliers" | "evaluations" | "routing" | "buyers" | "addresses" | "employees" | "users" | "notifications" | "analytics" | "sync" | "settings";

function AdminShell({
  profile, routes, evals, orders, requests, suppliers, onError, onSync, syncing, onOpenUserWorkspace
}: {
  profile: UserProfile;
  routes: RouteRecord[];
  evals: SupplierEvaluation[];
  orders: PurchaseOrder[];
  requests: PurchaseRequest[];
  suppliers: Supplier[];
  onError: (message:string)=>void;
  onSync: ()=>void;
  syncing: boolean;
  onOpenUserWorkspace: (targetView?: View)=>void;
}) {
  const [section, setSection] = useState<AdminSection>("dashboard");
  const [mobileOpen, setMobileOpen] = useState(false);
  const pendingEvalCount = evals.filter(e => !["submitted","completed","evaluated"].includes(String(e.status || "").toLowerCase())).length;
  const overdueCount = routes.filter(r => String(r.status || "").toLowerCase() === "overdue").length;
  const adminNav = [
    ["MAIN", [
      ["dashboard","Admin Dashboard",<ShieldCheck key="i"/>],
      ["orders","PO Control",<FileText key="i"/>],
      ["routing","RouteTrack Control",<Route key="i"/>],
      ["evaluations","Supplier Evaluation",<ClipboardCheck key="i"/>],
      ["analytics","Reports & Analytics",<BarChart3 key="i"/>],
    ]],
    ["MANAGEMENT", [
      ["suppliers","Supplier Master",<Store key="i"/>],
      ["buyers","Buyers",<Users key="i"/>],
      ["addresses","Addresses",<Boxes key="i"/>],
      ["employees","Employees",<UserCog key="i"/>],
      ["users","Users & Roles",<Users key="i"/>],
      ["notifications","Notifications",<BellRing key="i"/>],
    ]],
    ["SYSTEM", [
      ["sync","Spreadsheet Sync",<RefreshCw key="i"/>],
      ["settings","System Settings",<Settings key="i"/>],
    ]]
  ] as Array<[string, Array<[AdminSection,string,ReactNode]>]>;

  return (
    <div className="app">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-logo"><img src="/icon.svg" alt="" /></div>
          <div><b>Purchasing</b><span>Management System</span></div>
        </div>
        <div className="workspace-pill"><span className="live-dot" /> ADMIN WORKSPACE</div>
        <nav>
          {adminNav.map(([group, items], idx) => (
            <div key={group}>
              <div className="nav-group-label" style={{color:"#77bdb0",fontSize:9,padding:idx ? "12px 12px 5px" : "6px 12px 5px",fontWeight:900,letterSpacing:1}}>{group}</div>
              {items.map(([key,label,icon]) => <Nav key={key} label={label} icon={icon} active={section===key} onClick={()=>{setSection(key);setMobileOpen(false)}} badge={key === "evaluations" ? pendingEvalCount : key === "routing" ? overdueCount : undefined} />)}
            </div>
          ))}
        </nav>
        <div style={{marginTop:"auto",display:"grid",gap:6}}>
          <button className="nav" type="button" onClick={()=>onOpenUserWorkspace("dashboard")}><UserCog /><span>Open User Workspace</span></button>
          <div className="side-foot"><ShieldCheck /><span>Administrator access</span></div>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="top-left">
            <button className="icon-btn" onClick={()=>setMobileOpen(v=>!v)} type="button"><Menu /></button>
            <div><div className="crumb">ADMINISTRATOR WORKSPACE</div><h1>Purchasing Management System</h1></div>
          </div>
          <div className="top-actions">
            <button className="btn ghost" type="button" onClick={onSync} disabled={syncing}><RefreshCw className={syncing ? "spin" : ""}/> {syncing ? "Syncing…" : "Sync"}</button>
            <div className="user"><div className="avatar">{(profile.displayName || "A").slice(0,1).toUpperCase()}</div><strong>{profile.displayName}</strong><button type="button" onClick={()=>onOpenUserWorkspace("dashboard")}>User view</button></div>
          </div>
        </header>
        <section className="content">
          <AdminOperations
            section={section}
            onSectionChange={(next)=>setSection(next)}
            routes={routes}
            evals={evals}
            orders={orders}
            requests={requests}
            suppliers={suppliers}
            profile={profile}
            onError={onError}
            onNavigate={(view)=>onOpenUserWorkspace(view)}
            onSync={onSync}
            syncing={syncing}
          />
        </section>
      </main>
    </div>
  );
}

/* =========================================================
   ADMIN OPERATIONS
========================================================= */
function AdminOperations({
  section,
  onSectionChange,
  routes,
  evals,
  orders,
  requests,
  suppliers,
  profile,
  onError,
  onNavigate,
  onSync,
  syncing
}: {
  section: AdminSection;
  onSectionChange: (section: AdminSection) => void;
  routes: RouteRecord[];
  evals: SupplierEvaluation[];
  orders: PurchaseOrder[];
  requests: PurchaseRequest[];
  suppliers: Supplier[];
  profile: UserProfile | null;
  onError: (message: string) => void;
  onNavigate: (view: View) => void;
  onSync: () => void;
  syncing: boolean;
}) {
  type Tab = AdminSection;
  const [tab, setTab] = useState<Tab>(section);
  useEffect(() => { setTab(section); }, [section]);
  function selectTab(next: Tab) { setTab(next); setSearch(""); onSectionChange(next); }
  const [filter, setFilter] = useState("all");
  const [routeTypeFilter, setRouteTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [buyers, setBuyers] = useState<Buyer[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [emailTarget, setEmailTarget] = useState<SupplierEvaluation | null>(null);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [notifEmail, setNotifEmail] = useState("");
  const [userDraft, setUserDraft] = useState<Partial<UserProfile> | null>(null);
  const [masterDraft, setMasterDraft] = useState<any>(null);
  const [masterKind, setMasterKind] = useState<"buyer" | "address" | "employee" | null>(null);
  const [routeSelected, setRouteSelected] = useState<RouteRecord | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [u,b,a,e] = await Promise.all([
          getCollection<UserProfile>("users"),
          getCollection<Buyer>("buyers"),
          getCollection<Address>("addresses"),
          getCollection<Employee>("employees")
        ]);
        if (!mounted) return;
        setUsers(u);
        setBuyers(b);
        setAddresses(a);
        setEmployees(e);
      } catch (err: any) {
        onError(err?.message || "Could not load admin master data.");
      }
    })();
    return () => { mounted = false; };
  }, [onError]);

  if (profile?.role !== "admin") {
    return <div className="page"><PageHead title="Administrator Access Required" icon={<ShieldCheck />} /><div className="card"><div style={{padding:24}}>This workspace is reserved for administrators.</div></div></div>;
  }

  const submitted = evals.filter(e => ["submitted","completed","evaluated"].includes(String(e.status || "").toLowerCase())).length;
  const sent = evals.filter(e => ["sent","opened","submitted"].includes(String(e.status || "").toLowerCase())).length;
  const pending = evals.length - submitted;
  const overdue = routes.filter(r => r.status === "Overdue").length;
  const completedRoutes = routes.filter(r => r.status === "Completed").length;
  const totalValue = orders.reduce((sum,o)=>sum+Number(o.total||0),0);
  const rated = evals.filter(e=>Number(e.overallScore)>0);
  const avgScore = rated.length ? rated.reduce((s,e)=>s+Number(e.overallScore||0),0)/rated.length : 0;

  async function resend(e: SupplierEvaluation) {
    const target = String(email || e.evaluatorEmail || "").trim();
    if (!target) { onError("Enter a recipient email."); return; }
    setSending(true);
    try {
      const res = await fetch("/api/send-evaluation", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ evaluationId:e.id, email:target }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Could not send evaluation.");
      setEmailTarget(null); setEmail(""); onError(data.sent ? `Evaluation email sent to ${target}.` : `Evaluation link generated: ${data.link}`);
    } catch (err:any) { onError(err?.message || "Could not send evaluation."); } finally { setSending(false); }
  }

  async function saveUser() {
    if (!userDraft?.email) return onError("User email is required.");
    const value: UserProfile = {
      id: userDraft.id || uid(),
      email: String(userDraft.email).trim(),
      displayName: String(userDraft.displayName || userDraft.email).trim(),
      role: (userDraft.role || "purchasing") as UserProfile["role"],
      active: userDraft.active !== false,
      department: String(userDraft.department || "")
    };
    await saveEntity("users", value);
    setUsers(await getCollection<UserProfile>("users"));
    setUserDraft(null);
    onError("User profile saved. The role will be applied on sign-in.");
  }

  async function saveMaster() {
    if (!masterKind || !masterDraft?.name) return onError("Name is required.");
    const collection = masterKind === "buyer" ? "buyers" : masterKind === "address" ? "addresses" : "employees";
    await saveEntity(collection, { ...masterDraft, id: masterDraft.id || uid(), createdAt: masterDraft.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() });
    if (masterKind === "buyer") setBuyers(await getCollection<Buyer>("buyers"));
    if (masterKind === "address") setAddresses(await getCollection<Address>("addresses"));
    if (masterKind === "employee") setEmployees(await getCollection<Employee>("employees"));
    setMasterDraft(null); setMasterKind(null);
  }

  async function removeMaster(kind: "buyer"|"address"|"employee", id: string) {
    if (!confirm("Delete this master-data record?")) return;
    const collection = kind === "buyer" ? "buyers" : kind === "address" ? "addresses" : "employees";
    await removeEntity(collection, id);
    if (kind === "buyer") setBuyers(await getCollection<Buyer>("buyers"));
    if (kind === "address") setAddresses(await getCollection<Address>("addresses"));
    if (kind === "employee") setEmployees(await getCollection<Employee>("employees"));
  }

  async function sendOverdue() {
    const emails = notifEmail.split(",").map(x=>x.trim()).filter(Boolean);
    if (!emails.length) return onError("Enter at least one notification email.");
    const overdueOrders = orders.filter(o => o.expectedDate && !["Delivered","Completed"].includes(String(o.status)) && new Date(o.expectedDate) < new Date());
    if (!overdueOrders.length) return onError("No overdue purchase orders found.");
    try {
      const res = await fetch("/api/send-overdue", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ emails, orders: overdueOrders.map(o=>({poNumber:o.poNumber,vendorName:o.vendorName,expectedDate:o.expectedDate,total:o.total,status:o.status})) }) });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Unable to send overdue notifications.");
      onError(data.sent ? `Overdue notification sent to ${emails.length} recipient(s).` : "Notification generated.");
    } catch (err:any) { onError(err?.message || "Unable to send overdue notification."); }
  }

  const filteredEvals = evals.filter(e => (filter === "all" || String(e.status).toLowerCase() === filter) && (!search || `${e.poNumber} ${e.vendorName} ${e.evaluatorEmail}`.toLowerCase().includes(search.toLowerCase())));
  const filteredUsers = users.filter(u => !search || `${u.email} ${u.displayName} ${u.role}`.toLowerCase().includes(search.toLowerCase()));
  const filteredRoutes = routes.filter(r => (routeTypeFilter === "all" || String(r.documentType || "").toLowerCase() === routeTypeFilter) && (!search || `${r.trackingId} ${r.referenceNo} ${r.poNumber} ${r.prfNo} ${r.srfNo} ${r.from} ${r.to} ${r.currentHolder}`.toLowerCase().includes(search.toLowerCase())));

  function tabButton(t: Tab, label: string, icon: any) {
    return <button key={t} type="button" onClick={()=>{setTab(t);setSearch("")}} className={`admin-tab ${tab===t?"active":""}`}>{icon}<span>{label}</span></button>;
  }

  return <div className="page admin-console">
    <PageHead title="Administrator Console" icon={<ShieldCheck />} action={<div className="row-actions"><span className="admin-role-badge">ADMIN · {profile.email}</span><button className="btn ghost" onClick={()=>selectTab("sync")} type="button"><RefreshCw /> Open Sync Page</button></div>} />
<section className="admin-main">
        {tab === "dashboard" && <>
          <div className="info-strip"><Activity /><div><b>Administrative control center</b><span>All controls from the original SISC basis are exposed here: PO administration, vendor master, supplier evaluations, routing, buyers, addresses, employees, user access, overdue notifications, analytics, sync and system settings.</span></div></div>
          <div className="stats">{[["Purchase Orders",orders.length], ["PO Value",`₱${totalValue.toLocaleString(undefined,{minimumFractionDigits:2})}`],["Suppliers",suppliers.length],["Evaluations",evals.length],["Submitted Evaluations",submitted],["Pending Evaluations",pending],["Open Routes",routes.filter(r=>!["Completed","Cancelled"].includes(r.status)).length],["Overdue Routes",overdue]].map(([l,v])=><div className="stat" key={String(l)}><div className="stat-label">{l}</div><div className="stat-value small">{String(v)}</div></div>)}</div>
          <div className="grid-2">
            <div className="card"><div className="card-head"><div><b>Recent Purchase Orders</b><span>Latest procurement activity</span></div><button className="btn ghost xs" onClick={()=>selectTab("orders")} type="button">Open PO module</button></div><div className="table-wrap"><table><thead><tr><th>PO</th><th>Supplier</th><th>Status</th><th>Total</th></tr></thead><tbody>{orders.slice(0,8).map(o=><tr key={o.id}><td className="mono">{o.poNumber}</td><td>{o.vendorName}</td><td>{o.status}</td><td>₱{Number(o.total||0).toLocaleString()}</td></tr>)}</tbody></table></div></div>
            <div className="card"><div className="card-head"><div><b>Supplier Evaluation Control</b><span>Automatic email, submission and completion monitoring</span></div><button className="btn ghost xs" onClick={()=>selectTab("evaluations")} type="button">Manage</button></div><div className="workflow"><Step n="01" t="PO delivery trigger" d="Delivered / Received / Completed POs can trigger evaluation dispatch."/><Step n="02" t="Email dispatch" d="Resend or override the evaluator email from this console."/><Step n="03" t="Submission" d="Submitted evaluations remain protected and are never downgraded to pending."/><Step n="04" t="Spreadsheet sync" d="Historical and new evaluations reconcile to the evaluation workbook."/></div></div>
          </div>
        </>}

        {tab === "orders" && <AdminTable title="Purchase Order Administration" description="Review all orders, status, delivery dates, PO value and evaluation state." action={<button className="btn primary" onClick={()=>onNavigate("orders")} type="button"><FileText /> Open Purchase Orders</button>}><table><thead><tr><th>PO #</th><th>Supplier</th><th>PRF</th><th>Buyer</th><th>Delivery</th><th>Status</th><th>Evaluation</th><th>Total</th></tr></thead><tbody>{orders.map(o=>{const ev=evals.find(e=>e.poNumber===o.poNumber);return <tr key={o.id}><td className="mono">{o.poNumber}</td><td>{o.vendorName}</td><td>{o.prfNo||"—"}</td><td>{o.buyerName||"—"}</td><td>{o.expectedDate||"—"}</td><td>{o.status}</td><td>{ev?.status||"Not created"}</td><td>₱{Number(o.total||0).toLocaleString()}</td></tr>})}</tbody></table></AdminTable>}

        {tab === "suppliers" && <AdminTable title="Supplier Master & Ratings" description="Vendor master plus evaluation score visibility and direct access to the full supplier directory." action={<button className="btn primary" onClick={()=>selectTab("suppliers")} type="button"><Store /> Open Supplier Directory</button>}><table><thead><tr><th>Supplier</th><th>Contact</th><th>Email</th><th>Phone</th><th>Evaluations</th><th>Avg Score</th></tr></thead><tbody>{suppliers.map(s=>{const rows=evals.filter(e=>(e.vendorId&&e.vendorId===s.id)||e.vendorName===s.name);const score=rows.filter(e=>Number(e.overallScore)>0);const avg=score.length?score.reduce((x,e)=>x+Number(e.overallScore||0),0)/score.length:0;return <tr key={s.id}><td><b>{s.name}</b></td><td>{s.contact||"—"}</td><td>{s.email||"—"}</td><td>{s.phone||"—"}</td><td>{rows.length}</td><td>{avg?avg.toFixed(2):"—"}</td></tr>})}</tbody></table></AdminTable>}

        {tab === "evaluations" && <>
          <PageHead title="Supplier Evaluation Administration" icon={<ClipboardCheck />} action={<div className="row-actions"><button className="btn ghost" onClick={()=>onNavigate("evaluations")} type="button">Open evaluator page</button></div>} />
          <div className="card"><div className="card-head"><div><b>Evaluation queue</b><span>Pending, sent, opened, submitted and overdue evaluation records</span></div><div className="row-actions"><input className="field" placeholder="Search PO / supplier / evaluator" value={search} onChange={e=>setSearch(e.target.value)} /><select className="field" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="sent">Sent</option><option value="opened">Opened</option><option value="submitted">Submitted</option><option value="overdue">Overdue</option></select></div></div><div className="table-wrap"><table><thead><tr><th>PO</th><th>Supplier</th><th>Evaluator</th><th>Status</th><th>Score</th><th>Submitted</th><th>Actions</th></tr></thead><tbody>{filteredEvals.map(e=><tr key={e.id}><td className="mono">{e.poNumber}</td><td>{e.vendorName}</td><td>{e.evaluatorEmail||"—"}</td><td><span className={`badge ${["submitted","completed","evaluated"].includes(String(e.status).toLowerCase())?"green":"amber"}`}>{e.status}</span></td><td>{e.overallScore?Number(e.overallScore).toFixed(2):"—"}</td><td>{e.submittedAt||"—"}</td><td className="row-actions"><button className="btn xs" onClick={()=>{setEmailTarget(e);setEmail(e.evaluatorEmail||"")}} type="button"><Send /> Resend</button><button className="btn xs" onClick={()=>{navigator.clipboard?.writeText(`${window.location.origin}/evaluate/${e.token}`);onError("Evaluation link copied.")}} type="button">Copy link</button></td></tr>)}</tbody></table></div></div>
          <div className="grid-2" style={{marginTop:16}}><div className="card"><div className="card-head"><div><b>Evaluation Criteria Snapshot</b><span>Average score across submitted evaluations</span></div></div><div style={{padding:18,display:"grid",gap:12}}>{[["Accurate Delivery / Quality",evals.map(e=>e.accurateDelivery)],["Competitive Price",evals.map(e=>e.competitivePrice)],["Timeliness of Delivery",evals.map(e=>e.timeliness)],["After Sales Services",evals.map(e=>e.afterSales)],["Compliance",evals.map(e=>e.compliance)]].map(([label,vals])=>{const a=(vals as number[]).filter(Boolean);const v=a.length?a.reduce((x,n)=>x+Number(n||0),0)/a.length:0;return <div key={String(label)}><div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><b>{String(label)}</b><span>{v.toFixed(2)}</span></div><div className="meter"><span style={{width:`${Math.min(100,(v/5)*100)}%`}} /></div></div>})}</div></div><div className="card"><div className="card-head"><div><b>Evaluation Health</b><span>Completion and dispatch monitoring</span></div></div><div style={{padding:18,display:"grid",gap:12}}><Metric label="Submitted" value={submitted} total={evals.length}/><Metric label="Sent / Opened" value={sent} total={evals.length}/><Metric label="Pending" value={pending} total={evals.length}/><Metric label="Average Score" value={avgScore.toFixed(2)} /></div></div></div>
        </>}

        {tab === "routing" && <><PageHead title="RouteTrack Control Center" icon={<Route />} action={<button className="btn primary" onClick={()=>onNavigate("routing")} type="button"><Route /> Open full RouteTrack module</button>} /><div className="stats">{[["Total Routes",routes.length],["Open",routes.filter(r=>!["Completed","Cancelled"].includes(r.status)).length],["Completed",completedRoutes],["Overdue",overdue]].map(([l,v])=><div className="stat" key={String(l)}><div className="stat-label">{l}</div><div className="stat-value">{String(v)}</div></div>)}</div><div className="card"><div className="card-head"><div><b>Full routing history monitor</b><span>PRF + SRF + PO-linked records from all V2 monitoring tabs. From/To/Holder are derived from the latest populated workflow stage.</span></div><div className="row-actions"><select className="field" value={routeTypeFilter} onChange={e=>setRouteTypeFilter(e.target.value)}><option value="all">All document types</option><option value="prf">PRF</option><option value="srf">SRF</option></select><input className="field" placeholder="Search route / PO / holder" value={search} onChange={e=>setSearch(e.target.value)} /></div></div><div className="table-wrap"><table><thead><tr><th>Tracking</th><th>Reference</th><th>From → To</th><th>Holder</th><th>Status</th><th>History</th><th>Action</th></tr></thead><tbody>{filteredRoutes.map(r=><tr key={r.id}><td className="mono">{r.trackingId}</td><td>{r.referenceNo||r.poNumber||r.prfNo||"—"}</td><td>{r.from||"—"} → {r.to||"—"}</td><td>{r.currentHolder||"—"}</td><td>{r.status}</td><td>{(r.history||[]).length}</td><td><button className="btn xs" onClick={()=>setRouteSelected(r)} type="button">View history</button></td></tr>)}</tbody></table></div></div>{routeSelected&&<Modal title={`Route History · ${routeSelected.trackingId}`} onClose={()=>setRouteSelected(null)}><div className="timeline">{(routeSelected.history||[]).slice().reverse().map((h,i)=><div key={i} className="timeline-item"><div className="timeline-dot"/><div><b>{h.action}</b><span>{h.from||"—"} → {h.to||"—"} · {h.currentHolder||"—"} · {h.status||"—"}</span><small>{h.timestamp||""}{h.remarks?` · ${h.remarks}`:""}</small></div></div>)}</div></Modal>}</>}

        {tab === "buyers" && <MasterDataPanel title="Buyer Management" data={buyers} columns={["Name","Title","Email"]} onAdd={()=>{setMasterKind("buyer");setMasterDraft({name:"",title:"",email:""})}} onEdit={(v)=>{setMasterKind("buyer");setMasterDraft({...v})}} onDelete={(id)=>void removeMaster("buyer",id)} renderRow={(v)=>[v.name,v.title||"—",v.email||"—"]} />}
        {tab === "addresses" && <MasterDataPanel title="Delivery Address Management" data={addresses} columns={["Name","Address"]} onAdd={()=>{setMasterKind("address");setMasterDraft({name:"",address:""})}} onEdit={(v)=>{setMasterKind("address");setMasterDraft({...v})}} onDelete={(id)=>void removeMaster("address",id)} renderRow={(v)=>[v.name,v.address]} />}
        {tab === "employees" && <MasterDataPanel title="Employee / Requisitioner Management" data={employees} columns={["Name","Email","Department","Title"]} onAdd={()=>{setMasterKind("employee");setMasterDraft({name:"",email:"",department:"",title:""})}} onEdit={(v)=>{setMasterKind("employee");setMasterDraft({...v})}} onDelete={(id)=>void removeMaster("employee",id)} renderRow={(v)=>[v.name,v.email||"—",v.department||"—",v.title||"—"]} />}

        {tab === "users" && <AdminTable title="User Access Management" description="Admin-only role and access controls aligned with the original SISC Users page." action={<button className="btn primary" onClick={()=>setUserDraft({email:"",displayName:"",role:"purchasing",active:true})} type="button"><UserPlus /> Add User</button>}><div className="row-actions" style={{padding:14,borderBottom:"1px solid #e5e7eb"}}><input className="field" style={{minWidth:280}} placeholder="Search user" value={search} onChange={e=>setSearch(e.target.value)} /></div><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Department</th><th>Action</th></tr></thead><tbody>{filteredUsers.map(u=><tr key={u.id}><td>{u.email}</td><td>{u.displayName}</td><td><select className="field compact" value={u.role} onChange={async e=>{await saveEntity("users",{...u,role:e.target.value});setUsers(await getCollection<UserProfile>("users"))}}>{["admin","purchasing","head","requisitioner","amd","approver","viewer"].map(r=><option key={r} value={r}>{r}</option>)}</select></td><td><button className={`badge ${u.active?"green":"red"}`} onClick={async()=>{await saveEntity("users",{...u,active:!u.active});setUsers(await getCollection<UserProfile>("users"))}} type="button">{u.active?"Active":"Disabled"}</button></td><td>{u.department||"—"}</td><td><button className="btn xs" onClick={()=>setUserDraft({...u})} type="button">Edit</button><button className="btn xs danger" onClick={async()=>{if(confirm("Delete this user profile?")){await removeEntity("users",u.id);setUsers(await getCollection<UserProfile>("users"))}}} type="button"><Trash2 /></button></td></tr>)}</tbody></table></AdminTable>}

        {tab === "notifications" && <><PageHead title="Overdue Delivery Notifications" icon={<BellRing />} /><div className="card"><div className="card-head"><div><b>Daily overdue workflow</b><span>The original SISC basis provides overdue review and manual notification actions; this admin screen keeps that control without Apps Script.</span></div></div><div style={{padding:18,display:"grid",gap:16}}><div className="alert-box"><AlertTriangle /><div><b>{orders.filter(o=>o.expectedDate && !["Delivered","Completed"].includes(String(o.status)) && new Date(o.expectedDate)<new Date()).length} overdue purchase order(s)</b><span>Only POs past expected delivery and not marked Delivered/Completed are included.</span></div></div><label className="form-label">Recipient Email(s)<input className="field" placeholder="buyer@example.com, procurement@example.com" value={notifEmail} onChange={e=>setNotifEmail(e.target.value)} /></label><div className="row-actions"><button className="btn primary" onClick={()=>void sendOverdue()} type="button"><Mail /> Send overdue notification now</button><button className="btn ghost" onClick={()=>onError(`Found ${overdue} overdue route(s) and ${orders.filter(o=>o.expectedDate && !["Delivered","Completed"].includes(String(o.status)) && new Date(o.expectedDate)<new Date()).length} overdue PO(s).`)} type="button"><Search /> Preview</button></div></div></div></>}

        {tab === "analytics" && <AdminAnalytics routes={routes} evals={evals} orders={orders} />}

        {tab === "sync" && <><PageHead title="Admin Sync Center" icon={<RefreshCw />} action={<button className="btn primary" disabled={syncing} onClick={onSync} type="button"><RefreshCw className={syncing?"spin":""} /> {syncing?"Syncing…":"Full Reconciliation"}</button>} /><div className="grid-2"><div className="card"><div className="card-head"><div><b>Connected data sets</b><span>Full reconciliation, not append-only.</span></div></div><div style={{padding:18,display:"grid",gap:12}}><Metric label="Supplier Evaluations" value={evals.length}/><Metric label="Purchase Requests" value={requests.length}/><Metric label="Purchase Orders" value={orders.length}/><Metric label="Routes" value={routes.length}/></div></div><div className="card"><div className="card-head"><div><b>Sheets covered</b><span>All historical records are included.</span></div></div><div style={{padding:18,lineHeight:2}}><div>✓ PO for Evaluation</div><div>✓ PRF Details v2</div><div>✓ Route / monitoring sheet</div><div>✓ Firestore reconciliation</div></div></div></div><div className="card" style={{marginTop:16}}><div className="card-head"><div><b>Safe sync rules</b><span>Completed evaluations are never downgraded to pending.</span></div></div><div className="workflow"><Step n="01" t="Import" d="Read existing spreadsheet rows."/><Step n="02" t="Normalize" d="Map status, PO, PRF, evaluator and routing identifiers."/><Step n="03" t="Merge" d="Preserve completed/stronger Firestore records."/><Step n="04" t="Export" d="Update existing rows and append genuinely new records."/></div></div></>}

        {tab === "settings" && <SettingsPage profile={profile} adminMode />}

        {emailTarget && <Modal title="Resend Supplier Evaluation" onClose={()=>setEmailTarget(null)}><div className="form-grid"><div style={{fontWeight:800}}>{emailTarget.vendorName} · PO {emailTarget.poNumber}</div><label className="form-label">Recipient Email<input className="field" type="email" value={email} onChange={e=>setEmail(e.target.value)} /></label><div className="info-strip"><Mail /><div><b>Submitted evaluations are protected</b><span>Resending will not overwrite a submitted response.</span></div></div></div><div className="modal-actions"><button className="btn ghost" onClick={()=>setEmailTarget(null)} type="button">Cancel</button><button className="btn primary" disabled={sending} onClick={()=>void resend(emailTarget)} type="button">{sending?"Sending…":"Send Evaluation Email"}</button></div></Modal>}
        {userDraft && <Modal title={userDraft.id?"Edit User":"Add User Profile"} onClose={()=>setUserDraft(null)}><div className="form-grid"><label className="form-label">Email<input className="field" value={userDraft.email||""} onChange={e=>setUserDraft({...userDraft,email:e.target.value})}/></label><label className="form-label">Display Name<input className="field" value={userDraft.displayName||""} onChange={e=>setUserDraft({...userDraft,displayName:e.target.value})}/></label><label className="form-label">Role<select className="field" value={userDraft.role||"purchasing"} onChange={e=>setUserDraft({...userDraft,role:e.target.value as any})}>{["admin","purchasing","head","requisitioner","amd","approver","viewer"].map(r=><option key={r} value={r}>{r}</option>)}</select></label><label className="form-label">Department<input className="field" value={userDraft.department||""} onChange={e=>setUserDraft({...userDraft,department:e.target.value})}/></label><label className="form-label"><input type="checkbox" checked={userDraft.active!==false} onChange={e=>setUserDraft({...userDraft,active:e.target.checked})}/> Active</label></div><div className="modal-actions"><button className="btn ghost" onClick={()=>setUserDraft(null)} type="button">Cancel</button><button className="btn primary" onClick={()=>void saveUser()} type="button">Save User</button></div></Modal>}
        {masterDraft && <Modal title={`${masterKind === "buyer" ? "Buyer" : masterKind === "address" ? "Delivery Address" : "Employee"} Master Data`} onClose={()=>{setMasterDraft(null);setMasterKind(null)}}><div className="form-grid">{masterKind==="buyer"&&<><label className="form-label">Name<input className="field" value={masterDraft.name||""} onChange={e=>setMasterDraft({...masterDraft,name:e.target.value})}/></label><label className="form-label">Position / Title<input className="field" value={masterDraft.title||""} onChange={e=>setMasterDraft({...masterDraft,title:e.target.value})}/></label><label className="form-label">Email<input className="field" value={masterDraft.email||""} onChange={e=>setMasterDraft({...masterDraft,email:e.target.value})}/></label></>}{masterKind==="address"&&<><label className="form-label">Label / Name<input className="field" value={masterDraft.name||""} onChange={e=>setMasterDraft({...masterDraft,name:e.target.value})}/></label><label className="form-label">Full Address<textarea className="field" value={masterDraft.address||""} onChange={e=>setMasterDraft({...masterDraft,address:e.target.value})}/></label></>}{masterKind==="employee"&&<><label className="form-label">Full Name<input className="field" value={masterDraft.name||""} onChange={e=>setMasterDraft({...masterDraft,name:e.target.value})}/></label><label className="form-label">Email<input className="field" value={masterDraft.email||""} onChange={e=>setMasterDraft({...masterDraft,email:e.target.value})}/></label><label className="form-label">Department<input className="field" value={masterDraft.department||""} onChange={e=>setMasterDraft({...masterDraft,department:e.target.value})}/></label><label className="form-label">Position / Title<input className="field" value={masterDraft.title||""} onChange={e=>setMasterDraft({...masterDraft,title:e.target.value})}/></label></>}</div><div className="modal-actions"><button className="btn ghost" onClick={()=>{setMasterDraft(null);setMasterKind(null)}} type="button">Cancel</button><button className="btn primary" onClick={()=>void saveMaster()} type="button">Save</button></div></Modal>}
      </section>
    </div>;
}

function AdminTable({ title, description, action, children }: { title:string; description:string; action?:ReactNode; children:ReactNode }) {
  return <div className="card"><div className="card-head"><div><b>{title}</b><span>{description}</span></div>{action}</div><div className="table-wrap">{children}</div></div>;
}

function MasterDataPanel<T extends {id:string}>({ title, data, columns, renderRow, onAdd, onEdit, onDelete }: { title:string; data:T[]; columns:string[]; renderRow:(v:T)=>any[]; onAdd:()=>void; onEdit:(v:T)=>void; onDelete:(id:string)=>void }) {
  return <AdminTable title={title} description="Master-data management aligned with the original purchasing system." action={<button className="btn primary" onClick={onAdd} type="button"><Plus /> Add</button>}><table><thead><tr>{columns.map(c=><th key={c}>{c}</th>)}<th>Actions</th></tr></thead><tbody>{data.map(v=><tr key={v.id}>{renderRow(v).map((x,i)=><td key={i}>{String(x)}</td>)}<td className="row-actions"><button className="btn xs" onClick={()=>onEdit(v)} type="button">Edit</button><button className="btn xs danger" onClick={()=>onDelete(v.id)} type="button"><Trash2 /></button></td></tr>)}</tbody></table>{!data.length&&<Empty text="No records yet."/>}</AdminTable>;
}

function Metric({ label, value, total }: { label:string; value:number|string; total?:number }) {
  const pct = total && Number(total) ? Math.min(100, (Number(value)/Number(total))*100) : null;
  return <div><div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><b>{label}</b><span>{String(value)}{pct!==null?` · ${pct.toFixed(0)}%`:""}</span></div>{pct!==null&&<div className="meter"><span style={{width:`${pct}%`}} /></div>}</div>;
}

function AdminAnalytics({ routes, evals, orders }: { routes: RouteRecord[]; evals: SupplierEvaluation[]; orders: PurchaseOrder[] }) {
  const [mode,setMode]=useState<"supplier"|"po">("supplier");
  const rated = evals.filter(e=>Number(e.overallScore)>0);
  const avg = rated.length ? rated.reduce((s,e)=>s+Number(e.overallScore||0),0)/rated.length : 0;
  const criteria = [
    ["Accurate Delivery / Quality", evals.map(e=>e.accurateDelivery)],
    ["Competitive Price", evals.map(e=>e.competitivePrice)],
    ["Timeliness of Delivery", evals.map(e=>e.timeliness)],
    ["After Sales Services", evals.map(e=>e.afterSales)],
    ["Compliance", evals.map(e=>e.compliance)]
  ] as Array<[string,number[]]>;
  const supplierMap = new Map<string,{sum:number;count:number}>();
  rated.forEach(e=>{const k=e.vendorName||"Unknown";const x=supplierMap.get(k)||{sum:0,count:0};x.sum+=Number(e.overallScore||0);x.count++;supplierMap.set(k,x)});
  const scorecard=[...supplierMap.entries()].map(([vendor,v])=>({vendor,avg:v.sum/v.count,count:v.count})).sort((a,b)=>b.avg-a.avg);
  const overduePOs=orders.filter(o=>o.expectedDate&&!['Delivered','Completed'].includes(String(o.status))&&new Date(o.expectedDate)<new Date());
  const delivered=orders.filter(o=>['Delivered','Completed'].includes(String(o.status)) && (o.actualDeliveryDate||o.deliveryDate||o.createdAt));
  const leadTimes=delivered.map(o=>{const start=new Date(o.createdAt).getTime();const end=new Date(o.actualDeliveryDate||o.deliveryDate||o.expectedDate||o.createdAt).getTime();return Math.max(0,(end-start)/86400000)});
  const avgLead=leadTimes.length?leadTimes.reduce((a,b)=>a+b,0)/leadTimes.length:0;
  const statusCount=orders.reduce<Record<string,number>>((m,o)=>{m[o.status||"Unknown"]=(m[o.status||"Unknown"]||0)+1;return m},{});
  const spendByMonth=new Map<string,number>(); orders.forEach(o=>{const d=new Date(o.createdAt);const k=isNaN(d.getTime())?"Unknown":d.toISOString().slice(0,7);spendByMonth.set(k,(spendByMonth.get(k)||0)+Number(o.total||0));});
  return <div><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,marginBottom:16}}><div className="segmented"><button className={mode==="supplier"?"active":""} onClick={()=>setMode("supplier")} type="button">⭐ Supplier Eval</button><button className={mode==="po"?"active":""} onClick={()=>setMode("po")} type="button">📋 Purchase Orders</button></div></div>{mode==="supplier"?<>
    <div className="stats">{[["Evaluations",evals.length],["Submitted",rated.length],["Average Score",avg.toFixed(2)],["Vendors Rated",scorecard.length],["Completion Rate",`${evals.length?((rated.length/evals.length)*100).toFixed(0):0}%`]].map(([l,v])=><div className="stat" key={String(l)}><div className="stat-label">{l}</div><div className="stat-value small">{String(v)}</div></div>)}</div>
    <div className="grid-2"><div className="card"><div className="card-head"><div><b>Supplier Scorecard</b><span>All-time average supplier scores</span></div></div><div style={{padding:18,display:"grid",gap:12}}>{scorecard.slice(0,15).map(v=><div key={v.vendor}><div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><b>{v.vendor}</b><span>{v.avg.toFixed(2)} · {v.count}</span></div><div className="meter"><span style={{width:`${Math.min(100,(v.avg/5)*100)}%`}} /></div></div>)}{!scorecard.length&&<Empty text="No submitted evaluations yet."/>}</div></div><div className="card"><div className="card-head"><div><b>Top Vendors by Criterion</b><span>Average criterion performance</span></div></div><div style={{padding:18,display:"grid",gap:14}}>{criteria.map(([label,vals])=>{const a=vals.filter(Boolean);const v=a.length?a.reduce((x,n)=>x+Number(n||0),0)/a.length:0;return <Metric key={label} label={label} value={v.toFixed(2)} />})}</div></div></div>
    <div className="grid-2" style={{marginTop:16}}><div className="card"><div className="card-head"><b>Evaluator Participation</b></div><div style={{padding:18}}><Metric label="Submitted" value={rated.length} total={evals.length}/><Metric label="Not Yet Submitted" value={evals.length-rated.length} total={evals.length}/></div></div><div className="card"><div className="card-head"><b>PO Value vs Supplier Score</b></div><div className="table-wrap"><table><thead><tr><th>PO</th><th>Value</th><th>Supplier</th><th>Score</th></tr></thead><tbody>{rated.slice(0,20).map(e=><tr key={e.id}><td className="mono">{e.poNumber}</td><td>₱{Number(e.totalAmount||0).toLocaleString()}</td><td>{e.vendorName}</td><td>{Number(e.overallScore||0).toFixed(2)}</td></tr>)}</tbody></table></div></div></div>
  </>:<>
    <div className="stats">{[["POs",orders.length],["PO Spend",`₱${orders.reduce((s,o)=>s+Number(o.total||0),0).toLocaleString()}`],["Pending",orders.filter(o=>o.status==="Pending").length],["Delivered",orders.filter(o=>["Delivered","Completed"].includes(o.status)).length],["Overdue",overduePOs.length],["Avg Lead Time",`${avgLead.toFixed(1)} d`]].map(([l,v])=><div className="stat" key={String(l)}><div className="stat-label">{l}</div><div className="stat-value small">{String(v)}</div></div>)}</div>
    <div className="grid-2"><div className="card"><div className="card-head"><b>Spending Overview</b></div><div style={{padding:18,display:"grid",gap:10}}>{[...spendByMonth.entries()].slice(-12).map(([k,v])=><div key={k}><div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><b>{k}</b><span>₱{v.toLocaleString()}</span></div><div className="meter"><span style={{width:`${Math.min(100,(v/Math.max(...[...spendByMonth.values(),1]))*100)}%`}} /></div></div>)}{!spendByMonth.size&&<Empty text="No purchase order data."/>}</div></div><div className="card"><div className="card-head"><b>Order Status Breakdown</b></div><div style={{padding:18,display:"grid",gap:10}}>{Object.entries(statusCount).map(([k,v])=><Metric key={k} label={k} value={v} total={orders.length}/>)}</div></div></div>
    <div className="grid-2" style={{marginTop:16}}><div className="card"><div className="card-head"><b>Overdue Analysis</b></div><div className="table-wrap"><table><thead><tr><th>PO</th><th>Supplier</th><th>Expected</th><th>Days</th></tr></thead><tbody>{overduePOs.map(o=>{const days=Math.max(0,Math.floor((Date.now()-new Date(o.expectedDate!).getTime())/86400000));return <tr key={o.id}><td className="mono">{o.poNumber}</td><td>{o.vendorName}</td><td>{o.expectedDate}</td><td>{days}</td></tr>})}</tbody></table>{!overduePOs.length&&<Empty text="No overdue purchase orders."/>}</div></div><div className="card"><div className="card-head"><b>Delivery Lead Time</b></div><div style={{padding:18}}><div style={{fontSize:36,fontWeight:900}}>{avgLead.toFixed(1)} <span style={{fontSize:14,color:"#64748b"}}>days</span></div><div style={{fontSize:12,color:"#64748b",marginTop:8}}>Average from PO creation to actual delivery/completion using available dates.</div></div></div></div>
  </>}</div>;
}

/* =========================================================
   SETTINGS
========================================================= */

function SettingsPage({ profile, adminMode = false }: { profile: UserProfile | null; adminMode?: boolean }) {
  const [cfg, setCfg] = useState({ companyName:"", address:"", email:"", approverName:"", amdEmails:"", overdueEmails:"", logoUrl:"" });
  const [saving, setSaving] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    getCollection<any>("system").then(rows => {
      const s = rows.find((x:any)=>x.id === "settings") || {};
      if (mounted) setCfg({
        companyName: s.companyName || s.company_name || "",
        address: s.address || s.company_address || "",
        email: s.email || s.company_email || "",
        approverName: s.approverName || s.approver_name || "",
        amdEmails: s.amdEmails || s.amd_email || "",
        overdueEmails: s.overdueEmails || "",
        logoUrl: s.logoUrl || s.logo_url || ""
      });
    }).catch(()=>{});
    return ()=>{mounted=false};
  }, []);

  async function save() {
    setSaving(true);
    try {
      await saveEntity("system", { id:"settings", ...cfg, updatedAt:new Date().toISOString() });
      window.dispatchEvent(new Event("pms-settings-updated"));
      alert("System settings saved.");
    } catch (e:any) { alert(e?.message || "Unable to save settings."); }
    finally { setSaving(false); }
  }

  async function onLogo(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return alert("Please choose an image file.");
    if (file.size > 5*1024*1024) return alert("Maximum logo size is 5 MB.");
    setLogoBusy(true);
    try {
      const uploaded = await uploadDocument(file, "branding");
      setCfg(v=>({...v,logoUrl:uploaded.url}));
      await saveEntity("system", { id:"settings", logoUrl:uploaded.url, updatedAt:new Date().toISOString() });
      alert("Logo uploaded.");
    } catch (e:any) { alert(e?.message || "Logo upload failed."); }
    finally { setLogoBusy(false); }
  }

  const avatar = (profile?.displayName || "P").slice(0,1).toUpperCase();
  return <div className="page">
    <PageHead title={adminMode ? "System Administration Settings" : "Workspace Settings"} icon={<Settings />} />
    {adminMode && <div className="info-strip" style={{marginBottom:16}}><ShieldCheck /><div><b>Administrator configuration</b><span>These controls replace the old Apps Script Settings screen: company identity, approver, AMD evaluation recipients, overdue notification recipients and logo.</span></div></div>}
    <div className="settings-grid">
      <div className="card"><div className="card-head"><div><b>Company Info</b><span>Used for purchasing documents and administration.</span></div></div><div className="form-grid" style={{padding:18}}><label className="form-label">Company Name<input className="field" value={cfg.companyName} onChange={e=>setCfg({...cfg,companyName:e.target.value})}/></label><label className="form-label">Address<textarea className="field" value={cfg.address} onChange={e=>setCfg({...cfg,address:e.target.value})}/></label><label className="form-label">Company Email<input className="field" type="email" value={cfg.email} onChange={e=>setCfg({...cfg,email:e.target.value})}/></label><label className="form-label">Approver Name<input className="field" value={cfg.approverName} onChange={e=>setCfg({...cfg,approverName:e.target.value})}/></label><label className="form-label">AMD Personnel Email(s)<span style={{display:"block",fontSize:11,fontWeight:400,color:"#64748b"}}>Comma-separated recipients for supplier evaluation</span><input className="field" value={cfg.amdEmails} onChange={e=>setCfg({...cfg,amdEmails:e.target.value})}/></label><label className="form-label">Overdue Notification Email(s)<span style={{display:"block",fontSize:11,fontWeight:400,color:"#64748b"}}>Recipients for overdue PO alerts</span><input className="field" value={cfg.overdueEmails} onChange={e=>setCfg({...cfg,overdueEmails:e.target.value})}/></label><div className="form-label">Company Logo<div className="row-actions" style={{marginTop:6}}><label className="btn ghost" style={{cursor:"pointer"}}>{logoBusy?"Uploading…":"Upload Logo"}<input hidden type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={e=>void onLogo(e.target.files?.[0])}/></label>{cfg.logoUrl&&<img src={cfg.logoUrl} alt="Company logo" style={{maxHeight:64,maxWidth:180,objectFit:"contain",border:"1px solid #e5e7eb",borderRadius:8,padding:6}}/>}</div></div></div><div className="modal-actions" style={{padding:0,marginTop:18}}><button className="btn primary" disabled={saving} onClick={()=>void save()} type="button">{saving?"Saving…":"Save System Settings"}</button></div></div>
      <div className="card"><div className="card-head"><div><b>Current Account</b><span>Role-based access is stored in Firestore.</span></div></div><div className="account-row"><div className="avatar large">{avatar}</div><div><b>{profile?.displayName||"User"}</b><span>{profile?.email||"—"}</span><em>{profile?.role||"viewer"}</em></div></div><div style={{padding:"0 18px 18px"}}><div className="info-strip"><Activity /><div><b>Admin visibility</b><span>Admin users get the dedicated console with user access, supplier evaluation administration, RouteTrack control, sync, notifications, analytics and master-data tools.</span></div></div></div></div>
    </div>
  </div>;
}

/* =========================================================
   PAGE HEADER
========================================================= */

function PageHead({
  title: pageTitle,
  icon,
  action
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">

      <div>

        <div className="eyebrow">

          <span>
            {icon}
          </span>

          PURCHASING WORKSPACE

        </div>

        <h2>
          {pageTitle}
        </h2>

      </div>

      {action}

    </div>
  );
}

/* =========================================================
   MODAL
========================================================= */

function Modal({
  title: modalTitle,
  onClose,
  children
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop">

      <div className="modal">

        <div className="modal-head">

          <b>
            {modalTitle}
          </b>

          <button
            className="icon-btn"
            onClick={onClose}
            type="button"
          >
            <X />
          </button>

        </div>

        <div className="modal-body">
          {children}
        </div>

      </div>

    </div>
  );
}

/* =========================================================
   EMPTY
========================================================= */

function Empty({
  text
}: {
  text: string;
}) {
  return (
    <div className="empty">

      <div className="empty-icon">
        <Archive />
      </div>

      <b>
        {text}
      </b>

      <span>
        Use the action above to
        add your first record.
      </span>

    </div>
  );
}

/* =========================================================
   WORKFLOW STEP
========================================================= */

function Step({
  n,
  t,
  d
}: {
  n: string;
  t: string;
  d: string;
}) {
  return (
    <div className="step">

      <div>
        {n}
      </div>

      <article>

        <b>
          {t}
        </b>

        <span>
          {d}
        </span>

      </article>

    </div>
  );
}