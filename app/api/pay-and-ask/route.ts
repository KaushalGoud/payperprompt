import { NextRequest, NextResponse } from "next/server";
import { payForAnswer, verifyPayment, hashscanUrl } from "@/lib/hedera";

export async function POST(req: NextRequest) {
  const { question } = await req.json();
  if (!question) {
    return NextResponse.json(
      { error: "question is required" },
      { status: 400 },
    );
  }

  try {
    // 1. Real payment on Hedera testnet
    const txId = await payForAnswer();

    // 2. Verify it via Mirror Node before releasing the answer
    const ok = await verifyPayment(txId);
    if (!ok) {
      return NextResponse.json(
        { error: "Payment verification failed" },
        { status: 402 },
      );
    }

    // 3. Payment confirmed — call the AI (Groq/OpenAI-compatible endpoint)
    const aiRes = await fetch(
      `${process.env.OPENAI_BASE_URL}/chat/completions`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL,
          messages: [{ role: "user", content: question }],
        }),
      },
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      throw new Error(`AI call failed: ${errText}`);
    }

    const aiData = await aiRes.json();
    const answer =
      aiData.choices?.[0]?.message?.content ?? "No answer generated.";

    return NextResponse.json({
      answer,
      paymentAmount: process.env.PRICE_HBAR || "0.1",
      txId,
      hashscanUrl: hashscanUrl(txId),
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Something went wrong" },
      { status: 500 },
    );
  }
}
