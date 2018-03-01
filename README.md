## Ethereum Mining GUI
###### Built using [electron](https://electronjs.org/) and [ethminer](https://github.com/ethereum-mining/ethminer)

## Features
- Windows/mac/linux
- AMD and NVIDIA
- Hashrate and Shares monitoring of each GPU
- Manual control of each GPU
- Cascaded launch sequence
- Auto restart GPUs*
- Auto start with program launch
- No Donation

## To Use
- [Download](https://github.com/agouin25/ethereum-miner/releases) and run ethereum-miner
- Input wallet address, worker name, stratum address, choose "Mine" option for each GPU, then Start
 
For best results with AMD GPUs, download the beta blockchain drivers for [Windows](https://support.amd.com/en-us/kb-articles/Pages/Radeon-Software-Crimson-ReLive-Edition-Beta-for-Blockchain-Compute-Release-Notes.aspx) or [Ubuntu 16.04](https://support.amd.com/en-us/kb-articles/Pages/AMDGPU-Pro-Beta-Mining-Driver-for-Linux-Release-Notes.aspx)

## To Build

```bash
# Install dependencies
npm i
# Run the app
npm start
# Package the app
npm run package
```

---
\* Automatically restart GPUs if they hang up to 10 times at which time they are considered failed
