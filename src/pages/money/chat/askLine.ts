/**
 * What a conversation is made of: one line of it, what may be attached and how a photo is
 * shrunk before it goes, the offers a person tends to take first, and the counter that names
 * each exchange. (Split from MoneyChatPage on 2026-09-19, M2-2b.)
 */
import type { ChatFigure, ChatReceipt, ChatAction } from '../../../services/api/moneyAPI';

/** One line of the conversation: yours, or the ledger's with what it drew and what it stands on. */
export type AskLine = {
  id: string; who: 'you' | 'twin'; text: string; pending?: boolean; figures?: ChatFigure[]; receipts?: ChatReceipt[];
  /** The offers under an answer, the model's own reasoning, and the context lines it stood on. */
  actions?: ChatAction[]; thinking?: string; basis?: string[]; acted?: string; howOpen?: boolean;
  /** Still being written: the caret sits at the end. A file you sent, with its picture when it has one. */
  writing?: boolean; error?: string; file?: { name: string; url?: string };
};

/** Vercel takes 4 MB of body; a photo bigger than this is shrunk before it goes. */
export const MAX_UPLOAD = 4 * 1024 * 1024;
export const ACCEPT = '.jpg,.jpeg,.png,.webp,.gif,.heic,.pdf,.txt,.csv,.tsv,.xlsx,.xls,image/*,application/pdf';

/** A phone photo is 3 to 6 MB; the receipt on it reads the same at 1800px and a tenth of the bytes. */
export async function shrink(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size < 1.2 * 1024 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1800 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d')?.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** What a person tends to ask first. Each is offered once and never after it was asked. */
export const OFFERS = ['What can I spend today?', 'What changed this week?', 'Where did the money go?', 'What comes back every month?', 'How does this month compare?', 'What is still to come?'];

let askSeq = 0;
/** The next exchange's number, shared by a question and a file so their ids never collide. */
export function nextAsk(): number { askSeq += 1; return askSeq; }
