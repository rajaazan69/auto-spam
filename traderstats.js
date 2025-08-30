const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { saveDB } = require('../../utils/db');
const { updateTraderLeaderboard, updateTraderTopRole } = require('../../utils/traderLeaderboardManager');
const { traderLeaderboardChannelId, topTraderRoleId, prefix } = require('../../config.json');

module.exports = {
    name: 'traderstats',
    description: 'ADMIN ONLY: Add/remove trader tickets or force leaderboard role update. Usage: add/remove/updaterole <@user|userID> [amount]',
    usage: '<add|remove|updaterole> <@user|userID> [amount]',
    category: 'admin',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: 'You do not have permission to modify the trader leaderboard.', ephemeral: true });
        }

        if (!args[0]) {
            return message.reply(`Usage: \`${prefix}${this.name} ${this.usage}\``);
        }

        const subcommand = args[0].toLowerCase();
        if (!['add', 'remove', 'updaterole'].includes(subcommand)) {
            return message.reply('First argument must be `add`, `remove`, or `updaterole`.');
        }

        
        if (subcommand === 'add' || subcommand === 'remove') {
            if (!args[1]) return message.reply('You must mention a user or provide their ID.');
            let userId = args[1].replace(/[<@!>]/g, '');
            let amount = parseInt(args[2]) || 1;
            if (amount < 1) amount = 1;

            client.db.traderLeaderboard = client.db.traderLeaderboard || {};

            
            let user;
            try {
                user = await client.users.fetch(userId);
            } catch (e) {
                user = { id: userId, tag: `User (ID: ${userId})` };
            }

            if (subcommand === 'add') {
                client.db.traderLeaderboard[userId] = (client.db.traderLeaderboard[userId] || 0) + amount;
            } else if (subcommand === 'remove') {
                client.db.traderLeaderboard[userId] = Math.max(0, (client.db.traderLeaderboard[userId] || 0) - amount);
            }
            saveDB(client.db);

           
            if (traderLeaderboardChannelId) await updateTraderLeaderboard(client);
            if (topTraderRoleId && message.guild) await updateTraderTopRole(client, message.guild);

         
            const verb = (subcommand === 'add') ? 'Added' : 'Removed';
            const embed = new EmbedBuilder()
                .setColor('#000000')
                .setTitle(`Trader Leaderboard Updated`)
                .setDescription(`${verb} **${amount}** ticket${amount === 1 ? '' : 's'} ${subcommand === 'add' ? 'to' : 'from'} <@${user.id}>.`)
                .addFields(
                    { name: 'User', value: `<@${user.id}> (ID: ${user.id})` },
                    { name: 'Current Tickets', value: client.db.traderLeaderboard[userId].toString() }
                )
                .setFooter({ text: `Action by ${message.author.tag}` })
                .setTimestamp();

            return message.channel.send({ embeds: [embed] });
        }

       
        if (subcommand === 'updaterole') {
            if (topTraderRoleId && message.guild) {
                await updateTraderTopRole(client, message.guild);
                return message.reply('Top 10 trader roles have been updated!');
            } else {
                return message.reply('Top trader role is not configured or guild unavailable.');
            }
        }
    },
};