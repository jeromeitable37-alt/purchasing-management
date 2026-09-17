"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  DollarSign,
  FileText,
  Loader2,
  MessageSquareText,
  PackageCheck,
  ShieldCheck,
  Star,
  Truck,
  X,
} from "lucide-react";

type Rating = 0 | 1 | 2 | 3 | 4 | 5;

type Criterion = {
  id: "accurateDelivery" | "competitivePrice" | "timeliness" | "afterSales" | "compliance";
  title: string;
  description: string;
  icon: React.ReactNode;
};

type EvaluationRecord = {
  id?: string;
  token?: string;

  poNumber?: string;
  prfNo?: string;
  vendorName?: string;
  supplier?: string;

  evaluatorName?: string;
  evaluatorEmail?: string;
  evaluatorRole?: string;

  status?: string;

  deliveryDate?: string;
  expectedDeliveryDate?: string;
  actualDeliveryDate?: string;
  totalAmount?: number | string;
  itemsDelivered?: string;

  accurateDelivery?: number;
  competitivePrice?: number;
  timeliness?: number;
  afterSales?: number;
  compliance?: number;

  comments?: string;

  overallScore?: number;
  submittedAt?: string;
};

type ApiResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
  evaluation?: EvaluationRecord;
  data?: EvaluationRecord;
  alreadySubmitted?: boolean;
};

const REQUISITIONER_CRITERIA: Criterion[] = [
  {
    id: "accurateDelivery",
    title: "Accurate Delivery / Quality",
    description:
      "Were the items delivered accurately and did they meet the expected quality standards?",
    icon: <PackageCheck size={19} />,
  },
  {
    id: "competitivePrice",
    title: "Competitive Price",
    description:
      "Were the prices competitive, reasonable, and appropriate for the purchase?",
    icon: <DollarSign size={19} />,
  },
  {
    id: "timeliness",
    title: "Timeliness of Delivery",
    description:
      "Was the delivery completed on time according to the agreed schedule?",
    icon: <Clock3 size={19} />,
  },
  {
    id: "afterSales",
    title: "After Sales Services",
    description:
      "Did the supplier provide adequate support, communication, and assistance after delivery?",
    icon: <Truck size={19} />,
  },
];

const COMPLIANCE_CRITERION: Criterion = {
  id: "compliance",
  title: "Compliance with Regulatory Requirements and School Policies",
  description:
    "Did the supplier comply with applicable regulatory requirements and school policies?",
  icon: <ShieldCheck size={19} />,
};

const SCORE_LABELS: Record<number, string> = {
  1: "Poor",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Excellent",
};

function getRoleLabel(role?: string) {
  const value = String(role || "requisitioner")
    .replace(/_/g, " ")
    .toLowerCase();

  if (value === "purchaser") return "Purchaser";
  if (value === "amd" || value === "amd personnel") return "AMD Personnel";
  if (value === "requisitioner") return "Requisitioner";

  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isPurchaser(role?: string) {
  return String(role || "").toLowerCase() === "purchaser";
}

function normalizeEvaluation(payload: ApiResponse | EvaluationRecord): EvaluationRecord | null {
  const raw =
    "evaluation" in payload
      ? payload.evaluation
      : "data" in payload
        ? payload.data
        : payload;

  if (!raw || typeof raw !== "object") {
    return null;
  }

  const record = raw as EvaluationRecord;

  return {
    ...record,

    poNumber: String(record.poNumber ?? ""),
    prfNo: String(record.prfNo ?? ""),
    vendorName: String(record.vendorName ?? record.supplier ?? ""),
    supplier: String(record.supplier ?? record.vendorName ?? ""),

    evaluatorName: String(record.evaluatorName ?? ""),
    evaluatorEmail: String(record.evaluatorEmail ?? ""),
    evaluatorRole: String(record.evaluatorRole ?? "requisitioner"),

    status: String(record.status ?? "pending"),

    deliveryDate: String(record.deliveryDate ?? ""),
    expectedDeliveryDate: String(record.expectedDeliveryDate ?? ""),
    actualDeliveryDate: String(record.actualDeliveryDate ?? ""),

    totalAmount:
      record.totalAmount !== undefined && record.totalAmount !== null
        ? record.totalAmount
        : "",

    itemsDelivered: String(record.itemsDelivered ?? ""),

    accurateDelivery: Number(record.accurateDelivery ?? 0),
    competitivePrice: Number(record.competitivePrice ?? 0),
    timeliness: Number(record.timeliness ?? 0),
    afterSales: Number(record.afterSales ?? 0),
    compliance: Number(record.compliance ?? 0),

    comments: String(record.comments ?? ""),

    overallScore:
      record.overallScore !== undefined && record.overallScore !== null
        ? Number(record.overallScore)
        : 0,

    submittedAt: String(record.submittedAt ?? ""),
  };
}

function formatCurrency(value: unknown) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric) || numeric <= 0) {
    return "—";
  }

  return `₱${numeric.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value?: string) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function RatingStars({
  value,
  onChange,
}: {
  value: Rating;
  onChange: (value: Rating) => void;
}) {
  return (
    <div className="rating-wrapper">
      <div className="stars-row" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            className={`star-button ${value >= star ? "active" : ""}`}
            onClick={() => onChange(star as Rating)}
            aria-label={`${star} out of 5`}
            role="radio"
            aria-checked={value === star}
          >
            <Star
              size={25}
              fill={value >= star ? "currentColor" : "none"}
            />
          </button>
        ))}
      </div>

      <div className="rating-scale">
        <span>1 · Poor</span>
        <span>2 · Fair</span>
        <span>3 · Good</span>
        <span>4 · Very Good</span>
        <span>5 · Excellent</span>
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="screen-shell">
      <div className="loading-card">
        <div className="loading-logo">
          <ClipboardCheck size={25} />
        </div>

        <div className="loading-spinner">
          <Loader2 size={19} />
        </div>

        <h1>Loading evaluation</h1>

        <p>
          We're securely retrieving your supplier evaluation request.
        </p>
      </div>
    </main>
  );
}

function ErrorScreen({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <main className="screen-shell">
      <div className="error-card">
        <div className="error-icon">
          <AlertCircle size={31} />
        </div>

        <div className="mini-label">SUPPLIER EVALUATION</div>

        <h1>{title}</h1>

        <p>{message}</p>

        {onRetry && (
          <button type="button" className="secondary-button" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </main>
  );
}

function SuccessScreen({
  evaluation,
}: {
  evaluation: EvaluationRecord;
}) {
  return (
    <main className="screen-shell success-shell">
      <div className="success-card">
        <div className="success-icon">
          <Check size={34} />
        </div>

        <div className="success-badge">
          <span />
          EVALUATION RECORDED
        </div>

        <h1>Thank you for your feedback.</h1>

        <p>
          Your supplier evaluation for{" "}
          <strong>{evaluation.vendorName || "the supplier"}</strong>{" "}
          has been successfully submitted to the Purchasing Office.
        </p>

        <div className="success-summary">
          <div>
            <span>Purchase Order</span>
            <strong>{evaluation.poNumber || "—"}</strong>
          </div>

          <div>
            <span>Your Role</span>
            <strong>{getRoleLabel(evaluation.evaluatorRole)}</strong>
          </div>

          <div>
            <span>Status</span>
            <strong className="status-submitted">Submitted</strong>
          </div>
        </div>

        <div className="success-note">
          <CheckCircle2 size={16} />
          <span>
            Your response has been securely recorded by the Purchasing Office.
          </span>
        </div>
      </div>
    </main>
  );
}

export default function EvaluationPage() {
  const params = useParams<{ token: string | string[] }>();

  const token = Array.isArray(params?.token)
    ? params.token[0]
    : params?.token;

  const [loading, setLoading] = useState(true);
  const [evaluation, setEvaluation] =
    useState<EvaluationRecord | null>(null);

  const [error, setError] = useState("");

  const [ratings, setRatings] = useState<Record<string, Rating>>({
    accurateDelivery: 0,
    competitivePrice: 0,
    timeliness: 0,
    afterSales: 0,
    compliance: 0,
  });

  const [comments, setComments] = useState("");

  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);

  const [submitted, setSubmitted] = useState(false);

  const [submitError, setSubmitError] = useState("");

  const [settings, setSettings] = useState({
    companyName: "Purchasing Management System",
    officeName: "Purchasing Office",
  });

  const criteria = useMemo<Criterion[]>(() => {
    if (isPurchaser(evaluation?.evaluatorRole)) {
      return [...REQUISITIONER_CRITERIA, COMPLIANCE_CRITERION];
    }

    return REQUISITIONER_CRITERIA;
  }, [evaluation?.evaluatorRole]);

  const completedCount = useMemo(() => {
    return criteria.filter((criterion) => {
      return Number(ratings[criterion.id] || 0) > 0;
    }).length;
  }, [criteria, ratings]);

  const progress = criteria.length
    ? Math.round((completedCount / criteria.length) * 100)
    : 0;

  const averagePreview = useMemo(() => {
    const values = criteria
      .map((criterion) => Number(ratings[criterion.id] || 0))
      .filter((value) => value > 0);

    if (!values.length) return 0;

    return (
      values.reduce((total, value) => total + value, 0) / values.length
    );
  }, [criteria, ratings]);

  async function loadEvaluation() {
    if (!token) {
      setError("No evaluation token was provided.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/evaluation/${encodeURIComponent(token)}`,
        {
          method: "GET",
          cache: "no-store",
          headers: {
            Accept: "application/json",
          },
        },
      );

      const contentType =
        response.headers.get("content-type") || "";

      const responseText = await response.text();

      if (!contentType.includes("application/json")) {
        console.error(
          "Evaluation API returned non-JSON:",
          responseText.slice(0, 1000),
        );

        throw new Error(
          `Evaluation service returned ${response.status} ${response.statusText}.`,
        );
      }

      let data: ApiResponse;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          "The evaluation service returned invalid JSON.",
        );
      }

      if (!response.ok || data.ok === false) {
        throw new Error(
          data.error ||
            data.message ||
            "This evaluation link is invalid or has expired.",
        );
      }

      const normalized =
        normalizeEvaluation(data);

      if (!normalized) {
        throw new Error(
          "The evaluation record could not be read.",
        );
      }

      setEvaluation(normalized);

      setRatings({
        accurateDelivery:
          Number(normalized.accurateDelivery || 0) as Rating,
        competitivePrice:
          Number(normalized.competitivePrice || 0) as Rating,
        timeliness:
          Number(normalized.timeliness || 0) as Rating,
        afterSales:
          Number(normalized.afterSales || 0) as Rating,
        compliance:
          Number(normalized.compliance || 0) as Rating,
      });

      setComments(normalized.comments || "");

      if (
        normalized.status?.toLowerCase() === "submitted"
      ) {
        setSubmitted(true);
      }

      // Accept either naming style from your API.
      const apiSettings =
        (data as any)?.settings ||
        (data as any)?.workspace ||
        {};

      setSettings({
        companyName:
          String(
            apiSettings.companyName ||
              apiSettings.name ||
              "Purchasing Management System",
          ),
        officeName:
          String(
            apiSettings.officeName ||
              apiSettings.office ||
              "Purchasing Office",
          ),
      });
    } catch (requestError: any) {
      console.error("Evaluation loading error:", requestError);

      setError(
        requestError?.message ||
          "We could not load this evaluation.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEvaluation();
  }, [token]);

  function setRating(
    id:
      | "accurateDelivery"
      | "competitivePrice"
      | "timeliness"
      | "afterSales"
      | "compliance",
    value: Rating,
  ) {
    setRatings((current) => ({
      ...current,
      [id]: value,
    }));

    setSubmitError("");
  }

  function validateBeforeSubmit() {
    const missing = criteria.filter(
      (criterion) =>
        Number(ratings[criterion.id] || 0) < 1,
    );

    if (missing.length) {
      setSubmitError(
        `Please rate all ${criteria.length} criteria before submitting.`,
      );
      return false;
    }

    return true;
  }

  async function submitEvaluation() {
    if (!evaluation || !token) return;

    if (!validateBeforeSubmit()) {
      setShowConfirm(false);
      return;
    }

    setSubmitting(true);
    setSubmitError("");

    try {
      const payload = {
        token,

        accurateDelivery:
          Number(ratings.accurateDelivery || 0),

        competitivePrice:
          Number(ratings.competitivePrice || 0),

        timeliness:
          Number(ratings.timeliness || 0),

        afterSales:
          Number(ratings.afterSales || 0),

        ...(isPurchaser(evaluation.evaluatorRole)
          ? {
              compliance:
                Number(ratings.compliance || 0),
            }
          : {}),

        comments: comments.trim(),
      };

      const response = await fetch(
        `/api/evaluation/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const contentType =
        response.headers.get("content-type") || "";

      const responseText = await response.text();

      if (!contentType.includes("application/json")) {
        console.error(
          "Evaluation submission returned non-JSON:",
          responseText.slice(0, 1000),
        );

        throw new Error(
          `Submission service returned ${response.status} ${response.statusText}.`,
        );
      }

      let data: ApiResponse;

      try {
        data = JSON.parse(responseText);
      } catch {
        throw new Error(
          "The submission service returned invalid JSON.",
        );
      }

      if (!response.ok || data.ok === false) {
        throw new Error(
          data.error ||
            data.message ||
            "The evaluation could not be submitted.",
        );
      }

      const updated =
        normalizeEvaluation({
          ...evaluation,
          ...(data.evaluation || data.data || {}),
          status: "submitted",
          comments,
          accurateDelivery:
            ratings.accurateDelivery,
          competitivePrice:
            ratings.competitivePrice,
          timeliness: ratings.timeliness,
          afterSales: ratings.afterSales,
          compliance: ratings.compliance,
        });

      setEvaluation(updated || evaluation);

      setSubmitted(true);
      setShowConfirm(false);
      window.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    } catch (requestError: any) {
      console.error(
        "Evaluation submission error:",
        requestError,
      );

      setSubmitError(
        requestError?.message ||
          "The evaluation could not be submitted. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <LoadingScreen />;
  }

  if (error) {
    return (
      <ErrorScreen
        title="Evaluation unavailable"
        message={error}
        onRetry={loadEvaluation}
      />
    );
  }

  if (!evaluation) {
    return (
      <ErrorScreen
        title="Evaluation not found"
        message="We could not find the supplier evaluation associated with this link."
      />
    );
  }

  if (submitted) {
    return <SuccessScreen evaluation={evaluation} />;
  }

  return (
    <>
      <main className="evaluation-page">
        <div className="ambient ambient-one" />
        <div className="ambient ambient-two" />

        <div className="evaluation-container">

          {/* BRAND HEADER */}

          <header className="brand-card">
            <div className="brand-mark">
              <ClipboardCheck size={25} />
            </div>

            <div className="brand-copy">
              <strong>
                {settings.companyName}
              </strong>

              <span>
                {settings.officeName} · Supplier Evaluation
              </span>
            </div>

            <div className="secure-badge">
              <ShieldCheck size={14} />
              Secure
            </div>
          </header>


          {/* HERO */}

          <section className="hero-card">

            <div className="hero-label">
              <span className="live-dot" />
              EVALUATION REQUEST
            </div>

            <h1>
              We value your
              <span> feedback.</span>
            </h1>

            <p>
              Your feedback helps the Purchasing Office
              monitor supplier performance and improve
              future purchasing decisions.
            </p>

            <div className="recipient-line">

              {evaluation.evaluatorName ? (
                <>
                  <span>Hello,</span>

                  <strong>
                    {evaluation.evaluatorName}
                  </strong>

                  <span>·</span>
                </>
              ) : null}

              <span>
                You are evaluating as
              </span>

              <span className="role-badge">
                {getRoleLabel(evaluation.evaluatorRole)}
              </span>

            </div>

          </section>


          {/* PROGRESS */}

          <section className="progress-card">

            <div className="progress-header">

              <div>
                <span className="progress-title">
                  Evaluation Progress
                </span>

                <strong>
                  {completedCount} of {criteria.length} completed
                </strong>
              </div>

              <div className="progress-percent">
                {progress}%
              </div>

            </div>

            <div className="progress-track">
              <div
                className="progress-bar"
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>

          </section>


          {/* PO INFORMATION */}

          <section className="transaction-card">

            <div className="section-heading">
              <div className="section-icon">
                <FileText size={18} />
              </div>

              <div>
                <div className="eyebrow">
                  PURCHASE ORDER
                </div>

                <h2>
                  Transaction details
                </h2>
              </div>
            </div>

            <div className="transaction-grid">

              <div className="info-item">
                <span>PO Number</span>

                <strong className="po-number">
                  {evaluation.poNumber || "—"}
                </strong>
              </div>

              <div className="info-item">
                <span>Supplier</span>

                <strong>
                  {evaluation.vendorName || "—"}
                </strong>
              </div>

              {evaluation.prfNo ? (
                <div className="info-item">
                  <span>PRF / SRF</span>

                  <strong>
                    {evaluation.prfNo}
                  </strong>
                </div>
              ) : null}

              {evaluation.actualDeliveryDate ||
              evaluation.expectedDeliveryDate ? (
                <div className="info-item">
                  <span>Delivery Date</span>

                  <strong>
                    {formatDate(
                      evaluation.actualDeliveryDate ||
                        evaluation.expectedDeliveryDate,
                    )}
                  </strong>
                </div>
              ) : null}

              {evaluation.totalAmount ? (
                <div className="info-item">
                  <span>PO Amount</span>

                  <strong className="amount">
                    {formatCurrency(
                      evaluation.totalAmount,
                    )}
                  </strong>
                </div>
              ) : null}

              {evaluation.itemsDelivered ? (
                <div className="info-item info-item-wide">
                  <span>Items / Services Delivered</span>

                  <strong>
                    {evaluation.itemsDelivered}
                  </strong>
                </div>
              ) : null}

            </div>

          </section>


          {/* EVALUATION */}

          <section className="form-section">

            <div className="section-heading form-heading">

              <div className="section-number">
                01
              </div>

              <div>
                <div className="eyebrow">
                  SUPPLIER PERFORMANCE
                </div>

                <h2>
                  Rate your experience
                </h2>

                <p>
                  Select the rating that best represents
                  your actual experience with this supplier.
                </p>
              </div>

            </div>


            <div className="criteria-list">

              {criteria.map((criterion, index) => {
                const value =
                  ratings[criterion.id] || 0;

                const isRated = value > 0;

                return (
                  <article
                    key={criterion.id}
                    className={`criterion-card ${
                      isRated ? "rated" : ""
                    }`}
                  >

                    <div className="criterion-header">

                      <div className="criterion-number">
                        {String(index + 1).padStart(2, "0")}
                      </div>

                      <div className="criterion-content">

                        <div className="criterion-title-row">

                          <div>
                            <h3>
                              {criterion.title}
                            </h3>

                            <p>
                              {criterion.description}
                            </p>
                          </div>

                          <div
                            className={`criterion-icon ${
                              isRated ? "active" : ""
                            }`}
                          >
                            {criterion.icon}
                          </div>

                        </div>

                        <RatingStars
                          value={value as Rating}
                          onChange={(next) =>
                            setRating(
                              criterion.id,
                              next,
                            )
                          }
                        />

                        <div
                          className={`rating-result ${
                            isRated ? "visible" : ""
                          }`}
                        >
                          {isRated
                            ? `${value} / 5 · ${SCORE_LABELS[value]}`
                            : "Select a rating"}
                        </div>

                      </div>

                    </div>

                  </article>
                );
              })}

            </div>

          </section>


          {/* LIVE PREVIEW */}

          <section className="preview-card">

            <div className="preview-icon">
              <Star size={18} />
            </div>

            <div className="preview-copy">

              <span>
                CURRENT SCORE
              </span>

              <strong>
                {averagePreview
                  ? averagePreview.toFixed(2)
                  : "—"}
                <small>
                  {averagePreview
                    ? " / 5"
                    : ""}
                </small>
              </strong>

            </div>

            <div className="preview-status">
              {completedCount === criteria.length
                ? "Ready to submit"
                : `${criteria.length - completedCount} rating${
                    criteria.length - completedCount === 1
                      ? ""
                      : "s"
                  } remaining`}
            </div>

          </section>


          {/* COMMENTS */}

          <section className="comments-card">

            <div className="comments-heading">

              <div className="section-icon soft">
                <MessageSquareText size={18} />
              </div>

              <div>
                <div className="eyebrow">
                  OPTIONAL
                </div>

                <h2>
                  Additional feedback
                </h2>
              </div>

            </div>

            <p>
              Share anything helpful about the supplier,
              delivery, quality, communication, pricing,
              or after-sales support.
            </p>

            <textarea
              value={comments}
              onChange={(event) => {
                setComments(event.target.value);
                setSubmitError("");
              }}
              maxLength={1200}
              placeholder="Write your feedback here..."
            />

            <div className="character-count">
              {comments.length}/1200
            </div>

          </section>


          {/* ERROR */}

          {submitError ? (
            <div className="submit-error">
              <AlertCircle size={17} />

              <span>
                {submitError}
              </span>

              <button
                type="button"
                onClick={() => setSubmitError("")}
                aria-label="Close error"
              >
                <X size={15} />
              </button>
            </div>
          ) : null}


          {/* SUBMIT */}

          <section className="submit-section">

            <button
              type="button"
              className="submit-button"
              disabled={submitting}
              onClick={() => {
                if (!validateBeforeSubmit()) {
                  return;
                }

                setShowConfirm(true);
              }}
            >
              {submitting ? (
                <>
                  <Loader2
                    size={18}
                    className="spin"
                  />

                  Submitting...
                </>
              ) : (
                <>
                  Submit Evaluation
                  <ArrowRight size={18} />
                </>
              )}
            </button>

            <div className="submit-note">
              <ShieldCheck size={14} />

              <span>
                Your response will be securely recorded
                by the Purchasing Office.
              </span>
            </div>

          </section>


          <footer className="page-footer">
            <span>
              {settings.companyName}
            </span>

            <span>·</span>

            <span>
              Supplier Evaluation Portal
            </span>
          </footer>

        </div>
      </main>


      {/* CONFIRMATION MODAL */}

      {showConfirm ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (
              event.target === event.currentTarget &&
              !submitting
            ) {
              setShowConfirm(false);
            }
          }}
        >
          <div className="confirm-modal">

            <div className="confirm-icon">
              <CheckCircle2 size={28} />
            </div>

            <div className="eyebrow">
              FINAL REVIEW
            </div>

            <h2>
              Submit your evaluation?
            </h2>

            <p>
              Please make sure your ratings accurately
              reflect your experience with{" "}
              <strong>
                {evaluation.vendorName ||
                  "this supplier"}
              </strong>
              .
            </p>

            <div className="confirm-score">
              <span>Your current rating</span>

              <strong>
                {averagePreview.toFixed(2)}
                <small> / 5</small>
              </strong>
            </div>

            <div className="confirm-actions">

              <button
                type="button"
                className="cancel-button"
                disabled={submitting}
                onClick={() =>
                  setShowConfirm(false)
                }
              >
                Review again
              </button>

              <button
                type="button"
                className="confirm-button"
                disabled={submitting}
                onClick={submitEvaluation}
              >
                {submitting ? (
                  <>
                    <Loader2
                      size={16}
                      className="spin"
                    />
                    Submitting
                  </>
                ) : (
                  <>
                    Yes, submit
                    <ArrowRight size={16} />
                  </>
                )}
              </button>

            </div>

          </div>
        </div>
      ) : null}


      <style jsx global>{`

        * {
          box-sizing: border-box;
        }

        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          font-family:
            Inter,
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
          background: #f4f8f7;
          color: #10201c;
        }

        button,
        textarea {
          font: inherit;
        }

        button {
          -webkit-tap-highlight-color: transparent;
        }

        .screen-shell {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background:
            radial-gradient(
              circle at 10% 5%,
              rgba(14, 139, 110, 0.13),
              transparent 28%
            ),
            radial-gradient(
              circle at 95% 85%,
              rgba(91, 103, 241, 0.1),
              transparent 25%
            ),
            #f4f8f7;
        }

        .loading-card,
        .error-card,
        .success-card {
          width: 100%;
          max-width: 500px;
          background: #ffffff;
          border: 1px solid #e0e8e4;
          border-radius: 28px;
          padding: 38px;
          text-align: center;
          box-shadow:
            0 30px 90px rgba(10, 55, 44, 0.1);
        }

        .loading-logo,
        .error-icon {
          width: 72px;
          height: 72px;
          border-radius: 22px;
          display: grid;
          place-items: center;
          margin: 0 auto 18px;
        }

        .loading-logo {
          color: #ffffff;
          background:
            linear-gradient(
              135deg,
              #08785f,
              #159b7b
            );
        }

        .error-icon {
          color: #be123c;
          background: #fff1f2;
        }

        .loading-spinner {
          color: #0b8065;
          margin-bottom: 12px;
        }

        .loading-card h1,
        .error-card h1,
        .success-card h1 {
          margin: 0;
          font-size: 26px;
          letter-spacing: -0.04em;
        }

        .loading-card p,
        .error-card p,
        .success-card p {
          color: #6c7d77;
          font-size: 14px;
          line-height: 1.7;
          margin: 10px auto 0;
        }

        .error-card p {
          max-width: 390px;
        }

        .secondary-button {
          margin-top: 22px;
          border: 0;
          border-radius: 12px;
          padding: 12px 18px;
          background: #0b6d58;
          color: #ffffff;
          font-weight: 800;
          cursor: pointer;
        }

        .evaluation-page {
          min-height: 100vh;
          position: relative;
          overflow: hidden;
          padding: 22px 16px 55px;
          background:
            radial-gradient(
              circle at 8% 2%,
              rgba(16, 185, 129, 0.13),
              transparent 25%
            ),
            radial-gradient(
              circle at 95% 28%,
              rgba(99, 102, 241, 0.09),
              transparent 24%
            ),
            #f3f8f6;
        }

        .ambient {
          position: fixed;
          pointer-events: none;
          filter: blur(4px);
          opacity: 0.5;
        }

        .ambient-one {
          width: 180px;
          height: 180px;
          border-radius: 50%;
          background: rgba(16, 185, 129, 0.08);
          top: 80px;
          right: -70px;
        }

        .ambient-two {
          width: 220px;
          height: 220px;
          border-radius: 50%;
          background: rgba(91, 103, 241, 0.07);
          left: -110px;
          bottom: 80px;
        }

        .evaluation-container {
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 850px;
          margin: 0 auto;
        }

        .brand-card {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 15px 16px;
          margin-bottom: 13px;
          border: 1px solid #dfe9e5;
          border-radius: 19px;
          background: rgba(255, 255, 255, 0.84);
          backdrop-filter: blur(16px);
          box-shadow:
            0 12px 36px rgba(9, 55, 44, 0.045);
        }

        .brand-mark {
          width: 45px;
          height: 45px;
          flex: none;
          display: grid;
          place-items: center;
          color: white;
          border-radius: 14px;
          background:
            linear-gradient(
              145deg,
              #087a61,
              #13a37e
            );
          box-shadow:
            0 9px 20px rgba(8, 122, 97, 0.2);
        }

        .brand-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .brand-copy strong {
          color: #13201d;
          font-size: 13px;
          font-weight: 850;
          letter-spacing: -0.01em;
        }

        .brand-copy span {
          color: #83918d;
          font-size: 10px;
          line-height: 1.4;
        }

        .secure-badge {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          flex: none;
          padding: 7px 10px;
          border-radius: 999px;
          color: #08785f;
          background: #edfbf6;
          border: 1px solid #d2f2e7;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .hero-card {
          padding: 29px;
          margin-bottom: 13px;
          border: 1px solid #dce7e2;
          border-radius: 26px;
          color: white;
          overflow: hidden;
          position: relative;
          background:
            radial-gradient(
              circle at 90% 0%,
              rgba(80, 102, 240, 0.28),
              transparent 31%
            ),
            linear-gradient(
              135deg,
              #0a3028,
              #0d5545 56%,
              #126c58
            );
          box-shadow:
            0 23px 60px rgba(8, 54, 43, 0.16);
        }

        .hero-card::after {
          content: "";
          position: absolute;
          width: 210px;
          height: 210px;
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 50%;
          right: -76px;
          bottom: -112px;
        }

        .hero-label {
          position: relative;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #9ee8d4;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.13em;
          text-transform: uppercase;
        }

        .live-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #69e0bf;
          box-shadow:
            0 0 0 4px rgba(105, 224, 191, 0.1);
        }

        .hero-card h1 {
          position: relative;
          z-index: 2;
          margin: 13px 0 0;
          max-width: 670px;
          font-size: clamp(31px, 5vw, 49px);
          line-height: 0.99;
          letter-spacing: -0.058em;
          font-weight: 900;
        }

        .hero-card h1 span {
          color: #8e9aff;
        }

        .hero-card > p {
          position: relative;
          z-index: 2;
          max-width: 660px;
          margin: 14px 0 0;
          color: rgba(255,255,255,0.68);
          font-size: 13px;
          line-height: 1.7;
        }

        .recipient-line {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 20px;
          color: rgba(255,255,255,0.68);
          font-size: 11px;
        }

        .recipient-line strong {
          color: white;
          font-weight: 800;
        }

        .role-badge {
          display: inline-flex;
          align-items: center;
          padding: 5px 9px;
          border-radius: 8px;
          background: rgba(255,255,255,0.11);
          border: 1px solid rgba(255,255,255,0.12);
          color: #d8fff5;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .progress-card {
          position: sticky;
          top: 10px;
          z-index: 20;
          padding: 14px 16px;
          margin-bottom: 13px;
          border: 1px solid #dfe8e4;
          border-radius: 17px;
          background: rgba(255,255,255,0.91);
          backdrop-filter: blur(17px);
          box-shadow:
            0 12px 32px rgba(10,55,44,0.065);
        }

        .progress-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }

        .progress-header > div:first-child {
          display: flex;
          flex-direction: column;
          gap: 3px;
        }

        .progress-title {
          color: #899792;
          font-size: 9px;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.12em;
        }

        .progress-header strong {
          font-size: 12px;
          color: #18332b;
        }

        .progress-percent {
          color: #0b8467;
          font-size: 15px;
          font-weight: 900;
        }

        .progress-track {
          width: 100%;
          height: 7px;
          margin-top: 9px;
          overflow: hidden;
          border-radius: 99px;
          background: #e9f0ed;
        }

        .progress-bar {
          height: 100%;
          border-radius: inherit;
          background:
            linear-gradient(
              90deg,
              #0a8b6c,
              #5c68ed
            );
          transition:
            width 0.3s ease;
        }

        .transaction-card,
        .comments-card,
        .preview-card {
          border: 1px solid #dfe8e4;
          border-radius: 22px;
          background: white;
          box-shadow:
            0 12px 33px rgba(10,55,44,0.045);
        }

        .transaction-card {
          padding: 22px;
          margin-bottom: 19px;
        }

        .section-heading {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 17px;
        }

        .section-icon {
          width: 40px;
          height: 40px;
          flex: none;
          display: grid;
          place-items: center;
          color: #0b8065;
          border-radius: 13px;
          background: #ebf9f4;
        }

        .section-icon.soft {
          color: #5966ef;
          background: #eef1ff;
        }

        .eyebrow {
          color: #8a9893;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.14em;
          text-transform: uppercase;
        }

        .section-heading h2,
        .comments-heading h2 {
          margin: 2px 0 0;
          font-size: 17px;
          letter-spacing: -0.03em;
          color: #15231f;
        }

        .transaction-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 9px;
        }

        .info-item {
          min-width: 0;
          padding: 13px;
          border: 1px solid #edf2f0;
          border-radius: 13px;
          background: #f8fbfa;
        }

        .info-item-wide {
          grid-column: span 2;
        }

        .info-item span {
          display: block;
          margin-bottom: 5px;
          color: #95a19d;
          font-size: 8px;
          font-weight: 850;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .info-item strong {
          display: block;
          overflow-wrap: anywhere;
          color: #21322c;
          font-size: 12px;
          line-height: 1.45;
        }

        .po-number {
          color: #5663e9 !important;
          font-family:
            ui-monospace,
            SFMono-Regular,
            Menlo,
            monospace;
        }

        .amount {
          color: #087d60 !important;
        }

        .form-section {
          margin-bottom: 19px;
        }

        .form-heading {
          padding: 3px 2px 12px;
          margin-bottom: 3px;
          align-items: flex-start;
        }

        .section-number {
          width: 40px;
          height: 40px;
          flex: none;
          display: grid;
          place-items: center;
          border-radius: 13px;
          background: #eef2ff;
          color: #5a67e8;
          font-size: 10px;
          font-weight: 900;
        }

        .form-heading p {
          margin: 6px 0 0;
          color: #798780;
          font-size: 11px;
          line-height: 1.6;
        }

        .criteria-list {
          display: grid;
          gap: 12px;
        }

        .criterion-card {
          padding: 18px;
          border: 1.5px solid #e0e8e4;
          border-radius: 21px;
          background: white;
          transition:
            transform 0.18s ease,
            border-color 0.18s ease,
            box-shadow 0.18s ease,
            background 0.18s ease;
        }

        .criterion-card:hover {
          transform: translateY(-1px);
          box-shadow:
            0 14px 35px rgba(10,55,44,0.06);
        }

        .criterion-card.rated {
          border-color: #7a86ee;
          background:
            linear-gradient(
              180deg,
              white,
              #fafaff
            );
          box-shadow:
            0 13px 34px rgba(91,103,241,0.08);
        }

        .criterion-header {
          display: grid;
          grid-template-columns: 38px minmax(0, 1fr);
          gap: 12px;
        }

        .criterion-number {
          width: 38px;
          height: 38px;
          display: grid;
          place-items: center;
          color: #0b8065;
          background: #eaf8f3;
          border-radius: 12px;
          font-size: 9px;
          font-weight: 900;
        }

        .criterion-title-row {
          display: flex;
          gap: 12px;
          justify-content: space-between;
        }

        .criterion-content h3 {
          margin: 0;
          color: #17261f;
          font-size: 14px;
          line-height: 1.35;
          letter-spacing: -0.017em;
        }

        .criterion-content p {
          margin: 6px 0 0;
          color: #7b8883;
          font-size: 11px;
          line-height: 1.65;
        }

        .criterion-icon {
          width: 40px;
          height: 40px;
          flex: none;
          display: grid;
          place-items: center;
          border-radius: 12px;
          color: #8a9792;
          background: #f4f7f6;
        }

        .criterion-icon.active {
          color: #5865e8;
          background: #eef0ff;
        }

        .rating-wrapper {
          margin-top: 18px;
          padding-top: 16px;
          border-top: 1px solid #eef2f0;
        }

        .stars-row {
          display: flex;
          align-items: center;
          gap: 7px;
        }

        .star-button {
          width: 51px;
          height: 48px;
          flex: 1;
          display: grid;
          place-items: center;
          border: 0;
          border-radius: 14px;
          cursor: pointer;
          color: #d8ddda;
          background: #f7f9f8;
          transition:
            transform 0.15s ease,
            background 0.15s ease,
            color 0.15s ease,
            box-shadow 0.15s ease;
        }

        .star-button:hover {
          transform: translateY(-2px);
          color: #ecab2e;
          background: #fff8e8;
        }

        .star-button.active {
          color: #efa92c;
          background: #fff6df;
          box-shadow:
            0 5px 15px rgba(239,169,44,0.11);
        }

        .star-button:focus-visible {
          outline: 3px solid rgba(91,103,241,0.18);
          outline-offset: 2px;
        }

        .rating-scale {
          display: flex;
          justify-content: space-between;
          margin-top: 8px;
          color: #a1aba7;
          font-size: 8px;
          font-weight: 750;
        }

        .rating-result {
          min-height: 18px;
          margin-top: 10px;
          color: #a4aeaa;
          font-size: 11px;
          font-weight: 800;
        }

        .rating-result.visible {
          color: #5966e8;
        }

        .preview-card {
          display: flex;
          align-items: center;
          gap: 13px;
          padding: 16px;
          margin-bottom: 17px;
        }

        .preview-icon {
          width: 38px;
          height: 38px;
          flex: none;
          display: grid;
          place-items: center;
          border-radius: 12px;
          color: #eda92b;
          background: #fff7e4;
        }

        .preview-copy {
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .preview-copy > span {
          color: #9aa5a1;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .preview-copy strong {
          color: #1c2c26;
          font-size: 20px;
          letter-spacing: -0.04em;
        }

        .preview-copy small {
          color: #98a39f;
          font-size: 11px;
          font-weight: 700;
        }

        .preview-status {
          margin-left: auto;
          padding: 7px 10px;
          border-radius: 999px;
          background: #eef8f4;
          color: #087b60;
          font-size: 9px;
          font-weight: 850;
        }

        .comments-card {
          padding: 21px;
          margin-bottom: 14px;
        }

        .comments-heading {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-bottom: 11px;
        }

        .comments-card > p {
          margin: 0 0 11px;
          color: #798680;
          font-size: 11px;
          line-height: 1.65;
        }

        textarea {
          display: block;
          width: 100%;
          min-height: 118px;
          padding: 13px;
          resize: vertical;
          border: 1.5px solid #e2e8e5;
          border-radius: 14px;
          outline: none;
          background: #fbfcfc;
          color: #15231f;
          font-size: 12px;
          line-height: 1.65;
          transition:
            border-color 0.18s ease,
            box-shadow 0.18s ease,
            background 0.18s ease;
        }

        textarea::placeholder {
          color: #adb6b2;
        }

        textarea:focus {
          border-color: #7580ed;
          background: white;
          box-shadow:
            0 0 0 4px rgba(91,103,241,0.08);
        }

        .character-count {
          text-align: right;
          margin-top: 6px;
          color: #a0aaa6;
          font-size: 9px;
        }

        .submit-error {
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 12px 14px;
          margin-bottom: 12px;
          border: 1px solid #fecdd3;
          border-radius: 13px;
          color: #be123c;
          background: #fff1f2;
          font-size: 11px;
          line-height: 1.5;
        }

        .submit-error span {
          flex: 1;
        }

        .submit-error button {
          display: grid;
          place-items: center;
          border: 0;
          background: none;
          color: inherit;
          cursor: pointer;
        }

        .submit-section {
          margin-top: 5px;
        }

        .submit-button {
          width: 100%;
          min-height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border: 0;
          border-radius: 16px;
          cursor: pointer;
          color: white;
          background:
            linear-gradient(
              135deg,
              #097961,
              #0d9a78
            );
          box-shadow:
            0 15px 29px rgba(9,121,97,0.19);
          font-size: 13px;
          font-weight: 900;
          transition:
            transform 0.18s ease,
            box-shadow 0.18s ease,
            opacity 0.18s ease;
        }

        .submit-button:hover {
          transform: translateY(-1px);
          box-shadow:
            0 19px 37px rgba(9,121,97,0.23);
        }

        .submit-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        .submit-note {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          margin-top: 9px;
          color: #9aa5a1;
          font-size: 9px;
        }

        .page-footer {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          margin-top: 20px;
          color: #9aa5a1;
          font-size: 9px;
        }

        .success-shell {
          background:
            radial-gradient(
              circle at 8% 7%,
              rgba(16,185,129,0.12),
              transparent 27%
            ),
            #f4f8f7;
        }

        .success-card {
          max-width: 580px;
          padding: 48px 30px;
        }

        .success-icon {
          width: 86px;
          height: 86px;
          margin: 0 auto 18px;
          display: grid;
          place-items: center;
          color: white;
          border-radius: 28px;
          background:
            linear-gradient(
              145deg,
              #09906f,
              #12ad84
            );
          box-shadow:
            0 15px 32px rgba(9,144,111,0.22);
        }

        .success-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 10px;
          border-radius: 999px;
          color: #047857;
          background: #ecfdf5;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 0.1em;
        }

        .success-badge span {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #10b981;
        }

        .success-card h1 {
          margin-top: 17px;
        }

        .success-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
          margin-top: 25px;
        }

        .success-summary > div {
          padding: 13px;
          border: 1px solid #ecf0ee;
          border-radius: 13px;
          background: #f8faf9;
        }

        .success-summary span {
          display: block;
          margin-bottom: 5px;
          color: #99a39f;
          font-size: 8px;
          font-weight: 850;
          text-transform: uppercase;
          letter-spacing: 0.07em;
        }

        .success-summary strong {
          display: block;
          color: #24332d;
          font-size: 11px;
          overflow-wrap: anywhere;
        }

        .status-submitted {
          color: #07805f !important;
        }

        .success-note {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          margin-top: 16px;
          padding: 12px;
          border-radius: 12px;
          color: #047857;
          background: #effcf7;
          font-size: 10px;
          font-weight: 750;
        }

        .modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 100;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
          background: rgba(10,24,20,0.5);
          backdrop-filter: blur(8px);
        }

        .confirm-modal {
          width: 100%;
          max-width: 430px;
          padding: 25px;
          border-radius: 24px;
          border: 1px solid #e0e8e4;
          background: white;
          box-shadow:
            0 40px 100px rgba(0,0,0,0.22);
          animation: modal-in 0.22s ease;
        }

        @keyframes modal-in {
          from {
            opacity: 0;
            transform: translateY(8px) scale(0.98);
          }

          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .confirm-icon {
          width: 52px;
          height: 52px;
          display: grid;
          place-items: center;
          margin-bottom: 15px;
          border-radius: 16px;
          color: #5966e8;
          background: #eef1ff;
        }

        .confirm-modal h2 {
          margin: 4px 0 7px;
          color: #17261f;
          font-size: 22px;
          letter-spacing: -0.04em;
        }

        .confirm-modal > p {
          color: #77847f;
          font-size: 12px;
          line-height: 1.7;
        }

        .confirm-score {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: 18px;
          padding: 13px;
          border: 1px solid #e8eeeb;
          border-radius: 13px;
          background: #f8faf9;
        }

        .confirm-score span {
          color: #8e9995;
          font-size: 10px;
          font-weight: 750;
        }

        .confirm-score strong {
          color: #5663e9;
          font-size: 19px;
        }

        .confirm-score small {
          color: #98a29e;
          font-size: 10px;
        }

        .confirm-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
          margin-top: 20px;
        }

        .cancel-button,
        .confirm-button {
          min-height: 43px;
          border: 0;
          border-radius: 12px;
          cursor: pointer;
          font-size: 11px;
          font-weight: 850;
        }

        .cancel-button {
          color: #344054;
          background: #f1f4f3;
        }

        .confirm-button {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          color: white;
          background:
            linear-gradient(
              135deg,
              #097961,
              #0d9a78
            );
        }

        .cancel-button:disabled,
        .confirm-button:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .spin {
          animation: spin 0.8s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 700px) {

          .evaluation-page {
            padding: 10px 9px 34px;
          }

          .brand-card {
            border-radius: 17px;
          }

          .hero-card {
            padding: 23px;
            border-radius: 22px;
          }

          .hero-card h1 {
            font-size: 32px;
          }

          .transaction-card,
          .comments-card {
            border-radius: 19px;
          }

          .transaction-grid {
            grid-template-columns: 1fr;
          }

          .info-item-wide {
            grid-column: span 1;
          }

          .criterion-card {
            padding: 16px;
            border-radius: 19px;
          }

          .criterion-title-row {
            gap: 8px;
          }

          .criterion-icon {
            display: none;
          }

          .star-button {
            height: 46px;
            border-radius: 12px;
          }

          .success-summary {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 430px) {

          .secure-badge {
            display: none;
          }

          .brand-copy strong {
            font-size: 12px;
          }

          .hero-card h1 {
            font-size: 29px;
          }

          .rating-scale {
            font-size: 7px;
          }

          .progress-card {
            top: 5px;
          }

          .confirm-actions {
            grid-template-columns: 1fr;
          }
        }

        @media (prefers-reduced-motion: reduce) {

          *,
          *::before,
          *::after {
            animation: none !important;
            transition: none !important;
          }

          html {
            scroll-behavior: auto;
          }
        }

      `}</style>
    </>
  );
}