import { APIMessageContentResolvable, Message } from "discord.js";
import client from "../client";
import config from "../config";
import { EventHandler, Module } from "../internal/types";

const buildResponseForMessage = async (
  message: Message
): Promise<APIMessageContentResolvable> => {
  return "uwu"; //todo
};

const handleMessage: EventHandler<"message"> = async (message: Message) => {
  // Message must be from bot owner
  // TODO remove this once feature is out of development
  if (message.author.id !== config.ownerId) {
    return;
  }

  // Message must mention the bot
  if (!message.mentions.has(client.user)) {
    return;
  }

  const response = await buildResponseForMessage(message);
  await message.channel.send(response);
};

const SentienceModule: Module = {
  commands: [],
  handlers: {
    message: [handleMessage],
  },
};

export default SentienceModule;
