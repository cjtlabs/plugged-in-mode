import Gio from "gi://Gio";
import GLib from "gi://GLib";
import GObject from "gi://GObject";

import * as Main from "resource:///org/gnome/shell/ui/main.js";
import * as PopupMenu from "resource:///org/gnome/shell/ui/popupMenu.js";
import * as QuickSettings from "resource:///org/gnome/shell/ui/quickSettings.js";

import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

const UPOWER_NAME = "org.freedesktop.UPower";
const BATTERY_PATH = "/org/freedesktop/UPower/devices/battery_BAT1";

const START_THRESHOLD =
  "/sys/class/power_supply/BAT1/charge_control_start_threshold";

const END_THRESHOLD =
  "/sys/class/power_supply/BAT1/charge_control_end_threshold";

const BATTERY_CAPACITY = "/sys/class/power_supply/BAT1/capacity";

const PROFILE_MAXIMIZE = "maximize";
const PROFILE_PRESERVE = "preserve";
const PROFILE_PLUGGED = "plugged";

const UPowerDevice = Gio.DBusProxy.makeProxyWrapper(`
<node>
  <interface name="org.freedesktop.UPower.Device">
    <method name="EnableChargeThreshold">
      <arg
        type="b"
        direction="in"
        name="enable"/>
    </method>

    <property
      name="ChargeThresholdEnabled"
      type="b"
      access="read"/>
  </interface>
</node>
`);

const PluggedInToggle = GObject.registerClass(
  class PluggedInToggle extends QuickSettings.QuickMenuToggle {
    constructor(maximizeIcon, preserveIcon, pluggedIcon) {
      super({
        title: "Plugged-in",
        subtitle: "Loading…",
        gicon: pluggedIcon,
        toggleMode: true,
      });

      this._maximizeIcon = maximizeIcon;
      this._preserveIcon = preserveIcon;
      this._pluggedIcon = pluggedIcon;

      this._changing = false;
      this._previousNativeProfile = null;
      this._activeProfile = null;
      this._propertiesChangedId = null;

      this._powerToggle = null;
      this._powerToggleIconChangedId = null;
      this._powerToggleUpdating = false;
      this._powerIconRetryId = 0;

      this.menu.setHeader(
        this._pluggedIcon,
        "Battery Charging",
        "Choose a charging profile",
      );

      this._maximizeItem = new PopupMenu.PopupImageMenuItem(
        "Maximize Charge",
        this._maximizeIcon,
      );

      this._preserveItem = new PopupMenu.PopupImageMenuItem(
        "Preserve Battery Health",
        this._preserveIcon,
      );

      this._pluggedItem = new PopupMenu.PopupImageMenuItem(
        "Plugged-in",
        this._pluggedIcon,
      );

      this._maximizeItem.setOrnament(PopupMenu.Ornament.NONE);
      this._preserveItem.setOrnament(PopupMenu.Ornament.NONE);
      this._pluggedItem.setOrnament(PopupMenu.Ornament.NONE);

      this.menu.addMenuItem(this._maximizeItem);
      this.menu.addMenuItem(this._preserveItem);
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
      this.menu.addMenuItem(this._pluggedItem);
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

      this.menu.addAction("Power Settings", () => {
        Main.panel.closeQuickSettings();

        Gio.Subprocess.new(
          ["gnome-control-center", "power"],
          Gio.SubprocessFlags.NONE,
        );
      });

      this._maximizeItem.connect("activate", () => {
        this._setNativeProfile(false);
      });

      this._preserveItem.connect("activate", () => {
        this._setNativeProfile(true);
      });

      this._pluggedItem.connect("activate", () => {
        this._enablePluggedInMode();
      });

      this.connect("clicked", () => {
        if (this._changing) {
          return;
        }

        if (this.checked) {
          this._enablePluggedInMode();
        } else {
          this._restorePreviousProfile();
        }
      });

      this._proxy = new UPowerDevice(
        Gio.DBus.system,
        UPOWER_NAME,
        BATTERY_PATH,
        (proxy, error) => {
          if (error) {
            console.error(`Plugged-in: ${error.message}`);
            this.subtitle = "Unavailable";
            return;
          }

          this._syncFromSystem();

          this._propertiesChangedId = proxy.connect(
            "g-properties-changed",
            () => {
              if (!this._changing) {
                this._syncFromSystem();
              }
            },
          );
        },
      );
    }

    _getBatteryFillLevel() {
      const percentage = this._readNumber(BATTERY_CAPACITY);

      if (!Number.isFinite(percentage)) {
        return 100;
      }

      return Math.max(0, Math.min(100, 10 * Math.floor(percentage / 10)));
    }

    _getPreserveSystemIcon() {
      const fillLevel = this._getBatteryFillLevel();

      return new Gio.ThemedIcon({
        name: `battery-level-${fillLevel}-plugged-in-symbolic`,
        use_default_fallbacks: false,
      });
    }

    _setProfileIcon(profile) {
      switch (profile) {
        case PROFILE_MAXIMIZE:
          this.gicon = this._maximizeIcon;
          break;

        case PROFILE_PRESERVE:
          this.gicon = this._preserveIcon;
          break;

        case PROFILE_PLUGGED:
          this.gicon = this._pluggedIcon;
          break;
      }
    }

    _ensurePowerIconOverride() {
      const system = Main.panel.statusArea.quickSettings?._system;

      const powerToggle = system?._systemItem?.powerToggle;

      if (!system || !powerToggle) {
        return false;
      }

      if (this._powerToggle === powerToggle) {
        return true;
      }

      if (this._powerToggleIconChangedId && this._powerToggle) {
        this._powerToggle.disconnect(this._powerToggleIconChangedId);

        this._powerToggleIconChangedId = null;
      }

      this._powerToggle = powerToggle;

      this._powerToggleIconChangedId = this._powerToggle.connect(
        "notify::gicon",
        () => {
          if (this._powerToggleUpdating) {
            return;
          }

          if (
            this._activeProfile !== PROFILE_PRESERVE &&
            this._activeProfile !== PROFILE_PLUGGED
          ) {
            return;
          }

          GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            if (
              this._activeProfile === PROFILE_PRESERVE ||
              this._activeProfile === PROFILE_PLUGGED
            ) {
              this._syncPowerIcon();
            }

            return GLib.SOURCE_REMOVE;
          });
        },
      );

      return true;
    }

    _applySystemPowerIcon(gicon) {
      if (!this._ensurePowerIconOverride()) {
        return;
      }

      const system = Main.panel.statusArea.quickSettings?._system;

      this._powerToggleUpdating = true;

      this._powerToggle.gicon = gicon;

      if (this._powerToggle._icon) {
        this._powerToggle._icon.gicon = gicon;
      }

      if (system?._indicator) {
        system._indicator.gicon = gicon;
      }

      this._powerToggleUpdating = false;
    }

    _isACOnline() {
      try {
        const directory = Gio.File.new_for_path("/sys/class/power_supply");

        const enumerator = directory.enumerate_children(
          "standard::name",
          Gio.FileQueryInfoFlags.NONE,
          null,
        );

        let info;

        while ((info = enumerator.next_file(null))) {
          const name = info.get_name();

          const base = `/sys/class/power_supply/${name}`;

          if (this._readText(`${base}/type`) !== "Mains") {
            continue;
          }

          if (this._readNumber(`${base}/online`) === 1) {
            enumerator.close(null);
            return true;
          }
        }

        enumerator.close(null);
      } catch (e) {
        console.error(`Plugged-in: failed checking AC state: ${e.message}`);
      }

      return false;
    }

    _schedulePowerIconRetry() {
      if (this._powerIconRetryId) {
        return;
      }

      this._powerIconRetryId = GLib.timeout_add(
        GLib.PRIORITY_DEFAULT,
        250,
        () => {
          if (this._ensurePowerIconOverride()) {
            this._powerIconRetryId = 0;

            this._syncPowerIcon();

            return GLib.SOURCE_REMOVE;
          }

          return GLib.SOURCE_CONTINUE;
        },
      );
    }

    _syncPowerIcon() {
      if (!this._ensurePowerIconOverride()) {
        this._schedulePowerIconRetry();
        return;
      }

      const system = Main.panel.statusArea.quickSettings?._system;

      if (!this._isACOnline()) {
        this._powerToggle._sync?.();
        system?._sync?.();
        return;
      }

      switch (this._activeProfile) {
        case PROFILE_PLUGGED:
          this._applySystemPowerIcon(this._pluggedIcon);
          break;

        case PROFILE_PRESERVE:
          this._applySystemPowerIcon(this._getPreserveSystemIcon());
          break;

        case PROFILE_MAXIMIZE:
          this._powerToggle._sync?.();
          system?._sync?.();
          break;
      }
    }

    _readText(path) {
      try {
        const [success, contents] = GLib.file_get_contents(path);

        if (!success) {
          return null;
        }

        return new TextDecoder().decode(contents).trim();
      } catch {
        return null;
      }
    }

    _readNumber(path) {
      const text = this._readText(path);

      if (text === null) {
        return null;
      }

      const value = Number.parseInt(text, 10);

      return Number.isFinite(value) ? value : null;
    }

    _detectSystemProfile() {
      const start = this._readNumber(START_THRESHOLD);

      const end = this._readNumber(END_THRESHOLD);

      if (start === 50 && end === 60) {
        return PROFILE_PLUGGED;
      }

      if (start === 70 && end === 80) {
        return PROFILE_PRESERVE;
      }

      if (start === 90 && end === 100) {
        return PROFILE_MAXIMIZE;
      }

      if (this._proxy) {
        return this._proxy.ChargeThresholdEnabled
          ? PROFILE_PRESERVE
          : PROFILE_MAXIMIZE;
      }

      return null;
    }

    _setActiveProfile(profile) {
      this._activeProfile = profile;

      this._maximizeItem.setOrnament(
        profile === PROFILE_MAXIMIZE
          ? PopupMenu.Ornament.CHECK
          : PopupMenu.Ornament.NONE,
      );

      this._preserveItem.setOrnament(
        profile === PROFILE_PRESERVE
          ? PopupMenu.Ornament.CHECK
          : PopupMenu.Ornament.NONE,
      );

      this._pluggedItem.setOrnament(
        profile === PROFILE_PLUGGED
          ? PopupMenu.Ornament.CHECK
          : PopupMenu.Ornament.NONE,
      );
    }

    _syncFromSystem() {
      const profile = this._detectSystemProfile();

      if (!profile) {
        return;
      }

      const plugged = profile === PROFILE_PLUGGED;

      this.checked = plugged;

      if (this._menuButton) {
        this._menuButton.checked = plugged;
      }

      switch (profile) {
        case PROFILE_PLUGGED:
          this.subtitle = "60% limit";
          break;

        case PROFILE_PRESERVE:
          this.subtitle = "80% limit";
          break;

        case PROFILE_MAXIMIZE:
          this.subtitle = "100% charge";
          break;
      }

      this._setActiveProfile(profile);
      this._setProfileIcon(profile);
      this._syncPowerIcon();
    }

    async _enablePluggedInMode() {
      if (this._changing) {
        return;
      }

      const current = this._detectSystemProfile();

      if (current === PROFILE_PLUGGED) {
        this._syncFromSystem();
        return;
      }

      if (current === PROFILE_PRESERVE || current === PROFILE_MAXIMIZE) {
        this._previousNativeProfile = current;
      } else {
        this._previousNativeProfile = this._proxy.ChargeThresholdEnabled
          ? PROFILE_PRESERVE
          : PROFILE_MAXIMIZE;
      }

      try {
        this._changing = true;
        this.subtitle = "Applying…";

        await this._proxy.EnableChargeThresholdAsync(true);

        const proc = Gio.Subprocess.new(
          ["pkexec", "/usr/local/libexec/plugged-in-mode-helper"],
          Gio.SubprocessFlags.NONE,
        );

        await proc.wait_check_async(null);

        this._syncFromSystem();

        if (this._activeProfile !== PROFILE_PLUGGED) {
          throw new Error("50/60 thresholds were not applied");
        }
      } catch (e) {
        console.error(`Plugged-in enable failed: ${e.message}`);

        this._syncFromSystem();
      } finally {
        this._changing = false;
      }
    }

    async _restorePreviousProfile() {
      if (this._changing) {
        return;
      }

      let previous = this._previousNativeProfile;

      if (!previous && this._proxy) {
        previous = this._proxy.ChargeThresholdEnabled
          ? PROFILE_PRESERVE
          : PROFILE_MAXIMIZE;
      }

      if (!previous) {
        previous = PROFILE_PRESERVE;
      }

      try {
        this._changing = true;
        this.subtitle = "Restoring…";

        if (previous === PROFILE_PRESERVE) {
          await this._proxy.EnableChargeThresholdAsync(false);

          await this._proxy.EnableChargeThresholdAsync(true);
        } else {
          await this._proxy.EnableChargeThresholdAsync(false);
        }

        this._previousNativeProfile = null;

        this._syncFromSystem();
      } catch (e) {
        console.error(`Plugged-in restore failed: ${e.message}`);

        this._syncFromSystem();
      } finally {
        this._changing = false;
      }
    }

    async _setNativeProfile(enabled) {
      if (this._changing) {
        return;
      }

      try {
        this._changing = true;
        this.subtitle = "Applying…";

        if (enabled) {
          await this._proxy.EnableChargeThresholdAsync(false);

          await this._proxy.EnableChargeThresholdAsync(true);
        } else {
          await this._proxy.EnableChargeThresholdAsync(false);
        }

        this._previousNativeProfile = null;

        this._syncFromSystem();
      } catch (e) {
        console.error(`Plugged-in profile change failed: ${e.message}`);

        this._syncFromSystem();
      } finally {
        this._changing = false;
      }
    }

    destroy() {
      if (this._powerIconRetryId) {
        GLib.source_remove(this._powerIconRetryId);

        this._powerIconRetryId = 0;
      }

      if (this._powerToggleIconChangedId && this._powerToggle) {
        this._powerToggle.disconnect(this._powerToggleIconChangedId);

        this._powerToggleIconChangedId = null;
      }

      this._activeProfile = null;

      this._powerToggle?._sync?.();

      Main.panel.statusArea.quickSettings?._system?._sync?.();

      if (this._propertiesChangedId && this._proxy) {
        this._proxy.disconnect(this._propertiesChangedId);
      }

      this._powerToggle = null;

      super.destroy();
    }
  },
);

const PluggedInIndicator = GObject.registerClass(
  class PluggedInIndicator extends QuickSettings.SystemIndicator {
    constructor(maximizeIcon, preserveIcon, pluggedIcon) {
      super();

      this._toggle = new PluggedInToggle(
        maximizeIcon,
        preserveIcon,
        pluggedIcon,
      );

      this.quickSettingsItems.push(this._toggle);
    }

    destroy() {
      this.quickSettingsItems.forEach((item) => item.destroy());

      super.destroy();
    }
  },
);

export default class PluggedInModeExtension extends Extension {
  enable() {
    const maximizeFile = Gio.File.new_for_path(
      `${this.path}/icons/battery-level-100-charged-full-symbolic.svg`,
    );

    const preserveFile = Gio.File.new_for_path(
      `${this.path}/icons/battery-level-80-plugged-in-symbolic.svg`,
    );

    const pluggedFile = Gio.File.new_for_path(
      `${this.path}/icons/ac-plug-bolt-symbolic.svg`,
    );

    this._maximizeIcon = new Gio.FileIcon({
      file: maximizeFile,
    });

    this._preserveIcon = new Gio.FileIcon({
      file: preserveFile,
    });

    this._pluggedIcon = new Gio.FileIcon({
      file: pluggedFile,
    });

    this._indicator = new PluggedInIndicator(
      this._maximizeIcon,
      this._preserveIcon,
      this._pluggedIcon,
    );

    Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
  }

  disable() {
    this._indicator?.destroy();

    this._indicator = null;
    this._maximizeIcon = null;
    this._preserveIcon = null;
    this._pluggedIcon = null;
  }
}
