const { State } = require('./utils.js');
var curState = State.OFF;
var gpus = [];

var totalHashrateElement;
var totalSharesElement;

const { ipcRenderer } = require('electron')
var autoStart;
function getSelect(id) {
    return `
    <div class='mui-select'>
      <select id="${id}">
        <option value="disabled" selected>Disabled</option>
        <option value="opencl">OpenCL (AMD)</option>
        <option value="cuda">CUDA (NVIDIA)</option>
      </select>
    </div>`;
}
function round(value, decimals) {
    return Number(Math.round(value + 'e' + decimals) + 'e-' + decimals);
}

ipcRenderer.on('restarted', (event, data) => {
    let { deviceID, platformID, restartCount } = data;
    if (platformID >= gpus.length || deviceID >= gpus[platformID].length) return;
    let gpu = gpus[platformID][deviceID];
    if (!gpu.hashrateElement) return;
    gpu.hashrateElement.innerHTML = "Restarting";
    if (!gpu.restartsElement) return;
    gpu.restartsElement.innerHTML = `${restartCount}`;
});

ipcRenderer.on('init', (event, data) => {
    let { config } = data;
    gpus = data.gpus;
    totalHashrateElement = document.getElementById('total');
    totalSharesElement = document.getElementById('totalShares');
    document.getElementById('wallet').value = config.wallet || "";
    document.getElementById('workerName').value = config.workerName || "";
    document.getElementById('stratum').value = config.stratum || "";
    document.getElementById('failoverStratum').value = config.failoverStratum || "";
    document.getElementById('autoStart').checked = config.autoStart || false;
    let deviceTableHTML = `
  <col>
  <col>
  <col>
  <col>
  <col>
  <col id='hashrateCol'>
  <col>
  <thead>
    <tr>
      <th>Platform ID</th>
      <th>Device ID</th>
      <th>Device Name</th>
      <th>Memory</th>
      <th class='mine'>Mine</th>
      <th>Hashrate</th>
      <th>Shares</th>
      <th>Last Activity</th>
      <th>Auto Restarts</th>
      <th>Manual</th>
    </tr>
  </thead><tbody>`;
    gpus.forEach(platform => {
        platform.forEach(gpu => {
            gpu.state = State.OFF;
            let { platformID, deviceID, deviceName, memory } = gpu;
            let select = getSelect(`select${platformID} ${deviceID}`);
            deviceTableHTML += `
        <tr>
            <td>${platformID}</td>
            <td>${deviceID}</td>
            <td>${deviceName}</td>
            <td>${round(parseInt(memory) / 1000000000.0, 2)}GB</td>
            <td class='mine'>${select}</td>
            <td class='hashrate' platformID='${platformID}' deviceID='${deviceID}' id='hashrate${platformID} ${deviceID}'></td>
            <td class='shares' platformID='${platformID}' deviceID='${deviceID}' id='shares${platformID} ${deviceID}'></td>
            <td class='last' id='last${platformID} ${deviceID}'></td>
            <td class='restarts' id='restarts${platformID} ${deviceID}'></td>
            <td><button class='mui-btn mui-btn--primary' id='manual${platformID} ${deviceID}' platformID='${platformID}' deviceID='${deviceID}'>On</button></td>
        </tr>`;
        });
    })
    deviceTableHTML += "</tbody>";
    document.getElementById('deviceTable').innerHTML = deviceTableHTML;
    gpus.forEach(platform => {
        platform.forEach(gpu => {
            let { platformID, deviceID, deviceName, mine } = gpu;
            gpu.hashrateElement = document.getElementById(`hashrate${platformID} ${deviceID}`);
            gpu.sharesElement = document.getElementById(`shares${platformID} ${deviceID}`);
            gpu.lastElement = document.getElementById(`last${platformID} ${deviceID}`);
            gpu.restartsElement = document.getElementById(`restarts${platformID} ${deviceID}`);
            gpu.manualElement = document.getElementById(`manual${platformID} ${deviceID}`);
            if (gpu.manualElement) {
                gpu.manualElement.addEventListener('click', function (event) {
                    if (!gpu.mine) {
                        ipcRenderer.send('dialog', 'Device is not enabled for mining');
                        return;
                    }
                    delete gpus[platformID][deviceID].restarts;
                    gpu.manualElement.setAttribute('disabled', 'disabled');
                    switch (gpu.state) {
                        case State.OFF:
                            gpu.manualElement.innerHTML = "Turning On";
			    curState = State.ON;
                            ipcRenderer.send('on', { platformID, deviceID, mine: gpu.mine });
                            break;
                        case State.ON:
                            gpu.manualElement.innerHTML = "Turning Off";
                            ipcRenderer.send('off', { platformID, deviceID });
                            break;
                    }

                    if (gpu.restartsElement)
                        gpu.restartsElement.innerHTML = "";
                });
            }
            let id = `select${platformID} ${deviceID}`;
            let select = document.getElementById(id);
            if (mine)
                select.value = mine;
            select.addEventListener('change', function () {
                gpu.mine = select.value;
                if (select.value == "disabled") delete gpu.mine;
                else gpu.mine = select.value;
            });
        });
    });
    if (config.autoStart == true) {
        setTimeout(start, 5000);
    }
})

var autoStartCheckbox = document.getElementById('autoStart');
autoStartCheckbox.addEventListener('change', function () {
    autoStart = autoStartCheckbox.checked;
});

function addToShares(platformID, deviceID, shares) {
    while (gpus.length <= platformID) gpus.push([]);
    while (gpus[platformID].length <= deviceID) gpus[platformID].push({});
    let gpu = gpus[platformID][deviceID];
    if (gpu.sharesElement)
        gpu.sharesElement.innerHTML = shares;
    gpu.shares = shares;
    let totalAccepted = 0, totalAccepted2 = 0, totalRejected = 0, totalRejected2 = 0, totalFound = 0;
    for (i = 0; i < gpus.length; i++) {
        for (j = 0; j < gpus[i].length; j++) {
            if (!gpus[i][j].shares) continue;
            let split = gpus[i][j].shares.split(':');
            if (split.length != 3) continue;
            let acceptedSplit = split[0].replace("A", "").split("+");
            let rejectedSplit = split[1].replace("R", "").split("+");
            if (acceptedSplit.length != 2) continue;
            if (rejectedSplit.length != 2) continue;
            totalAccepted += parseInt(acceptedSplit[0]);
            totalAccepted2 += parseInt(acceptedSplit[1]);
            totalRejected += parseInt(rejectedSplit[0]);
            totalRejected2 += parseInt(rejectedSplit[1]);
            totalFound += parseInt(split[2].replace("F", ""));
        }
    }
    if (totalSharesElement)
        totalSharesElement.innerHTML = `A${totalAccepted}+${totalAccepted2}:R${totalRejected}+${totalRejected2}:F${totalFound}`;

};

function calculateTotalHashrate() {
    var total = 0.0;
    for (i = 0; i < gpus.length; i++) {
	let gpuPlatforms = gpus[i];
        for (j = 0; j < gpus[i].length; j++) {
            let gpu = gpuPlatforms[j];
            if (!gpu) continue;
            let hashrate = gpu.hashrate;
            if (!hashrate) continue;
            if (isNaN(hashrate)) continue;
            let floatHashrate = parseFloat(hashrate);
            if (floatHashrate) total += floatHashrate;
        }
    }
    let hashrate = round(total, 2).toFixed(2);
    if (totalHashrateElement)
        totalHashrateElement.innerHTML = `${isNaN(hashrate) ? "0.00" : `${hashrate} Mh/s`}`;
}

ipcRenderer.on('hashrate', (event, stats) => {
    if (curState == State.OFF) return;
    while (gpus.length <= stats.platformID) gpus.push([]);
    while (gpus[stats.platformID].length <= stats.deviceID) gpus[stats.platformID].push({});
    let gpu = gpus[stats.platformID][stats.deviceID];
    if (stats.hashrate != 0 && gpu.hashrateElement)
        if (!isNaN(stats.hashrate)) gpu.hashrateElement.innerHTML = round(stats.hashrate, 2).toFixed(2) + " Mh/s";
        else gpu.hashrateElement.innerHTML = stats.hashrate;
    gpu.lastActivity = new Date();
    if (gpu.lastElement)
        gpu.lastElement.innerHTML = gpu.lastActivity.toLocaleString();
    if (stats.shares)
        addToShares(stats.platformID, stats.deviceID, stats.shares);

    if (stats.hashrate && stats.hashrate instanceof String && stats.hashrate.includes("DAG")) return;

    gpu.hashrate = stats.hashrate;
    calculateTotalHashrate();
});

ipcRenderer.send('init');

function start() {
    document.getElementById('start').setAttribute('disabled', 'disabled');
    let devicesStarting = 0;
    for (i = 0; i < gpus.length; i++) {
        for (j = 0; j < gpus[i].length; j++) {
            let gpu = gpus[i][j];
            if (!gpu.mine || gpu.mine == "disabled") continue;
            if (gpu.hashrateElement) gpu.hashrateElement.innerHTML = "Queued";
            devicesStarting++;
            delete gpu.hashrate;
            delete gpu.restarts;
        }
    }
    
    if (devicesStarting == 0) {
        ipcRenderer.send('dialog', 'No devices enabled for mining');
        return;
    }
    ipcRenderer.send('start', {
        gpus,
        wallet: document.getElementById("wallet").value,
        workerName: document.getElementById("workerName").value,
        stratum: document.getElementById('stratum').value,
        failoverStratum: document.getElementById('failoverStratum').value,
        autoStart: document.getElementById('autoStart').checked
    });
    //curState = State.ON;
}

ipcRenderer.on('state', function (event, data) {
    let { platformID, deviceID, nextState, message } = data;
    if (platformID >= gpus.length || deviceID >= gpus[platformID].length) return;
    let gpu = gpus[platformID][deviceID];
    if (gpu.manualElement) {
        gpu.manualElement.innerHTML = nextState;
        switch (nextState) {
            case State.ON:
                gpu.state = State.OFF;
                delete gpu.hashrate;
                if (message && gpu.hashrateElement) gpu.hashrateElement.innerHTML = message;
                gpu.manualElement.classList.remove('mui-btn--danger');
                gpu.manualElement.classList.add('mui-btn--primary');
                break;
            case State.OFF:
                gpu.state = State.ON;
                if (gpu.hashrateElement) gpu.hashrateElement.innerHTML = "Launching"
                gpu.manualElement.classList.remove('mui-btn--primary');
                gpu.manualElement.classList.add('mui-btn--danger');
                break;
        }
        checkState();
        gpu.manualElement.removeAttribute('disabled');
    }
})

function checkState() {
    var allOff = true;
    var numberMining = 0;
    for (i = 0; i < gpus.length; i++) {
        for (j = 0; j < gpus[i].length; j++) {
            let gpu = gpus[i][j];
            if (!gpu.mine) continue;
            numberMining++;
            if (gpu.state == State.ON) allOff = false;
        }
    }
    if (numberMining == 0) return;
    if (allOff) {
        curState = State.OFF;
        if (ipcRenderer) ipcRenderer.send('stop');
        document.getElementById('start').innerHTML = "Start";
        document.getElementById('stop').style.display = 'none';
        document.getElementById('start').removeAttribute('disabled');
        document.getElementById('stop').removeAttribute('disabled');
    } else {
        curState = State.ON;
        document.getElementById('start').innerHTML = "Reset";
        document.getElementById('stop').style.display = 'inline';
        document.getElementById('start').removeAttribute('disabled');
    }

}

function stop() {
    ipcRenderer.send('stop');
    document.getElementById('stop').setAttribute('disabled', 'disabled');
    let hashrateCells = document.getElementsByClassName('hashrate');
    if (hashrateCells)
        for (i = 0; i < hashrateCells.length; i++) {
            hashrateCells[i].innerHTML = "";
        }
    let sharesCells = document.getElementsByClassName('hashrate');
    if (sharesCells)
        for (i = 0; i < sharesCells.length; i++) {
            sharesCells[i].innerHTML = "";
        }
    let restartsCells = document.getElementsByClassName('restarts');
    if (restartsCells)
        for (i = 0; i < restartsCells.length; i++) {
            restartsCells[i].innerHTML = "";
        }
    let lastCells = document.getElementsByClassName('last');
    if (lastCells)
        for (i = 0; i < lastCells.length; i++) {
            lastCells[i].innerHTML = "";
        }

    if (totalHashrateElement)
        totalHashrateElement.innerHTML = '';
    if (totalSharesElement)
        totalSharesElement.innerHTML = '';
}

function save() {
    ipcRenderer.send('save', {
        gpus,
        wallet: document.getElementById("wallet").value,
        workerName: document.getElementById("workerName").value,
        stratum: document.getElementById('stratum').value,
        failoverStratum: document.getElementById('failoverStratum').value,
        autoStart: document.getElementById('autoStart').checked
    });
}
exports.start = start;
exports.stop = stop;
exports.save = save;
exports.State = State;
