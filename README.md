## Ethereum Mining GUI
###### Built using [electron](https://github.com/electron/electron-quick-start) and [ethminer](https://github.com/ethereum-mining/ethminer)

## Features
- Windows/mac/linux
- AMD and NVIDIA
- Hashrate and Shares monitoring of each GPU
- Manual control of each GPU
- Cascaded launch sequence
- View other workers on LAN and total hashrate
- Auto restart GPUs*
- Auto start with program launch
- No Donation

## To Use
- **[Download](https://github.com/agouin25/ethereum-miner/releases) and run ethereum-miner**
- Input wallet address, worker name, stratum address, choose 'Mine' option for each GPU, then Start
- To monitor other workers, open 'Tools' menu and open the 'Cluster Monitor'
 
#### For best results with AMD GPUs, download the beta blockchain drivers for [Windows](https://support.amd.com/en-us/kb-articles/Pages/Radeon-Software-Crimson-ReLive-Edition-Beta-for-Blockchain-Compute-Release-Notes.aspx) or [Ubuntu 16.04](https://support.amd.com/en-us/kb-articles/Pages/AMDGPU-Pro-Beta-Mining-Driver-for-Linux-Release-Notes.aspx). 
### Install the AMD Blockchain driver 
***On Windows, every time the GPU configuration is changed, even one card added/removed, it will likely install the default driver for all of your cards. Every time this happens you will need to go through these steps***
- Open Device Manager and right click on one of your AMD GPUs with the modded BIOS
- Click 'Update Driver'
- Click 'Browse my computer for driver software'
- Click 'Let me pick from a list of available drivers on my computer'
- Click 'Have Disk'
- Cick 'Browse'
- Navigate to C:/AMD/Win10-64Bit-Crimson-ReLive-Beta-Blockchain-Workloads-Aug23/Packages/Drivers/Display/WT6A_INF
- Open the .inf file
- Click 'OK'
- The Update Drivers window should now have your GPU name highlighted
- Click 'Next'
The driver will install for all of your AMD GPUs, and the devices may not yet be enabled due to the BIOS mods, that is okay. Don't reboot yet. If Windows crashes here with a BSOD, it probably installed, restart and go to the next step.
- Run [atikmdag-patcher](https://www.monitortests.com/forum/Thread-AMD-ATI-Pixel-Clock-Patcher) to repatch and sign the driver to allow the modded BIOS to run
- Reboot

### Optimizations 
#### Windows
- [MSI Afterburner](https://www.msi.com/page/afterburner) is an easy way overclock the memory clocks for both AMD and NVIDIA cards. You can also limit your power consumption. 
- On AMD cards, the combo of blockchain drivers, timing straps BIOS flash, and MSI Afterburner will provide the largest hashrate gains.
- For AMD Radeon RX 4XX/RX 5XX/Radeon Pro Duo Polaris/etc:
  - Backup stock GPU BIOS with [ATIFlash](https://www.techpowerup.com/download/ati-atiflash/)
  - Modify timing straps, clocks, and power using [PolarisBiosEditor](https://github.com/jaschaknack/PolarisBiosEditor)
  - Flash GPU BIOS with ATIFlash

#### Ubuntu
- For NVIDIA cards you can use tools like nvidia-settings to overclock
- For AMD cards, use Windows and MSI Afterburner to find good clock/power settings for your BIOS, set those into Polaris Bios Editor, modify the timing straps, save the BIOS, and then flash the BIOS to the GPU as described above to have the settings all carry over to Ubuntu. Ubuntu has slightly(<5%) higher hashrates for AMD cards compared to Windows.

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
