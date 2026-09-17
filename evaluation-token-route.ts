import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    token: string;
  }>;
};

function cleanString(value: unknown) {
  return String(value ?? "").trim();
}

function cleanScore(value: unknown) {
  const score = Number(value);

  if (!Number.isFinite(score)) {
    return 0;
  }

  if (score < 1 || score > 5) {
    return 0;
  }

  return Math.round(score);
}

function roleIsPurchaser(role: unknown) {
  return cleanString(role).toLowerCase() === "purchaser";
}

function calculateOverall(
  role: string,
  accurateDelivery: number,
  competitivePrice: number,
  timeliness: number,
  afterSales: number,
  compliance: number,
) {
  const scores = [
    accurateDelivery,
    competitivePrice,
    timeliness,
    afterSales,
  ];

  if (roleIsPurchaser(role)) {
    scores.push(compliance);
  }

  const validScores = scores.filter((score) => score >= 1);

  if (!validScores.length) {
    return 0;
  }

  const average =
    validScores.reduce((sum, score) => sum + score, 0) /
    validScores.length;

  return Math.round(average * 10) / 10;
}

/**
 * GET
 * Loads a public supplier evaluation using its unique token.
 *
 * Example:
 * /api/evaluation/660763386c65441d9e98ebc1748676dd
 */
export async function GET(
  _request: Request,
  context: RouteContext,
) {
  try {
    const { token } = await context.params;

    const cleanToken = cleanString(token);

    if (!cleanToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Evaluation token is required.",
        },
        {
          status: 400,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const snapshot = await adminDb
      .collection("evaluations")
      .where("token", "==", cleanToken)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This evaluation link is invalid or has expired.",
        },
        {
          status: 404,
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const document = snapshot.docs[0];

    const raw = document.data();

    const role = cleanString(
      raw.evaluatorRole || "requisitioner",
    );

    const evaluation = {
      id: document.id,

      token: cleanToken,

      poNumber: cleanString(raw.poNumber),
      prfNo: cleanString(
        raw.prfNo || raw.prfNumber,
      ),

      vendorName: cleanString(
        raw.vendorName || raw.supplier,
      ),

      supplier: cleanString(
        raw.supplier || raw.vendorName,
      ),

      evaluatorName: cleanString(
        raw.evaluatorName ||
          raw.requisitionerName ||
          raw.name,
      ),

      evaluatorEmail: cleanString(
        raw.evaluatorEmail ||
          raw.email,
      ),

      evaluatorRole: role,

      status: cleanString(
        raw.status || "pending",
      ),

      deliveryDate: cleanString(
        raw.deliveryDate ||
          raw.actualDeliveryDate ||
          raw.expectedDeliveryDate,
      ),

      expectedDeliveryDate: cleanString(
        raw.expectedDeliveryDate,
      ),

      actualDeliveryDate: cleanString(
        raw.actualDeliveryDate,
      ),

      totalAmount:
        raw.totalAmount ??
        raw.total ??
        "",

      itemsDelivered: cleanString(
        raw.itemsDelivered ||
          raw.itemDelivered ||
          raw.items,
      ),

      accurateDelivery: cleanScore(
        raw.accurateDelivery ??
          raw.accurate_delivery,
      ),

      competitivePrice: cleanScore(
        raw.competitivePrice ??
          raw.competitive_price,
      ),

      timeliness: cleanScore(
        raw.timeliness,
      ),

      afterSales: cleanScore(
        raw.afterSales ??
          raw.after_sales,
      ),

      compliance: cleanScore(
        raw.compliance,
      ),

      comments: cleanString(
        raw.comments ||
          raw.remarks,
      ),

      overallScore:
        raw.overallScore ??
        raw.overall_score ??
        0,

      submittedAt:
        raw.submittedAt ??
        raw.submitted_at ??
        "",
    };

    return NextResponse.json(
      {
        ok: true,
        evaluation,
      },
      {
        status: 200,
        headers: {
          "Cache-Control":
            "no-store, no-cache, must-revalidate",
        },
      },
    );
  } catch (error: any) {
    console.error(
      "GET /api/evaluation/[token] error:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Unable to load the evaluation.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}


/**
 * POST
 * Submits the evaluation.
 *
 * Requisitioner / AMD:
 *   4 criteria
 *
 * Purchaser:
 *   5 criteria including Compliance
 */
export async function POST(
  request: Request,
  context: RouteContext,
) {
  try {
    const { token } = await context.params;

    const cleanToken = cleanString(token);

    if (!cleanToken) {
      return NextResponse.json(
        {
          ok: false,
          error: "Evaluation token is required.",
        },
        {
          status: 400,
        },
      );
    }

    let body: any;

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid JSON request body.",
        },
        {
          status: 400,
        },
      );
    }

    const snapshot = await adminDb
      .collection("evaluations")
      .where("token", "==", cleanToken)
      .limit(1)
      .get();

    if (snapshot.empty) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This evaluation link is invalid or has expired.",
        },
        {
          status: 404,
        },
      );
    }

    const document = snapshot.docs[0];

    const current = document.data();

    const role = cleanString(
      current.evaluatorRole ||
        body.evaluatorRole ||
        "requisitioner",
    );

    /*
     * Prevent duplicate submission.
     */
    if (
      cleanString(current.status).toLowerCase() ===
      "submitted"
    ) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "This evaluation has already been submitted.",
          alreadySubmitted: true,
        },
        {
          status: 409,
        },
      );
    }

    const accurateDelivery = cleanScore(
      body.accurateDelivery ??
        body.accurate_delivery,
    );

    const competitivePrice = cleanScore(
      body.competitivePrice ??
        body.competitive_price,
    );

    const timeliness = cleanScore(
      body.timeliness,
    );

    const afterSales = cleanScore(
      body.afterSales ??
        body.after_sales,
    );

    const compliance = cleanScore(
      body.compliance,
    );

    /*
     * Requisitioner / AMD = 4 required criteria.
     * Purchaser = 5 required criteria.
     */
    const requiredScores = [
      accurateDelivery,
      competitivePrice,
      timeliness,
      afterSales,
    ];

    if (roleIsPurchaser(role)) {
      requiredScores.push(compliance);
    }

    const incomplete = requiredScores.some(
      (score) => score < 1,
    );

    if (incomplete) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Please complete all required evaluation criteria before submitting.",
        },
        {
          status: 400,
        },
      );
    }

    const comments = cleanString(
      body.comments ||
        body.remarks,
    );

    const overallScore = calculateOverall(
      role,
      accurateDelivery,
      competitivePrice,
      timeliness,
      afterSales,
      compliance,
    );

    const submittedAt = new Date().toISOString();

    const updateData: Record<string, unknown> = {
      status: "submitted",

      accurateDelivery,
      competitivePrice,
      timeliness,
      afterSales,

      comments,

      overallScore,

      submittedAt,
      updatedAt: submittedAt,
      needsExport: true,
    };

    /*
     * Compliance is only stored as an actual score
     * for Purchasing.
     *
     * Requisitioner / AMD remain without this criterion.
     */
    if (roleIsPurchaser(role)) {
      updateData.compliance = compliance;
    } else {
      updateData.compliance = 0;
    }

    await document.ref.update(updateData);


    return NextResponse.json(
      {
        ok: true,
        message:
          "Evaluation submitted successfully.",

        evaluation: {
          id: document.id,

          token: cleanToken,

          poNumber: cleanString(
            current.poNumber,
          ),

          prfNo: cleanString(
            current.prfNo ||
              current.prfNumber,
          ),

          vendorName: cleanString(
            current.vendorName ||
              current.supplier,
          ),

          supplier: cleanString(
            current.supplier ||
              current.vendorName,
          ),

          evaluatorName: cleanString(
            current.evaluatorName ||
              current.requisitionerName ||
              current.name,
          ),

          evaluatorEmail: cleanString(
            current.evaluatorEmail ||
              current.email,
          ),

          evaluatorRole: role,

          status: "submitted",

          accurateDelivery,
          competitivePrice,
          timeliness,
          afterSales,
          compliance,

          comments,

          overallScore,

          submittedAt,
        },
      },
      {
        status: 200,
      },
    );
  } catch (error: any) {
    console.error(
      "POST /api/evaluation/[token] error:",
      error,
    );

    return NextResponse.json(
      {
        ok: false,
        error:
          error?.message ||
          "Unable to submit the evaluation.",
      },
      {
        status: 500,
      },
    );
  }
}