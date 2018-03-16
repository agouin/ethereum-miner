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
- **[Download](https://github.com/agouin/ethereum-miner/releases) and run ethereum-miner**
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
- Run [atikmdag-patcher](https://www.monitortests.com/forum/Thread-AMD-ATI-Pixel-Clock-Patcher) to repatch and sign the driver to allow the modded BIOS to run (only required if you modded your GPU BIOS)
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
- NVIDIA
  - /etc/X11/xorg.conf (example file provided)
    - To allow overclocking, include `Option "Coolbits" "28"` for your NVIDIA devices
    - When a monitor is not plugged in to a device, make sure that you are using the `Option "AllowEmptyInitialConfiguration" "true"` for the device and ensure that the screens are declared in the `Section "ServerLayout"`
  - Use nvidia-settings to overclock
    ```bash
    # Example for GTX 1060
    nvidia-settings -a '[gpu:0]/GPUMemoryTransferRateOffset[3]=1000'`
    ```
- AMD
  - Use Windows and MSI Afterburner to find good clock/power/straps settings for your BIOS (perform all Windows optimizations above)
  - Once the GPU BIOS is flashed, it will work in any Operating System, so the settings all carry over to Ubuntu. Ubuntu has slightly(<5%) higher hashrates for AMD cards compared to Windows in my experience.

#### Overclocking
There has been reported success with the following overclocks. For AMD, the clocks can be set with an overclocking tool like MSI Afterburner or by flashing the BIOS. For NVIDIA, the BIOS is encrypted so cannot be easily flashed to overclock, so a tool like MSI Afterburner or nvidia-settings should be used.

| Device           | Memory Rate (MHz) | Hashrate (Mh/s) |
| ---------------- | ----------------- | ----- |
| AMD RX 580       | 2050              | 28.3  |
| AMD RX 570       | 2000              | 27.6  |
| AMD RX 560       | 1750              | 11.4  |
| NVIDIA GTX 1080  | +600              | 35.5  |
| NVIDIA GTX 1070  | +550              | 30.5  |
| NVIDIA GTX 1060  | +500              | 22.8  |

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
