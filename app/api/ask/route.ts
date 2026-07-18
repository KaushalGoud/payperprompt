import { NextRequest, NextResponse } from "next/server";
import {
  X402_VERSION,
  PaymentRequirements,
  encodeHeader,
  decodeHeader,
  PaymentPayload,
} from "@/lib/x402";
import {
  verifyPaymentPayload,
  settlePayment,
  hashscanUrl,
} from "@/lib/hedera-facilitator";

const providerApiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
const providerBaseUrl =
  process.env.OPENAI_BASE_URL ||
  process.env.AI_BASE_URL ||
  "https://api.openai.com/v1";
const providerModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

const RECEIVER_ACCOUNT_ID = process.env.RECEIVER_ACCOUNT_ID!;
const PRICE_HBAR = process.env.PRICE_HBAR || "0.1";
const PRICE_TINYBARS = Math.round(parseFloat(PRICE_HBAR) * 1e8).toString();

function buildRequirements(): PaymentRequirements {
  return {
    scheme: "exact",
    network: "hedera-testnet",
    maxAmountRequired: PRICE_TINYBARS,
    resource: "/api/ask",
    description: "Per-question AI answer access",
    mimeType: "application/json",
    payTo: RECEIVER_ACCOUNT_ID,
    maxTimeoutSeconds: 60,
    asset: "HBAR",
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const question =
      typeof body?.question === "string" ? body.question.trim() : "";

    if (!question) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 },
      );
    }

    const paymentHeader = request.headers.get("X-PAYMENT");
    const requirements = buildRequirements();

    // --- No payment attached yet: return the x402 challenge ---
    if (!paymentHeader) {
      const challenge = { x402Version: X402_VERSION, accepts: [requirements] };
      const response = NextResponse.json(challenge, { status: 402 });
      response.headers.set("PAYMENT-REQUIRED", encodeHeader(challenge));
      return response;
    }

    // --- Payment attached: decode, verify, settle ---
    let paymentPayload: PaymentPayload;
    try {
      paymentPayload = decodeHeader<PaymentPayload>(paymentHeader);
    } catch {
      return NextResponse.json(
        { error: "Malformed X-PAYMENT header." },
        { status: 400 },
      );
    }

    const { valid, reason } = verifyPaymentPayload(
      paymentPayload.payload.signedTransactionBase64,
      requirements,
    );
    if (!valid) {
      return NextResponse.json(
        { error: `Payment verification failed: ${reason}` },
        { status: 402 },
      );
    }

    const settlement = await settlePayment(
      paymentPayload.payload.signedTransactionBase64,
    );
    if (!settlement.success || !settlement.txId) {
      return NextResponse.json(
        { error: settlement.error || "Settlement failed." },
        { status: 402 },
      );
    }

    const txId = settlement.txId;

    // --- Payment settled on-chain, now generate the answer ---
    if (!providerApiKey) {
      return NextResponse.json(
        { error: "AI provider is not configured." },
        { status: 500 },
      );
    }

    const aiResponse = await fetch(
      `${providerBaseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${providerApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: providerModel,
          temperature: 0.7,
          messages: [
            {
              role: "system",
              content:
                "You are a helpful assistant that answers user questions clearly and concisely.",
            },
            { role: "user", content: question },
          ],
        }),
      },
    );

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI provider error:", aiResponse.status, errText);
      return NextResponse.json(
        { error: "Unable to generate a response from the AI provider." },
        { status: aiResponse.status },
      );
    }

    const aiData = await aiResponse.json();
    const answer = aiData?.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      return NextResponse.json(
        { error: "The AI provider returned an empty response." },
        { status: 502 },
      );
    }

    const settlementResponse = {
      txId,
      network: "hedera-testnet",
      asset: "HBAR",
    };
    const response = NextResponse.json(
      {
        answer,
        paymentAmount: PRICE_HBAR,
        txId,
        hashscanUrl: hashscanUrl(txId),
      },
      { status: 200 },
    );
    response.headers.set(
      "X-PAYMENT-RESPONSE",
      encodeHeader(settlementResponse),
    );
    return response;
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
