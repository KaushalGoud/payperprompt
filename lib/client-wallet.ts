"use client";

import {
  Client,
  PrivateKey,
  AccountId,
  TransferTransaction,
  Hbar,
  HbarUnit,
} from "@hashgraph/sdk";
import { PaymentRequirements, PaymentPayload, X402_VERSION } from "./x402";

// Demo-only client-side wallet. In production this would be replaced by
// HashPack / HashConnect, where the user's own wallet extension signs.
const CLIENT_ACCOUNT_ID = process.env.NEXT_PUBLIC_HEDERA_CLIENT_ACCOUNT_ID!;
const CLIENT_PRIVATE_KEY = process.env.NEXT_PUBLIC_HEDERA_CLIENT_PRIVATE_KEY!;

function buildSigningClient(): Client {
  const accountId = AccountId.fromString(CLIENT_ACCOUNT_ID);
  const privateKey = PrivateKey.fromStringECDSA(
    CLIENT_PRIVATE_KEY.replace(/^0x/i, ""),
  );
  const client = Client.forTestnet();
  client.setOperator(accountId, privateKey);
  return client;
}

/**
 * Builds and signs (but does NOT submit) a Hedera transfer matching the
 * server's PaymentRequirements, then packages it as an x402 PaymentPayload.
 */
export async function createSignedPayment(
  requirements: PaymentRequirements,
): Promise<PaymentPayload> {
  const client = buildSigningClient();
  const payerId = AccountId.fromString(CLIENT_ACCOUNT_ID);
  const recipientId = AccountId.fromString(requirements.payTo);
  const amount = Hbar.fromTinybars(
    parseInt(requirements.maxAmountRequired, 10),
  );

  const transaction = new TransferTransaction()
    .addHbarTransfer(payerId, amount.negated())
    .addHbarTransfer(recipientId, amount)
    .freezeWith(client);

  const signedTransaction = await transaction.sign(
    PrivateKey.fromStringECDSA(CLIENT_PRIVATE_KEY.replace(/^0x/i, "")),
  );

  const bytes = signedTransaction.toBytes();
  const signedTransactionBase64 = Buffer.from(bytes).toString("base64");

  return {
    x402Version: X402_VERSION,
    scheme: "exact",
    network: "hedera-testnet",
    payload: { signedTransactionBase64 },
  };
}
