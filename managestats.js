
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { loadDB, saveDB } = require('../../utils/db');
const { updateLeaderboard } = require('../../utils/leaderboardManager'); 
const { leaderboardChannelId, prefix } = require('../../config.json');

module.exports = {
    name: 'managestats',
    description: 'Manually adjusts leaderboard stats for a middleman.',
    usage: '<add|remove|set> <@user|userID> <amount>',
    category: 'admin', 
    
    async execute(message, args, client) {
        
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: 'You do not have permission to manage leaderboard stats.', ephemeral: true });
        }

        if (args.length < 3) {
            return message.reply(`Invalid usage. \nUsage: \`${prefix}${this.name} ${this.usage}\``);
        }

        const action = args[0]?.toLowerCase();
        const targetArg = args[1];
        const amountArg = args[2];

        if (!['add', 'remove', 'set'].includes(action)) {
            return message.reply(`Invalid action. Must be 'add', 'remove', or 'set'.\nUsage: \`${prefix}${this.name} ${this.usage}\``);
        }

        let targetUser;
        if (message.mentions.users.first()) {
            targetUser = message.mentions.users.first();
        } else if (/^\d{17,19}$/.test(targetArg)) {
            try {
                targetUser = await client.users.fetch(targetArg);
            } catch (e) {
                return message.reply({ content: 'Could not find a user with that ID.', ephemeral: true });
            }
        } else {
            return message.reply({ content: 'Invalid user provided. Please use a user ID or mention.', ephemeral: true });
        }

        if (!targetUser) {
            return message.reply({ content: 'Could not find the specified user.', ephemeral: true });
        }

        const amount = parseInt(amountArg);
        if (isNaN(amount) || amount < 0) { 
            if (action === 'set' && amount === 0) {
              
            } else if (amount <= 0 && (action === 'add' || action === 'remove')) {
                 return message.reply({ content: 'Amount for add/remove must be a positive number.', ephemeral: true });
            } else if (isNaN(amount) || amount < 0) {
                 return message.reply({ content: 'Amount must be a valid non-negative number.', ephemeral: true });
            }
        }


        client.db.mmLeaderboard = client.db.mmLeaderboard || {}; 

        let oldAmount = client.db.mmLeaderboard[targetUser.id] || 0;
        let newAmount = 0;

        switch (action) {
            case 'add':
                newAmount = oldAmount + amount;
                break;
            case 'remove':
                newAmount = Math.max(0, oldAmount - amount); 
                break;
            case 'set':
                newAmount = amount;
                break;
        }

        client.db.mmLeaderboard[targetUser.id] = newAmount;
        saveDB(client.db);

        console.log(`[ManageStats] Stats for ${targetUser.tag} (${targetUser.id}) changed by ${message.author.tag}: ${action} ${amount}. Old: ${oldAmount}, New: ${newAmount}`);

        const successEmbed = new EmbedBuilder()
            .setColor('#000000')
            .setTitle('Leaderboard Stats Updated')
            .setDescription(`Stats for ${targetUser.tag} have been updated.`)
            .addFields(
                { name: 'User', value: `${targetUser.tag} (${targetUser.id})` },
                { name: 'Action', value: action.charAt(0).toUpperCase() + action.slice(1) },
                { name: 'Amount Involved', value: amount.toString() },
                { name: 'Old Score', value: oldAmount.toString() },
                { name: 'New Score', value: newAmount.toString() }
            )
            .setFooter({ text: `Updated by ${message.author.tag}` })
            .setTimestamp();

        await message.channel.send({ embeds: [successEmbed] });

        
        if (leaderboardChannelId) {
            updateLeaderboard(client);
        }
    },
};
