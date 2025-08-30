const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { saveDB } = require('../../utils/db');
const { updateTraderLeaderboard, updateTraderTopRole } = require('../../utils/traderLeaderboardManager');
const { traderLeaderboardChannelId, topTraderRoleId, prefix } = require('../../config.json');

module.exports = {
    name: 'removetraderstats',
    description: 'ADMIN ONLY: Completely removes a user and their stats from the trader leaderboard.',
    usage: '<@user|userID>',
    category: 'admin',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: 'You do not have permission to remove users from the trader leaderboard.', ephemeral: true });
        }

        if (!args[0]) {
            return message.reply(`Please specify a user to remove from the leaderboard.\nUsage: \`${prefix}${this.name} ${this.usage}\``);
        }

        const targetId = args[0].replace(/[<@!>]/g, '');
        let targetUser;
        try {
            targetUser = await client.users.fetch(targetId);
        } catch {
            targetUser = { id: targetId, tag: `User (ID: ${targetId})` };
        }

        client.db.traderLeaderboard = client.db.traderLeaderboard || {};

        if (!client.db.traderLeaderboard.hasOwnProperty(targetUser.id)) {
            return message.reply({ content: `${targetUser.tag || targetUser.id} is not on the leaderboard or has no stats recorded.` });
        }

        const oldStats = client.db.traderLeaderboard[targetUser.id];
        delete client.db.traderLeaderboard[targetUser.id];
        saveDB(client.db);

        const embed = new EmbedBuilder()
            .setColor('#000000')
            .setTitle('Trader removed from leaderboard successfully!')
            .setDescription(`All stats for **${targetUser.tag || targetUser.id}** have been completely removed from the leaderboard.`)
            .addFields(
                { name: 'User Removed', value: `${targetUser.tag || targetUser.id} (ID: ${targetUser.id})` },
                { name: 'Previous Score', value: oldStats.toString() }
            )
            .setFooter({ text: `Action by ${message.author.tag}` })
            .setTimestamp();

        await message.channel.send({ embeds: [embed] });

        if (traderLeaderboardChannelId) await updateTraderLeaderboard(client);
        if (topTraderRoleId && message.guild) await updateTraderTopRole(client, message.guild);
    },
};