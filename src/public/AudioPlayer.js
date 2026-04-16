import { useRef, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const RETRY_DELAY = 3000;
const RESYNC_INTERVAL = 30000; // Re-sync every 30 seconds to prevent clock drift
const RESYNC_THRESHOLD = 2; // Threshold in seconds for re-sync (2 second tolerance)

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function SongProgressBar({ audioRef, duration, playing }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!duration || !playing) {
      if (!playing) setElapsed(audioRef?.current?.currentTime || 0);
      return;
    }

    const update = () => {
      const time = audioRef?.current?.currentTime || 0;
      setElapsed(Math.min(time, duration));
    };

    update();
    const id = setInterval(update, 500);
    return () => clearInterval(id);
  }, [audioRef, duration, playing]);

  if (!duration) return null;

  const pct = Math.min((elapsed / duration) * 100, 100);

  return (
    <div className="w-full max-w-xs flex flex-col gap-1">
      {/* Bar */}
      <div className="w-full h-1.5 rounded-full bg-elevated overflow-hidden">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-1000 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      {/* Time labels */}
      <div className="flex justify-between text-[11px] text-muted">
        <span>{formatTime(elapsed)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

export default function AudioPlayer({ src, isStream, startTime, duration, trackTitle, onEnded, onError: onErrorCb, apiBaseUrl }) {
  const audioRef = useRef(null);
  const retryTimer = useRef(null);
  const resyncTimer = useRef(null);
  const prevSrc = useRef(src);
  const prevStartTime = useRef(startTime);
  const onEndedRef = useRef(onEnded);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  // Tracks whether user has engaged playback — stays true across song transitions
  const userWantsPlayback = useRef(false);

  const onErrorCbRef = useRef(onErrorCb);

  // Keep callback refs current
  useEffect(() => { onEndedRef.current = onEnded; }, [onEnded]);
  useEffect(() => { onErrorCbRef.current = onErrorCb; }, [onErrorCb]);

  // Clear any pending timers on unmount
  useEffect(() => {
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (resyncTimer.current) clearTimeout(resyncTimer.current);
    };
  }, []);

  // Fetch IST-synchronized position from server
  const fetchISTPosition = useCallback(async () => {
    try {
      if (isStream) return null;
      const baseUrl = apiBaseUrl || process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await axios.get(`${baseUrl}/api/radio/position`);
      return response.data;
    } catch (err) {
      console.error('Failed to fetch IST position:', err);
      return null;
    }
  }, [isStream, apiBaseUrl]);

  // Compute sync offset for music mode (IST-based)
  const getSyncOffset = useCallback(async () => {
    if (isStream || !startTime) return 0;

    // For IST-synchronized mode, fetch server position
    const positionData = await fetchISTPosition();
    if (positionData && positionData.isValid) {
      return positionData.offsetInSong || 0;
    }

    // Fallback to local calculation if server is unavailable
    const offset = Math.floor(Date.now() / 1000) - startTime;
    if (duration && offset >= duration) return -1; // track already ended
    return offset > 0 ? offset : 0;
  }, [isStream, startTime, duration, fetchISTPosition]);

  // Periodic re-sync to prevent clock drift
  const setupResync = useCallback(() => {
    if (resyncTimer.current) clearTimeout(resyncTimer.current);

    resyncTimer.current = setInterval(async () => {
      if (!playing) return;

      const positionData = await fetchISTPosition();
      if (!positionData || !positionData.isValid) return;

      const audio = audioRef.current;
      if (!audio) return;

      const currentOffset = audio.currentTime;
      const expectedOffset = positionData.offsetInSong;
      const drift = Math.abs(currentOffset - expectedOffset);

      // Re-sync if drift exceeds threshold
      if (drift > RESYNC_THRESHOLD) {
        console.log(`Re-syncing: current=${currentOffset.toFixed(1)}s, expected=${expectedOffset.toFixed(1)}s, drift=${drift.toFixed(1)}s`);
        audio.currentTime = expectedOffset;
      }
    }, RESYNC_INTERVAL);
  }, [playing, fetchISTPosition]);

  // Handle src or startTime change — auto-play next track if user had been listening
  useEffect(() => {
    if ((prevSrc.current !== src || prevStartTime.current !== startTime) && userWantsPlayback.current) {
      const audio = audioRef.current;
      if (audio && src) {
        audio.src = src;
        audio.load();
        setLoading(true);
        setError(null);

        getSyncOffset().then(offset => {
          if (offset === -1) {
            setLoading(false);
            setPlaying(false);
            if (onEndedRef.current) onEndedRef.current();
          } else {
            if (offset > 0) audio.currentTime = offset;
            audio.play().catch(() => {
              setLoading(false);
              setPlaying(false);
            });
          }
        });
      }
    }
    prevSrc.current = src;
    prevStartTime.current = startTime;
  }, [src, startTime, getSyncOffset]);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Clear any pending retry
    if (retryTimer.current) {
      clearTimeout(retryTimer.current);
      retryTimer.current = null;
    }
    setError(null);

    if (playing) {
      audio.pause();
      if (isStream) {
        audio.removeAttribute('src');
        audio.load();
      }
      setPlaying(false);
      setLoading(false);
      userWantsPlayback.current = false;
      if (resyncTimer.current) clearTimeout(resyncTimer.current);
    } else {
      userWantsPlayback.current = true;
      // Stop any existing playback first to prevent overlap
      audio.pause();
      audio.currentTime = 0;
      audio.src = src;
      audio.load();
      setLoading(true);

      // Apply sync offset for music mode (IST-based)
      getSyncOffset().then(offset => {
        if (offset > 0) audio.currentTime = offset;
        audio.play().catch(() => {
          setLoading(false);
          setPlaying(false);
        });
      });

      // Setup periodic re-sync
      setupResync();
    }
  }, [playing, src, isStream, getSyncOffset, setupResync]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onPlaying = () => {
      setPlaying(true);
      setLoading(false);
      setError(null);
      // Setup re-sync when playback starts
      setupResync();
    };
    const onPause = () => {
      setPlaying(false);
      if (resyncTimer.current) clearTimeout(resyncTimer.current);
    };
    const onWaiting = () => setLoading(true);
    const onError = () => {
      setPlaying(false);
      setLoading(false);
      if (isStream) {
        setError('Stream error. Retrying…');
        retryTimer.current = setTimeout(() => {
          if (audio.src) {
            audio.load();
            setLoading(true);
            audio.play().catch(() => {
              setLoading(false);
            });
          }
        }, RETRY_DELAY);
      } else {
        setError('Track unavailable — skipping…');
        // Notify parent so it can tell the backend to advance
        if (onErrorCbRef.current) onErrorCbRef.current();
      }
    };
    const onEndedEvent = () => {
      if (!isStream) {
        setPlaying(false);
        if (resyncTimer.current) clearTimeout(resyncTimer.current);
        if (onEndedRef.current) onEndedRef.current();
      }
    };
    // Fallback: if duration is known and audio exceeds it, trigger ended
    // (handles cases where audio file is longer than recorded duration)
    const onTimeUpdate = () => {
      if (!isStream && duration && audio.currentTime >= duration) {
        audio.pause();
        setPlaying(false);
        if (resyncTimer.current) clearTimeout(resyncTimer.current);
        if (onEndedRef.current) onEndedRef.current();
      }
    };

    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('error', onError);
    audio.addEventListener('ended', onEndedEvent);
    audio.addEventListener('timeupdate', onTimeUpdate);

    return () => {
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('error', onError);
      audio.removeEventListener('ended', onEndedEvent);
      audio.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [isStream, duration, setupResync]);

  return (
    <div className="flex flex-col items-center gap-4">
      <audio ref={audioRef} preload="none" />

      <button
        onClick={togglePlay}
        disabled={!src}
        className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-4xl transition-all duration-200 focus:outline-none focus:ring-4 focus:ring-accent/50 ${
          !src
            ? 'bg-gray-600 cursor-not-allowed'
            : playing
            ? 'bg-gray-700 hover:bg-gray-600 active:scale-95'
            : 'bg-accent hover:bg-green-600 active:scale-95'
        }`}
        aria-label={playing ? 'Pause' : 'Play'}
      >
        {loading ? (
          <svg className="animate-spin w-10 h-10" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        ) : playing ? (
          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg className="w-10 h-10 ml-1" viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>

      {/* Song progress bar — hidden in stream/speaker mode */}
      {!isStream && (
        <SongProgressBar
          audioRef={audioRef}
          duration={duration}
          playing={playing}
        />
      )}

      <p className="text-sm text-txt-secondary">
        {error
          ? <span className="text-red-400">{error}</span>
          : !src
          ? (isStream ? 'No stream available' : 'No track available')
          : loading
          ? (isStream ? 'Connecting to stream…' : 'Loading track…')
          : playing
          ? (isStream ? 'Now streaming' : 'Now playing')
          : trackTitle
          ? trackTitle
          : 'Tap to Listen'}
      </p>
    </div>
  );
}
