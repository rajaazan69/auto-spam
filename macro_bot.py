import discord
import asyncio
import re
import shlex
import os
from dotenv import load_dotenv

print("Script started")

# Load .env
load_dotenv()
TOKENS = [os.getenv("TOKEN1"), os.getenv("TOKEN2")]
OWNER_ID = int(os.getenv("OWNER_ID"))

intents = discord.Intents.default()
intents.message_content = True

clients = []


def parse_interval(text):
    match = re.fullmatch(r"(\d*\.?\d+)([smhd])", text.lower())
    if not match:
        return None
    value, unit = match.groups()
    value = float(value)
    multiplier = {"s": 1, "m": 60, "h": 3600, "d": 86400}
    return value * multiplier[unit]


class MacroClient(discord.Client):
    def __init__(self, token, index):
        super().__init__(intents=intents)
        self.token = token
        self.index = index  # 1 for TOKEN1, 2 for TOKEN2
        self.spam_tasks = {}  # channel_id: asyncio.Task
        self.spam_meta = {}   # channel_id: (item, interval_raw)

    async def on_ready(self):
        print(f"✅ Logged in as {self.user} (Bot {self.index})")

    async def spam_loop(self, channel, item, interval):
        try:
            while True:
                await channel.send(item)
                await asyncio.sleep(interval)
        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"Error in spam loop: {e}")

    async def on_message(self, message):
        if message.author.id != OWNER_ID:
            return

        content = message.content.strip()
        channel_id = message.channel.id

        try:
            parts = shlex.split(content)
        except ValueError:
            await message.channel.send("❌ Invalid command format.")
            return

        if not parts:
            return

        command = parts[0].lower()

        # Commands are specific to bot index (e.g. !macro1 for Bot1, !macro2 for Bot2)
        prefix = f"!macro{self.index}"
        stop_cmd = f"!stop{self.index}"
        stopall_cmd = f"!stopall{self.index}"
        status_cmd = f"!status{self.index}"

        if command == prefix:
            if len(parts) < 3:
                await message.channel.send(f"❌ Usage: `{prefix} [item] [interval like 2s, 1.5m, 0.5h]`")
                return

            item = parts[1]
            interval_raw = parts[2]
            interval = parse_interval(interval_raw)
            if interval is None:
                await message.channel.send("❌ Invalid interval format. Use like `2s`, `1.5m`, `0.5h`, `1d`.")
                return

            if channel_id in self.spam_tasks:
                self.spam_tasks[channel_id].cancel()

            task = asyncio.create_task(self.spam_loop(message.channel, item, interval))
            self.spam_tasks[channel_id] = task
            self.spam_meta[channel_id] = (item, interval_raw)

            await message.channel.send(f"**✓ [Bot {self.index}] Macroing `{item}` every `{interval_raw}`**")

        elif command == stop_cmd:
            if channel_id in self.spam_tasks:
                self.spam_tasks[channel_id].cancel()
                del self.spam_tasks[channel_id]
                del self.spam_meta[channel_id]
                await message.channel.send(f"**🛑 [Bot {self.index}] Stopped macroing.**")
            else:
                await message.channel.send("⚠️ No active macro in this channel.")

        elif command == stopall_cmd:
            if not self.spam_tasks:
                await message.channel.send("📭 No active macros to stop.")
                return

            for task in self.spam_tasks.values():
                task.cancel()
            self.spam_tasks.clear()
            self.spam_meta.clear()
            await message.channel.send(f"**🛑 [Bot {self.index}] Stopped all macros.**")

        elif command == status_cmd:
            user = message.author
            if not self.spam_meta:
                try:
                    await user.send(f"📭 [Bot {self.index}] No active macros.")
                except:
                    pass
                return

            status_lines = [f"### Active Macros (Bot {self.index}):"]
            for cid, (item, interval_raw) in self.spam_meta.items():
                channel = self.get_channel(cid)
                if channel:
                    guild_name = channel.guild.name if channel.guild else "DM"
                    channel_name = f"#{channel.name}" if hasattr(channel, "name") else "DM"
                    status_lines.append(
                        f"- Server: {guild_name} | Channel: {channel_name}\n  → Macroing `{item}` every `{interval_raw}`"
                    )

            status_message = "\n".join(status_lines)
            try:
                await user.send(status_message)
            except:
                pass


# Run all clients
async def main():
    for idx, token in enumerate(TOKENS, start=1):
        if token:
            client = MacroClient(token, idx)
            clients.append(client)
            asyncio.create_task(client.start(token))

    await asyncio.Event().wait()  # keep alive


asyncio.run(main())
