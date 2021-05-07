import { Quote } from ".prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import {
  APIApplicationCommandOption,
  APIEmbed,
  APIInteraction,
  ApplicationCommandInteractionDataOptionString,
  ApplicationCommandInteractionDataOptionSubCommand,
  ApplicationCommandOptionType,
  InteractionResponseType,
} from "discord-api-types";
import client from "../client";
import { respondToInteraction } from "../discord/api";
import prisma from "../prisma";
import { Command, Module, SerializableMessage } from "../types";
import { buildSerializableMessage } from "../utils/structures";

class QuotesCommand implements Command {
  name = "quotes";
  description = "Quotes";
  options: APIApplicationCommandOption[] = [
    {
      name: "add",
      description: "Adds a quote.",
      type: ApplicationCommandOptionType.SUB_COMMAND,
      options: [
        {
          name: "messageId",
          description: "The ID of the message you want to quote.",
          type: ApplicationCommandOptionType.STRING,
          required: true,
        },
      ],
    },
    {
      name: "search",
      description: "Gets the quote that's the closest match for a given query.",
      type: ApplicationCommandOptionType.SUB_COMMAND,
      options: [
        {
          name: "query",
          description: "The query to search for.",
          type: ApplicationCommandOptionType.STRING,
          required: true,
        },
      ],
    },
  ];

  async handle(interaction: APIInteraction) {
    const subcommand = interaction.data.options[0].name as "add" | "search";

    if (subcommand === "add") {
      const messageId = ((interaction.data
        .options[0] as ApplicationCommandInteractionDataOptionSubCommand)
        .options[0] as ApplicationCommandInteractionDataOptionString).value;

      const channel = await client.channels.fetch(interaction.channel_id);
      if (!channel.isText()) {
        throw new Error("Command must be called in a text channel.");
      }

      const message = buildSerializableMessage(
        await channel.messages.fetch(messageId)
      );

      try {
        await prisma.quote.create({
          data: {
            guildId: message.guild.id,
            userId: message.author.id,
            messageId: message.id,
            message,
          },
        });
      } catch (e) {
        if (e instanceof PrismaClientKnownRequestError && e.code === "P2002") {
          await respondToInteraction(interaction, {
            type: InteractionResponseType.ChannelMessageWithSource,
            data: { content: "That message has already been quoted." },
          });
        } else {
          throw e;
        }
      }

      // TODO put quote embed in response

      await respondToInteraction(interaction, {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: { content: "Quote added!" },
      });
    }

    if (subcommand === "search") {
      const query = ((interaction.data
        .options[0] as ApplicationCommandInteractionDataOptionSubCommand)
        .options[0] as ApplicationCommandInteractionDataOptionString).value;

      const results = await prisma.$queryRaw<
        Quote[]
      >`SELECT *, ts_rank_cd(to_tsvector(message -> 'content'), plainto_tsquery(${query})) AS rank
        FROM "Quote"
        WHERE to_tsvector(message -> 'content') @@ plainto_tsquery(${query})
        ORDER BY rank DESC
        LIMIT 1;
        `;

      if (!results.length) {
        await respondToInteraction(interaction, {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { content: "No quotes found for that query." },
        });

        return;
      }

      const quote = results[0];

      await respondToInteraction(interaction, {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          embeds: [
            buildEmbedForQuotedMessage(quote.message as SerializableMessage),
          ],
        },
      });
    }
  }
}

const buildEmbedForQuotedMessage = (message: SerializableMessage): APIEmbed => {
  return {
    author: {
      name: `${message.author.username}#${message.author.discriminator}`,
    },
    description: message.content,
  };
};

const QuotesModule: Module = {
  commands: [new QuotesCommand()],
  handlers: {},
};

export default QuotesModule;