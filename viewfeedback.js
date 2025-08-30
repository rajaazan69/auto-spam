
const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const { loadDB } = require('../../utils/db'); 

module.exports = {
    name: 'viewfeedback',
    description: 'ADMIN ONLY: Views collected feedback for tickets or a specific middleman.',
    usage: '<@MiddlemanUserOrID | TicketID>',
    aliases: ['vf', 'checkfeedback'],
    category: 'admin',
    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: 'You must be an Administrator to view feedback.', ephemeral: true });
        }

        if (args.length < 1) {
            return message.reply(`Please specify a Middleman (mention or ID) or a Ticket ID.\nUsage: \`${client.prefix}${this.name} ${this.usage}\``);
        }

        const query = args[0];
        client.db.ticketFeedback = client.db.ticketFeedback || {}; 
        const allFeedbackData = client.db.ticketFeedback;

        let targetUser = null;
        let targetTicketId = null;
        let searchMode = '';

        if (message.mentions.users.first()) {
            targetUser = message.mentions.users.first();
            searchMode = 'middleman';
        } else if (/^\d{17,19}$/.test(query)) { 
            
            try {
                targetUser = await client.users.fetch(query);
                searchMode = 'middleman';
            } catch (e) {
                
                targetTicketId = query;
                searchMode = 'ticket';
            }
        } else {
            
            
            targetTicketId = query; 
            searchMode = 'ticket'; 
             
        }
        
        const feedbackEmbed = new EmbedBuilder()
            .setColor('#000000')
            .setTimestamp()
            .setFooter({ text: `Feedback requested by ${message.author.tag}`});

        let foundFeedback = [];

        if (searchMode === 'middleman' && targetUser) {
            feedbackEmbed.setTitle(`Feedback for Middleman: ${targetUser.tag}`);
            for (const ticketId in allFeedbackData) {
                allFeedbackData[ticketId].forEach(feedback => {
                    if (feedback.middlemanId === targetUser.id) {
                        foundFeedback.push({ ...feedback, ticketId });
                    }
                });
            }
        } else if (searchMode === 'ticket' && targetTicketId) {
            feedbackEmbed.setTitle(`Feedback for Ticket ID: ${targetTicketId}`);
            if (allFeedbackData[targetTicketId]) {
                foundFeedback = allFeedbackData[targetTicketId].map(fb => ({ ...fb, ticketId: targetTicketId }));
            }
        } else {
            return message.reply("Could not determine whether to search by Middleman or Ticket ID. Please provide a valid mention, User ID, or Ticket ID.");
        }

        if (foundFeedback.length === 0) {
            feedbackEmbed.setDescription('No feedback found for this query.');
        } else {
           
            foundFeedback.sort((a, b) => b.timestamp - a.timestamp);
            let description = `Displaying up to 10 most recent feedback entries:\n\n`;
            
            for (let i = 0; i < Math.min(foundFeedback.length, 10); i++) {
                const fb = foundFeedback[i];
                const submitter = fb.submitterTag ? `${fb.submitterTag} (<@${fb.submitterId}>)` : `<@${fb.submitterId}>`;
                const mmTag = fb.middlemanId && fb.middlemanId !== 'none' ? `<@${fb.middlemanId}>` : 'N/A (No specific MM)';
                
                description += `**Entry #${i + 1} (Ticket: \`${fb.ticketId}\`)**\n`;
                description += `> **Submitted by:** ${submitter} on <t:${Math.floor(fb.timestamp / 1000)}:f>\n`;
                description += `> **Middleman:** ${mmTag}\n`;
                description += `> **Rating:** ${fb.rating || 'N/A'}\n`;
                if (fb.comments && fb.comments !== 'N/A') {
                    description += `> **Comments:** ${fb.comments}\n`;
                }
                if (fb.improvementSuggestions && fb.improvementSuggestions !== 'N/A') {
                    description += `> **Improvement Suggestions:** ${fb.improvementSuggestions}\n`;
                }
                description += `------------------------------\n`;
                if (description.length > 3800) { 
                    description += "\n*Further entries truncated to fit limit.*";
                    break;
                }
            }
            feedbackEmbed.setDescription(description);
        }

        await message.channel.send({ embeds: [feedbackEmbed] });
    },
};
