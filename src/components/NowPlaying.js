import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

/**
 * Format Unix timestamp to IST time string (HH:MM:SS)
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

export default function NowPlaying({ mode, currentTrack }) {
  const [nextTrack, setNextTrack] = useState(null);
  const [nextSongStartTime, setNextSongStartTime] = useState(null);
  const positionFetchRef = useRef(null);

  const isMusic = mode === 'music';
  const hasCurrent = isMusic ? currentTrack : null;

  // Fetch position data to get next song info
  useEffect(() => {
    if (!isMusic) {
      setNextTrack(null);
      setNextSongStartTime(null);
      return;
    }

    const fetchNextTrackInfo = async () => {
      try {
        const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
        const response = await axios.get(`${apiUrl}/api/radio/position`);

        if (response.data && response.data.isValid) {
          setNextTrack(response.data.nextTrack || null);
          setNextSongStartTime(response.data.nextSongStartTime || null);
        }
      } catch (err) {
        console.error('Failed to fetch next track info:', err);
      }
    };

    // Fetch immediately
    fetchNextTrackInfo();

    // Refresh every 30 seconds
    positionFetchRef.current = setInterval(fetchNextTrackInfo, 30000);

    return () => {
      if (positionFetchRef.current) clearInterval(positionFetchRef.current);
    };
  }, [isMusic]);

  return (
    <div className="w-full max-w-md mx-auto bg-white/5 backdrop-blur rounded-2xl p-6">
      {/* Mode badge */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
            isMusic
              ? 'bg-accent/20 text-accent'
              : 'bg-purple-500/20 text-purple-400'
          }`}
        >
          {isMusic ? '♫ Music' : '🎙 Speaker'}
        </span>
      </div>

      {/* Current info */}
      {hasCurrent ? (
        <div className="text-center">
          <p className="text-lg font-bold text-white truncate">
            {currentTrack.title}
          </p>
          <p className="text-sm text-gray-400 mt-1">Now Playing</p>
        </div>
      ) : (
        <p className="text-center text-gray-500 text-sm">
          Nothing playing right now
        </p>
      )}

      {/* Next song info */}
      {isMusic && nextTrack && nextSongStartTime && (
        <div className="mt-6 pt-6 border-t border-white/10">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Up Next
          </p>
          <p className="text-base font-semibold text-white mt-2 truncate">
            {nextTrack.title}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Starts at {formatISTTime(nextSongStartTime)} IST
          </p>
        </div>
      )}
    </div>
  );
}
