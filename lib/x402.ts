/**
 * x402 protocol types, adapted for a Hedera "exact" scheme.
 * Mirrors the coinbase/x402 v2 spec: PaymentRequirements, PaymentPayload,
 * and the PAYMENT-REQUIRED / X-PAYMENT header conventions.
 */

export const X402_VERSION = 1;

export interface PaymentRequirements {
  scheme: "exact";
  network: "hedera-testnet";
  maxAmountRequired: string; // tinybars, as a string per spec convention
  resource: string; // the endpoint being paid for
  description: string;
  mimeType: string;
  payTo: string; // Hedera account id, e.g. "0.0.xxxx"
  maxTimeoutSeconds: number;
  asset: string; // "HBAR"
  extra?: Record<string, unknown>;
}

export interface PaymentRequiredResponse {
  x402Version: number;
  accepts: PaymentRequirements[];
}

export interface PaymentPayload {
  x402Version: number;
  scheme: "exact";
  network: "hedera-testnet";
  payload: {
    // Base64-encoded, client-signed Hedera TransferTransaction bytes
    // (via Transaction.toBytes() after freezeWith + sign, NOT executed).
    signedTransactionBase64: string;
  };
}

export function encodeHeader(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

export function decodeHeader<T>(header: string): T {
  return JSON.parse(Buffer.from(header, "base64").toString("utf-8")) as T;
}
