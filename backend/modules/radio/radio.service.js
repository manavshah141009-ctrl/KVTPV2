const Song = require('../../models/Song');
const radioVirtual = require('./radio.virtual');
const timezone = require('../../utils/timezone');

const MAX_QUEUE_SIZE = 100;

// State strictly maintains whether we are live or not
const state = {
    mode: 'music',
    currentSpeaker: null
};

// Broadcast callback — set by socket/index.js
let broadcastFn = null;

const setBroadcast = (fn) => {
    broadcastFn = fn;
};

// Helper: convert Mongoose doc to plain object with `id` string field
const toSongObj = (doc) => ({
    id: doc._id.toString(),
    title: doc.title,
    url: doc.url,
    duration: doc.duration,
    order: doc.order
});

const getStatusPayload = async () => {
    if (state.mode === 'speaker') {
        return {
            mode: state.mode,
            currentSpeaker: state.currentSpeaker,
            currentTrack: null,
            startTime: null,
            streamUrl: process.env.STREAM_URL
        };
    } else {
        const istTime = timezone.getCurrentISTTime();
        const pos = await radioVirtual.getCurrentPosition(istTime);
        return {
            mode: state.mode,
            currentSpeaker: null,
            currentTrack: pos.currentTrack,
            startTime: pos.songStartTime,
            streamUrl: process.env.STREAM_URL
        };
    }
};

const broadcast = async () => {
    if (broadcastFn) {
        broadcastFn('status-update', await getStatusPayload());
    }
};

const broadcastPlaylist = async () => {
    if (broadcastFn) {
        const list = await getPlaylist();
        broadcastFn('playlist-update', list);
    }
};

// --- State operations ---

const getStatus = async () => await getStatusPayload();

const goLive = async () => {
    state.mode = 'speaker';
    state.currentSpeaker = true;
    await broadcast();
    return await getStatusPayload();
};

const stopLive = async () => {
    state.mode = 'music';
    state.currentSpeaker = null;
    await broadcast();
    return await getStatusPayload();
};

const setSong = async (title, url, duration) => {
    // Fallback manual override for testing if needed
    throw new Error('Manual song overriding is disabled in continuous 24/7 radio mode. Use the playlist instead.');
};

// --- Playlist operations (persisted to MongoDB) ---

const addSongToPlaylist = async (title, url, duration) => {
    if (!title || typeof title !== 'string' || !title.trim()) {
        throw new Error('Song title is required');
    }
    if (!url || typeof url !== 'string' || !url.trim()) {
        throw new Error('Song url is required');
    }
    const count = await Song.countDocuments();
    if (count >= MAX_QUEUE_SIZE) {
        throw new Error('Playlist is full (max ' + MAX_QUEUE_SIZE + ')');
    }
    const song = await Song.create({
        title: title.trim(),
        url: url.trim(),
        duration: typeof duration === 'number' && duration > 0 ? duration : null,
        order: count
    });
    await broadcastPlaylist();
    await broadcast(); // New track might change virtual durations
    return toSongObj(song);
};

const removeSongFromPlaylist = async (id) => {
    if (!id || typeof id !== 'string') {
        throw new Error('Song id is required');
    }
    const song = await Song.findByIdAndDelete(id);
    if (!song) {
        throw new Error('Song not found in playlist');
    }

    await broadcastPlaylist();
    await broadcast(); // Broadcast new virtual state since durations changed
};

const bulkRemoveSongs = async (ids) => {
    if (!Array.isArray(ids) || ids.length === 0) {
        throw new Error('ids must be a non-empty array');
    }
    const result = await Song.deleteMany({ _id: { $in: ids } });
    await broadcastPlaylist();
    await broadcast(); // Broadcast new virtual state
    return result.deletedCount;
};

const shufflePlaylist = async () => {
    const songs = await Song.find().sort({ order: 1 });
    if (songs.length <= 1) return;

    const shuffledSongs = [...songs];
    for (let i = shuffledSongs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffledSongs[i], shuffledSongs[j]] = [shuffledSongs[j], shuffledSongs[i]];
    }

    const bulkOps = shuffledSongs.map((song, index) => ({
        updateOne: {
            filter: { _id: song._id },
            update: { $set: { order: index } },
        },
    }));

    await Song.bulkWrite(bulkOps);

    await broadcastPlaylist();
    await broadcast(); // Virtual state changes dramatically when reordered
};

const playSongFromPlaylist = async (id) => {
    throw new Error('Play Now is disabled in 24/7 Mode. Please rearrange the playlist to prepare upcoming songs.');
};

const getPlaylist = async () => {
    const songs = await Song.find().sort({ order: 1 });
    return songs.map((doc, index) => ({ ...toSongObj(doc), order: index }));
};

const getCurrent = async () => {
    const payload = await getStatusPayload();
    return {
        track: payload.currentTrack,
        startTime: payload.startTime
    };
};

const editSongInPlaylist = async (id, updates) => {
    if (!id || typeof id !== 'string') {
        throw new Error('Song id is required');
    }
    if (!updates || typeof updates !== 'object') {
        throw new Error('Updates object is required');
    }
    const song = await Song.findById(id);
    if (!song) {
        throw new Error('Song not found in playlist');
    }
    const { title, url, duration } = updates;
    let changed = false;
    if (title !== undefined) {
        if (typeof title !== 'string' || !title.trim()) {
            throw new Error('Song title must be a non-empty string');
        }
        song.title = title.trim();
        changed = true;
    }
    if (url !== undefined) {
        if (typeof url !== 'string' || !url.trim()) {
            throw new Error('Song url must be a non-empty string');
        }
        song.url = url.trim();
        changed = true;
    }
    if (duration !== undefined) {
        song.duration = typeof duration === 'number' && duration > 0 ? duration : null;
        changed = true;
    }
    if (!changed) {
        throw new Error('At least one field (title, url, duration) must be provided');
    }
    await song.save();
    await broadcastPlaylist();
    await broadcast();
    return toSongObj(song);
};

const reorderSongInPlaylist = async (id, direction) => {
    if (!id || typeof id !== 'string') {
        throw new Error('Song id is required');
    }
    if (direction !== 'up' && direction !== 'down') {
        throw new Error('Direction must be "up" or "down"');
    }
    const songs = await Song.find().sort({ order: 1 });
    const index = songs.findIndex(s => s._id.toString() === id);
    if (index === -1) {
        throw new Error('Song not found in playlist');
    }
    const swapIndex = direction === 'up' ? index - 1 : index + 1;
    if (swapIndex < 0 || swapIndex >= songs.length) {
        // Already at boundary — no-op
        await broadcastPlaylist();
        return getPlaylist();
    }
    // Swap order values
    const tmpOrder = songs[index].order;
    songs[index].order = songs[swapIndex].order;
    songs[swapIndex].order = tmpOrder;
    await songs[index].save();
    await songs[swapIndex].save();

    await broadcastPlaylist();
    await broadcast();
    return getPlaylist();
};

const moveSongToIndex = async (id, toIndex) => {
    if (!id || typeof id !== 'string') {
        throw new Error('Song id is required');
    }
    if (!Number.isInteger(toIndex) || toIndex < 0) {
        throw new Error('toIndex must be a non-negative integer');
    }

    const songs = await Song.find().sort({ order: 1 });
    const fromIndex = songs.findIndex(s => s._id.toString() === id);
    if (fromIndex === -1) {
        throw new Error('Song not found in playlist');
    }

    // Clamp toIndex to valid range
    const clampedTo = Math.min(toIndex, songs.length - 1);
    if (fromIndex === clampedTo) {
        await broadcastPlaylist();
        return getPlaylist();
    }

    // Remove song from array and reinsert at target position
    const [movedSong] = songs.splice(fromIndex, 1);
    songs.splice(clampedTo, 0, movedSong);

    // Reassign order values
    const bulkOps = songs.map((song, idx) => ({
        updateOne: {
            filter: { _id: song._id },
            update: { $set: { order: idx } },
        },
    }));
    await Song.bulkWrite(bulkOps);

    await broadcastPlaylist();
    await broadcast();
    return getPlaylist();
};

module.exports = {
    setBroadcast,
    getStatus,
    goLive,
    stopLive,
    setSong,
    addSongToPlaylist,
    removeSongFromPlaylist,
    bulkRemoveSongs,
    shufflePlaylist,
    playSongFromPlaylist,
    getPlaylist,
    getCurrent,
    editSongInPlaylist,
    reorderSongInPlaylist,
    moveSongToIndex
};
