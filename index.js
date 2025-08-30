
const fs = require('node:fs');
const path = require('node:path');
const { Client, Collection, GatewayIntentBits, Partials, Events, EmbedBuilder } = require('discord.js');

const { 
    token, 
    prefix, 
    roles, 
    mmTiers, 
    leaderboardChannelId: lbcIdFromConfig, 
    newAccountAgeDays, 
   
} = require('./config.json'); 
const { loadDB, saveDB } = require('./utils/db');
const { updateLeaderboard } = require('./utils/leaderboardManager');
const { sendServerModLog } = require('./utils/logger'); 


const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers, 
        GatewayIntentBits.MessageContent, 
        GatewayIntentBits.GuildPresences, 
        GatewayIntentBits.GuildBans, 
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User, Partials.GuildMember],
});

client.db = loadDB(); 
client.prefix = prefix; 


client.commands = new Collection();
const slashFoldersPath = path.join(__dirname, 'commands'); 
if (fs.existsSync(slashFoldersPath)) {
    const slashCommandFolders = fs.readdirSync(slashFoldersPath);
    for (const folder of slashCommandFolders) { 
        const commandsPath = path.join(slashFoldersPath, folder);
        if (fs.statSync(commandsPath).isDirectory()) {
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                try { const command = require(filePath); if ('data' in command && 'execute' in command) { client.commands.set(command.data.name, command); console.log(`[SlashCmd Load] Loaded: ${command.data.name} from ${folder}/${file}`); } else { console.log(`[WARNING] Slash command ${filePath} missing "data" or "execute".`); } } catch (error) { console.error(`[ERROR] Failed to load slash command ${filePath}:`, error); }
            }
        }
    }
} else { console.log("[INFO] 'commands' directory for slash commands not found."); }

const eventsPath = path.join(__dirname, 'events');
if (fs.existsSync(eventsPath)) {
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    for (const file of eventFiles) { 
        const filePath = path.join(eventsPath, file);
        try { const event = require(filePath); if (event.once) { client.once(event.name, (...args) => event.execute(...args, client)); } else { client.on(event.name, (...args) => event.execute(...args, client)); } console.log(`[Event Load] Loaded: ${event.name}`); } catch (error) { console.error(`[ERROR] Failed to load event ${filePath}:`, error); }
    }
} else { console.error("[CRITICAL] 'events' directory not found."); }

client.prefixCommands = new Collection();
const prefixFoldersPath = path.join(__dirname, 'prefixCommands');
if (fs.existsSync(prefixFoldersPath)) {
    const prefixCommandFolders = fs.readdirSync(prefixFoldersPath);
    for (const folder of prefixCommandFolders) { 
        const commandsPath = path.join(prefixFoldersPath, folder);
        if (fs.statSync(commandsPath).isDirectory()) {
            const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
            for (const file of commandFiles) {
                const filePath = path.join(commandsPath, file);
                try { const command = require(filePath); if ('name' in command && 'execute' in command) { client.prefixCommands.set(command.name, command); console.log(`[PrefixCmd Load] Loaded: ${command.name} from ${folder}/${file}`); if (command.aliases && Array.isArray(command.aliases)) { command.aliases.forEach(alias => client.prefixCommands.set(alias, command)); } } else { console.log(`[WARNING] Prefix command ${filePath} missing "name" or "execute".`); } } catch (error) { console.error(`[ERROR] Failed to load prefix command ${filePath}:`, error); }
            }
        }
    }
} else { console.log("[INFO] 'prefixCommands' directory not found."); }




function getRoleMentionsForReminder(guild, tierKey) {
    const tier = mmTiers[tierKey]; 
    if (!tier || !tier.pingRoles) return '';
    return tier.pingRoles.map(roleNameKey => {
        const roleId = roles[roleNameKey]; 
        return roleId ? `<@&${roleId}>` : '';
    }).filter(Boolean).join(' ');
}


async function checkActiveTicketReminders(currentClient) {
    console.log('[TicketReminder] Running check for MM response reminders...');
    const now = Date.now();
    const thirtyMinutesMs = 30 * 300 * 1000;
    let dbChanged = false;
    const activeTickets = currentClient.db.activeTickets || {};

    for (const threadId in activeTickets) {
        const ticketData = activeTickets[threadId];
        if (!ticketData.reminderSent && (now - ticketData.lastMMResponseAt > thirtyMinutesMs)) {
            try {
                const guild = await currentClient.guilds.fetch(ticketData.guildId);
                if (!guild) {
                    console.warn(`[TicketReminder] Guild ${ticketData.guildId} not found for ticket ${threadId}. Removing from active list.`);
                    delete activeTickets[threadId];
                    dbChanged = true;
                    continue;
                }
                const threadChannel = await guild.channels.fetch(threadId).catch(() => null);

                if (threadChannel && threadChannel.isThread() && !threadChannel.archived && !threadChannel.locked) {
                    const roleMentionsString = getRoleMentionsForReminder(guild, ticketData.tierKey); 
                    
                    if (roleMentionsString) {
                        const reminderEmbed = new EmbedBuilder()
                            .setColor(0xFFA500) 
                            .setTitle('🕒 Middleman Response Reminder')
                            .setDescription(`This ticket has been awaiting a middleman response for over 3 hours.\n\nPinging available Middlemen: ${roleMentionsString}`)
                            .setTimestamp();
                        await threadChannel.send({ content: roleMentionsString, embeds: [reminderEmbed] }); 
                        ticketData.reminderSent = true;
                        dbChanged = true;
                        console.log(`[TicketReminder] Sent reminder ping to ticket ${threadId}.`);
                    } else {
                        console.warn(`[TicketReminder] No roles to ping for ticket ${threadId} with tierKey ${ticketData.tierKey} or initialPingRoleKeys.`);
                        ticketData.reminderSent = true; 
                        dbChanged = true;
                    }
                } else if (!threadChannel || threadChannel.archived || threadChannel.locked) {
                    console.log(`[TicketReminder] Ticket ${threadId} is closed, archived, or no longer exists. Removing from active list.`);
                    delete activeTickets[threadId];
                    dbChanged = true;
                }
            } catch (error) {
                console.error(`[TicketReminder] Error processing ticket ${threadId}:`, error.message);
                if (error.code === 10003 || error.code === 50001) { 
                    console.warn(`[TicketReminder] Thread ${threadId} not found or inaccessible. Removing from active list.`);
                    delete activeTickets[threadId];
                    dbChanged = true;
                }
            }
        }
    }

    if (dbChanged) {
        currentClient.db.activeTickets = activeTickets;
        saveDB(currentClient.db);
        console.log('[TicketReminder] Updated active tickets in DB after reminder check.');
    }
}



async function checkNewAccountRoleRemovals(currentClient) {
    console.log('[NewAccountCheck] Running check for new account role removals...');
    const now = Date.now(); 
    let dbChanged = false; 
    const trackedUsers = currentClient.db.newlyJoinedTrackedUsers || {};
   
    const localNewAccountAgeDays = newAccountAgeDays || 7; 
    
    const newAccountRoleIdFromConfig = roles.newAccountRoleId; 

    for (const key in trackedUsers) {
        const [guildIdFromKey, userId] = key.split('_'); 
        const userData = trackedUsers[key];
        if (now >= userData.removeRoleAtTimestamp) {
            try {
                const guild = await currentClient.guilds.fetch(userData.guildId || guildIdFromKey);
                const member = await guild.members.fetch(userId).catch(() => null);
                const roleToRemoveId = userData.roleId || newAccountRoleIdFromConfig; 
                const roleToRemove = guild.roles.cache.get(roleToRemoveId);
                if (member && roleToRemove && member.roles.cache.has(roleToRemove.id)) {
                    await member.roles.remove(roleToRemove, 'Account age threshold passed.');
                    console.log(`[NewAccountCheck] Removed "${roleToRemove.name}" from ${member.user.tag} (${userId}) in guild ${guild.name}.`);
                    sendServerModLog(currentClient, '👤 New Account Role Removed', `Role **${roleToRemove.name}** (<@&${roleToRemove.id}>) automatically removed from ${member.user.tag} (<@${member.id}>).`, '#E67E22', currentClient.user, member.user, null, `Account now older than ${localNewAccountAgeDays} days.`);
                    delete trackedUsers[key]; dbChanged = true;
                } else if (!member) { console.log(`[NewAccountCheck] User ${userId} not found in guild ${userData.guildId || guildIdFromKey}. Removing from tracking.`); delete trackedUsers[key]; dbChanged = true;
                } else if (!roleToRemove) { console.warn(`[NewAccountCheck] Role ${roleToRemoveId} not found in guild ${userData.guildId || guildIdFromKey}. Removing from tracking.`); delete trackedUsers[key]; dbChanged = true;
                } else if (member && roleToRemove && !member.roles.cache.has(roleToRemove.id)) { console.log(`[NewAccountCheck] User ${userId} no longer has role ${roleToRemove.name}. Removing.`); delete trackedUsers[key]; dbChanged = true; }
            } catch (error) { console.error(`[NewAccountCheck] Error processing user ${userId} in guild ${userData.guildId || guildIdFromKey}:`, error.message); if (error.code === 10004 || error.message.includes('Unknown Guild')) { console.warn(`[NewAccountCheck] Guild ${userData.guildId || guildIdFromKey} not found. Removing user ${userId}.`); delete trackedUsers[key]; dbChanged = true; } }
        }
    }
    if (dbChanged) { currentClient.db.newlyJoinedTrackedUsers = trackedUsers; saveDB(currentClient.db); console.log('[NewAccountCheck] Updated tracked users in DB.'); }
}




client.once(Events.ClientReady, async readyClient => {
    console.log(`Ready! Logged in as ${readyClient.user.tag}`);
    readyClient.user.setActivity('for MM Requests', { type: 'WATCHING' });

    
    if (lbcIdFromConfig) {
        console.log(`[Leaderboard] Initializing leaderboard in channel ID: ${lbcIdFromConfig}`);
        await updateLeaderboard(readyClient); 
        const updateInterval = 30 * 60 * 1000; 
        setInterval(() => { 
            
            if (lbcIdFromConfig) { 
                console.log(`[Interval] Triggering leaderboard update for channel ID: ${lbcIdFromConfig}...`);
                updateLeaderboard(readyClient); 
            } else {
                console.log('[Interval] Leaderboard update skipped: Channel ID not configured in config.json.');
            }
        }, updateInterval);
        console.log(`[Leaderboard] Auto-update interval set.`);
    } else { console.log('[Leaderboard] Auto-update skipped: leaderboardChannelId not configured in config.json.'); }

    
    const newAccountCheckInterval = 60 * 60 * 1000;
    checkNewAccountRoleRemovals(readyClient); 
    setInterval(() => {
        checkNewAccountRoleRemovals(readyClient);
    }, newAccountCheckInterval);
    console.log(`[NewAccountRole] Role removal check interval set.`);

   
    const ticketReminderInterval = 5 * 60 * 1000; 
    checkActiveTicketReminders(readyClient); 
    setInterval(() => {
        checkActiveTicketReminders(readyClient);
    }, ticketReminderInterval);
    console.log(`[TicketReminder] MM response reminder check interval set for every ${ticketReminderInterval / 60000} minutes.`);

});

client.login(token);

process.on('SIGINT', () => { console.log('Bot is shutting down (SIGINT)...'); saveDB(client.db); client.destroy(); process.exit(0); });
process.on('SIGTERM', () => { console.log('Bot is shutting down (SIGTERM)...'); saveDB(client.db); client.destroy(); process.exit(0); });
