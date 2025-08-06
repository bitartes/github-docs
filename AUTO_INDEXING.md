# Auto-Indexing Configuration

The GitHub Documentation MCP now supports automatic indexing of repositories to keep documentation up-to-date without manual intervention.

## Environment Variables

Add these to your `.env` file to configure auto-indexing:

```bash
# Organization to auto-index (default: bitartes)
AUTO_INDEX_ORG=bitartes

# Auto-index interval in milliseconds (default: 3600000 = 1 hour)
# Set to 0 to disable periodic indexing
AUTO_INDEX_INTERVAL=3600000

# Enable auto-indexing on server startup (default: true)
# Set to 'false' to disable startup indexing
AUTO_INDEX_ON_STARTUP=true
```

## How It Works

### Startup Indexing
- When the server starts, it automatically scans all repositories in the specified organization
- Only repositories with `/docs` folders are indexed
- Existing indexed repositories are checked for updates and re-indexed only if needed
- Indexing runs in the background without blocking server startup

### Periodic Updates
- The server checks for documentation updates at the specified interval
- Only repositories that have been updated since last indexing are re-processed
- This ensures your team always has access to the latest documentation

### Smart Indexing
- Skips repositories without documentation folders
- Compares last update timestamps to avoid unnecessary re-indexing
- Handles errors gracefully - one repository failure doesn't stop the entire process
- Provides detailed logging for monitoring and debugging

## Benefits for Team Usage

1. **Always Up-to-Date**: Documentation is automatically indexed when repositories are updated
2. **Zero Maintenance**: No need for team members to manually index repositories
3. **Efficient**: Only processes changed documentation, saving API calls and processing time
4. **Reliable**: Continues working even if individual repositories have issues

## Monitoring

The server logs all auto-indexing activities to stderr:
- When indexing starts and completes
- Which repositories are being processed
- Repositories that are skipped (no docs or up-to-date)
- Any errors encountered during indexing

## Customization

You can customize the behavior by:
- Changing `AUTO_INDEX_ORG` to index a different organization
- Adjusting `AUTO_INDEX_INTERVAL` for more or less frequent updates
- Setting `AUTO_INDEX_ON_STARTUP=false` if you prefer manual control
- Setting `AUTO_INDEX_INTERVAL=0` to disable periodic updates entirely

## Manual Override

Even with auto-indexing enabled, team members can still manually index specific repositories using the `index_repo_docs` tool if needed.