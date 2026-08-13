# Cartoon City Tycoon Online V3

The game now supports **2–12 online players** and includes synchronized mini-games that interrupt the board game every few rounds.

## V3 highlights

### 2–12 players
The host can choose a maximum room size of:
- 6
- 8
- 10
- 12 players

The rest of the multiplayer systems still work: room codes, automatic seat reconnection, text chat, voice chat, auctions, missions, market events, character abilities and power cards.

### Synchronized mini-games
The host can choose mini-games every 2, 3, 4 or 5 rounds, or switch them off.

When a mini-game begins, normal board turns pause for everybody. The server controls the timer, answers, rewards and results so all computers stay synchronized.

Included mini-games:

1. **Quick Math Race**
   - Everyone sees the same arithmetic question.
   - First three correct answers receive the largest rewards.
   - Players have up to three attempts.

2. **Treasure Pick**
   - Every player selects one of 12 treasure chests.
   - Cash rewards are shuffled privately on the server and revealed after selections.

3. **Dice Prediction**
   - Predict LOW (2–6), EXACT 7, or HIGH (8–12).
   - The server rolls two dice after everybody answers or the timer expires.
   - Exact 7 pays the biggest reward.

4. **Reaction Rush**
   - Everybody must wait for a server-defined GO time.
   - First three valid clicks receive the biggest rewards.
   - Clicking before GO is rejected.

Mini-game rewards become part of the player's normal board-game cash.

## Existing V2 systems retained

- Automatic browser seat reconnection with private reconnect tokens
- 45-second reconnect grace period before an offline current turn is skipped
- Persistent room state in `data/rooms.json`
- Real-time text chat
- WebRTC microphone voice chat
- Live property auctions
- District ownership bonuses
- Individual missions
- Power cards
- Character abilities
- Changing market events
- 12/20/30/40/endless board-game length

## Voice chat with larger rooms

V3 allows up to 12 players in the room. The included voice system is peer-to-peer WebRTC mesh voice.

This is convenient for small groups, but with 9–12 simultaneous talkers each browser has more peer connections and uses more upload/download bandwidth.

For a production game with frequent 10–12 person voice chat, consider replacing mesh voice with an SFU service such as LiveKit, mediasoup, Janus, or another hosted WebRTC SFU.

A TURN server is still recommended for players on different home/mobile networks.

Environment variables:

`TURN_URL`
`TURN_USERNAME`
`TURN_CREDENTIAL`

## Run locally

1. Install Node.js 18 or newer.
2. Extract the project.
3. On Windows, double-click `START_WINDOWS.bat`.

Or run:

`npm install`
`npm start`

Then open:

`http://localhost:3000`

## Play online

Host the entire folder on a Node.js server with a public HTTPS URL.

All players visit the same URL. One person creates a room and shares the 5-character room code.

## Main files

- `server.js` — authoritative game server, reconnect, mini-games, auctions, chat, voice signaling and game rules
- `public/index.html` — browser board game, mini-game UI, voice/chat UI
- `data/rooms.json` — generated automatically for room persistence
- `START_WINDOWS.bat` — Windows launcher
- `Dockerfile` — optional container deployment
