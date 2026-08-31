# Plugged-in Mode

A GNOME Shell extension for managing battery charging profiles directly from Quick Settings.

Developed and tested on the MSI Thin A15 B7UC. The extension uses UPower for the native charging profiles and a small privileged helper for the custom 50–60% Plugged-in profile.

## Charging Profiles

| Profile                 | Charge Range | Implementation          |
| ----------------------- | ------------ | ----------------------- |
| Maximize Charge         | 90–100%      | UPower                  |
| Preserve Battery Health | 70–80%       | UPower                  |
| Plugged-in              | 50–60%       | Privileged sysfs helper |

## Compatibility

Currently tested with:

- MSI Thin A15 B7UC
- GNOME Shell 50
- UPower with charge-threshold support
- Linux exposing:
  - `charge_control_start_threshold`
  - `charge_control_end_threshold`

Other laptops may work if they expose compatible Linux power-supply charge-threshold interfaces.

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
- Kernel or driver support for writable battery charge thresholds

For the custom 50–60% profile, the system must expose writable charge-threshold files under:

```text
/sys/class/power_supply/
```

Specifically:

```text
charge_control_start_threshold
charge_control_end_threshold
```

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

The installer uses `sudo` only when installing the privileged helper and polkit policy.

After installation, log out and back in so GNOME Shell can discover the extension.

Then enable it:

```bash
gnome-extensions enable plugged-in-mode@cjtlabs.github.io
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

## How It Works

### Maximize Charge

Uses UPower's native charge-threshold support to configure the battery for the 90–100% charging range.

### Preserve Battery Health

Uses UPower's native charge-threshold support to configure the battery for the 70–80% charging range.

### Plugged-in

The custom Plugged-in profile configures a 50–60% charging range.

GNOME Shell runs the extension as the logged-in user, but writing charge thresholds directly through sysfs normally requires elevated privileges.

The extension therefore invokes:

```text
pkexec /usr/local/libexec/plugged-in-mode-helper
```

The included polkit policy authorizes this helper for an active local session.

The helper writes only through the Linux kernel power-supply interface and does not directly write raw embedded-controller addresses.

## Battery Icons

The extension includes monochrome symbolic icons for its charging profiles.

When Preserve Battery Health is active, the GNOME system battery indicator uses the corresponding level-specific plugged-in icon:

```text
battery-level-XX-plugged-in-symbolic
```

The Plugged-in profile uses its custom plug-and-bolt symbolic icon.

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

Then log out and back in to fully refresh GNOME Shell.

## Warning

The custom 50–60% profile changes battery charge thresholds through the Linux kernel power-supply interface.

Do not use the custom profile on unsupported hardware unless you understand how your device implements battery charge thresholds.

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

Do not include serial numbers, UUIDs, or other unique device identifiers in public reports.

## License

MIT
