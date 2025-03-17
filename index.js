const mineflayer = require('mineflayer'),
  { Movements, pathfinder, goals } = require('mineflayer-pathfinder'),
  config = require('./settings.json'),
  { server, utils, BOT } = config,
  { chat } = utils,
  express = require('express'),
  app = express();

app.get('/', (req, res) =>
  res.send('Bot has been up!'));
app.listen(8000, () =>
  console.log('Server started'));

function createBot(username = BOT.username, chatting = true, password = BOT.password, version = server.version, host = server.ip, port = server.port) {
  const botOptions = {
    username, password, version, host, port,
    auth: 'offline', // Force offline mode
    timeout: server.timeout || 60000,
    keepAlive: true,
    checkTimeoutInterval: 30000
  }

  if (config.BOT.type !== 'offline' && password) {
    botOptions.password = password;
  }
  
  const bot = mineflayer.createBot(botOptions);
  function log(f = '', msg = '', e = '\x1b[0m') {
    return console.log('\x1b' + f, `[${username}] ${msg}`, e);
  }
  const controls = {}
  for (const key of ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']) {
    controls[key] = () => bot.setControlState(key, true);
  }
  const stop = {}
  for (const key of ['forward', 'back', 'left', 'right', 'jump', 'sprint', 'sneak']) {
    stop[key] = () => bot.setControlState(key, false);
  }

  bot.loadPlugin(pathfinder);
  let pendingPromise = Promise.resolve();

  function sendRegister(password) {
    sendLogin(password);
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      console.log(`[Auth] Registering...`);

      bot.once('chat', (username, message) => {
        console.log(`[Chat] <${username}> ${message}`); // Log all chat messages

        // Check for various possible responses
        if (message.includes('successfully')) {
          console.log('[INFO] Registration confirmed.');
          resolve();
        } else if (message.includes('already')) {
          console.log('[INFO] Bot was already registered.');
          resolve(); // Resolve if already registered
        } else if (message.includes('Invalid command')) {
          reject(`Registration failed: Invalid command. Message: "${message}"`);
        } else {
          reject(`Registration failed: unexpected message "${message}".`);
        }
      });
    });
  }

  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      console.log(`[Auth] Logging...`);

      bot.once('chat', (username, message) => {
        console.log(`[Chat] <${username}> ${message}`); // Log all chat messages

        if (message.includes('successfully logged in')) {
          console.log('[INFO] Login successfull.');
          resolve();
        } else if (message.includes('Invalid password.')) {
          reject(`Login failed: Invalid password. Message: "${message}"`);
        } else if (message.includes('not registered')) {
          reject(`Login failed: Not registered. Message: "${message}"`);
        } else {
          reject(`Login failed: unexpected message "${message}".`);
        }
      });
    });
  }

  bot.once('spawn', () => {
    log('\x1b[1;93m', 'Bot has joined the server.');

    const mcData = require('minecraft-data')(bot.version);
    const defaultMove = new Movements(bot, mcData);
    
    if (utils.auto_auth.enabled) {
      console.log('[INFO] Started auto-auth.');

      const password = utils.auto_auth.password;

      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(error => console.error('[ERROR]', error));
      setTimeout(() => setInterval(() => {
        controls.jump();
        controls.sprint();
        setTimeout(() => controls.sneak(), 300);
      }, 1000), 10000);
    }

    if (chat.enabled) {
      console.log('[INFO] Started chat-messages module');
      const messages = chat.messages;

      if (chat.repeat) {
        const delay = chat.repeat_delay;
        let i = 0;

        let sendMessages = setInterval(() => {
          if (chatting) bot.chat(`${messages[i]}`);
          if (i + 1 === messages.length) i = 0;
          else i++;
        }, delay * 1000);
      } else {
        messages.forEach(msg => {
          bot.chat(msg);
        });
      }
    }

    const pos = config.position;

    if (pos.enabled) {
      log('\x1b[32m', `Moving to target location: (X:${pos.x}, Y:${pos.y}, Z:${pos.z})`);
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new goals.GoalBlock(pos.x, pos.y, pos.z));
    }

    if (utils.anti_afk.enabled) {
      controls.jump();
      if (utils.anti_afk.sneak) {
        controls.sneak();
      }
    }
  });

  bot.on('goal_reached', () => {
    log('\x1b[32m', `Bot has arrived to location. ${bot.entity.position}`);
  });

  bot.on('death', () =>
    log('\x1b[33m', `Bot died and was respawned at ${bot.entity.position}`));

  let retryCount = 0;
  const maxRetries = server.maxRetries || 5;
  
  if (utils.auto_reconnect) {
    bot.on('end', () => {
      if (retryCount < maxRetries) {
        retryCount++;
        console.log(`[INFO] Connection attempt ${retryCount}/${maxRetries}`);
        setTimeout(() => createBot(), server.reconnectDelay || utils.reconnect_delay);
      } else {
        console.log('[ERROR] Max retry attempts reached. Please check server status.');
      }
    });
  }

  bot.on('kicked', reason =>
    log('[33m', `Bot was kicked from the server. Reason: \n${reason}`));

  bot.on('error', err =>
    console.log(`\x1b[31m[ERROR] ${err.message}`, '\x1b[0m'));
}

createBot('Emma', false);