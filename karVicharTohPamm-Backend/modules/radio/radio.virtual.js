/**
 * Radio Virtual Playlist Engine
 * Calculates which song is playing based on cumulative durations
 * Creates an infinite 24/7 continuous radio experience
 */

const Song = require('../../models/Song');

/**
 * Calculate total duration of entire playlist (in seconds)
 * @returns {Promise<number>} Total duration or 0 if no songs
 */
async function getPlaylistDuration() {
    try {
        const songs = await Song.find();
        if (songs.length === 0) return 0;

        const total = songs.reduce((sum, song) => {
            const duration = song.duration || 0;
            return sum + (duration > 0 ? duration : 0);
        }, 0);

        return Math.max(total, 1); // Minimum 1 second to avoid division by zero
    } catch (error) {
        console.error('Error calculating playlist duration:', error);
        return 0;
    }
}

/**
 * Get all songs in order with cumulative duration info
 * Returns: [{song}, {song with cumulativeDurationStart, cumulativeDurationEnd}, ...]
 * @returns {Promise<Array>} Songs array with cumulative duration info
 */
async function getSongsWithCumulativeDurations() {
    try {
        const songs = await Song.find().sort({ order: 1 });
        if (songs.length === 0) return [];

        let cumulative = 0;
        return songs.map(song => {
            const duration = song.duration > 0 ? song.duration : 0;
            const result = {
                ...song.toObject(),
                cumulativeDurationStart: cumulative,
                cumulativeDurationEnd: cumulative + duration
            };
            cumulative += duration;
            return result;
        });
    } catch (error) {
        console.error('Error getting songs with cumulative durations:', error);
        return [];
    }
}

/**
 * Get current position in the virtual playlist timeline
 * This function creates a "fake" timeline where songs repeat infinitely
 * All listeners worldwide see the same song at the same offset based on IST time
 *
 * @param {number} istTimestamp - Target IST timestamp (seconds)
 * @returns {Promise<Object>} Position object: {
 *   currentTrack: {id, title, url, duration, order},
 *   offsetInSong: number (seconds into current track),
 *   songStartTime: number (IST unix timestamp when this song started),
 *   currentSongIndex: number,
 *   nextTrack: {id, title, url, duration, order},
 *   nextSongStartTime: number,
 *   totalPlaylistDuration: number,
 *   isValid: boolean
 * }
 */
async function getPositionAtTimestamp(istTimestamp) {
    try {
        const songs = await getSongsWithCumulativeDurations();

        if (songs.length === 0) {
            return {
                currentTrack: null,
                offsetInSong: 0,
                songStartTime: null,
                currentSongIndex: -1,
                nextTrack: null,
                nextSongStartTime: null,
                totalPlaylistDuration: 0,
                isValid: false
            };
        }

        // Total duration of complete playlist cycle
        const totalDuration = songs[songs.length - 1].cumulativeDurationEnd;

        if (totalDuration === 0) {
            return {
                currentTrack: null,
                offsetInSong: 0,
                songStartTime: null,
                currentSongIndex: -1,
                nextTrack: null,
                nextSongStartTime: null,
                totalPlaylistDuration: 0,
                isValid: false
            };
        }

        // Find position within the current cycle using modulo
        const positionInCycle = istTimestamp % totalDuration;

        // Find which song contains this position
        let currentSongIndex = 0;
        let offsetInSong = 0;
        let songStartTime = 0;

        for (let i = 0; i < songs.length; i++) {
            if (positionInCycle >= songs[i].cumulativeDurationStart &&
                positionInCycle < songs[i].cumulativeDurationEnd) {
                currentSongIndex = i;
                offsetInSong = positionInCycle - songs[i].cumulativeDurationStart;
                // Calculate when this song started playing
                songStartTime = istTimestamp - offsetInSong;
                break;
            }
        }

        const currentTrack = {
            id: songs[currentSongIndex]._id ? songs[currentSongIndex]._id.toString() : null,
            title: songs[currentSongIndex].title,
            url: songs[currentSongIndex].url,
            duration: songs[currentSongIndex].duration,
            order: songs[currentSongIndex].order
        };

        // Find next song
        const nextSongIndex = (currentSongIndex + 1) % songs.length;
        const nextTrack = {
            id: songs[nextSongIndex]._id ? songs[nextSongIndex]._id.toString() : null,
            title: songs[nextSongIndex].title,
            url: songs[nextSongIndex].url,
            duration: songs[nextSongIndex].duration,
            order: songs[nextSongIndex].order
        };

        // Calculate when next song will start
        const nextSongStartTime = istTimestamp + (songs[currentSongIndex].duration - offsetInSong);

        return {
            currentTrack,
            offsetInSong: Math.floor(offsetInSong),
            songStartTime: Math.floor(songStartTime),
            currentSongIndex,
            nextTrack,
            nextSongStartTime: Math.floor(nextSongStartTime),
            totalPlaylistDuration: totalDuration,
            isValid: true
        };
    } catch (error) {
        console.error('Error getting position at timestamp:', error);
        return {
            currentTrack: null,
            offsetInSong: 0,
            songStartTime: null,
            currentSongIndex: -1,
            nextTrack: null,
            nextSongStartTime: null,
            totalPlaylistDuration: 0,
            isValid: false
        };
    }
}

/**
 * Get the timestamp when the next song will start
 * @param {number} istTimestamp - Current IST timestamp
 * @returns {Promise<number>} Timestamp when next song starts
 */
async function getNextSongTransition(istTimestamp) {
    const position = await getPositionAtTimestamp(istTimestamp);
    return position.nextSongStartTime || istTimestamp;
}

/**
 * Get all position calculation data for current time
 * Used by the frontend to stay perfectly in sync
 * @param {number} istTimestamp - Current IST timestamp (in seconds)
 * @returns {Promise<Object>} Complete position data
 */
async function getCurrentPosition(istTimestamp) {
    return await getPositionAtTimestamp(istTimestamp);
}

module.exports = {
    getPlaylistDuration,
    getSongsWithCumulativeDurations,
    getPositionAtTimestamp,
    getNextSongTransition,
    getCurrentPosition
};
