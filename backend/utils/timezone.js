/**
 * IST (Indian Standard Time) Timezone Utilities
 * All times are in Unix seconds (seconds since epoch)
 * IST is UTC+5:30
 */

/**
 * Get current time in IST as Unix timestamp (seconds)
 * @returns {number} Current Unix timestamp in IST
 */
function getCurrentISTTime() {
    const now = new Date();
    // Get UTC timestamp
    const utcTimestamp = Math.floor(now.getTime() / 1000);

    // Calculate IST offset: UTC+5:30 = 5.5 hours = 19800 seconds
    const istOffset = 5.5 * 3600;

    // Adjust for local timezone offset
    const localOffset = now.getTimezoneOffset() * 60;

    // IST time = UTC time + (IST offset - local offset)
    return utcTimestamp + istOffset + localOffset;
}

/**
 * Get current time as Date object in IST timezone
 * @returns {Date} Date object representing IST time
 */
function getISTDate() {
    const now = new Date();
    // Format to IST and parse back to get IST date
    const formatter = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
    });

    return new Date(formatter.format(now).replace(/(\d+)\/(\d+)\/(\d+),\s(\d+):(\d+):(\d+)/, '$3-$1-$2T$4:$5:$6'));
}

/**
 * Get string representation of current IST time
 * Format: "HH:MM:SS"
 * @returns {string} IST time as HH:MM:SS
 */
function getISTTimeString() {
    const date = getISTDate();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

/**
 * Convert Unix timestamp to IST time string
 * @param {number} unixTimestamp - Unix timestamp in seconds
 * @returns {string} IST time as HH:MM:SS
 */
function formatISTTime(unixTimestamp) {
    const date = new Date(unixTimestamp * 1000);
    const formatter = new Intl.DateTimeFormat('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
        timeZone: 'Asia/Kolkata'
    });
    return formatter.format(date);
}

module.exports = {
    getCurrentISTTime,
    getISTDate,
    getISTTimeString,
    formatISTTime
};
