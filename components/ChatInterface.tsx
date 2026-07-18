"use client";

import { useState, useRef, useEffect } from "react";
import { Message, StatusStep, Transaction } from "@/lib/types";
import { MessageBubble } from "./MessageBubble";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";

interface ChatInterfaceProps {
  messages: Message[];
  onNewMessage: (message: Message, transaction?: Transaction) => void;
}

const STATUS_STEPS: { step: StatusStep; label: string }[] = [
  { step: "sending", label: "Sending question..." },
  { step: "payment-required", label: "Payment required (0.1 HBAR)" },
  { step: "paying", label: "Paying on Hedera testnet..." },
  { step: "generating", label: "Payment confirmed, generating answer..." },
];

export function ChatInterface({ messages, onNewMessage }: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStatus, setCurrentStatus] = useState<StatusStep | null>(null);
  const [statusIndex, setStatusIndex] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: "user",
      content: input,
      timestamp: Date.now(),
    };

    onNewMessage(userMessage);

    setInput("");
    setIsLoading(true);
    setStatusIndex(0);
    setCurrentStatus("sending");

    try {
      // Step 1: ask without payment — expect a 402 challenge
      const challengeRes = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: userMessage.content }),
      });

      if (challengeRes.status !== 402) {
        const data = await challengeRes.json();
        throw new Error(data.error || "Expected a payment challenge.");
      }

      const challenge = await challengeRes.json();
      const requirements = challenge.accepts[0];

      setCurrentStatus("paying");

      // Step 2: sign the payment client-side
      const { createSignedPayment } = await import("@/lib/client-wallet");
      const paymentPayload = await createSignedPayment(requirements);
      const encodedPayment = Buffer.from(
        JSON.stringify(paymentPayload),
      ).toString("base64");

      setCurrentStatus("generating");

      // Step 3: retry with the signed payment attached
      const finalRes = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PAYMENT": encodedPayment,
        },
        body: JSON.stringify({ question: userMessage.content }),
      });

      const data = await finalRes.json();

      if (!finalRes.ok) {
        throw new Error(data.error || "Unable to get a response.");
      }

      const aiMessage: Message = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        content:
          typeof data.answer === "string" && data.answer.trim()
            ? data.answer
            : "No response was returned.",
        paymentAmount: data.paymentAmount,
        txId: data.txId,
        timestamp: Date.now(),
      };

      const transaction =
        data.paymentAmount && data.txId
          ? {
              id: `tx-${Date.now()}`,
              timestamp: Date.now(),
              amount: data.paymentAmount,
              txId: data.txId,
            }
          : undefined;

      onNewMessage(aiMessage, transaction);
    } catch (error) {
      console.error("Error:", error);
      const errorText =
        error instanceof Error
          ? error.message
          : "Sorry, something went wrong. Please try again.";
      const errorMessage: Message = {
        id: `msg-${Date.now() + 2}`,
        role: "assistant",
        content: errorText,
        timestamp: Date.now(),
      };
      onNewMessage(errorMessage);
    } finally {
      setIsLoading(false);
      setCurrentStatus(null);
      setStatusIndex(0);
    }
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
        {messages.length === 0 && !isLoading && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h1 className="text-2xl lg:text-3xl font-bold text-foreground mb-2">
                PayPerPrompt
              </h1>
              <p className="text-sm text-muted-foreground">
                Ask questions and pay with HBAR. Start your conversation below.
              </p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}

        {isLoading && currentStatus && (
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                <Loader2 className="w-4 h-4 animate-spin text-accent" />
                <span>
                  {STATUS_STEPS.find((s) => s.step === currentStatus)?.label ??
                    "Working..."}
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 lg:p-6 border-t border-border/30 bg-secondary/50">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-lg bg-background text-foreground border border-border/50 placeholder:text-muted-foreground/50 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          />
          <Button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-accent hover:bg-accent/90 text-accent-foreground gap-2"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            {isLoading ? "" : "Ask"}
          </Button>
        </form>
      </div>
    </div>
  );
}
