const electron = require('electron')
const { dialog } = require('electron');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const path = require('path')
const os = require('os');
const ethminerName = (os.platform() == 'win32') ? 'ethminer.exe' : (os.platform() == 'darwin') ? 'ethminerdarwin' : 'ethminerlinux';
const ethminer = path.join(__dirname, ethminerName);
const AutoLaunch = require('auto-launch');
const stripAnsi = require('strip-ansi');
const { State } = require('./utils.js');


const appName = (os.platform() == 'win32') ? 'EthereumMiner.exe' : (os.platform() == 'darwin') ? 'EthereumMiner.app' : 'EthereumMiner';
var autoLauncher = new AutoLaunch({
  name: 'EthereumMiner',
  path: path.join(__dirname, appName)
});
var config;
const configPath = './config.json';
if (fs.existsSync(configPath) && (file = fs.readFileSync(configPath)) != null) {
  try {
    config = JSON.parse(file);
  } catch(x) {
    config = {};
  }
} else {
  config = {};
}
const Config = {
  WALLET: 'wallet',
  WORKER_NAME: 'workerName',
  STRATUM: 'stratum',
  FAILOVER_STRATUM: 'failoverStratum',
  DEVICES: 'devices',
  AUTO_START: 'autoStart',
  WIDTH: 'wdith',
  HEIGHT: 'height'
};

function save() {
  fs.writeFile(configPath, JSON.stringify(config), function (err) {
    if (err) {
      console.log('error saving config');
    } else {
      console.log('saved');
    }
  });
}

// Module to control application life.
const app = electron.app
// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow
const gpus = [];
const url = require('url')
const ethminerInstances = [];

// inter-process control, messages between node process and renderer
const { ipcMain } = require('electron')
let ipcRenderer;

var lastReport = Date.now();

function setAutoLaunch(enabled) {
  autoLauncher.isEnabled().then(function (isEnabled) {
    if (isEnabled && !enabled) {
      autoLauncher.disable();
    } else if (!isEnabled && enabled) {
      autoLauncher.enable();
    }
    autoLauncher.enable();
  }).catch(function (err) {
    console.log('error getting auto launch')
  });
}

ipcMain.on('init', (event) => {
  ipcRenderer = event.sender;
  ipcRenderer.send('init', {
    config,
    gpus
  });
})

async function killAllEthminers(signal) {
  for (i = 0; i < ethminerInstances.length; i++) {
    for (j = 0; j < ethminerInstances[i].length; j++) {
      if (ethminerInstances[i][j] && ethminerInstances[i][j].instance && ethminerInstances[i][j].instance.kill && ethminerInstances[i][j].instance.stdout && ethminerInstances[i][j].instance.stderr) {
        await ethminerInstances[i][j].instance.stdout.removeAllListeners('data');
        await ethminerInstances[i][j].instance.stderr.removeAllListeners('data');
        await ethminerInstances[i][j].instance.removeAllListeners('close');
        await ethminerInstances[i][j].instance.kill(signal);
        delete ethminerInstances[i][j].instance;
        delete ethminerInstances[i][j].hashrate;
        delete ethminerInstances[i][j].shares;
        if (ipcRenderer)
          ipcRenderer.send('state', {
            platformID: i,
            deviceID: j,
            nextState: 'On'
          });
      }
    }
  }
}

ipcMain.on('stop', (event) => {
  killAllEthminers('SIGTERM');
  stopCheckingInstances();
  stopBroadcastingHashrates();
});

ipcMain.on('on', (event, data) => {
  let { platformID, deviceID, mine } = data;
  if (platformID >= gpus.length || deviceID >= gpus[platformID].length) return;
  if (platformID < ethminerInstances.length && deviceID < ethminerInstances[platformID].length) {
    let ethminerInstance = ethminerInstances[platformID][deviceID];
    if (ethminerInstance.instance && !ethminerInstance.instance.killed && ethminerInstance.instance.connected) {
      console.log('gpu already on');
      return;
    }
  }
  if (!broadcastHashrateInterval) startBroadcastingHashrates();
  if (!checkInstanceHealthInterval) startCheckingInstancesPeriodically();
  let gpu = gpus[platformID][deviceID];
  gpu.mine = mine;
  startMining(platformID, deviceID, gpu.deviceName, mine);
});

ipcMain.on('off', (event, data) => {
  let { platformID, deviceID } = data;
  if (platformID >= gpus.length || deviceID >= gpus[platformID].length) return;
  if (platformID >= ethminerInstances.length || deviceID >= ethminerInstances[platformID].length) return;
  let gpu = gpus[platformID][deviceID];
  let ethminerInstance = ethminerInstances[platformID][deviceID];
  delete ethminerInstance.hashrate;
  delete ethminerInstance.shares;
  if (ethminerInstance.instance && ethminerInstance.instance.kill) ethminerInstance.instance.kill('SIGTERM');
  else {
    ipcRenderer.send('state', {
      platformID,
      deviceID,
      nextState: State.ON
    })
  }

});



function saveConfig(gpus, wallet, workerName, stratum, failoverStratum, autoStart) {
  let devices = {};
  for (i = 0; i < gpus.length; i++) {
    if (gpus[i])
      for (j = 0; j < gpus[i].length; j++) {
        let deviceName = gpus[i][j].deviceName;
        if (!deviceName) continue;
        if (!devices[deviceName]) devices[deviceName] = { mine: gpus[i][j].mine };
        else devices[deviceName].mine = gpus[i][j].mine
      }
  }
  config[Config.WALLET] = wallet;
  config[Config.WORKER_NAME] = workerName;
  config[Config.STRATUM] = stratum;
  config[Config.FAILOVER_STRATUM] = failoverStratum;
  config[Config.DEVICES] = devices;
  config[Config.AUTO_START] = autoStart;
  save();
}

ipcMain.on('dialog', (event, message) => {
  dialog.showMessageBox({ type: "info", message });
});

ipcMain.on('save', (event, data) => {
  let { gpus, wallet, workerName, stratum, failoverStratum, autoStart } = data;
  saveConfig(gpus, wallet, workerName, stratum, failoverStratum, autoStart);
  setAutoLaunch(autoStart);
});

ipcMain.on('start', (event, data) => {
  killAllEthminers('SIGTERM');
  let { gpus, wallet, workerName, stratum, failoverStratum, autoStart } = data;
  saveConfig(gpus, wallet, workerName, stratum, failoverStratum, autoStart);
  if (gpus) {
    var count = 0;
    for (j = 0; j < gpus.length; j++) {
      let platform = gpus[j];
      for (i = 0; i < platform.length; i++) {
        if (platform[i].hashrate) delete platform[i].hashrate
        let { platformID, deviceID, deviceName, mine } = platform[i];
        if (mine) {
          setTimeout(function () {
            startMining(platformID, deviceID, deviceName, mine);
          }, count * 20000 + 500);
          count++;
        } else {
          // since mine doesn't exist will fire notification
          startMining(platformID, deviceID, deviceName, mine);
        }
      }
    }
  }
  setAutoLaunch(autoStart);
  startCheckingInstancesPeriodically();
  startBroadcastingHashrates();
});

var checkInstanceHealthInterval;
function startCheckingInstancesPeriodically() {
  checkInstanceHealth();
  checkInstanceHealthInterval = setInterval(checkInstanceHealth, 15000);
}
function stopCheckingInstances() {
  if (checkInstanceHealthInterval) clearInterval(checkInstanceHealthInterval);
  checkInstanceHealthInterval = null;
}

function checkInstanceHealth() {
  for (i = 0; i < ethminerInstances.length; i++) {
    for (j = 0; j < ethminerInstances[i].length; j++) {
      let { instance, lastActivity, platformID, deviceID } = ethminerInstances[i][j];
      if (!instance || !lastActivity) continue;
      let now = Date.now();
      if (now - lastActivity > 120000) {
        // 2 minutes of inactivity, should restart
        restartInstance(platformID, deviceID);
        ethminerInstances[i][j].restartCount++;
        if (ipcRenderer) {
          ipcRenderer.send('restarted', { platformID, deviceID, restartCount: ethminerInstances[i][j].restartCount });
        }
      }
    }
  }
}

var broadcastHashrateInterval;
function startBroadcastingHashrates() {
  broadcastHashrateInterval = setInterval(broadcastHashrate, 100);
  broadcastHashrate();
}
function stopBroadcastingHashrates() {
  clearInterval(broadcastHashrateInterval);
  broadcastHashrateInterval = null;
}
var lastPlatformID = 0;
var lastDeviceID = 0;
function broadcastHashrate() {
  if (ethminerInstances.length <= lastPlatformID || ethminerInstances[lastPlatformID] == null || ethminerInstances[lastPlatformID].length <= lastDeviceID) {
    incrementHashrateInstance();
    return;
  }
  let ethminerInstance = ethminerInstances[lastPlatformID][lastDeviceID];
  if (!ethminerInstance) {
    incrementHashrateInstance();
    return;
  }
  let { hashrate, shares } = ethminerInstance;
  if (hashrate && ipcRenderer) {
    //console.log(`broadcasted hashrate for platformID: ${lastPlatformID}, deviceID: ${lastDeviceID}, hashrate: ${hashrate}, shares: ${shares}`);
    ipcRenderer.send('hashrate', {
      platformID: lastPlatformID,
      deviceID: lastDeviceID,
      hashrate: hashrate,
      shares: shares
    });
  }
  incrementHashrateInstance();
}

function incrementHashrateInstance() {
  if (lastPlatformID >= ethminerInstances.length) {
    return;
  }
  let nextDeviceID = lastDeviceID + 1
  if (nextDeviceID < ethminerInstances[lastPlatformID].length) {
    lastDeviceID = nextDeviceID;
  } else {
    let nextPlatformID = lastPlatformID + 1;
    if (nextPlatformID < ethminerInstances.length) {
      lastPlatformID = nextPlatformID;
      lastDeviceID = 0;
    } else {
      lastPlatformID = 0;
      lastDeviceID = 0;
    }
  }
}

function reportHashrate(platformID, deviceID, hashrate, shares) {
  //let now = Date.now();
  //console.log('report hashrate', hashrate, 'platformID', platformID, 'deviceID', deviceID, shares );
  let ethminerInstance = ethminerInstances[platformID][deviceID];
  if (shares) {
    ethminerInstance.shares = shares;
  }
  if (hashrate && hashrate != "0.00 Mh/s") {
    let floatHashrate = parseFloat(hashrate);
    if (floatHashrate) {
      if (floatHashrate != 0) {
        ethminerInstance.lastActivity = Date.now();
        ethminerInstance.hashrate = floatHashrate;
      }
    }
    else ethminerInstance.hashrate = hashrate;
  }
}

function startMining(platformID, deviceID, deviceName, mine) {
  //console.log('start mining', deviceName, 'mine', mine, platformID, deviceID);
  if (!mine) {
    if (ipcRenderer)
      ipcRenderer.send('state', {
        platformID,
        deviceID,
        nextState: State.ON
      });
      //console.log('mine not enabled', platformID, deviceID);
    return;
  }
  if (platformID < ethminerInstances.length && deviceID < ethminerInstances[platformID].length) {
    let ethminerInstance = ethminerInstances[platformID][deviceID];
    if (ethminerInstance && ethminerInstance.instance && ethminerInstance.instance.connected) {
      console.log('already mining on that gpu');
      return;
    }
  }
  let { wallet, workerName, stratum, failoverStratum, autoStart } = config;
  let args = ['-O', `${wallet}.${workerName}_${mine}${deviceID}`, '--farm-recheck', '200', '-S', stratum];
  if (failoverStratum) {
    args.push('-FS', failoverStratum);
  }
  switch (mine) {
    case "cuda":
      //console.log(`begin cuda mining platformID: ${platformID}, deviceID: ${deviceID}`);
      args.push('-U', '--cuda-devices', deviceID);
      break;
    case "opencl":
      //console.log(`begin opencl mining platformID: ${platformID}, deviceID: ${deviceID}`);
      args.push('-G', '--opencl-platform', platformID, '--opencl-devices', deviceID);
      break;
  }
  const ethminerInstance = spawn(ethminer, args);
  ethminerInstance.stdout.on('data', (data) => {
    if (shouldKill) return;
    //WTF, CUDA progress comes in through stdout, but everything else goes to stderr
    let dataString = stripAnsi(data.toString());
    //console.log(`stdout: ${dataString}`);
    const cudaRegex = /CUDA#(\d+):\s(\d+)%/g;
    let cudaMatches = dataString.match(cudaRegex);
    if (cudaMatches && cudaMatches.length == 1) {
      let hashrate = cudaMatches[0];
      reportHashrate(platformID, deviceID, hashrate);
    }
  });
  ethminerInstance.stderr.on('data', (data) => {
    if (shouldKill) return;
    // ethminer sends progress through stderr for some odd reason

    let dataString = stripAnsi(data.toString());
    //console.log(`stderr: ${dataString}`);
    const dagRegex = /DAG\s(\d+)\s%/g;
    let dagMatches = dataString.match(dagRegex);
    if (dagMatches && dagMatches.length == 1) {
      let hashrate = dagMatches[0]
      reportHashrate(platformID, deviceID, hashrate);
    }

    const sharesRegex = /A(\d+)\+(\d+):R(\d+)\+(\d+):F(\d+)/g;
    let sharesMatches = dataString.match(sharesRegex);
    var shares = null;
    if (sharesMatches && sharesMatches.length == 1) {
      shares = sharesMatches[0];
    }

    const hashrateRegex = /(\d+)\.(\d+)\sMh\/s/g;
    let hashrateMatches = dataString.match(hashrateRegex);
    //console.log('hashrate matches', hashrateMatches);
    if (hashrateMatches && hashrateMatches.length == 1) {
      let hashrate = hashrateMatches[0];
      reportHashrate(platformID, deviceID, hashrate, shares);
    }
  });
  ethminerInstance.on('close', (code) => {
    if (shouldKill) return;
    //console.log(`ethminer instance closed with code ${code}`);
    if (ipcRenderer)
      ipcRenderer.send('state', {
        platformID,
        deviceID,
        nextState: 'On',
        message: code ? "Error" : "Closed"
      });
  });
  while (ethminerInstances.length <= platformID) ethminerInstances.push([]);
  while (ethminerInstances[platformID].length <= deviceID) ethminerInstances[platformID].push({});
  ethminerInstances[platformID][deviceID] = { instance: ethminerInstance, lastActivity: Date.now(), platformID, deviceID, restartCount: 0, hashrate: 0 };
  if (ipcRenderer)
    ipcRenderer.send('state', {
      platformID,
      deviceID,
      nextState: State.OFF
    });

}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow

async function listDevices() {
  gpus.length = 0;
  const result = execSync(`${ethminer} --list-devices`).toString();
  var devicesRegex = /\[(\d+)\].\[(\d+)\].*/g;
  var devices = result.match(devicesRegex);
  var numbersRegex = /\d+/g
  var memorySizeRegex = /(?:CL_DEVICE_MAX_MEM_ALLOC_SIZE:\s)(\d+)/g;
  let memorySizes = [];
  while ((memorySizeMatch = memorySizeRegex.exec(result)) != null) {
    memorySizes.push(memorySizeMatch[1]);
  }
  for (i = 0; i < devices.length; i++) {
    let device = devices[i];
    var clPlatformIndexes = device.match(numbersRegex);
    let platformID, deviceID, deviceName;
    let split = device.split(']');
    deviceName = split[split.length - 1].trim();
    let configDevice;
    if (config && config[Config.DEVICES]) configDevice = config[Config.DEVICES][deviceName];
    let mine;
    if (configDevice) mine = configDevice.mine;
    if (clPlatformIndexes.length == 1) {
      // only one cl platform, index 0
      platformID = 0;
      deviceID = clPlatformIndexes[0];
    } else {
      // multiple cl platforms or non-zero cl-platform
      platformID = clPlatformIndexes[0];
      deviceID = clPlatformIndexes[1];
    }
    while (gpus.length <= platformID) gpus.push([]);
    while (gpus[platformID].length <= deviceID) gpus[platformID].push({});
    while (ethminerInstances.length <= platformID) ethminerInstances.push([]);
    while (ethminerInstances[platformID].length <= deviceID) ethminerInstances[platformID].push({});
    gpus[platformID][deviceID] = {
      platformID,
      deviceID,
      deviceName,
      memory: (memorySizes && i < memorySizes.length) ? memorySizes[i] : null,
      mine
    };
  }
}

let shouldKill = false;
let saveTimeout;
function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: config[Config.WIDTH] || 1200,
    height: config[Config.HEIGHT] || 900,
    icon: `./img/ethereum.${os.platform() == 'win32' ? 'ico' : 'icns'}`
  })
  mainWindow.on('resize', (e) => {
    let size = mainWindow.getSize();
    config[Config.WIDTH] = size[0];
    config[Config.HEIGHT] = size[1];
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(save, 1000);
  });
  // and load the index.html of the app.
  mainWindow.loadURL(url.format({
    pathname: path.join(__dirname, 'index.html'),
    protocol: 'file:',
    slashes: true
  }))

  // Open the DevTools.
  //mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function () {
  createWindow();
  listDevices();
})

// Quit when all windows are closed.
app.on('window-all-closed', async function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    shouldKill = true;
    await killAllEthminers('SIGTERM');
    app.quit();
  }
})

app.on('activate', function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow()
  }
})
