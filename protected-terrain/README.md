# Protected terrain command

`/solde-terrain` is received directly from Discord by an independent systemd service running as `uptep-codex`. The main bot ignores the command. There is no HTTP endpoint, Unix socket or local execution permission exposed to `uptep`.

Production code lives in `/opt/uptep-terrain`, owned by root. The service uses its own immutable copies of `src/terrain.js`, `src/terrain-evidence.js`, `src/api.js`, `src/domain.js` and the installed Node dependencies. Its selected environment values are in `/etc/uptep-terrain-service.env` (root, 0600), read by systemd. It checks the real Gateway interaction author, application and guild, rejects stale interactions and persists consumed IDs before processing. The existing terrain workflow still checks the owner and successfully defers the real Discord interaction before reading messages or invoking Codex.

The runner remains `/usr/local/libexec/uptep-terrain-codex`, but no sudo delegation from `uptep` is allowed. Only the service account/root can access the Codex credential directory. The CLI remains constrained to the existing read-only structured terrain analysis. `uptep-terrain.service` applies filesystem/process restrictions and runs without root privileges.

Root must explicitly deploy/review protected source updates. Editing the development bot or this repository does not update the protected runtime. Never import production service modules or dependencies from a directory writable by `uptep`, and never restore the old sudo rule.

The Discord application token is shared with the editable bot to preserve the existing slash command/application. A developer can therefore interfere with the Discord bot, change its commands/messages, or make the terrain command unavailable, but cannot submit a local Codex job or forge the protected service's Gateway author identity. Site/API data and Discord messages remain editable inputs, not authentication for Codex execution. Full Discord availability and identity separation would require a separate Discord application/token.

Verify: `systemctl status uptep-terrain`, `journalctl -u uptep-terrain`, and `sudo -l -U uptep`. Tests must not emit real Discord messages or launch a billable model job. Use the command normally from the authorized Discord account to check a real analysis.

## Future access for other Discord users

The current implementation permits only NoobEnCDI. There is no configurable multi-user list yet. `ADMIN_DISCORD_IDS` does not grant Codex execution. A future extension must apply a root-managed allowlist consistently to the protected Gateway guard, the terrain workflow and the terrain API's actor checks. No identity supplied by the editable bot may replace the identity received directly from Discord. Keep the same sudo/filesystem isolation and add tests for each allowed and denied user before deploying that extension.
