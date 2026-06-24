const socket = io();

const state = {
  room: null,
  player: null,
  voice: null,
  playerVoiceOn: false
};

document.addEventListener("DOMContentLoaded", () => {
  UI.init();
  bindEvents();
  restoreSession();
  prepareVoice();
});

function bindEvents() {
  UI.elements.hostForm.addEventListener("submit", (event) => {
    event.preventDefault();
    UI.setMessage("hostError", "");
    socket.emit(
      "host:create",
      {
        name: UI.elements.hostName.value,
        mode: UI.elements.gameMode.value,
        ticketCount: Number(UI.elements.ticketCount.value)
      },
      handleJoinReply("hostError")
    );
  });

  UI.elements.joinForm.addEventListener("submit", (event) => {
    event.preventDefault();
    UI.setMessage("joinError", "");
    socket.emit(
      "player:join",
      {
        name: UI.elements.playerName.value,
        roomCode: UI.elements.roomCodeInput.value,
        playerId: getSavedPlayerId(UI.elements.roomCodeInput.value)
      },
      handleJoinReply("joinError")
    );
  });

  UI.elements.startGameBtn.addEventListener("click", () => {
    socket.emit("host:start", {}, showActionMessage("hostActionMessage"));
  });

  UI.elements.nextNumberBtn.addEventListener("click", () => {
    socket.emit("host:nextNumber", {}, showActionMessage("hostActionMessage"));
  });

  UI.elements.endGameBtn.addEventListener("click", () => {
    socket.emit("host:end", {}, showActionMessage("hostActionMessage"));
  });

  UI.elements.playAgainBtn.addEventListener("click", () => {
    socket.emit("host:playAgain", {}, showActionMessage("hostActionMessage"));
  });

  UI.elements.homeBtn.addEventListener("click", () => {
    returnHome();
  });

  UI.elements.hostHomeBtn.addEventListener("click", () => {
    returnHome();
  });

  UI.elements.playerVoiceToggle.addEventListener("change", () => {
    state.playerVoiceOn = UI.elements.playerVoiceToggle.checked;
    localStorage.setItem("tambola:playerVoiceOn", state.playerVoiceOn ? "1" : "0");
  });

  UI.elements.ticketsContainer.addEventListener("click", (event) => {
    const cell = event.target.closest(".ticket-cell");
    if (!cell || cell.disabled || !cell.dataset.number) return;

    socket.emit(
      "ticket:mark",
      {
        ticketId: cell.dataset.ticketId,
        number: Number(cell.dataset.number)
      },
      (reply) => {
        if (!reply?.ok) UI.setMessage("ticketMessage", reply?.message || "Could not mark number.");
        else UI.setMessage("ticketMessage", "");
      }
    );
  });

  UI.elements.claimButtons.addEventListener("click", (event) => {
    const button = event.target.closest(".claim-btn");
    if (!button || button.disabled) return;
    button.disabled = true;

    socket.emit("claim:submit", { claimType: button.dataset.claimType }, (reply) => {
      if (!reply?.ok) {
        UI.setMessage("claimMessage", reply?.message || "Claim rejected.");
      } else {
        const message = reply.points > 0 ? `Claim accepted. You placed #${reply.order}.` : "Claim accepted, but the top 3 spots were already taken.";
        UI.setMessage("claimMessage", message, "success");
      }
    });
  });

  socket.on("room:update", (room) => {
    state.room = room;
    if (state.player) {
      const latestPlayer = room.players.find((player) => player.id === state.player.id);
      if (latestPlayer) state.player = latestPlayer;
    }
    render();
  });

  socket.on("number:called", ({ number, mode }) => {
    if (!state.player || !state.room) return;
    const shouldSpeak = state.player.isHost || state.playerVoiceOn;
    if (shouldSpeak) speakNumber(number);
  });

  socket.on("claim:accepted", ({ label, playerName, order, points }) => {
    const result = points > 0 ? `placed #${order}` : "claimed after the top 3";
    UI.setMessage("claimMessage", `${playerName} ${result} for ${label}.`, "success");
  });

  socket.on("game:ended", () => {
    render();
  });
}

function handleJoinReply(messageId) {
  return (reply) => {
    if (!reply?.ok) {
      UI.setMessage(messageId, reply?.message || "Something went wrong.");
      return;
    }

    state.room = reply.room;
    state.player = reply.player;
    setDefaultPlayerVoice(reply.room);
    saveSession(reply.room.code, reply.player.id);
    render();
  };
}

function showActionMessage(messageId) {
  return (reply) => {
    if (!reply?.ok) UI.setMessage(messageId, reply?.message || "Action failed.");
    else UI.setMessage(messageId, "");
  };
}

function render() {
  UI.renderApp(state.room, state.player);
}

function saveSession(roomCode, playerId) {
  localStorage.setItem("tambola:lastRoom", roomCode);
  localStorage.setItem(`tambola:${roomCode}:playerId`, playerId);
}

function getSavedPlayerId(roomCode) {
  const code = String(roomCode || "").trim().toUpperCase();
  return localStorage.getItem(`tambola:${code}:playerId`);
}

function restoreSession() {
  const roomCode = localStorage.getItem("tambola:lastRoom");
  const playerId = roomCode && getSavedPlayerId(roomCode);
  if (!roomCode || !playerId) return;

  socket.emit("player:reconnect", { roomCode, playerId }, (reply) => {
    if (reply?.ok) {
      state.room = reply.room;
      state.player = reply.player;
      setDefaultPlayerVoice(reply.room);
      render();
    }
  });
}

function returnHome() {
  localStorage.removeItem("tambola:lastRoom");
  window.location.reload();
}

function setDefaultPlayerVoice(room) {
  const saved = localStorage.getItem("tambola:playerVoiceOn");
  state.playerVoiceOn = saved === null ? room.mode === "online" : saved === "1";
  if (UI.elements.playerVoiceToggle) {
    UI.elements.playerVoiceToggle.checked = state.playerVoiceOn;
  }
}

function prepareVoice() {
  if (!("speechSynthesis" in window)) return;

  const selectVoice = () => {
    const voices = window.speechSynthesis.getVoices();
    state.voice =
      voices.find((voice) => voice.name === "Google US English") ||
      voices.find((voice) => voice.name.includes("Google") && voice.lang.startsWith("en-US")) ||
      voices.find((voice) => voice.lang.startsWith("en-US")) ||
      voices.find((voice) => voice.lang.startsWith("en"));
  };

  selectVoice();
  window.speechSynthesis.onvoiceschanged = selectVoice;
}

function speakNumber(number) {
  if (!("speechSynthesis" in window)) return;
  const utterance = new SpeechSynthesisUtterance(`Number ${number}`);
  if (state.voice) utterance.voice = state.voice;
  utterance.rate = 0.9;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
