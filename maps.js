// Map definitions (pure data). One letter = one room (a single connected region).
// types: letter -> { kind: base look/furnishing (H hall, L living, B library, S bedroom, K kitchen, D dining, T bathroom), name: label on the minimap }
// doors: [col, row, 'E'|'S'] = a doorway on the east / south edge of that cell.

function grid(cols, rows, rects) {
  const g = Array.from({ length: rows }, () => Array(cols).fill('.'));
  for (const [ch, c0, r0, c1, r1] of rects) for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (g[r][c] !== '.') throw new Error(`map overlap at ${c},${r}`);
    g[r][c] = ch;
  }
  return g.map((r) => r.join(''));
}

const MANOR = {
  id: 'manor', title: 'The Manor', blurb: 'Classic: grand hall with rooms either side',
  rows: [
    'LLLLLLHHHHHHHHKKKKKK', 'LLLLLLHHHHHHHHKKKKKK', 'LLLLLLHHHHHHHHKKKKKK', 'LLLLLLHHHHHHHHKKKKKK',
    'BBBBBBHHHHHHHHDDDDDD', 'BBBBBBHHHHHHHHDDDDDD', 'BBBBBBHHHHHHHHDDDDDD', 'BBBBBBHHHHHHHHDDDDDD',
    'SSSSSSHHHHHHHHTTTTTT', 'SSSSSSHHHHHHHHTTTTTT', 'SSSSSSHHHHHHHHTTTTTT', 'SSSSSSHHHHHHHHTTTTTT'
  ],
  doors: [[5, 1, 'E'], [5, 5, 'E'], [5, 9, 'E'], [13, 1, 'E'], [13, 5, 'E'], [13, 9, 'E'], [2, 3, 'S'], [2, 7, 'S'], [17, 3, 'S'], [17, 7, 'S']],
  types: { L: { kind: 'L', name: 'Living Room' }, B: { kind: 'B', name: 'Library' }, S: { kind: 'S', name: 'Bedroom' }, K: { kind: 'K', name: 'Kitchen' }, D: { kind: 'D', name: 'Dining Room' }, T: { kind: 'T', name: 'Bathroom' }, H: { kind: 'H', name: 'Grand Hall' } },
  spawn: [24, 9], zspawn: [24, 26], manual: true,
  lightMul: 1, hemi: [0x3a4a7a, 0x1a1210, 0.42], exposure: 1.15, fog: 0.045
};

// A ring corridor around a great room, rooms packed around the outside.
const LODGE = {
  id: 'lodge', title: 'The Lodge', blurb: 'Ring corridor you can run laps in, 12 rooms, brighter',
  rows: grid(22, 14, [
    ['H', 4, 3, 17, 3], ['H', 4, 10, 17, 10], ['H', 4, 4, 4, 9], ['H', 17, 4, 17, 9],
    ['B', 5, 4, 8, 9], ['G', 9, 4, 12, 9], ['O', 13, 4, 16, 9],
    ['K', 0, 0, 6, 2], ['D', 7, 0, 13, 2], ['S', 14, 0, 21, 2],
    ['N', 0, 11, 6, 13], ['T', 7, 11, 10, 13], ['U', 11, 11, 14, 13], ['P', 15, 11, 21, 13],
    ['R', 0, 3, 3, 10], ['Y', 18, 3, 21, 10]
  ]),
  doors: [
    [5, 2, 'S'], [10, 2, 'S'], [15, 2, 'S'], [5, 10, 'S'], [8, 10, 'S'], [12, 10, 'S'], [16, 10, 'S'],
    [3, 5, 'E'], [3, 8, 'E'], [17, 5, 'E'], [17, 8, 'E'],
    [4, 6, 'E'], [10, 3, 'S'], [16, 6, 'E'], [11, 9, 'S'], [8, 5, 'E'], [12, 7, 'E'],
    [6, 1, 'E'], [13, 1, 'E'], [6, 12, 'E'], [10, 12, 'E'], [14, 12, 'E']
  ],
  types: {
    H: { kind: 'H', name: 'Ring Corridor' }, B: { kind: 'B', name: 'Library' }, G: { kind: 'L', name: 'Great Room' }, O: { kind: 'B', name: 'Study' },
    K: { kind: 'K', name: 'Kitchen' }, D: { kind: 'D', name: 'Dining Room' }, S: { kind: 'S', name: 'Master Bedroom' }, N: { kind: 'S', name: 'Guest Bedroom' },
    T: { kind: 'T', name: 'Bathroom' }, U: { kind: 'K', name: 'Pantry' }, P: { kind: 'L', name: 'Parlor' }, R: { kind: 'B', name: 'West Gallery' }, Y: { kind: 'L', name: 'Games Room' }
  },
  spawn: [22.8, 8.4], zspawn: [30, 25.2], seed: 11, sRow: 0.5, titleYaw: -Math.PI / 2,
  lightMul: 1.5, hemi: [0x4a5a8c, 0x2a1e18, 0.82], exposure: 1.35, fog: 0.036
};

// Two separate wings joined by a long glass bridge over a courtyard (the "second portion").
const ESTATE = {
  id: 'estate', title: 'The Estate', blurb: 'Two wings joined by a glass bridge, 14 rooms, brighter',
  rows: grid(30, 12, [
    ['B', 0, 0, 4, 4], ['L', 5, 0, 11, 4], ['H', 0, 5, 11, 6], ['S', 0, 7, 5, 11], ['T', 6, 7, 8, 9], ['U', 6, 10, 8, 11], ['D', 9, 7, 11, 11],
    ['C', 12, 5, 17, 6],
    ['K', 18, 0, 23, 4], ['Y', 24, 0, 29, 4], ['J', 18, 5, 29, 6], ['M', 18, 7, 23, 11], ['W', 24, 7, 26, 9], ['O', 24, 10, 26, 11], ['X', 27, 7, 29, 11]
  ]),
  doors: [
    [2, 4, 'S'], [8, 4, 'S'], [4, 2, 'E'], [2, 6, 'S'], [7, 6, 'S'], [10, 6, 'S'], [5, 8, 'E'], [7, 9, 'S'], [8, 8, 'E'],
    [11, 5, 'E'], [11, 6, 'E'], [17, 5, 'E'], [17, 6, 'E'],
    [20, 4, 'S'], [26, 4, 'S'], [23, 2, 'E'], [20, 6, 'S'], [25, 6, 'S'], [25, 9, 'S'], [28, 6, 'S'], [23, 8, 'E'], [26, 8, 'E']
  ],
  types: {
    B: { kind: 'B', name: 'Library' }, L: { kind: 'L', name: 'Drawing Room' }, H: { kind: 'H', name: 'West Hall' }, S: { kind: 'S', name: 'Bedroom' },
    T: { kind: 'T', name: 'Bathroom' }, U: { kind: 'K', name: 'Pantry' }, D: { kind: 'D', name: 'Dining Room' }, C: { kind: 'H', name: 'Glass Bridge' },
    K: { kind: 'K', name: 'Kitchen' }, Y: { kind: 'L', name: 'Conservatory' }, J: { kind: 'H', name: 'East Hall' }, M: { kind: 'S', name: 'Master Suite' },
    W: { kind: 'T', name: 'Washroom' }, O: { kind: 'B', name: 'Study' }, X: { kind: 'L', name: 'Games Room' }
  },
  spawn: [14.4, 14.4], zspawn: [62.4, 14.4], seed: 23, sRow: 0.5, titleYaw: -Math.PI / 2,
  lightMul: 1.5, hemi: [0x4a5a8c, 0x2a1e18, 0.82], exposure: 1.35, fog: 0.036
};


// Two storeys. The upper floor is built beside the lower one (a gap of empty space keeps them apart) and the
// staircases carry you across with a short fade; the ghost uses the same stairs.
const TOWER = {
  id: 'tower', title: 'The Tower', blurb: 'Two floors, 16 rooms, very bright', lightlevel: 'very bright',
  rows: grid(46, 10, [
    // ground floor
    ['L', 0, 0, 4, 3], ['K', 5, 0, 9, 3], ['D', 10, 0, 15, 3],
    ['P', 0, 4, 1, 5], ['H', 2, 4, 13, 5], ['Q', 14, 4, 15, 5],
    ['B', 0, 6, 5, 9], ['T', 6, 6, 8, 9], ['Y', 9, 6, 15, 9],
    // upper floor
    ['A', 30, 0, 35, 3], ['N', 36, 0, 38, 3], ['O', 39, 0, 42, 3], ['E', 43, 0, 45, 3],
    ['p', 30, 4, 31, 5], ['G', 32, 4, 43, 5], ['q', 44, 4, 45, 5],
    ['R', 30, 6, 35, 9], ['I', 36, 6, 40, 9], ['J', 41, 6, 45, 9]
  ]),
  doors: [
    [2, 3, 'S'], [7, 3, 'S'], [12, 3, 'S'], [2, 5, 'S'], [7, 5, 'S'], [11, 5, 'S'], [1, 4, 'E'], [13, 4, 'E'],
    [4, 1, 'E'], [9, 1, 'E'], [5, 8, 'E'], [8, 8, 'E'],
    [33, 3, 'S'], [37, 3, 'S'], [41, 3, 'S'], [43, 3, 'S'], [31, 4, 'E'], [43, 4, 'E'],
    [35, 1, 'E'], [38, 1, 'E'], [42, 1, 'E'],
    [33, 5, 'S'], [38, 5, 'S'], [42, 5, 'S'], [35, 8, 'E'], [40, 8, 'E']
  ],
  types: {
    L: { kind: 'L', name: 'Living Room' }, K: { kind: 'K', name: 'Kitchen' }, D: { kind: 'D', name: 'Dining Room' },
    P: { kind: 'H', name: 'West Stairs (up)', stair: true }, H: { kind: 'H', name: 'Ground Hall' }, Q: { kind: 'H', name: 'East Stairs (up)', stair: true },
    B: { kind: 'B', name: 'Library' }, T: { kind: 'T', name: 'Bathroom' }, Y: { kind: 'L', name: 'Games Room' },
    A: { kind: 'S', name: 'Master Bedroom' }, N: { kind: 'T', name: 'Upper Bath' }, O: { kind: 'B', name: 'Study' }, E: { kind: 'S', name: 'Guest Bedroom' },
    p: { kind: 'H', name: 'West Stairs (down)', stair: true }, G: { kind: 'H', name: 'Upper Hall' }, q: { kind: 'H', name: 'East Stairs (down)', stair: true },
    R: { kind: 'L', name: 'Gallery' }, I: { kind: 'L', name: 'Playroom' }, J: { kind: 'B', name: 'Reading Room' }
  },
  stairs: [
    { room: 'P', dir: 'W', type: 'up', to: 2 }, { room: 'Q', dir: 'E', type: 'up', to: 3 },
    { room: 'p', dir: 'W', type: 'down', to: 0 }, { room: 'q', dir: 'E', type: 'down', to: 1 }
  ],
  spawn: [19.2, 12.0], zspawn: [91.2, 12.0], seed: 31, sRow: 0.5, titleYaw: -Math.PI / 2,
  lightMul: 3.2, hemi: [0xc4cfee, 0x6a5a50, 1.5], exposure: 1.75, fog: 0.016
};

export const MAPS = { manor: MANOR, lodge: LODGE, estate: ESTATE, tower: TOWER };
export const MAP_IDS = Object.keys(MAPS);
