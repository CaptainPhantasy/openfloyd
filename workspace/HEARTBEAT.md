# Automated Hooks & CRON

This file dictates when the agent wakes up autonomously without user prompting.
Syntax follows standard Unix CRON formatting.

---

# Daily Briefing

**Schedule:** 0 8 * * 1-5 (Every weekday at 8:00 AM)

**Action:**
1. Read my calendar for the day.
2. Scrape the top 5 articles from Hacker News and summarize them.
3. Check the weather API for my local area.
4. Compile this into a single WebChat message and send it to me.

---

# System Cleanup

**Schedule:** 0 0 * * 0 (Every Sunday at midnight)

**Action:**
1. Review the /logs directory.
2. Compress logs older than 7 days into a .zip archive.
3. Delete the raw .log files to save space.
