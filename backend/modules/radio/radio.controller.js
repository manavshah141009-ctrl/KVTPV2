const radioService = require('./radio.service');
const radioVirtual = require('./radio.virtual');
const { getCurrentISTTime } = require('../../utils/timezone');

// --- Public controllers ---

exports.getStatus = async (req, res) => {
    try {
        const status = await radioService.getStatus();
        res.json(status);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

/**
 * Get current position in the IST-synchronized virtual playlist
 * This endpoint returns the exact position all listeners should be at
 */
exports.getPosition = async (req, res) => {
    try {
        const istTime = getCurrentISTTime();
        const position = await radioVirtual.getCurrentPosition(istTime);

        res.json({
            currentISTTime: istTime,
            ...position
        });
    } catch (error) {
        console.error('Error getting position:', error);
        res.status(500).json({
            message: 'Failed to get position',
            error: error.message
        });
    }
};

exports.getPlaylist = async (req, res) => {
    try {
        const list = await radioService.getPlaylist();
        res.json(list);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.getCurrent = async (req, res) => {
    try {
        const current = await radioService.getCurrent();
        res.json(current);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// --- Admin: Speaker (live toggle) ---

exports.goLive = async (req, res) => {
    try {
        const result = await radioService.goLive();
        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.stopLive = async (req, res) => {
    try {
        const result = await radioService.stopLive();
        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// --- Admin: Song controls ---

exports.setSong = async (req, res) => {
    try {
        const { title, url, duration } = req.body;
        const result = await radioService.setSong(title, url, duration);
        res.json(result);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// --- Admin: Playlist management ---

exports.addSongToPlaylist = async (req, res) => {
    try {
        const { title, url, duration } = req.body;
        const song = await radioService.addSongToPlaylist(title, url, duration);
        res.status(201).json(song);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.removeSongFromPlaylist = async (req, res) => {
    try {
        await radioService.removeSongFromPlaylist(req.params.id);
        res.json({ message: 'Song removed' });
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
};

exports.playSongFromPlaylist = async (req, res) => {
    try {
        const { id } = req.body;
        const result = await radioService.playSongFromPlaylist(id);
        res.json(result);
    } catch (error) {
        res.status(404).json({ message: error.message });
    }
};

exports.editSong = async (req, res) => {
    try {
        const { title, url, duration } = req.body;
        const result = await radioService.editSongInPlaylist(req.params.id, { title, url, duration });
        res.json(result);
    } catch (error) {
        const status = error.message.includes('not found') ? 404 : 400;
        res.status(status).json({ message: error.message });
    }
};

exports.reorderSong = async (req, res) => {
    try {
        const { id, direction } = req.body;
        const result = await radioService.reorderSongInPlaylist(id, direction);
        res.json(result);
    } catch (error) {
        const status = error.message.includes('not found') ? 404 : 400;
        res.status(status).json({ message: error.message });
    }
};

exports.moveSong = async (req, res) => {
    try {
        const { id, toIndex } = req.body;
        const result = await radioService.moveSongToIndex(id, toIndex);
        res.json(result);
    } catch (error) {
        const status = error.message.includes('not found') ? 404 : 400;
        res.status(status).json({ message: error.message });
    }
};

exports.bulkRemoveSongs = async (req, res) => {
    try {
        const { ids } = req.body;
        const count = await radioService.bulkRemoveSongs(ids);
        res.json({ message: `${count} song(s) removed` });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

exports.shufflePlaylist = async (req, res) => {
    try {
        await radioService.shufflePlaylist();
        const list = await radioService.getPlaylist();
        res.json(list);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
