> [!CAUTION]
> This is an older version of the host server, which doesn't support newer versions of https://github.com/almafa64/minecraft-mod-syncer.

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
Lists all mod names in branch in JSON list.

#### ?v=2
```json
[
	{
		"name": "create-6.0.0.jar", // name of mod
		"mod_date": 1756923801532,  // unix epoch timestamp in milliseconds
		"size": 10000,              // size in bytes
		"is_optional": false        // always false
	},
	...
]
```

#### ?v=3
```json
{
	"zip": {
		"name": "forge-1.20.1", // name is same as branch_name
		"size": 100000,         // size in bytes
		"present": true         // true if zip exists
	},
	"mods": [
		{
			"name": "my-mod-1.0.0.jar", // name of mod
			"mod_date": 1756923801532,  // file modified date in milliseconds unix epoch timestamp
			"size": 10000,              // size in bytes
			"is_optional": false        // always false
		},
		...
	]
}
```