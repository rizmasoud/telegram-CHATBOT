import { Context, SessionFlavor } from 'grammy';
import { ConversationFlavor, Conversation } from '@grammyjs/conversations';
import { SessionData, User } from '../types';

export interface BotContextCustom {
  dbUser?: User | null;
}

// Inner context used inside conversation steps
export type MyContext = Context & SessionFlavor<SessionData> & BotContextCustom;

// Outer context used for bot handlers, commands, and middleware
export type BotContext = ConversationFlavor<MyContext>;

// Conversation handle
export type MyConversation = Conversation<BotContext, MyContext>;
