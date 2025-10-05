> [!WARNING]
> This is currently in WIP phase. There is possibility for zips to get out of sync, data races, and other unknown things lurk here. But modifying mods at runtime rarely should cause any trouble.

# Almafa64's Minecraft Mod Hoster
(name is subject to change)

This web server hosts the mods and API for [my mod syncer program](https://github.com/almafa64/minecraft-mod-syncer). The download page can be used in itself without the syncer.

## Usage
configs can be found in `config.ts`

run `deno run main` to start server

mods can be placed (before starting server, or even while it runs) into
- `branches/<branch name>/client_only`: these mods don't need to be copied to the minecraft server
- `branches/<branch name>/client_only/optional`: these mods don't need to be copied to the minecraft server and users can choose if they want them
- `branches/<branch name>/server_only`: these mods don't need to be sent to users
- `branches/<branch name>/both`: these mods must be present in minecraft server and at clients
- `branches/<branch name>/both/optional`: these must be present in minecraft server, but users can choose if they want them too
> [!NOTE]
> This program won't copy any mods into the minecraft server, but making scripts for it is easy. Here is what I use (place it in webserver's folder)
> ```sh
> #!/bin/sh
>
> # Minecraft server and branch must be named the same for this script to work 
> NAME="<server's name>"
> # Example: server is at /srv/minecraft-servers/my-server, then this should be /srv/minecraft-servers
> SERVERS_PATH="<server's parent path>"
> 
> CURRENT_DIR="$(cd "$(dirname "$0")" && pwd)"
> DIR="$SERVERS_PATH/$NAME"
> 
> rm $DIR/mods/*
> cp $CURRENT_DIR/branches/$NAME/server_only/*.jar $DIR/mods/
> cp $CURRENT_DIR/branches/$NAME/both/*.jar $DIR/mods/
> cp $CURRENT_DIR/branches/$NAME/both/optional/*.jar $DIR/mods/
> # chown $DIR/mods/* if needed 
> ```

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
