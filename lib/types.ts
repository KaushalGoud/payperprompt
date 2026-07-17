export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  paymentAmount?: string;
  txId?: string;
  timestamp: number;
}

export interface Transaction {
  id: string;
  timestamp: number;
  amount: string;
  txId: string;
}

export type StatusStep = 'sending' | 'payment-required' | 'paying' | 'generating' | 'complete';
