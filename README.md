> [!WARNING]
> This is currently very in WIP phase. There is possibility for zips to get out of sync, data races, and other unknown things lurk here. But modifying mods at runtime rarely shouldn't cause any trouble.

# Almafa64's Minecraft Mod Hoster
(name is subject to change)

This web server hosts the mods and API for my https://github.com/almafa64/minecraft-mod-syncer. Download page can be used in itself.

## Pages
### /minecraft/mods
This page gives links for zip download.

### /minecraft/mods/&lt;branch_name&gt;
Downloads branch's zip.

### /minecraft/mods/&lt;branch_name&gt;/&lt;mod_name&gt;
Downloads a mod from branch.

## API
### /minecraft/api/mods
Lists all avaliable branch names in JSON list.

### /minecraft/api/mods/&lt;branch_name&gt;
version set by `v` query, by default it's omitted.<br>
**Returns 404 if branch isn't found.**

#### Default
```json
{
	"zip": {
		"mod_date": 1756923801532, // zip modified date in milliseconds (unix epoch timestamp)
		"size": 100000,            // size in bytes
		"is_present": true         // true if zip exists
	},
	"mods": [
		{
			"name": "my-mod-1.0.0.jar", // name of mod
			"mod_date": 1756923801000,  // file modified date in milliseconds (unix epoch timestamp), millisecond part always == 0 for zip compatibility
			"size": 10000,              // size in bytes
			"is_optional": false        // true if mod isn't required for user
		},
		...
	]
}
```