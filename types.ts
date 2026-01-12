
export type MessageRole = 'user' | 'assistant';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
}

export interface ImpactStat {
  label: string;
  value: string;
  description: string;
}

export interface FAQItem {
  question: string;
  category: 'general' | 'symptoms' | 'prevention' | 'emergency';
}
