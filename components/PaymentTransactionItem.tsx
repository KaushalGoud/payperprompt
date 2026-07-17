'use client';

import { Transaction } from '@/lib/types';
import { ExternalLink } from 'lucide-react';

interface PaymentTransactionItemProps {
  transaction: Transaction;
}

export function PaymentTransactionItem({ transaction }: PaymentTransactionItemProps) {
  const timestamp = new Date(transaction.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  const truncateTxId = (txId: string) => {
    const start = txId.slice(0, 6);
    const end = txId.slice(-4);
    return `${start}...${end}`;
  };

  return (
    <div className="py-2 px-3 rounded border border-border/30 hover:bg-secondary/30 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted-foreground">{timestamp}</p>
          <p className="text-sm font-medium text-foreground mt-1">{transaction.amount} HBAR</p>
          <p className="text-xs text-muted-foreground/60 truncate mt-0.5">
            {truncateTxId(transaction.txId)}
          </p>
        </div>
        <a
          href={`https://hashscan.io/testnet/transaction/${transaction.txId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:text-accent/80 transition-colors flex-shrink-0"
          aria-label="View transaction on HashScan"
        >
          <ExternalLink size={16} />
        </a>
      </div>
    </div>
  );
}
