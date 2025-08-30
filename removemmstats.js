
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { loadDB, saveDB } = require('../../utils/db'); 
const { updateLeaderboard } = require('../../utils/leaderboardManager'); 
const { leaderboardChannelId, prefix } = require('../../config.json');

module.exports = {
    name: 'removemmstats',
    description: 'ADMIN ONLY: Completely removes a user and their stats from the middleman leaderboard.',
    usage: '<@user|userID>',
    category: 'admin',
    async execute(message, args, client) {
       
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: 'You do not have permission to remove users from the leaderboard.', ephemeral: true });
        }

        if (args.length < 1) {
            return message.reply(`Please specify a user to remove from the leaderboard.\nUsage: \`${prefix}${this.name} ${this.usage}\``);
        }

        const targetArg = args[0];
        let targetUser;

        if (message.mentions.users.first()) {
            targetUser = message.mentions.users.first();
        } else if (/^\d{17,19}$/.test(targetArg)) {
            try {
                targetUser = await client.users.fetch(targetArg);
            } catch (e) {
                
                console.warn(`[RemoveMMStats] Could not fetch user ${targetArg}, but will attempt to remove by ID if stats exist.`);
                targetUser = { id: targetArg, tag: `User (ID: ${targetArg})` }; 
            }
        } else {
            return message.reply({ content: 'Invalid user provided. Please use a user ID or mention.', ephemeral: true });
        }

        if (!targetUser || !targetUser.id) { 
            return message.reply({ content: 'Could not identify the specified user.', ephemeral: true });
        }

        
        client.db.mmLeaderboard = client.db.mmLeaderboard || {}; 

        if (!client.db.mmLeaderboard.hasOwnProperty(targetUser.id)) {
            return message.reply({ content: `${targetUser.tag || targetUser.id} is not on the leaderboard or has no stats recorded.`, ephemeral: true });
        }

        const oldStats = client.db.mmLeaderboard[targetUser.id];
        delete client.db.mmLeaderboard[targetUser.id];
        saveDB(client.db);

        console.log(`[RemoveMMStats] All stats for ${targetUser.tag || targetUser.id} (ID: ${targetUser.id}) removed by ${message.author.tag}. They had ${oldStats} points.`);

        const successEmbed = new EmbedBuilder()
            .setColor('#000000') 
            .setTitle('Middleman removed from leaderboard successfully!')
            .setDescription(`All stats for **${targetUser.tag || targetUser.id}** have been completely removed from the leaderboard.`)
            .addFields(
                { name: 'User Removed', value: `${targetUser.tag || targetUser.id} (ID: ${targetUser.id})` },
                { name: 'Previous Score', value: oldStats.toString() }
            )
            .setFooter({ text: `Action by ${message.author.tag}` })
            .setTimestamp();

        await message.channel.send({ embeds: [successEmbed] });

        
        if (leaderboardChannelId) {
            updateLeaderboard(client);
        }
    },
};
