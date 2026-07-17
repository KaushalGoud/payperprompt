import {
  Client,
  PrivateKey,
  AccountId,
  TransferTransaction,
  Hbar,
  TransactionId,
} from "@hashgraph/sdk";

const RECEIVER_ACCOUNT_ID = process.env.RECEIVER_ACCOUNT_ID!;
const PRICE_HBAR = process.env.PRICE_HBAR || "0.1";
const MIRROR_NODE_URL =
  process.env.MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com";

export interface X402Challenge {
  x402Version: number;
  accepts: Array<{
    scheme: string;
    network: string;
    asset: string;
    amount: string;
    payTo: string;
    description: string;
  }>;
}

export function x402Challenge(): X402Challenge {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "hedera-transfer",
        network: "hedera-testnet",
        asset: "HBAR",
        amount: PRICE_HBAR,
        payTo: RECEIVER_ACCOUNT_ID,
        description: "Per-question AI answer access",
      },
    ],
  };
}

function parseOperatorKey(rawKey: string): PrivateKey {
  const trimmedKey = rawKey.trim();
  if (!trimmedKey) {
    throw new Error("HEDERA_PRIVATE_KEY is required.");
  }

  try {
    return PrivateKey.fromStringECDSA(trimmedKey);
  } catch (ecdsaError) {
    try {
      return PrivateKey.fromStringED25519(trimmedKey);
    } catch (ed25519Error) {
      throw new Error(
        "Unable to parse HEDERA_PRIVATE_KEY. Expected an ECDSA or ED25519 private key.",
      );
    }
  }
}

function normalizeKeyHex(value: string): string {
  return value.replace(/^0x/i, "").toLowerCase();
}

// Converts SDK format "0.0.x@seconds.nanos" -> Mirror Node REST format "0.0.x-seconds-nanos"
function toMirrorNodeFormat(txId: string): string {
  if (!txId.includes("@")) return txId; // already dash format
  const [account, timePart] = txId.split("@");
  const [seconds, nanos] = timePart.split(".");
  return `${account}-${seconds}-${nanos}`;
}

async function validateOperatorKey(client: Client, operatorKey: PrivateKey) {
  const operatorId = client.operatorAccountId;
  if (!operatorId) {
    throw new Error("Hedera operator account ID is missing.");
  }

  const response = await fetch(
    `${MIRROR_NODE_URL}/api/v1/accounts/${operatorId.toString()}`,
  );

  if (!response.ok) {
    throw new Error(
      `Unable to verify the Hedera account ${operatorId.toString()} against ${MIRROR_NODE_URL}.`,
    );
  }

  const accountData = await response.json();
  const onChainKey = accountData?.key?.key;

  if (!onChainKey) {
    throw new Error(
      `The Hedera account ${operatorId.toString()} does not expose a public key for validation.`,
    );
  }

  const derivedKey = normalizeKeyHex(operatorKey.publicKey.toStringRaw());
  const expectedKey = normalizeKeyHex(onChainKey);

  if (derivedKey !== expectedKey) {
    throw new Error(
      `Configured HEDERA_PRIVATE_KEY does not match HEDERA_ACCOUNT_ID ${operatorId.toString()}. The current key derives ${derivedKey}, but the account on testnet uses ${expectedKey}. Update the private key in your .env file and restart the app.`,
    );
  }
}

function buildClient(): { client: Client; operatorKey: PrivateKey } {
  const operatorId = AccountId.fromString(process.env.HEDERA_ACCOUNT_ID!);
  const operatorKey = parseOperatorKey(process.env.HEDERA_PRIVATE_KEY!);
  const client = Client.forTestnet();
  client.setOperator(operatorId, operatorKey);
  return { client, operatorKey };
}

/**
 * Executes a real HBAR transfer on Hedera testnet and returns the tx id
 * already formatted for the Mirror Node REST API ("0.0.x-seconds-nanos").
 */
export async function payForAnswer(): Promise<string> {
  const { client, operatorKey } = buildClient();
  await validateOperatorKey(client, operatorKey);
  const operatorId = client.operatorAccountId!;
  const txId = TransactionId.generate(operatorId);

  const tx = new TransferTransaction()
    .setTransactionId(txId)
    .addHbarTransfer(operatorId, Hbar.fromString(`-${PRICE_HBAR}`))
    .addHbarTransfer(
      AccountId.fromString(RECEIVER_ACCOUNT_ID),
      Hbar.fromString(PRICE_HBAR),
    )
    .freezeWith(client);

  const submitted = await tx.execute(client);
  const receipt = await submitted.getReceipt(client);

  if (receipt.status.toString() !== "SUCCESS") {
    throw new Error(`Hedera payment failed: ${receipt.status.toString()}`);
  }

  const formattedTxId = toMirrorNodeFormat(submitted.transactionId.toString());

  console.log(
    `Paid ${PRICE_HBAR} HBAR to ${RECEIVER_ACCOUNT_ID}. Tx: ${formattedTxId}`,
  );
  console.log(
    `HashScan: https://hashscan.io/testnet/transaction/${formattedTxId}`,
  );

  return formattedTxId;
}

const SPENT_TX_IDS = new Set<string>();

/**
 * Confirms on Mirror Node that txId is a successful HBAR transfer of
 * at least PRICE_HBAR to RECEIVER_ACCOUNT_ID, and blocks replay.
 */
export async function verifyPayment(txId: string): Promise<boolean> {
  if (SPENT_TX_IDS.has(txId)) {
    console.log(`⚠️  Payment ${txId} already used`);
    return false;
  }

  const lookupId = txId.includes("@") ? toMirrorNodeFormat(txId) : txId;
  const res = await fetch(
    `${MIRROR_NODE_URL}/api/v1/transactions/${encodeURIComponent(lookupId)}`,
  );

  if (!res.ok) {
    console.log(
      `⚠️  Mirror Node lookup failed for ${lookupId} (HTTP ${res.status})`,
    );
    return false;
  }

  const data = await res.json();
  const txn = data.transactions?.[0];
  if (!txn || txn.result !== "SUCCESS") {
    console.log(`⚠️  Transaction not confirmed: ${txn?.result ?? "not found"}`);
    return false;
  }

  const requiredTinybars = Math.round(parseFloat(PRICE_HBAR) * 1e8);
  const paidTinybars = (txn.transfers || [])
    .filter((t: any) => t.account === RECEIVER_ACCOUNT_ID && t.amount > 0)
    .reduce((sum: number, t: any) => sum + t.amount, 0);

  if (paidTinybars < requiredTinybars) {
    console.log(
      `⚠️  Underpaid: got ${paidTinybars}, needed ${requiredTinybars}`,
    );
    return false;
  }

  SPENT_TX_IDS.add(txId);
  console.log(`✅ Payment verified on Hedera testnet: ${lookupId}`);
  return true;
}
export function hashscanUrl(txId: string): string {
  return `https://hashscan.io/testnet/transaction/${encodeURIComponent(txId)}`;
}
