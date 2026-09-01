<p align="center">
  <img src="assets/banner.png" alt="KeyWare DMs Banner" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/ENGINE-BETTERDISCORD-0a0c10?style=for-the-badge&logo=discord&logoColor=white" alt="Engine" />
  <img src="https://img.shields.io/badge/VERSION-7.6.0-0a0c10?style=for-the-badge" alt="Version" />
  <img src="https://img.shields.io/badge/ARCHITECTURE-REACT%20SAFE-0a0c10?style=for-the-badge" alt="Architecture" />
  <img src="https://img.shields.io/badge/PHYSICS-MOMENTUM%20TOSS-0a0c10?style=for-the-badge" alt="Physics" />
  <img src="https://img.shields.io/badge/LICENSE-MIT-0a0c10?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <b>Enterprise-grade, modular Direct Messages extension and interactive desktop companion engine for BetterDiscord.</b><br>
  <sub>Zero-overhead workspace management, deterministic DOM sorting, audio dispatch interception, soundboard routing, 20 Shimeji desktop mascots across 10 universes, momentum toss physics, LinkShield anti-phishing guard, and smart auto-responder.</sub>
</p>

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="#core-modules">Core Modules</a> •
  <a href="#shimeji-mascot-roster">Mascot Roster (20 Characters)</a> •
  <a href="#installation">Installation</a> •
  <a href="#technical-specifications">Specifications</a> •
  <a href="#license">License</a>
</p>

---

### Overview

**KeyWare** transforms standard Discord direct message lists into an extensible, high-performance workspace environment. Engineered from the ground up to prevent React unmount cycles, it operates synchronously within Discord's native event pipeline without introducing layout thrashing, background resource leaks, or UI latency.

---

### Core Modules

#### `[01]` Channel Categorization & Sorting Engine
- **Non-Destructive Ordering:** Organizes conversations using native CSS flexbox indexes (`order`), preserving Discord's internal component state, virtual lists, and drag-and-drop contexts.
- **Tree State Persistence:** Collapse inactive categories while preserving real-time unread message counters, mention indicators, and active voice channel states.
- **Dynamic Context Actions:** Right-click any category header for instant renaming, color/shader re-assignment, and quick channel routing.

#### `[02]` Audio Dispatcher & Per-Target Notification Routing
- **Pre-Emptive Audio Interception:** Discord's default notification sound is intercepted synchronously at `Dispatcher.dispatch` before playback execution begins, guaranteeing only your assigned custom audio stream executes.
- **Soundboard Integration:** Seamlessly browse, search, preview, and bind soundboard effects from any mutual server directly to individual direct messages.
- **Multi-Source Audio Binding:** Assign local `.mp3` files, Discord soundboard sounds, or direct HTTP audio streams per user or group chat.
- **Base64 Inline Decoder:** Native local file conversion to Base64 data URIs to bypass strict client file protocol restrictions.

#### `[03]` Shimeji Desktop Companions Engine (20 Characters • 10 Universes)
- **Mathematical Multi-Scale Rendering:** Adaptive canvas scaling ensures high-resolution 512px WebP sprites, 270px HD sprites, and 128px pixel-art sprites fit precisely inside the rendering viewport without head or tail clipping.
- **Momentum Toss & Gravity Physics:** Real-time velocity tracking captures mouse movement during drag and converts release momentum into parabolic flight physics, wall bounces, and stable floor landings.
- **Directional Facing Alignment:** Mascots mirror movement vectors immediately on the horizontal axis during dragging and flight without frame desynchronization.
- **Customizable Aura Lighting:** Select from curated color presets or configure any hex code via the live embedded RGB color picker.
- **Zero Idle Overhead:** Position caching and dirty-checking render cycles ensure 0% CPU consumption when companions are stationary.

#### `[04]` Visual Shaders & Atmospheric Engine
- **Hardware-Accelerated Presets:**
  - `Frosted Glass` (CSS backdrop-filter with ambient refraction)
  - `Cyberpunk Neon` (Dual-stop high-contrast magenta/violet gradient)
  - `Thermal Fire` (Warm ember gradient with high-frequency border)
  - `Emerald Breeze` (Cool mint gradient)
  - `Gilded Gold` (Subtle metallic brass shimmer)
- **Particle Rain Engine:** Background particle canvas supporting custom Discord emojis, image links, velocity multipliers, and density presets.

#### `[05]` Typography & Aesthetic Engine
- **Host OS Font Integration:** Render any font installed locally on the host operating system with zero network overhead.
- **Embedded Web Fonts:** Integrated Google Web Fonts suite including *Orbitron, Poppins, Montserrat, Cinzel, Righteous, Permanent Marker, and Press Start 2P*.
- **Left Status Accents:** Customizable left-border status indicators with per-category accent colors.

#### `[06]` LinkShield Anti-Phishing Guard
- **Real-Time Malicious URL Interception:** Identifies typo-squatted fake Discord/Nitro domains (`dlscord.com`, `discorcl.gift`, `discord-nitro-free.com`), fraudulent Steam phishing URLs (`steamcommunlty.com`), and IP harvesting grabbers (`grabify.link`, `iplogger.org`).
- **Pre-Click Intercept Modal:** Blocks immediate browser execution and presents an emergency red security dialog to prevent token theft and credential leaks.

#### `[07]` Smart Auto-Responder Engine
- **Activity Store Hook:** Detects current game activities through Discord's internal `ActivityStore` and dynamically injects the title via the `{game}` placeholder.
- **Spam Prevention & Cooldown:** Configurable response cooldowns (1–120 minutes), status filters (DND/Idle only), and direct message constraints.

---

### Shimeji Mascot Roster

KeyWare features 20 interactive desktop companions across 10 distinct fictional universes, complete with custom walk cycles, sitting poses, drag behaviors, and signature special abilities:

| Universe | Mascot | Tag | Role / Title | Signature Ability / Interaction |
| :--- | :--- | :--- | :--- | :--- |
| **Devil May Cry** `[Capcom]` | **Dante** | `DMC` | Devil Hunter | Ebony & Ivory Stance, Sword Agility, Classic Air Pose |
| **Hazbin Hotel** `[A24 / SpindleHorse]` | **Alastor** | `RADIO` | Radio Demon | Radio Broadcast, Shadow Tentacles, Cane Spinning |
| | **Vox** | `TV` | TV Overlord | Broadcast Showcase, Electric Glitch, CRT Glitch Jitter |
| | **Husk** | `CASINO` | Casino Cat | Umbrella Open (shime42-46), Alcohol Drinking Sequence (shime26->28->29->blush), Casino Card Shuffle |
| | **Angel Dust** | `STAR` | Spider Star | Flirty Pose, Tommy Gun Spray, Signature Blush |
| | **Lucifer** | `KING` | King of Hell | Rubber Duck Summon, Golden Apple, Top Hat Flourish |
| | **Adam** | `GENERAL` | Exorcist Leader | Holy Guitar Shred, Golden Radiance, Smug Taunt |
| | **Vaggie** | `SPEAR` | Exorcist Angel | Spear Thrust, Combat Ready Stance, Stern Patrol |
| | **Valentino** | `LUST` | Overlord of Lust | Cigar Smoke Cloud, Heart Sunglasses, Overlord Laugh |
| | **Velvette** | `FASHION` | Overlord of Fashion | Phone Selfie Pose, Runway Strut, Hair Flip |
| **The Amazing Digital Circus** `[GLITCH]` | **Kinger** | `CHESS` | Paranoid Chess King | Impenetrable Fortress Paranoia, Insect Fixation, Panic Freeze |
| **Freaky Circus** `[Freaky Circus]` | **Pierrot** | `JESTER` | Chaotic Circus Jester | Panic Juggling, 360 Spin, Bewildered Gaze |
| **My Little Pony & Pibby** `[Hasbro]` | **Fluttershy** | `MLP` | Kind Pegasus | 6-Frame Trot Cycle, Gentle Resting, Meadow Stare |
| | **Rainbow Dash** | `SONIC` | Supersonic Pegasus | Sonic Rainboom Rush, High-Speed Wing Flutter, Cool Salute |
| | **Twilight Sparkle** | `PIBBY` | Corrupted Virus | Glitched Magic Walk, Void Distortion, Sitting Idle |
| **Marvel** `[Marvel]` | **Spider-Man** | `SPIDER` | Friendly Neighborhood | Web Swinging, Wall Anchor, Low Crouching Patrol |
| **Five Nights at Freddy's** `[ScottGames]` | **Foxy** | `FNAF` | Pirate Fox | Pirate Hook Swing, Hallway Creep Stance, Eyepatch Adjust |
| **League of Legends** `[Riot Games]` | **Sett** | `THE BOSS` | Underground Boss | Showstopper Knuckle Crack, Pit Boss Flex, Lounging Rest |
| **Cookie Run Kingdom** `[Devsisters]` | **Shadow Milk** | `BEAST` | Cookie of Deceit | Puppet Theater Strings, Blue Flame Juggle, Deceit Waltz |
| **Deltarune & Toby Fox** `[Toby Fox]` | **Tenna** | `TV SHOW` | CRT Showman Host | CRT TV Broadcast Static, Antenna Pulse, Gameshow Host Pose |

---

### Technical Specifications

```
  +-------------------------------------------------------------------+
  |                        KEYWARE CORE ENGINE                        |
  +-------------------------------------------------------------------+
  |  [DOM Injection]         -> nav[aria-label="Direct Messages"]     |
  |  [Audio Hook]            -> Dispatcher.dispatch (Pre-Dispatch)   |
  |  [Physics Loop]          -> requestAnimationFrame (Delta-Timed)   |
  |  [Physics Mode]          -> Momentum Toss + Elastic Wall Bounce  |
  |  [Data Persistence]      -> BdApi.Data (Isolated JSON Storage)    |
  |  [Memory Footprint]      -> < 2.5 MB (Zero Polling Timers)        |
  |  [Idle CPU Usage]        -> 0.0% (Cached Dirty-Checking)          |
  +-------------------------------------------------------------------+
```

---

### Installation

#### Automated Install (Windows PowerShell)
```powershell
iwr "https://raw.githubusercontent.com/keyrexdevelopment/keyware-dms/main/KeyWare.plugin.js" -OutFile "$env:APPDATA\BetterDiscord\plugins\KeyWare.plugin.js"
```

#### Manual Installation
1. Ensure **[BetterDiscord](https://betterdiscord.app/)** is installed.
2. Download [`KeyWare.plugin.js`](https://raw.githubusercontent.com/keyrexdevelopment/keyware-dms/main/KeyWare.plugin.js).
3. Move the downloaded file into your BetterDiscord plugins folder:
   ```
   %appdata%\BetterDiscord\plugins
   ```
4. In Discord, navigate to **User Settings > Plugins** and enable **KeyWare**.

---

### Automatic Updates

KeyWare integrates with BetterDiscord's native release notification engine. When a new version is pushed to GitHub, an update banner will appear automatically within Discord:

```
[ Update Available ] KeyWare v7.7.0 -> [ Update Now ]
```

---

### License & Credits

Distributed under the **MIT License**. Created with precision by [**keyrex**](https://github.com/keyrexdevelopment).
