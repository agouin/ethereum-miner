const electron = require('electron');
const {
  BrowserWindow,
  dialog,
  Menu,
  MenuItem,
  app,
  ipcMain
} = require('electron');
const http = require('http');
const fs = require('fs');
const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const ethminerName =
  os.platform() == 'win32'
    ? 'ethminer.exe'
    : os.platform() == 'darwin' ? 'ethminerdarwin' : 'ethminerlinux';
const ethminer = path.join(__dirname, ethminerName);
const AutoLaunch = require('auto-launch');
const stripAnsi = require('strip-ansi');
const url = require('url');
const { State } = require('./utils.js');

const appName =
  os.platform() == 'win32'
    ? 'ethereum-miner.exe'
    : os.platform() == 'darwin' ? 'ethereum-miner.app' : 'ethereum-miner';
var autoLauncher = new AutoLaunch({
  name: 'EthereumMiner',
  path: app.getPath('exe')
});
var config;
const configPath = path.resolve(app.getPath('userData'), './config.json');
if (fs.existsSync(configPath) && (file = fs.readFileSync(configPath)) != null) {
  try {
    config = JSON.parse(file);
  } catch (x) {
    config = {};
  }
} else {
  config = {};
}

const gpus = [];
const ethminerInstances = [];

var ipcRenderer;
var ipcClusterMonitor;
var lastReport = Date.now();

// Config enum
const Config = {
  WALLET: 'wallet',
  WORKER_NAME: 'workerName',
  STRATUM: 'stratum',
  FAILOVER_STRATUM: 'failoverStratum',
  DEVICES: 'devices',
  AUTO_START: 'autoStart',
  WIDTH: 'wdith',
  HEIGHT: 'height',
  CLUSTER: 'cluster'
};

const express = require('express');
const api = express();
const request = require('request');

api.get('/', (req, res) => {
  var hashrates = [];
  var hashrate = 0;
  var totalAccepted = 0,
    totalAccepted2 = 0,
    totalRejected = 0,
    totalRejected2 = 0,
    totalFound = 0;
  for (i = 0; i < ethminerInstances.length; i++) {
    hashrates.push([]);
    for (j = 0; j < ethminerInstances[i].length; j++) {
      hashrates[i].push({});
      let ethminerInstance = ethminerInstances[i][j];
      let { hashrate, shares } = ethminerInstance;
      hashrates[i][j].hashrate = hashrate;
      hashrates[i][j].shares = shares;
      if (!shares) continue;
      let split = shares.split(':');
      if (split.length != 3) continue;
      let acceptedSplit = split[0].replace('A', '').split('+');
      let rejectedSplit = split[1].replace('R', '').split('+');
      if (acceptedSplit.length != 2) continue;
      if (rejectedSplit.length != 2) continue;
      totalAccepted += parseInt(acceptedSplit[0]);
      totalAccepted2 += parseInt(acceptedSplit[1]);
      totalRejected += parseInt(rejectedSplit[0]);
      totalRejected2 += parseInt(rejectedSplit[1]);
      totalFound += parseInt(split[2].replace('F', ''));
      let floatHashrate = parseFloat(hashrate);
      if (floatHashrate && !floatHashrate.isNaN()) hashrate += floatHashrate;
    }
  }
  res.send({
    hashrates,
    hashrate,
    workerName: config[Config.WORKER_NAME],
    totalAccepted,
    totalAccepted2,
    totalRejected,
    totalRejected2,
    totalFound
  });
});

api.listen(5025, () => console.log('listening on port 5025'));

ipcMain.on('initClusterMonitor', event => {
  ipcClusterMonitor = event.sender;
  var cluster = config[Config.CLUSTER];
  if (cluster == null || cluster.length == 0) {
    config[Config.CLUSTER] = [];
    save();
  }
  ipcClusterMonitor.send('cluster', config[Config.CLUSTER]);
  startFetchingCluster();
});

function startFetchingCluster() {
  let cluster = config[Config.CLUSTER];
  shouldFetchCluster = true;
  for (i = 0; i < cluster.length; i++) {
    getHashrate(cluster[i].address);
  }
}

function stopFetchingCluster() {
  shouldFetchCluster = false;
}

var workers = {};
var shouldFetchCluster = false;
var addressesToStop = [];

function getHashrate(address) {
  if (addressesToStop.indexOf(address) >= 0) {
    addressesToStop.splice(addressesToStop.indexOf(address), 1);
    return;
  }
  request.get({ url: address, json: true }, (err, res, body) => {
    if (err) {
      dialog.showMessageBox({ type: 'info', message: err });
      // scheduleNext(address);
      return;
    }
    if (!body) {
      dialog.showMessageBox({
        type: 'info',
        message: 'Data retrieved is unusable'
      });
      // scheduleNext(address);
      return;
    }

    let {
      hashrates,
      hashrate,
      workerName,
      totalAccepted,
      totalAccepted2,
      totalRejected,
      totalRejected2,
      totalFound
    } = body;
    if (!workerName) {
      scheduleNext(address);
      return;
    }
    body.address = address;
    workers[workerName] = body;
    if (addressesToStop.indexOf(address) >= 0) {
      addressesToStop.splice(addressesToStop.indexOf(address), 1);
      return;
    }
    if (ipcClusterMonitor)
      ipcClusterMonitor.send('update', workers[workerName]);
    scheduleNext(address);
  });
}

function scheduleNext(address) {
  if (shouldFetchCluster) {
    let index = addressesToStop.indexOf(address);
    if (index == -1) {
      setTimeout(() => {
        getHashrate(address);
      }, 2000);
    } else {
      addressesToStop.splice(index, 1);
    }
  }
}

ipcMain.on('addWorker', (event, data) => {
  if (!data) return;
  let { address } = data;
  if (!config[Config.CLUSTER]) config[Config.CLUSTER] = [];
  request.get({ url: address, json: true }, (err, res, body) => {
    if (err) {
      dialog.showMessageBox({
        type: 'info',
        message: `${address} is not available, can't add`
      });
      return;
    }
    if (!body) {
      dialog.showMessageBox({
        type: 'info',
        message: `${address} is available but not giving any data, can't add`
      });
      return;
    }
    let { workerName } = body;
    if (!workerName) {
      dialog.showMessageBox({
        type: 'info',
        message: `${address} has no worker name`
      });
      return;
    }
    config[Config.CLUSTER].push({ address, workerName });
    save();
    getHashrate(address);
    if (ipcClusterMonitor)
      ipcClusterMonitor.send('cluster', config[Config.CLUSTER]);
  });
});

ipcMain.on('deleteWorker', (event, workerName) => {
  if (!workerName) return;
  for (i = 0; i < config[Config.CLUSTER].length; i++) {
    let worker = config[Config.CLUSTER][i];
    if (worker.workerName == workerName) {
      if (addressesToStop.indexOf(worker.address) == -1)
        addressesToStop.push(worker.address);
      config[Config.CLUSTER].splice(i, 1);
      save();
      i--;
      if (ipcClusterMonitor) {
        ipcClusterMonitor.send('cluster', config[Config.CLUSTER]);
      }
    }
  }
});

ipcMain.on('disableWorker', (event, workerName) => {
  if (!workerName) return;
  for (i = 0; i < config[Config.CLUSTER].length; i++) {
    let worker = config[Config.CLUSTER][i];
    if (worker.workerName == workerName) {
      if (addressesToStop.indexOf(worker.address) == -1)
        addressesToStop.push(worker.address);
    }
  }
});

function save() {
  fs.writeFile(configPath, JSON.stringify(config), function(err) {
    if (err) {
      console.log('error saving config');
    } else {
      console.log('saved');
    }
  });
}

function setAutoLaunch(enabled) {
  autoLauncher
    .isEnabled()
    .then(function(isEnabled) {
      if (isEnabled && !enabled) {
        autoLauncher.disable();
      } else if (!isEnabled && enabled) {
        autoLauncher.enable();
      }
    })
    .catch(function(err) {
      console.log('error getting auto launch');
    });
}

ipcMain.on('init', event => {
  ipcRenderer = event.sender;
  ipcRenderer.send('init', {
    config,
    gpus
  });
});

async function killAllEthminers(signal) {
  for (i = 0; i < ethminerInstances.length; i++) {
    for (j = 0; j < ethminerInstances[i].length; j++) {
      if (ethminerInstances[i][j].startTimeout) {
        //console.log('start timeout cleared', i, j);
        clearTimeout(ethminerInstances[i][j].startTimeout);
      }
      if (
        ethminerInstances[i][j].instance &&
        ethminerInstances[i][j].instance.kill &&
        ethminerInstances[i][j].instance.stdout &&
        ethminerInstances[i][j].instance.stderr
      ) {
        await ethminerInstances[i][j].instance.stdout.removeAllListeners(
          'data'
        );
        await ethminerInstances[i][j].instance.stderr.removeAllListeners(
          'data'
        );
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

ipcMain.on('stop', event => {
  killAllEthminers('SIGTERM');
  stopCheckingInstances();
  stopBroadcastingHashrates();
});

ipcMain.on('on', (event, data) => {
  let { platformID, deviceID, mine } = data;
  if (platformID >= gpus.length || deviceID >= gpus[platformID].length) return;
  if (
    platformID < ethminerInstances.length &&
    deviceID < ethminerInstances[platformID].length
  ) {
    let ethminerInstance = ethminerInstances[platformID][deviceID];
    if (ethminerInstance.instance) {
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

ipcMain.on('off', async (event, data) => {
  let { platformID, deviceID } = data;
  if (platformID >= gpus.length || deviceID >= gpus[platformID].length) return;
  if (
    platformID >= ethminerInstances.length ||
    deviceID >= ethminerInstances[platformID].length
  )
    return;
  let gpu = gpus[platformID][deviceID];
  let ethminerInstance = ethminerInstances[platformID][deviceID];
  ethminerInstance.hashrate = '';
  ethminerInstance.shares = '';
  ethminerInstance.off = true;
  if (ethminerInstance.instance && ethminerInstance.instance.kill) {
    await ethminerInstance.instance.kill('SIGTERM');
    delete ethminerInstance.instance;
  } else {
    ipcRenderer.send('state', {
      platformID,
      deviceID,
      nextState: State.ON
    });
  }
});

function saveConfig(
  gpus,
  wallet,
  workerName,
  stratum,
  failoverStratum,
  autoStart
) {
  let devices = {};
  for (i = 0; i < gpus.length; i++) {
    if (gpus[i])
      for (j = 0; j < gpus[i].length; j++) {
        let deviceName = gpus[i][j].deviceName;
        if (!deviceName) continue;
        if (!devices[deviceName])
          devices[deviceName] = { mine: gpus[i][j].mine };
        else devices[deviceName].mine = gpus[i][j].mine;
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
  dialog.showMessageBox({ type: 'info', message });
});

ipcMain.on('save', (event, data) => {
  let { gpus, wallet, workerName, stratum, failoverStratum, autoStart } = data;
  saveConfig(gpus, wallet, workerName, stratum, failoverStratum, autoStart);
  setAutoLaunch(autoStart);
});

function initializeEthminerInstances(platformID, deviceID) {
  while (ethminerInstances.length <= platformID) ethminerInstances.push([]);
  while (ethminerInstances[platformID].length <= deviceID)
    ethminerInstances[platformID].push({});
}

ipcMain.on('start', (event, data) => {
  killAllEthminers('SIGTERM');
  let { gpus, wallet, workerName, stratum, failoverStratum, autoStart } = data;
  saveConfig(gpus, wallet, workerName, stratum, failoverStratum, autoStart);
  if (gpus) {
    var count = 0;
    for (j = 0; j < gpus.length; j++) {
      let platform = gpus[j];
      for (i = 0; i < platform.length; i++) {
        if (platform[i].hashrate) delete platform[i].hashrate;
        let { platformID, deviceID, deviceName, mine } = platform[i];
        if (mine) {
          initializeEthminerInstances(platformID, deviceID);
          ethminerInstances[platformID][deviceID].startTimeout = setTimeout(
            function() {
              startMining(platformID, deviceID, deviceName, mine);
            },
            count * 20000 + 500
          );
          count++;
        } else {
          // since mine doesn't exist will fire notification
          //startMining(platformID, deviceID, deviceName, mine);
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
      let {
        instance,
        lastActivity,
        platformID,
        deviceID,
        off
      } = ethminerInstances[i][j];
      if (!lastActivity || off) continue;
      let now = Date.now();
      if (now - lastActivity > 120000) {
        // 2 minutes of inactivity, should restart
        restartInstance(platformID, deviceID);
        ethminerInstances[i][j].restartCount++;
        if (ipcRenderer) {
          ipcRenderer.send('restarted', {
            platformID,
            deviceID,
            restartCount: ethminerInstances[i][j].restartCount
          });
        }
      }
    }
  }
}

async function restartInstance(platformID, deviceID) {
  if (
    platformID >= ethminerInstances.length ||
    deviceID >= ethminerInstances[platformID].length
  )
    return;
  if (platformID >= gpus.length || deviceID >= gpus[platformID].length) return;
  let gpu = gpus[platformID][deviceID];
  if (!gpu) return;
  let ethminerInstance = ethminerInstances[platformID][deviceID];
  if (!ethminerInstance) return;
  ethminerInstance.hashrate = 'Restarting';
  let { deviceName, mine } = gpu;
  let { instance } = ethminerInstance;
  if (instance && instance.kill) {
    await instance.kill('SIGTERM');
    delete ethminerInstance.instance;
  }
  setTimeout(function() {
    startMining(platformID, deviceID, deviceName, mine);
  }, 2000);
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
  if (
    ethminerInstances.length <= lastPlatformID ||
    ethminerInstances[lastPlatformID] == null ||
    ethminerInstances[lastPlatformID].length <= lastDeviceID
  ) {
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
  let nextDeviceID = lastDeviceID + 1;
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
  if (hashrate && hashrate != '0.00 Mh/s') {
    let floatHashrate = parseFloat(hashrate);
    if (floatHashrate) {
      if (floatHashrate != 0) {
        ethminerInstance.lastActivity = Date.now();
        ethminerInstance.hashrate = floatHashrate;
      }
    } else ethminerInstance.hashrate = hashrate;
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
  if (
    platformID < ethminerInstances.length &&
    deviceID < ethminerInstances[platformID].length
  ) {
    let ethminerInstance = ethminerInstances[platformID][deviceID];
    if (ethminerInstance && ethminerInstance.instance) {
      console.log('already mining on that gpu');
      return;
    }
  }
  let { wallet, workerName, stratum, failoverStratum, autoStart } = config;
  let args = [
    '-O',
    `${wallet}.${workerName}_${mine}${deviceID}`,
    '--farm-recheck',
    '200',
    '-S',
    stratum
  ];
  if (failoverStratum) {
    args.push('-FS', failoverStratum);
  }
  switch (mine) {
    case 'cuda':
      //console.log(`begin cuda mining platformID: ${platformID}, deviceID: ${deviceID}`);
      args.push('-U', '--cuda-devices', deviceID);
      break;
    case 'opencl':
      //console.log(`begin opencl mining platformID: ${platformID}, deviceID: ${deviceID}`);
      args.push(
        '-G',
        '--opencl-platform',
        platformID,
        '--opencl-devices',
        deviceID
      );
      break;
  }
  const ethminerInstance = spawn(ethminer, args);
  ethminerInstance.stdout.on('data', data => {
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
  ethminerInstance.stderr.on('data', data => {
    if (shouldKill) return;
    // ethminer sends progress through stderr for some odd reason

    let dataString = stripAnsi(data.toString());
    //console.log(`stderr: ${dataString}`);
    const dagRegex = /DAG\s(\d+)\s%/g;
    let dagMatches = dataString.match(dagRegex);
    if (dagMatches && dagMatches.length == 1) {
      let hashrate = dagMatches[0];
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
  ethminerInstance.on('close', code => {
    if (shouldKill) return;
    //console.log(`ethminer instance closed with code ${code}`);
    if (ipcRenderer)
      ipcRenderer.send('state', {
        platformID,
        deviceID,
        nextState: 'On',
        message: code ? 'Error' : 'Closed'
      });
  });
  while (ethminerInstances.length <= platformID) ethminerInstances.push([]);
  while (ethminerInstances[platformID].length <= deviceID)
    ethminerInstances[platformID].push({});
  ethminerInstances[platformID][deviceID] = {
    instance: ethminerInstance,
    lastActivity: Date.now(),
    platformID,
    deviceID,
    restartCount: 0,
    hashrate: 0
  };
  if (ipcRenderer)
    ipcRenderer.send('state', {
      platformID,
      deviceID,
      nextState: State.OFF
    });
}

// Keep a global reference of the window object, if you don't, the window will
// be closed automatically when the JavaScript object is garbage collected.
let mainWindow;

async function listDevices() {
  gpus.length = 0;
  const result = stripAnsi(execSync(`${ethminer} --list-devices`).toString());
  var devicesRegex = /\[(\d+)\].\[(\d+)\].*/g;
  var devices = result.match(devicesRegex);
  var numbersRegex = /\d+/g;
  var memorySizeRegex = /(?:CL_DEVICE_GLOBAL_MEM_SIZE:\s)(\d+)/g;
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
    if (config && config[Config.DEVICES])
      configDevice = config[Config.DEVICES][deviceName];
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
    while (ethminerInstances[platformID].length <= deviceID)
      ethminerInstances[platformID].push({});
    gpus[platformID][deviceID] = {
      platformID,
      deviceID,
      deviceName,
      memory: memorySizes && i < memorySizes.length ? memorySizes[i] : null,
      mine
    };
  }
}

let shouldKill = false;
let saveTimeout;
function createWindow() {
  // Create the browser window.
  let iconPath = path.resolve(
    __dirname,
    `./img/ethereum.${
      os.platform() == 'win32'
        ? 'ico'
        : os.platform() == 'darwin' ? 'icns' : 'png'
    }`
  );
  // console.log('icon path', iconPath);
  mainWindow = new BrowserWindow({
    width: config[Config.WIDTH] || 1200,
    height: config[Config.HEIGHT] || 900,
    icon: iconPath
  });
  mainWindow.on('resize', e => {
    let size = mainWindow.getSize();
    config[Config.WIDTH] = size[0];
    config[Config.HEIGHT] = size[1];
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(save, 1000);
  });
  // and load the index.html of the app.
  mainWindow.loadURL(
    url.format({
      pathname: path.join(__dirname, 'index.html'),
      protocol: 'file:',
      slashes: true
    })
  );

  var editMenu = {
    label: 'Edit',
    submenu: [
      { label: 'Undo', accelerator: 'CmdOrCtrl+Z', selector: 'undo:' },
      { label: 'Redo', accelerator: 'Shift+CmdOrCtrl+Z', selector: 'redo:' },
      { type: 'separator' },
      { label: 'Cut', accelerator: 'CmdOrCtrl+X', selector: 'cut:' },
      { label: 'Copy', accelerator: 'CmdOrCtrl+C', selector: 'copy:' },
      { label: 'Paste', accelerator: 'CmdOrCtrl+V', selector: 'paste:' },
      {
        label: 'Select All',
        accelerator: 'CmdOrCtrl+A',
        selector: 'selectAll:'
      }
    ]
  };
  var template = [
    {
      label: 'Application',
      submenu: [
        {
          label: 'About Application',
          selector: 'orderFrontStandardAboutPanel:'
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: function() {
            app.quit();
          }
        }
      ]
    },
    editMenu,
    {
      label: 'Tools',
      submenu: [
        {
          label: 'Cluster Monitor',
          accelerator: 'CmdOrCtrl+D',
          click() {
            let clusterMonitor = new BrowserWindow({
              width: 800,
              height: 600,
              icon: iconPath
            });
            clusterMonitor.setMenu(Menu.buildFromTemplate([editMenu]));
            clusterMonitor.loadURL(path.join(__dirname, 'cluster.html'));
            clusterMonitor.webContents.openDevTools();
            clusterMonitor.on('closed', () => {
              stopFetchingCluster();
              ipcClusterMonitor = null;
            });
          }
        },
        {
          label: 'Reset Data',
          submenu: [
            {
              label: 'Confirm',
              submenu: [
                {
                  label: 'Yes',
                  async click() {
                    config = {};
                    await save();
                    app.quit();
                  }
                },
                { label: 'No' }
              ]
            }
          ]
        }
      ]
    }
  ];

  mainWindow.setMenu(Menu.buildFromTemplate(template));

  // Open the DevTools.
  //mainWindow.webContents.openDevTools()

  // Emitted when the window is closed.
  mainWindow.on('closed', function() {
    // Dereference the window object, usually you would store windows
    // in an array if your app supports multi windows, this is the time
    // when you should delete the corresponding element.
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', function() {
  createWindow();
  listDevices();
});

// Quit when all windows are closed.
app.on('window-all-closed', async function() {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  //if (process.platform !== 'darwin') {
  shouldKill = true;
  await killAllEthminers('SIGTERM');
  app.quit();
  //}
});

app.on('activate', function() {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  }
});
