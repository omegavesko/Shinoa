import { Prisma, Quote } from ".prisma/client";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime";
import {
  APIApplicationCommandOption,
  APIEmbed,
  APIInteraction,
  ApplicationCommandInteractionDataOptionString,
  ApplicationCommandInteractionDataOptionSubCommand,
  ApplicationCommandInteractionDataOptionUser,
  ApplicationCommandOptionType,
  InteractionResponseType,
  MessageFlags,
} from "discord-api-types";
import client from "../client";
import { respondToInteraction } from "../discord/api";
import prisma from "../prisma";
import { Command, Module, SerializableMessage } from "../types";
import { buildSerializableMessage } from "../utils/structures";
import * as mime from "mime-types";
import { isGuildInteraction } from "discord-api-types/utils/v8";
import { Snowflake } from "discord.js";
import logger from "../logger";

// TODO tie /quote add to a role rather than a permission
// TODO add some way to page through search results
// TODO migrate images for Philia quotes
// TODO show IDs and allow get/delete based on those?

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
          name: "message_id",
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
        {
          name: "user",
          description: "Restrict the search to quotes from a specific user.",
          type: ApplicationCommandOptionType.USER,
        },
      ],
    },
    {
      name: "random",
      description: "Shows a random quote.",
      type: ApplicationCommandOptionType.SUB_COMMAND,
      options: [
        {
          name: "user",
          description: "Restricts the command to quotes from a specific user.",
          type: ApplicationCommandOptionType.USER,
        },
      ],
    },
  ];

  async handle(interaction: APIInteraction) {
    if (!isGuildInteraction(interaction)) {
      throw new Error("Command must be called inside a guild.");
    }

    const subcommand = interaction.data.options[0].name as
      | "add"
      | "search"
      | "random";

    const member = await (
      await client.guilds.fetch(interaction.guild_id)
    ).members.fetch(interaction.member.user.id);

    if (subcommand === "add") {
      if (!member.hasPermission("MANAGE_MESSAGES")) {
        await respondToInteraction(interaction, {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: {
            flags: MessageFlags.EPHEMERAL,
            content: `You need the MANAGE_MESSAGES permission to add quotes.`,
          },
        });

        return;
      }

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

      await respondToInteraction(interaction, {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          content: "Quote added!",
          embeds: [await buildEmbedForQuotedMessage(message)],
        },
      });
    }

    if (subcommand === "search") {
      const query = ((interaction.data
        .options[0] as ApplicationCommandInteractionDataOptionSubCommand)
        .options[0] as ApplicationCommandInteractionDataOptionString).value;

      let userId: Snowflake;

      if (
        (interaction.data
          .options[0] as ApplicationCommandInteractionDataOptionSubCommand)
          .options[1]
      ) {
        userId = ((interaction.data
          .options[0] as ApplicationCommandInteractionDataOptionSubCommand)
          .options[1] as ApplicationCommandInteractionDataOptionUser).value;
      }

      const results = await prisma.$queryRaw<Quote[]>`SELECT
        *,
        ts_rank_cd(
          to_tsvector(
            message ->> 'content' || ' ' ||
            coalesce(message #>> '{author,username}', '') || ' ' ||
            coalesce(message #>> '{member,nickname}', '')
          ),
          plainto_tsquery(${query})
        ) AS rank
        FROM "Quote"
        WHERE "guildId" = ${interaction.guild_id}
          ${userId ? Prisma.sql`AND "userId" = ${userId}` : Prisma.empty}
          AND to_tsvector(
            message ->> 'content' || ' ' ||
            coalesce(message #>> '{author,username}', '') || ' ' ||
            coalesce(message #>> '{member,nickname}', '')
          )
          @@ plainto_tsquery(${query})
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
            await buildEmbedForQuotedMessage(
              quote.message as SerializableMessage
            ),
          ],
        },
      });
    }

    if (subcommand === "random") {
      let userId: Snowflake;

      if (
        (interaction.data
          .options[0] as ApplicationCommandInteractionDataOptionSubCommand)
          .options
      ) {
        userId = ((interaction.data
          .options[0] as ApplicationCommandInteractionDataOptionSubCommand)
          .options[0] as ApplicationCommandInteractionDataOptionUser).value;
      }

      const results = await prisma.$queryRaw<Quote[]>`
        SELECT
        *
        FROM "Quote"
        WHERE "guildId" = ${interaction.guild_id}
          ${userId ? Prisma.sql`AND "userId" = ${userId}` : Prisma.empty}
        ORDER BY random()
        LIMIT 1;
        `;

      if (!results.length) {
        await respondToInteraction(interaction, {
          type: InteractionResponseType.ChannelMessageWithSource,
          data: { content: "No quotes found." },
        });

        return;
      }

      const quote = results[0];

      await respondToInteraction(interaction, {
        type: InteractionResponseType.ChannelMessageWithSource,
        data: {
          embeds: [
            await buildEmbedForQuotedMessage(
              quote.message as SerializableMessage
            ),
          ],
        },
      });
    }
  }
}

const buildEmbedForQuotedMessage = async (
  message: SerializableMessage
): Promise<APIEmbed> => {
  const embed: APIEmbed = {
    author: {
      name: `${message.author.username}#${message.author.discriminator}`,
      icon_url: `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}`,
    },
    description: message.content,
    timestamp: (message.createdAt as unknown) as string,
    fields: [],
  };

  try {
    const member = await (
      await client.guilds.fetch(message.guild.id)
    ).members.fetch(message.author.id);

    embed.author = {
      name:
        member.nickname ??
        `${member.user.username}#${member.user.discriminator}`,
      icon_url: `https://cdn.discordapp.com/avatars/${member.user.id}/${member.user.avatar}`,
    };
  } catch (e) {
    logger.debug(`Couldn't fetch a member for user ID ${message.author.id}.`);
  }

  const image = message.attachments.find((a) =>
    (mime.lookup(a.url) || "unknown").startsWith("image/")
  );
  const video = message.attachments.find((a) =>
    (mime.lookup(a.url) || "unknown").startsWith("video/")
  );

  if (image !== undefined) {
    embed.image = { url: image.url };
  }

  if (video !== undefined) {
    embed.fields.push({ name: "Video", value: video.url });
  }

  return embed;
};

const QuotesModule: Module = {
  commands: [new QuotesCommand()],
  handlers: {},
};

export default QuotesModule;
