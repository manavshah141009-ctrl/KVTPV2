const { Server } = require('socket.io');
const radioService = require('../modules/radio/radio.service');
const { getCorsOrigins } = require('../config/cors');

const initSocket = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: getCorsOrigins(),
            methods: ['GET', 'POST']
        }
    });

    // Wire up broadcast: radio service calls this on every state change
    radioService.setBroadcast((event, payload) => {
        io.emit(event, payload);
    });

    io.on('connection', async (socket) => {
        console.log(`Client connected: ${socket.id}`);

        // Send current state on connect
        try {
            const status = await radioService.getStatus();
            socket.emit('status-update', status);
        } catch (e) {
            console.error('Error fetching initial status for socket:', e);
        }

        // Client reports that a song finished playing. In 24/7 mode, we don't advance anything manually.
        // We simply return the strictly correct mathematical current state based on IST time.
        socket.on('song-ended', async () => {
            try {
                const status = await radioService.getStatus();
                socket.emit('status-update', status);
            } catch (e) {
                console.error('Error handling song-ended for socket:', e);
            }
        });

        socket.on('disconnect', () => {
            console.log(`Client disconnected: ${socket.id}`);
        });
    });

    return io;
};

module.exports = { initSocket };
