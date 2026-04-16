/**
 * Test script for IST-synchronized radio playback
 * Run with: node test-radio-sync.js
 */

// Mock the timezone module
const timezone = require('./utils/timezone');

console.log('=== IST Timezone Test ===\n');

// Get current IST time
const istTime = timezone.getCurrentISTTime();
const istDate = timezone.getISTDate();
const istString = timezone.getISTTimeString();

console.log('System Time:', new Date().toISOString());
console.log('IST Time (Unix):', istTime);
console.log('IST Time (Date):', istDate);
console.log('IST Time (Formatted):', istString);

// Test timestamp formatting
console.log('\n=== Timestamp Formatting Test ===\n');
const futureTimestamp = istTime + 3600; // 1 hour from now
console.log('Current IST:', timezone.formatISTTime(istTime));
console.log('In 1 hour IST:', timezone.formatISTTime(futureTimestamp));

// Test virtual playlist calculations
console.log('\n=== Virtual Playlist Engine Test ===\n');

// Example playlist with cumulative durations
const mockSongs = [
  { id: '1', title: 'Song A', duration: 180 }, // 3 minutes
  { id: '2', title: 'Song B', duration: 240 }, // 4 minutes
  { id: '3', title: 'Song C', duration: 300 }  // 5 minutes
];
// Total: 12 minutes = 720 seconds

const totalDuration = 720;

// Simulate position at different times
const testPositions = [
  { time: istTime, label: 'Now' },
  { time: istTime + 100, label: '+100 seconds' },
  { time: istTime + 200, label: '+200 seconds' },
  { time: istTime + 400, label: '+400 seconds' }
];

console.log('Example playlist: 3 songs, 12 minutes total\n');

testPositions.forEach(({ time, label }) => {
  const posInCycle = time % totalDuration;
  let currentSong = mockSongs[0];
  let offset = posInCycle;

  if (posInCycle >= 180 && posInCycle < 420) {
    currentSong = mockSongs[1];
    offset = posInCycle - 180;
  } else if (posInCycle >= 420) {
    currentSong = mockSongs[2];
    offset = posInCycle - 420;
  }

  console.log(`${label}:`);
  console.log(`  Position in cycle: ${posInCycle}s`);
  console.log(`  Current song: ${currentSong.title}`);
  console.log(`  Offset in song: ${offset.toFixed(1)}s`);
  console.log();
});

console.log('✓ All tests completed');
