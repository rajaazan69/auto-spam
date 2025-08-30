const { PermissionsBitField, ChannelType, EmbedBuilder, CategoryChannel } = require('discord.js');
const { loadDB, saveDB } = require('../../utils/db');

let loopInterval = null;

module.exports = {
    name: 'loopchannel',
    description: 'ADMIN ONLY: Starts or stops a loop creating/deleting a channel with a message.',
    usage: 'start <category ID> <channel name> <message content> <interval in minutes> | stop',
    category: 'admin',

    async execute(message, args, client) {
        if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return message.reply({ content: 'You need Administrator permissions to use this command.' });
        }

        const action = args[0]?.toLowerCase();

        if (!action || (action !== 'start' && action !== 'stop')) {
            return message.reply(`Invalid usage. Use \`${client.prefix || '!'}${this.name} ${this.usage}\``);
        }

        if (action === 'stop') {
            if (loopInterval) {
                clearInterval(loopInterval);
                loopInterval = null;
                console.log('[LoopChannel] Interval cleared');
            }

            const db = loadDB();
            const task = db.loopingChannelTask;

            if (!task) {
                return message.reply('There is no active channel loop running.');
            }

            
            if (task.currentChannelId) {
                try {
                    const oldChannel = await message.guild.channels.fetch(task.currentChannelId).catch(() => null);
                    if (oldChannel) {
                        await oldChannel.delete('Looping channel stopped.');
                        console.log(`[LoopChannel] Deleted channel ${oldChannel.name} on stop`);
                    }
                } catch (err) {
                    console.error('[LoopChannel] Failed to delete channel on stop:', err);
                }
            }

            
            db.loopingChannelTask = null;
            saveDB(db);

            return message.reply('✅ Loop stopped and channel removed.');
        }

       
        const categoryId = args[1];
        const channelName = args[2];
        const intervalMinutes = parseInt(args[args.length - 1]) || 120; 
        
        
        let messageContent;
        if (!isNaN(parseInt(args[args.length - 1]))) {
            
            messageContent = args.slice(3, -1).join(' ');
        } else {
            
            messageContent = args.slice(3).join(' ');
        }

        if (!categoryId || !channelName || !messageContent) {
            return message.reply(`Invalid usage. Use \`${client.prefix || '!'}${this.name} start <category ID> <channel name> <message content> [interval in minutes]\`\n\nExample: \`${client.prefix || '!'}${this.name} start 123456789 announcements Welcome to our server! 60\``);
        }

        if (!/^\d{17,19}$/.test(categoryId)) {
            return message.reply('❌ Invalid category ID. Make sure it\'s a valid Discord channel ID.');
        }

        if (intervalMinutes < 1 || intervalMinutes > 10080) { 
            return message.reply('❌ Interval must be between 1 minute and 10080 minutes (1 week).');
        }

        const category = await message.guild.channels.fetch(categoryId).catch(() => null);
        if (!category || category.type !== ChannelType.GuildCategory) {
            return message.reply('❌ Category not found or invalid. Make sure the category ID is correct and the bot has access to it.');
        }

        const db = loadDB();
        if (db.loopingChannelTask) {
            return message.reply('❌ A loop is already running. Use `loopchannel stop` first.');
        }

        const cleanChannelName = channelName.toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').slice(0, 90);

        
        db.loopingChannelTask = {
            guildId: message.guild.id,
            categoryId,
            channelName: cleanChannelName,
            messageContent,
            currentChannelId: null,
            intervalMinutes,
            startedBy: message.author.id,
            startedAt: Date.now()
        };
        saveDB(db);

        const delay = intervalMinutes * 60 * 1000; 

        const loopFunction = async () => {
            try {
                console.log('[LoopChannel] Running loop function...');
                
                
                const currentDb = loadDB();
                const task = currentDb.loopingChannelTask;
                if (!task || task.guildId !== message.guild.id) {
                    console.log('[LoopChannel] Task no longer exists, stopping loop');
                    if (loopInterval) {
                        clearInterval(loopInterval);
                        loopInterval = null;
                    }
                    return;
                }

                const guild = client.guilds.cache.get(task.guildId);
                if (!guild) {
                    console.log('[LoopChannel] Guild not found, stopping loop');
                    if (loopInterval) {
                        clearInterval(loopInterval);
                        loopInterval = null;
                    }
                    return;
                }

                
                const category = await guild.channels.fetch(task.categoryId).catch(() => null);
                if (!category || category.type !== ChannelType.GuildCategory) {
                    console.log('[LoopChannel] Category no longer exists, stopping loop');
                    if (loopInterval) {
                        clearInterval(loopInterval);
                        loopInterval = null;
                    }
                    const db = loadDB();
                    db.loopingChannelTask = null;
                    saveDB(db);
                    return;
                }

                
                const prevChannelId = task.currentChannelId;
                if (prevChannelId) {
                    try {
                        const oldChannel = await guild.channels.fetch(prevChannelId).catch(() => null);
                        if (oldChannel) {
                            await oldChannel.delete('Deleting old looped channel.');
                            console.log(`[LoopChannel] Deleted old channel: ${oldChannel.name}`);
                        }
                    } catch (err) {
                        console.error('[LoopChannel] Failed to delete old channel:', err);
                    }
                }

              
                let newChannel;
                try {
                    console.log(`[LoopChannel] Creating new channel: ${task.channelName}`);
                    
                    newChannel = await guild.channels.create({
                        name: task.channelName,
                        type: ChannelType.GuildText,
                        parent: category.id,
                        permissionOverwrites: [
                            {
                                id: guild.id, 
                                deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions],
                                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory]
                            },
                            {
                                id: client.user.id, 
                                allow: [
                                    PermissionsBitField.Flags.SendMessages, 
                                    PermissionsBitField.Flags.ViewChannel,
                                    PermissionsBitField.Flags.ManageChannels,
                                    PermissionsBitField.Flags.EmbedLinks
                                ]
                            }
                        ],
                        reason: 'Looping channel creation'
                    });

                    console.log(`[LoopChannel] Created new channel: ${newChannel.name} (${newChannel.id})`);

                    
                    await newChannel.send(task.messageContent);
                    console.log(`[LoopChannel] Sent message to new channel`);

                    
                    const db = loadDB();
                    if (db.loopingChannelTask) {
                        db.loopingChannelTask.currentChannelId = newChannel.id;
                        saveDB(db);
                    }

                } catch (err) {
                    console.error('[LoopChannel] Failed to create/send in channel:', err);
                    if (newChannel) {
                        try {
                            await newChannel.delete('Failed to set up looped channel properly');
                        } catch (deleteErr) {
                            console.error('[LoopChannel] Failed to delete failed channel:', deleteErr);
                        }
                    }
                }
            } catch (error) {
                console.error('[LoopChannel] Error in loop function:', error);
            }
        };

        
        console.log('[LoopChannel] Starting loop with immediate execution');
        await loopFunction();

        
        loopInterval = setInterval(loopFunction, delay);
        console.log(`[LoopChannel] Interval set for every ${intervalMinutes} minutes`);

        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('Channel Loop Started')
            .addFields(
                { name: 'Channel Name', value: `\`${cleanChannelName}\``, inline: true },
                { name: 'Category', value: category.name, inline: true },
                { name: 'Interval', value: `${intervalMinutes} minutes`, inline: true },
                { name: 'Message', value: messageContent.length > 1024 ? messageContent.substring(0, 1021) + '...' : messageContent },
                { name: 'Started By', value: `<@${message.author.id}>`, inline: true },
                { name: 'Next Recreation', value: `<t:${Math.floor((Date.now() + delay) / 1000)}:R>`, inline: true }
            )
            .setTimestamp()
            .setFooter({ text: 'Use "loopchannel stop" to stop the loop' });

        return message.reply({ embeds: [embed] });
    }
};