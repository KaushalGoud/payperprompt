"use client";

import { useState } from "react";
import { Message, Transaction } from "@/lib/types";
import { ChatInterface } from "@/components/ChatInterface";
import { PaymentSidebar } from "@/components/PaymentSidebar";

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const handleNewMessage = (message: Message, transaction?: Transaction) => {
    setMessages((prev) => [...prev, message]);
    if (transaction && transaction.amount !== "0") {
      setTransactions((prev) => [...prev, transaction]);
    }
  };

  return (
    <main className="h-screen flex flex-col md:flex-row">
      {/* Chat Interface - Left Column */}
      <div className="flex-1 md:w-2/3 flex flex-col min-h-0">
        <ChatInterface messages={messages} onNewMessage={handleNewMessage} />
      </div>

      {/* Payment Sidebar - Right Column */}
      <div className="w-full md:w-1/3 min-h-48 md:min-h-0 flex flex-col">
        <PaymentSidebar transactions={transactions} />
      </div>
    </main>
  );
}
