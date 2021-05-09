import _ = require("lodash");
import client from "../../client";
import config from "../../config";
import {
  buildApplicationCommandDataFromCommand,
  commandMatchesRegisteredCommand,
} from "../../discord/utils";
import logger from "../../logger";
import { EventHandler } from "../../types";

const synchronizeCommands: EventHandler<"ready"> = async () => {
  logger.info("Synchronizing commands...");
  logger.debug("Synchronizing global commands...");

  const existingCommands = (await client.application.commands.fetch()).array();

  for (const command of config.globalCommands) {
    const registeredCommand = existingCommands.find(
      (c) => c.name === command.name
    );
    if (registeredCommand !== undefined) {
      if (!commandMatchesRegisteredCommand(command, registeredCommand)) {
        await registeredCommand.edit(
          buildApplicationCommandDataFromCommand(command)
        );
      }
    } else {
      logger.debug(`Registering command /${command.name}...`);
      await client.application.commands.create(
        buildApplicationCommandDataFromCommand(command)
      );
    }
  }

  for (const command of existingCommands) {
    if (
      config.globalCommands.find((c) => c.name === command.name) === undefined
    ) {
      logger.debug(`Deleting stale command /${command.name}...`);
      await command.delete();
    }
  }

  for (const guildId in config.guilds) {
    const guild = await client.guilds.fetch(guildId);

    if (config.guilds[guildId].commands) {
      logger.debug(`Synchronizing commands for ${guild.name}...`);

      const existingCommands = (await guild.commands.fetch()).array();

      for (const command of config.guilds[guildId].commands) {
        const registeredCommand = existingCommands.find(
          (c) => c.name === command.name
        );
        if (registeredCommand !== undefined) {
          if (!commandMatchesRegisteredCommand(command, registeredCommand)) {
            await registeredCommand.edit(
              buildApplicationCommandDataFromCommand(command)
            );
          }
        } else {
          logger.debug(`Registering command /${command.name}...`);
          await guild.commands.create(
            buildApplicationCommandDataFromCommand(command)
          );
        }
      }

      for (const command of existingCommands) {
        if (
          config.guilds[guildId].commands.find(
            (c) => c.name === command.name
          ) === undefined
        ) {
          logger.debug(`Deleting stale command /${command.name}...`);
          await command.delete();
        }
      }
    }
  }

  // Clean up leftover commands in guilds that used to have guild
  // commands configured, but not anymore

  for (const guild of client.guilds.cache.array()) {
    if (config.guilds[guild.id] === undefined) {
      const commands = (await guild.commands.fetch()).array();

      if (commands.length > 0) {
        logger.debug(`Deleting stale commands in guild /${guild.name}...`);
      }

      for (const command of commands) {
        logger.debug(`Deleting stale command /${command.name}...`);
        await command.delete();
      }
    }
  }

  logger.info("All commands synchronized.");
};

export default synchronizeCommands;
