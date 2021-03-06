import { ClientEvents, Snowflake } from "discord.js";
import { Command } from "./command";

export interface EventHandler<K extends keyof ClientEvents> {
  (...args: ClientEvents[K]): void;
}

export interface HandlerCollection {
  [event: string]: EventHandler<keyof ClientEvents>[];
}

export interface Module {
  commands: Command[];
  handlers: HandlerCollection;
}

export interface SerializableMessage {
  id: Snowflake;
  attachments: Array<{ id: Snowflake; url: string }>;
  author: {
    id: Snowflake;
    avatar: string | null;
    discriminator: string;
    username: string;
  };
  channel: {
    id: Snowflake;
  };
  content: string;
  createdAt: Date;
  guild: {
    id: Snowflake;
    name: string;
  };
  member: {
    nickname: string | null;
  };
  [key: string]: any;
}
