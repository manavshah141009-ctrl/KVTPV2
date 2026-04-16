# IST-Synchronized 24/7 Radio - Quick Start Guide

## What Changed?

The radio now operates as a **true 24/7 broadcast** where all listeners worldwide stay perfectly synchronized based on **IST (Indian Standard Time)**. No matter what time zone you're in, if you join at the same IST moment as another listener, you hear the exact same song at the exact same position.

## For Users

- **Perfect sync:** Join the app anytime, you'll hear what everyone in India is hearing at that moment
- **Next song preview:** See what song comes next and when (in IST)
- **No buffering:** Automatic re-sync prevents your audio from drifting

## For Developers

### Adding a Song to the Playlist

The virtual playlist uses **cumulative durations** to calculate position. Make sure every song has an accurate duration in MongoDB:

```javascript
// In admin dashboard: Upload song
// Duration field MUST be accurate (in seconds)
// Example: 3:45 song = 225 seconds
```

### Understanding Position Calculation

```
Playlist: [Song A (120s), Song B (80s), Song C (150s)]
Total: 350 seconds

Current IST timestamp: 1713000000
Position in cycle: 1713000000 % 350 = 50 seconds
Result: Song A (0-120), so we're at 50 seconds into Song A
Next: Song B starts in 70 seconds
```

### Modify Song Timings

If a song duration is wrong, the entire virtual timeline shifts:

```javascript
// In MongoDB Shell
db.songs.findByIdAndUpdate(songId, { duration: 180 }) // Update to 3 minutes

// This triggers server-wide re-sync
// All connected clients get 'playlist-duration-changed' event
// AudioPlayer automatically fetches new position
```

### Debugging Sync Issues

```javascript
// In browser console while playing
fetch('/api/radio/position').then(r => r.json()).then(d => {
  console.log(`
    Song: ${d.currentTrack.title}
    Offset: ${d.offsetInSong}s
    Total cycle: ${d.totalPlaylistDuration}s
    Next song starts in: ${d.nextSongStartTime - d.currentISTTime}s
  `);
});
```

### Clock Skew Detection

Behind the scenes, AudioPlayer logs when it re-syncs:

```javascript
// In browser console Network tab
// Every 30 seconds you'll see a fetch to /api/radio/position
// If audioElement.currentTime differs by >2s from server offset,
// it auto-adjusts
```

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Empty playlist | Returns `isValid: false`, frontend shows "No content" |
| Admin deletes current song | All clients jump to next song seamlessly |
| Network latency | Server-authoritative position prevents drift |
| Browser offline | Playback continues locally, re-syncs when online |
| Song added mid-playback | All clients recalculate cycle, resync within 30s |

## Common Tasks

### I need to verify sync is working

1. Open 2 browser tabs on different computers
2. Load app at exact same IST time
3. Click play on both
4. Audio should be perfectly in-sync

### A song is playing at wrong position

1. Check MongoDB: Is duration accurate?
2. Restart backend: `npm run dev`
3. Clear browser cache: Ctrl+Shift+Delete
4. Hard refresh: Ctrl+Shift+R
5. Fetch position endpoint: `/api/radio/position` and check offset

### Listeners report sync drift after 1 hour

The system automatically re-syncs every 30 seconds, so drift should be minimal (<2s).

1. Check if song durations changed recently
2. Check if admin modified playlist while playing
3. Look for console errors in browser: F12 → Console
4. Test with fresh browser session

## Performance Notes

- **Position calculation:** O(n) where n = number of songs (typically <100)
- **Refresh interval:** Every 30 seconds (tunable via `RESYNC_INTERVAL`)
- **Re-sync threshold:** 2 seconds drift (tunable via `RESYNC_THRESHOLD`)

If you have 100 songs, each 5 minutes = 500 minutes = 8.3 hours total cycle
- Position endpoint will run in ~10ms
- Called every 30 seconds = negligible load

## Future Enhancements

1. **Caching:** Pre-calculate cumulative durations on playlist change
2. **Millisecond precision:** Use timestamps with milliseconds instead of seconds
3. **Offline support:** Cache position data for offline resumption
4. **Analytics:** Track sync drift patterns to detect issues
5. **Admin dashboard:** Show real-time listener sync statistics
