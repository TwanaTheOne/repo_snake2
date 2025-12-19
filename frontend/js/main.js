
// main.js (COMBINED: Snake + Chat)
// Sources: pasted snake main + pasted chat main :contentReference[oaicite:2]{index=2} :contentReference[oaicite:3]{index=3}

import { Game } from "./core/Game.js";
import { Snake } from "./core/Snake.js";
import { Scoreboard } from "./core/Scoreboard.js";
import { MultiplayerApi } from "./multiplayer/MultiplayerApi.js";

import { ChatClient } from "./chatClient.js";
import { ChatStorage } from "./storage.js";
import { ChatUI } from "./chatUI.js";

console.log("COMBINED MAIN ÄR LADDAD!");

// -------------------------
// Helpers
// -------------------------
function el(id) {
  return document.getElementById(id);
}

function hasSnakeUI() {
  return !!(el("gameCanvas") && el("startLocalBtn") && el("statusText"));
}

function hasChatUI() {
  // ChatUI bygger normalt egen DOM, men i din setup brukar det finnas chat-relaterad markup.
  // Vi försöker initiera ändå, men om ChatUI/DOM saknas kan det kasta — då fångar vi det.
  return true;
}

// -------------------------
// SNAKE APP
// -------------------------
function initSnakeApp() {
  // ----- DOM -----
  const canvas = el("gameCanvas");
  if (!canvas) return; // Ingen snake-UI på sidan
  const ctx = canvas.getContext("2d");

  const startLocalBtn = el("startLocalBtn");
  const hostBtn = el("hostBtn");
  const joinBtn = el("joinBtn");
  const sessionIdInput = el("sessionIdInput");
  const statusText = el("statusText");
  const scoreboardList = el("scoreboardList");
  const timerEl = el("timer");

  // ----- SPEL -----
  const game = new Game({ ctx, cellSize: 20, tickMs: 120 });
  const scoreboard = new Scoreboard();

  // ----- MATCH-TIMER -----
  const MATCH_TIME = 60;
  let matchTimerId = null;
  let timeLeft = MATCH_TIME;

  let isHost = false;
  let localSnake = null;
  let localClientId = null;
  let isMultiplayer = false;

  const WS_URL =
    location.hostname === "localhost"
      ? "ws://localhost:8080"
      : "wss://mpai.se/net";

  const api = new MultiplayerApi(WS_URL);

  // ---------- SCOREBOARD ----------
  function renderScoreboard() {
    if (!scoreboardList) return;

    scoreboardList.innerHTML = "";

    if (scoreboard.entries.length === 0) {
      const li = document.createElement("li");
      li.textContent = "Inga resultat ännu.";
      scoreboardList.appendChild(li);
      return;
    }

    scoreboard.entries.forEach((entry, index) => {
      const li = document.createElement("li");
      // OBS: i din originalkod användes textContent med HTML-taggar.
      // Här gör vi den “riktigt” (utan HTML i textContent).
      li.innerHTML = `<strong>${index + 1}.</strong> ${entry.name} – ${entry.score} poäng`;
      scoreboardList.appendChild(li);
    });
  }
  renderScoreboard();

  game.onSnakeDeath = (snake) => {
    if (snake.score > 0) {
      scoreboard.add(snake.name, snake.score);
      renderScoreboard();
    }
  };

  // ----- TIMER & MATCHLOGIK -----
  function updateTimerUI() {
    if (timerEl) timerEl.textContent = `Tid kvar: ${timeLeft}s`;
  }

  function computeMatchResult() {
    if (game.snakes.length === 0) return null;

    const sorted = [...game.snakes].sort(
      (a, b) => b.segments.length - a.segments.length
    );

    const bestLen = sorted[0].segments.length;
    const tied = sorted.filter((s) => s.segments.length === bestLen);

    if (tied.length > 1) {
      return { type: "tie", snakes: tied, length: bestLen };
    }
    return { type: "winner", snake: sorted[0], length: bestLen };
  }

  function endMatch() {
    if (matchTimerId) {
      clearInterval(matchTimerId);
      matchTimerId = null;
    }
    game.stop();

    const result = computeMatchResult();
    let message = "Matchen är över!\n";

    if (!result) {
      message += "(Ingen orm i spelet.)";
    } else if (result.type === "tie") {
      const names = result.snakes.map((s) => s.name).join(", ");
      message += `Oavgjort mellan: ${names} (längd: ${result.length})`;
    } else {
      message += `Vinnare: ${result.snake.name} (längd: ${result.length})`;
      scoreboard.add(result.snake.name, result.snake.score);
      renderScoreboard();
    }

    alert(message);
    if (statusText) statusText.textContent = "Matchen är över";
  }

  function startMatch() {
    if (matchTimerId) clearInterval(matchTimerId);

    timeLeft = MATCH_TIME;
    updateTimerUI();

    game.start();

    matchTimerId = setInterval(() => {
      timeLeft--;
      updateTimerUI();

      if (timeLeft <= 0) {
        if (isMultiplayer && isHost) {
          api.game({ type: "matchEnd" });
        }
        endMatch();
      }
    }, 1000);
  }

  // ---------- HJÄLPFUNKTION FÖR ORMAR ----------
  const COLORS = ["#4CAF50", "#2196F3", "#FFEB3B", "#E91E63", "#FF9800"];
  const snakesByClientId = new Map();

  function createSnakeForClient(clientId, name) {
    const index = snakesByClientId.size;
    const color = COLORS[index % COLORS.length];
    const startX = 5 + index * 3;
    const startY = 5;

    const snake = new Snake(startX, startY, color, name || `Player ${index + 1}`);
    snakesByClientId.set(clientId, snake);
    game.snakes.push(snake);
    return snake;
  }

  // ---------- LOKAL SINGLEPLAYER ----------
  if (startLocalBtn) {
    startLocalBtn.addEventListener("click", () => {
      console.log("Starta lokal match klickad");

      isMultiplayer = false;
      isHost = false;
      localClientId = null;
      snakesByClientId.clear();

      const maxX = game.board.width;
      const maxY = game.board.height;

      const snake1 = new Snake(3, maxY - 4, "#4CAF50", "Local Player 1");
      const snake2 = new Snake(maxX - 4, 3, "#2196F3", "Local Player 2");
      game.snakes = [snake1, snake2];
      localSnake = snake1;

      startMatch();
      if (statusText) statusText.textContent = "Lokal match med två ormar";
    });
  }

  // ---------- TANGENTBORD ----------
  document.addEventListener("keydown", (e) => {
    if (!localSnake) return;

    let dir = null;
    if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") dir = "up";
    if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") dir = "down";
    if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") dir = "left";
    if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") dir = "right";
    if (!dir) return;

    localSnake.setDirection(dir);

    if (isMultiplayer) {
      api.game({ type: "direction", dir });
    }
  });

  // ---------- MULTIPLAYER HOST ----------
  if (hostBtn) {
    hostBtn.addEventListener("click", async () => {
      try {
        isMultiplayer = true;
        isHost = true;

        const result = await api.host(); // { session, clientId }

        if (sessionIdInput) sessionIdInput.value = result.session;
        if (statusText) {
          statusText.textContent = `Hostar session: ${result.session} (clientId: ${result.clientId})`;
        }

        game.snakes = [];
        snakesByClientId.clear();
        localClientId = result.clientId;
        localSnake = createSnakeForClient(localClientId, "Host");

        startMatch();
      } catch (err) {
        console.error(err);
        if (statusText) statusText.textContent = "Kunde inte hosta session";
      }
    });
  }

  // ---------- MULTIPLAYER JOIN ----------
  if (joinBtn) {
    joinBtn.addEventListener("click", async () => {
      const sessionId = sessionIdInput ? sessionIdInput.value.trim() : "";
      if (!sessionId) {
        alert("Skriv in ett Session ID först");
        return;
      }

      try {
        isMultiplayer = true;
        isHost = false;

        const result = await api.join(sessionId, { name: "Guest" });
        if (statusText) {
          statusText.textContent = `Joined session: ${result.session} (clientId: ${result.clientId})`;
        }

        game.snakes = [];
        snakesByClientId.clear();
        localClientId = result.clientId;
        localSnake = createSnakeForClient(localClientId, "Player");

        startMatch();
      } catch (err) {
        console.error(err);
        if (statusText) statusText.textContent = "Kunde inte ansluta session";
      }
    });
  }

  // ---------- LYSSNA PÅ EVENTS FRÅN SERVERN ----------
  api.listen((event, messageId, clientId, data) => {
    console.log("SNAKE EVENT:", event, messageId, clientId, data);

    if (event === "joined") {
      if (!snakesByClientId.has(clientId)) {
        const name = data && data.name ? data.name : `Player ${snakesByClientId.size + 1}`;
        const snake = createSnakeForClient(clientId, name);

        if (clientId === localClientId) {
          localSnake = snake;
        }
      }
    }

    if (event === "game" && data && data.type === "direction") {
      const snake = snakesByClientId.get(clientId);
      if (!snake) return;
      snake.setDirection(data.dir);
    }

    if (event === "game" && data && data.type === "matchEnd") {
      console.log("MatchEnd mottaget från host!");
      game.stop();
      endMatch();
    }
  });

  console.log("Snake init klar.");
}

// -------------------------
// CHAT APP
// -------------------------
function initChatApp() {
  try {
    const SERVER_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/net`;

    const ui = new ChatUI();
    const client = new ChatClient(SERVER_URL);

    // Initiera UI från localStorage
    (function initFromStorage() {
      const userName = ChatStorage.getUserName();
      if (userName) {
        ui.setUserName(userName);
      }

      ui.renderSessionList(ChatStorage.getAllSessions());
    })();

    ui.onSessionClick = async (sessionId) => {
      const userName = ChatStorage.getUserName();
      if (!userName) {
        ui.setStatus("Ange ett användarnamn innan du ansluter.");
        return;
      }

      ui.setStatus(`Försöker ansluta till session ${sessionId}...`);

      try {
        const result = await client.join(sessionId, userName);

        ChatStorage.setLastSession(sessionId);

        ui.setConnectedState({
          connected: true,
          role: "client",
          sessionId: sessionId,
          roomName: result.roomName || null,
        });

        ui.clearMessages();

        const history = ChatStorage.loadMessages(sessionId);
        history.forEach((m) => ui.addMessage(m));

        ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);
        ui.setStatus("Ansluten.");
      } catch (err) {
        ui.setStatus("Kunde inte ansluta. Session kan vara stängd.");
      }
    };

    // Koppla UI-händelser
    ui.setHandlers({
      onHost: async (userName, roomName) => {
        try {
          ChatStorage.setUserName(userName);
          ui.setStatus("Skapar nytt rum...");
          const result = await client.host(userName, roomName);

          ChatStorage.updateSessionMeta(result.sessionId, {
            name: result.roomName || null,
          });
          ChatStorage.setLastSession(result.sessionId);

          ui.setConnectedState({
            connected: true,
            role: "host",
            sessionId: result.sessionId,
            roomName: result.roomName || null,
          });

          ui.clearMessages();
          ui.setStatus(`Hostar rum med kod: ${result.sessionId}`);

          ui.renderSessionList(ChatStorage.getAllSessions());
          ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);

          const history = ChatStorage.loadMessages(result.sessionId);
          history.forEach((m) => ui.addMessage(m));
        } catch (err) {
          ui.setStatus(String(err));
        }
      },

      onJoin: async (userName, roomCode) => {
        try {
          ChatStorage.setUserName(userName);
          ui.setStatus("Ansluter till rum...");
          const result = await client.join(roomCode, userName);

          ChatStorage.updateSessionMeta(result.sessionId, {
            name: result.roomName || null,
          });
          ChatStorage.setLastSession(result.sessionId);

          ui.setConnectedState({
            connected: true,
            role: "client",
            sessionId: result.sessionId,
            roomName: result.roomName || null,
          });

          ui.clearMessages();
          ui.setStatus(`Ansluten till rum ${result.sessionId}`);

          ui.renderSessionList(ChatStorage.getAllSessions());
          ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);

          const history = ChatStorage.loadMessages(result.sessionId);
          history.forEach((m) => ui.addMessage(m));
        } catch (err) {
          ui.setStatus(String(err));
        }
      },

      onLeave: () => {
        client.leave();
        ui.setConnectedState({
          connected: false,
          role: null,
          sessionId: null,
          roomName: null,
        });
        ui.setStatus("Lämnade rummet.");
      },

      onSend: (text) => {
        try {
          const userName = ChatStorage.getUserName() || "Du";
          const msg = {
            id: Date.now().toString(),
            text,
            from: userName,
            timestamp: Date.now(),
            mine: true,
          };

          ui.addMessage(msg);

          if (client.sessionId) {
            ChatStorage.saveMessage(client.sessionId, msg);
          }

          client.sendMessage(text);
        } catch (err) {
          ui.setStatus(String(err));
        }
      },
    });

    // Lyssna på inkommande meddelanden och events
    client.onMessage((msg) => {
      if (msg.mine) return;

      ui.addMessage(msg);
      if (client.sessionId) {
        ChatStorage.saveMessage(client.sessionId, msg);
        ChatStorage.setLastSession(client.sessionId);
        ui.renderSessionList(ChatStorage.getAllSessions());
      }
    });

    client.onSystemEvent((event, clientId, data) => {
      if (event === "online") {
        ui.addOnlineNotification(data.name || "Okänd");
        ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);
      } else if (event === "offline") {
        ui.addSystemMessage(`En klient lämnade: ${clientId || "okänt id"}.`);
        ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);
      } else if (event === "closed") {
        ui.addSystemMessage("Sessionen stängdes av hosten.");
        ui.setConnectedState({
          connected: false,
          role: null,
          sessionId: null,
          roomName: null,
        });
        ui.setStatus("Sessionen stängdes.");
      }
    });

    console.log("Chat init klar.");
  } catch (e) {
    // Om ChatUI saknas på sidan eller kastar vid init, krascha inte hela appen.
    console.warn("Chat init hoppades över:", e);
  }
}

// -------------------------
// Boot
// -------------------------
if (hasSnakeUI()) {
  initSnakeApp();
} else {
  console.log("Snake UI hittades inte – skippar snake init.");
}

if (hasChatUI()) {
  initChatApp();
}



















/*import { ChatClient } from "./chatClient.js";
import { ChatStorage } from "./storage.js";
import { ChatUI } from "./chatUI.js";

const SERVER_URL = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/net`;

const ui = new ChatUI();
const client = new ChatClient(SERVER_URL);

// Initiera UI från localStorage
(function initFromStorage() {
	const userName = ChatStorage.getUserName();
	if (userName) {
		ui.setUserName(userName);
	}

	const meta = ChatStorage.getLastSessionMeta();
	ui.renderSessionList(ChatStorage.getAllSessions());
})();

ui.onSessionClick = async (sessionId) => {
	const userName = ChatStorage.getUserName();
	if (!userName) {
		ui.setStatus("Ange ett användarnamn innan du ansluter.");
		return;
	}

	ui.setStatus(`Försöker ansluta till session ${sessionId}...`);

	try {
		const result = await client.join(sessionId, userName);

		ChatStorage.setLastSession(sessionId);

		ui.setConnectedState({
			connected: true,
			role: "client",
			sessionId: sessionId,
			roomName: result.roomName || null
		});

		ui.clearMessages();

		const history = ChatStorage.loadMessages(sessionId);
		history.forEach(m => ui.addMessage(m));

		ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);
		ui.setStatus("Ansluten.");
	} catch (err) {
		ui.setStatus("Kunde inte ansluta. Session kan vara stängd.");
	}
};

// Koppla UI-händelser
ui.setHandlers({
	onHost: async (userName, roomName) => {
		try {
			ChatStorage.setUserName(userName);
			ui.setStatus("Skapar nytt rum...");
			const result = await client.host(userName, roomName);

			ChatStorage.updateSessionMeta(result.sessionId, {
				name: result.roomName || null
			});
			ChatStorage.setLastSession(result.sessionId);

			ui.setConnectedState({
				connected: true,
				role: "host",
				sessionId: result.sessionId,
				roomName: result.roomName || null
			});
			ui.clearMessages();
			ui.setStatus(`Hostar rum med kod: ${result.sessionId}`);

			const meta = ChatStorage.getLastSessionMeta();
			ui.renderSessionList(ChatStorage.getAllSessions());

			ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);

			// Ladda ev. lokal historik för samma session (om du hostat tidigare)
			const history = ChatStorage.loadMessages(result.sessionId);
			history.forEach((m) => ui.addMessage(m));
		} catch (err) {
			ui.setStatus(String(err));
		}
	},

	onJoin: async (userName, roomCode) => {
		try {
			ChatStorage.setUserName(userName);
			ui.setStatus("Ansluter till rum...");
			const result = await client.join(roomCode, userName);

			ChatStorage.updateSessionMeta(result.sessionId, {
				name: result.roomName || null
			});
			ChatStorage.setLastSession(result.sessionId);

			ui.setConnectedState({
				connected: true,
				role: "client",
				sessionId: result.sessionId,
				roomName: result.roomName || null
			});
			ui.clearMessages();
			ui.setStatus(`Ansluten till rum ${result.sessionId}`);

			const meta = ChatStorage.getLastSessionMeta();
			ui.renderSessionList(ChatStorage.getAllSessions());

			ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);

			// Ladda lokal historik (per webbläsare)
			const history = ChatStorage.loadMessages(result.sessionId);
			history.forEach((m) => ui.addMessage(m));
		} catch (err) {
			ui.setStatus(String(err));
		}
	},

	onLeave: () => {
		client.leave();
		ui.setConnectedState({
			connected: false,
			role: null,
			sessionId: null,
			roomName: null
		});
		ui.setStatus("Lämnade rummet.");
	},

	onSend: (text) => {
		try {
			const userName = ChatStorage.getUserName() || "Du";
			const msg = {
				id: Date.now().toString(),
				text,
				from: userName,
				timestamp: Date.now(),
				mine: true
			};

			ui.addMessage(msg);

			if (client.sessionId) {
				ChatStorage.saveMessage(client.sessionId, msg);
			}

			client.sendMessage(text);
		} catch (err) {
			ui.setStatus(String(err));
		}
	}
});

// Lyssna på inkommande meddelanden och events
client.onMessage((msg) => {
	// Undvik dubblett av egna meddelanden (vi ritar dem direkt lokalt i onSend)
	if (msg.mine) {
		return;
	}

	ui.addMessage(msg);
	if (client.sessionId) {
		ChatStorage.saveMessage(client.sessionId, msg);
		ChatStorage.setLastSession(client.sessionId);
		const meta = ChatStorage.getLastSessionMeta();
		ui.renderSessionList(ChatStorage.getAllSessions());
	}
});

client.onSystemEvent((event, clientId, data) => {
	if (event === "online") {
		ui.addOnlineNotification(data.name || "Okänd");
		ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);
	} else if (event === "offline") {
		ui.addSystemMessage(`En klient lämnade: ${clientId || "okänt id"}.`);
		ui.updateOnlineList([...client.onlineUsers.values()], client.clientId);
	} else if (event === "closed") {
		ui.addSystemMessage("Sessionen stängdes av hosten.");
		ui.setConnectedState({
			connected: false,
			role: null,
			sessionId: null,
			roomName: null
		});
	}
});
*/








/*   ................................................................................................................................
// js/main.js
import { Game } from "./core/Game.js";
import { Snake } from "./core/Snake.js";
import { Scoreboard } from "./core/Scoreboard.js";
import { MultiplayerManager } from "./multiplayer/MultiplayerManager.js";

console.log("MAIN ÄR LADDAD!");

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const statusText = document.getElementById("statusText");
const startLocalBtn = document.getElementById("startLocalBtn");
const scoreboardList = document.getElementById("scoreboardList");

const hostBtn = document.getElementById("hostBtn");
const joinBtn = document.getElementById("joinBtn");
const sessionIdInput = document.getElementById("sessionIdInput");

const game = new Game({ ctx, cellSize: 20, tickMs: 120 });
const scoreboard = new Scoreboard();
const mp = new MultiplayerManager("ws://localhost:8080");

// kartlägger clientId -> Snake
const snakesByClientId = new Map();
let localClientId = null;
let localSnake = null;
let isMultiplayer = false;

// ---------- SCOREBOARD ----------
function renderScoreboard() {
  scoreboardList.innerHTML = "";
  scoreboard.entries.forEach(entry => {
	const li = document.createElement("li");
	li.textContent = `${entry.name}: ${entry.score}`;
	scoreboardList.appendChild(li);
  });
}
renderScoreboard();

// spara resultat när ormen dör
game.onSnakeDeath = (snake) => {
  if (snake.score > 0) {
	scoreboard.add(snake.name, snake.score);
	renderScoreboard();
  }
};

// ---------- HJÄLPFUNKTIONER FÖR ORMAR ----------
const COLORS = ["#4CAF50", "#2196F3", "#FFEB3B", "#E91E63", "#FF9800"];

function createSnakeForClient(clientId, name) {
  const index = snakesByClientId.size;
  const color = COLORS[index % COLORS.length];
  const startX = 5 + index * 3;
  const startY = 5;

  const snake = new Snake(startX, startY, color, name || `Player ${index + 1}`);
  snakesByClientId.set(clientId, snake);
  game.snakes.push(snake);

  return snake;
}

// ---------- LOKAL SINGLEPLAYER ----------
startLocalBtn.addEventListener("click", () => {
  isMultiplayer = false;

  const snake = new Snake(5, 5, "#4CAF50", "Local Player");
  game.snakes = [snake];
  localSnake = snake;

  game.start();
  statusText.textContent = "Lokal match startad!";
});

// tangentbord: styr localSnake, och skicka till andra om vi kör multiplayer
document.addEventListener("keydown", (e) => {
  if (!localSnake) return;

  let dir = null;
  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") dir = "up";
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") dir = "down";
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") dir = "left";
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") dir = "right";

  if (!dir) return;

  localSnake.setDirection(dir);

  if (isMultiplayer) {
	mp.sendGameData({
	  type: "direction",
	  dir
	});
  }
});

// ---------- MULTIPLAYER ----------
hostBtn.addEventListener("click", async () => {
  try {
	isMultiplayer = true;
	await mp.host();
	statusText.textContent = "Hostar session (vänta på spelare...)";

	// Vi vet inte exakt hur lärarens API ger sessionId,
	// så vi lämnar fältet tomt tills ett ev. joined-data ger oss det.
  } catch (err) {
	console.error(err);
	statusText.textContent = "Kunde inte hosta session";
  }
});

joinBtn.addEventListener("click", async () => {
  const sessionId = sessionIdInput.value.trim();
  if (!sessionId) {
	alert("Skriv in ett Session ID först");
	return;
  }

  try {
	isMultiplayer = true;
	await mp.join(sessionId, { name: "Guest" });
	statusText.textContent = `Joined session: ${sessionId}`;
  } catch (err) {
	console.error(err);
	statusText.textContent = "Kunde inte ansluta session";
  }
});

// När någon ansluter: skapa orm åt den spelaren
// Detta triggas både för oss själva och för andra klienter.
mp.onJoined(({ clientId, data }) => {
  console.log("JOINED:", clientId, data);

  // Skapa orm för denna client
  const name = (data && data.name) || `Player ${snakesByClientId.size + 1}`;
  const snake = createSnakeForClient(clientId, name);

  // Om vi ännu inte har bestämt vår localClientId:
  // anta att första joined efter att vi host/joinat är vi själva.
  if (localClientId === null && data && data.isSelf) {
	localClientId = clientId;
	localSnake = snake;
  }

  // Om api:n inte skickar isSelf-flagga kan du istället göra:
  // if (localClientId === null) { localClientId = clientId; localSnake = snake; }
});

// När spel-data kommer in: uppdatera ormens riktning
mp.onGame(({ clientId, data }) => {
  if (!data || data.type !== "direction") return;
  const snake = snakesByClientId.get(clientId);
  if (!snake) return;
  snake.setDirection(data.dir);
});...................................................................................................................................
*/ 




/*
// js/main.js
import { Game } from "./core/Game.js";
import { Snake } from "./core/Snake.js";
import { Scoreboard } from "./core/Scoreboard.js";
import { MultiplayerApi } from "./multiplayer/MultiplayerApi.js";

console.log("MAIN ÄR LADDAD!");

// ----- DOM -----
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const startLocalBtn = document.getElementById("startLocalBtn");
const hostBtn = document.getElementById("hostBtn");
const joinBtn = document.getElementById("joinBtn");
const sessionIdInput = document.getElementById("sessionIdInput");
const statusText = document.getElementById("statusText");
const scoreboardList = document.getElementById("scoreboardList");
const timerEl = document.getElementById("timer");


// ----- SPEL -----
const game = new Game({ ctx, cellSize: 20, tickMs: 120 });
const scoreboard = new Scoreboard();





// ----- MATCH-TIMER -----
const MATCH_TIME = 60;
let matchTimerId = null;
let timeLeft = MATCH_TIME;

let isHost = false;


// clientId -> Snake (för multiplayer)
//const snakesByClientId = new Map();
let localSnake = null;
let localClientId = null;
let isMultiplayer = false;

const WS_URL = location.hostname === "localhost"
  ? "ws://localhost:8080"
  : "wss://mpai.se/net";


// ----- MULTIPLAYER API -----
const api = new MultiplayerApi(WS_URL);


// ---------- SCOREBOARD ----------
function renderScoreboard() {
  scoreboardList.innerHTML = "";

  if (scoreboard.entries.length === 0) {
	const li = document.createElement("li");
	li.textContent = "Inga resultat ännu.";
	scoreboardList.appendChild(li);
	return;
  }


  scoreboard.entries.forEach((entry, index) => {
	const li = document.createElement("li");
	li.textContent = `<strong>${index + 1}.</strong> ${entry.name} – ${entry.score} poäng`;
	scoreboardList.appendChild(li);
  });
}
renderScoreboard();

// spara poäng när en orm dör
game.onSnakeDeath = (snake) => {
  if (snake.score > 0) {
	scoreboard.add(snake.name, snake.score);
	renderScoreboard();
  }
};


// ----- TIMER & MATCHLOGIK -----
function updateTimerUI() {
  if (timerEl) {
	timerEl.textContent = `Tid kvar: ${timeLeft}s`;
  }
}




function computeMatchResult() {
  if (game.snakes.length === 0) return null;

  const sorted = [...game.snakes].sort(
	(a, b) => b.segments.length - a.segments.length
  );

  const bestLen = sorted[0].segments.length;
  const tied = sorted.filter((s) => s.segments.length === bestLen);

  if (tied.length > 1) {
	return { type: "tie", snakes: tied, length: bestLen };
  }
  return { type: "winner", snake: sorted[0], length: bestLen };
}

function endMatch() {
  if (matchTimerId) {
	clearInterval(matchTimerId);
	matchTimerId = null;
  }
  game.stop();

  const result = computeMatchResult();
  let message = "Matchen är över!\n";

  if (!result) {
	message += "(Ingen orm i spelet.)";
  } else if (result.type === "tie") {
	const names = result.snakes.map((s) => s.name).join(", ");
	message += `Oavgjort mellan: ${names} (längd: ${result.length})`;
  } else {
	message += `Vinnare: ${result.snake.name} (längd: ${result.length})`;

	// spara vinnaren i scoreboard också
	scoreboard.add(result.snake.name, result.snake.score);
	renderScoreboard();
  }

  alert(message);
  statusText.textContent = "Matchen är över";
}

function startMatch() {
  if (matchTimerId) clearInterval(matchTimerId);

  timeLeft = MATCH_TIME;
  updateTimerUI();

  game.start();

  matchTimerId = setInterval(() => {
	timeLeft--;
	updateTimerUI();

	if (timeLeft <= 0) {
	  // host skickar matchEnd till alla
	  if (isMultiplayer && isHost) {
		api.game({ type: "matchEnd" });
	  }
	  endMatch();
	}
  }, 1000);
}

// ---------- HJÄLPFUNKTION FÖR ORMAR ----------
const COLORS = ["#4CAF50", "#2196F3", "#FFEB3B", "#E91E63", "#FF9800"];

const snakesByClientId = new Map();

function createSnakeForClient(clientId, name) {
  const index = snakesByClientId.size;
  const color = COLORS[index % COLORS.length];
  const startX = 5 + index * 3;
  const startY = 5;

  const snake = new Snake(startX, startY, color, name || `Player ${index + 1}`);
  snakesByClientId.set(clientId, snake);
  game.snakes.push(snake);
  return snake;
}

// ---------- LOKAL SINGLEPLAYER ----------
startLocalBtn.addEventListener("click", () => {
  console.log("Starta lokal match klickad");

  isMultiplayer = false;
	isHost = false;
  localClientId = null;
  snakesByClientId.clear();

  const maxX = game.board.width;
  const maxY = game.board.height;

  // bara en lokal orm
  const snake1 = new Snake(3, maxY - 4, "#4CAF50", "Local Player 1");
  const snake2 = new Snake(maxX - 4, 3, "#2196F3", "Local Player 2");
  //const snake1 = new Snake(5, 5, "#4CAF50", "Local Player1");
  //const snake2 = new Snake(15, 10, "#2196F3", "Local Player 2");
  game.snakes = [snake1, snake2];
  localSnake = snake1;

  startMatch();
  statusText.textContent = "Lokal match med två ormar";
});

// ---------- TANGENTBORD ----------
document.addEventListener("keydown", (e) => {
  if (!localSnake) return;

  let dir = null;
  if (e.key === "ArrowUp" || e.key === "w" || e.key === "W") dir = "up";
  if (e.key === "ArrowDown" || e.key === "s" || e.key === "S") dir = "down";
  if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") dir = "left";
  if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") dir = "right";
  if (!dir) return;

  localSnake.setDirection(dir);

  if (isMultiplayer) {
	api.game({ type: "direction", dir });
  }
});

// ---------- MULTIPLAYER HOST ----------
hostBtn.addEventListener("click", async () => {
  try {
	isMultiplayer = true;
	isHost = true;
	const result = await api.host(); // { session, clientId }

	sessionIdInput.value = result.session;
	statusText.textContent = `Hostar session: ${result.session} (clientId: ${result.clientId})`;

	// rensa gamla ormar och skapa en för hosten
	game.snakes = [];
	snakesByClientId.clear();
	localClientId = result.clientId;
	localSnake = createSnakeForClient(localClientId, "Host");

	startMatch();
  } catch (err) {
	console.error(err);
	statusText.textContent = "Kunde inte hosta session";
  }
});

// ---------- MULTIPLAYER JOIN ----------
joinBtn.addEventListener("click", async () => {
  const sessionId = sessionIdInput.value.trim();
  if (!sessionId) {
	alert("Skriv in ett Session ID först");
	return;
  }

  try {
	isMultiplayer = true;
	 isHost = false; 
	const result = await api.join(sessionId, { name: "Guest" });
	statusText.textContent = `Joined session: ${result.session} (clientId: ${result.clientId})`;

	game.snakes = [];
	snakesByClientId.clear();
	localClientId = result.clientId;
	localSnake = createSnakeForClient(localClientId, "Player");
	startMatch();
  } catch (err) {
	console.error(err);
	statusText.textContent = "Kunde inte ansluta session";
  }
});

// ---------- LYSSNA PÅ EVENTS FRÅN SERVERN ----------
api.listen((event, messageId, clientId, data) => {
  console.log("EVENT:", event, messageId, clientId, data);

  if (event === "joined") {
	if (!snakesByClientId.has(clientId)) {
	  const name = data && data.name ? data.name : `Player ${snakesByClientId.size + 1}`;
	  const snake = createSnakeForClient(clientId, name);

	  if (clientId === localClientId) {
		localSnake = snake;
	  }
	}
  }

  if (event === "game" && data && data.type === "direction") {
	const snake = snakesByClientId.get(clientId);
	if (!snake) return;
	snake.setDirection(data.dir);
  }





   // 🔥 matchEnd (läggs här!)
  if (event === "game" && data && data.type === "matchEnd") {
	console.log("MatchEnd mottaget från host!");
	game.stop();      // 🔥 stoppa tick!
	endMatch(); 
};

});*/



