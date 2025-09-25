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

const GAME_STATES = {
  START: 'start',
  PLAYING: 'playing',
  VICTORY: 'victory',
  GAME_OVER: 'gameover',
};

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

const ball = {
  radius: 8,
  x: canvas.width / 2,
  y: canvas.height - 60,
  speed: START_BALL_SPEED,
  dx: 0,
  dy: 0,
};

let bricks = [];
let gameState = GAME_STATES.START;
let score = 0;
let lives = 3;
let currentBallSpeed = START_BALL_SPEED;
let gameStartTime = null;
let completedSpeedIntervals = 0;
let lastElapsedSeconds = 0;

function resetBall(upwards = true) {
  ball.x = paddle.x + paddle.width / 2;
  ball.y = paddle.y - ball.radius - 4;
  ball.speed = currentBallSpeed;

  const angle = (Math.random() * Math.PI) / 3 + Math.PI / 6; // 30° → 90°
  const horizontalDirection = Math.random() < 0.5 ? -1 : 1;
  const horizontal = Math.cos(angle) * horizontalDirection;
  const vertical = Math.sin(angle);

  ball.dx = ball.speed * horizontal;
  ball.dy = ball.speed * (upwards ? -vertical : vertical);
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

function drawBall() {
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
  drawPaddle();
  drawBall();
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
  movePaddle();
  moveBall();
  handleCollisions();
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

function moveBall() {
  ball.x += ball.dx;
  ball.y += ball.dy;

  if (ball.x + ball.radius > canvas.width || ball.x - ball.radius < 0) {
    ball.dx *= -1;
  }

  if (ball.y - ball.radius < 0) {
    ball.dy *= -1;
  }

  if (ball.y + ball.radius > canvas.height) {
    loseLife();
  }
}

function handleCollisions() {
  // Paddle collision
  if (
    ball.y + ball.radius >= paddle.y &&
    ball.y + ball.radius <= paddle.y + paddle.height &&
    ball.x >= paddle.x &&
    ball.x <= paddle.x + paddle.width &&
    ball.dy > 0
  ) {
    const hitPoint = (ball.x - (paddle.x + paddle.width / 2)) / (paddle.width / 2);
    const clamped = Math.max(-1, Math.min(1, hitPoint));
    const bounceAngle = (Math.PI / 3) * clamped; // ±60° from vertical

    ball.dx = ball.speed * Math.sin(bounceAngle);
    ball.dy = -ball.speed * Math.cos(bounceAngle);
  }

  // Brick collisions
  bricks.forEach((brick) => {
    if (brick.destroyed) return;

    if (
      ball.x + ball.radius > brick.x &&
      ball.x - ball.radius < brick.x + brickSettings.width &&
      ball.y + ball.radius > brick.y &&
      ball.y - ball.radius < brick.y + brickSettings.height
    ) {
      brick.destroyed = true;
      score += 50;
      updateHud();

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

      normalizeBallVelocity();
    }
  });

  if (bricks.every((brick) => brick.destroyed)) {
    endGame(true);
  }
}

function normalizeBallVelocity() {
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
  ball.speed = currentBallSpeed;
  normalizeBallVelocity();
}

function updateTimer() {
  if (gameStartTime === null) {
    return;
  }

  const elapsedMs = performance.now() - gameStartTime;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  lastElapsedSeconds = elapsedSeconds;
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

function loseLife() {
  lives -= 1;
  updateHud();
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
  gameState = victory ? GAME_STATES.VICTORY : GAME_STATES.GAME_OVER;
  endTitle.textContent = victory ? 'Level Cleared!' : 'Out of Lives';
  finalScoreElement.textContent = score;
  finalTimeElement.textContent = formatTime(lastElapsedSeconds);
  endScreen.classList.remove('overlay--hidden');
}

function startGame() {
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
  } else if (event.key === ' ' && gameState === GAME_STATES.START) {
    startGame();
  } else if (event.key === ' ' && gameState !== GAME_STATES.PLAYING) {
    startGame();
  }
}

function handleKeyUp(event) {
  if (event.key === 'ArrowLeft' || event.key === 'a') {
    paddle.movingLeft = false;
  } else if (event.key === 'ArrowRight' || event.key === 'd') {
    paddle.movingRight = false;
  }
}

startButton.addEventListener('click', () => {
  startGame();
});

restartButton.addEventListener('click', () => {
  startGame();
});

window.addEventListener('keydown', handleKeyDown);
window.addEventListener('keyup', handleKeyUp);

function gameLoop() {
  update();
  draw();
  requestAnimationFrame(gameLoop);
}

gameLoop();
updateHud();
updateTimerDisplay(0);
