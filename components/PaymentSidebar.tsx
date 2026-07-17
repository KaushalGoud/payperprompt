'use client';

import { Transaction } from '@/lib/types';
import { PaymentTransactionItem } from './PaymentTransactionItem';

interface PaymentSidebarProps {
  transactions: Transaction[];
}

export function PaymentSidebar({ transactions }: PaymentSidebarProps) {
  const totalSpent = transactions.reduce((sum, tx) => {
    const amount = parseFloat(tx.amount);
    return sum + (isNaN(amount) ? 0 : amount);
  }, 0);

  const questionCount = transactions.length;

  return (
    <div className="h-full flex flex-col bg-secondary border-l border-border/30">
      {/* Header */}
      <div className="p-4 border-b border-border/30">
        <h2 className="text-sm font-semibold text-foreground mb-2">Payment Activity</h2>
        <p className="text-xs text-muted-foreground">
          {totalSpent.toFixed(2)} HBAR spent · {questionCount} {questionCount === 1 ? 'question' : 'questions'}
        </p>
      </div>

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {transactions.length === 0 ? (
          <div className="flex items-center justify-center h-full text-center">
            <p className="text-xs text-muted-foreground">Your payment history will appear here</p>
          </div>
        ) : (
          transactions
            .slice()
            .reverse()
            .map((transaction) => (
              <PaymentTransactionItem key={transaction.id} transaction={transaction} />
            ))
        )}
      </div>
    </div>
  );
}
