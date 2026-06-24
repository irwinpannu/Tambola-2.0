const UI = (() => {
  const claimLabels = {
    top: "Top Line",
    middle: "Middle Line",
    bottom: "Bottom Line",
    ticket: "Ticket",
    fullHouse: "Full House"
  };

  const elements = {};

  function init() {
    [
      "entryScreen",
      "gameScreen",
      "hostForm",
      "joinForm",
      "hostName",
      "playerName",
      "roomCodeInput",
      "gameMode",
      "ticketCount",
      "hostError",
      "joinError",
      "roomCode",
      "roleBadge",
      "modeBadge",
      "stateBadge",
      "hostHomeBtn",
      "lobbyPanel",
      "playersList",
      "hostLobbyControls",
      "startGameBtn",
      "hostActionMessage",
      "playPanel",
      "currentNumber",
      "numberCaption",
      "hostControls",
      "nextNumberBtn",
      "endGameBtn",
      "playerVoicePanel",
      "playerVoiceToggle",
      "calledCount",
      "calledNumbers",
      "playerNameLabel",
      "ticketsContainer",
      "ticketMessage",
      "claimPanel",
      "claimButtons",
      "claimMessage",
      "liveWinners",
      "finalScreen",
      "finalResults",
      "playAgainBtn",
      "homeBtn"
    ].forEach((id) => {
      elements[id] = document.getElementById(id);
    });
  }

  function setText(id, value) {
    if (elements[id]) elements[id].textContent = value || "";
  }

  function show(id, visible) {
    elements[id]?.classList.toggle("hidden", !visible);
  }

  function setMessage(id, message, tone = "error") {
    const element = elements[id];
    if (!element) return;
    element.textContent = message || "";
    element.dataset.tone = tone;
  }

  function renderApp(room, player) {
    if (!room || !player) return;

    show("entryScreen", false);
    show("gameScreen", true);
    elements.gameScreen.classList.toggle("host-view", player.isHost);
    elements.gameScreen.classList.toggle("player-view", !player.isHost);
    setText("roomCode", room.code);
    setText("roleBadge", player.isHost ? "Host" : "Player");
    setText("modeBadge", room.mode === "silent" ? "Silent" : "Online");
    setText("stateBadge", room.gameState);
    setText("playerNameLabel", player.name);

    const inLobby = room.gameState === "lobby";
    const inPlay = room.gameState === "started";
    const ended = room.gameState === "ended";

    show("lobbyPanel", inLobby);
    show("hostLobbyControls", inLobby && player.isHost);
    show("playPanel", inPlay);
    show("hostControls", inPlay && player.isHost);
    show("hostHomeBtn", player.isHost && !ended);
    show("playerVoicePanel", inPlay && !player.isHost);
    show("claimPanel", !player.isHost);
    show("finalScreen", ended);
    show("playAgainBtn", ended && player.isHost);

    renderPlayers(room.players || []);
    renderCurrentNumber(room.currentNumber);
    renderCalledNumbers(room.calledNumbers || []);
    renderTickets(player, room.calledNumbers || []);
    renderClaimButtons(player, room);
    renderLiveWinners(room.winners || {}, room);

    if (ended) {
      renderFinalResults(room);
    }
  }

  function renderPlayers(players) {
    elements.playersList.innerHTML = "";
    players.forEach((player) => {
      const row = document.createElement("div");
      row.className = "player-row";
      row.innerHTML = `
        <span>${escapeHtml(player.name)}${player.isHost ? " - Host" : ""}</span>
        <strong>${player.connected ? "Online" : "Away"}</strong>
      `;
      elements.playersList.appendChild(row);
    });
  }

  function renderCurrentNumber(number) {
    setText("currentNumber", number ? String(number) : "--");
    setText("numberCaption", number ? `Number ${number} was called` : "Waiting for next call");
  }

  function renderCalledNumbers(calledNumbers) {
    const called = new Set(calledNumbers);
    elements.calledNumbers.innerHTML = "";
    setText("calledCount", `${calledNumbers.length} / 90`);

    for (let number = 1; number <= 90; number += 1) {
      const chip = document.createElement("span");
      chip.className = called.has(number) ? "number-chip called" : "number-chip";
      chip.textContent = number;
      elements.calledNumbers.appendChild(chip);
    }
  }

  function renderTickets(player, calledNumbers) {
    const called = new Set(calledNumbers);
    elements.ticketsContainer.innerHTML = "";

    if (player.isHost) {
      elements.ticketsContainer.innerHTML = `<div class="host-note">Host view keeps tickets hidden so the board stays easy to call.</div>`;
      return;
    }

    player.tickets.forEach((ticket, ticketIndex) => {
      const ticketCard = document.createElement("article");
      ticketCard.className = "ticket-card";
      const title = document.createElement("h3");
      title.textContent = `Ticket ${ticketIndex + 1}`;
      ticketCard.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "ticket-grid";
      const marks = new Set(player.marks[ticket.id] || []);

      ticket.grid.flat().forEach((number) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.className = "ticket-cell";
        if (number === null) {
          cell.classList.add("blank");
          cell.disabled = true;
          cell.textContent = "";
        } else {
          cell.textContent = number;
          cell.dataset.ticketId = ticket.id;
          cell.dataset.number = number;
          cell.disabled = !called.has(number);
          cell.classList.toggle("called", called.has(number));
          cell.classList.toggle("marked", marks.has(number));
        }
        grid.appendChild(cell);
      });

      ticketCard.appendChild(grid);
      elements.ticketsContainer.appendChild(ticketCard);
    });
  }

  function renderClaimButtons(player, room) {
    elements.claimButtons.innerHTML = "";
    Object.entries(claimLabels).forEach(([claimType, label]) => {
      if (claimType === "ticket" && room.ticketCount !== 3) return;
      const state = player.claims?.[claimType] || { used: false, eligible: false };
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.claimType = claimType;
      button.className = "claim-btn";
      button.disabled = state.used || !state.eligible;
      button.classList.toggle("eligible", state.eligible && !state.used);
      button.classList.toggle("used", state.used);
      elements.claimButtons.appendChild(button);
    });
  }

  function renderLiveWinners(winners, room) {
    elements.liveWinners.innerHTML = "";
    Object.entries(claimLabels).forEach(([claimType, label]) => {
      if (claimType === "ticket" && room.ticketCount !== 3) return;
      const block = document.createElement("div");
      block.className = "winner-group";
      const names = winners[claimType] || [];
      block.innerHTML = `
        <h3>${label}</h3>
        <p>${names.length ? names.slice(0, 3).map((winner) => escapeHtml(winner.name)).join(", ") : "No winners yet"}</p>
      `;
      elements.liveWinners.appendChild(block);
    });
  }

  function renderFinalResults(room) {
    elements.finalResults.innerHTML = "";
    const priority = room.ticketCount === 3 ? ["fullHouse", "ticket", "top", "middle", "bottom"] : ["fullHouse", "top", "middle", "bottom"];

    priority.forEach((claimType) => {
      elements.finalResults.appendChild(makePodium(claimLabels[claimType], room.winners?.[claimType] || [], "name"));
    });

    elements.finalResults.appendChild(makePodium("Overall Top 3", room.scoreBoard?.slice(0, 3) || [], "name", true));
  }

  function makePodium(title, rows, nameKey, showScore = false) {
    const podium = document.createElement("section");
    podium.className = "podium";
    const list = rows.slice(0, 3);
    podium.innerHTML = `<h3>${title}</h3>`;

    const lanes = document.createElement("div");
    lanes.className = "podium-lanes";

    if (!list.length) {
      lanes.innerHTML = `<p class="empty-result">No winner</p>`;
    } else {
      list.forEach((row, index) => {
        const lane = document.createElement("div");
        lane.className = `podium-place place-${index + 1}`;
        lane.innerHTML = `
          <span>${index + 1}</span>
          <strong>${escapeHtml(row[nameKey])}</strong>
          <small>${showScore ? `${row.score} pts` : `${row.points || ""} pts`}</small>
        `;
        lanes.appendChild(lane);
      });
    }

    podium.appendChild(lanes);
    return podium;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  return {
    elements,
    init,
    show,
    setMessage,
    renderApp
  };
})();

