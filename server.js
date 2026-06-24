const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { randomUUID } = require("crypto");
const {
  CLAIMS,
  GAME_MODES,
  GAME_STATES,
  createRoom,
  getRoom,
  serializeRoom,
  serializePlayer
} = require("./state");
const { generateTickets } = require("./public/tickets");

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

function makePlayer(name, ticketCount, isHost = false, existingId) {
  return {
    id: existingId || randomUUID(),
    name: String(name || "Player").trim().slice(0, 24) || "Player",
    tickets: isHost ? [] : generateTickets(ticketCount),
    marks: {},
    claims: {
      top: { used: false, eligible: false },
      middle: { used: false, eligible: false },
      bottom: { used: false, eligible: false },
      ticket: { used: false, eligible: false },
      fullHouse: { used: false, eligible: false }
    },
    score: 0,
    connected: true,
    isHost
  };
}

function joinSocket(socket, room, player) {
  socket.join(room.code);
  socket.data.roomCode = room.code;
  socket.data.playerId = player.id;
}

function emitRoom(room) {
  refreshAllEligibilities(room);
  io.to(room.code).emit("room:update", serializeRoom(room));
}

function getPlayer(room, playerId) {
  return room.players.get(playerId);
}

function isHost(room, socket) {
  return room.hostId === socket.data.playerId;
}

function normalizeMarksForCalledNumbers(player, room) {
  const called = new Set(room.calledNumbers);
  Object.keys(player.marks).forEach((ticketId) => {
    player.marks[ticketId] = player.marks[ticketId].filter((number) => called.has(number));
  });
}

function getLineNumbers(ticket, claimType) {
  if (claimType === "top") return ticket.grid[0].filter(Number.isInteger);
  if (claimType === "middle") return ticket.grid[1].filter(Number.isInteger);
  if (claimType === "bottom") return ticket.grid[2].filter(Number.isInteger);
  if (claimType === "ticket") return ticket.grid.flat().filter(Number.isInteger);
  return [];
}

function hasWinningTicket(player, room, claimType) {
  const called = new Set(room.calledNumbers);
  normalizeMarksForCalledNumbers(player, room);

  if (player.isHost) return false;

  if (claimType === "fullHouse") {
    const ticketsToComplete = room.ticketCount === 3 ? player.tickets : player.tickets.slice(0, 1);
    return (
      ticketsToComplete.length === room.ticketCount &&
      ticketsToComplete.every((ticket) =>
        ticket.grid
          .flat()
          .filter(Number.isInteger)
          .every((number) => called.has(number))
      )
    );
  }

  return player.tickets.some((ticket) => {
    const needed = getLineNumbers(ticket, claimType);
    return needed.length > 0 && needed.every((number) => called.has(number));
  });
}

function refreshPlayerEligibility(player, room) {
  Object.keys(CLAIMS).forEach((claimType) => {
    const used = player.claims[claimType]?.used || false;
    player.claims[claimType] = {
      used,
      eligible: room.gameState === GAME_STATES.started && !used && hasWinningTicket(player, room, claimType)
    };
  });
}

function refreshAllEligibilities(room) {
  room.players.forEach((player) => refreshPlayerEligibility(player, room));
}

function recordWinner(room, player, claimType) {
  const alreadyWonCategory = room.winners[claimType].some((winner) => winner.playerId === player.id);
  if (alreadyWonCategory) return null;

  const order = room.winners[claimType].length + 1;
  const podiumPoints = order <= 3 ? room.claimPoints[claimType] : 0;

  const winner = {
    playerId: player.id,
    name: player.name,
    points: podiumPoints,
    order,
    wonAtNumber: room.calledNumbers.at(-1) || null,
    time: Date.now()
  };

  room.winners[claimType].push(winner);
  return winner;
}

function resetRoomForReplay(room) {
  room.gameState = GAME_STATES.lobby;
  room.calledNumbers = [];
  room.winners = {
    top: [],
    middle: [],
    bottom: [],
    ticket: [],
    fullHouse: []
  };
  room.endedAt = null;

  room.players.forEach((player) => {
    player.marks = {};
    player.score = 0;
    player.claims = {
      top: { used: false, eligible: false },
      middle: { used: false, eligible: false },
      bottom: { used: false, eligible: false },
      ticket: { used: false, eligible: false },
      fullHouse: { used: false, eligible: false }
    };
    player.tickets = player.isHost ? [] : generateTickets(room.ticketCount);
  });
}

function finalResults(room) {
  const players = Array.from(room.players.values())
    .map((player) => ({
      id: player.id,
      name: player.name,
      score: player.score
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  return {
    categoryPodiums: room.winners,
    overallTop3: players.slice(0, 3)
  };
}

io.on("connection", (socket) => {
  socket.on("host:create", ({ name, mode, ticketCount } = {}, reply) => {
    const hostId = randomUUID();
    const room = createRoom(hostId, {
      mode: mode === GAME_MODES.silent ? GAME_MODES.silent : GAME_MODES.online,
      ticketCount
    });
    const host = makePlayer(name || "Host", room.ticketCount, true, hostId);
    room.players.set(host.id, host);
    joinSocket(socket, room, host);
    emitRoom(room);
    reply?.({ ok: true, room: serializeRoom(room), player: serializePlayer(host) });
  });

  socket.on("player:join", ({ roomCode, name, playerId } = {}, reply) => {
    const room = getRoom(roomCode);
    if (!room) {
      reply?.({ ok: false, message: "Room not found." });
      return;
    }

    if (room.gameState === GAME_STATES.ended) {
      reply?.({ ok: false, message: "This game has already ended." });
      return;
    }

    let player = playerId ? getPlayer(room, playerId) : null;
    if (player) {
      player.connected = true;
      if (name) player.name = String(name).trim().slice(0, 24) || player.name;
    } else {
      player = makePlayer(name, room.ticketCount, false);
      room.players.set(player.id, player);
    }

    joinSocket(socket, room, player);
    emitRoom(room);
    reply?.({ ok: true, room: serializeRoom(room), player: serializePlayer(player) });
  });

  socket.on("player:reconnect", ({ roomCode, playerId } = {}, reply) => {
    const room = getRoom(roomCode);
    const player = room && playerId ? getPlayer(room, playerId) : null;
    if (!room || !player) {
      reply?.({ ok: false, message: "Saved session not found." });
      return;
    }

    player.connected = true;
    joinSocket(socket, room, player);
    emitRoom(room);
    reply?.({ ok: true, room: serializeRoom(room), player: serializePlayer(player) });
  });

  socket.on("host:start", (_, reply) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !isHost(room, socket)) {
      reply?.({ ok: false, message: "Only the host can start the game." });
      return;
    }

    if (room.gameState !== GAME_STATES.lobby) {
      reply?.({ ok: false, message: "The game has already started." });
      return;
    }

    room.gameState = GAME_STATES.started;
    emitRoom(room);
    reply?.({ ok: true });
  });

  socket.on("host:nextNumber", (_, reply) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !isHost(room, socket)) {
      reply?.({ ok: false, message: "Only the host can call numbers." });
      return;
    }

    if (room.gameState !== GAME_STATES.started) {
      reply?.({ ok: false, message: "Start the game before calling numbers." });
      return;
    }

    const remaining = Array.from({ length: 90 }, (_, index) => index + 1).filter(
      (number) => !room.calledNumbers.includes(number)
    );

    if (remaining.length === 0) {
      room.gameState = GAME_STATES.ended;
      room.endedAt = Date.now();
      emitRoom(room);
      io.to(room.code).emit("game:ended", finalResults(room));
      reply?.({ ok: false, message: "All numbers have been called." });
      return;
    }

    const nextNumber = remaining[Math.floor(Math.random() * remaining.length)];
    room.calledNumbers.push(nextNumber);
    emitRoom(room);
    io.to(room.code).emit("number:called", {
      number: nextNumber,
      mode: room.mode
    });
    reply?.({ ok: true, number: nextNumber });
  });

  socket.on("host:end", (_, reply) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !isHost(room, socket)) {
      reply?.({ ok: false, message: "Only the host can end the game." });
      return;
    }

    room.gameState = GAME_STATES.ended;
    room.endedAt = Date.now();
    emitRoom(room);
    io.to(room.code).emit("game:ended", finalResults(room));
    reply?.({ ok: true });
  });

  socket.on("host:playAgain", (_, reply) => {
    const room = getRoom(socket.data.roomCode);
    if (!room || !isHost(room, socket)) {
      reply?.({ ok: false, message: "Only the host can restart the room." });
      return;
    }

    resetRoomForReplay(room);
    emitRoom(room);
    reply?.({ ok: true });
  });

  socket.on("ticket:mark", ({ ticketId, number } = {}, reply) => {
    const room = getRoom(socket.data.roomCode);
    const player = room && getPlayer(room, socket.data.playerId);
    const parsedNumber = Number(number);

    if (!room || !player || !Number.isInteger(parsedNumber)) {
      reply?.({ ok: false, message: "Could not mark that number." });
      return;
    }

    const ownsNumber = player.tickets.some(
      (ticket) => ticket.id === ticketId && ticket.grid.flat().includes(parsedNumber)
    );
    const wasCalled = room.calledNumbers.includes(parsedNumber);

    if (!ownsNumber || !wasCalled) {
      reply?.({ ok: false, message: "Only called numbers on your ticket can be marked." });
      return;
    }

    const marks = new Set(player.marks[ticketId] || []);
    if (marks.has(parsedNumber)) marks.delete(parsedNumber);
    else marks.add(parsedNumber);
    player.marks[ticketId] = Array.from(marks);
    emitRoom(room);
    reply?.({ ok: true, player: serializePlayer(player) });
  });

  socket.on("claim:submit", ({ claimType } = {}, reply) => {
    const room = getRoom(socket.data.roomCode);
    const player = room && getPlayer(room, socket.data.playerId);

    if (!room || !player || !CLAIMS[claimType]) {
      reply?.({ ok: false, message: "That claim is not available." });
      return;
    }

    if (room.gameState !== GAME_STATES.started) {
      reply?.({ ok: false, message: "Claims are only available during the game." });
      return;
    }

    if (player.claims[claimType]?.used) {
      reply?.({ ok: false, message: "You have already used that claim." });
      return;
    }

    const isValid = hasWinningTicket(player, room, claimType);
    if (!isValid) {
      refreshPlayerEligibility(player, room);
      emitRoom(room);
      reply?.({ ok: false, message: `Not eligible for ${CLAIMS[claimType].label} yet.` });
      return;
    }

    player.claims[claimType] = { used: true, eligible: false };
    const winner = recordWinner(room, player, claimType);
    const points = winner ? winner.points : 0;
    player.score += points;
    emitRoom(room);
    io.to(room.code).emit("claim:accepted", {
      claimType,
      label: CLAIMS[claimType].label,
      playerName: player.name,
      points,
      order: winner?.order || null
    });
    reply?.({ ok: true, points, order: winner?.order || null });
  });

  socket.on("disconnect", () => {
    const room = getRoom(socket.data.roomCode);
    const player = room && getPlayer(room, socket.data.playerId);
    if (player) {
      player.connected = false;
      emitRoom(room);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Tambola app running at http://localhost:${PORT}`);
});
