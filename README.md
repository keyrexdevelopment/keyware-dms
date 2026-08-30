<p align="center">
  <img src="assets/banner.png" alt="KeyWare DMs Banner" width="100%" />
</p>

<h1 align="center">KEYWARE // DMs</h1>

<p align="center">
  <b>High-performance, modular Direct Messages extension for BetterDiscord.</b><br>
  Built for structured organization, per-channel audio dispatching, and deep UI customization.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/PLATFORM-BETTERDISCORD-18191c?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/VERSION-5.8.1-18191c?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/LICENSE-MIT-18191c?style=flat-square" alt="License" />
</p>

---

### Overview

**KeyWare DMs** is an all-in-one client extension designed to replace standard Discord direct message lists with an organized, fully configurable command layout. The architecture focuses on lightweight execution, native flexbox DOM preservation, and zero background overhead.

---

### Key Modules

#### [01] Channel Categorization & Sorting
- **Interactive Drag & Drop:** Move direct messages and group conversations into isolated categories with continuous index tracking.
- **Collapsible Tree State:** Fold inactive categories while monitoring real-time mention badges and unread message counters.
- **Non-Destructive DOM Architecture:** Fully integrated into Discord's native scroll container via deterministic CSS flex ordering, preventing React unmount collisions.

#### [02] Audio Dispatcher & Custom Notification Routing
- **Per-Target Audio Binding:** Assign unique audio URIs or local sound files to specific users or group channels.
- **Pre-Emptive Audio Interception:** Discord's default notification ping is intercepted and silenced synchronously at the dispatcher level before execution, guaranteeing only the assigned sound is played.
- **Embedded Audio Engine:** Supports Base64 data streaming to bypass local protocol restrictions with configurable volume attenuation.

#### [03] Visual Styling & Atmosphere
- **Preset Header Shaders:** Default, Frosted Glass, Cyberpunk Neon, Thermal Fire, Emerald Gradient, and Gilded Gold.
- **Dynamic Lighting Effects:** Ambient neon text glow, continuous RGB wave spectrum cycling, and smooth pulse animations.
- **Particle Rain Engine:** Background particle stream supporting custom Discord server emojis, image links, and custom density/speed presets.

#### [04] Typography Engine
- **Local Font Injection:** Instant access to any font family installed on the host operating system with zero network requests.
- **Web Font Integration:** Pre-configured Google Fonts suite including Orbitron, Poppins, Montserrat, Pixel Retro, Cinzel, Permanent Marker, and Righteous.
- **Visual Accent Lines:** Custom left-border channel indicator colors and category metadata badges.

---

### Technical Specifications

| Parameter | Specification |
| :--- | :--- |
| **Engine Compatibility** | BetterDiscord v1.0.0+ |
| **Render Target** | Native `nav[aria-label="Direct Messages"]` |
| **Event Pipeline** | `Dispatcher.dispatch` synchronous pre-hook |
| **State Persistence** | `BdApi.Data` isolated JSON storage |
| **CSS Injection** | Scoped DOM style tag with dynamic CSS variables |

---

### Installation

1. Ensure **[BetterDiscord](https://betterdiscord.app/)** is installed and active.
2. Download [`DMCategories.plugin.js`](https://raw.githubusercontent.com/keyrexdevelopment/dm-categories/main/DMCategories.plugin.js).
3. Place the file inside your BetterDiscord plugins directory:
   ```
   %appdata%\BetterDiscord\plugins
   ```
4. Enable the plugin inside Discord Settings ➔ **Plugins**.

---

### License

Distributed under the **MIT License**. Created by **[keyrex](https://github.com/keyrexdevelopment)**.
