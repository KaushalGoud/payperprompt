import {
  Client,
  Transaction,
  TransferTransaction,
  AccountId,
} from "@hashgraph/sdk";
import { PaymentRequirements } from "./x402";

const MIRROR_NODE_URL =
  process.env.MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com";

function buildFacilitatorClient(): Client {
  // The facilitator only needs a node client to broadcast already-signed
  // transactions — it does NOT need its own operator key to pay with,
  // since the client supplied a fully signed transaction.
  return Client.forTestnet();
}

interface DecodedPayment {
  transaction: TransferTransaction;
  payerAccountId: string;
  amountTinybars: number;
  recipientAccountId: string;
}

function decodeSignedTransaction(
  signedTransactionBase64: string,
): DecodedPayment {
  const bytes = Buffer.from(signedTransactionBase64, "base64");
  const transaction = Transaction.fromBytes(bytes);

  if (!(transaction instanceof TransferTransaction)) {
    throw new Error("Payment payload is not a TransferTransaction.");
  }

  const hbarTransfers = transaction.hbarTransfers;
  if (!hbarTransfers || hbarTransfers.size === 0) {
    throw new Error("Payment payload has no HBAR transfers.");
  }

  let payerAccountId = "";
  let recipientAccountId = "";
  let amountTinybars = 0;

  for (const [accountId, amount] of hbarTransfers) {
    const tinybars = amount.toTinybars().toNumber();
    if (tinybars < 0) {
      payerAccountId = accountId.toString();
    } else if (tinybars > 0) {
      recipientAccountId = accountId.toString();
      amountTinybars = tinybars;
    }
  }

  if (!payerAccountId || !recipientAccountId) {
    throw new Error("Could not determine payer/recipient from payload.");
  }

  return { transaction, payerAccountId, amountTinybars, recipientAccountId };
}

/**
 * Verifies a client-signed payment WITHOUT broadcasting it —
 * checks it's well-formed and matches the required terms.
 * Mirrors the x402 facilitator's /verify step.
 */
export function verifyPaymentPayload(
  signedTransactionBase64: string,
  requirements: PaymentRequirements,
): { valid: boolean; reason?: string; decoded?: DecodedPayment } {
  try {
    const decoded = decodeSignedTransaction(signedTransactionBase64);

    if (decoded.recipientAccountId !== requirements.payTo) {
      return { valid: false, reason: "Recipient does not match payTo." };
    }

    const required = parseInt(requirements.maxAmountRequired, 10);
    if (decoded.amountTinybars < required) {
      return { valid: false, reason: "Amount is less than required." };
    }

    return { valid: true, decoded };
  } catch (err: any) {
    return {
      valid: false,
      reason: err.message || "Malformed payment payload.",
    };
  }
}

const SETTLED_TX_IDS = new Set<string>();

/**
 * Broadcasts an already-verified, client-signed transaction to Hedera.
 * Mirrors the x402 facilitator's /settle step.
 */
export async function settlePayment(
  signedTransactionBase64: string,
): Promise<{ success: boolean; txId?: string; error?: string }> {
  try {
    const bytes = Buffer.from(signedTransactionBase64, "base64");
    const transaction = Transaction.fromBytes(bytes) as TransferTransaction;

    const txIdBeforeSubmit = transaction.transactionId?.toString();
    if (txIdBeforeSubmit && SETTLED_TX_IDS.has(txIdBeforeSubmit)) {
      console.log(`⚠️  Replay blocked: ${txIdBeforeSubmit}`);
      return {
        success: false,
        error: "Transaction already settled (replay blocked).",
      };
    }

    const client = buildFacilitatorClient();
    const response = await transaction.execute(client);
    const receipt = await response.getReceipt(client);

    if (receipt.status.toString() !== "SUCCESS") {
      console.log(`❌ Settlement failed: ${receipt.status.toString()}`);
      return {
        success: false,
        error: `Settlement failed: ${receipt.status.toString()}`,
      };
    }

    const raw = response.transactionId.toString();
    const [account, timePart] = raw.split("@");
    const [seconds, nanos] = timePart.split(".");
    const formattedTxId = `${account}-${seconds}-${nanos}`;

    SETTLED_TX_IDS.add(formattedTxId);
    console.log(`✅ Settled on Hedera testnet: ${formattedTxId}`);
    return { success: true, txId: formattedTxId };
  } catch (err: any) {
    console.log(`❌ Settlement error: ${err.message || "unknown"}`);
    return { success: false, error: err.message || "Settlement failed." };
  }
}

export function hashscanUrl(txId: string): string {
  return `https://hashscan.io/testnet/transaction/${txId}`;
}
