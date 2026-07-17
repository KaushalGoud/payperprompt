'use client';

import { Message } from '@/lib/types';
import { ExternalLink } from 'lucide-react';

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';

  const truncateTxId = (txId: string) => {
    const start = txId.slice(0, 8);
    const end = txId.slice(-6);
    return `${start}...${end}`;
  };

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div
        className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
          isUser
            ? 'bg-accent text-accent-foreground rounded-br-none'
            : 'bg-message-bg text-foreground rounded-bl-none'
        }`}
      >
        <p className="text-sm leading-relaxed">{message.content}</p>

        {message.paymentAmount && message.txId && !isUser && (
          <div className="mt-3 pt-3 border-t border-border/40 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              <span className="text-accent font-semibold">{message.paymentAmount}</span> HBAR paid
            </span>
            <a
              href={`https://hashscan.io/testnet/transaction/${message.txId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:text-accent/80 transition-colors ml-2"
              aria-label="View transaction on HashScan"
            >
              <ExternalLink size={14} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
