import { NextRequest, NextResponse } from "next/server";
import { payForAnswer, verifyPayment, hashscanUrl } from "@/lib/hedera";

const providerApiKey = process.env.OPENAI_API_KEY || process.env.AI_API_KEY;
const providerBaseUrl =
  process.env.OPENAI_BASE_URL ||
  process.env.AI_BASE_URL ||
  "https://api.openai.com/v1";
const providerModel = process.env.OPENAI_MODEL || "gpt-4o-mini";

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

    if (!providerApiKey) {
      return NextResponse.json(
        {
          error:
            "AI provider is not configured. Set OPENAI_API_KEY (or AI_API_KEY) to enable real responses.",
        },
        { status: 500 },
      );
    }

    // --- x402 payment step: real HBAR transfer on Hedera testnet ---
    let txId: string;
    try {
      txId = await payForAnswer();
    } catch (paymentError) {
      const message =
        paymentError instanceof Error
          ? paymentError.message
          : "Payment on Hedera testnet failed.";

      console.error("Hedera payment error:", paymentError);
      return NextResponse.json({ error: message }, { status: 402 });
    }

    // Give Mirror Node a few seconds to index the transaction before checking it
    await new Promise((resolve) => setTimeout(resolve, 4000));

    const paymentVerified = await verifyPayment(txId);
    if (!paymentVerified) {
      return NextResponse.json(
        { error: "Payment verification failed." },
        { status: 402 },
      );
    }
    // --- payment confirmed, proceed to generate the answer ---

    const response = await fetch(
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
            {
              role: "user",
              content: question,
            },
          ],
        }),
      },
    );

    if (!response.ok) {
      const errorPayload = await response.text();
      console.error("AI provider error:", response.status, errorPayload);
      return NextResponse.json(
        {
          error:
            "Unable to generate a response from the configured AI provider.",
        },
        { status: response.status },
      );
    }

    const data = await response.json();
    const answer = data?.choices?.[0]?.message?.content?.trim();

    if (!answer) {
      return NextResponse.json(
        { error: "The AI provider returned an empty response." },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        answer,
        paymentAmount: process.env.PRICE_HBAR || "0.1",
        txId,
        hashscanUrl: hashscanUrl(txId),
      },
      { status: 200 },
    );
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 },
    );
  }
}
