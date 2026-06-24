const CLAIMS = {
  top: { label: "Top Line", points: 5 },
  middle: { label: "Middle Line", points: 5 },
  bottom: { label: "Bottom Line", points: 5 },
  ticket: { label: "Ticket", points: 10 },
  fullHouse: { label: "Full House", points: 15 }
};

const GAME_MODES = {
  online: "online",
  silent: "silent"
};

const GAME_STATES = {
  lobby: "lobby",
  started: "started",
  ended: "ended"
};

const rooms = new Map();

function makeRoomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return rooms.has(code) ? makeRoomCode() : code;
}

function createRoom(hostId, options = {}) {
  const roomCode = makeRoomCode();
  const ticketCount = Number(options.ticketCount) === 3 ? 3 : 1;
  const room = {
    code: roomCode,
    hostId,
    mode: options.mode === GAME_MODES.silent ? GAME_MODES.silent : GAME_MODES.online,
    ticketCount,
    claimPoints: {
      top: 5,
      middle: 5,
      bottom: 5,
      ticket: 10,
      fullHouse: ticketCount === 3 ? 20 : 15
    },
    gameState: GAME_STATES.lobby,
    players: new Map(),
    calledNumbers: [],
    winners: {
      top: [],
      middle: [],
      bottom: [],
      ticket: [],
      fullHouse: []
    },
    createdAt: Date.now(),
    endedAt: null
  };

  rooms.set(roomCode, room);
  return room;
}

function serializePlayer(player) {
  return {
    id: player.id,
    name: player.name,
    tickets: player.tickets,
    marks: player.marks,
    claims: player.claims,
    score: player.score,
    connected: player.connected,
    isHost: player.isHost
  };
}

function serializeRoom(room) {
  const players = Array.from(room.players.values()).map(serializePlayer);
  return {
    code: room.code,
    hostId: room.hostId,
    mode: room.mode,
    ticketCount: room.ticketCount,
    claimPoints: room.claimPoints,
    gameState: room.gameState,
    calledNumbers: room.calledNumbers,
    currentNumber: room.calledNumbers.at(-1) || null,
    players,
    winners: room.winners,
    scoreBoard: players
      .map((player) => ({
        id: player.id,
        name: player.name,
        score: player.score
      }))
      .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
  };
}

function getRoom(roomCode) {
  return rooms.get(String(roomCode || "").trim().toUpperCase());
}

module.exports = {
  CLAIMS,
  GAME_MODES,
  GAME_STATES,
  rooms,
  createRoom,
  getRoom,
  serializeRoom,
  serializePlayer
};
