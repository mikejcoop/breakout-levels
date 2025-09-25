const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const scoreElement = document.getElementById('score');
const livesElement = document.getElementById('lives');
const startScreen = document.getElementById('startScreen');
const endScreen = document.getElementById('endScreen');
const startButton = document.getElementById('startButton');
const restartButton = document.getElementById('restartButton');
const endTitle = document.getElementById('endTitle');
const finalScoreElement = document.getElementById('finalScore');
const finalTimeElement = document.getElementById('finalTime');
const timerElement = document.getElementById('timer');
const nameInput = document.getElementById('playerName');
const nameErrorElement = document.getElementById('nameError');
const leaderboardListElement = document.getElementById('leaderboardList');
const leaderboardStatusElement = document.getElementById('leaderboardStatus');

const INSTANTDB_APP_ID = 'b2811543-8f1e-4430-8b48-e9c3b8b6599e';
const LEADERBOARD_LIMIT = 20;

let playerName = '';
let instantDbClient = null;
let instantDbTx = null;
let instantDbInitPromise = null;
let lastSubmittedEntryId = null;
let lastSubmittedScore = null;
let lastSubmittedTime = null;

const GAME_STATES = {
  START: 'start',
  PLAYING: 'playing',
  VICTORY: 'victory',
  GAME_OVER: 'gameover',
};

function isNameValid() {
  return Boolean(nameInput && nameInput.value.trim().length);
}

function updateStartButtonState() {
  if (startButton) {
    startButton.disabled = !isNameValid();
  }
}

function handleNameInput() {
  if (nameErrorElement) {
    nameErrorElement.textContent = '';
  }
  updateStartButtonState();
}

function ensurePlayerName() {
  if (playerName) {
    return true;
  }

  if (nameInput && nameInput.value.trim().length) {
    const trimmed = nameInput.value.trim().slice(0, 32);
    if (playerName !== trimmed) {
      lastSubmittedEntryId = null;
      lastSubmittedScore = null;
      lastSubmittedTime = null;
    }
    playerName = trimmed;
    nameInput.value = playerName;
    return true;
  }

  if (nameErrorElement) {
    nameErrorElement.textContent = 'Please enter your name to start playing.';
  }
  if (nameInput) {
    nameInput.focus();
  }
  if (startScreen) {
    startScreen.classList.remove('overlay--hidden');
  }
  gameState = GAME_STATES.START;
  return false;
}

function attemptInitialStart() {
  if (!isNameValid()) {
    if (nameErrorElement) {
      nameErrorElement.textContent = 'Please enter your name to start playing.';
    }
    if (nameInput) {
      nameInput.focus();
    }
    return;
  }

  const trimmed = nameInput.value.trim().slice(0, 32);
  if (playerName !== trimmed) {
    lastSubmittedEntryId = null;
    lastSubmittedScore = null;
    lastSubmittedTime = null;
  }
  playerName = trimmed;
  nameInput.value = playerName;
  if (nameErrorElement) {
    nameErrorElement.textContent = '';
  }
  startGame();
}

const brickSettings = {
  columns: 18,
  rows: 21,
  width: 40,
  height: 24,
  padding: 5,
  topOffset: 60,
  leftOffset: 138,
};

const statusStyles = {
  Above: { color: '#1d4ed8', text: 'Above' },
  Expected: { color: '#22c55e', text: 'Expected' },
  'Just Below': { color: '#facc15', text: 'Just\nBelow' },
  Below: { color: '#ef4444', text: 'Below' },
};

const START_BALL_SPEED = 3;
const BALL_SPEED_INCREMENT = 1;
const BALL_SPEED_INCREASE_INTERVAL_MS = 15000;

const paddle = {
  width: 140,
  height: 16,
  x: (canvas.width - 140) / 2,
  y: canvas.height - 40,
  speed: 7,
  movingLeft: false,
  movingRight: false,
};

const BASE_BALL_RADIUS = 8;

const POWER_UP_TYPES = {
  BIG_BALL: 'big',
  MULTI_BALL: 'multi',
  PIERCING_BALL: 'pierce',
};

const POWER_UP_DROP_INTERVAL_MS = 20000;
const POWER_UP_DURATION_MS = 10000;
const POWER_UP_FALL_SPEED = 3;
const POWER_UP_SIZE = 24;

let balls = [];
let bricks = [];
let gameState = GAME_STATES.START;
let score = 0;
let lives = 3;
let currentBallSpeed = START_BALL_SPEED;
let gameStartTime = null;
let completedSpeedIntervals = 0;
let lastElapsedSeconds = 0;
let lastElapsedMs = 0;
let ballRadiusMultiplier = 1;
let powerUps = [];
let lastPowerUpDropMs = 0;
let activePowerUp = null;
let piercingActive = false;

function resetBall(upwards = true) {
  balls = [createBall({ upwards })];
}

function createBall({
  upwards = true,
  position = null,
  angle = null,
} = {}) {
  const startX = position ? position.x : paddle.x + paddle.width / 2;
  const startY = position ? position.y : paddle.y - BASE_BALL_RADIUS - 4;
  const speed = currentBallSpeed;

  let dx;
  let dy;

  if (angle !== null) {
    dx = speed * Math.cos(angle);
    dy = speed * Math.sin(angle);
  } else {
    const randomAngle = (Math.random() * Math.PI) / 3 + Math.PI / 6; // 30° → 90°
    const horizontalDirection = Math.random() < 0.5 ? -1 : 1;
    const horizontal = Math.cos(randomAngle) * horizontalDirection;
    const vertical = Math.sin(randomAngle);
    dx = speed * horizontal;
    dy = speed * (upwards ? -vertical : vertical);
  }

  return {
    x: startX,
    y: startY,
    dx,
    dy,
    speed,
    radius: BASE_BALL_RADIUS * ballRadiusMultiplier,
  };
}

function resetPaddle() {
  paddle.x = (canvas.width - paddle.width) / 2;
  paddle.movingLeft = false;
  paddle.movingRight = false;
}

function resetGame() {
  score = 0;
  lives = 3;
  currentBallSpeed = START_BALL_SPEED;
  gameStartTime = null;
  completedSpeedIntervals = 0;
  updateHud();
  updateTimerDisplay(0);
  lastElapsedSeconds = 0;
  lastElapsedMs = 0;
  ballRadiusMultiplier = 1;
  powerUps = [];
  lastPowerUpDropMs = 0;
  activePowerUp = null;
  piercingActive = false;
  finalTimeElement.textContent = formatTime(0);
  resetPaddle();
  resetBall();
  bricks = createBricks();
}

function createBricks() {
  const grid = [];

  for (let row = 0; row < brickSettings.rows; row += 1) {
    for (let col = 0; col < brickSettings.columns; col += 1) {
      const status = determineStatus(row, col);
      grid.push({
        x:
          brickSettings.leftOffset +
          col * (brickSettings.width + brickSettings.padding),
        y:
          brickSettings.topOffset +
          row * (brickSettings.height + brickSettings.padding),
        status,
        destroyed: false,
      });
    }
  }

  return grid;
}

function determineStatus(row, col) {
  if (row === 0) {
    return 'Above';
  }
  if (row === brickSettings.rows - 1) {
    return 'Below';
  }

  const normalizedRow = row - 1;
  const offsetFromRight = brickSettings.columns - 1 - col;
  const progression = normalizedRow - offsetFromRight;

  if (progression < 0) {
    return 'Above';
  }
  if (progression === 0) {
    return 'Expected';
  }
  if (progression === 1) {
    return 'Just Below';
  }
  return 'Below';
}

function drawBackground() {
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, '#0f172a');
  gradient.addColorStop(1, '#020617');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function drawPaddle() {
  ctx.fillStyle = '#38bdf8';
  ctx.shadowColor = 'rgba(56, 189, 248, 0.5)';
  ctx.shadowBlur = 15;
  ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
  ctx.shadowBlur = 0;
}

function drawBalls() {
  balls.forEach((ball) => {
    const gradient = ctx.createRadialGradient(
      ball.x,
      ball.y,
      ball.radius * 0.3,
      ball.x,
      ball.y,
      ball.radius
    );
    gradient.addColorStop(0, '#f8fafc');
    gradient.addColorStop(1, '#38bdf8');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawPowerUps() {
  const colors = {
    [POWER_UP_TYPES.BIG_BALL]: '#f97316',
    [POWER_UP_TYPES.MULTI_BALL]: '#a855f7',
    [POWER_UP_TYPES.PIERCING_BALL]: '#22c55e',
  };

  const labels = {
    [POWER_UP_TYPES.BIG_BALL]: 'B',
    [POWER_UP_TYPES.MULTI_BALL]: 'M',
    [POWER_UP_TYPES.PIERCING_BALL]: 'P',
  };

  powerUps.forEach((powerUp) => {
    ctx.fillStyle = colors[powerUp.type];
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.lineWidth = 2;
    roundedRect(
      ctx,
      powerUp.x,
      powerUp.y,
      POWER_UP_SIZE,
      POWER_UP_SIZE,
      6
    );
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      labels[powerUp.type],
      powerUp.x + POWER_UP_SIZE / 2,
      powerUp.y + POWER_UP_SIZE / 2
    );
  });
}

function drawBricks() {
  bricks.forEach((brick) => {
    if (brick.destroyed) return;

    const style = statusStyles[brick.status];
    ctx.fillStyle = style.color;
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.65)';
    ctx.lineWidth = 2;
    roundedRect(ctx, brick.x, brick.y, brickSettings.width, brickSettings.height, 6);
    ctx.stroke();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '12px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const textLines = style.text.split('\n');
    const lineHeight = 13;
    textLines.forEach((line, index) => {
      ctx.fillText(
        line,
        brick.x + brickSettings.width / 2,
        brick.y + brickSettings.height / 2 + (index - (textLines.length - 1) / 2) * lineHeight
      );
    });
  });
}

function roundedRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
  context.fill();
}

function draw() {
  drawBackground();
  drawBricks();
  drawPowerUps();
  drawPaddle();
  drawBalls();
  drawStatusBanner();
}

function drawStatusBanner() {
  ctx.save();
  ctx.font = '18px "Segoe UI", sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.fillText('Reception → Year 6 | Autumn • Spring • Summer', 24, 24);
  ctx.restore();
}

function update() {
  if (gameState !== GAME_STATES.PLAYING) {
    return;
  }

  updateTimer();
  maybeSpawnPowerUp();
  updatePowerUps();
  movePaddle();
  moveBalls();
  handleCollisions();
  checkPowerUpExpiration();
}

function movePaddle() {
  if (paddle.movingLeft) {
    paddle.x -= paddle.speed;
  }
  if (paddle.movingRight) {
    paddle.x += paddle.speed;
  }

  paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
}

function moveBalls() {
  for (let index = balls.length - 1; index >= 0; index -= 1) {
    const ball = balls[index];
    ball.x += ball.dx;
    ball.y += ball.dy;

    if (ball.x + ball.radius > canvas.width) {
      ball.x = canvas.width - ball.radius;
      ball.dx *= -1;
    } else if (ball.x - ball.radius < 0) {
      ball.x = ball.radius;
      ball.dx *= -1;
    }

    if (ball.y - ball.radius < 0) {
      ball.y = ball.radius;
      ball.dy *= -1;
    }

    if (ball.y + ball.radius > canvas.height) {
      balls.splice(index, 1);
    }
  }

  if (balls.length === 0) {
    loseLife();
    return;
  }
}

function handleCollisions() {
  balls.forEach((ball) => {
    if (
      ball.dy > 0 &&
      ball.y + ball.radius >= paddle.y &&
      ball.y - ball.radius <= paddle.y + paddle.height &&
      ball.x + ball.radius >= paddle.x &&
      ball.x - ball.radius <= paddle.x + paddle.width
    ) {
      const hitPoint = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
      const clamped = Math.max(-1, Math.min(1, hitPoint));
      const bounceAngle = (Math.PI / 3) * clamped; // ±60° from vertical

      ball.dx = ball.speed * Math.sin(bounceAngle);
      ball.dy = -ball.speed * Math.cos(bounceAngle);
      ball.y = paddle.y - ball.radius - 1;
    }

    for (let i = 0; i < bricks.length; i += 1) {
      const brick = bricks[i];
      if (brick.destroyed) {
        continue;
      }

      if (
        ball.x + ball.radius > brick.x &&
        ball.x - ball.radius < brick.x + brickSettings.width &&
        ball.y + ball.radius > brick.y &&
        ball.y - ball.radius < brick.y + brickSettings.height
      ) {
        brick.destroyed = true;
        score += 50;
        updateHud();

        if (!piercingActive) {
          const overlapLeft = ball.x + ball.radius - brick.x;
          const overlapRight = brick.x + brickSettings.width - (ball.x - ball.radius);
          const overlapTop = ball.y + ball.radius - brick.y;
          const overlapBottom = brick.y + brickSettings.height - (ball.y - ball.radius);
          const minOverlapX = Math.min(overlapLeft, overlapRight);
          const minOverlapY = Math.min(overlapTop, overlapBottom);

          if (minOverlapX < minOverlapY) {
            ball.dx = -ball.dx;
          } else {
            ball.dy = -ball.dy;
          }

          normalizeBallVelocity(ball);
          break;
        }
      }
    }
  });

  if (bricks.every((brick) => brick.destroyed)) {
    endGame(true);
  }
}

function normalizeBallVelocity(ball) {
  const magnitude = Math.hypot(ball.dx, ball.dy);
  if (magnitude === 0) {
    ball.dx = ball.speed;
    ball.dy = -ball.speed;
    return;
  }

  ball.dx = (ball.dx / magnitude) * ball.speed;
  ball.dy = (ball.dy / magnitude) * ball.speed;
}

function increaseBallSpeed(amount) {
  currentBallSpeed += amount;
  balls.forEach((ball) => {
    ball.speed = currentBallSpeed;
    normalizeBallVelocity(ball);
  });
}

function maybeSpawnPowerUp() {
  if (gameStartTime === null) {
    return;
  }

  if (lastElapsedMs - lastPowerUpDropMs >= POWER_UP_DROP_INTERVAL_MS) {
    powerUps.push(createPowerUp());
    lastPowerUpDropMs = lastElapsedMs;
  }
}

function createPowerUp() {
  const types = Object.values(POWER_UP_TYPES);
  const type = types[Math.floor(Math.random() * types.length)];

  return {
    type,
    x: Math.random() * (canvas.width - POWER_UP_SIZE),
    y: brickSettings.topOffset,
    speed: POWER_UP_FALL_SPEED,
  };
}

function updatePowerUps() {
  for (let i = powerUps.length - 1; i >= 0; i -= 1) {
    const powerUp = powerUps[i];
    powerUp.y += powerUp.speed;

    if (powerUp.y > canvas.height) {
      powerUps.splice(i, 1);
      continue;
    }

    const overlapsPaddle =
      powerUp.y + POWER_UP_SIZE >= paddle.y &&
      powerUp.y <= paddle.y + paddle.height &&
      powerUp.x + POWER_UP_SIZE >= paddle.x &&
      powerUp.x <= paddle.x + paddle.width;

    if (overlapsPaddle) {
      activatePowerUp(powerUp.type);
      powerUps.splice(i, 1);
    }
  }
}

function checkPowerUpExpiration() {
  if (!activePowerUp) {
    return;
  }

  if (performance.now() >= activePowerUp.expiresAt) {
    deactivateCurrentPowerUp();
  }
}

function activatePowerUp(type) {
  if (activePowerUp) {
    deactivateCurrentPowerUp();
  }

  activePowerUp = {
    type,
    expiresAt: performance.now() + POWER_UP_DURATION_MS,
  };

  switch (type) {
    case POWER_UP_TYPES.BIG_BALL:
      ballRadiusMultiplier = 1.75;
      updateBallRadii();
      break;
    case POWER_UP_TYPES.MULTI_BALL:
      spawnAdditionalBalls();
      break;
    case POWER_UP_TYPES.PIERCING_BALL:
      piercingActive = true;
      break;
    default:
      break;
  }
}

function deactivateCurrentPowerUp() {
  if (!activePowerUp) {
    ballRadiusMultiplier = 1;
    updateBallRadii();
    piercingActive = false;
    return;
  }

  if (activePowerUp.type === POWER_UP_TYPES.MULTI_BALL) {
    if (balls.length > 0) {
      let keeperIndex = 0;
      for (let i = 1; i < balls.length; i += 1) {
        if (balls[i].y > balls[keeperIndex].y) {
          keeperIndex = i;
        }
      }
      const keeperBall = balls[keeperIndex];
      balls = [keeperBall];
    }
  }

  ballRadiusMultiplier = 1;
  updateBallRadii();
  piercingActive = false;
  activePowerUp = null;
}

function spawnAdditionalBalls() {
  if (balls.length === 0) {
    balls.push(createBall());
    return;
  }

  const referenceBall = balls[0];
  const baseAngle = Math.atan2(referenceBall.dy, referenceBall.dx);
  const offsets = [-0.3, 0.3];

  offsets.forEach((offset) => {
    const angle = baseAngle + offset;
    balls.push(
      createBall({
        position: { x: referenceBall.x, y: referenceBall.y },
        angle,
      })
    );
  });
}

function updateBallRadii() {
  balls.forEach((ball) => {
    ball.radius = BASE_BALL_RADIUS * ballRadiusMultiplier;
  });
}

function updateTimer() {
  if (gameStartTime === null) {
    return;
  }

  const elapsedMs = performance.now() - gameStartTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  lastElapsedSeconds = elapsedSeconds;
  lastElapsedMs = elapsedMs;
  updateTimerDisplay(elapsedSeconds);

  const intervals = Math.floor(elapsedMs / BALL_SPEED_INCREASE_INTERVAL_MS);
  if (intervals > completedSpeedIntervals) {
    const increases = intervals - completedSpeedIntervals;
    increaseBallSpeed(increases * BALL_SPEED_INCREMENT);
    completedSpeedIntervals = intervals;
  }
}

function updateTimerDisplay(totalSeconds) {
  timerElement.textContent = formatTime(totalSeconds);
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function generateLocalId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `lb_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
}

function showLeaderboardStatus(message) {
  if (leaderboardStatusElement) {
    leaderboardStatusElement.textContent = message ?? '';
  }
}

function renderLeaderboard(entries) {
  if (!leaderboardListElement) {
    return;
  }

  leaderboardListElement.innerHTML = '';

  if (!entries || entries.length === 0) {
    showLeaderboardStatus('No runs recorded yet. Be the first to claim the top spot!');
    return;
  }

  showLeaderboardStatus('');

  const fragment = document.createDocumentFragment();
  const normalizedPlayerName = playerName ? playerName.toLowerCase() : null;
  const normalizedScore = lastSubmittedScore;
  const normalizedTime = lastSubmittedTime;

  entries.slice(0, LEADERBOARD_LIMIT).forEach((entry, index) => {
    const listItem = document.createElement('li');
    listItem.className = 'leaderboard__entry';

    const entryId =
      entry?.id ??
      entry?.leaderboard_id ??
      entry?.__id ??
      entry?.$id ??
      entry?.uuid;
    let isCurrentPlayerEntry = false;
    if (entryId && lastSubmittedEntryId && entryId === lastSubmittedEntryId) {
      isCurrentPlayerEntry = true;
    } else if (normalizedPlayerName) {
      const entryName = (entry?.name ?? '').toString().toLowerCase();
      const entryScore = Number.parseInt(entry?.score, 10);
      const entryTime = Number.parseInt(entry?.timeSeconds ?? entry?.time, 10);
      if (
        entryName === normalizedPlayerName &&
        Number.isFinite(entryScore) &&
        entryScore === normalizedScore &&
        Number.isFinite(entryTime) &&
        entryTime === normalizedTime
      ) {
        isCurrentPlayerEntry = true;
      }
    }

    if (isCurrentPlayerEntry) {
      listItem.classList.add('leaderboard__entry--current');
    }

    const rankSpan = document.createElement('span');
    rankSpan.className = 'leaderboard__rank';
    rankSpan.textContent = `${index + 1}.`;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'leaderboard__name';
    nameSpan.textContent = entry?.name ? String(entry.name) : 'Anonymous';

    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'leaderboard__score';
    const displayScore = Number.isFinite(Number(entry?.score))
      ? Number(entry.score)
      : Number.parseInt(entry?.score, 10) || 0;
    scoreSpan.textContent = `${displayScore} pts`;

    const timeSpan = document.createElement('span');
    timeSpan.className = 'leaderboard__time';
    const rawTime = entry?.timeSeconds ?? entry?.time ?? entry?.durationSeconds;
    const parsedTime = Number.parseInt(rawTime, 10);
    timeSpan.textContent = Number.isFinite(parsedTime)
      ? formatTime(Math.max(parsedTime, 0))
      : typeof rawTime === 'string'
      ? rawTime
      : '—';

    listItem.append(rankSpan, nameSpan, scoreSpan, timeSpan);
    fragment.appendChild(listItem);
  });

  leaderboardListElement.appendChild(fragment);
}

async function refreshLeaderboard() {
  if (!instantDbClient) {
    return;
  }

  try {
    showLeaderboardStatus('Loading leaderboard…');
    const query = {
      leaderboard: {
        $: {
          limit: LEADERBOARD_LIMIT,
          orderBy: [
            { score: 'desc' },
            { timeSeconds: 'asc' },
            { createdAt: 'asc' },
          ],
        },
      },
    };
    const result = await instantDbClient.query(query);
    let entries =
      result?.data?.leaderboard ??
      result?.leaderboard ??
      (Array.isArray(result) ? result : []);

    if (entries && !Array.isArray(entries) && typeof entries === 'object') {
      entries = Object.values(entries);
    }

    if (Array.isArray(entries)) {
      entries.sort((a, b) => {
        const scoreA = Number(a?.score) || 0;
        const scoreB = Number(b?.score) || 0;
        if (scoreA !== scoreB) {
          return scoreB - scoreA;
        }

        const timeA = Number(a?.timeSeconds ?? a?.time ?? a?.durationSeconds);
        const timeB = Number(b?.timeSeconds ?? b?.time ?? b?.durationSeconds);
        const timeAValid = Number.isFinite(timeA);
        const timeBValid = Number.isFinite(timeB);

        if (timeAValid && timeBValid && timeA !== timeB) {
          return timeA - timeB;
        }
        if (timeAValid && !timeBValid) {
          return -1;
        }
        if (!timeAValid && timeBValid) {
          return 1;
        }

        const createdAtA = new Date(a?.createdAt ?? a?.created_at ?? 0).getTime();
        const createdAtB = new Date(b?.createdAt ?? b?.created_at ?? 0).getTime();
        return createdAtA - createdAtB;
      });
    }

    renderLeaderboard(entries);
  } catch (error) {
    console.error('Failed to load leaderboard', error);
    showLeaderboardStatus('Unable to load leaderboard.');
  }
}

async function importInstantDB() {
  const sources = [
    'https://cdn.instantdb.com/js/latest/instantdb.js',
    'https://esm.sh/@instantdb/core@latest',
  ];

  for (const url of sources) {
    try {
      const module = await import(/* @vite-ignore */ url);
      if (module && typeof module.init === 'function') {
        return module;
      }
    } catch (error) {
      console.warn('InstantDB source failed', url, error);
    }
  }

  return null;
}

function initializeInstantDB() {
  if (instantDbInitPromise) {
    return instantDbInitPromise;
  }

  const promise = (async () => {
    if (!leaderboardListElement) {
      return null;
    }

    showLeaderboardStatus('Connecting to leaderboard…');

    try {
      const module = await importInstantDB();
      if (!module || typeof module.init !== 'function') {
        console.warn('InstantDB module missing init function.');
        showLeaderboardStatus('Leaderboard unavailable.');
        return null;
      }

      const client = module.init({ appId: INSTANTDB_APP_ID });
      const hasQuery = typeof client?.query === 'function';
      const hasTransact = typeof client?.transact === 'function';

      if (!hasQuery || !hasTransact) {
        console.warn('InstantDB client missing expected methods.');
        showLeaderboardStatus('Leaderboard unavailable.');
        return null;
      }

      instantDbClient = client;
      instantDbTx = instantDbClient?.tx ?? null;
      await refreshLeaderboard();
      return instantDbClient;
    } catch (error) {
      console.error('InstantDB initialization failed', error);
      showLeaderboardStatus('Unable to load leaderboard.');
      return null;
    }
  })();

  instantDbInitPromise = promise;

  promise.then(
    (client) => {
      if (!client) {
        instantDbInitPromise = null;
      }
    },
    () => {
      instantDbInitPromise = null;
    }
  );

  return promise;
}


async function submitLeaderboardEntry({ victory }) {
  if (!playerName) {
    return;
  }

  const client = await initializeInstantDB();
  if (!client || typeof client.transact !== 'function') {
    return;
  }

  const entryId = typeof client.id === 'function' ? client.id() : generateLocalId();
  const createdAt = typeof client.now === 'function' ? client.now() : new Date().toISOString();
  const numericScore = Number(score);
  const numericTime = Number(lastElapsedSeconds);
  const entryPayload = {
    id: entryId,
    name: playerName,
    score: Number.isFinite(numericScore) ? numericScore : 0,
    timeSeconds: Number.isFinite(numericTime) ? Math.max(numericTime, 0) : 0,
    victory: Boolean(victory),
    createdAt,
  };

  let operations;

  if (instantDbTx && instantDbTx.leaderboard) {
    try {
      operations = [instantDbTx.leaderboard[entryId].update(entryPayload)];
    } catch (txError) {
      console.warn('InstantDB tx helper failed, using fallback mutation', txError);
    }
  }

  if (!operations) {
    operations = [
      {
        leaderboard: {
          [entryId]: entryPayload,
        },
      },
    ];
  }

  try {
    await client.transact(operations);
    lastSubmittedEntryId = entryId;
    lastSubmittedScore = entryPayload.score;
    lastSubmittedTime = entryPayload.timeSeconds;
    await refreshLeaderboard();
  } catch (error) {
    console.error('Failed to submit leaderboard entry', error);
    showLeaderboardStatus('Unable to update the leaderboard right now.');
  }
}

function loseLife() {
  lives -= 1;
  updateHud();
  deactivateCurrentPowerUp();
  powerUps = [];
  lastPowerUpDropMs = lastElapsedMs;
  if (lives <= 0) {
    endGame(false);
  } else {
    resetPaddle();
    resetBall(true);
  }
}

function updateHud() {
  scoreElement.textContent = score;
  livesElement.textContent = lives;
}

function endGame(victory) {
  deactivateCurrentPowerUp();
  powerUps = [];
  gameState = victory ? GAME_STATES.VICTORY : GAME_STATES.GAME_OVER;
  endTitle.textContent = victory ? 'Level Cleared!' : 'Out of Lives';
  finalScoreElement.textContent = score;
  finalTimeElement.textContent = formatTime(lastElapsedSeconds);
  endScreen.classList.remove('overlay--hidden');
  initializeInstantDB();
  void submitLeaderboardEntry({ victory });
}

function startGame() {
  if (!ensurePlayerName()) {
    return;
  }

  if (nameErrorElement) {
    nameErrorElement.textContent = '';
  }

  resetGame();
  gameStartTime = performance.now();
  completedSpeedIntervals = 0;
  lastElapsedSeconds = 0;
  updateTimerDisplay(0);
  gameState = GAME_STATES.PLAYING;
  startScreen.classList.add('overlay--hidden');
  endScreen.classList.add('overlay--hidden');
}

function handleKeyDown(event) {
  if (event.key === 'ArrowLeft' || event.key === 'a') {
    paddle.movingLeft = true;
  } else if (event.key === 'ArrowRight' || event.key === 'd') {
    paddle.movingRight = true;
  } else if (event.key === ' ') {
    event.preventDefault();
    if (gameState === GAME_STATES.START) {
      attemptInitialStart();
    } else if (gameState !== GAME_STATES.PLAYING) {
      startGame();
    }
  }
}

function handleKeyUp(event) {
  if (event.key === 'ArrowLeft' || event.key === 'a') {
    paddle.movingLeft = false;
  } else if (event.key === 'ArrowRight' || event.key === 'd') {
    paddle.movingRight = false;
  }
}

if (nameInput) {
  nameInput.addEventListener('input', handleNameInput);
  nameInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      attemptInitialStart();
    }
  });
}

if (startButton) {
  startButton.addEventListener('click', attemptInitialStart);
}

if (restartButton) {
  restartButton.addEventListener('click', () => {
    startGame();
  });
}

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

initializeInstantDB();
updateStartButtonState();

gameLoop();
updateHud();
updateTimerDisplay(0);
