# Plugged-in Mode

A GNOME Shell extension for managing battery charging profiles directly from Quick Settings.

Developed and tested on the MSI Thin A15 B7UC. The extension uses UPower for the native charging profiles and a small privileged helper for the custom 50–60% Plugged-in profile.

The Plugged-in profile is persisted across reboots using a systemd oneshot service.

## Charging Profiles

| Profile                 | Charge Range | Implementation                     |
| ----------------------- | ------------ | ---------------------------------- |
| Maximize Charge         | 90–100%      | UPower                             |
| Preserve Battery Health | 70–80%       | UPower                             |
| Plugged-in              | 50–60%       | `msi-ec` + privileged sysfs helper |

## Compatibility

Currently tested with:

- MSI Thin A15 B7UC
- GNOME Shell 50
- UPower with charge-threshold support
- `msi-ec`
- Linux exposing writable:
  - `charge_control_start_threshold`
  - `charge_control_end_threshold`

Other MSI laptops may work if they are supported by `msi-ec` and expose compatible Linux power-supply charge-threshold interfaces.

At the moment, only the MSI Thin A15 B7UC is tested and officially supported by this project.

## Repository Structure

```text
plugged-in-mode/
├── extension/
│   ├── extension.js
│   ├── metadata.json
│   └── icons/
│       ├── ac-plug-bolt-symbolic.svg
│       ├── battery-level-80-plugged-in-symbolic.svg
│       └── battery-level-100-charged-full-symbolic.svg
├── system/
│   ├── plugged-in-mode-helper
│   ├── plugged-in-mode-restore.service
│   └── com.cjtlabs.plugged-in-mode.policy
├── install.sh
├── uninstall.sh
├── README.md
├── LICENSE
└── .gitignore
```

## Requirements

- GNOME Shell 50
- UPower
- `pkexec`
- polkit
- systemd
- `msi-ec`
- Writable Linux battery charge-threshold interfaces

For the custom 50–60% profile, the system must expose writable charge-threshold files under:

```text
/sys/class/power_supply/
```

Specifically:

```text
charge_control_start_threshold
charge_control_end_threshold
```

You can check whether these interfaces are available with:

```bash
find /sys/class/power_supply \
  -name charge_control_start_threshold \
  -o -name charge_control_end_threshold
```

On supported systems, you should see paths similar to:

```text
/sys/class/power_supply/BAT1/charge_control_start_threshold
/sys/class/power_supply/BAT1/charge_control_end_threshold
```

## msi-ec

The custom Plugged-in profile depends on the kernel exposing writable battery charge thresholds.

On the MSI Thin A15 B7UC, these interfaces are provided through `msi-ec`.

You can check whether the module is loaded with:

```bash
lsmod | grep msi_ec
```

If `msi-ec` was installed through DKMS, you can also check:

```bash
dkms status | grep msi
```

Plugged-in Mode does not install or configure `msi-ec`.

The required kernel/driver support must already be installed and working before using the custom 50–60% profile.

## Installation

Clone the repository:

```bash
git clone https://github.com/cjtlabs/plugged-in-mode.git
cd plugged-in-mode
```

Make the installer executable if necessary:

```bash
chmod +x install.sh
```

Run the installer as your normal user:

```bash
./install.sh
```

Do not run the entire installer with `sudo`.

The installer requests elevated privileges only when installing the system-level helper, polkit policy, systemd service, and state directory.

It also reloads systemd and enables the Plugged-in Mode restore service for future boots.

After installation, log out and back in so GNOME Shell can discover the extension.

Then enable it:

```bash
gnome-extensions enable plugged-in-mode@cjtlabs.github.io
```

Verify that the extension is active:

```bash
gnome-extensions info plugged-in-mode@cjtlabs.github.io
```

You should see:

```text
Enabled: Yes
State: ACTIVE
```

## Installed Files

The GNOME Shell extension is installed to:

```text
~/.local/share/gnome-shell/extensions/plugged-in-mode@cjtlabs.github.io/
```

The privileged helper is installed to:

```text
/usr/local/libexec/plugged-in-mode-helper
```

The polkit policy is installed to:

```text
/usr/share/polkit-1/actions/com.cjtlabs.plugged-in-mode.policy
```

The systemd restore service is installed to:

```text
/etc/systemd/system/plugged-in-mode-restore.service
```

Persistent Plugged-in Mode state is stored under:

```text
/var/lib/plugged-in-mode/
```

When the custom profile is active, the state file is:

```text
/var/lib/plugged-in-mode/profile
```

## How It Works

### Maximize Charge

Uses UPower's native charge-threshold support to configure the battery for the 90–100% charging range.

UPower remains responsible for restoring this profile across reboots.

### Preserve Battery Health

Uses UPower's native charge-threshold support to configure the battery for the 70–80% charging range.

UPower remains responsible for restoring this profile across reboots.

### Plugged-in

The custom Plugged-in profile configures a 50–60% charging range.

GNOME Shell runs the extension as the logged-in user, but writing charge thresholds through sysfs requires elevated privileges.

The extension therefore invokes the installed helper through `pkexec`:

```text
pkexec /usr/local/libexec/plugged-in-mode-helper enable
```

The included polkit policy authorizes the helper for an active local session.

The helper writes:

```text
50
```

to:

```text
/sys/class/power_supply/BAT1/charge_control_start_threshold
```

and:

```text
60
```

to:

```text
/sys/class/power_supply/BAT1/charge_control_end_threshold
```

It then verifies that both values were applied successfully.

The helper writes only through the Linux kernel power-supply interface and does not directly write raw embedded-controller addresses.

## Boot Persistence

The custom 50–60% thresholds do not necessarily survive a reboot by themselves.

On the tested MSI Thin A15 B7UC, UPower restores its native Preserve Battery Health profile during startup, which results in 70–80% thresholds when charge-threshold support is enabled.

Plugged-in Mode therefore persists whether the custom profile was selected.

When Plugged-in is enabled, the helper creates:

```text
/var/lib/plugged-in-mode/profile
```

containing:

```text
plugged
```

The systemd service:

```text
plugged-in-mode-restore.service
```

runs during boot after UPower has initialized.

If the persisted Plugged-in state exists, the service runs:

```text
/usr/local/libexec/plugged-in-mode-helper restore
```

and reapplies the 50–60% thresholds.

The resulting boot flow is:

```text
System boots
    ↓
Kernel and msi-ec initialize
    ↓
UPower initializes
    ↓
plugged-in-mode-restore.service runs
    ↓
Saved Plugged-in state found
    ↓
50–60% thresholds restored
```

When Preserve Battery Health or Maximize Charge is selected, the persisted Plugged-in state is removed.

The restore service will still run during boot but exits without changing the battery thresholds.

This keeps responsibility separated:

```text
Maximize Charge         → UPower
Preserve Battery Health → UPower
Plugged-in              → Plugged-in Mode
```

## Verifying Boot Persistence

Select Plugged-in mode and verify the saved state:

```bash
cat /var/lib/plugged-in-mode/profile
```

Expected:

```text
plugged
```

Check the current thresholds:

```bash
cat /sys/class/power_supply/BAT1/charge_control_start_threshold
cat /sys/class/power_supply/BAT1/charge_control_end_threshold
```

Expected:

```text
50
60
```

Check whether the restore service is enabled:

```bash
systemctl is-enabled plugged-in-mode-restore.service
```

Expected:

```text
enabled
```

After rebooting, check the thresholds again:

```bash
cat /sys/class/power_supply/BAT1/charge_control_start_threshold
cat /sys/class/power_supply/BAT1/charge_control_end_threshold
```

If Plugged-in was selected before the reboot, the expected result is:

```text
50
60
```

You can inspect the restore service with:

```bash
systemctl status plugged-in-mode-restore.service
```

Because it is a systemd oneshot service, this is normal after a successful boot:

```text
Active: inactive (dead)
```

The important result is:

```text
status=0/SUCCESS
```

Boot logs for the service can be viewed with:

```bash
journalctl -b -u plugged-in-mode-restore.service
```

## Battery Icons

The extension includes monochrome symbolic icons for its charging profiles.

### Maximize Charge

The extension uses:

```text
battery-level-100-charged-full-symbolic.svg
```

The GNOME system battery indicator remains under native GNOME/UPower control.

### Preserve Battery Health

The extension uses:

```text
battery-level-80-plugged-in-symbolic.svg
```

While AC power is connected, the GNOME system battery indicator uses the corresponding level-specific plugged-in icon:

```text
battery-level-XX-plugged-in-symbolic
```

where `XX` represents the current battery level rounded down to the nearest 10%.

### Plugged-in

The extension uses:

```text
ac-plug-bolt-symbolic.svg
```

While AC power is connected, this icon is also used for the GNOME system battery indicator.

When AC power is disconnected, the system battery indicator returns to GNOME's native battery icon behavior.

The extension itself remains active and continues to show the currently selected charging profile.

The system battery icon integration currently relies on private GNOME Shell internals and may require updates when GNOME Shell changes.

## Uninstallation

Make the uninstaller executable if necessary:

```bash
chmod +x uninstall.sh
```

Run:

```bash
./uninstall.sh
```

The uninstaller:

- disables the GNOME Shell extension
- disables the systemd restore service
- removes the extension
- removes the privileged helper
- removes the polkit policy
- removes the systemd service
- removes persisted Plugged-in Mode state
- reloads systemd

Then log out and back in to fully refresh GNOME Shell.

## Troubleshooting

### Extension status

```bash
gnome-extensions info plugged-in-mode@cjtlabs.github.io
```

### Current thresholds

```bash
cat /sys/class/power_supply/BAT1/charge_control_start_threshold
cat /sys/class/power_supply/BAT1/charge_control_end_threshold
```

### UPower threshold state

```bash
busctl get-property \
  org.freedesktop.UPower \
  /org/freedesktop/UPower/devices/battery_BAT1 \
  org.freedesktop.UPower.Device \
  ChargeThresholdEnabled
```

### Restore service

```bash
systemctl status plugged-in-mode-restore.service
```

### Restore service boot log

```bash
journalctl -b -u plugged-in-mode-restore.service
```

### Persisted Plugged-in state

```bash
sudo ls -la /var/lib/plugged-in-mode
```

When Plugged-in is active, the directory should contain:

```text
profile
```

When Preserve Battery Health or Maximize Charge is active, the profile file should not exist.

## Warning

The custom 50–60% profile changes battery charge thresholds through the Linux kernel power-supply interface.

Do not use the custom profile on unsupported hardware unless you understand how your device implements battery charge thresholds.

Plugged-in Mode does not perform raw embedded-controller writes.

The extension depends on the kernel or an appropriate driver such as `msi-ec` to safely expose supported battery threshold controls through sysfs.

This project is provided without any guarantee of compatibility with hardware other than devices explicitly listed as tested.

## Contributing

Compatibility reports, bug reports, and patches for other MSI laptops are welcome.

When reporting hardware compatibility, include:

```bash
cat /sys/class/dmi/id/product_name
cat /sys/class/dmi/id/product_version 2>/dev/null || true
ls /sys/class/power_supply
```

If available, also include:

```bash
cat /sys/class/power_supply/BAT*/charge_control_start_threshold
cat /sys/class/power_supply/BAT*/charge_control_end_threshold
```

You can also include:

```bash
lsmod | grep msi_ec
dkms status | grep msi
```

Do not include serial numbers, UUIDs, MAC addresses, or other unique device identifiers in public reports.

## License

MIT
