# HOLLOW HALL — zombie hide & seek (solo or up to 8 players)

## Run on your computer
    npm install
    npm run build
    npm start          # http://localhost:3000 — open it in 2+ tabs to test

## Put it online (free, Render.com) so friends anywhere can join
1. Create a new GitHub repository and upload everything in this folder (not node_modules).
2. On render.com: New + -> Web Service -> pick the repo. Render reads render.yaml
   (build: `npm install && npm run build`, start: `npm start`).
3. When it is live, open the https://....onrender.com link. Enter your name, press "Create room",
   send the 4-letter code (or the link) to friends; they press "Join".

The free plan sleeps after ~15 min idle; the first visit afterwards takes ~30 s to wake up.

## How multiplayer works
`server.js` serves the game and relays messages between players in a room. The room creator
(host) runs the zombie AI and the round clock; if the host leaves, the next player takes over.

## Playing the zombie
In the lobby the host picks who plays the zombie: the AI, a random player, or a specific friend.
The zombie player hunts in first person (Shift = lunge, E = check a hiding spot, F = roar) and sees
hiders on the minimap only while they make noise.

## Maps
Pick a map on the title screen (solo) or in the lobby (host picks for everyone):
- **The Manor** — the original: grand hall with rooms either side.
- **The Lodge** — a ring corridor around a great room, 12 rooms; brighter lighting.
- **The Estate** — two wings joined by a long glass bridge, 14 rooms; brighter lighting.
- **The Tower** — a very bright two-storey building (ground floor + upper floor, 20 rooms) joined by two staircases; a short fade covers the climb.

**Round length:** pick 2, 3, 5, 8 or 10 minutes on the title screen (solo) or in the lobby (host sets it for everyone).
