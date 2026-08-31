/**
 * @name KeyWare
 * @author keyrex
 * @version 6.3.0
 * @description Direkt mesajları kategorilere ayırın, sürükle-bırak ile organize edin. Kişilere özel MP3 ve Soundboard bildirim sesi, Dante & Vergil Shimeji evcil hayvanları, okunmamış mesaj sayacı, özel yazı tipi ve partikül yağmuru içerir.
 * @source https://github.com/keyrexdevelopment/keyware-dms
 * @updateUrl https://raw.githubusercontent.com/keyrexdevelopment/keyware-dms/main/KeyWare.plugin.js
 * @website https://github.com/keyrexdevelopment/keyware-dms
 */

module.exports = class KeyWare {
    constructor() {
        this.pluginName = "KeyWare";
        this.categories = [];
        this.customSounds = {};
        this.observer = null;
        this.draggedType = null;
        this.draggedChannelId = null;
        this.draggedCategoryId = null;
        this.rainIntervals = {};
        this.loadedWebFonts = new Set();
        this.isRendering = false;
        this.suppressDiscordSound = false;
        this.suppressTimeout = null;

        // Shimeji Desktop Mascot State (Dante)
        this.shimejiSettings = {
            enabled: true,
            character: 'dante',
            mode: 'follow', // 'follow' | 'roam' | 'sit'
            scale: 0.65,
            speed: 3.0,
            gravity: 0.6,
            glowColor: '#e23636',
            physics: true
        };
        this.shimejis = [];
        this.shimejiRafId = null;
        this.mouseX = window.innerWidth / 2;
        this.mouseY = window.innerHeight / 2;

        this.handleClick = this.handleClick.bind(this);
        this.handleContextMenu = this.handleContextMenu.bind(this);
        this.handleDragStart = this.handleDragStart.bind(this);
        this.handleDragOver = this.handleDragOver.bind(this);
        this.handleDragLeave = this.handleDragLeave.bind(this);
        this.handleDrop = this.handleDrop.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);
        this.onMessageCreate = this.onMessageCreate.bind(this);
        this.handleMouseMove = this.handleMouseMove.bind(this);
        this.handleMouseUp = this.handleMouseUp.bind(this);
    }

    start() {
        this.loadSettings();
        this.injectStyles();
        this.attachGlobalEvents();
        this.initObserver();
        this.patchDispatcher();
        this.patchSoundModule();
        this.patchAudioPrototype();
        this.initMessageListener();
        this.patchContextMenu();
        this.scheduleRender();
        this.initShimejis();
        setTimeout(() => this.checkForUpdates(), 2500);
        setTimeout(() => this.checkChangelog(), 3500);
        this.updateInterval = setInterval(() => this.checkForUpdates(), 30 * 60 * 1000);
    }

    onSwitch() {
        this.scheduleRender(true);
        [0, 20, 50, 100, 200].forEach(d => setTimeout(() => this.renderAll(), d));
    }

    stop() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
        if (this.suppressTimeout) {
            clearTimeout(this.suppressTimeout);
            this.suppressTimeout = null;
        }
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
            this.renderTimeout = null;
        }
        BdApi.Patcher.unpatchAll(this.pluginName);
        this.unpatchContextMenu();
        this.removeMessageListener();
        this.clearAllRain();
        this.destroyShimejis();
        this.detachGlobalEvents();
        this.closeModal();
        this.closeContextMenu();
        BdApi.DOM.removeStyle(this.pluginName);
        this.cleanupDOM();
    }

    loadSettings() {
        let saved = BdApi.Data.load(this.pluginName, "categories");
        if (!saved || !Array.isArray(saved)) {
            saved = BdApi.Data.load("DMCategories", "categories");
        }
        this.categories = Array.isArray(saved) ? saved : [
            {
                id: "cat_favs",
                name: "Favoriler",
                emoji: "⭐",
                color: "#5865f2",
                lineColor: "#ffffff",
                bgStyle: "default",
                fontFamily: "default",
                customFont: "",
                glow: false,
                rgbWave: false,
                pulse: false,
                badgeText: "",
                badgeColor: "#5865f2",
                emojiRain: { enabled: false, emoji: "✨", speed: "normal", density: "medium" },
                collapsed: false,
                channels: []
            }
        ];

        if (Array.isArray(this.categories)) {
            this.categories.forEach(c => {
                if (c.customFont && c.customFont.startsWith('data:')) {
                    c.customFont = "";
                    if (c.fontFamily === 'custom') c.fontFamily = 'default';
                }
            });
        }

        let savedSounds = BdApi.Data.load(this.pluginName, "customSounds");
        if (!savedSounds || typeof savedSounds !== 'object') {
            savedSounds = BdApi.Data.load("DMCategories", "customSounds");
        }
        this.customSounds = (savedSounds && typeof savedSounds === 'object') ? savedSounds : {};

        const savedShimeji = BdApi.Data.load(this.pluginName, "shimeji");
        if (savedShimeji && typeof savedShimeji === 'object') {
            this.shimejiSettings = Object.assign(this.shimejiSettings, savedShimeji);
        } else {
            this.shimejiSettings.enabled = true;
            this.shimejiSettings.character = 'dante';
        }
    }

    saveSettings() {
        BdApi.Data.save(this.pluginName, "categories", this.categories);
        BdApi.Data.save(this.pluginName, "customSounds", this.customSounds);
        BdApi.Data.save(this.pluginName, "shimeji", this.shimejiSettings);
    }

    getDispatcher() {
        try {
            return BdApi.Webpack.getStore("UserStore")?._dispatcher
                || BdApi.Webpack.getStore("MessageStore")?._dispatcher
                || BdApi.Webpack.getByKeys("dispatch", "subscribe", { searchExports: true })
                || BdApi.Webpack.getModule(m => m?.dispatch && m?.subscribe)
                || BdApi.Webpack.getModule(m => m?.default?.dispatch && m?.default?.subscribe)?.default
                || BdApi.Webpack.getModule(m => m?.isDispatching);
        } catch (e) {
            return null;
        }
    }

    getSoundboardStore() {
        try {
            return BdApi.Webpack.getStore("SoundboardStore")
                || BdApi.Webpack.getStore("SoundboardSoundsStore")
                || BdApi.Webpack.getByKeys("getSoundById", "getSounds")
                || BdApi.Webpack.getByKeys("getSoundsForGuild")
                || BdApi.Webpack.getByKeys("getGuildSounds")
                || BdApi.Webpack.getModule(m => m?.getSounds && m?.getSoundById)
                || BdApi.Webpack.getModule(m => m?.default?.getSounds && m?.default?.getSoundById)?.default;
        } catch (e) {
            return null;
        }
    }

    getSoundboardActions() {
        try {
            return BdApi.Webpack.getByKeys("fetchSoundboardSounds", "sendSoundboardSound")
                || BdApi.Webpack.getByKeys("fetchSoundboardSounds")
                || BdApi.Webpack.getByKeys("fetchSounds")
                || BdApi.Webpack.getModule(m => m?.fetchSoundboardSounds || m?.fetchAllSoundboardSounds)
                || BdApi.Webpack.getModule(m => m?.default?.fetchSoundboardSounds)?.default;
        } catch (e) {
            return null;
        }
    }

    fetchSoundboardSounds() {
        try {
            const soundActions = this.getSoundboardActions();
            if (soundActions) {
                if (typeof soundActions.fetchAllSoundboardSounds === 'function') {
                    soundActions.fetchAllSoundboardSounds();
                } else if (typeof soundActions.fetchSoundboardSounds === 'function') {
                    soundActions.fetchSoundboardSounds();
                } else if (typeof soundActions.fetchSounds === 'function') {
                    soundActions.fetchSounds();
                }
            }

            const GuildStore = BdApi.Webpack.getStore("GuildStore");
            const guilds = GuildStore?.getGuilds?.() || {};
            const guildIds = Object.keys(guilds);

            if (soundActions && typeof soundActions.fetchSoundboardSoundsForGuild === 'function') {
                guildIds.forEach(gId => {
                    try { soundActions.fetchSoundboardSoundsForGuild(gId); } catch (err) { }
                });
            }
        } catch (e) {
            console.error("[KeyWare] fetchSoundboardSounds error:", e);
        }
    }

    getAllSoundboardSounds() {
        const results = [];
        try {
            const soundStore = this.getSoundboardStore();
            const GuildStore = BdApi.Webpack.getStore("GuildStore");
            const guilds = GuildStore?.getGuilds?.() || {};

            let allSoundsRaw = null;
            if (soundStore) {
                if (typeof soundStore.getSounds === 'function') allSoundsRaw = soundStore.getSounds();
                else if (typeof soundStore.getAllSounds === 'function') allSoundsRaw = soundStore.getAllSounds();
                else if (typeof soundStore.getSoundboardSounds === 'function') allSoundsRaw = soundStore.getSoundboardSounds();
            }

            const guildIdList = ["0", ...Object.keys(guilds)];
            const processedGuilds = new Set();

            for (const gId of guildIdList) {
                const isDefault = (gId === "0" || gId === "default");
                const guildObj = isDefault ? { id: "0", name: "Discord Varsayılan", icon: null } : guilds[gId];
                if (!guildObj) continue;

                let soundArray = [];
                if (allSoundsRaw) {
                    if (allSoundsRaw instanceof Map) {
                        soundArray = allSoundsRaw.get(gId) || [];
                    } else if (typeof allSoundsRaw === 'object' && allSoundsRaw[gId]) {
                        soundArray = allSoundsRaw[gId];
                    }
                }

                if ((!soundArray || soundArray.length === 0) && soundStore) {
                    if (typeof soundStore.getSoundsForGuild === 'function') {
                        soundArray = soundStore.getSoundsForGuild(gId) || [];
                    } else if (typeof soundStore.getGuildSounds === 'function') {
                        soundArray = soundStore.getGuildSounds(gId) || [];
                    } else if (typeof soundStore.getSoundboardSoundsForGuild === 'function') {
                        soundArray = soundStore.getSoundboardSoundsForGuild(gId) || [];
                    }
                }

                if (soundArray && (Array.isArray(soundArray) ? soundArray.length > 0 : Object.keys(soundArray).length > 0)) {
                    processedGuilds.add(gId);
                    const list = Array.isArray(soundArray) ? soundArray : Object.values(soundArray);
                    const parsedSounds = list.map(s => {
                        const soundId = String(s.soundId || s.sound_id || s.id || "");
                        const name = s.name || "Ses";
                        const emojiId = s.emojiId || s.emoji_id || null;
                        const emojiName = s.emojiName || s.emoji_name || null;
                        const volume = typeof s.volume === 'number' ? s.volume : 1;
                        const url = `https://cdn.discordapp.com/soundboard-sounds/${soundId}`;
                        return {
                            soundId,
                            name,
                            emojiId,
                            emojiName,
                            volume,
                            url,
                            guildId: gId,
                            guildName: guildObj.name
                        };
                    }).filter(s => s.soundId);

                    if (parsedSounds.length > 0) {
                        results.push({
                            guildId: gId,
                            guildName: guildObj.name,
                            guildIcon: guildObj.icon ? `https://cdn.discordapp.com/icons/${guildObj.id}/${guildObj.icon}.webp?size=48` : null,
                            sounds: parsedSounds
                        });
                    }
                }
            }

            if (allSoundsRaw) {
                const entries = allSoundsRaw instanceof Map ? Array.from(allSoundsRaw.entries()) : Object.entries(allSoundsRaw);
                for (const [gId, soundArray] of entries) {
                    if (processedGuilds.has(gId)) continue;
                    if (!soundArray || (!Array.isArray(soundArray) && typeof soundArray !== 'object')) continue;
                    const list = Array.isArray(soundArray) ? soundArray : Object.values(soundArray);
                    if (list.length === 0) continue;

                    const guildObj = guilds[gId] || { id: gId, name: (gId === "0" ? "Discord Varsayılan" : "Sunucu"), icon: null };
                    const parsedSounds = list.map(s => {
                        const soundId = String(s.soundId || s.sound_id || s.id || "");
                        const name = s.name || "Ses";
                        const emojiId = s.emojiId || s.emoji_id || null;
                        const emojiName = s.emojiName || s.emoji_name || null;
                        const volume = typeof s.volume === 'number' ? s.volume : 1;
                        const url = `https://cdn.discordapp.com/soundboard-sounds/${soundId}`;
                        return {
                            soundId,
                            name,
                            emojiId,
                            emojiName,
                            volume,
                            url,
                            guildId: gId,
                            guildName: guildObj.name
                        };
                    }).filter(s => s.soundId);

                    if (parsedSounds.length > 0) {
                        results.push({
                            guildId: gId,
                            guildName: guildObj.name,
                            guildIcon: guildObj.icon ? `https://cdn.discordapp.com/icons/${guildObj.id}/${guildObj.icon}.webp?size=48` : null,
                            sounds: parsedSounds
                        });
                    }
                }
            }
        } catch (e) {
            console.error("[KeyWare] getAllSoundboardSounds error:", e);
        }
        return results;
    }

    hasCustomSound(channelId, authorId) {
        if (!this.customSounds) return null;
        if (channelId && this.customSounds[channelId]?.url) {
            return this.customSounds[channelId];
        }
        if (authorId && this.customSounds[authorId]?.url) {
            return this.customSounds[authorId];
        }
        if (authorId) {
            try {
                const ChannelStore = BdApi.Webpack.getStore("ChannelStore") || BdApi.Webpack.getModule(m => m?.getDMFromUserId);
                const dmChannelId = ChannelStore?.getDMFromUserId?.(authorId);
                if (dmChannelId && this.customSounds[dmChannelId]?.url) {
                    return this.customSounds[dmChannelId];
                }
            } catch (e) { }
        }
        return null;
    }

    patchDispatcher() {
        try {
            const Dispatcher = this.getDispatcher();
            if (Dispatcher && typeof Dispatcher.dispatch === 'function') {
                BdApi.Patcher.before(this.pluginName, Dispatcher, "dispatch", (thisObject, args) => {
                    try {
                        const event = args[0];
                        if (!event) return;

                        if (event.type === "CHANNEL_SELECT" || event.type === "NAVIGATE" || event.type === "GUILD_SELECT" || event.type === "CONNECTION_OPEN" || event.type === "LAYER_POP" || event.type === "POST_CONNECTION_OPEN") {
                            this.scheduleRender(true);
                            [0, 20, 50, 100, 200].forEach(d => setTimeout(() => this.renderAll(), d));
                            return;
                        }

                        if (event.type !== "MESSAGE_CREATE") return;

                        const msg = event.message || event;
                        const channelId = String(event.channelId || msg.channel_id || msg.channelId || "");
                        const authorId = String(msg.author?.id || msg.authorId || "");

                        const UserStore = BdApi.Webpack.getStore("UserStore") || BdApi.Webpack.getModule(m => m?.getCurrentUser);
                        const currentUserId = UserStore?.getCurrentUser?.()?.id;
                        if (authorId && currentUserId && String(authorId) === String(currentUserId)) return;

                        const soundData = this.hasCustomSound(channelId, authorId);
                        if (soundData && soundData.url) {
                            this.suppressDiscordSound = true;
                            if (this.suppressTimeout) clearTimeout(this.suppressTimeout);
                            this.suppressTimeout = setTimeout(() => {
                                this.suppressDiscordSound = false;
                                this.suppressTimeout = null;
                            }, 600);

                            this.playCustomSound(soundData);
                        }
                    } catch (err) {
                        console.error("[DMCategories] Dispatcher before error:", err);
                    }
                });
            }
        } catch (e) {
            console.error("[DMCategories] patchDispatcher error:", e);
        }
    }

    patchAudioPrototype() {
        try {
            const self = this;
            BdApi.Patcher.instead(this.pluginName, window.Audio.prototype, "play", function (thisObject, args, original) {
                if (self.suppressDiscordSound && !thisObject._isDMCatCustomAudio) {
                    return Promise.resolve();
                }
                return original.apply(thisObject, args);
            });
        } catch (e) {
            console.error("[DMCategories] patchAudioPrototype error:", e);
        }
    }

    patchSoundModule() {
        try {
            const soundModules = BdApi.Webpack.getModules(m => m?.playSound || m?.createSound || m?.default?.playSound || m?.default?.createSound);
            soundModules.forEach(mod => {
                const targets = [mod, mod?.default].filter(t => t && typeof t === 'object');
                targets.forEach(target => {
                    if (typeof target.playSound === 'function') {
                        BdApi.Patcher.instead(this.pluginName, target, "playSound", (thisObject, args, original) => {
                            if (this.suppressDiscordSound) {
                                return null;
                            }
                            return original.apply(thisObject, args);
                        });
                    }
                });
            });
        } catch (e) {
            console.error("[DMCategories] patchSoundModule error:", e);
        }
    }

    initMessageListener() {
        try {
            const Dispatcher = this.getDispatcher();
            if (Dispatcher && typeof Dispatcher.subscribe === 'function') {
                Dispatcher.subscribe("MESSAGE_CREATE", this.onMessageCreate);
            }
        } catch (e) {
            console.error("[DMCategories] initMessageListener error:", e);
        }
    }

    removeMessageListener() {
        try {
            const Dispatcher = this.getDispatcher();
            if (Dispatcher && typeof Dispatcher.unsubscribe === 'function') {
                Dispatcher.unsubscribe("MESSAGE_CREATE", this.onMessageCreate);
            }
        } catch (e) { }
    }

    playCustomSound(soundData) {
        if (!soundData || !soundData.url) return;
        try {
            let src = soundData.url;
            if (src.startsWith('file://') || src.match(/^[a-zA-Z]:[\\\/]/)) {
                try {
                    const fs = require('fs');
                    let cleanPath = src.replace(/^file:\/\/\/?/, '');
                    cleanPath = decodeURIComponent(cleanPath).replace(/\//g, '\\');
                    if (fs.existsSync(cleanPath)) {
                        const buffer = fs.readFileSync(cleanPath);
                        src = `data:audio/mp3;base64,${buffer.toString('base64')}`;
                    }
                } catch (err) {
                    console.warn("[DMCategories] File read error:", err);
                }
            }

            const audio = new Audio(src);
            audio._isDMCatCustomAudio = true;
            audio.volume = typeof soundData.volume === 'number' ? Math.max(0, Math.min(1, soundData.volume)) : 0.8;
            audio.play().catch(err => {
                console.warn("[DMCategories] Audio playback error:", err);
            });
        } catch (e) {
            console.error("[DMCategories] playCustomSound error:", e);
        }
    }

    onMessageCreate(e) {
        try {
            if (this.suppressDiscordSound) return;

            if (!e) return;
            const msg = e.message || e;
            const channelId = String(e.channelId || msg.channel_id || msg.channelId || "");
            const authorId = String(msg.author?.id || msg.authorId || "");

            const UserStore = BdApi.Webpack.getStore("UserStore") || BdApi.Webpack.getModule(m => m?.getCurrentUser);
            const currentUserId = UserStore?.getCurrentUser?.()?.id;
            if (authorId && currentUserId && String(authorId) === String(currentUserId)) return;

            const soundData = this.hasCustomSound(channelId, authorId);
            if (soundData && soundData.url) {
                this.suppressDiscordSound = true;
                if (this.suppressTimeout) clearTimeout(this.suppressTimeout);
                this.suppressTimeout = setTimeout(() => {
                    this.suppressDiscordSound = false;
                    this.suppressTimeout = null;
                }, 600);

                this.playCustomSound(soundData);
            }
        } catch (err) {
            console.error("[DMCategories] onMessageCreate error:", err);
        }
    }

    injectStyles() {
        const css = `
            @import url('https://fonts.googleapis.com/css2?family=Cinzel:wght@700&family=Montserrat:wght@700&family=Orbitron:wght@700&family=Permanent+Marker&family=Poppins:wght@700&family=Press+Start+2P&family=Righteous&display=swap');

            .dm-cat-add-btn {
                cursor: pointer !important;
                color: var(--interactive-normal, #b5bac1) !important;
                padding: 2px 4px;
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: color 0.15s ease, background-color 0.15s ease;
                margin-left: 4px;
                pointer-events: auto !important;
                position: relative;
                z-index: 10;
            }
            .dm-cat-add-btn:hover {
                color: var(--interactive-hover, #dbdee1) !important;
                background-color: var(--background-modifier-hover, rgba(78, 80, 88, 0.16));
            }

            nav[aria-label="Direkt Mesajlar"] [class*="scroller"] [role="list"],
            nav[aria-label="Direct Messages"] [class*="scroller"] [role="list"],
            [class*="privateChannels"] [class*="scroller"] [role="list"],
            nav[aria-label="Direkt Mesajlar"] [class*="scroller"],
            [class*="privateChannels"] [class*="scroller"] {
                display: flex !important;
                flex-direction: column !important;
            }

            [class*="privateChannelsHeaderContainer"], h2[class*="privateChannelsHeader"], [class*="privateChannels"] header {
                margin-top: 4px !important;
                margin-bottom: 6px !important;
            }

            .dm-cat-separator, .dm-cat-top-divider, .dm-cat-shop-divider {
                height: 1px !important;
                min-height: 1px !important;
                margin: 8px 8px !important;
                background-color: var(--background-modifier-accent, rgba(255, 255, 255, 0.08)) !important;
                box-sizing: border-box !important;
                flex-shrink: 0 !important;
                display: block !important;
            }

            .dm-cat-header-wrap {
                margin: 4px 8px 4px 8px;
                box-sizing: border-box;
                position: relative;
                transition: transform 0.15s ease;
            }
            .dm-cat-header {
                display: flex;
                align-items: center;
                padding: 6px 8px;
                color: var(--channels-default, #949ba4);
                background: rgba(255, 255, 255, 0.04);
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.02em;
                cursor: grab;
                user-select: none;
                border-radius: 5px;
                position: relative;
                overflow: hidden;
                transition: background-color 0.2s ease, color 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
            }
            .dm-cat-header:active {
                cursor: grabbing;
            }
            .dm-cat-header:hover {
                color: var(--interactive-hover, #dbdee1);
                background: rgba(255, 255, 255, 0.08);
            }
            .dm-cat-header.drag-over {
                background: rgba(88, 101, 242, 0.3) !important;
                outline: 2px dashed var(--brand-500, #5865f2) !important;
            }

            .dm-cat-drag-top {
                box-shadow: 0 -2px 0 0 var(--brand-500, #5865f2) !important;
            }
            .dm-cat-drag-bottom {
                box-shadow: 0 2px 0 0 var(--brand-500, #5865f2) !important;
            }
            .dm-cat-dragging-wrap {
                opacity: 0.45 !important;
            }

            .dm-cat-header.bg-glass {
                backdrop-filter: blur(10px);
                background: rgba(255, 255, 255, 0.07) !important;
                border: 1px solid rgba(255, 255, 255, 0.14);
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            }
            .dm-cat-header.bg-cyberpunk {
                background: linear-gradient(135deg, rgba(235, 69, 158, 0.22), rgba(88, 101, 242, 0.25)) !important;
                border: 1px solid rgba(235, 69, 158, 0.35);
            }
            .dm-cat-header.bg-fire {
                background: linear-gradient(135deg, rgba(240, 71, 71, 0.25), rgba(250, 166, 26, 0.2)) !important;
                border: 1px solid rgba(250, 166, 26, 0.3);
            }
            .dm-cat-header.bg-emerald {
                background: linear-gradient(135deg, rgba(87, 242, 135, 0.2), rgba(0, 176, 244, 0.2)) !important;
                border: 1px solid rgba(87, 242, 135, 0.3);
            }
            .dm-cat-header.bg-gold {
                background: linear-gradient(135deg, rgba(254, 231, 92, 0.22), rgba(230, 126, 34, 0.25)) !important;
                border: 1px solid rgba(254, 231, 92, 0.35);
            }
            .dm-cat-header.glow-effect {
                text-shadow: 0 0 10px currentColor;
            }
            .dm-cat-header.pulse-effect {
                animation: dmCatPulse 2.5s infinite ease-in-out;
            }
            @keyframes dmCatPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.82; }
            }

            .dm-cat-header.rgb-wave-effect {
                animation: dmCatRgbText 4s linear infinite;
            }
            @keyframes dmCatRgbText {
                0% { color: #ff5e7e; }
                20% { color: #ffa34d; }
                40% { color: #f9d423; }
                60% { color: #57f287; }
                80% { color: #00d2ff; }
                100% { color: #ff5e7e; }
            }

            .dm-cat-arrow,
            .dm-cat-emoji,
            .dm-cat-title,
            .dm-cat-badge,
            .dm-cat-unread-badge,
            .dm-cat-actions {
                position: relative !important;
                z-index: 5 !important;
            }

            .dm-cat-arrow {
                margin-right: 6px;
                transition: transform 0.2s ease;
                display: inline-flex;
                align-items: center;
                flex-shrink: 0;
            }
            .dm-cat-arrow.collapsed {
                transform: rotate(-90deg);
            }

            .dm-cat-emoji {
                margin-right: 6px;
                display: inline-flex;
                align-items: center;
                flex-shrink: 0;
            }
            .dm-cat-custom-emoji {
                width: 18px;
                height: 18px;
                object-fit: contain;
                vertical-align: middle;
                border-radius: 3px;
            }

            .dm-cat-title {
                flex: 1;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
                letter-spacing: 0.03em;
            }

            .dm-cat-badge {
                font-size: 9px;
                padding: 1px 5px;
                border-radius: 4px;
                font-weight: 800;
                letter-spacing: 0.05em;
                color: #ffffff;
                margin-left: 6px;
                flex-shrink: 0;
                text-transform: uppercase;
                box-shadow: 0 2px 4px rgba(0,0,0,0.25);
                transition: background-color 0.2s ease;
            }

            .dm-cat-unread-badge {
                background-color: var(--status-danger, #f23f43) !important;
                color: #ffffff !important;
                font-size: 11px !important;
                font-weight: 700 !important;
                min-width: 16px;
                height: 16px;
                line-height: 16px;
                padding: 0 5px;
                border-radius: 8px;
                text-align: center;
                box-shadow: 0 2px 4px rgba(0, 0, 0, 0.4);
                margin-left: 6px;
                margin-right: 4px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                animation: dmCatBadgePop 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            }
            @keyframes dmCatBadgePop {
                0% { transform: scale(0); opacity: 0; }
                100% { transform: scale(1); opacity: 1; }
            }

            .dm-cat-actions {
                display: flex;
                gap: 4px;
                align-items: center;
                margin-left: auto;
                opacity: 0.6;
                transition: opacity 0.15s ease;
            }
            .dm-cat-header:hover .dm-cat-actions {
                opacity: 1;
            }

            .dm-cat-action-btn {
                color: var(--interactive-normal, #b5bac1) !important;
                cursor: pointer !important;
                padding: 3px 5px !important;
                display: inline-flex !important;
                align-items: center;
                border-radius: 3px;
                transition: background-color 0.15s ease, color 0.15s ease, transform 0.15s ease;
                pointer-events: auto !important;
            }
            .dm-cat-action-btn:hover {
                color: #ffffff !important;
                background-color: var(--background-modifier-hover, rgba(78, 80, 88, 0.24));
                transform: scale(1.15);
            }
            .dm-cat-action-btn.dm-cat-delete:hover {
                color: #ff7b7b !important;
                background-color: rgba(218, 55, 60, 0.2);
            }

            .dm-cat-rain-container {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                overflow: hidden;
                border-radius: 5px;
                z-index: 1;
            }
            .dm-cat-particle {
                position: absolute;
                top: -14px;
                user-select: none;
                pointer-events: none;
                z-index: 1;
                font-size: 13px;
                animation-name: dmCatRainDrop;
                animation-timing-function: linear;
                animation-fill-mode: forwards;
            }
            .dm-cat-particle-img {
                width: 16px;
                height: 16px;
                object-fit: contain;
            }
            @keyframes dmCatRainDrop {
                0% {
                    transform: translateY(0) rotate(0deg);
                    opacity: 0;
                }
                15% {
                    opacity: 0.95;
                }
                80% {
                    opacity: 0.95;
                }
                100% {
                    transform: translateY(65px) rotate(180deg);
                    opacity: 0;
                }
            }

            .dm-cat-dropzone {
                margin-top: 3px;
                margin-bottom: 4px;
                padding: 6px 8px;
                border: 1px dashed rgba(255, 255, 255, 0.16);
                border-radius: 4px;
                color: var(--text-muted, #80848e);
                font-size: 11px;
                font-style: italic;
                text-align: center;
                transition: all 0.2s ease;
                user-select: none;
                cursor: default;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 6px;
            }
            .dm-cat-dropzone.drag-over {
                border-color: var(--brand-500, #5865f2) !important;
                background: rgba(88, 101, 242, 0.18) !important;
                color: #ffffff !important;
            }
            .dm-cat-dropzone.hidden {
                display: none !important;
            }

            .dm-cat-channel-item {
                margin-left: 8px !important;
                margin-right: 8px !important;
                position: relative !important;
                transition: transform 0.15s ease;
            }
            .dm-cat-channel-item::before {
                content: "" !important;
                position: absolute !important;
                left: -4px !important;
                top: 50% !important;
                transform: translateY(-50%) !important;
                width: 2.5px !important;
                height: 24px !important;
                max-height: 24px !important;
                background-color: var(--dm-cat-line-color, rgba(255, 255, 255, 0.45)) !important;
                border-radius: 2px !important;
                transition: background-color 0.2s ease !important;
                z-index: 2 !important;
                pointer-events: none !important;
            }
            .dm-cat-channel-item:hover::before {
                filter: brightness(1.4) !important;
            }

            .dm-cat-separator {
                height: 1px !important;
                min-height: 1px !important;
                margin: 8px 8px !important;
                background-color: var(--background-modifier-accent, rgba(255, 255, 255, 0.08)) !important;
                box-sizing: border-box !important;
                flex-shrink: 0 !important;
            }

            .dm-cat-hidden {
                display: none !important;
            }

            .dm-cat-dragging {
                opacity: 0.35 !important;
            }

            .dm-cat-context-menu {
                position: fixed !important;
                background: var(--background-floating, #111214) !important;
                border-radius: 6px;
                padding: 6px 8px;
                min-width: 190px;
                box-shadow: var(--elevation-high, 0 8px 16px rgba(0, 0, 0, 0.5)) !important;
                z-index: 2147483647 !important;
                display: flex;
                flex-direction: column;
                gap: 2px;
                animation: dmCatFadeIn 0.1s ease;
                pointer-events: auto !important;
            }
            .dm-cat-menu-item {
                display: flex !important;
                align-items: center !important;
                justify-content: space-between !important;
                padding: 6px 10px !important;
                margin: 2px 4px !important;
                border-radius: 4px !important;
                color: var(--interactive-normal, #b5bac1) !important;
                font-size: 13px !important;
                font-weight: 500 !important;
                cursor: pointer !important;
                white-space: nowrap !important;
                min-height: 32px !important;
                box-sizing: border-box !important;
                line-height: normal !important;
                transition: background-color 0.15s ease, color 0.15s ease;
                pointer-events: auto !important;
            }
            .dm-cat-menu-item span {
                white-space: nowrap !important;
                overflow: hidden !important;
                text-overflow: ellipsis !important;
                margin-right: 12px !important;
                font-size: 13px !important;
                line-height: normal !important;
            }
            .dm-cat-menu-item svg {
                flex-shrink: 0 !important;
            }
            .dm-cat-menu-item:hover {
                background-color: var(--brand-500, #5865f2) !important;
                color: #ffffff !important;
            }
            .dm-cat-menu-item.danger {
                color: var(--text-danger, #fa777c) !important;
            }
            .dm-cat-menu-item.danger:hover {
                background-color: var(--button-danger-background, #da373c) !important;
                color: #ffffff !important;
            }

            .dm-cat-modal-backdrop {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                background: rgba(0, 0, 0, 0.75) !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                z-index: 2147483646 !important;
                animation: dmCatFadeIn 0.15s ease;
                pointer-events: auto !important;
            }
            .dm-cat-modal-box {
                background: var(--background-primary, #313338);
                border-radius: 8px;
                width: 520px;
                max-width: 94vw;
                box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                max-height: 88vh;
            }
            .dm-cat-modal-header {
                padding: 16px 20px;
                color: var(--header-primary, #f2f3f5);
                font-size: 17px;
                font-weight: 600;
                display: flex;
                align-items: center;
                justify-content: space-between;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
            }

            .dm-cat-tabs {
                display: flex;
                gap: 2px;
                padding: 0 16px;
                margin-top: 10px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.06);
                overflow-x: auto;
            }
            .dm-cat-tab-btn {
                padding: 8px 12px;
                font-size: 13px;
                font-weight: 600;
                color: var(--interactive-normal, #b5bac1);
                cursor: pointer;
                border-bottom: 2px solid transparent;
                transition: color 0.15s ease, border-color 0.15s ease;
                white-space: nowrap;
            }
            .dm-cat-tab-btn:hover {
                color: var(--interactive-hover, #dbdee1);
            }
            .dm-cat-tab-btn.active {
                color: #ffffff;
                border-bottom-color: var(--brand-500, #5865f2);
            }

            .dm-cat-modal-body {
                padding: 16px 20px;
                display: flex;
                flex-direction: column;
                gap: 14px;
                overflow-y: auto;
            }
            .dm-cat-tab-pane {
                display: none;
                flex-direction: column;
                gap: 12px;
            }
            .dm-cat-tab-pane.active {
                display: flex;
            }

            .dm-cat-setting-row {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .dm-cat-setting-label {
                color: var(--header-secondary, #b5bac1);
                font-size: 12px;
                font-weight: 700;
                text-transform: uppercase;
                letter-spacing: 0.02em;
            }
            .dm-cat-setting-desc {
                color: var(--text-muted, #949ba4);
                font-size: 12px;
                line-height: 1.3;
            }
            .dm-cat-modal-input {
                background: var(--input-background, #1e1f22);
                border: 1px solid transparent;
                border-radius: 4px;
                color: var(--text-normal, #dbdee1);
                padding: 9px 12px;
                font-size: 14px;
                outline: none;
                transition: border-color 0.2s ease;
            }
            .dm-cat-modal-input:focus {
                border-color: var(--brand-500, #5865f2);
            }
            .dm-cat-color-palette {
                display: flex;
                gap: 8px;
                align-items: center;
                flex-wrap: wrap;
            }
            .dm-cat-color-swatch {
                width: 26px;
                height: 26px;
                border-radius: 50%;
                cursor: pointer;
                border: 2px solid transparent;
                transition: transform 0.15s ease, border-color 0.15s ease;
            }
            .dm-cat-color-swatch:hover, .dm-cat-color-swatch.active {
                transform: scale(1.2);
                border-color: #ffffff;
            }
            .dm-cat-select {
                background: var(--input-background, #1e1f22);
                color: var(--text-normal, #dbdee1);
                border: 1px solid transparent;
                border-radius: 4px;
                padding: 8px 10px;
                font-size: 13px;
                outline: none;
                cursor: pointer;
            }
            .dm-cat-checkbox-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 6px 0;
            }
            .dm-cat-toggle {
                position: relative;
                width: 40px;
                height: 22px;
                background: #4e5058;
                border-radius: 12px;
                cursor: pointer;
                transition: background-color 0.2s;
                flex-shrink: 0;
            }
            .dm-cat-toggle.active {
                background: var(--brand-500, #5865f2);
            }
            .dm-cat-toggle::after {
                content: "";
                position: absolute;
                top: 2px;
                left: 2px;
                width: 18px;
                height: 18px;
                background: #ffffff;
                border-radius: 50%;
                transition: transform 0.2s;
            }
            .dm-cat-toggle.active::after {
                transform: translateX(18px);
            }
            .dm-cat-modal-footer {
                background: var(--background-secondary, #2b2d31);
                padding: 14px 20px;
                display: flex;
                justify-content: flex-end;
                gap: 12px;
                border-top: 1px solid rgba(255, 255, 255, 0.06);
            }
            .dm-cat-btn {
                padding: 8px 16px;
                border-radius: 4px;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                border: none;
                transition: background-color 0.15s ease;
            }
            .dm-cat-btn-cancel {
                background: transparent;
                color: var(--text-normal, #fff);
            }
            .dm-cat-btn-cancel:hover {
                text-decoration: underline;
            }
            .dm-cat-btn-primary {
                background: var(--brand-500, #5865f2);
                color: #fff;
            }
            .dm-cat-btn-primary:hover {
                background: var(--brand-560, #4752c4);
            }
            .dm-cat-btn-danger {
                background: var(--button-danger-background, #da373c);
                color: #fff;
            }
            .dm-cat-btn-danger:hover {
                background: var(--button-danger-background-hover, #a12828);
            }

            /* Soundboard Picker Styles */
            .dm-cat-sound-search-wrap {
                position: relative;
                display: flex;
                align-items: center;
                margin-bottom: 4px;
            }
            .dm-cat-sound-search-icon {
                position: absolute;
                left: 10px;
                color: var(--text-muted, #949ba4);
                pointer-events: none;
                display: flex;
                align-items: center;
            }
            .dm-cat-sound-search-input {
                width: 100%;
                background: var(--input-background, #1e1f22);
                border: 1px solid rgba(255, 255, 255, 0.08);
                border-radius: 6px;
                color: var(--text-normal, #dbdee1);
                padding: 8px 12px 8px 32px;
                font-size: 13px;
                outline: none;
                transition: border-color 0.2s ease;
            }
            .dm-cat-sound-search-input:focus {
                border-color: var(--brand-500, #5865f2);
            }
            .dm-cat-soundboard-container {
                max-height: 290px;
                overflow-y: auto;
                display: flex;
                flex-direction: column;
                gap: 12px;
                padding-right: 4px;
            }
            .dm-cat-soundboard-container::-webkit-scrollbar {
                width: 6px;
            }
            .dm-cat-soundboard-container::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.15);
                border-radius: 3px;
            }
            .dm-cat-soundboard-guild {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            .dm-cat-soundboard-guild-header {
                display: flex;
                align-items: center;
                gap: 8px;
                font-size: 12px;
                font-weight: 700;
                color: var(--header-secondary, #b5bac1);
                text-transform: uppercase;
                letter-spacing: 0.03em;
                padding: 2px 0;
            }
            .dm-cat-soundboard-guild-icon {
                width: 18px;
                height: 18px;
                border-radius: 50%;
                object-fit: cover;
                background: var(--background-secondary-alt, #1e1f22);
                flex-shrink: 0;
            }
            .dm-cat-soundboard-guild-badge {
                font-size: 10px;
                font-weight: 600;
                background: rgba(255, 255, 255, 0.08);
                padding: 1px 6px;
                border-radius: 8px;
                color: var(--text-muted, #949ba4);
                margin-left: auto;
                text-transform: none;
            }
            .dm-cat-soundboard-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
                gap: 6px;
            }
            .dm-cat-sound-card {
                background: var(--background-secondary, #2b2d31);
                border: 1px solid rgba(255, 255, 255, 0.05);
                border-radius: 6px;
                padding: 8px 10px;
                display: flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                transition: all 0.15s ease;
                position: relative;
                overflow: hidden;
                user-select: none;
            }
            .dm-cat-sound-card:hover {
                background: var(--background-secondary-alt, #1e1f22);
                border-color: rgba(255, 255, 255, 0.18);
                transform: translateY(-1px);
            }
            .dm-cat-sound-card.active {
                border-color: var(--brand-500, #5865f2) !important;
                background: rgba(88, 101, 242, 0.15) !important;
                box-shadow: 0 0 10px rgba(88, 101, 242, 0.25);
            }
            .dm-cat-sound-card.playing {
                border-color: #23a55a !important;
                background: rgba(35, 165, 90, 0.15) !important;
            }
            .dm-cat-sound-card-emoji {
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 16px;
                flex-shrink: 0;
            }
            .dm-cat-sound-card-emoji img {
                width: 20px;
                height: 20px;
                object-fit: contain;
            }
            .dm-cat-sound-card-name {
                flex: 1;
                font-size: 12px;
                font-weight: 500;
                color: var(--text-normal, #dbdee1);
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .dm-cat-sound-card.active .dm-cat-sound-card-name {
                color: #ffffff;
                font-weight: 600;
            }
            .dm-cat-sound-card-play-btn {
                width: 22px;
                height: 22px;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.08);
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--interactive-normal, #b5bac1);
                flex-shrink: 0;
                transition: all 0.15s ease;
            }
            .dm-cat-sound-card-play-btn:hover {
                background: var(--brand-500, #5865f2);
                color: #ffffff;
                transform: scale(1.1);
            }
            .dm-cat-sound-active-banner {
                background: rgba(88, 101, 242, 0.12);
                border: 1px solid rgba(88, 101, 242, 0.3);
                border-radius: 6px;
                padding: 8px 12px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
            }
            .dm-cat-sound-active-info {
                display: flex;
                align-items: center;
                gap: 8px;
                overflow: hidden;
            }
            .dm-cat-sound-active-title {
                font-size: 13px;
                font-weight: 600;
                color: #ffffff;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            .dm-cat-sound-active-sub {
                font-size: 11px;
                color: var(--text-muted, #949ba4);
            }
            .dm-cat-sound-empty {
                text-align: center;
                padding: 24px 16px;
                color: var(--text-muted, #949ba4);
                font-size: 13px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 8px;
            }

            /* Shimeji Desktop Mascot Styles */
            #dm-cat-shimeji-container {
                position: fixed !important;
                top: 0 !important;
                left: 0 !important;
                width: 100vw !important;
                height: 100vh !important;
                pointer-events: none !important;
                z-index: 999999 !important;
                overflow: hidden !important;
            }
            .dm-cat-shimeji {
                position: absolute !important;
                top: 0 !important;
                left: 0 !important;
                pointer-events: auto !important;
                cursor: grab !important;
                user-select: none !important;
                will-change: transform !important;
                z-index: 999999 !important;
            }
            .dm-cat-shimeji.dragging {
                cursor: grabbing !important;
            }
            .dm-cat-shimeji canvas {
                display: block !important;
                pointer-events: none !important;
                transition: filter 0.18s ease;
            }

            .dm-cat-shimeji-btn {
                cursor: pointer !important;
                color: var(--interactive-normal, #b5bac1) !important;
                padding: 2px 4px;
                display: inline-flex !important;
                align-items: center;
                justify-content: center;
                border-radius: 4px;
                transition: color 0.15s ease, background-color 0.15s ease, transform 0.15s ease;
                margin-left: 2px;
                pointer-events: auto !important;
                position: relative;
                z-index: 10;
            }
            .dm-cat-shimeji-btn:hover {
                color: #ffffff !important;
                background-color: var(--background-modifier-hover, rgba(78, 80, 88, 0.16));
                transform: scale(1.1);
            }
            .dm-cat-shimeji-btn.active {
                color: var(--brand-500, #5865f2) !important;
            }

            .dm-cat-shimeji-card {
                background: var(--background-secondary, #2b2d31);
                border: 2px solid rgba(255, 255, 255, 0.08);
                border-radius: 8px;
                padding: 12px;
                display: flex;
                flex-direction: column;
                align-items: center;
                text-align: center;
                gap: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .dm-cat-shimeji-card:hover {
                border-color: rgba(255, 255, 255, 0.25);
                transform: translateY(-2px);
                background: var(--background-secondary-alt, #1e1f22);
            }
            .dm-cat-shimeji-card.active {
                border-color: var(--brand-500, #5865f2) !important;
                background: rgba(88, 101, 242, 0.15) !important;
                box-shadow: 0 0 16px rgba(88, 101, 242, 0.35);
            }

            @keyframes dmCatFadeIn {
                from { opacity: 0; transform: scale(0.96); }
                to { opacity: 1; transform: scale(1); }
            }
        `;
        BdApi.DOM.addStyle(this.pluginName, css);
    }

    initObserver() {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        const target = document.getElementById('app-mount') || document.body;
        this.observer = new MutationObserver((mutations) => {
            if (this.isRendering) return;
            const shouldRender = mutations.some(m => {
                const t = m.target;
                if (!t || !t.closest) return true;
                if (t.closest('.dm-cat-rain-container') || t.closest('.dm-cat-particle') || t.closest('.dm-cat-modal-backdrop') || t.closest('.dm-cat-context-menu') || t.closest('.dm-cat-top-divider') || t.closest('.dm-cat-shop-divider') || t.closest('.dm-cat-separator')) {
                    return false;
                }
                return true;
            });
            if (shouldRender) {
                this.scheduleRender();
            }
        });
        this.observer.observe(target, { childList: true, subtree: true });
    }

    scheduleRender(immediate = false) {
        if (immediate) {
            this.renderAll();
            return;
        }
        if (this.isScheduled) return;
        this.isScheduled = true;
        this.rafId = requestAnimationFrame(() => {
            this.isScheduled = false;
            this.rafId = null;
            this.renderAll();
        });
    }

    handleMouseMove(e) {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
    }

    handleMouseUp(e) {
        if (this.shimejis && this.shimejis.length > 0) {
            this.shimejis.forEach(pet => {
                if (pet.isDragged) {
                    let throwVx = 0;
                    let throwVy = 0;
                    if (pet.dragHistory && pet.dragHistory.length >= 2) {
                        const first = pet.dragHistory[0];
                        const last = pet.dragHistory[pet.dragHistory.length - 1];
                        const dt = Math.max(1, (last.t - first.t));
                        throwVx = ((last.x - first.x) / dt) * 16;
                        throwVy = ((last.y - first.y) / dt) * 16;
                    }
                    pet.release(throwVx, throwVy);
                }
            });
        }
    }

    attachGlobalEvents() {
        document.addEventListener('click', this.handleClick, true);
        document.addEventListener('contextmenu', this.handleContextMenu, true);
        document.addEventListener('dragstart', this.handleDragStart);
        document.addEventListener('dragover', this.handleDragOver);
        document.addEventListener('dragleave', this.handleDragLeave);
        document.addEventListener('drop', this.handleDrop);
        document.addEventListener('dragend', this.handleDragEnd);
        window.addEventListener('mousemove', this.handleMouseMove, { passive: true });
        window.addEventListener('mouseup', this.handleMouseUp);
    }

    detachGlobalEvents() {
        document.removeEventListener('click', this.handleClick, true);
        document.removeEventListener('contextmenu', this.handleContextMenu, true);
        document.removeEventListener('dragstart', this.handleDragStart);
        document.removeEventListener('dragover', this.handleDragOver);
        document.removeEventListener('dragleave', this.handleDragLeave);
        document.removeEventListener('drop', this.handleDrop);
        document.removeEventListener('dragend', this.handleDragEnd);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
    }

    renderAll() {
        if (this.isRendering) return;
        this.isRendering = true;
        try {
            const scroller = document.querySelector('nav[aria-label="Direkt Mesajlar"] [class*="scroller"], nav[aria-label="Direct Messages"] [class*="scroller"], [class*="privateChannels"] [class*="scroller"]');
            if (!scroller) return;

            this.injectCreateCategoryButton();
            this.renderCategoriesReactSafe(scroller);
        } catch (e) {
            console.error("[DMCategories] renderAll error:", e);
        } finally {
            this.isRendering = false;
        }
    }

    injectCreateCategoryButton() {
        const header = document.querySelector('[class*="privateChannelsHeaderContainer"], h2[class*="privateChannelsHeader"], [class*="privateChannels"] header, [class*="privateChannels"] [role="heading"]');
        if (!header) return;

        const existingActions = header.querySelector('[class*="buttons"], [class*="actions"]') || header.querySelector('div[class*="clickable"]')?.parentElement;
        const targetContainer = existingActions || header;

        if (!header.style.display || header.style.display !== 'flex') {
            header.style.display = 'flex';
            header.style.alignItems = 'center';
        }

        // Shimeji Pet Button
        if (!header.querySelector('.dm-cat-shimeji-btn')) {
            const shimejiBtn = document.createElement('div');
            shimejiBtn.className = `dm-cat-shimeji-btn ${this.shimejiSettings?.enabled ? 'active' : ''}`;
            shimejiBtn.title = 'Shimeji Evcil Hayvanlar (Dante & Vergil)';
            shimejiBtn.setAttribute('role', 'button');
            shimejiBtn.setAttribute('aria-label', 'Shimeji Evcil Hayvanlar');
            shimejiBtn.innerHTML = `
                <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
                </svg>
            `;
            shimejiBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openShimejiModal();
            });
            targetContainer.appendChild(shimejiBtn);
        }

        // Category Add Button
        if (!header.querySelector('.dm-cat-add-btn')) {
            const btn = document.createElement('div');
            btn.className = 'dm-cat-add-btn';
            btn.title = 'Kategori Oluştur';
            btn.setAttribute('role', 'button');
            btn.setAttribute('aria-label', 'Kategori Oluştur');
            btn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z"/>
                </svg>
            `;
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.openCreateModal();
            });
            targetContainer.appendChild(btn);
        }
    }

    renderCategoriesReactSafe(scroller) {
        const listContainer = scroller.querySelector('[role="list"]') || scroller;

        const searchBar = scroller.querySelector('[class*="searchBar"]');
        if (searchBar) {
            const searchEl = searchBar.closest('[role="listitem"]') || searchBar;
            if (searchEl.style.order !== "1") searchEl.style.order = "1";
        }

        const friendsLink = scroller.querySelector('a[href="/channels/@me"]:not([href*="/channels/@me/"])');
        if (friendsLink) {
            const el = friendsLink.closest('[role="listitem"]') || friendsLink;
            if (el.style.order !== "2") el.style.order = "2";
        }

        const nitroLink = scroller.querySelector('a[href*="/nitro"], a[href*="/store"]:not([href*="/shop"]), a[href*="/activities"]');
        if (nitroLink) {
            const el = nitroLink.closest('[role="listitem"]') || nitroLink;
            if (el.style.order !== "3") el.style.order = "3";
        }

        const questLink = scroller.querySelector('a[href*="/quest"]');
        if (questLink) {
            const el = questLink.closest('[role="listitem"]') || questLink;
            if (el.style.order !== "4") el.style.order = "4";
        }

        const allTopDividers = listContainer.querySelectorAll('.dm-cat-top-divider');
        allTopDividers.forEach((d, idx) => {
            if (idx > 0) d.remove();
        });

        let topDivider = listContainer.querySelector('.dm-cat-top-divider');
        if (!topDivider) {
            topDivider = document.createElement('div');
            topDivider.className = 'dm-cat-top-divider';
            listContainer.appendChild(topDivider);
        }
        if (topDivider.style.order !== "5") topDivider.style.order = "5";
        if (topDivider.style.display !== "block") topDivider.style.display = "block";

        const msgReqLink = scroller.querySelector('a[href*="/message-requests"]');
        if (msgReqLink) {
            const el = msgReqLink.closest('[role="listitem"]') || msgReqLink;
            if (el.style.order !== "6") el.style.order = "6";
        }

        const shopLink = scroller.querySelector('a[href*="/shop"]');
        if (shopLink) {
            const el = shopLink.closest('[role="listitem"]') || shopLink;
            if (el.style.order !== "7") el.style.order = "7";
        }

        const allShopDividers = listContainer.querySelectorAll('.dm-cat-shop-divider');
        allShopDividers.forEach((d, idx) => {
            if (idx > 0) d.remove();
        });

        let shopDivider = listContainer.querySelector('.dm-cat-shop-divider');
        if (!shopDivider) {
            shopDivider = document.createElement('div');
            shopDivider.className = 'dm-cat-shop-divider';
            listContainer.appendChild(shopDivider);
        }
        if (shopDivider.style.order !== "49") shopDivider.style.order = "49";
        if (shopDivider.style.display !== "block") shopDivider.style.display = "block";

        const nativeSeparators = scroller.querySelectorAll('[role="separator"], [class*="sectionDivider"]');
        nativeSeparators.forEach(sep => {
            if (!sep.classList.contains('dm-cat-separator') && !sep.classList.contains('dm-cat-top-divider') && !sep.classList.contains('dm-cat-shop-divider')) {
                sep.style.display = "none";
            }
        });

        const allTopLinks = scroller.querySelectorAll('a[href="/channels/@me"], a[href*="/message-requests"], a[href*="nitro"], a[href*="shop"], a[href*="store"], a[href*="quest"], a[href*="activities"]');
        allTopLinks.forEach(link => {
            const el = link.closest('[role="listitem"]') || link;
            if (!el.style.order || el.style.order === "0" || el.style.order === "") {
                el.style.order = "3";
            }
        });

        const header = scroller.querySelector('[class*="privateChannelsHeaderContainer"], h2[class*="privateChannelsHeader"], [class*="privateChannels"] header, [role="heading"]');
        if (header) {
            const headerContainer = header.closest('[role="listitem"]') || header;
            if (headerContainer.style.order !== "50") headerContainer.style.order = "50";
        }

        listContainer.querySelectorAll('.dm-cat-header-wrap').forEach(el => {
            if (!this.categories.some(c => c.id === el.dataset.categoryId)) {
                this.stopRain(el.dataset.categoryId);
                el.remove();
            }
        });

        let currentOrder = 100;

        this.categories.forEach(cat => {
            let headerWrap = listContainer.querySelector(`.dm-cat-header-wrap[data-category-id="${cat.id}"]`);
            if (!headerWrap) {
                headerWrap = document.createElement('div');
                headerWrap.className = 'dm-cat-header-wrap';
                headerWrap.dataset.categoryId = cat.id;
                headerWrap.innerHTML = `
                    <div class="dm-cat-header" draggable="true">
                        <div class="dm-cat-rain-container"></div>
                        <span class="dm-cat-arrow">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>
                        </span>
                        <span class="dm-cat-emoji"></span>
                        <span class="dm-cat-title"></span>
                        <span class="dm-cat-badge" style="display: none;"></span>
                        <span class="dm-cat-unread-badge" style="display: none;"></span>
                        <div class="dm-cat-actions">
                            <span class="dm-cat-action-btn dm-cat-settings" title="Kategoriyi Özelleştir">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                            </span>
                            <span class="dm-cat-action-btn dm-cat-rename" title="Yeniden Adlandır">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
                            </span>
                            <span class="dm-cat-action-btn dm-cat-delete" title="Kategoriyi Sil">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                            </span>
                        </div>
                    </div>
                    <div class="dm-cat-dropzone">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.7;">
                            <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
                        </svg>
                        <span>Sohbeti buraya sürükleyin</span>
                    </div>
                `;

                headerWrap.querySelector('.dm-cat-settings').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openCategorySettingsModal(cat.id);
                });

                headerWrap.querySelector('.dm-cat-rename').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openRenameModal(cat.id);
                });

                headerWrap.querySelector('.dm-cat-delete').addEventListener('click', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openDeleteModal(cat.id);
                });

                const headerInner = headerWrap.querySelector('.dm-cat-header');
                headerInner.addEventListener('click', (e) => {
                    if (e.target.closest('.dm-cat-actions')) return;
                    cat.collapsed = !cat.collapsed;
                    this.saveSettings();

                    const arrowEl = headerWrap.querySelector('.dm-cat-arrow');
                    if (arrowEl) arrowEl.className = `dm-cat-arrow ${cat.collapsed ? 'collapsed' : ''}`;

                    const dropzone = headerWrap.querySelector('.dm-cat-dropzone');
                    if (dropzone) {
                        dropzone.classList.toggle('hidden', cat.collapsed || cat.channels.length > 0);
                    }

                    cat.channels.forEach(channelId => {
                        const dmItem = this.findDMElement(scroller, channelId);
                        if (dmItem) {
                            dmItem.classList.toggle('dm-cat-hidden', cat.collapsed);
                        }
                    });

                    this.scheduleRender(true);
                });

                headerInner.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.openCategoryContextMenu(e.clientX, e.clientY, cat.id);
                });

                listContainer.appendChild(headerWrap);
            }

            headerWrap.style.order = String(currentOrder++);

            this.applyCategoryUpdatesDirectly(cat);

            const arrowEl = headerWrap.querySelector('.dm-cat-arrow');
            if (arrowEl) {
                arrowEl.className = `dm-cat-arrow ${cat.collapsed ? 'collapsed' : ''}`;
            }

            const dropzone = headerWrap.querySelector('.dm-cat-dropzone');
            if (dropzone) {
                if (cat.channels.length === 0 && !cat.collapsed) {
                    dropzone.classList.remove('hidden');
                } else {
                    dropzone.classList.add('hidden');
                }
            }

            cat.channels.forEach(channelId => {
                const dmItem = this.findDMElement(scroller, channelId);
                if (dmItem) {
                    dmItem.style.order = String(currentOrder++);
                    dmItem.classList.add('dm-cat-channel-item');
                    dmItem.setAttribute('draggable', 'true');
                    dmItem.dataset.channelId = String(channelId);
                    dmItem.style.setProperty('--dm-cat-line-color', cat.lineColor || 'rgba(255,255,255,0.45)');
                    if (cat.collapsed) {
                        dmItem.classList.add('dm-cat-hidden');
                    } else {
                        dmItem.classList.remove('dm-cat-hidden');
                    }
                }
            });

            currentOrder += 20;
        });

        const allSeparators = listContainer.querySelectorAll('.dm-cat-separator');
        allSeparators.forEach((s, idx) => {
            if (idx > 0) s.remove();
        });

        let separator = listContainer.querySelector('.dm-cat-separator');
        const hasCategories = this.categories && this.categories.length > 0;
        if (!separator && hasCategories) {
            separator = document.createElement('div');
            separator.className = 'dm-cat-separator';
            listContainer.appendChild(separator);
        }
        if (separator) {
            separator.style.order = String(currentOrder++);
            separator.style.display = hasCategories ? "block" : "none";
        }

        const allDms = scroller.querySelectorAll('[role="listitem"], [class*="channel_"]');

        allDms.forEach(item => {
            const el = item.getAttribute('role') === 'listitem' ? item : item.closest('[role="listitem"]') || item;
            const link = el.querySelector('a[href*="/channels/@me/"]') || (el.tagName === 'A' ? el : null);
            if (!link) return;

            const href = link.getAttribute('href');
            const match = href ? href.match(/\/channels\/@me\/(\d+)/) : null;
            if (!match) return;

            const channelId = String(match[1]);
            el.setAttribute('draggable', 'true');
            el.dataset.channelId = channelId;

            const isCategorized = this.categories.some(c => c.channels && c.channels.some(id => String(id) === channelId));
            if (!isCategorized) {
                el.style.order = String(currentOrder++);
                el.classList.remove('dm-cat-channel-item');
                el.classList.remove('dm-cat-hidden');
                el.style.removeProperty('--dm-cat-line-color');
            }
        });
    }

    getUnreadCountForChannel(channelId) {
        try {
            const ReadStateStore = BdApi.Webpack.getModule(m => m?.getUnreadCount && m?.getMentionCount);
            if (ReadStateStore) {
                const mentions = ReadStateStore.getMentionCount(channelId);
                if (typeof mentions === 'number' && mentions > 0) return mentions;

                const unreads = ReadStateStore.getUnreadCount(channelId);
                if (typeof unreads === 'number' && unreads > 0) {
                    if (typeof ReadStateStore.isChannelMuted === 'function' && ReadStateStore.isChannelMuted(null, channelId)) {
                        return 0;
                    }
                    return unreads;
                }
                return 0;
            }
        } catch (e) { }

        try {
            const scroller = document.querySelector('nav[aria-label="Direkt Mesajlar"] [class*="scroller"], nav[aria-label="Direct Messages"] [class*="scroller"], [class*="privateChannels"] [class*="scroller"]');
            if (scroller) {
                const el = this.findDMElement(scroller, channelId);
                if (el) {
                    const badge = el.querySelector('[class*="numberBadge__"], [class*="numberBadge-"], div[class*="numberBadge"]');
                    if (badge) {
                        const num = parseInt(badge.textContent.trim(), 10);
                        if (!isNaN(num) && num > 0) return num;
                    }
                }
            }
        } catch (e) { }

        return 0;
    }

    getCategoryUnreadCount(cat) {
        if (!cat.channels || cat.channels.length === 0) return 0;
        let total = 0;
        for (const chId of cat.channels) {
            total += this.getUnreadCountForChannel(chId);
        }
        return total;
    }

    getInstalledFonts() {
        const fontMap = new Map();
        try {
            const fs = require('fs');
            const path = require('path');

            const dirs = [
                path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts'),
                path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
            ];

            dirs.forEach(dir => {
                if (fs.existsSync(dir)) {
                    try {
                        const files = fs.readdirSync(dir);
                        files.forEach(file => {
                            const ext = path.extname(file).toLowerCase();
                            if (['.ttf', '.otf', '.woff', '.woff2'].includes(ext)) {
                                let name = path.basename(file, ext);
                                name = name.replace(/[-_](regular|bold|italic|medium|light|semibold|black|extrabold|thin|bd|it|bi|b|i)/gi, '').trim();
                                name = name.replace(/([a-z])([A-Z])/g, '$1 $2').trim();
                                if (name && name.length > 1 && !name.toLowerCase().startsWith('marlett') && !name.toLowerCase().startsWith('segmdl')) {
                                    if (!fontMap.has(name.toLowerCase())) {
                                        fontMap.set(name.toLowerCase(), { name, path: path.join(dir, file).replace(/\\/g, '/') });
                                    }
                                }
                            }
                        });
                    } catch (e) { }
                }
            });
        } catch (e) {
            console.error("[DMCategories] getInstalledFonts error:", e);
        }
        return Array.from(fontMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    }

    registerLocalFont(fontName) {
        if (!fontName || fontName === 'default') return;
        const safeId = fontName.replace(/[^a-zA-Z0-9]/g, '');
        const id = `dm-cat-font-${safeId}`;
        if (document.getElementById(id)) return;

        try {
            const fs = require('fs');
            const path = require('path');
            const dirs = [
                path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'Windows', 'Fonts'),
                path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts')
            ];

            let foundPath = null;
            const targetClean = fontName.toLowerCase().replace(/[^a-z0-9]/g, '');

            for (const dir of dirs) {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir);
                    const match = files.find(f => {
                        const base = path.basename(f, path.extname(f)).toLowerCase().replace(/[^a-z0-9]/g, '');
                        return base === targetClean || base.startsWith(targetClean);
                    });
                    if (match) {
                        foundPath = path.join(dir, match).replace(/\\/g, '/');
                        break;
                    }
                }
            }

            const style = document.createElement('style');
            style.id = id;
            if (foundPath) {
                style.textContent = `
                    @font-face {
                        font-family: '${fontName}';
                        src: local('${fontName}'), url('file:///${foundPath}');
                    }
                `;
            } else {
                style.textContent = `
                    @font-face {
                        font-family: '${fontName}';
                        src: local('${fontName}');
                    }
                `;
            }
            document.head.appendChild(style);
        } catch (e) { }
    }

    applyCategoryUpdatesDirectly(cat) {
        const wrap = document.querySelector(`.dm-cat-header-wrap[data-category-id="${cat.id}"]`);
        if (!wrap) return;

        const headerInner = wrap.querySelector('.dm-cat-header');
        const titleEl = wrap.querySelector('.dm-cat-title');
        const emojiEl = wrap.querySelector('.dm-cat-emoji');
        const badgeEl = wrap.querySelector('.dm-cat-badge');
        const unreadEl = wrap.querySelector('.dm-cat-unread-badge');

        if (titleEl) {
            titleEl.textContent = `${cat.name} (${cat.channels.length})`;

            let effectiveFont = "";
            if (cat.fontFamily && cat.fontFamily !== 'default' && cat.fontFamily !== 'custom') {
                effectiveFont = cat.fontFamily;
            } else if (cat.customFont && cat.customFont.trim()) {
                effectiveFont = cat.customFont.trim();
            }

            if (effectiveFont) {
                if (effectiveFont.startsWith('http://') || effectiveFont.startsWith('https://')) {
                    this.loadWebFont(effectiveFont, cat.id);
                    titleEl.style.fontFamily = `'CustomFont_${cat.id}', sans-serif`;
                } else {
                    this.registerLocalFont(effectiveFont);
                    titleEl.style.fontFamily = `'${effectiveFont}', sans-serif`;
                }
            } else {
                titleEl.style.fontFamily = "";
            }
        }

        if (emojiEl) emojiEl.innerHTML = this.renderEmojiOrImage(cat.emoji || "");

        if (badgeEl) {
            if (cat.badgeText && cat.badgeText.trim()) {
                badgeEl.style.display = "inline-block";
                badgeEl.textContent = cat.badgeText.trim();
                badgeEl.style.backgroundColor = cat.badgeColor || "#5865f2";
            } else {
                badgeEl.style.display = "none";
            }
        }

        // Okunmamış Mesaj Sayacı
        if (unreadEl) {
            const unreadCount = this.getCategoryUnreadCount(cat);
            if (unreadCount > 0) {
                unreadEl.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
                unreadEl.style.display = "inline-flex";
            } else {
                unreadEl.style.display = "none";
            }
        }

        if (headerInner) {
            headerInner.style.color = cat.rgbWave ? "" : (cat.color || "");
            let bgClass = "";
            if (cat.bgStyle === 'glass') bgClass = 'bg-glass';
            else if (cat.bgStyle === 'cyberpunk') bgClass = 'bg-cyberpunk';
            else if (cat.bgStyle === 'fire') bgClass = 'bg-fire';
            else if (cat.bgStyle === 'emerald') bgClass = 'bg-emerald';
            else if (cat.bgStyle === 'gold') bgClass = 'bg-gold';

            headerInner.className = `dm-cat-header ${bgClass} ${cat.glow ? 'glow-effect' : ''} ${cat.rgbWave ? 'rgb-wave-effect' : ''} ${cat.pulse ? 'pulse-effect' : ''}`;
        }

        // Sol çizgi rengini üyelere canlı uygula
        const scroller = document.querySelector('nav[aria-label="Direkt Mesajlar"] [class*="scroller"], nav[aria-label="Direct Messages"] [class*="scroller"], [class*="privateChannels"] [class*="scroller"]');
        if (scroller && cat.channels) {
            cat.channels.forEach(chId => {
                const dmItem = this.findDMElement(scroller, chId);
                if (dmItem) {
                    dmItem.style.setProperty('--dm-cat-line-color', cat.lineColor || 'rgba(255,255,255,0.45)');
                }
            });
        }

        let rainBox = wrap.querySelector('.dm-cat-rain-container');
        if (!rainBox && headerInner) {
            rainBox = document.createElement('div');
            rainBox.className = 'dm-cat-rain-container';
            headerInner.prepend(rainBox);
        }

        if (rainBox) {
            if (cat.emojiRain && cat.emojiRain.enabled && !cat.collapsed) {
                if (!this.rainIntervals[cat.id]) {
                    this.startRain(rainBox, cat);
                }
            } else {
                this.stopRain(cat.id, rainBox);
            }
        }
    }

    loadWebFont(url, catId) {
        const id = `dm-cat-webfont-${catId}`;
        let el = document.getElementById(id);

        if (url.includes('fonts.googleapis.com')) {
            if (!el || el.tagName !== 'LINK') {
                if (el) el.remove();
                el = document.createElement('link');
                el.id = id;
                el.rel = 'stylesheet';
                document.head.appendChild(el);
            }
            el.href = url;
        } else {
            if (!el || el.tagName !== 'STYLE') {
                if (el) el.remove();
                el = document.createElement('style');
                el.id = id;
                document.head.appendChild(el);
            }
            el.textContent = `
                @font-face {
                    font-family: 'CustomFont_${catId}';
                    src: url('${url}');
                }
            `;
        }
    }

    findDMElement(scroller, channelId) {
        const link = scroller.querySelector(`a[href*="/channels/@me/${channelId}"]`);
        if (!link) return null;
        return link.closest('[role="listitem"], [class*="channel_"]') || link;
    }

    removeFromCategory(channelId) {
        this.categories.forEach(c => {
            c.channels = c.channels.filter(id => id !== channelId);
        });
        this.saveSettings();
        this.scheduleRender();
    }

    renderEmojiOrImage(input) {
        if (!input) return "";
        const str = String(input).trim();
        const customMatch = str.match(/<(a)?:([a-zA-Z0-9_~]+):(\d+)>/);
        if (customMatch) {
            const isAnimated = !!customMatch[1];
            const emojiId = customMatch[3];
            const ext = isAnimated ? 'gif' : 'webp';
            return `<img class="dm-cat-custom-emoji" src="https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=48&quality=lossless" alt="${customMatch[2]}" />`;
        }
        if (str.startsWith('http://') || str.startsWith('https://')) {
            return `<img class="dm-cat-custom-emoji" src="${str}" alt="icon" />`;
        }
        return this.escapeHtml(str);
    }

    getCustomEmojiUrl(input) {
        if (!input) return null;
        const str = String(input).trim();
        const customMatch = str.match(/<(a)?:([a-zA-Z0-9_~]+):(\d+)>/);
        if (customMatch) {
            const isAnimated = !!customMatch[1];
            const emojiId = customMatch[3];
            const ext = isAnimated ? 'gif' : 'webp';
            return `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=48&quality=lossless`;
        }
        if (str.startsWith('http://') || str.startsWith('https://')) {
            return str;
        }
        return null;
    }

    startRain(rainBox, cat) {
        this.stopRain(cat.id, rainBox);
        const rawEmoji = (cat.emojiRain && cat.emojiRain.emoji) ? cat.emojiRain.emoji.trim() : "✨";
        const customUrl = this.getCustomEmojiUrl(rawEmoji);

        let intervalMs = 280;
        if (cat.emojiRain && cat.emojiRain.density === 'low') intervalMs = 480;
        if (cat.emojiRain && cat.emojiRain.density === 'high') intervalMs = 150;
        if (cat.emojiRain && cat.emojiRain.density === 'storm') intervalMs = 75;

        let baseDuration = 1.6;
        if (cat.emojiRain && cat.emojiRain.speed === 'slow') baseDuration = 2.5;
        if (cat.emojiRain && cat.emojiRain.speed === 'fast') baseDuration = 1.0;

        this.rainIntervals[cat.id] = setInterval(() => {
            if (!document.body.contains(rainBox)) {
                this.stopRain(cat.id);
                return;
            }

            let p;
            if (customUrl) {
                p = document.createElement('img');
                p.className = 'dm-cat-particle dm-cat-particle-img';
                p.src = customUrl;
            } else {
                p = document.createElement('span');
                p.className = 'dm-cat-particle';
                p.textContent = rawEmoji || "✨";
                p.style.fontSize = `${Math.floor(Math.random() * 5 + 12)}px`;
            }

            const fallDuration = (Math.random() * 0.4 + baseDuration).toFixed(2);
            p.style.left = `${Math.floor(Math.random() * 85 + 5)}%`;
            p.style.animationDuration = `${fallDuration}s`;

            p.onanimationend = () => {
                p.remove();
            };

            rainBox.appendChild(p);

            setTimeout(() => {
                if (p.parentNode) p.remove();
            }, (parseFloat(fallDuration) * 1000) + 400);
        }, intervalMs);
    }

    stopRain(catId, rainBox) {
        if (this.rainIntervals[catId]) {
            clearInterval(this.rainIntervals[catId]);
            delete this.rainIntervals[catId];
        }
        if (rainBox) {
            rainBox.innerHTML = "";
        }
    }

    clearAllRain() {
        Object.keys(this.rainIntervals).forEach(id => {
            clearInterval(this.rainIntervals[id]);
        });
        this.rainIntervals = {};
    }

    openCategorySettingsModal(catId) {
        const cat = this.categories.find(c => c.id === catId);
        if (!cat) return;

        this.closeModal();

        if (!cat.emoji) cat.emoji = "";
        if (!cat.color) cat.color = "#949ba4";
        if (!cat.lineColor) cat.lineColor = "#ffffff";
        if (!cat.bgStyle) cat.bgStyle = "default";
        if (!cat.fontFamily) cat.fontFamily = "default";
        if (!cat.customFont) cat.customFont = "";
        if (!cat.badgeText) cat.badgeText = "";
        if (!cat.badgeColor) cat.badgeColor = "#5865f2";
        if (cat.glow === undefined) cat.glow = false;
        if (cat.rgbWave === undefined) cat.rgbWave = false;
        if (cat.pulse === undefined) cat.pulse = false;
        if (!cat.emojiRain) cat.emojiRain = { enabled: false, emoji: "✨", speed: "normal", density: "medium" };

        const colors = [
            "#949ba4", "#5865f2", "#57f287", "#fee75c",
            "#eb459e", "#ed4245", "#00b0f4", "#9b59b6",
            "#e67e22", "#ffffff"
        ];

        const lineColors = [
            "#ffffff", "#5865f2", "#eb459e", "#57f287",
            "#fee75c", "#00b0f4", "#ed4245"
        ];

        const badgeColors = [
            "#5865f2", "#eb459e", "#57f287", "#fee75c",
            "#ed4245", "#e67e22", "#9b59b6", "#111214"
        ];

        const backdrop = document.createElement('div');
        backdrop.className = 'dm-cat-modal-backdrop';
        backdrop.innerHTML = `
            <div class="dm-cat-modal-box">
                <div class="dm-cat-modal-header">
                    <span>Kategori Özelleştirme</span>
                </div>

                <div class="dm-cat-tabs">
                    <div class="dm-cat-tab-btn active" data-tab="tab-general">Görünüm</div>
                    <div class="dm-cat-tab-btn" data-tab="tab-font">Yazı Tipi</div>
                    <div class="dm-cat-tab-btn" data-tab="tab-effects">Efektler</div>
                    <div class="dm-cat-tab-btn" data-tab="tab-rain">Partikül Yağmuru</div>
                    <div class="dm-cat-tab-btn" data-tab="tab-badge">Rozet & Ayrım</div>
                </div>

                <div class="dm-cat-modal-body">
                    <div class="dm-cat-tab-pane active" id="tab-general">
                        <div style="display: flex; gap: 10px;">
                            <div class="dm-cat-setting-row" style="flex: 1;">
                                <label class="dm-cat-setting-label">Kategori İsmi</label>
                                <input type="text" class="dm-cat-modal-input" id="dmSetCatName" value="${this.escapeHtml(cat.name)}" />
                            </div>
                            <div class="dm-cat-setting-row" style="flex: 1;">
                                <label class="dm-cat-setting-label">İkon / Sunucu Emojisi</label>
                                <input type="text" class="dm-cat-modal-input" id="dmSetCatEmoji" value="${this.escapeHtml(cat.emoji)}" placeholder="Emoji, <:emoji:id> veya Resim URL" />
                            </div>
                        </div>

                        <div class="dm-cat-setting-row">
                            <label class="dm-cat-setting-label">Başlık Yazı Rengi</label>
                            <div class="dm-cat-color-palette" id="dmTitleColorPalette">
                                ${colors.map(c => `<div class="dm-cat-color-swatch ${cat.color === c ? 'active' : ''}" data-color="${c}" style="background-color: ${c};"></div>`).join('')}
                                <input type="color" id="dmCustomTitleColor" value="${cat.color.startsWith('#') ? cat.color : '#5865f2'}" style="width: 28px; height: 28px; border: none; cursor: pointer; background: transparent;" title="Özel Renk Seç" />
                            </div>
                        </div>

                        <div class="dm-cat-setting-row">
                            <label class="dm-cat-setting-label">Arka Plan Teması</label>
                            <select class="dm-cat-select" id="dmSetBgStyle">
                                <option value="default" ${cat.bgStyle === 'default' ? 'selected' : ''}>Standart</option>
                                <option value="glass" ${cat.bgStyle === 'glass' ? 'selected' : ''}>Buzlu Cam</option>
                                <option value="cyberpunk" ${cat.bgStyle === 'cyberpunk' ? 'selected' : ''}>Cyberpunk Neon</option>
                                <option value="fire" ${cat.bgStyle === 'fire' ? 'selected' : ''}>Ateşli Gradyan</option>
                                <option value="emerald" ${cat.bgStyle === 'emerald' ? 'selected' : ''}>Zümrüt Yeşili</option>
                                <option value="gold" ${cat.bgStyle === 'gold' ? 'selected' : ''}>Altın Teması</option>
                            </select>
                        </div>
                    </div>

                    <div class="dm-cat-tab-pane" id="tab-font">
                        <div class="dm-cat-setting-row">
                            <label class="dm-cat-setting-label">Yazı Tipi Seçin</label>
                            <select class="dm-cat-select" id="dmSetFontFamily">
                                <optgroup label="Varsayılan">
                                    <option value="default" ${cat.fontFamily === 'default' || !cat.fontFamily ? 'selected' : ''}>Discord Varsayılan Fontu</option>
                                </optgroup>
                                <optgroup label="Popüler Sistem Fontları">
                                    <option value="Impact" ${cat.fontFamily === 'Impact' ? 'selected' : ''}>Impact (Kalın Başlık)</option>
                                    <option value="Bahnschrift" ${cat.fontFamily === 'Bahnschrift' ? 'selected' : ''}>Bahnschrift (Modern)</option>
                                    <option value="Segoe UI" ${cat.fontFamily === 'Segoe UI' ? 'selected' : ''}>Segoe UI</option>
                                    <option value="Consolas" ${cat.fontFamily === 'Consolas' ? 'selected' : ''}>Consolas (Kod Fontu)</option>
                                    <option value="Trebuchet MS" ${cat.fontFamily === 'Trebuchet MS' ? 'selected' : ''}>Trebuchet MS</option>
                                    <option value="Comic Sans MS" ${cat.fontFamily === 'Comic Sans MS' ? 'selected' : ''}>Comic Sans MS</option>
                                    <option value="Verdana" ${cat.fontFamily === 'Verdana' ? 'selected' : ''}>Verdana</option>
                                    <option value="Tahoma" ${cat.fontFamily === 'Tahoma' ? 'selected' : ''}>Tahoma</option>
                                    <option value="Georgia" ${cat.fontFamily === 'Georgia' ? 'selected' : ''}>Georgia</option>
                                    <option value="Arial Black" ${cat.fontFamily === 'Arial Black' ? 'selected' : ''}>Arial Black</option>
                                </optgroup>
                                <optgroup label="Özel Web Fontları">
                                    <option value="Orbitron" ${cat.fontFamily === 'Orbitron' ? 'selected' : ''}>Orbitron (Gamer)</option>
                                    <option value="Poppins" ${cat.fontFamily === 'Poppins' ? 'selected' : ''}>Poppins (Modern)</option>
                                    <option value="Montserrat" ${cat.fontFamily === 'Montserrat' ? 'selected' : ''}>Montserrat</option>
                                    <option value="Press Start 2P" ${cat.fontFamily === 'Press Start 2P' ? 'selected' : ''}>Pixel Retro</option>
                                    <option value="Righteous" ${cat.fontFamily === 'Righteous' ? 'selected' : ''}>Righteous</option>
                                    <option value="Cinzel" ${cat.fontFamily === 'Cinzel' ? 'selected' : ''}>Cinzel (Klasik)</option>
                                    <option value="Permanent Marker" ${cat.fontFamily === 'Permanent Marker' ? 'selected' : ''}>Permanent Marker</option>
                                </optgroup>
                                <optgroup id="dmLocalFontsOptGroup" label="Bilgisayarındaki Yüklü Fontlar">
                                </optgroup>
                                <optgroup label="Elle Font Adı">
                                    <option value="custom" ${cat.fontFamily === 'custom' || (cat.customFont && !cat.customFont.startsWith('data:') && cat.customFont.trim()) ? 'selected' : ''}>Özel Font İsmi Yaz</option>
                                </optgroup>
                            </select>
                        </div>

                        <div class="dm-cat-setting-row" id="dmCustomFontBox" style="display: ${cat.fontFamily === 'custom' || (cat.customFont && !cat.customFont.startsWith('data:') && cat.customFont.trim()) ? 'flex' : 'none'};">
                            <label class="dm-cat-setting-label">Bilgisayarında Yüklü Olan Fontun Adı</label>
                            <input type="text" class="dm-cat-modal-input" id="dmSetCustomFont" value="${this.escapeHtml((cat.customFont && !cat.customFont.startsWith('data:')) ? cat.customFont : '')}" placeholder="Örn: Valorant, Bebas Neue, Minecraftia" />
                            <div class="dm-cat-setting-desc">Windows'a kurduğun herhangi bir fontun adını buraya yazman yeterlidir, sıfır kasma ile anında çalışır.</div>
                        </div>
                    </div>

                    <div class="dm-cat-tab-pane" id="tab-effects">
                        <div class="dm-cat-checkbox-row">
                            <div>
                                <div style="color: var(--header-primary, #fff); font-size: 14px; font-weight: 500;">Neon Parlama</div>
                                <div class="dm-cat-setting-desc">Başlık yazısının etrafına canlı neon parıltı verir.</div>
                            </div>
                            <div class="dm-cat-toggle ${cat.glow ? 'active' : ''}" id="dmToggleGlow"></div>
                        </div>

                        <div class="dm-cat-checkbox-row">
                            <div>
                                <div style="color: var(--header-primary, #fff); font-size: 14px; font-weight: 500;">RGB Gökkuşağı Dalgası</div>
                                <div class="dm-cat-setting-desc">Kategori başlığını kesintisiz RGB renk geçişine sokar.</div>
                            </div>
                            <div class="dm-cat-toggle ${cat.rgbWave ? 'active' : ''}" id="dmToggleRgb"></div>
                        </div>

                        <div class="dm-cat-checkbox-row">
                            <div>
                                <div style="color: var(--header-primary, #fff); font-size: 14px; font-weight: 500;">Pulse Nabız Animasyonu</div>
                                <div class="dm-cat-setting-desc">Kategori başlığına hafif canlı nabız animasyonu verir.</div>
                            </div>
                            <div class="dm-cat-toggle ${cat.pulse ? 'active' : ''}" id="dmTogglePulse"></div>
                        </div>
                    </div>

                    <div class="dm-cat-tab-pane" id="tab-rain">
                        <div class="dm-cat-checkbox-row">
                            <div>
                                <div style="color: var(--header-primary, #fff); font-size: 14px; font-weight: 600;">Partikül Yağmuru Efekti</div>
                                <div class="dm-cat-setting-desc">Kategori arka planında seçtiğin emoji veya sunucu emojisini yağdırır.</div>
                            </div>
                            <div class="dm-cat-toggle ${cat.emojiRain.enabled ? 'active' : ''}" id="dmToggleRain"></div>
                        </div>

                        <div id="dmRainDetails" style="display: ${cat.emojiRain.enabled ? 'flex' : 'none'}; flex-direction: column; gap: 10px; margin-top: 4px;">
                            <div class="dm-cat-setting-row">
                                <label class="dm-cat-setting-label">Yağacak Emoji veya Sunucu Emojisi</label>
                                <input type="text" class="dm-cat-modal-input" id="dmSetRainEmoji" value="${this.escapeHtml(cat.emojiRain.emoji || '✨')}" placeholder="Emoji, <:emoji:id> veya Resim URL yapıştırın" />
                            </div>

                            <div style="display: flex; gap: 10px;">
                                <div class="dm-cat-setting-row" style="flex: 1;">
                                    <label class="dm-cat-setting-label">Düşme Hızı</label>
                                    <select class="dm-cat-select" id="dmSetRainSpeed">
                                        <option value="slow" ${cat.emojiRain.speed === 'slow' ? 'selected' : ''}>Yavaş</option>
                                        <option value="normal" ${cat.emojiRain.speed === 'normal' || !cat.emojiRain.speed ? 'selected' : ''}>Normal</option>
                                        <option value="fast" ${cat.emojiRain.speed === 'fast' ? 'selected' : ''}>Hızlı</option>
                                    </select>
                                </div>
                                <div class="dm-cat-setting-row" style="flex: 1;">
                                    <label class="dm-cat-setting-label">Parçacık Yoğunluğu</label>
                                    <select class="dm-cat-select" id="dmSetRainDensity">
                                        <option value="low" ${cat.emojiRain.density === 'low' ? 'selected' : ''}>Düşük</option>
                                        <option value="medium" ${cat.emojiRain.density === 'medium' || !cat.emojiRain.density ? 'selected' : ''}>Orta</option>
                                        <option value="high" ${cat.emojiRain.density === 'high' ? 'selected' : ''}>Yoğun</option>
                                        <option value="storm" ${cat.emojiRain.density === 'storm' ? 'selected' : ''}>Fırtına</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="dm-cat-tab-pane" id="tab-badge">
                        <div style="display: flex; gap: 10px;">
                            <div class="dm-cat-setting-row" style="flex: 1;">
                                <label class="dm-cat-setting-label">Kategori Rozeti</label>
                                <input type="text" class="dm-cat-modal-input" id="dmSetBadgeText" value="${this.escapeHtml(cat.badgeText || '')}" placeholder="Örn: VIP, KLAN, MOD..." />
                            </div>
                            <div class="dm-cat-setting-row" style="flex: 1;">
                                <label class="dm-cat-setting-label">Rozet Rengi</label>
                                <div class="dm-cat-color-palette" id="dmBadgeColorPalette">
                                    ${badgeColors.map(c => `<div class="dm-cat-color-swatch ${cat.badgeColor === c ? 'active' : ''}" data-color="${c}" style="background-color: ${c};"></div>`).join('')}
                                    <input type="color" id="dmCustomBadgeColor" value="${cat.badgeColor && cat.badgeColor.startsWith('#') ? cat.badgeColor : '#5865f2'}" style="width: 28px; height: 28px; border: none; cursor: pointer; background: transparent;" title="Özel Renk Seç" />
                                </div>
                            </div>
                        </div>

                        <div class="dm-cat-setting-row" style="margin-top: 8px;">
                            <label class="dm-cat-setting-label">Kullanıcı Sol Gösterge Çizgisi Rengi</label>
                            <div class="dm-cat-color-palette" id="dmLineColorPalette">
                                ${lineColors.map(c => `<div class="dm-cat-color-swatch ${cat.lineColor === c ? 'active' : ''}" data-color="${c}" style="background-color: ${c};"></div>`).join('')}
                                <input type="color" id="dmCustomLineColor" value="${cat.lineColor.startsWith('#') ? cat.lineColor : '#ffffff'}" style="width: 28px; height: 28px; border: none; cursor: pointer; background: transparent;" title="Özel Renk Seç" />
                            </div>
                        </div>
                    </div>
                </div>

                <div class="dm-cat-modal-footer">
                    <button class="dm-cat-btn dm-cat-btn-cancel" id="dmModalCancel">İptal</button>
                    <button class="dm-cat-btn dm-cat-btn-primary" id="dmModalSave">Kaydet ve Uygula</button>
                </div>
            </div>
        `;

        let selectedColor = cat.color;
        let selectedLineColor = cat.lineColor;
        let selectedBadgeColor = cat.badgeColor || "#5865f2";
        let glowActive = !!cat.glow;
        let rgbActive = !!cat.rgbWave;
        let pulseActive = !!cat.pulse;
        let rainActive = !!cat.emojiRain.enabled;

        backdrop.querySelectorAll('.dm-cat-tab-btn').forEach(btn => {
            btn.onclick = () => {
                backdrop.querySelectorAll('.dm-cat-tab-btn').forEach(b => b.classList.remove('active'));
                backdrop.querySelectorAll('.dm-cat-tab-pane').forEach(p => p.classList.remove('active'));
                btn.classList.add('active');
                backdrop.querySelector(`#${btn.dataset.tab}`).classList.add('active');
            };
        });

        const fontSelect = backdrop.querySelector('#dmSetFontFamily');
        const customFontBox = backdrop.querySelector('#dmCustomFontBox');
        const customFontInput = backdrop.querySelector('#dmSetCustomFont');

        fontSelect.onchange = () => {
            if (fontSelect.value === 'custom') {
                customFontBox.style.display = 'flex';
                customFontInput.focus();
            } else {
                customFontBox.style.display = 'none';
            }
        };

        try {
            const localFonts = this.getInstalledFonts();
            const optGroup = backdrop.querySelector('#dmLocalFontsOptGroup');
            if (optGroup && localFonts.length > 0) {
                localFonts.forEach(f => {
                    const opt = document.createElement('option');
                    opt.value = f.name;
                    opt.textContent = f.name;
                    if (cat.fontFamily === f.name || (cat.customFont && cat.customFont.toLowerCase() === f.name.toLowerCase())) {
                        opt.selected = true;
                    }
                    optGroup.appendChild(opt);
                });
            }
        } catch (e) {
            console.error("[DMCategories] Failed to populate local fonts:", e);
        }

        backdrop.querySelectorAll('#dmTitleColorPalette .dm-cat-color-swatch').forEach(sw => {
            sw.onclick = () => {
                backdrop.querySelectorAll('#dmTitleColorPalette .dm-cat-color-swatch').forEach(s => s.classList.remove('active'));
                sw.classList.add('active');
                selectedColor = sw.dataset.color;
            };
        });
        const customTitlePicker = backdrop.querySelector('#dmCustomTitleColor');
        customTitlePicker.oninput = (e) => {
            selectedColor = e.target.value;
            backdrop.querySelectorAll('#dmTitleColorPalette .dm-cat-color-swatch').forEach(s => s.classList.remove('active'));
        };

        backdrop.querySelectorAll('#dmBadgeColorPalette .dm-cat-color-swatch').forEach(sw => {
            sw.onclick = () => {
                backdrop.querySelectorAll('#dmBadgeColorPalette .dm-cat-color-swatch').forEach(s => s.classList.remove('active'));
                sw.classList.add('active');
                selectedBadgeColor = sw.dataset.color;
            };
        });
        const customBadgePicker = backdrop.querySelector('#dmCustomBadgeColor');
        customBadgePicker.oninput = (e) => {
            selectedBadgeColor = e.target.value;
            backdrop.querySelectorAll('#dmBadgeColorPalette .dm-cat-color-swatch').forEach(s => s.classList.remove('active'));
        };

        backdrop.querySelectorAll('#dmLineColorPalette .dm-cat-color-swatch').forEach(sw => {
            sw.onclick = () => {
                backdrop.querySelectorAll('#dmLineColorPalette .dm-cat-color-swatch').forEach(s => s.classList.remove('active'));
                sw.classList.add('active');
                selectedLineColor = sw.dataset.color;
            };
        });
        const customLinePicker = backdrop.querySelector('#dmCustomLineColor');
        customLinePicker.oninput = (e) => {
            selectedLineColor = e.target.value;
            backdrop.querySelectorAll('#dmLineColorPalette .dm-cat-color-swatch').forEach(s => s.classList.remove('active'));
        };

        const toggleGlow = backdrop.querySelector('#dmToggleGlow');
        toggleGlow.onclick = () => {
            glowActive = !glowActive;
            toggleGlow.classList.toggle('active', glowActive);
        };

        const toggleRgb = backdrop.querySelector('#dmToggleRgb');
        toggleRgb.onclick = () => {
            rgbActive = !rgbActive;
            toggleRgb.classList.toggle('active', rgbActive);
        };

        const togglePulse = backdrop.querySelector('#dmTogglePulse');
        togglePulse.onclick = () => {
            pulseActive = !pulseActive;
            togglePulse.classList.toggle('active', pulseActive);
        };

        const toggleRain = backdrop.querySelector('#dmToggleRain');
        const rainDetails = backdrop.querySelector('#dmRainDetails');
        toggleRain.onclick = () => {
            rainActive = !rainActive;
            toggleRain.classList.toggle('active', rainActive);
            rainDetails.style.display = rainActive ? 'flex' : 'none';
        };

        backdrop.querySelector('#dmModalSave').onclick = () => {
            const name = backdrop.querySelector('#dmSetCatName').value.trim();
            const emoji = backdrop.querySelector('#dmSetCatEmoji').value.trim();
            const badgeText = backdrop.querySelector('#dmSetBadgeText').value.trim();
            const bgStyle = backdrop.querySelector('#dmSetBgStyle').value;
            const fontFamily = backdrop.querySelector('#dmSetFontFamily').value;
            const customFont = backdrop.querySelector('#dmSetCustomFont').value.trim();
            const rainEmoji = backdrop.querySelector('#dmSetRainEmoji').value.trim() || "✨";
            const rainSpeed = backdrop.querySelector('#dmSetRainSpeed').value;
            const rainDensity = backdrop.querySelector('#dmSetRainDensity').value;

            if (name) cat.name = name;
            cat.emoji = emoji;
            cat.badgeText = badgeText;
            cat.badgeColor = selectedBadgeColor;
            cat.color = selectedColor;
            cat.lineColor = selectedLineColor;
            cat.bgStyle = bgStyle;
            cat.fontFamily = fontFamily;
            cat.customFont = customFont;
            cat.glow = glowActive;
            cat.rgbWave = rgbActive;
            cat.pulse = pulseActive;
            cat.emojiRain = {
                enabled: rainActive,
                emoji: rainEmoji,
                speed: rainSpeed,
                density: rainDensity
            };

            this.stopRain(cat.id);
            this.saveSettings();
            this.closeModal();
            this.scheduleRender();
        };

        backdrop.querySelector('#dmModalCancel').onclick = () => this.closeModal();
        backdrop.onclick = (e) => { if (e.target === backdrop) this.closeModal(); };

        document.body.appendChild(backdrop);
    }

    openUserSoundModal(channelId) {
        this.closeModal();
        const existing = this.customSounds[channelId] || { url: "", volume: 0.8 };
        let previewAudio = null;
        let activePlayingCard = null;

        // Fetch / refresh soundboard sounds in background so store has all guild sounds
        this.fetchSoundboardSounds();

        // Target name resolution for modal header
        let targetName = "";
        try {
            const ChannelStore = BdApi.Webpack.getStore("ChannelStore");
            const UserStore = BdApi.Webpack.getStore("UserStore");
            const channel = ChannelStore?.getChannel?.(channelId);
            if (channel) {
                if (channel.isDM?.() && channel.getRecipientId?.()) {
                    const u = UserStore?.getUser?.(channel.getRecipientId());
                    if (u) targetName = ` - @${u.globalName || u.username}`;
                } else if (channel.name) {
                    targetName = ` - #${channel.name}`;
                }
            } else {
                const u = UserStore?.getUser?.(channelId);
                if (u) targetName = ` - @${u.globalName || u.username}`;
            }
        } catch (e) { }

        // State tracking
        let selectedUrl = existing.url || "";
        let selectedVolume = (typeof existing.volume === 'number') ? existing.volume : 0.8;
        let selectedSoundName = existing.soundName || (selectedUrl.includes('discordapp.com/soundboard-sounds') ? 'Soundboard Sesi' : (selectedUrl ? 'Özel Ses' : ''));
        let selectedGuildName = existing.guildName || "";
        let selectedEmoji = existing.emoji || "";
        let selectedEmojiId = existing.emojiId || "";
        let selectedSourceType = existing.sourceType || (selectedUrl.includes('discordapp.com/soundboard-sounds') ? 'soundboard' : (selectedUrl ? 'custom' : 'soundboard'));

        const isSoundboardInitially = (selectedSourceType === 'soundboard' || selectedUrl.includes('discordapp.com/soundboard-sounds') || !selectedUrl);

        const backdrop = document.createElement('div');
        backdrop.className = 'dm-cat-modal-backdrop';
        backdrop.innerHTML = `
            <div class="dm-cat-modal-box" style="width: 580px;">
                <div class="dm-cat-modal-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--brand-500, #5865f2)">
                            <path d="M12 3v9.28a4.39 4.39 0 0 0-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/>
                        </svg>
                        <span>Özel Bildirim Sesi${this.escapeHtml(targetName)}</span>
                    </div>
                </div>

                <!-- Active Selected Sound Banner -->
                <div style="padding: 12px 20px 0 20px;">
                    <div class="dm-cat-sound-active-banner" id="dmSoundActiveBanner">
                        <div class="dm-cat-sound-active-info">
                            <div id="dmActiveSoundEmoji" style="font-size: 20px; display: flex; align-items: center; justify-content: center; min-width: 24px;">
                                ${selectedEmojiId ? `<img src="https://cdn.discordapp.com/emojis/${selectedEmojiId}.webp?size=48" style="width: 22px; height: 22px; object-fit: contain;" />` : (selectedEmoji || '🔔')}
                            </div>
                            <div style="overflow: hidden;">
                                <div class="dm-cat-sound-active-title" id="dmActiveSoundName">${this.escapeHtml(selectedSoundName || 'Ses Seçilmedi')}</div>
                                <div class="dm-cat-sound-active-sub" id="dmActiveSoundSub">${selectedGuildName ? this.escapeHtml(selectedGuildName) : (selectedUrl ? 'Özel MP3 / Ses Dosyası' : 'Aşağıdaki seçeneklerden bir ses belirleyin')}</div>
                            </div>
                        </div>
                        <button type="button" class="dm-cat-btn" id="dmQuickTestBtn" style="background: var(--brand-500, #5865f2); color: #fff; padding: 6px 12px; font-size: 12px; display: flex; align-items: center; gap: 5px; flex-shrink: 0; ${selectedUrl ? '' : 'display: none;'}">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                            <span>Dinle</span>
                        </button>
                    </div>
                </div>

                <div class="dm-cat-tabs" style="margin-top: 12px;">
                    <div class="dm-cat-tab-btn ${isSoundboardInitially ? 'active' : ''}" data-sound-tab="soundboard">
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9v-2h2v2zm0-4H9V7h2v5zm4 4h-2v-6h2v6zm0-8h-2V7h2v1z"/></svg>
                            Sunucu Soundboard
                        </span>
                    </div>
                    <div class="dm-cat-tab-btn ${!isSoundboardInitially ? 'active' : ''}" data-sound-tab="custom">
                        <span style="display: flex; align-items: center; gap: 6px;">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
                            Özel Dosya / MP3 Linki
                        </span>
                    </div>
                </div>

                <div class="dm-cat-modal-body" style="padding-top: 12px;">
                    <!-- Soundboard Pane -->
                    <div class="dm-cat-tab-pane ${isSoundboardInitially ? 'active' : ''}" id="dmTabSoundboard">
                        <div style="display: flex; gap: 8px; align-items: center;">
                            <div class="dm-cat-sound-search-wrap" style="flex: 1; margin-bottom: 0;">
                                <div class="dm-cat-sound-search-icon">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
                                </div>
                                <input type="text" class="dm-cat-sound-search-input" id="dmSoundSearch" placeholder="Soundboard sesi veya sunucu ara..." />
                            </div>
                            <button type="button" class="dm-cat-btn" id="dmSoundboardRefresh" title="Soundboard seslerini yenile" style="background: var(--background-secondary-alt, #1e1f22); color: var(--interactive-normal, #b5bac1); padding: 8px 10px; display: flex; align-items: center; justify-content: center;">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.65 6.35A7.958 7.958 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                            </button>
                        </div>

                        <div class="dm-cat-soundboard-container" id="dmSoundboardContainer">
                            <!-- Populated dynamically -->
                        </div>
                    </div>

                    <!-- Custom MP3 / File Pane -->
                    <div class="dm-cat-tab-pane ${!isSoundboardInitially ? 'active' : ''}" id="dmTabCustom">
                        <div class="dm-cat-setting-row">
                            <label class="dm-cat-setting-label">MP3 Bağlantısı veya Bilgisayardan Dosya</label>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <input type="text" class="dm-cat-modal-input" id="dmSoundUrlInput" value="${this.escapeHtml((selectedSourceType === 'custom' && selectedUrl) ? selectedUrl : '')}" placeholder="https://site.com/ses.mp3 veya dosya seçin" style="flex: 1;" />
                                <input type="file" id="dmSoundFileInput" accept="audio/*,.mp3,.wav,.ogg,.m4a" style="display: none;" />
                                <button type="button" class="dm-cat-btn" id="dmBrowseFileBtn" style="background: var(--brand-500, #5865f2); color: #fff; padding: 9px 12px; font-size: 13px; display: flex; align-items: center; gap: 6px; white-space: nowrap; flex-shrink: 0;">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/>
                                    </svg>
                                    <span>Dosya Seç</span>
                                </button>
                            </div>
                            <div class="dm-cat-setting-desc">İster bilgisayarındaki bir ses dosyasını (.mp3, .wav, .ogg vb.) seç, ister internetteki bir ses linkini yapıştır.</div>
                        </div>
                    </div>

                    <!-- Shared Volume Controls -->
                    <div style="background: rgba(0,0,0,0.15); border-radius: 6px; padding: 10px 14px; margin-top: 4px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <label class="dm-cat-setting-label" style="margin-bottom: 0;">Ses Düzeyi</label>
                            <span id="dmSoundVolText" style="color: var(--text-normal, #fff); font-size: 13px; font-weight: 600;">${Math.round(selectedVolume * 100)}%</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-muted, #949ba4)"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                            <input type="range" id="dmSoundVolume" min="0" max="1" step="0.05" value="${selectedVolume}" style="flex: 1; accent-color: var(--brand-500, #5865f2); cursor: pointer;" />
                        </div>
                    </div>
                </div>

                <div class="dm-cat-modal-footer">
                    ${existing.url ? `<button class="dm-cat-btn dm-cat-btn-danger" id="dmRemoveSoundBtn" style="margin-right: auto;">Sesi Kaldır</button>` : ''}
                    <button class="dm-cat-btn dm-cat-btn-cancel" id="dmSoundCancel">İptal</button>
                    <button class="dm-cat-btn dm-cat-btn-primary" id="dmSoundSave">Kaydet</button>
                </div>
            </div>
        `;

        const tabs = backdrop.querySelectorAll('.dm-cat-tab-btn');
        const tabSoundboard = backdrop.querySelector('#dmTabSoundboard');
        const tabCustom = backdrop.querySelector('#dmTabCustom');
        const soundboardContainer = backdrop.querySelector('#dmSoundboardContainer');
        const searchInput = backdrop.querySelector('#dmSoundSearch');
        const refreshBtn = backdrop.querySelector('#dmSoundboardRefresh');
        const urlInput = backdrop.querySelector('#dmSoundUrlInput');
        const fileInput = backdrop.querySelector('#dmSoundFileInput');
        const browseBtn = backdrop.querySelector('#dmBrowseFileBtn');
        const volumeInput = backdrop.querySelector('#dmSoundVolume');
        const volumeText = backdrop.querySelector('#dmSoundVolText');
        const activeName = backdrop.querySelector('#dmActiveSoundName');
        const activeSub = backdrop.querySelector('#dmActiveSoundSub');
        const activeEmoji = backdrop.querySelector('#dmActiveSoundEmoji');
        const quickTestBtn = backdrop.querySelector('#dmQuickTestBtn');
        const removeBtn = backdrop.querySelector('#dmRemoveSoundBtn');

        const updateActiveBanner = () => {
            if (selectedUrl) {
                activeName.textContent = selectedSoundName || 'Seçili Ses';
                activeSub.textContent = selectedGuildName ? selectedGuildName : (selectedSourceType === 'custom' ? 'Özel MP3 / Ses Dosyası' : 'Soundboard Sesi');
                if (selectedEmojiId) {
                    activeEmoji.innerHTML = `<img src="https://cdn.discordapp.com/emojis/${selectedEmojiId}.webp?size=48" style="width: 22px; height: 22px; object-fit: contain;" />`;
                } else {
                    activeEmoji.textContent = selectedEmoji || '🔊';
                }
                quickTestBtn.style.display = 'flex';
            } else {
                activeName.textContent = 'Ses Seçilmedi';
                activeSub.textContent = 'Aşağıdaki seçeneklerden bir ses belirleyin';
                activeEmoji.textContent = '🔔';
                quickTestBtn.style.display = 'none';
            }
        };

        const playPreview = (url, vol, cardEl) => {
            if (previewAudio) {
                previewAudio.pause();
                previewAudio = null;
            }
            if (activePlayingCard) {
                activePlayingCard.classList.remove('playing');
                const pIcon = activePlayingCard.querySelector('.dm-cat-sound-card-play-btn');
                if (pIcon) pIcon.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
                activePlayingCard = null;
            }

            if (!url) return;

            try {
                let src = url;
                if (src.startsWith('file://') || src.match(/^[a-zA-Z]:[\\\/]/)) {
                    try {
                        const fs = require('fs');
                        let cleanPath = src.replace(/^file:\/\/\/?/, '');
                        cleanPath = decodeURIComponent(cleanPath).replace(/\//g, '\\');
                        if (fs.existsSync(cleanPath)) {
                            const buffer = fs.readFileSync(cleanPath);
                            src = `data:audio/mp3;base64,${buffer.toString('base64')}`;
                        }
                    } catch (err) { }
                }

                previewAudio = new Audio(src);
                previewAudio._isDMCatCustomAudio = true;
                previewAudio.volume = (typeof vol === 'number') ? Math.max(0, Math.min(1, vol)) : 0.8;

                if (cardEl) {
                    activePlayingCard = cardEl;
                    cardEl.classList.add('playing');
                    const pIcon = cardEl.querySelector('.dm-cat-sound-card-play-btn');
                    if (pIcon) pIcon.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
                }

                const clearPlaying = () => {
                    if (cardEl) {
                        cardEl.classList.remove('playing');
                        const pIcon = cardEl.querySelector('.dm-cat-sound-card-play-btn');
                        if (pIcon) pIcon.innerHTML = `<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;
                    }
                    if (activePlayingCard === cardEl) activePlayingCard = null;
                };

                previewAudio.onended = clearPlaying;
                previewAudio.onerror = clearPlaying;
                previewAudio.onpause = clearPlaying;

                previewAudio.play().catch(err => {
                    console.warn("[KeyWare] Preview audio error:", err);
                    clearPlaying();
                });
            } catch (e) {
                console.error("[KeyWare] playPreview error:", e);
            }
        };

        const renderSoundboard = () => {
            const query = (searchInput.value || '').trim().toLowerCase();
            const guildGroups = this.getAllSoundboardSounds();

            if (!guildGroups || guildGroups.length === 0) {
                soundboardContainer.innerHTML = `
                    <div class="dm-cat-sound-empty">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style="opacity: 0.5;">
                            <path d="M12 3v9.28a4.39 4.39 0 0 0-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/>
                        </svg>
                        <div>Bulunduğunuz sunucularda Soundboard sesi bulunamadı veya henüz yüklenmedi.</div>
                        <button type="button" class="dm-cat-btn" id="dmSoundboardRetryBtn" style="background: var(--brand-500, #5865f2); color: #fff; font-size: 12px; margin-top: 4px;">Sesleri Tara / Yenile</button>
                    </div>
                `;
                const retryBtn = soundboardContainer.querySelector('#dmSoundboardRetryBtn');
                if (retryBtn) {
                    retryBtn.onclick = () => {
                        this.fetchSoundboardSounds();
                        setTimeout(() => renderSoundboard(), 500);
                    };
                }
                return;
            }

            let html = '';
            let totalMatch = 0;

            for (const group of guildGroups) {
                const filteredSounds = group.sounds.filter(s => {
                    if (!query) return true;
                    return (s.name && s.name.toLowerCase().includes(query)) || (group.guildName && group.guildName.toLowerCase().includes(query));
                });

                if (filteredSounds.length === 0) continue;
                totalMatch += filteredSounds.length;

                html += `
                    <div class="dm-cat-soundboard-guild">
                        <div class="dm-cat-soundboard-guild-header">
                            ${group.guildIcon ? `<img src="${group.guildIcon}" class="dm-cat-soundboard-guild-icon" />` : `<div class="dm-cat-soundboard-guild-icon" style="display: flex; align-items: center; justify-content: center; font-size: 9px; color: #fff; background: #5865f2;">${group.guildName.charAt(0).toUpperCase()}</div>`}
                            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${this.escapeHtml(group.guildName)}</span>
                            <span class="dm-cat-soundboard-guild-badge">${filteredSounds.length} ses</span>
                        </div>
                        <div class="dm-cat-soundboard-grid">
                            ${filteredSounds.map(s => {
                                const isSelected = (selectedUrl === s.url);
                                const emojiHtml = s.emojiId
                                    ? `<img src="https://cdn.discordapp.com/emojis/${s.emojiId}.webp?size=48" />`
                                    : (s.emojiName || '🔊');

                                return `
                                    <div class="dm-cat-sound-card ${isSelected ? 'active' : ''}" data-sound-url="${this.escapeHtml(s.url)}" data-sound-name="${this.escapeHtml(s.name)}" data-guild-name="${this.escapeHtml(group.guildName)}" data-emoji="${this.escapeHtml(s.emojiName || '')}" data-emoji-id="${this.escapeHtml(s.emojiId || '')}">
                                        <div class="dm-cat-sound-card-emoji">${emojiHtml}</div>
                                        <div class="dm-cat-sound-card-name" title="${this.escapeHtml(s.name)}">${this.escapeHtml(s.name)}</div>
                                        <div class="dm-cat-sound-card-play-btn" title="Önizle">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                `;
            }

            if (totalMatch === 0) {
                html = `<div class="dm-cat-sound-empty">"${this.escapeHtml(query)}" ile eşleşen ses bulunamadı.</div>`;
            }

            soundboardContainer.innerHTML = html;

            // Attach card events
            soundboardContainer.querySelectorAll('.dm-cat-sound-card').forEach(card => {
                const url = card.dataset.soundUrl;
                const name = card.dataset.soundName;
                const gName = card.dataset.guildName;
                const em = card.dataset.emoji;
                const emId = card.dataset.emojiId;

                const playBtn = card.querySelector('.dm-cat-sound-card-play-btn');
                playBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (card.classList.contains('playing')) {
                        if (previewAudio) previewAudio.pause();
                    } else {
                        playPreview(url, parseFloat(volumeInput.value), card);
                    }
                };

                card.onclick = () => {
                    soundboardContainer.querySelectorAll('.dm-cat-sound-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');

                    selectedUrl = url;
                    selectedSoundName = name;
                    selectedGuildName = gName;
                    selectedEmoji = em;
                    selectedEmojiId = emId;
                    selectedSourceType = 'soundboard';

                    urlInput.value = '';
                    updateActiveBanner();
                };
            });
        };

        // Render initial soundboard list
        renderSoundboard();

        // Search debounce
        let searchTimeout = null;
        searchInput.oninput = () => {
            if (searchTimeout) clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => renderSoundboard(), 100);
        };

        refreshBtn.onclick = () => {
            this.fetchSoundboardSounds();
            setTimeout(() => renderSoundboard(), 300);
        };

        // Tabs click
        tabs.forEach(tab => {
            tab.onclick = () => {
                const target = tab.dataset.soundTab;
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                if (target === 'soundboard') {
                    tabSoundboard.classList.add('active');
                    tabCustom.classList.remove('active');
                } else {
                    tabSoundboard.classList.remove('active');
                    tabCustom.classList.add('active');
                }
            };
        });

        // Custom URL input
        urlInput.oninput = () => {
            const val = urlInput.value.trim();
            if (val) {
                selectedUrl = val;
                selectedSoundName = val.split('/').pop().split('?')[0] || 'Özel MP3';
                selectedGuildName = '';
                selectedEmoji = '🎵';
                selectedEmojiId = '';
                selectedSourceType = 'custom';
                soundboardContainer.querySelectorAll('.dm-cat-sound-card').forEach(c => c.classList.remove('active'));
            } else if (selectedSourceType === 'custom') {
                selectedUrl = '';
                selectedSoundName = '';
                selectedEmoji = '';
                selectedEmojiId = '';
            }
            updateActiveBanner();
        };

        browseBtn.onclick = () => fileInput.click();

        fileInput.onchange = (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (re) => {
                urlInput.value = re.target.result;
                selectedUrl = re.target.result;
                selectedSoundName = file.name;
                selectedGuildName = 'Yerel Dosya';
                selectedEmoji = '📁';
                selectedEmojiId = '';
                selectedSourceType = 'custom';
                soundboardContainer.querySelectorAll('.dm-cat-sound-card').forEach(c => c.classList.remove('active'));
                updateActiveBanner();
            };
            reader.readAsDataURL(file);
        };

        volumeInput.oninput = () => {
            volumeText.textContent = `${Math.round(volumeInput.value * 100)}%`;
            if (previewAudio) previewAudio.volume = parseFloat(volumeInput.value);
        };

        quickTestBtn.onclick = () => {
            if (!selectedUrl) return;
            playPreview(selectedUrl, parseFloat(volumeInput.value), null);
        };

        if (removeBtn) {
            removeBtn.onclick = () => {
                if (previewAudio) previewAudio.pause();
                delete this.customSounds[channelId];
                this.saveSettings();
                this.closeModal();
            };
        }

        backdrop.querySelector('#dmSoundSave').onclick = () => {
            if (previewAudio) previewAudio.pause();
            let finalUrl = selectedUrl;

            if (finalUrl) {
                if (finalUrl.startsWith('file://') || finalUrl.match(/^[a-zA-Z]:[\\\/]/)) {
                    try {
                        const fs = require('fs');
                        let cleanPath = finalUrl.replace(/^file:\/\/\/?/, '');
                        cleanPath = decodeURIComponent(cleanPath).replace(/\//g, '\\');
                        if (fs.existsSync(cleanPath)) {
                            const buffer = fs.readFileSync(cleanPath);
                            finalUrl = `data:audio/mp3;base64,${buffer.toString('base64')}`;
                        }
                    } catch (err) { }
                }

                this.customSounds[channelId] = {
                    url: finalUrl,
                    volume: parseFloat(volumeInput.value),
                    soundName: selectedSoundName || '',
                    guildName: selectedGuildName || '',
                    emoji: selectedEmoji || '',
                    emojiId: selectedEmojiId || '',
                    sourceType: selectedSourceType || 'custom'
                };
            } else {
                delete this.customSounds[channelId];
            }

            this.saveSettings();
            this.closeModal();
        };

        backdrop.querySelector('#dmSoundCancel').onclick = () => {
            if (previewAudio) previewAudio.pause();
            this.closeModal();
        };

        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                if (previewAudio) previewAudio.pause();
                this.closeModal();
            }
        };

        document.body.appendChild(backdrop);
    }

    async checkForUpdates(manual = false) {
        try {
            const currentVersion = "6.3.0";
            const updateUrl = "https://raw.githubusercontent.com/keyrexdevelopment/keyware-dms/main/KeyWare.plugin.js";

            const response = await fetch(`${updateUrl}?_t=${Date.now()}`);
            if (!response.ok) {
                if (manual && BdApi.UI && typeof BdApi.UI.showToast === 'function') {
                    BdApi.UI.showToast("Güncelleme sunucusuna ulaşılamadı.", { type: "error" });
                }
                return;
            }

            const remoteContent = await response.text();
            const match = remoteContent.match(/@version\s+([0-9.]+)/i);
            if (!match || !match[1]) return;

            const remoteVersion = match[1];

            const isNewer = (remote, current) => {
                const rParts = remote.split('.').map(Number);
                const cParts = current.split('.').map(Number);
                for (let i = 0; i < Math.max(rParts.length, cParts.length); i++) {
                    const r = rParts[i] || 0;
                    const c = cParts[i] || 0;
                    if (r > c) return true;
                    if (r < c) return false;
                }
                return false;
            };

            if (isNewer(remoteVersion, currentVersion)) {
                console.log(`[KeyWare] New update available: v${remoteVersion} (current: v${currentVersion})`);

                const updatePlugin = () => {
                    try {
                        const fs = require('fs');
                        const path = require('path');
                        const pluginsFolder = (BdApi.Plugins && BdApi.Plugins.folder) ? BdApi.Plugins.folder : path.join(process.env.APPDATA || '', 'BetterDiscord', 'plugins');

                        let targetFile = path.join(pluginsFolder, 'KeyWare.plugin.js');
                        if (!fs.existsSync(targetFile)) {
                            const files = fs.readdirSync(pluginsFolder);
                            const found = files.find(f => f.toLowerCase().includes('keyware') && f.endsWith('.plugin.js'));
                            if (found) targetFile = path.join(pluginsFolder, found);
                        }

                        fs.writeFileSync(targetFile, remoteContent, 'utf8');

                        if (BdApi.UI && typeof BdApi.UI.showToast === 'function') {
                            BdApi.UI.showToast(`KeyWare v${remoteVersion} başarıyla güncellendi!`, { type: "success" });
                        }
                    } catch (err) {
                        console.error("[KeyWare] Update write error:", err);
                        if (BdApi.UI && typeof BdApi.UI.showToast === 'function') {
                            BdApi.UI.showToast("KeyWare güncellenirken bir hata oluştu.", { type: "error" });
                        }
                    }
                };

                if (BdApi.UI && typeof BdApi.UI.showNotice === 'function') {
                    BdApi.UI.showNotice(
                        `KeyWare için yeni bir güncelleme mevcut (v${remoteVersion})!`,
                        {
                            type: "info",
                            buttons: [
                                {
                                    label: "Şimdi Güncelle",
                                    onClick: (closeNotice) => {
                                        updatePlugin();
                                        if (typeof closeNotice === 'function') closeNotice();
                                    }
                                }
                            ]
                        }
                    );
                }
            } else if (manual) {
                if (BdApi.UI && typeof BdApi.UI.showToast === 'function') {
                    BdApi.UI.showToast(`KeyWare zaten güncel (v${currentVersion})`, { type: "info" });
                }
            }
        } catch (e) {
            console.warn("[KeyWare] Update check failed:", e);
        }
    }

    checkChangelog() {
        const currentVersion = "6.3.0";
        const lastVersion = BdApi.Data.load(this.pluginName, "lastVersion");
        if (lastVersion !== currentVersion) {
            BdApi.Data.save(this.pluginName, "lastVersion", currentVersion);
            setTimeout(() => this.showChangelogModal(), 1200);
        }
    }

    showChangelogModal() {
        this.closeModal();
        const backdrop = document.createElement('div');
        backdrop.className = 'dm-cat-modal-backdrop';
        backdrop.innerHTML = `
            <div class="dm-cat-modal-box" style="width: 520px; border: 1px solid rgba(88, 101, 242, 0.4); box-shadow: 0 16px 40px rgba(0, 0, 0, 0.8), 0 0 20px rgba(88, 101, 242, 0.2);">
                <div class="dm-cat-modal-header" style="background: linear-gradient(135deg, rgba(88, 101, 242, 0.2), rgba(0,0,0,0));">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 22px;">🎉</span>
                        <div>
                            <div style="font-size: 16px; font-weight: 700; color: #fff;">KeyWare Güncellendi!</div>
                            <div style="font-size: 12px; color: var(--brand-500, #5865f2); font-weight: 600;">Sürüm v6.3.0</div>
                        </div>
                    </div>
                </div>
                <div class="dm-cat-modal-body" style="padding: 20px; gap: 16px;">
                    <div style="font-size: 13px; color: var(--text-normal, #dbdee1); line-height: 1.5;">
                        KeyWare Direkt Mesajlar eklentisi yeni özelliklerle güncellendi. İşte bu sürümdeki yenilikler:
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px; background: var(--background-secondary, #2b2d31); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <span style="font-size: 18px; line-height: 1;">⚔️</span>
                            <div>
                                <div style="font-size: 13px; font-weight: 600; color: #fff;">Dante Shimeji Yenilendi & Geliştirildi</div>
                                <div style="font-size: 12px; color: var(--text-muted, #949ba4);">Tüm görseller bağımsız olarak eklentiye gömüldü, ters yürüme hatası düzeltildi, sağ tık ve ayarlara hızlı boyutlandırma (%30 - %100) eklendi!</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <span style="font-size: 18px; line-height: 1;">🔄</span>
                            <div>
                                <div style="font-size: 13px; font-weight: 600; color: #fff;">Dahili Otomatik Güncelleyici (Auto-Updater)</div>
                                <div style="font-size: 12px; color: var(--text-muted, #949ba4);">Artık yeni sürümler çıktığında Discord'unuz anında algılar ve tek tıkla otomatik olarak güncellenir.</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <span style="font-size: 18px; line-height: 1;">🔊</span>
                            <div>
                                <div style="font-size: 13px; font-weight: 600; color: #fff;">Discord Sunucu Soundboard Desteği</div>
                                <div style="font-size: 12px; color: var(--text-muted, #949ba4);">Üye olduğunuz tüm sunuculardaki ses tahtası seslerini kişiye özel bildirim sesi olarak atayabilirsiniz.</div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="dm-cat-modal-footer" style="justify-content: flex-end;">
                    <button class="dm-cat-btn dm-cat-btn-primary" id="dmChangelogClose" style="padding: 8px 24px;">Harika, Başla!</button>
                </div>
            </div>
        `;

        backdrop.querySelector('#dmChangelogClose').onclick = () => this.closeModal();
        backdrop.onclick = (e) => { if (e.target === backdrop) this.closeModal(); };
        document.body.appendChild(backdrop);
    }

    patchContextMenu() {
        const patchMenu = (menuNavId) => {
            try {
                BdApi.ContextMenu.patch(menuNavId, (tree, props) => {
                    try {
                        let channelId = props?.channel?.id || props?.channelId;
                        let userId = props?.user?.id || props?.userId;
                        if (!channelId && userId) {
                            const ChannelStore = BdApi.Webpack.getStore("ChannelStore") || BdApi.Webpack.getModule(m => m?.getDMFromUserId);
                            if (ChannelStore?.getDMFromUserId) {
                                channelId = ChannelStore.getDMFromUserId(userId);
                            }
                        }
                        if (!channelId) {
                            channelId = this.lastRightClickedChannelId;
                        }
                        const targetId = channelId || userId;
                        if (!targetId) return;

                        const currentCat = this.categories.find(c => c.channels && c.channels.includes(targetId));

                        const sep = BdApi.ContextMenu.buildItem({ type: "separator" });
                        const soundItem = BdApi.ContextMenu.buildItem({
                            type: "text",
                            id: "dm-cat-menu-sound",
                            label: "Özel Bildirim Sesi Ayarla",
                            action: () => this.openUserSoundModal(targetId)
                        });

                        const itemsToAdd = [sep, soundItem];

                        if (currentCat) {
                            itemsToAdd.push(BdApi.ContextMenu.buildItem({
                                type: "text",
                                id: "dm-cat-menu-remove",
                                label: `"${currentCat.name}" Kategorisinden Çıkar`,
                                danger: true,
                                action: () => this.removeFromCategory(channelId)
                            }));
                        }

                        if (Array.isArray(tree?.props?.children)) {
                            tree.props.children.push(...itemsToAdd);
                        } else if (tree?.props?.children) {
                            tree.props.children = [tree.props.children, ...itemsToAdd];
                        }
                    } catch (e) {
                        console.error("[DMCategories] ContextMenu patch error:", e);
                    }
                });
            } catch (e) {
                console.error("[DMCategories] patchMenu failed for:", menuNavId, e);
            }
        };

        patchMenu("user-context");
        patchMenu("gdm-context");
        patchMenu("channel-context");
    }

    unpatchContextMenu() {
        try {
            BdApi.ContextMenu.unpatch("user-context");
            BdApi.ContextMenu.unpatch("gdm-context");
            BdApi.ContextMenu.unpatch("channel-context");
        } catch (e) { }
    }

    handleContextMenu(e) {
        const dmItem = e.target.closest('[data-channel-id]');
        if (dmItem) {
            this.lastRightClickedChannelId = dmItem.dataset.channelId;
        }
    }

    openCategoryContextMenu(x, y, catId) {
        this.closeContextMenu();
        const cat = this.categories.find(c => c.id === catId);
        if (!cat) return;

        const menu = document.createElement('div');
        menu.className = 'dm-cat-context-menu';
        menu.style.left = `${Math.min(x, window.innerWidth - 190)}px`;
        menu.style.top = `${Math.min(y, window.innerHeight - 180)}px`;

        menu.innerHTML = `
            <div class="dm-cat-menu-item" id="dmMenuSettings">
                <span>Kategoriyi Özelleştir</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
            </div>
            <div class="dm-cat-menu-item" id="dmMenuRename">
                <span>Yeniden Adlandır</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
            </div>
            <div class="dm-cat-menu-item" id="dmMenuToggle">
                <span>${cat.collapsed ? 'Genişlet' : 'Daralt'}</span>
            </div>
            <div style="height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0;"></div>
            <div class="dm-cat-menu-item danger" id="dmMenuDelete">
                <span>Kategoriyi Sil</span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
            </div>
        `;

        menu.querySelector('#dmMenuSettings').onclick = () => {
            this.closeContextMenu();
            this.openCategorySettingsModal(catId);
        };
        menu.querySelector('#dmMenuRename').onclick = () => {
            this.closeContextMenu();
            this.openRenameModal(catId);
        };
        menu.querySelector('#dmMenuToggle').onclick = () => {
            this.closeContextMenu();
            cat.collapsed = !cat.collapsed;
            this.saveSettings();
            this.scheduleRender();
        };
        menu.querySelector('#dmMenuDelete').onclick = () => {
            this.closeContextMenu();
            this.openDeleteModal(catId);
        };

        const onDocClick = (e) => {
            if (!menu.contains(e.target)) {
                this.closeContextMenu();
                document.removeEventListener('click', onDocClick, true);
            }
        };
        setTimeout(() => document.addEventListener('click', onDocClick, true), 10);

        document.body.appendChild(menu);
    }

    closeContextMenu() {
        document.querySelectorAll('.dm-cat-context-menu').forEach(el => el.remove());
    }

    openCreateModal() {
        this.openInputModal("Yeni Kategori Oluştur", "Kategori Adı", "", (name) => {
            if (!name || !name.trim()) return;
            this.categories.push({
                id: 'cat_' + Date.now(),
                name: name.trim(),
                emoji: "⭐",
                color: "#949ba4",
                lineColor: "#ffffff",
                bgStyle: "default",
                fontFamily: "default",
                customFont: "",
                badgeText: "",
                badgeColor: "#5865f2",
                glow: false,
                rgbWave: false,
                pulse: false,
                emojiRain: { enabled: false, emoji: "✨", speed: "normal", density: "medium" },
                collapsed: false,
                channels: []
            });
            this.saveSettings();
            this.scheduleRender();
        });
    }

    openRenameModal(catId) {
        const cat = this.categories.find(c => c.id === catId);
        if (!cat) return;

        this.openInputModal("Kategoriyi Yeniden Adlandır", "Kategori Adı", cat.name, (newName) => {
            if (!newName || !newName.trim()) return;
            cat.name = newName.trim();
            this.saveSettings();
            this.scheduleRender();
        });
    }

    openDeleteModal(catId) {
        const cat = this.categories.find(c => c.id === catId);
        if (!cat) return;

        this.closeModal();
        const backdrop = document.createElement('div');
        backdrop.className = 'dm-cat-modal-backdrop';
        backdrop.innerHTML = `
            <div class="dm-cat-modal-box">
                <div class="dm-cat-modal-header">Kategoriyi Sil</div>
                <div class="dm-cat-modal-body">
                    <div style="color: var(--text-normal, #dbdee1); font-size: 14px; line-height: 1.4;">
                        <strong>${this.escapeHtml(cat.name)}</strong> kategorisini silmek istediğinizden emin misiniz?<br>
                        <span style="color: var(--text-muted, #949ba4); font-size: 12px;">DM sohbetleriniz silinmez, yalnızca kategori kaldırılır.</span>
                    </div>
                </div>
                <div class="dm-cat-modal-footer">
                    <button class="dm-cat-btn dm-cat-btn-cancel" id="dmCatModalCancel">İptal</button>
                    <button class="dm-cat-btn dm-cat-btn-danger" id="dmCatModalConfirm">Sil</button>
                </div>
            </div>
        `;

        const confirm = () => {
            this.stopRain(catId);
            this.categories = this.categories.filter(c => c.id !== catId);
            this.saveSettings();
            this.closeModal();
            this.scheduleRender();
        };

        backdrop.querySelector('#dmCatModalCancel').onclick = () => this.closeModal();
        backdrop.querySelector('#dmCatModalConfirm').onclick = confirm;
        backdrop.onclick = (e) => { if (e.target === backdrop) this.closeModal(); };

        document.body.appendChild(backdrop);
    }

    openInputModal(title, placeholder, defaultValue, onConfirm) {
        this.closeModal();
        const backdrop = document.createElement('div');
        backdrop.className = 'dm-cat-modal-backdrop';
        backdrop.innerHTML = `
            <div class="dm-cat-modal-box">
                <div class="dm-cat-modal-header">${this.escapeHtml(title)}</div>
                <div class="dm-cat-modal-body">
                    <label class="dm-cat-setting-label">${this.escapeHtml(placeholder)}</label>
                    <input type="text" class="dm-cat-modal-input" id="dmCatModalInput" value="${this.escapeHtml(defaultValue)}" placeholder="Örn: Arkadaşlar, İş..." />
                </div>
                <div class="dm-cat-modal-footer">
                    <button class="dm-cat-btn dm-cat-btn-cancel" id="dmCatModalCancel">İptal</button>
                    <button class="dm-cat-btn dm-cat-btn-primary" id="dmCatModalConfirm">Kaydet</button>
                </div>
            </div>
        `;

        const input = backdrop.querySelector('#dmCatModalInput');
        const submit = () => {
            const val = input.value;
            this.closeModal();
            onConfirm(val);
        };

        backdrop.querySelector('#dmCatModalCancel').onclick = () => this.closeModal();
        backdrop.querySelector('#dmCatModalConfirm').onclick = submit;
        input.onkeydown = (e) => {
            if (e.key === 'Enter') submit();
            if (e.key === 'Escape') this.closeModal();
        };
        backdrop.onclick = (e) => { if (e.target === backdrop) this.closeModal(); };

        document.body.appendChild(backdrop);
        setTimeout(() => input.focus(), 50);
    }

    closeModal() {
        document.querySelectorAll('.dm-cat-modal-backdrop').forEach(el => el.remove());
    }

    handleClick(e) {
        if (!e.target.closest('.dm-cat-context-menu')) {
            this.closeContextMenu();
        }
    }

    handleDragStart(e) {
        const catHeader = e.target.closest('.dm-cat-header');
        if (catHeader && !e.target.closest('.dm-cat-actions, .dm-cat-arrow')) {
            const wrap = catHeader.closest('.dm-cat-header-wrap');
            if (wrap) {
                this.draggedType = 'category';
                this.draggedCategoryId = wrap.dataset.categoryId;
                wrap.classList.add('dm-cat-dragging-wrap');
                e.dataTransfer.setData('text/plain', `cat:${this.draggedCategoryId}`);
                e.dataTransfer.effectAllowed = 'move';
                return;
            }
        }

        const dmItem = e.target.closest('[data-channel-id]');
        if (dmItem) {
            this.draggedType = 'channel';
            this.draggedChannelId = dmItem.dataset.channelId;
            dmItem.classList.add('dm-cat-dragging');
            e.dataTransfer.setData('text/plain', `ch:${this.draggedChannelId}`);
            e.dataTransfer.effectAllowed = 'move';
        }
    }

    handleDragOver(e) {
        if (!this.draggedType) return;

        if (this.draggedType === 'category') {
            const targetWrap = e.target.closest('.dm-cat-header-wrap');
            if (targetWrap && targetWrap.dataset.categoryId !== this.draggedCategoryId) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = targetWrap.getBoundingClientRect();
                const isTop = (e.clientY - rect.top) < (rect.height / 2);
                targetWrap.classList.toggle('dm-cat-drag-top', isTop);
                targetWrap.classList.toggle('dm-cat-drag-bottom', !isTop);
                return;
            }
        }

        if (this.draggedType === 'channel') {
            const targetChannelItem = e.target.closest('.dm-cat-channel-item');
            const targetHeader = e.target.closest('.dm-cat-header');
            const targetDropzone = e.target.closest('.dm-cat-dropzone');

            if (targetChannelItem && targetChannelItem.dataset.channelId !== this.draggedChannelId) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                const rect = targetChannelItem.getBoundingClientRect();
                const isTop = (e.clientY - rect.top) < (rect.height / 2);
                targetChannelItem.classList.toggle('dm-cat-drag-top', isTop);
                targetChannelItem.classList.toggle('dm-cat-drag-bottom', !isTop);
                return;
            }

            if (targetHeader || targetDropzone) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (targetHeader) targetHeader.classList.add('drag-over');
                if (targetDropzone) targetDropzone.classList.add('drag-over');
                return;
            }

            const scroller = e.target.closest('nav[aria-label="Direkt Mesajlar"], nav[aria-label="Direct Messages"], [class*="privateChannels"]');
            if (scroller) {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
            }
        }
    }

    handleDragLeave(e) {
        const targetWrap = e.target.closest('.dm-cat-header-wrap');
        if (targetWrap) {
            targetWrap.classList.remove('dm-cat-drag-top', 'dm-cat-drag-bottom');
        }
        const targetChannelItem = e.target.closest('.dm-cat-channel-item');
        if (targetChannelItem) {
            targetChannelItem.classList.remove('dm-cat-drag-top', 'dm-cat-drag-bottom');
        }
        const targetHeader = e.target.closest('.dm-cat-header');
        if (targetHeader) {
            targetHeader.classList.remove('drag-over');
        }
        const targetDropzone = e.target.closest('.dm-cat-dropzone');
        if (targetDropzone) {
            targetDropzone.classList.remove('drag-over');
        }
    }

    handleDrop(e) {
        e.preventDefault();
        const cleanIndicators = () => {
            document.querySelectorAll('.dm-cat-drag-top, .dm-cat-drag-bottom, .drag-over, .dm-cat-dragging-wrap, .dm-cat-dragging').forEach(el => {
                el.classList.remove('dm-cat-drag-top', 'dm-cat-drag-bottom', 'drag-over', 'dm-cat-dragging-wrap', 'dm-cat-dragging');
            });
        };

        if (this.draggedType === 'category' && this.draggedCategoryId) {
            const targetWrap = e.target.closest('.dm-cat-header-wrap');
            if (targetWrap && targetWrap.dataset.categoryId !== this.draggedCategoryId) {
                const targetCatId = targetWrap.dataset.categoryId;
                const rect = targetWrap.getBoundingClientRect();
                const isTop = (e.clientY - rect.top) < (rect.height / 2);

                const fromIdx = this.categories.findIndex(c => c.id === this.draggedCategoryId);
                if (fromIdx !== -1) {
                    const [catObj] = this.categories.splice(fromIdx, 1);
                    let toIdx = this.categories.findIndex(c => c.id === targetCatId);
                    if (toIdx !== -1) {
                        if (!isTop) toIdx++;
                        this.categories.splice(toIdx, 0, catObj);
                        this.saveSettings();
                        this.scheduleRender();
                    }
                }
            }
            cleanIndicators();
            this.draggedType = null;
            this.draggedCategoryId = null;
            return;
        }

        if (this.draggedType === 'channel' && this.draggedChannelId) {
            const targetChannelItem = e.target.closest('.dm-cat-channel-item');
            const targetHeader = e.target.closest('.dm-cat-header');
            const targetDropzone = e.target.closest('.dm-cat-dropzone');

            if (targetChannelItem && targetChannelItem.dataset.channelId !== this.draggedChannelId) {
                const targetChannelId = targetChannelItem.dataset.channelId;
                const targetCat = this.categories.find(c => c.channels.includes(targetChannelId));

                if (targetCat) {
                    const rect = targetChannelItem.getBoundingClientRect();
                    const isTop = (e.clientY - rect.top) < (rect.height / 2);

                    this.categories.forEach(c => {
                        c.channels = c.channels.filter(id => id !== this.draggedChannelId);
                    });

                    const targetIdx = targetCat.channels.indexOf(targetChannelId);
                    const insertIdx = isTop ? targetIdx : targetIdx + 1;
                    targetCat.channels.splice(insertIdx, 0, this.draggedChannelId);

                    this.saveSettings();
                    this.scheduleRender();
                }
            }
            else if (targetHeader || targetDropzone) {
                const wrap = (targetHeader || targetDropzone).closest('.dm-cat-header-wrap');
                if (wrap) {
                    const catId = wrap.dataset.categoryId;
                    const targetCategory = this.categories.find(c => c.id === catId);
                    if (targetCategory) {
                        this.categories.forEach(c => {
                            c.channels = c.channels.filter(id => id !== this.draggedChannelId);
                        });
                        targetCategory.channels.push(this.draggedChannelId);
                        this.saveSettings();
                        this.scheduleRender();
                    }
                }
            }
            else {
                const inScroller = e.target.closest('nav[aria-label="Direkt Mesajlar"], nav[aria-label="Direct Messages"], [class*="privateChannels"]');
                if (inScroller) {
                    this.removeFromCategory(this.draggedChannelId);
                }
            }

            cleanIndicators();
            this.draggedType = null;
            this.draggedChannelId = null;
        }
    }

    handleDragEnd(e) {
        this.draggedType = null;
        this.draggedChannelId = null;
        this.draggedCategoryId = null;
        document.querySelectorAll('.dm-cat-drag-top, .dm-cat-drag-bottom, .drag-over, .dm-cat-dragging-wrap, .dm-cat-dragging').forEach(el => {
            el.classList.remove('dm-cat-drag-top', 'dm-cat-drag-bottom', 'drag-over', 'dm-cat-dragging-wrap', 'dm-cat-dragging');
        });
    }

    cleanupDOM() {
        this.clearAllRain();
        this.closeModal();
        this.closeContextMenu();
        document.querySelectorAll('.dm-cat-add-btn, .dm-cat-header-wrap, .dm-cat-top-divider, .dm-cat-shop-divider, .dm-cat-separator').forEach(el => el.remove());
        document.querySelectorAll('[data-channel-id]').forEach(el => {
            el.removeAttribute('draggable');
            el.style.order = '';
            el.classList.remove('dm-cat-hidden', 'dm-cat-channel-item', 'dm-cat-drag-top', 'dm-cat-drag-bottom');
            el.style.removeProperty('--dm-cat-line-color');
            delete el.dataset.channelId;
        });
    }

    // --- DANTE SHIMEJI DESKTOP MASCOT ENGINE ---

    getDanteSprites() {
        return this.getCharacterSprites('dante');
    }

    getVergilSprites() {
        return this.getCharacterSprites('vergil');
    }

    getCharacterSprites(charName = 'dante') {
        const dante = {
          "idle1": "data:image/png;base64,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",
          "idle2": "data:image/png;base64,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",
          "idle3": "data:image/png;base64,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",
          "walk1": "data:image/png;base64,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",
          "walk2": "data:image/png;base64,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",
          "walk3": "data:image/png;base64,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",
          "dragged": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAALkAAAD7CAMAAAAB48UJAAADAFBMVEVHcExoJzArLC8vJCLXyskWGBvyvJ3VycnVyMfVx8fUxsUYGh7XzMvWycgTFRjZzc3SxcTxupsFAwMsLjLbzcwJCQmimaBkf40tIh8xJiWgl50MBQVJGCJdd4Xzu5tPGSRfIiwXERAQDAw6T2NUHCfij3jeiXOdlJsQDAsGAwNaHynzwaMCAgEUBwhac4D2xagPERI3Sl0dCgseFRLPw8MiGxnLwL8AAAAkIiLSincmHx0kGhjDuLjjln4sHRlSSUhANjS+tLQYERHHvb0ZDw45FRgmDhAyMzbrmYA3LiyFcWuCeHjbkn+ZkZWOhIVqhJNfTUK6sbIwEBTsrpJXUVGJfn0YERG6l4A/MCpEPTwZDw5MPDNwZGIeGRl3b29gWFeYjY0jJyxPQj4/FRzqpIlUTElMLSYbDg5KREMbDg64rKxnXl5ZRDk9JB7hnodhUlDouJqAZ1YaHyPWq5CkmZhEWWivpKPCoIfmwKNoYF+NWkzLp47Ae2mzqKeek5IYEA97dHUcDg4eFBONcmBHQ0Tfup9zXlJcU1HJg3F5aWddOS9dUkxPZ3QaDg1GPjrRyMipnp6fhG+QiYwUDAyKgoRVHiatj3lqZ2lrVkfSs5qwcmFxaGYzHR4WFRgeDg+2rq1/dnWVe2htQzgwQEwzHh5DGB1GGyB8TkGQh4MoHRurhXDsxqqdlZQOCwyfZFZaTklxaGZ+dnSnnp48JiaGeG9BFhwXDAxqYWCGfoHwzLFWHyeonp9JQUBpXVdAFht4kp+4oIidgW2bk5SZkZKbs7t0bG7A4e/O4+utx9LZw7DWyspkJS5lJi/Xy8rTyMj0vJ30wKHyvZ9hJC1lJC30vZ7Zy8rzvp9jIy3yv6Dbz87d0dDc0NBnJC72v5/g1dVrKDGknKL2wqPi2NeooKbyt5ff09Ll29rf1NNuKDKmnqT6yav5wJ/6xaX06uZqJC+ro6nw5eH3vJrp3901KCWup6z38O36zrFyKTSzq7Dfs5XRkn/svqDtwqX61Ll6KzXLz9GIjbkNAAAA9nRSTlMA/v7+/v7+/v7+/v7+/v7+/v7+/v/+/v7+/v7+/v7+/v7+/v7+/v7+Egv+/gT+/v7+/v7+/iL+Af7+K/7+/v7+/v4Y/TP+/v7+/v7+/v7+/v79/v7+/r/+/v4//v7+/v7+/v7+/k/+Szpk/v7+/v7+/v7//v7+/v7+ZP79/v3+rP5X0vz9/v54/v7+i/6YX/7+/v7d2O38/v79/n6Q7oTolv7+/nW5yf616v7+xvT+oazA3ajM3XbC5/7e79De7/7k4e/f/vT+/v78///////////////////////////////+//////////////////////////4sHb4YAAAgAElEQVR42uxYT0gcyR5eNvWo6qZrqw+jJN70EgM5BGwnosPOjAMvRFEi6GFY/xEQZDzMRYQ5jOQQDF5WCYEcPOjRg4dE9rCwt/duDZ1bH6oKmlChu8lBdphE2OP7/WrMe/vgvctGZRf8Ecgk09pfffX9vt9X9c03N3VTN3VTN3VTN3VTV1r3JkfHx8dHJ+//lTCPjq/9+OLN21evXv3809uDtcm/BurxtRdvXv2jXQpkmiSJEsJvv1370/M+vP7jm3+2i14hjqJICCkFcRyixS9Ho39qttdfvP2lRLUS3PWhHEopw09umDona9cPaHK99eIAq9Vqra2P3vt/uNeODwOlCiG1sF2HUYvccRijXmoOD+5dL+6HayeBFwrpUYBTLLVPj/9nww23jmsGRB06iNp1AS38AeDwiZHQE2m3djR8rcBbh1lmjElSLQtQWql31dOj1uj9/8Z9UkxUTEKL1f3CN2OWcBoCciHNu+PR6wReNRJeK4TnUceqgBdSk+wdHv8H/GTrJMhSAvSSkFDmWOQEgWMhcGjXiBAlT9avDXlrTjlO2IMeEeQTpECESrLMgsdn1k5qxsgQADOOXDuO6/AwJMg4qoYQ+FHOCXdFeno9ffrw4dqcsh4Reh6g9zjuP+MR/FNIlabF06P14bVDk0pYF4VVOZHQShfsQrFRXZcSz4OdAOScO25s5lrX4uwAyirEdxmNPECH3HECu084KDhOTX74089+gQE8QO6zgoCnhE4TY1JBGIoGFhla3LYK2bX06ehpJhxkjpEIOFZKA7eEgGI5KsFhkcyzVHOHgZ48yoRoPNvdmC+v7C5sNko+457UKtWwBMYQNsjGk5m4+j69d2wSATCFcIpQXCcmQYvxgEMEzjlOSS1A3NgIOq0tP65PLTcrn24vLU3cqc9vTG83AmVyQaBlAXdkLSZLrrxPD7wMXpTnwebUTvPJE2BydQvCSK6kB/4BlJOoJ35OQCFGbtc/7ValjIJSe3thsVy5MzExcbvSXJijSsYEHgJJIfTEHLauVuQlAK4zurrzZGdqd3enWX76tNzcmNquShXBaGSIGFRCOPieMqXFT822LHASo0TyVATVre3plR8mBj81Fxoi12iswHsMijFzVzlPx08zjwoz13y60AigHx2nWCtVt1Z3y+VnVdh/tGoeIY8gY5VsV+rbIhE2pbgOQflgVFTB1rOnn/5+e2VLmlzDKnmIgk9rV5fA7h3nXkDz/Up9P0lAygBG5iD0nJRWV5pbBTtoOIkAO2GCTj/eqGWJh85nR6htYHSZPEne7S8+Hlqa394zKnJQ8aCv/OqG0kEgA19vjtWrGXQYQyY5EBmLuKCCzS0huCUdtj8icbBYWc0zhcphvdnPcfR4WFEswfhnK4Mj9dmiirFB0GTy7PBqnH2toQM/bd8Z28olCJRgAIEXgo2DFKRCeVvSOXqk2Czvg4N4KAZAjr1LLkwQ18JFmnW91frIYGU2kLFjOxr+r3YVYl8/1UGgavWlmTQBzhGmc2HKgA1kAFziR7sawqoNKTiMJwxZKBN8EHi3X3LsWUgL3XC10jf0fJukwg5kSGDFo0uHPnws/SIJ5kdeJt2z8zOFGQTnPrMUU4ZjNLTziPaWQmDwU24zloNhpSclHLewWxzdRqskKS3f6hssN4y1GZgU6aVDv3/0Liz68fLIct49h0ohRbk9VUPSjpBPCmMltPmKWG1jJKccm6+HmV48DvIC1rXC4RsrVV0c66u0oSMwvzmOql0y9FZJBQFplxd9C7xL0S8w9dEeciAWkBMKkRaIJvZriAhWI729senWdi/PO92820kFTuNCns4tTtRrmUQvhZZJaweX2abrh4b4oro7HWRnAPwsCtBZGBKIpEdW9IDcKgbB986acAji7Es5GLbAMkncOcPqKA9sKYIhlC8PzdOUE5s7iale4jgdPsl0qP3dxVICbz0/E0U3STieyCCuhqQXWlAKiJvguYEDbt/9HW7WewLnVJyd9aCDt8ZxRIkJ6n3LGiYZtg0V2en65YlcJnByWPhhP7Uv1UU/O+uId3ASRb9GshAmRcqRdKuZWMaMWi9H2O6FWiIMBwoWf47QM8IwG3tma2mpXbDjCmZwmr+9rGnaqmVCZZt3lqXpdGCXi4GBvzyve2ZsvAUqYTK5FDo09IBvTqiQpTlP9aZQDzVzv3AeedArlvSOce0UUsmzoQ3BfEQO+5j7byYvS+RCZKVKvYhaOUuKRdXpdDIK789CoNVhQlEmIyQdnAU9UeiZR7cWA8WcfyNHY0TkOJCQdMANJX0fk3wSPH3cLmAKwK7x0uKlsD55ksRM6ZVbWwa10gVb78I7hYZeVVYQQq+W51/uyZ6FUOZzObs0Vv5+UUT+F+S9IIktDa3Lu1+Qdwkih8PF6kgzFhh67DPqMu4EHh6Fsc/TzcqCSTuwyyLwQTOdlOZnZ4bisT5KAOfE4EpVWKsEmuXq35Zm2+WJTX1x0dITus0KLi8wXyMFuP6OcRw8hCR79Yl2IrBJrPFfxp1Aq6YCX5R2pmQCm3ye+b6HL2Q0z4wX4l1K2hgbezn7uK8+J/Eey2V6f+y76c+/zdx5WiS+BU57wwiU4vKs05UaZNeVFrpgHp6+zergRq7RmGAXYZ06/1qHgUxOfY8s7BaN1p3zjqBM287COy4YHtQVe+UH0799nnkO0DXeB+nqo6HXHz5++Lw8MR3beYSJwE5+eLxgRdIBEgy0OPQ7RYFwWax830j5xRrh1yjzddcZcPDUoVCbO1sQLeBwrPEgn+WYSSj6SEi9dOHByucP/R/vAvRSGnp5UO5b6e8f6P8w8OhWowBnU9oLB3bw+wyZBrGcn3c8YjpdAfEXdo7r6ZEFxXsjAIIODaX5KtYP9gycJ0vNaaE9e6uF9yYa3uD27tgiLyl9OzbzYeDu3ffA+vxeniev+54P9N8d6O//uPxgQwhG7LUcMg4+5Ps5OisiPzecS9hDZoOwKFWazHPt9qBcCNXJyR83x/W5TOsknWqWJLfBG867cCqo+txmbggoMll+8Po9AL/b/+v750PPTHfgu29nfu0fAOgf+x8tbeUXPYdp0pLuIeOW9Y4AD8R0iUsicvqHhrIj+CLnUBUe/dEIM3qa/YtTq4tpI72iVTLrsa1xZhwZRB5qCSSDImsLSrwOLj+26wcgGIvIRoD4DaVWBAEcxSW7JEGWlt0CuypJVIks+9CUF1bZFU2rvudho6S1ZBpLMco3IyzieDxaQtUEoioIpO293zfQVZ8gQwTEVqIzx/e795xzR1XkXLxrkhjNLB9JpUhh3HtBsZiZ6M76q4+1FFcg8h/erTf0vJ1r6EncSfSG1n/ASq/qU0Qzi8Hg31KZYCxASyzALPvXa4LGTxftgnJzoF8VaXPhWfjIg/o6935T/xvwmwSmxJjE0YOGloyTc8OdLpkGtCazoM7DaVwvLl5viXRGEvOlncNVTQ3V1aVTdxLziYoKX/WQzNoilWZAOswsbCxGDWpGtKSo0kGrxInG5vMZkqKxHW+kH1QyO/R+p/QTFwxPNdt2Km4zS6ywgSDN5etWCdge1OAEKK94WdzSsn6np6xpu6ns5Mmikq5Pbx8/caq+psTnbQApZTEzM5RE2EbeZIKB9jrjUrc0KtLgrKAmSApkvNlNqE1hlMM3UF+/fJ+GiFOfiEM+r1GnnApRbbw6lCM0W5bMYqIskhj2+nzeSM/2tWufXi4p+bx9Zy12t+vz+/cXJhajZ3xum5Hxil6I6nYOSFddEjo/HoVlEikHreMfvmljUlcfxnwyqz44/R4NURN5Ienv7uknukuAzma2aHeqb2WJgP1C4tydZ44fj84uXrnSevnK3oZh5/r12Jt83rqzs7dRGQ4Gg0v1k+gyUbrD0chgmupyqaB+dFkA3ZJn6tgo1HpDNviA6Ds8W3AIhfFL71ErKvBRW3G8021j7oYi59TmDr8sInKTWYyPzE4sTAdje3ux2O6qwW5/A7gB+eqLFy8qK0c9dTdGumVwP1AMUL6Bfj9dGBkLrxWsBp4NKQtV+FLGPTBs4SSzjpx5KdX9u6MrxAJwFXg3X9WsZYzs/CMzGdI94Lbhx8ybOKF7ZCHoKQ8DysrNNWs+H6ZfMYPBsOt0VsaCnuDSgDuLIQdgs906FeLwxPACmlCetUsKHVt6RuhjcoHZRGyNJrMt8+CInfH0d1uyqLjfFl+s9msCPe8sq1fE4VZXhqko0e9b9AC6/Gr6+fO0wZq3It95KwBPwytO56gnuBCN5whHTbUtXt2GuRDPwkeqUBAfx5IPMdvWMUSo82bFYgLDwsl/O2K4jjZIEd69na/q1WRqkbFawGvKyj5ys0kJ1S8HPZ6w3Q5YDVYrAs/H4CdCx5diweB0dFghOCZNiDxEQMAgclwY4JlnUoz+EXPxkn7VyEinaR70AJPy/dH07ie1Ki8q/pcVF48FckTkdEMJ00SV+7wSThfgQ/KO3Ah6RvOUZSsijwF4+LnL7sRuGA0GZ5tqZQRhtpA7J5plEY4kahgLf9BDUNlw4KtytdvdCqdzbtKDGvmPl47WELOmOdFdvN5X1ZZj4aC+xuRUcazVSJGbyXjPrKccKEfQVgqdXVArq/SXdDhYN1EzKaM8N2Xk5rJhVeGSvGXf32FmY8EhAeAFUZPHvFKK6WJAbqKLSDnwmyMVuZqc4+f+XZE44ZvT2PGi/IDCUHjvgKTg+RTU5tIJR/mo3Y7sGn6K3PD0qT1Pb2jUsVDfSzjUDkTtLZpKysmDNTT9FFmzpSZOLrR1+ImeFDDHnUxqc0cJMb5OkhVBrK0IHatqyWa4/Zq00NkdaGpyqeApeEWJ1N9wIOV5WtlWvdjhNpw77TEK3BB2TI94zTZcZsjacNGxWhVnpC418R6wVpK4aQI7mhvviGs0RGVNHbNfVfz6CKltICsIivC2JVLUZwGBrSdV1IwZbeMfVPtlRK7ODczCrKHc7gNnxK85/zT/jzV8dTdW55n11RLsJllh6mTPLZk/oFuXv5jnJTESELLC2HmZ0MiSWW94R5HvnTtKJxcVzfWyt6zJr6cgB5mgxTZZdfaWIgBZ2s3ocmNdeM1u16ucQTfYrS9irV/OOa3pNHSYQcfE9riM29Jc4NSZmhC4UMCFcC372spCUzvQLnKhuTWgYd8x6+mfETTdN4dt6BhoIfJAy8WeuIr3bmJxM0UuyKGyshCoKMkot0VvNI6mnQdcGww69lc7XT//8ds1aOi7u2HHMsAF5HIhXhOtb2ZbGZxCVM1ivTDO4VK2Jo/3Z0WeFQs2JJOUcf35sMjvKTIYNZH4I1XNORveOaMdKUolRTVR+uG8aHG5LHxf1DMarnSupg3/d21e7Xj4mNtzOvfSzjAe0UwKHwqZr1mq6QOThEXCsccXdCFOdxngtgrujjGRGHXGzVgzNv8Xhy1yvwrN1MRD842QLIdBCUVOlSIcM7l75NdeV8blEgK+2eCo1el8vrpPNmM9/XTz2vbDx4/Of1bpdKatjSBdjCCkZJdvZKE+QhSe1gdWOIf/NwuQGPJsbqbjJmGLJV27yP5DCpdLfyVUz6Xcnaf8BTGF/VCvFzr8NME7uwhHziyJQx0TdYOGpzj3GWwKHFr50432koePH15s33A+T1sHp6MRKQMaM166CH1GUEEg08Npcftpxs4x5LjTVQrj9TM2o97S6c1p7sNx/qvvyIoLLjNJnGjLESGFoT4dGJR3PqVJA0vL23E1xZH+muXGsMGwmk7vU64LFufG9ZLf/v3LnmsbTngr7IlOuYg5Q/rOLpRHOyVNoBkeTJ7+3jkselx3CDrpqgSEZSRJzyItqVQ2+cVhesvpeys2ZFwit3p8bsI2KSy8p/VutGRrfRPTIzOqQuRE/UJj3v6/6maHNA1X5e7dEw0f3N19gQrgzejs1JwqqBeqZ8sds10BRI7dBKTbL35Es48rdHaBOJVDpTM2PcA2GznopeKhTuhH3+eEFX5lRfU3lE7aTKx56chNWH5GdXx7uXGp051Vle6oZ9D+BqGvrv70fALrlVfvdtz9avOfCPxV+PLUXFbO9Z5ddjiWtoeyKWqaU6oUefhEQGu7DxyMnUl0D/iGbMgRyH+oTpAEh5G55z76Qw6zoKzLWzRvMdGlAyKnQtpEFyikP7owuHw2VMiRSDSY33xlpzwbVhlmuKDs087Kvc/2Njaf5fOvXm3uXPYKhcLb6tZguQNEjJaicVdGrZ169IQ+p8Hr1cKloI/L8ZJhkfBoR81YLap2KD93+oGWJUpB6Ds55c7Qh92YuqUaCf4mmYQZaOLT9VP8luiNjv7nOk75A66fPQPk2CSh1Dc2d9uvrtnbb3/78eU+bWtlqvT+YLljub5Z5mgpWMitzkdPFJU+JcBRq8H8Bdd3dpJujaiy5oj2l0MI9HM/+32gIBeU+aKGC6q+82Z+UM9AJIt5LDrtqFsqDW2JU7MfX28quba2j3yVXogdkIMj2mm9vbHXWnr+q66Zra1E2eKgPVj+X8atNaapNA1vpNPbtB56oG6RhKQl0TUwKXhqxWm3tNYbW2XbFRa65R6isdwFC1Fh3QUmo5MdYGMQXJMNsokb3HWzMVnHzPpn1sxMmjDQhDY9PfHEHnoJlQ0DNARFs/tdTqm/hO+P0qbkOW/f732f53lfQIX0+2EhlIr95c7vv/2fA+olkSDEIWcOJmbUaDZbYwSB+YvEH729K6fryH/WfozfUe7xcH5MHaTpdgEdZ8LqAsS2udeUY4w22cfLlPbXC4oU8CAAvuCDuQORh7cm7H0b4yq1fb38v6O1bcdWE80HPr9QqkNegFQusA19/+3zCmMcGhbuP+qRLwODHPOsd4iAlEQTP4mcub0baXH0J1/8wAHgSQ4uQUA5IOGxi/BAk+lve3DggELbpWmRl1Jqqms4rMCVPACRB2Gu+JCSC86Hx0qmtIlel0ZTP1Bmuh5JbEQA8hxjyO/3CyQ88tOjHO2l4zfUFUboVsLNHjZmo2oYjhAhZSEPfbM7y+U3z+o1ZR6gJmYxVGxloVEm+E2i0EDbo7Pt4Y3hptqWErJ65qE2yFdzXyA4D7pSAF9SqEvDrye63iYSwxMajYZ09T589275zIH7VA9Lg8Itn80uz3r+3fM9PXCFMN5fQjo9dLZAALelYkSN6eYIS0jgRZPHv96dKDr+278POQBwhFz+HnKkB+R0zcnr7cKNd09/oSTJ6snE8jxfEH0LgSA6KejgpYK+Pm1B4mmXgdJQalPrYNVk+9mr6htrayzceYi69/zyu5/ucbAgo2m6giRLbLpoiAEHQL9hahoVZPsFoE2xxt2JohO/btGD3+WH9wORIt7+gNpRlOkfcbYdizx9WGWnKErd2vkqT8iHfAHlyDZ09DBBrbZAm5isJk2DVV0ug1qtcrku5A5ZQHthGTrOtDTeySoVgXYsFoRslLNE42wY4WIcy8ZjcZvBUNOvl/gFBKfblSj69HH5bIgntGj0sY0cahaCteTcf1M16KLUrvExKqN7FfdQBUbORx0kCoaOKox2jHLNRFZ9w72DrW2UJpfUqMxDdSMcQ3NGp9rsic7C6GR7SurPlVJUU6WF4DguthYbNX9iMNcbGYJldhZFhZ9eeuIOZUuw4SzH9TXlooEMZGXuOrWpjVKrJsaHE8HBjJnViCId8m3gQZ7KQMdFWzA2CB4wEtAmtJ3dbx49aMt1VpQNWTiayA5ZesC1hD0uU6Brqn6ZLK/IMeQ01ZT39Aw02EoP5yrL3CEizn2oiRYeOXHi4qV7TzwEvOCorsqxeENJjrKcFg9UlCjJT0wTY91vE9oXq51V3RHeFRLyuZLKdXRt0UtAXAih0Qi+gHD41WrzmauHbbERK02DxiOgo4wAlS8oU1S2zc3N/XWlZarq6gxKXZvjrKn0SKGuvv2BVlR48V9/+HeDbi3GwPssSalvFA8xXmWSxR1D5tJa06M3W8vLgHgLASWBjlbee8V8O+hBX4oJ+AIvFpCPAV5TKCLNZ+7+qiK2BosuZvy4aYCm714vXUkmAfilhnJbXcsd27kVh94vFwsI9usPFfSfnfjd46+ssRhL+1GCgM4v8COfid+/BtxHZpQZc279PPJiDiaCEDlaijxMbXH3DKbjjuoiur68jwH+q4goOtvPXiizcmifV8ILXHRooiPj3ObKpmNzM5lcWVxcXEk69FKUuCHLB8vi0cLjF+89+8bKROlsvx+QW9AtxNL0bgqEzv04YLh6JhJJKU4FxI2go6bvg+4iBj6fvqbbVgYS2lvn2x8YDoIGze+hIx4KxTTN9ahubiaNIp3R4QaRd1usKbPLL/3TTmvOh0785fGzyh6HXieW6911N3QyMd+L4KPDJYiWtuvNQt7S8gXTggKCBsgD6VSfD/r4HgV+EObNvQLnBdDUvvN3TTWMP9WZsZ8LuSIranItJpMi2iuFAkEqgQ+FTSVmR/V/FNzUS7+nVOamjg6nSgNtEr6kw7gLZKy17MKxSAAkyerqi3AYBRa5h0IUcL53YuAA+Ra6pqjAaLe6q6qqrnWCApPXfstsRV4ImpIiEwBOoUOxhurK5EsH7n24tgH6KxJJMpk/H9kFbzl+r7QJbs+um9SVUULOQ0f3SMY2GB60hwtWV1cVnZ1bAEUBCKcQCyHMEtPIC4LBVFHXbjwcn1in1KCNjg1vJPKutg3QmF0hlwvNikCziI/U1Lzct2SFNjR2Mry4cWcS4t30okNfWGhL/2i/sd7g5mRyfrUJHYKuP3X3fEIb7h77zN5qH+ztS2iD2+qTP9thByH3+aCnG96YnKCUyqK9SjL3cGvVxvLnJzsEkKMjiwuaAF7UoGXxAXv50v6kDtcEL5zBIG4NQva3XVD0wnuOWJSJrzHOMh2LFxBFElxtaGPOhbPad31T1RqlUkkqDfaqp+Ft8xbmSyAY2I46xA3riVDbW638OGu6uHh6urEoVzWW6Lyl6qcRhUsdFFypzGjv2Ld/vwV+H2hy5EVjOvA2uxsCUHjPDWQKE7OoWtgQcp8leHigk4Yqqavn303aNWTR5azTjZeLSMPUVl6q5iHkPkR1U8hhdVGEe8vIrPwr+fnF4Ex/RBrGtFOHa2gCqjg0UoFxh9c0Uyorr7a9POjRCaCJi2Y7cvS+l4ntIuiH/mGNEkQoVkk1xJi0by6W6gR658ljiUkzuXc6H53iRlI9JUyJOXxJIW5cG1Hi+BQLr11k1pUr+AP5+dN7yfVr3W05ljgaJIoxcpwUmQJ9qfnc0j4LfAtutmEdBgkTO7Izdzn+hI4SDOttyjCiWQXPtwD+0ID6wfnhJvKj4isoggBKFmkYn+dr9hxGjoHjmIP7uxAc1FzO5w/8zLSS/Ozt4KlKjsELslDk8zoAyPNydcXi0qKe8MMNAzwRQOqa4HaeXJz4igPIo6OGjigg0TKRFMhGuKksJqSlp65HupRFxTiC4LuHUXe9DkPCtTA3txBAnfQ9vghCH+5eV07DYOenot5IVg+/vmXXgz4K7WapjJ7lCQAa31CVyaWkjkAeBqo9XplXJBMR0b/ulC9fejiG+UHfQg0AHgqg03oH+jMagm1Q3z9zzUBOX9mOIMjbIs2MtgAg5+kiQDu/nedA2s2HpzSXi4uL0x8BQc/o3phpq+PwrNFv9WTyM1AQ9Ki7zHww+XJzBG79yNDyAqiNsEbQup32Lr4YiTMyq2e9Wh8laIZmRRWn3fAvtthM56m7eVPKj9PxgzgayYm3WlS35+Z8QD4DsO/dz6D2rR2GHJ1UwjRSMxt9rabRNbhFTIduGGyESMdjJ7iB9Y79K0sOgiFmvdC2A7XTOwtL/E5br4f+GWcIq6Xu8M0oDcUsZ1PWegDyEGdT32/uc5GneRipf4pU15YDkOcuLARQuqQJAOieicn1Iv4Z8/HtAEHfO/Fwo+qkSxcD32koXkfWNkBT+/+UnHtMU2kWwDdLaUFbWsG2UFKTW1MKceRhu6W1L2oV2wVaKyXiIA9NwxpeClKdrUBIxvHJIksmY0I2mSiTMGET1AmJGv8wmcn8QwLahBJuG25aSttcZFKVxsAQkz3fveVlorKnUB65cH+cnu+8vvOBTjRwIMGoqnaIVuJGNo5GOKm1O8kAo02diBhvfM5gzj8nuIqmAUvt5XnU5ItUJKdbtHs57Igx61hX8IqcP4xu7uoDcVFm2yH5d8EcE6kbRVGq24LWKJW2eA4snpJ3wHVwfb4YJL/PBX/s7ppv3j9rP3QmCrfwE2VYtmqQ7UVjvCzQVZhbpj8nsq/YlZMMuinI6KwzRv04NxzRPjn6afIbSl8qz3RLUu8DM/TNd6qys0/z9u7y4fWH3M4P9/kdCDs/H3HAM9Bn8NsPzO1hTiNLmaZSgESyiJz5q8VRSQZcLxSK4SG02WzC/L79HcuX3r//7nZpVRRPwaNlmRc02D0tDqk4C80H+Fl1+hJrHNROWxDH+/u/Hv6qjEbmI2+mxr/+lMXkjkd8nGi3ymJEo2TRCpXEoGrmcicJK3ZbfeDDdX6GK39daCUO80+svaXq0BlETiWMryDhQg6dGSz4VjIsBl4xjS60wUOcIT/1YXHxSqvG6vOyCWtmT2cW39IwFQ2D4aMJdK61Wm+oGiwboPJcju/Xr/OO3nn8y49ak+nHh58ymP6mCGQ+BknZhEKBs6tqJc1lKivhJwZUx4ac7//bwt9P6RpxU+Ri8X5+zcU5KucFcmpZztD5uYciby90vbAJkYiFtNhsw4h8afEHvabB7yM6MxsiTQ4MMzQoCCKMexl45J3xgl4u15Sh42qpDKIbufK8I4fPg+QWf3J9snHWPb5DyVKwjM2FtXXdDvlAJGI/Xjpmfrn4XXVyn3CrykH60qpXqTraQ7vzGc/MzEb9D+RpfchGtojNdhyRB18vjeprrb5I97I17FP0GORYyd9ByyleLpertFrSVWV2LZCz2IR9B/2WG6b5sLJZch+j8wMAACAASURBVNpEsIxlFknJoHEgK0n7Rnkte0S3sC+42tjRJ/6IPL+j5uJbVCVRVk616Chy9MwMLt5Pc20HB8nQX32/GKxcqGxJx3pxk+UWg8PwpXReWNbrq8/V32o2lGTVahyXfV4eNZYR3cGEy+Hf3kS0Br6l095wz1JY20za7Vas/t1dQzo29PbtwtvVmt0fkwv7kk/Q5FRJN00t0lk6lno8r5Z+kA9/DC4+W31pjrngdLZVW0qwC5frm3mpPIaPwLU9Z84l6ZeXM5cNvZdTcAZdM034uV9s/X/1KPoGKNOTSjQYllXfgCpxBzaoNNTWYqOvoRBabSx0ibdpHMjT2mdfonRxZmZ6vRidSYR+z8zSFU2GcDu6ra+wpc0J3JV/ttZrz8gtt3pQoczAw8R8mKdt6m6ymzh+nJGYz5ngsH1fbEP3G/+YtztUSVmWEkevDMrv0Iosq6SqpLauWdK+D02utPBpcjCSxAoVujJHgy/3MDeif2KJeijnzny9Wp2WbxNugbfZiiRus06na3OO6usIb4/BUsXhQAxi0weUcYjcfkhleOvz36mpe7/UEj362x/EikzWUCEThGIxUiAQhOL35BaVqi7WK2m5uFC5sODmDyPozTcw2uWrBUxUVK+v0GlK6VSvaIY5N9sucW3FBqPv0HSZpVKpzunOHAA/qBzoTqHruQlW4rAv2g1UNjWZ6KFwntf0+bri8ON33FAFYJOxWCwUgOJEEKtIytYYBmOBwd3LlyrhJR46eJZ24+KE2oXw0n8TXE/Q15fohvJnXgavZp6lgWlvbntRxH8glebAQ3f7tBLn8Tg4Dhktmk2m/vkCOHAG2so0ikQhKhalwhWfnVn42+OpuyGRDNBFAhJ0jpQeqlJZyuJ2gUB0XH+lsk1nVh/ju4QUOsLOh9iYAcH/VaKf6/HQ3UWqQUSp3MOcO9AuKXqx4V5sL/ILS7vMZmlOjnRI3oxzd6VCPouO4U1SNQBQQiRlT3BSm0SgOiPVqmIRv3za0Ivz+p+vhEKxkEAkCCCdi54+lQlEFVUVRrYSvmVI+tOp05nNI9kZ4BzENDeofD+/5WJwy3ZiooTz0N0tD7AvrdYUujaUbuvbfdBtvjmWI5WqG7FOH1T8ynvNiig6lw6pLC+FdzlmZHMRuQCZq9KLDqAQnxkrKs493H/n4ZPx7ykZf3Sn/+hPdbIKWdzkJ4wigcCQqTZLy9Xm8kbJfojfdN6CAqjl6tK2rdDpaeoPoAtTKl1fvFKNFYltlAhdaQdHpF2Nt3PMZnf2tSkiGrU7+GmdVIHEAQ/D7r0mi9+FUgzIAwEyQNcYvujncvPi4uK8XJAjR47k5uYV/6X4H78HSDvPH75Lgv0YsCFYVO4R581WSRHtVCB8DvMzTxVMM/dtm7NALRi6ucuksvRXBVdPYLuHIV10DXfw5W7pUGsj2EuXvrYzwrb3Zh1qxc4Q1Em0lF17B1SOWMzE5nBSmgA8FELlEXdHtdxWH2mfSvV6vVyjDAyuXuKW5uiGjrkru1olZ4sg/QOOZEnJqeD0pr6Z9DbuLDzWEqZOtXmXLt6v0cixwjRM/6BLOlKKwNWN6YaeMoNK3jh2szELtUjBLNgsh9waJ1dQ+WgnSeSXyZh2gjvh59z5P8jvTEXwSQ5DQSLyOskD5MhGToKRPjgpKUzuSE7DltsvQXxiJsxjm6EzN7uhTDQctXrq/vXr346qdeau2yM3pVLzkJyv0chPNo6pwW6w3giO+ou4XXUtFAuElByG105xk2SAXFGmTIa/3/nQ4leP/ASUiang4UUygTW5UQ33042UjpilXe4HIO7RS6ilv0nuYa4l6LdyUx3TfXPBgmfPCl46deBUkEjV8DtGxrpyUExSt6rsBHgWVrhB0xsPkQEjg8teQeTgnAMBAWlX4tqdT+ceGZ/3sb0MuwhULgqIMsCXgXPRjbnBLUjNZnObc+E11fmn9yboRhxqgK7Nru/NbQ6lwVXBgoIDC20b5AAsRa9ieXk5kKcbFOFdPDZeX9sQB02vsPDJFRK5OhQPAwJgV4zv+MjF+efz4GaN6LgE/HCsng7ZcD9EDh/NTnraj9qNoHsUCHyNOZv4OkHuWW/9z87uqdwgR78EfQrgUp0bU0nqeb4UrsKSKYqjpr/Cz4oHSPLpE1kMDIaEqBiT9e+U/IaJ8ONaAQ1OxqEmAo0jPVE3RcF7gbneR6dlw7fMrnnQ+7rl0x12QN9T6dxUujrxsbztpv6vg9f4Di1BGFWnQzG0MLW+lJggNvifw//8+XkcbWGQsZXHO1R63mOC8JsEaHUixxojLaX/4+V8Y5rKsgBOh2zny37hmTZOX9PSprOFV5qadptCCYgs1GVpSVP+FGFRR1YZIrASJgsrbtTBUiKRWRingnHNMmHmw7iOuq4DRjSzGj5sSgK0k7aT0OW9PD/03/LC2iBQQvbc+wrqN0d0DxBKW/p+77xzzj33nXPvVZ4cj9zWoo7qnW45ZCGaHXJckgOTCaVVnnrRWMej89rmpaCo2tWmvJK0HVKWfPLvPxXWQN4RBXP58X0gPzqBdmj669/+/uDBA3btwWs2uTbA3P8AWBkag2mahtxLebHoxVE/LKrOEu60+S0wDF8DgDASx0WkED6VH2T8aJquFIU0C1nVGxvVyE+t+GM6qufu/0Z5CGDVRwyGI4cLT4J/gplw7/88SXM075VoHnfcPeh+vep/zp1fHmDFCBwNwvBhSfVH+m9//eGOg1W/HDoWUqkFnk+43psl4+sUmyE4Hz7KYGPB6LGe/tr7WWfO8I5S/XQl5jE0jXAwzrO1hwwK5W9xNKGjv/pxLZqk3a8WJV4rJA7+gYPUCw1jkDQidJY7KaovQJbyC2zjspeMWHaqrxPNorOy4qnRZ84EDE6pUEqj6x3vmoc3pPheDHSBQjFX47n//qvNXg3U8Kws0Z2pPJzEh+DoygsVtVFeU2ufrbHJ13fKF6c39MkahEJwFcnUwxExlqh6D3n6dxAOQVdPZTIZLg6FMHm4q/3ZegICDaMbVhCNXYkwUu9qj13xDSPktZ3KwiewoFtvvPKfzyrsKSYLzVV1vSWiGg55kwRlqGI1fyxQ1IEky9l+Onmu+8kUyrzu3HaXtV6J0vjj2EpFsRMv/0D1Qdzlj0uesqcrp+zKvlQ8nLgxXJhpV9R7eubnGZ2rX1TSxfBxZafZeF7Tv2dtJH9YF8L1o7FjxAWaRgvAePaoeAcdwknVT18FlZdjNBuNxtLSXHDVGcjUgR0uwRFR43ocgwv5LIsPhaB0SAdHPd2eUcUz5/2+QsWxPo+ns0JU0Z2YeyUZgzNguus/yrf36NB/r47tJw7aompegBwbDRfFpg6GOlO2q/WhDTNJlkZal0Qlh8hR1BcSQD0t8GuB7w5Fg3t3o8IA0+623tXVmLPNoGgyKA323lh4e70FSsGwDws1ztH+sZgmJAxoQOMHR9AqR5RgSPgoFn38GIUXtJyNfbi7ZdxlJ5McJhdL2KMV2s6ehEaDKoZCXFbhsbJk8fXxUXu/p2c1ptPFUs7xzv4+5ykIkIHAdsYoTDuFkNnc1Gk2NYyuu4QosXEQAyVpawGVc2r38csodYFsRXJrd3stmB8mOcwNETJam6/s7FnVoSZifoa/bQayeFiY0sSAm9EwiQTkKEx8BcdwGJHSbTqhdCQKM5pNXez+cCYGZ8WPaUmaG2zlcmnGH8Uw5NNibqphlyvPp2lMDuAQJivztf2AzuCOLQzOTytkspU4wzAaLPPz4XkG99PjCnt6ZpfuNMLrRnSrrk4FccHGSmhucugyR6cdM8oOmjJysNJZdnCX21uYrlcl0UiKuNGc+gNtG7q3hu9kvex9MmH6fiKcVECY9dLMNLXd8sp7Bbg4c6P7mGhfjYRWS7iRlgw3nUanuccw9zG5aZZm1y6bM3YprUeSNDJDsfpcrTiaPFpCPhvuSYB1vAIObouuA66HQqSUvTyn3k7EkLlAOA0zY52FxHvnohAOxeyt3AzzVJKPvNEk3gHluC1Krz3Z9W50eefrjrI42E62TttYGNlqDIY2J7DP7eQtCDyEydEdC3wT/UVzMZ7ewdOQyWhCCz+EGdd4PSgcTBw8k50CJedOJlmcaGCVQ1Co4rjdg2fktdytAfenuanzOROVoByOrSxRKuzOFBOeQ0MS3y4fmEcGHthumgsEtpNc3KUr5PuiIKDoXJ5j+4imwxxEFIk6etSN0pFBmkPmSNN8udY4Fb3zcYZp1+hG99dXYHbCTppzy6bR/EoctR1pEhWOOnuY+BzfUiQMzfO+GQoI+TaXeXw7Gj3cthYNxMuYa/iYgiCI/P21asiLomq+BNFShVZ8i+nbOfy9H7f7rWzIkffxYN1J8Zp4Iicv97vaJLrGEklVzc/IQvs365r4ygoYdSCUjiohbDhIv8h4UOTUzGPjDgD3jbHxRuAWKUUiQ8kIaFw9yXth2QyQ0/TOLhx5GSbTW0E3tp6drnoylGvKa5iOwmBts9noP5cAQlPbeO+pcDyOFrFq8ACVtnl8EiHcBaDRBObmwuH51Njw7zOVpKXcoQSlKwwn1fTINB+xTeaHHEz5J80Zb11yza3XbpWBJozXZlgJgNvEh0F5TfvzFXvtw92uGzEkOqxeFK7xFUA3RyHxiukSTGq9d9j+wT6SJLTy58vycotWJLq5/8qF1nTENk8n1yTvAhzpvdSYA4fJablbK0bgI++B4m4eNJAEoSxu7PQA/X0YP5kwCLoCOvQHA2PpjZ6u7uHRkr1KgtQ3yx1abfNixJ+tkjr0ypuftvKFNlPpdHJq8N3stgxmhy3PlNNwtxLs3FYjIkSkVq8nCNJi0estxfX2znGP09nb5UqlNjd7elyusV6n09M32la/VyEitHpHs1zlj8j1hF4e9MMXJW12fH62tQzB507cGnrXG3KaclrOzszs36Mk9Q65ykES+mYVJZeWW/RavcJgMGRWNNqRtDXWV2QaDMXFxScuGghLs1QulcopwfMtr4Mgm32LwWB2ts9HUfJHdddbjLml/4etZ03m7+r+ctNSLqUWKQepbVapVBSICujJwraLJ9qL24uL20+0g5y4+OXpq2esVw2kVCUHcpV3VhB5HpFqSYdPAOTZ2cHF5eVFSnrvUmvZO99WPK/h0qePpFR20E+VAwEViVAqJHK5SqovPmMtGAA5g2SgYMPaUWQtKvqSdKDX5ZTXC+hLz7f8FsLhXcbowL4UiSz7VPfqLp03mt6dvkvPn32kEiwtCRaDUmSwERABhcHBGCzKbzus1g74sRaAWDes6HugmJSit/gEs0Gv1y+IbEXKCVK15PUBuC/oXVwULAtmfdmU/N7dVnPui2O9tauQZ2y5fk9KeRG4wN+sJcuXt55HQGOzWKNAXk6OAisS4B4oKMAPO04rLQBOLS4JvF6fzyvwwr+SjqAgGPT5ABzIF/3wgi/bG/RRX3x96Tx22bLBf7zhFkumVxcf5Za1fnVPRYGW4IILZgWUltAHt7Z4dB9ggwfKpfr6jQ6efAApHYNvtJPNKvBNwSyQ+bxUM4QjfbN/adHrDSJgsCC/F6PDYzCmZeqa2Tx027O++v2bxXfjoLssb6dNeuKrL3yLfjhyto8n91lQeBYgchCKJ1c5igesvMaRzpHWrR2dWotKrpoVYO5snltOLQO41+/3YvHDZ87iR77ZyJb087qHkBElXJNvtuWf+XvXP28Ngc/kmSf+R9z5hrSR5nF8nwR9IxScMBCZYCbDvKjRISEi8ZQri5iEenBIlq3W9k02tK6cbP3zQg9fHFa015UKpUTWOynnoe5SKR6ou1ha0ZdLBtwmxfRFZBD6YoglUIQEr1Xu93vmT+J2j9PCMU+rBIkzn3zn+/v3DCbLiTREURqxAZwuIoYCHLDLKnpHFoHcLXpDV7q+0ZzyV7p+980wTD4hrzcpZ+C3U2KYYaSQWxQhnYNR0mk8FJDL+lFhqXzA/nA0t/dqYKrvE+v9P0Zzx13rq4sPNtRiUc1n01RwegoCX5AG42FJioYgYCk6gEO2GRz4gkYnNcvvB+amPCwbBatA+k6m4hLDRSFBiil4IakMHCiL5LJsHhXcEhUenhTqKw+Gjx5/4jsut+PWT/3coOQ6Re40Xm0kh5MRDd0LJRxZRLC6gkHIxznP1NzBmy+09c431s8JQ0JYVlBVPopGwWuTJHi4pA6b1NAJ/a+I3OeTOKHnuuydqzNtn9CltPctD+9WH+QWPNAiYfQDebIkOSGEx2QYwvIf4ounqhfC18UxbHfX4bva/f29V++GJ64yQszGhomSJQrWzijEgws8n01TW5sW0R5h/KghoWMz5/MVRvtbR0ZHdu59fRHhg023ptd3JjqP96sr6yc8bhXAszTAMDy1k8BpFNmLOSUehgYwXjxVvFRzlukfAHJoto77BdYfc8T8YYIJKA7PwueD50la1gJSw5WNR0RRScA+lzvwFTYXwv0wL+4dj6zfOzf75b/vzI1unsze7jqo3H05IbgQNp1OaacipjwoO02HyB46PeW9fIgZamZaR97W7tX7CrMe1gYLyJWiWhQlCu72ouOITm5cQp1cUYteqXPF98v74cHQ7RHf693Dt7nc2LkH0pntydGVwslI6NtheNETQpySayfKGpKj6vCAx6QiivEAF0K/RJkqm5+Z+nC4Vw+Xm6lyAHjMH1CKxWSAQ3DRCPKS6FrU6OSnrsDC5tv3E7dD33bhrDLQNTv7w7nTetOte6svJgujU9F/Pjk+eNIYV1ATeiIodyY70fgzkGQgVqNSXOHFKFNhQ9Fz+77CguC3OVD0S4HsqRqlHhdTpkNKohNi5pViMeQcK/hePvn+b8MH+CcOE/Nft1wow7Stjfl8c99Fw98NjDmjCjFjyFCI0AU/5qHZ80K6cIchToG8yuGo4jpHc4URJxtDcIfjkpQ9dXESgmukinFAw946OyFg8+7JQv3L6ura3drK177NicULFv6Znfd7u77Jh98PDgzcCECA6afKyqUrCz/jQe+trbwKdnfHOc6ViTLNkUjkkjBRmLzBVEU0cr+UJeAmjE3aKyq0eOFKG3YhetyovNS/knsN4HifFW/N7Fxk4Gi49cNcDnfJD+orq3dfD0piUTGUzpbIweOo9bVrXhVLqCvKhImLjUUi1x3sldkp1u+gXrGB5t44E8Y0rivujobAN1gEZONomu6yKkpTKz7cv8M3DHrtK5ycdF1gyLu1fbIyRv8erv7gVe3+bGOoqBJzybo1edogJpYf/yWVT9IcE+DcbsEGmkea2UYBvKKhO6oklyS5RNGsAyHh6dNHj7aAnuji0/YTZFdcwuDBYe0b/c6vb2Xz5GRs8byqB2fW16dnVo/f1eJGYPX+cHcgWUYOsSpr3FsbS4s9Te3LeQJ9AXaKUtTd6EDyyBDDNqNRKHyVFA9DryLTCwdFySvGo63X+np6f3ywvJHgkwo2+di3wQtwPe3895vDXe3utW/sxYudnfN/FlDwclNTQ3D6+LASdx5e/lI/JbhUoltb82NKRLF76MfMtG/ks9hDghtCIXdYI3c0x6jcdDVL2EemFM3NCvYJbtfdJhpQTe3j80vPEjK0Rth1qq67D55PDPve+g72ql/5Fn7ED486/6AUxGI0lsM7Ex/gKzfiDMs6ObArSiqxPD9uzi69YpaOBeB6kUdyDddRIo9xcd7NE9nwRQoHqEelJF3X1NMH+FiHTsUH7b19aztjK7m3+/u5sQvfs6ibntscHv6Aeya5wuj280cukqSFQgXspcX2sgwb7POmeSRPAbrX1WiLGNgATtEjQK7FNdQCqjvG81b7rweunsW1pWfP+urqgjAO/DQ79yFXOLnwbHF5deLF0vMu5J7cXp1p6b2bgllRUdOIXXd2j3Wez9BxBsgy2bhg06ltpuYRGxuC8KBdJqHlAOtuvPe3FGvSPuco+Flbz/RP23MrFyaHTrGlbXynUJjcmW7HY/Vt5fMZDfvXT13KaGMY2ElVQ1r1sZVr7rAJUbOpotrTcP6fJaau5dafP+mDuuqmf97cnm4JUoUbFpd/Cxur7UYmpc9JYOFoOblueNA8nJTL2zUZw/nB+TbWPmUOXd/+V+kPAxra/stM2JIw2naIAxI9q7mD4tuEcEpOJUsNOW5QiMv/t0/dqJvpvXyOuwa9YkbvokBzEmZjZU4xlPcHeI3cGDchrYobLZ9Zux57gTxtdI9hJmZw24xYxcbFS8zG0EB39VoL3rCU1rcDMOMnA6bmJjhtFr2EOt3oC2WcSRatJW/ayGZM/5JUgLV9vKBx8RrNJjFaN8W7Zi15rzefNB0M5Gfzua75EOdWjRZf7x9kRVmus9bm6Tyd82SoRCnCB/xlBjfJmzlofAA9bZDjdzXRYq3N83l9KgN04pUuOT4mh/LvKp4hp/2LPG6pzZ/R/UHN6Skgr4iYXUtZVhfixmxiTN+QQtV5S23O65KnZF7mDXLHR+Q4mxhzpzFTFa00enAxm9cEB49Tt1SUWlyzGmHjoqrkDDqSJ9otJF9TSErzOO1bDPJSEdJs7w/jvI3b/jp6EkOUWGj0tmcqbjgCDU/3HESuygR3mBMGlKKArOg7LGV2sdLo7Qklq/WvNF0U3dyQoXkJHB5WBHjF3NUyM7uVGX0xk5eT2g4y5rmiyMUiZZMcDqT4GiJYROXS0ve0iIVGX8ua3R8at+iWYhFjDtVHaVusuapC0DQvB8eA5fusAq9bVkjZVg+S+yuqhpqNNVRV4RdYhuOEgFfVey3T5vh9LWgReUsiX7ZFpRaL7oAgcBzDsCwr4Ft2eBo5ztPYandKLlUpB9c2VMnyZYty4ngqXya5UizGJWeNs5Vrvf75ja9gdU7dtHP27qvddimu6pfHHC/wNyxrXeazZfu6CpBHpaPu7hruaoexvrzBXem+euTkooqheTJZCozUuFU2J/p9F5Ocsx8dORkgv0//dXTcEVqvwo+4sFzOrXfqqlUZvSVRUpySq2HOWVPTylDN7w8i+Z88QF5jZwM8MZmTJX9Zk9GDvbycLJFDhCoB1mm3X2HsHQuUvaNjATTvPqpxAnnZzVrzNpNVrcu8fo9ENjRXAkyr0+nkGu//8cs/aD6/zrUeXWnkmLPkxKhdSUsyeoORzU23ELw3Kng46aubU/fv37xzp/MrDyMJkCYZOkOXbuyZr9YSozclVH2QN1ybDDAsUGLp8TR6PPRNmBhW8Psv+Tm3/syyq/Sfds5etXUkiuMWRtWAioBAgwLXNiksI4NJMFocSGGUPEAKFYZbpTBq9QLC6lWJ20XqvOAiVYgLF/cF7OpusY1BbSo3KtLufEojZbN7K3sK/wnE8cTwm+Mz52NmbOxhS+skbp4rlfnoIY+uaiOkHv3mKJSPRpqmAgBG5mUuHJGVayPfjE/k5spOxBgMdQBUoGJpWOQX+gNo5lOuVOfu1Us685NEc4VicJb8ajgChFsj4JQePwCafp8rVT8kTDc7STTf1t961FgQcs6rqRweqPrjfr8VD+LwTHF3sbSPTu4Ptg3y/Bsh10qp5RRU/eHvPduHFsAR+fEd3XltmnCnXGJyoIrc3HFwEv1FdxZ33MtIPPp1dEefvonH6NR1m+Rq6TqqTrZzd8LtmJzafLc+Nvmsk9fJkZ4IOeBxpRT6Y2RevVcbooKH5ceO6M56/640glz+dDHCoAA7NmBRhk0BpaIPpUQv3yfURm+OXKNby0N1Q4Jyv78jmxNypBckFtVVGtAvPw6KotQiIn7xj+cj90XjTc4wWLQg5fkFxQRB8JJ42TqLvZQ9AfR7cj9Bqfb+aQ71j53+x8stvu3B7E5MjspzQg6IUm/Ssq3pGjDpD4eDSE6O8nZ/Hj+F2rPXzQ4f1XP7NciDIMRe4EySgJPvD+I9HLwNvclOUbW0bDfbbD+Y2fGmMvIWXS1tDmKSHPseJx92Dn+V1x6QuQdv8ak2ipzW2F/+6OzKluj9gZYtFJXGaTtDPo6eBLpJtlzw1QE01cHPt2fXbp1Qlrtevv286nTw7bH9tUZDIY6LKWvrFykhV3sX91eDQWfbGXx7un9M4tlpT4mw4fsTP7l+eHy8f3ocqowcKWUf7XQjSj66MIfD4fX19dDEN4pmLRnkJrj3wc1PUJHz+yv9kD2pjUiHhJsNNC9XEnLSCGlqAEpyELGwYfuAOz/LS/hRKonNU5LkWUyh4MDjN95mKQ/pnByNpnMpyBGbWqUgFhhDltSdcSRMidk8SH1ZyAmZSB6EPHb0Q2GAzS8AmSTkQYXO8AKPF1J2rJXofHYgiG2ZyEGNfFqSl2lVIA8t6cgBJy8/o5qVvJWqiZ04KtaoqJ9XaItE/YwuB/nYo6tOVLouHbkfq0IhxrxGDm/pr1PCLcIlQsCeeFqNHD18yaRYoc44ZmUVidVIQPXE9D5PeTREQ2SOie9IERZtN6S1rErhur0XT+gZHCvGtQEe+gMPa6NeIkcORcXu3OPbFFq3h2rCbn0FzhKT7kYjjVDd1YtcScidvo/qRVIxmuawe2u0vX59DXfx9j8ZNs3ed8ObSEKO2tKop2M4s3t7ByFskPdDaNx+v7npdm9ubw08PJWFvDVbITYkw2hDrDq5naFn20QQFp8mdlJNogKhGUgUL6ob1W8XjLwN8Y9E5MgfGDmGh0U0brwlnBzPDBoSkTuZwciMNiZf1ZfgOGLkBiUP5SFv+YycwCHyetizQ+QikJtcLnK0RCGFwypWjUYzM/iQdDYfRySmcLYmuX8nrtA7mcinHhTRV437H/O0tDnE5PLE85YVEm6KbhhNcncFiYcTm7fvvLFs5NTqaI02CxM3aguOLhU59ZY2c5jVwmlmKtGXDGkqLuzIONdQcgg/gbemMc76pdmlqXJxh0+xEF1RRJ+5HNcriopcaPZkqFsoelF4/7ppOIsqdNiOpXF0XFIRrAKGX9Tei1VRlOTeQhKj92lkQUjR+qskVaKzFgAAAHFJREFUY/u07MKLYeX5lhzkyJ7Yw+Eqdr9uje1FRBcphEkoic2tmFQtq3Dxn5Z0XPJ/EN5Fz5KExelrlETheva/1Yi1CKNVO/GyuSTOYs+fs/nvfV7ZmswXM/JtapKg963f/jZEx3FaZ5111llnnVXqH/qb4XEoOF5CAAAAAElFTkSuQmCC",
          "sit": "data:image/png;base64,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",
          "fall": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPAAAADHCAMAAAAQ9C61AAADAFBMVEVHcEwXGBovLzLTxsXXyskXGRzVyMbVyMfUx8ZgJS0uLjAVFhlcIysxMjQTFBcFAgIKBAQvJCJKGCIQDQ0sIR9UHigQBQYzJyVPHCYSERNiIisKCAk8ExoFAwO6sLGmn6SgmJ0gCgwYCAk0NTgEAwLAtbVSGiS2rK4qDhEgFBJSR0UcExENCAcYERAzERaupag4KygZFBLbjXcoHRsiICHikHklHRyJgIBIPz4gGRg+Mi5+b2uAeHhza2xfVVTeiHIZDQzmmYCJdW8YDw5JOTIPCgqckZHFubhTQTjgfG7xtZYsJyZVTExFGCBmX2CPh4fPxsfGpIsXCwtxZGJOLSUdDAyXi4nYd2iqnpxZUEzRq5GTjJDatJjOiHNCPDlAOTe5dGCuoqGjmJbPloCqZVQ7FhoqGRkfDQ19ZlZqWlaniHNzRzsSCAe6mIK1qqhfU00KAwIuGRn58+9dUkx0W0xuYlyCdXBcUk+Jo68SCgmUXE0PBwVNGyKrd2M3Q0lIPzwfEA96cnBVICcwHR2WjY1vYl5fNy5dc34rFBWWdGKmnZy+0NlUHieRiIc3Hx9aUE2zj3iAeXvMy89wZ2d+cGiLg4OvlH5HGiG/pY2cgmydlZVgWVrTuaFHHiGmmpZLRkeQd2WrvcWgPDqyq6pGPTjN4OliJS7Vy8piJCzzv6HxvZ/yvqBfIitkJS3WychkJi/YzMrxu5zywKLZzcwYGR1NGSTSxMPZzs1mJi/c0dD0vZ7Vycjd0tHXzMxoJzHzw6ZYICne1NPi2Nf3yKvTyMjg1tTbz87zupnl29rZ0M9bHyl8l6aBnKvbzcttKDJDFB4kJikZGx/3wqIoGhfPw8L5xaZ5lKP17elWGyajnKH7za/5wJ7elX/y6OPt4t/KwMCpoqh0kJ/pooeclJknKS0yHxqvqK3Hvr3BubvhoIdAOTnrtZjtrI/gup9lUUU+JiBsgo7vxqloIi6/gGyFUkSNcFybgGz91bnyzrLjwabir5Lrv6FlQjdSY21GVVyCLzKcfdQTAAAA2nRSTlMA/v7+/v7//v7+/v7+/v7+/v7+/v7+/v7//v/+/gX+//7+/v4L/v7+/v7+LxL+/v7+Gv79/v4k/v7+/v7+/v7+Pf7+Sv7s/v7+/v7+/v7+/f7+lv7+gv7+/lD9/v7+PlL+/f7+/rLmWf7+/f5w/vpipr3+r/6FsHj+0v672v7+Z2Wa7XjnqP7+yv7k/va8kJL85/7dxtbb7+3I8tH3ysPY4/7+2Lb+//////////7////////////////////+///////////////////////////////////+/iOeBPYAACAASURBVHja7JlvSBtpHsfl5uFm3ix7ZZfzlWE5MuRWU2woxNZoWWox0jtabY5icq1/C70Warh1TbgXhyunLyq4ttSKdkuvsAuhEYboQMJ0MoRMnNG88I2dUDZuHTjomta6R1j2/Hcv7vc8M4l6S/fenFLb/ETjTILm83x//1NWVrKSlaxkJStZyUpWspKVrGQlK1nJSlay/6NZ3y3civZRxzsF7B2+/cm7xNs+PH+v4R0K32BnMvlR+9sUoVartaLidU96R3SFj3/T9naw2tv8fQMjD0ZGRgIDfX5vW5VjTzq2OrwBS1LhpeRg1dugbFvf3R6NF5JJJRlPpiWN7bx3d2xoNNjv94L5/QOBYTaiSggJ8thbkKXbAtVpOckjhCRekqQYH1MFQYiJ2grLsm73ih6NqAuIoSgOKfpo8ZTsDkfFYcR1DvQoshCho9EoRdOiyDAUwyEOSZEIv6CqQjyZjKvG04yU/OOFhnYwfxAHwFfeQ5h5/cNpWQX5QECGoTmEaJqh4ZvCBr+JoDvcJNcMUqs957saG1tZnZNUufnwATsDOVmQMCAYPCBRFDExvqTIEdD4EJBonAiNYmlZjqvY/SOqPOw8dI3TYFrBuAQY0DgkcubVXmDauKZoKZ2WJJrC7i+oQ4cshq3BHkVAYlFfjuNExHHmARhOzpBTMF6DT0AUQ6FZhoJ4RnLPISvJ1oGczNPgroagREqipqkwdmwCb7o5xDHcAGCEExulhgYOl8D2AV0RMQ1RkwQwNvBpEsKYUKR3jDEPAejxGVGR+IM3riI77D/L2xxnKCJgQeEC8G5l8a/GFZwKuRLJqyThwRuXsey9vc6f8edmgeRdkwVrByAh8OoCMObdCfDiT7gfkmLRkTcvQzvGL/W+bj9RMaDHNJx16VnalFAkzloIYXzJmU7NGD5eDG0ATnZ+/j/++cH6e4UfWgLH5PpE/2te4Gd5LVoQGJcewOOISyPzjgiBSpKVyVqMZeLU6sqI17knYiqc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"
};
        const vergil = {
          "idle1": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJ8AAAD+CAMAAAATbSctAAADAFBMVEVHcEwlJCQECAwoJibQys0JDxfvza7OyMzNx8vNxcoYJTMNExoaJDIdJS/LxMnKw8gaJzbIwcaKiJLvy6uIhY8gKTMSHCYcGxsUHyvvyKghHyAUEhEODQ2VkZqFg4wGER2QjZfuza8WFhetqK8rKikNIC8wLy4JCAizrrSinqUAAAC4s7kIBwYSERHAusAMHCq8tryAfocGBQWLZz0NIjN7eIA1MzDDvcIQJTZOQDQ+Pj1fWlSfdEQhHx9lSCtzVTKVbkFIRD8XFxcODQ4PDg5FPTIKDA7FtZ5zcHaBXTRhX2FVSz5YPyY8ODJDMBxMOCR6X0DsyapoVEErIBZiTTXNlX0zJxwfGBBAPDoQEhVchpkNDA0aGx4XFhdXRjKMbE5IRUOLf24VFBY4NTWfk4AOEBGmmoheXF4QEhaViXdJSktEQ0MLHCsQEhUGBwgiHx2dlplpZ214dnhYV1dcWVkTFBaRjI8THSlWfI9CPDgGCAqZdVp4dXc3NjNjjqNGPTcSDgx8enpFZ3loZmyFg4arqKmUkZVcW186MCdHRkxZWFt1dHqkoqNOTE+YlpaQjo99Xzm3tbegnZqDgIZZTEJtUTBVPyl/fX0PFx8QGSHPx8rx0LLvzrHQyM0YIjDxz7HvzrDLxcoOFR0HCxDSys3TzdDxzq/Ry8/w0LMFDBQDBAfVztIYIS0UJDLX0NQVJjYSGyPx0rUTIi8GGSkLFSIWKTkLDxQOGSUcIyra09admqKNi5QBAQLvz7IYHibGv8UGHzPd1tkHJTjp4eEbKzrl3d4MMkSnoqqYlZ8KLD7g2twFFiT01LX00bEVLT741rb017pANSn42rz0z60PKDruxqXcx6s1ODhWUk7t5uWrekYkKC0oLTIXNkk3LiX538FzbGSxooxrZF3kz7LPwKsoMzn31LDYup3q1bnDqo7DiG/1y6h9dm6le1Cfbzrt28FrX1GwglX45cvbz7qDfn11ZVWCcl+0qZgcM0Drv50dPVbZrY2oi3QrPkU0UGD69O9+wdj/AAAA+HRSTlMA/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v4D/g4W/v7+/gj+/v7+/v7+/v7+Kv7+/v4gPTP+S/78/v7+/v7+/f7+/v79/v7+OGf+WNWf/f1G/pBT/nb+ga3+/mnjg9bp/vqXX53w/sP+jfD+rM/+dr3B/src6uzftq2w5dzp2sLP5PPwxq/Ue//////////////////////////////////////////////////////////////////////////////////////+///////+/////////////////////////////////iKnJlgAACAASURBVHja7JhBa9xIFsfnUFBVlxJqfJVp0EVq2UJtaHTyxTMsYT+B99aMDw3ry8bty0APwSR2JhmPTZKFgEAHgYo6FOgu9aEphFCjb+Bvs69K3Z6FPTnp4CxMdYjVshL99H/v/d8r/fDDX+uv9f+/Duen3zPe6ZU7+37pRvPb2j/7bvGOL4KH9PXJd0p3MruVHfYvR98rHVIFccf/E94t7+gZwU8+3/KuEKm7fgzv0eHxdP7588VmzS4uzo+fh3B0enErGiV5ETiDXwzb8fzi/kOMeVGWpTJLZjevnoXv6PTiWqpCcqnsav37jxpucR2WXdepsiwKzmVZotD99OrgOeimiwjESQnmJWrXw3d/AzgCZzgXggMbz3MrgF+8fhbbOV1ETVNgQimWyF1XL399E3ddkTJGCUmFji8OquHg0/vj5+hls2vVFRwRTAjC7nDtupoOUcoo8JFcFgjoli/++etvr+bz6fT08OjbUx0cbNJ8eo8UR0gghAmm7rCKRKkKbr6TJKGJIEHlrH3X/5cbrbLMCr27q9n8+Jvm4cH88tyIcDDzFGcUI1gYJ0HlUZ6LPM/NdzhDadhWbkhkoReUMRSMUjz8eHX+7QhPFsHvZ/0B6bDFaGIAEYtWKE9IgjYLAGnoBbaQEgTV8YdygbMIr8LIeX92enJ4dHQ0Gh0d7DTkp/cqeqef/vi+VJhCliU47YkEInoB2EZRamX6Z68m1mmAMGWWzXAauzdvrhaLxeVicXU13SHebUeWr/TBHXiaSbMNoDC3x4jQJN0ymQs2vHBs/oITSOhgFzJPklx26m53fNPrTrrjczi4Fb1Ihk8DCggffPCjoni70tSgbYANIAJjzKF+8kLJm/OdxXf6oZGW/+IMOMuQpam+Jehj9EJcl4EVWpQmiTm1+aQp+pNW81GtoECJvjD2BuejHeJxEfovf5xeqyCE3EvgTvAnBRwQUCoZ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",
          "idle2": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJ8AAAD+CAMAAAATbSctAAADAFBMVEVHcEwlJCQECAwoJibQys0JDxfvza7OyMzNx8vNxcoYJTMNExoaJDIdJS/LxMnKw8gaJzbIwcaKiJLvy6uIhY8gKTMSHCYcGxsUHyvvyKghHyAUEhEODQ2VkZqFg4wGER2QjZfuza8WFhetqK8rKikNIC8wLy4JCAizrrSinqUAAAC4s7kIBwYSERHAusAMHCq8tryAfocGBQWLZz0NIjN7eIA1MzDDvcIQJTZOQDQ+Pj1fWlSfdEQhHx9lSCtzVTKVbkFIRD8XFxcODQ4PDg5FPTIKDA7FtZ5zcHaBXTRhX2FVSz5YPyY8ODJDMBxMOCR6X0DsyapoVEErIBZiTTXNlX0zJxwfGBBAPDoQEhVchpkNDA0aGx4XFhdXRjKMbE5IRUOLf24VFBY4NTWfk4AOEBGmmoheXF4QEhaViXdJSktEQ0MLHCsQEhUGBwgiHx2dlplpZ214dnhYV1dcWVkTFBaRjI8THSlWfI9CPDgGCAqZdVp4dXc3NjNjjqNGPTcSDgx8enpFZ3loZmyFg4arqKmUkZVcW186MCdHRkxZWFt1dHqkoqNOTE+YlpaQjo99Xzm3tbegnZqDgIZZTEJtUTBVPyl/fX0PFx8QGSHPx8rx0LLvzrHQyM0YIjDxz7HvzrDLxcoOFR0HCxDSys3TzdDxzq/Ry8/w0LMFDBQDBAfVztIYIS0UJDLX0NQVJjYSGyPx0rUTIi8GGSkLFSIWKTkLDxQOGSUcIyra09admqKNi5QBAQLvz7IYHibGv8UGHzPd1tkHJTjp4eEbKzrl3d4MMkSnoqqYlZ8KLD7g2twFFiT01LX00bEVLT741rb017pANSn42rz0z60PKDruxqXcx6s1ODhWUk7t5uWrekYkKC0oLTIXNkk3LiX538FzbGSxooxrZF3kz7LPwKsoMzn31LDYup3q1bnDqo7DiG/1y6h9dm6le1Cfbzrt28FrX1GwglX45cvbz7qDfn11ZVWCcl+0qZgcM0Drv50dPVbZrY2oi3QrPkU0UGD69O9+wdj/AAAA+HRSTlMA/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v4D/g4W/v7+/gj+/v7+/v7+/v7+Kv7+/v4gPTP+S/78/v7+/v7+/f7+/v79/v7+OGf+WNWf/f1G/pBT/nb+ga3+/mnjg9bp/vqXX53w/sP+jfD+rM/+dr3B/src6uzftq2w5dzp2sLP5PPwxq/Ue//////////////////////////////////////////////////////////////////////////////////////+///////+/////////////////////////////////iKnJlgAACAASURBVHja7JhBa9xIFsfnUFBVlxJqfJVp0EVq2UJtaHTyxTMsYT+B99aMDw3ry8bty0APwSR2JhmPTZKFgEAHgYo6FOgu9aEphFCjb+Bvs69K3Z6FPTnp4CxMdYjVshL99H/v/d8r/fDDX+uv9f+/Duen3zPe6ZU7+37pRvPb2j/7bvGOL4KH9PXJd0p3MruVHfYvR98rHVIFccf/E94t7+gZwU8+3/KuEKm7fgzv0eHxdP7588VmzS4uzo+fh3B0enErGiV5ETiDXwzb8fzi/kOMeVGWpTJLZjevnoXv6PTiWqpCcqnsav37jxpucR2WXdepsiwKzmVZotD99OrgOeimiwjESQnmJWrXw3d/AzgCZzgXggMbz3MrgF+8fhbbOV1ETVNgQimWyF1XL399E3ddkTJGCUmFji8OquHg0/vj5+hls2vVFRwRTAjC7nDtupoOUcoo8JFcFgjoli/++etvr+bz6fT08OjbUx0cbNJ8eo8UR0gghAmm7rCKRKkKbr6TJKGJIEHlrH3X/5cbrbLMCr27q9n8+Jvm4cH88tyIcDDzFGcUI1gYJ0HlUZ6LPM/NdzhDadhWbkhkoReUMRSMUjz8eHX+7QhPFsHvZ/0B6bDFaGIAEYtWKE9IgjYLAGnoBbaQEgTV8YdygbMIr8LIeX92enJ4dHQ0Gh0d7DTkp/cqeqef/vi+VJhCliU47YkEInoB2EZRamX6Z68m1mmAMGWWzXAauzdvrhaLxeVicXU13SHebUeWr/TBHXiaSbMNoDC3x4jQJN0ymQs2vHBs/oITSOhgFzJPklx26m53fNPrTrrjczi4Fb1Ihk8DCggffPCjoni70tSgbYANIAJjzKF+8kLJm/OdxXf6oZGW/+IMOMuQpam+Jehj9EJcl4EVWpQmiTm1+aQp+pNW81GtoECJvjD2BuejHeJxEfovf5xeqyCE3EvgTvAnBRwQUCoZ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",
          "idle3": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQQAAAEdCAMAAADdD+lrAAADAFBMVEVHcEzLxMcXHSYKDRIaICrIwcbGv8PHv8PJwcTKwsbxyqsPExmHhY7vyKoiHRsDBAXwyq0HCQ3vxqfGvsIHCxGEgosLDhUMEBnHwMTDvMCWkpoQDQwpJCEXExLBur4PFR8IBwcUEA4MCgkeGhi+t7yBfocOEBQTHCgaFxWalp19eoOKh5HwxKOfmqB5dn8RDxCkn6WppKoQDw+SjpW6tLkNGCYJEx+3sbazrbIdHBwiJy8WFRUGBgUGDhcbGhkxKyYFBQWuqK4XFRTp4eA+Ny8gISUVExIyLy1oTjBdSjYcGhl1WjtbQSYJCQlqUjt1cnpwbXVPPiwwJBhkRidCMB1HOCh3ZlnVv6ZVQzBUS0MNHS0SIzNvj6F5bWLjyrBqWk5qaG8PDg+OiY8fFg9kYWe/q5UdHB0eNUZPNx+agm1igJIVExMTERI4NDO/ookNDRALDA5NSkrCgmtGQ0IcGx82Mi8KCg1cWVsJCg0oQFJaWFseGxsRERKMaUkRDxBPTlA4ODhGREP58uzpxKQ9Ni/Ft6SYlJZTUFGHhIg+V2VdWVhOTE9jYWVIRkl5dnpCQETSiG1qZ2nSxbOZi3tUb36FgYBwbXJXVVs/NzBpZml3dXpkYF6Ri4hiYGVAMydlTjS0qZ6vrK0yKiKgnaCAeXRcSDG4qZhNOCJ5Xz/yy60YHinyzrHxy67Jw8fwy63xzbAlIB4kHh0PFRobIizyzK/EvcERFhwBAQESGCDOx8vNxskUGiQbIi4EBgonIh/Qys300LLEvsLTzM/LxckaHiUsJyQYHCIeIywcISjX0NIcJTHl29v107b32LsVIC72zq2Ni5Q5MSrh19j407Lc09UXGR4pKy9HPTR0Uy+AXjYlJin1y6iddUv23cKSbkOZbDyJZj0gKTRdVEyMYjTt07hpYlhOQzeKfnE6KhrMspfIkHjtwJ6peUbfw6fqza4oHRKJc2Kvm4SjlYPWuJt+YUKrfFd/dGviupuuoZAXLTyuj3Xj1MDTn4Hx4dApNz7eqYjJRuWuAAAA5HRSTlMA/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/hD+/hj+/v7+/v41/iEG/ir+Av5C/v7+X/7+/lH+/gv+/v7+/v7+/v7+/v7+/v7+/v7+cf7+/v7P/v7+/rWhdP7B0Vv+/uaK3/7u/qLwk/6D/v5E/v61/ui66f56z8WN1t3+tf3+/r/n6KLW74/U6uLh/u/n8KHL3djt//////////////////////////////////////////////////////////////////////////////7uw+R6AAAgAElEQVR42uyZPWvjzBbHr4qRNKBOGGZUTCUXtpEt2QbJ2BgrgRSBkHyEfcJ297ow3DTh4bkYgtdsXpYUyW72pViyrUsVUjNYqoSbYPSB7pmRvc9e7gdIsslh18pa25zfnP//nDP5xz9e4zVe4zVe4zWeVoxeEYxarVcKB73+K4TeuPc/EA4GL4/BzvXN9FcIw3H7xWlhPE9v+r980To5678wT+xdh7vR5S+FMNg/f9d/WQhOZ0mRzff/RrBzOf9++lIgjEaD9s7pTOVx5p4Ptwiml1fdeD5+Gc1i0OrvjC9mZmyaqls96x0ILP3JjxnjzDnbb70IMxyOT6++p6lmU9NpfPtzMm21J1+++mmeec7diyiE0XB8PaN5npiMEqdSOfvry8nJ1Xde5ClzrKvx8OC3R9Cefrn5nuRprCCCkVutfvzXP8/ndlGkaRY2Glf7v/2odNC7vLpf8niBMM6yWAEGb//9waJpyjm3rUr945/7OxDTaa/X/z0XioP90znL04VJqYmVjGdupV4/rNixAkiI1zAs4+O3z8ezmuM497P5zY/3k2n/99JGa3J9z4s00yIaRRrBPPYqFaNmJygCJihwQ5vSKOMpj2MOn/Agvju7eT/t/59AWv32cyyTg8m1l+agA10zRWiJ4hoPTkB0ymhkqoQocYLRAiF1CSzgT7Sky+Uii6k3vx7v9Prtg8HBQas9HE4nX25mp8+ljbaH7c0ZjnauQ2gHuqrpgkIUmUh1jZoPKgAGEKZJdIx1oppLAMDKsG2bURU4kPD49u7iFOLi7mpeC5KVN34elTDYf3d+Uu6D7ctZXsS6puk61nUCglBtxwoWPEGqCUnLYiBYUXSkqSYwgjoQX4tYqmihJCCQOAErlUJJC/ruGSyao1Fr52TeOd9rjUZiSbLXqaLLEMcNamCeR5NMWSA4eyoIaKYsAHgVLYGAIAGf8AShEJALwkAABKOZmoKCz/vPgEGrd3IXBMBgMBq09uY8x6IEdFJC0EyV2qZOCEIYEfE99T3XC4MuM8uIJAIZAoKqCtdA4BeUmbhbq1w+/Vli0J+czXP79o/2oDXc/zSD2dDUt4Ug9aCBO8LxEwSFLnrAQ8PyfDvS5LstBjPaQtBUVRVqwcTUNa9iXDx9MQyG44vva9o56w3a44tvbq5Ewve2EDCcqMgUdA8dAcy/Uzl2fKoJxxCxobANtQwN4YUCpuFbdeO29wxWg5M7VijO0V6rfzlzwlQxtTJDJNUgMMgOEWlY8x2jYgUqZAe5l/8Lql/2UE0VOFSBQfybCFOgMF4ZnyfPYCL465akPLDe9XqfamEI+enaz2MuiwFogEAQ8x6q1U6g8ARDyZsa0YiUikgfAnQgAKhCGDTSRae0DOPhavoMWuPeLU+TzKmMdz45QUgwKSGgksBGErqeEM9oNivhAixfL33i1yDyr6qqmz6h6SysPTQerJveM2Cwc8s54l3r9o8zN/QoUcECIMeSgXQGcDglhnWpedi07ESBusDbV78ggKIgsjGIMqB2WGsYRuOhcfEcbqL7F6BcRXE75x/csNalVEWQyrYvlE/YndKg0jyseggTrTSKUipkowRNMiFCHVAK1Hc7RgUQPHQq55Pp9KlfugxOUQrrkN2p/6fGOgGz2ZJICHgT4ocs5W613jy2E93U9O078SDCD8y/DUSUBAwVfhgGge93RQTB/dcvk6dcD6NJUBBTw0Gl6uGaR21b4YAA6ZskxQPB/lir1+s1xHWZL/4JaGOL4lssCwQwQH9Q5bQUiW5JMpib8zj4+n74dMUwW2eQiO40ndSrUWonqwJcoWyOIikwABIvLGDg8RSXQtnWwlYRQEDYRpKAX2Bd9Eeiiq1K7hhLqCy0iFM0e/9Eq2HwI+cIjpc+VFkXeh/lq10uZz59UwvgkhnpNOv1ME8zLEeH0iY2lVDapsZ8P5Dhd5mcG4U5yoiW8DOwSFL769PslZNuDsdu6rbhMquGF+nu7ioRDMSGAPkDBEjXOmwKBrA/4XJ12KqBIDEas8DpGFWolWqlYTluwLbrhGQAEMxyuaT+k/wFRfurrH2N+E63ZgQJ393dXSuE4LzAYvQjKIPc3cPDZpjybAtBwpHjNE4UBvMQAGjWKx3Hg4UKIpKjs2luIQga0RL2KWXpXJ1OpsN+u91utfrDaa/9+NeSo/cohkQR0VjXqVokWQOEQkFZsbvClOo8VvKChzAeeHGiZFD20id/QkiSriMIVBuWG8CWKWZNcepid8Jy0BaXLyAHQABuiQhKMhbez6/uLiCu5ve3Z+NHv5GczgpEhOx1JQDR4xwYrDhRCkBBmV6scxgl7erRoasoaREL8ZcMJIUkZk612awbtYBCSWCxTMjDh3FaTNlitRbbZyRHaVOWRqQS8Mg0zhaLOF8HH04eu2W0d07jVDrcIgHZdxgUwmq11lUwht2U0Xy9zhOid94c1fQkX+cwLshSKCkoXAkrzWa1E1JF6EQnUgKQqB14bs3qdDoW6MMWyZubV5E0B1MsVhmMoMHHvce+d2y//9TJE0VExpnR9HAOCFY5xSCKFWbxel0kFHtHbyw9LdZgEjhLSkWAcSqcQds0HF9PfqIRIzPzXQtmRaPRgKHZMDo1z2cwLMhRGkpCXsTJmwbFdr/tPbYhDCbXH2wuhZ7FaVCvMr5eAQXFjlfgjgQVq3XKNFZ/e4wLwYOZWV7EkgLRsCiD49AUKhAtAlQCDUUwCD0vDHxbjAi23RV9s6tqKpFXcktRESASlHEcWs2TR79tOvhx/jlZJBleYMxT502D5+sVJEvtFCCkCD5zShXrbVUDOGtu0xiwJIuYZwukMAv2iEXKFSSu3Mq5Sl6qidsnGKN/Lh66WCWW5WppykmSmkTJurWH6uXj38EPf3xw1XjNxTUYjytvXckADp/lq911Aua4Jkzx3xx1wSZXOaOiUNIFX61inPiVI/GbuDgTFw2onC7FDqmKIUK6Y1RerMgLFjj/5eYSUhXAEPSUh8bp48+Po+n1xy4rdmNGTcSjozfdYvVf5q3fxW0tC+8t9OOCOiGQXKiSCtnYI1kC+THBjDOQYmCw/wTvMG2KFI8HKd4SWCYhycsjRfbtC2+Lx9YqVdzbXCRVwo0xYv+ePedcezaw/ThicAZ7MsP9dH5833eOMBt4BCDsVCeGQ1cbtnc/BUyuB6NpAaHeACLRMlHGTgH8gXUd04YLHM0w6biWtqAw+I8gQIvQpnyAHgP3w0XiePn+O8AASsLbOGK7HY/sVqhiO+MDtobBDYP2AOeEizGxuo+pX3YGYDC0roRgMLpwuuoPQ9+RNhJEHKkomtQbyWJAP7L+xnck9hiG0Dim+cSZjN69/x7mURfvP6R4zy3ohG272HoK++OuxQ4mbdaBGBJKOtuyHXZ910EuHFrXGg7Cr5pC7IBBAMceIEOGjrojYqAFJikqoEfNo+96/LfIkhyaxn6fjz59B6bjfHk7f/lb4ULeW3hz22ybt4frQz8wnDKaUO47KURfbnMllag62e4OwgyYsgK/6Q7XA2SRRAh2ux6aI4KAPvuxHpL7bB4PjyxJ4wGdIx1NnP3Ie/sdGG63r98ub1/8q5JQAXlLINwnarjubWajawzagSN5UPtN1MIZKyaV6iDiLVCDobreiai0+gEaJ5YJlyw1Hz8+2lFosmBLOAaCZRI/aICg28Fiup/MPnwHO07LT1+fX918bUE2H1gPRLlNtynvD9J6tJkRhTZajzDlUUhCCaxAO5kBsAi1yAosEXD1zLXRecZIOJqOJ9/xm0iwqGS6OJljkpcjL/567li4unj1591fn92864EKDLy97pnItpmrejyFS10Ozs2Zmq6jtiMuyIlUVYZZi6EcpQFwSqiMyg9dzKLWh2iwLV93S5umVeQ3uTSSOkKCl4+/t17lE+/jm7M+LnB7+d5I/z6/eWjlYTcYrJe2XG0y22ZoMFs0ecKmL/14Dy0C7j+hQP0QBEPirFgLZbIXVhixYXe9G2R9DHqcVEJZBJJs0RsnEE6DKZ/GNDYLAIZPr+bz8zHG+Q+v++y35zcPKgCZ6DZQ11g5y4DjYEhb5mkGK1frlUJ/XYtGAAHodXTnlThtF51huSEDMIaWueiYoBLTIOAMG2dRGgTqGkSYiDShzeRyFmajT+/fXNw+O080PLt88+WQzX6ESIgUtMQa0zl0MpsGSDoSIAVMm+VjV6BSwHEcKE3Wte1q7BUCzUQUTYYlegWfA7WwQRcDyxDGo/Wou4T1zWySrqZpaGxrGyvn95eXF7dnAmF58zAsnA8/v1OFNYgAW7xVJ6vTUOmUDjKcjaTkj9IZFIZKZ04ktKkoCQXLgk9cHwkDcOtBdALNVhP3FgKXzHlbhwEO9zUGeLlBWLvZ1w8vzrUAebF88Wcf7te/xiyKmM5Ty1otOE0gfcskKWBzAdkgtYlmYMHzBRTKSSCgEXLS36gfodBVRjegBMcqIQSPFilRoglQommarUBP1lQNKB2ahr5QXdTcLx4+/3Lzw3J+AdfThsTF8mUpmulsO+FBFBDJgXOFpa0lkIXtAaKCydE4YvBmhV8QJFJMN06taDynUSCEGFYK4Ax9r4QLqmA8ns1maLk6wAzzEfoqZWg2xCh1eQA0GvRWTKMT/iJ594/f38L1pDT6ar78JayCwtt63K99Hepw/0OKXSpqVBSk6d0x7p+mLAY0zG0cKDTX9JDhfyAwtBd4mOXjzWaz9vIkXS3KIjpuchVFEQJlNI8O08mMJ6UZQGrg8lvYiC9PCsLF8nVlRu5qE3NmaM+wMvTgDb71XSR2UABEMUulaXJ94IoBs55FAsJfuweEAcIARRJ/IErW9/eb8d10EdpQNvlxz8cGUWlqkqDpknna76JX2nZD21H9+9VTpsPVs+VnVUMeZImrDJNMdEx7miqjGGzQGwdCkM1KVvvYF5AitNFmuxCAFD+6rMdA4KA3lYiSzf02ThZRYMuWlqBpgetIFEwtqPEFZNXjUOYRhaZqkideabpafhqsMPCNVdE3WSWPYxTk+z5tWjX4KtUornkNt5J4UtvF96myXZrGGIbOBoIBFEaUjNdxUkIEqH4gFwr6hr77roYBDt4E+PK45qd3IVFch35VTD8+9ZMzyz8Gy4XANpveGBXiBEJNKABvbnA/QXBvz2zTMF2okZ1qk/tc8Jp2Fo4ZgqEAmSGbLM+zwoak0NYUaCp0IYkkm+5psS/4JgmC03iOsDCjaf71+ZPLp4fB5aD+4P6qJBW2r9tglAUGjqNNBMFW0TiBeqEH8V1frmMuXOs0sX/EgLEiW4WYG7YN0hqahOIu1H1OHotv4q2Hgzf/DwF0ByQMbpQ6jvP+6gwg+PbhIKpKtJkXMkufK7zLOixn2M58Wy2gLsLRSE4pw5uBprZIZNq6HlI+SBalqSU4ri7hW4YbRgEHvgSl1iINQYEQ6CwIj0lQ08C69qHzRtl+7O2ffuv56vJh4EF76DuoftFsKiHeKcFHsYmA+OQnqHSdoW7AczOVbFLS1NzVPjKhJgUrpndJyOB/2BgUwLXDGjQ20CZOFAyVQqD3nvXyM81l0XdHu9EIynQfAwYfz/Ao3eVDz0M2tCAPWeVA39MyWZYbyA0bCgGCIJPZQiKHhBQRi7XDWilkGJ3WVAwuFc4hnaxCs8UnmYmRwCknmF5q9Wsq/7SuUgBziGhMWVXcxCnVdLR3vNiZfDzHJO7yDwDBFbYlLVNm21GrEASDcW/tKyiRmA6c5bNCopgw/C4Yr8tWtWKVFMdZAjbGInFiZ6HwmSAAgbIBQgF1M8S6q5ko1AQo/9HjBe9HqyyD8+cTPaSa7M+CwV/mX3oWhlZgtTLgwWxT9gLZjS0W96Ne4iQVQoTvxwtmUHWrks0UmHGTjFPQF7i7ArWgTLw4ngA26Dcg09K80ncx7oFzM8gG4qJ6Jx5rI9JEkwepF3tweprU7feTz+d5rHT+ue0CjEwmXb9LN57Z05aNaO+2ZY/bNhDsPB9nHKdHJlus79igVnezkS+PxSCawkm8vFA4r0eoLI0C7r3CL4ZcUczHcBFYXGlRQbdK+IMdhJCjB5WTfXyWBwCubuc/vO1UsyjdwLV9s2ucWW4oEgFDtY6N1kArQXX5eEpch8MPhAc+dcZ5IJFiS2Vke88bj6chbnNAIiFq/LF10uqWj5YDug4GWUm41AaqBHqiD6qJL/YxYOg58U//PAsGly9//vHXsu2yaWBAOwddtIrjEQcUpFEfVptcAN3jXStGcY5bNxZLN9MhGt05+0iari9atQChdP+3//wU8TAwJA7ZmVDHGIHqaWBJcIMym/6XmOsJbSO94sxBljWMirAQSEOZk3SYUUYZZQQjsyF40rCQQCud5OogyxXWQYc1LCEY3EMawjYm3SSkZpdmsykN6cVoPHORDqNDR545iUpYrcP6sPhi7DVisZGTog0phb73jWyvQzbtSfqQJY1lC97ve39+7883chc3PF6SRVWJYCGbNCoRONAkHO0R/vzxOApsM3cePnvyiG3ZqbhqOusQFCyHBRQiGCIUriVnRdvyUKZt8kKXA2WhUkIsqjLCwkLKDgc94A/l7FJ+P/eP25BJwB+a6xuptCrKUSvMwZskFhMYMcql2ZCQyc5nM5BYw0+sK6qpiFtswzDrhc8BhdizP02Pvvg+M/11ZOG3C7bt8N2o7TjOumMroVCsFLUgAia5qJBNtiwAweJB/YMRb11O8HxmKf/zzEuboiJiZmk3Vym/ySWcViSVluTYoJDL5X6dF9OiHIcvAj1npdSEB8NlNC2xMsvzUlKCcCCLqfCGiwIOPgfTYjzEyMyX927dmB5xgenKw18ov/smbYMqsBxOzXgcB2duGKVlO6lkSkoACrZp26LAg5OblIQ4s3SzkNs3/9lQSkv5YqW89583xUFSFFD6fuXtcblcKZR40H2I+nExvdFo+EBHHDLh5AVCIElq1OMDLsnhjILbosRmny+alEPxbiiR+WrEdOnSY6ulLpQalikyPAeCr4cbHuGbmwuC2nppy7czjJCVEIWkIE4GfSkmsbBdLP+lkLLE7NJ+pXxY7ey8upYvDPqV48XXh0eBtfZhPwc7yjBdPpnmsFW1TmYWcCwDq7heTklKaqoexsojYc1BQpyDEI7qMqoOkx3xtMbMAzD/KKuYNlcq8YrVshyfnby2W8wvyZ6/K/nc/kJmXmy1rCSwAgiUCzfzlaM/FgsH+7nV3lx7q0pv6m8rIP5dow2rSn+7ufirYq4Aa3AgWVidXsc5MMuG70Cp8cQQugsy6aykUkCYyAhX0AukQ5EhSCT+cGPU7vHTtMVxirJu2WopdjsjKsEgZR0UPjsubi+JVmnw2SB/+7bgvEwLkj3J3Nw+mO3s5f62WynPdTrtZi1A++lAcxNWtVo1An7/1NTdH17D6vUWi1mn4Q4+e6iWO+GDZSOsxjaoYFRJq7gUzuuDXAwr9WqXAd94a/R0afr3LQ8e4KSshpTZLl7fHQghXtw92Dla7OeXErtv/l0uXPvZUjQYV1PZ7d3yXnvzbmV11thqgtCGoQEKazTt9/sDAU0LwNUUDYhsdTo7cznepPCcBDkwB/uMGVPd5c9YhvFEEAcy0aSkuQh4TSaWePbg6hii5KXHLdsCJ1X3mBul3Ve9xePVg4NB/vrh1pbxejW3Peh0jnqV/aUQW9qvLB42QV7aaDfX4JVIHfAjAn6aDhAUAI+pKT9dq7Z3ygXOxFItFqbCZGoLdH9jwh1dIJkEcmqc5VIlUZJEOSHEHv1mPJ24+xvgATmiDMGD3NxOp23MHb7ufX9ham2rfTQ7a6zVmu29cmG+cBzY/BYkBBFrAT/Ze1hEC2h4pmkdr11AtGq7s3pANSZJTxvkrXuBQHlJJoW1FVJwJM2Ghm1PpiFm8iIPvDFz78Y42i8zYA/WSzRXzketXu+BoTe3QKEvXJiaokH8NoimVZudud5se3MKMRiKP9x91ATySgf0gIaXsAJGtTPXl02KlFLwVGTQa0NKPUmsgbQZyFhrMOybUKRSTEryuJBFfPVgHBnUxceOz2nZkWgwOii+9TeraOjo4KZQ0QO6FtAMTdOazU2y6bjTRGbyKbynXSxQJxCEAPmF0ezMFlTTPRuG+h/EritFirZhrzvgCzEylYTtzwisCADwLDx4SRUfPpgedXt65uInz826x8Nx4WT+uNPUwMcTpR4uV0A9QK/hFp9gQBO1958hoA8fOlzruma0O4uDsBXG8OcOJpCD1JHwuuP4kDIBpZbQEwqZTAwsgT1dwCfFlSfLn46UPc9cuvOF6UPS4lF3FztrRBY6cB4EjYiIIAROYCELUBhiAH+h6bp7pWkGkIa3hWSEwtPhwzq7d5KiwhOppCSREgowagYQSMRkHvXgDAQe78KR/PrKiEF48NzGBNdJ75fB66O0qO3+c+K6Cn/+0n8qv64HXFNwMQAQqu3XldyAjfqGeoCNaEhIgwofcvMoQcAzEYzMnyAguxiweC2x90drEBfv3Plr2MLWgpLrtbWhpD8yhXdlPwcDqL5eq9V07QQD+AWCoGlVfw9gSEJs5Mi9FTAuonVE03xcyM4nhg1alPsUAlcTAIPlEceIyx9N33regjTaIiCglfvJg/a/X3LtbM8BAV0HBGo17eQDnTAowpqaR2+LfQmIALLjOrnLAkQHqp5ku4mFhRi4wzPZT98BCBI/2pr7zMUr0x8vv6AsYHAW1++16SH7e5/iv7NwyxEEfK0hAJo2dAg1/BeIsL1/9SsFxQxvRAhf9k26Q92KWApl5uczpaHULHveJbBPR1tTuPzJ44cv1lsmpDk+a6Pfa77XF/x4GacYoCVo5Bm0QUMECCwAgqGjPU3RP1RyFdGd9UJjAO5EGrHhMKdI8QTAEGO6MnvmFGTyzDwdsS3M3Ocss7GObTLKlHOHtSELINHgg8agnYCg1fBdzdUFVARAgTgVUIWjxWK61SB3mwGW6KO8dXIjAa+Havi4NBvLZLOJUIw5VQa522VX7o+cOV/6wprgcAw/TMnFxSrtP0Xhw4tYArEGBAEwqLnoIAxuSoHf1C4XIjY5AjYxPD0PCJADs3hiqkFFIKVm5xNDELpxcJZPxnFUcvpFC1kMFwwmirPN/w8BYgyoACc6UCNuoTZEh2gLgtCc64u26XMPCrtlNHdaiQz0eSfNVsvLZxLYbujCDxPvrjwdT9vh/nMzgqM0QWW/Uq39pBm8iwHaPyQLKL/rFrShKmj60GD8WvN4MGk3IIE4me+ukySSpBNhjw9vq5GAWImVyFgoxMRXlsc03Dtz8WnSgZw2GjQH/b2mob1H4veCcGIMtVMQkDEZqAhDltk0+jGr1cAh8Yg7y0rGu92hBtLBxntQAHnEgmyoG1ueHtuZyJmPlkXOG4z4UsVXnSbx7P9bEdzYeAaF6yUJUzrBzDCa7V7hgLPqwJUiQfc4pNuybzi+ekrFyTYGrQCUAEuSzNPpK1fGNcj4y6ufy0kl7MS+m+1Uq4amBz4cHwgILlPUzy8A4FSTNARh5/AgJ4VVKR2NcuAL8WZTpul4IkqSjccgb4iTg4IhbEQycZld+fLZoxszYzKIq5+HSmJU/q68064aun4Kga7/tEuAPa/VDO1MJVy+fEon4X212e7sHRcFVVI5VebVFBaXFBUTKCYGbElgThbCEJd5SVq5N7YTspev3luJ8endVzttA0EgAPyXuauNbeo6w90Yarm1cWIwgyRAvtyBbUJCoIPxkUACHl0L7p9cucROasWKkolIiYWsVIps2Xg0i1i2OIOBypRpaJJl166qOyLoaK7IJm3ada+ZGZFqPBXrXqwEOYqdxrFjAnvPuTfhYx9/7ZPYSSQnyvv4ed7zvO8591zUI/lfKKwwIeB7gQ0oJQIKIoOwafJ6meD0ydje1zdvqJMoJVA7oY2dqhrdaVVNDV5+FDEASYTq1VcvvJPHq8H2fDi0c281AgExQZD4/9OD6AwoiBOjAA8qgH4KUKs5oQhbR4KZbuvY9p3X101uPlpiUtWcxgVkDSbBKghoqDqGzh3L5/UvjUfOXbr1j2o9BgH974gPPjE5/JfpokiIXxgIDT9yCcIv+nCjxY/8NfwBgl1si98Cq7BucuJvN/eXqE1gCEL1IZwFEAgrXFBLhk/k93r5Qyd+cWdiW63FHUWzA3wUoVr4ub7/s4BA0aInL/4MYPLAb9A0Q9OUx+cRa3CoH5xz/FFwhzdvTty5d29y/04T3uytFmNfpQLMkGfzisFrR349ubekXmF3R71+nxBWwP8yCC9Lg8JE8MKgaTyh+P0elmYgD3JGcn56flHqF0GQRxItMVPt3rXoypCJiZt763Hg4uXjLyhCEbp0LJ8YNPb+vi4kUSvsaY6V+lBouNlaJDRHhMbZy6zwiRBgEGg0wgAAaU7FW/gWQ9fStHylpyDXsIkWq8RUsqu2thY1EHDgaG+OBD+eJ0dF6EpeUdjTe+HKxxK1hedYD43fW5QJoBhE0se++JUcCUyA+L1eigIBBINBzujKxHn9o1hLPDk9n8ArDz4RBHm4R68yoREK4Sc1ng+wRVC+MEOAZ7yUz9tCoKPpD/ReHNYbwzgmtMBECMoPoOqgyPeyHHx+gQgUGw4zAEAqHdOWNfNuM4QfiURYykOgOVNYjpKz5jYJBG8yoWMk6mGaVGEEAA2VTqdc5QJCQXWhN88XSB48bxlJJJNm14iRY8KIEF6UHnCJ+MocgTSDUgBIIJnmbRa7hU+RHEMTco1GI5fiNQg/mhxQV8E7zdcdNSE3VKJut9i1Wq1Np5ag2VJXoxDFIeYHdcnVPJ/Yufvib8fMXWlDmz6WTrm4aBQY4cXdsuemSWigIWtIB6PREdCA1Rqz8W6Sg1f7pE6nE2OA1inw8gRqKtAkX3cHLbq36ywNsa6e5NzUcYuuvR0YERKygpAr0e411Ud5PlOlsfen7ihK75k5/d3mWOU+FU8AACAASURBVDwzkgsyXtQuEKtkIXw8d1LhaM4V5zva23k+bp7FEgoUSYEITgSCzy+06RASBG1s2TUxWb1LV7Ven5xFciPnvrTXKCXqVQzQ0XT1JaGr+VmJfDk/nriSAxmwFJEwGywWK29wu2ZxfhBbBCs9RMrHcEkeXgCvMCe84XAYa6dIrnGCGopAKTRF4KVbxAnaaNh1c8Prb3RU8GSY9YOZCHLuL20qgEG0CgiBEsmlj44VwoHn710cCWJZR1iOzKSB6lZD0sh4BIULRRN2SAzJl2lBNNOLjxefPUEDvIGTYCOsB1VNWElSEMYKCDsnt/yx2sIbWY2GCAcZKsy1fH1adVqFi4YalVKhunTh4oECOb/3wM+iHvljGBoWIiFTBqverjdzfgKTAFcMyCjTTIafS5KJxZmFf33zzcCDpZ55I4dGgnSZM6mU2x2Px3tgYiCQMhijoeTTDetKLNMs/F0vCRmUCLuabfWIBSCF9uHzvzlxoHDOND/0q5wXiPAYpL0IIzHf09XWrJ+mfdgl+0SbBFyYBW0/e/Djd0/NJeeNuWg0NwJGwRB7dPcvn1Xt2FpRWlo6ZY4ITPBDTqhf++naDoNUo2HJuP5kPOFlOYNdEhLUoBx+5U5a+R69riDFejx+53xPz9LCwMCDvpmZpXkEwmr/DJcVYKmcC++2jeWWcwnwiby+uWxHablsHA1ZeWmlbGuKkQvzBAZh82Sd3kwTtFn//sCDb7ukLJPR6kT3GLpWYLfO2v3JshH4nAGzkMsZp3u6BgYGlpy0n0BqwPGjvAhf/J7HC6mRkZRB31BVUSlD4ctksvLi8XJ7jE/bypsTYWETh5+gEi2mLdUdaY4JZppP9f2yr29hkWLIqY56tQBCzdnXCmv8fKytauuOqs8apmJp9xggQSYHupxe5ACRICiMA1p0ITyJMb6solwI//btjZs+/+JPD7ObStNjY/sNpTxHi2WX1JPgldUmvSsYdU2dmpnpgwEgGPU2EQS14lyBgXDkY758fIXVVXf1htS2kaV5isA9VJQOhHU4f5FH6r5bjl+25s19X2WznWj0939VyWcyGX5HiqEEEAgpkWirqbW5IXHEMAYzzxYJMA9tKyBI1EMFdqeHQ9dHpmRai70CuI1IXlnRwKcSHgJVkmIXRaiS2YT7kaxSa6+8AaGjIaCQLbb+sPqN9maSFTa0gIEiyFhNR8wYDLpP9mEePGMjcgpACKnx7CAJXSu0g5x7XfEK69iYpfy7D3+w/XDxbdm4bH1XwEMIOQExwYfaj0SEy2jLDPtTW/dhCLL7zmAQOjd2NDma2lukEbyXB5VQBGmzWsxh1hhreTKDqaCJaCIghxB2SvBQnSuwI/53fzJyd2rMZS0+A+9tNnvmg++Pj8eMNIpdIIIvgAtENmFIu1yuzPrtQIL+zs9lm7IYhDUAwj1DDyHHe/ngSU657PYUo5HPtrwPcw2ggEBgySmrWrDMCqUk/8fvvZoa76Qb9t+Jv/VBp0DwzsPjDa4gbqL5itD0iNMdQThJLkhO3LK8jUEoHr/dOYjGmzoAwezEe/2E3W60WRvnCKfGQz76iQCCPKIJZxraJUoRBYX62tnCukXQkd+5pmodW8reRkTYt72z/8xbliRamgoIxZPYdYPcRtPLDkfHYQh+dPR748WD3d3drd1/Vjocy0Ua+erOLyJApoxeudNJcOmTCISZJ3QkwqS1KoUSLb/gHpNy6J2C8gqN15fjaUeT5TBk/GyxLNuf/acpx3hxB1ZcYsL9kiI/5QUQ6m+g4LsHb/xoFIEwenynw8HJn2MAtWSADoAqnMTs3LcYhESYDZNTNoVCZRseGrp8+fLw8PkPjx0pJEU09o4Y5+45dGvgHe7fOJ4dHPyifZlBGdEv7FNBLkGYMSmmybHl/mArQmEUYQBg3K8GIryAAd7oir+j5hf6kBgWgzQTjX+tAxDOHzuIx573Gg8VVm48+IcomXOMHR+EwJ6W97e29ttyDG4zBsTFOdE+g3VcdjRZn4IIBARaW7uf2pocnBSDIF/d+C0QYnEGuUXAgPFGXVqbRKnWnS3YG78cus5RAcff9Z2jwO7+0dbWQQBhda0ZCOETfROgwDkcdcdHW1EyaEVj9H6tIyqELxU0sQqCHHuEJ06G9kZzejtYhFBHAd8BqJeMPI466v86isJCFLcACEKDFW/dFEtJvNwUdDR13EcACCA8tP2bunOLaePM4riFefLseBhr8DyAZWoLjAiiEpJHCmSwF0EM2CHBNtcuJFtC5ahpc6Fdst0mkNA8JLtSolRZrZQ2K0UVFcWyswRhJHDkh8B2kQ3LIsDmZi7m1oAJpGyiJo32fDM2Ni/7zBwJYSHx8P18vnP5vv+ZuTcny+Z14DyEiChS1o6/evsWasVOSefcmxVdzofpyf9uKTy8EPI7Rp+33/hP6y0ewu9uLb3xxMRr6Hot6gkOh8R741+teRwu8IO8lNMvZxAD3uIhcGgk8Evie3N28syH6enJRw4zhBP3R58/D934bVtkbe/WQpwcyRHm2wE7Khv521d7p6zr19dS7B0qEZqndVUbsucHIOzLY9vb0UHFc2BQ3TJ55gh6zPdvzhzmF2J958jOxud+/XqSo3Cr7aYHT8IjTSFXOfMUOMGSRCbZ2q0/XVu7dPrF7ksch4XGQYjTCMvauROr0OvmyVNH0MOXctJPfq4/vBAe4DMyvMu7Mwbf8B/fte2G9hW+3LkKcgV0R8drt6A58HjCDVsNYadTAt92dnvMDyJjITje5fFA/yHpTNqoNzRnHUlHc7Ins7L+fHhf96G/HZ5Bq27fqV9aqlprcsjweAW7nXME7uTd4eAnYHrQnVwnd0bbzoXFmB/g6BaqKxwOhbrC1Tv1bYaz6ek5Weix/zlZyWfKDq8r3G4YxbnFSdqh2pXIYhA4SQ7aDrA1nDHVZiQlytplaGooO7oX+PQoy/ZUVy1V1devrOoMLTnpyWcf3oEy8Vuwv1w6vBAuAQS0quzsmZkZPMbAzssUUf/gRNnSHhkFkfANYywWyLhSgd8LMugYl9TNYK2tZ3JQQLxTlltQUMBViof4LXnXGzzckrIjN4tRlbuD1/Ly3rB/OymJcwVZezQ1cn4AVQUu81QvKVr4u7bkrJyTWTl/4w+S9KJDHBZF+oKGcQkejW6R+M7Lljl1FiqS7PbYPbUE50Hh+84QgWDvcSb1+KprFa3IAVDjjF7/cOpzQbxxOf9eDEK8Wit6GcnJl2MUIgOSnEvIZLhsf3oK0ql37ubUREsy/wKYZCCRlS4MCPr3O7wSPL7a4RE4eOkKNxZmT4qoWOIGZCQ4fqCFBgq+udeGtLazLS0tZ09lZbUWN59Kh95RCO9FgxbK1xm3F/aDIiqU7PyROz8tGR2RckQHIvlwGI0STt+bNakrLSNFpUrJUBvailVXPrvz7V+/EAQE0aV7nmxZtix+CiYy5GQ/sCMOKljwuOlZ5BRdvptLKURaGoEMHc4TVy5+ebzscB2f/J/T1vshSTbnCeGk8D4EXrpk52/iuFR5UMDCnSpGakT4Z09od4wg0lQqEoxyoxsa1YVCYQDg7GiHTxILivsTokk9SK/m4YZoHUlxCYL/hEfjAzDoDDWdfmpuBAppJEVRLOUmM9TmC/kiAdn1Dh93feKIn4VDdym40+vzehySpLhuIik65xHtl6Cd2FobbDT5twlSLKfBeqXmdavN9uUxIUHQX++Y83Vxa8PD0STY+fLci3O//LKzEe7ixl4OgEjaH5yWdHoadppTtm22RpICAJjabDVZLCaT6WGhSFh29P69Oa89+qAEnFvcq51PNzZ2zr34FM3WOw6kjsggPaTFcV/49VKmK61RQVIsK88024CAxWSzmv907ZjAIIhO3O4I+Xr2QwP3CA2P19vlDG9tOSNzsPGDEdxUaZfP17CzpCZchFgOBBRSK0JgqtRJe2lWWBEheg/zoKPBOxo3IOf0eJw9ks5RT+x+musoIsFQ4vGFqr9uzgQEJESCCV3EBVKHlAyya3oBQhDpjz7o2PIidV5U3d7lhFoSd8Sup7nhaG4rzIx6G5rqx1KQVoOisMEa//Ky32R9jNEcAUZ7pUwkUCu4/U21z+dFY6MSbu0Obp4hth/4s3fPuCe8sbaqVhEoIVKK9ZLlYHC5xDohp1iaoREH5cV8kWAt9/b9ppBvfFTS6UjinymE84fuXHkEW8QLkBo2ztWmprgplmHoDGmlfzm4HCjV9bJQIdC8Mcz5YyIBW+6lL75p2nKOe71I6Iv2A9ciIp/oHEca96Y1IECQLKPVaovHkBMslE9N9jMMRrMAgZWLWZahfy9kBiK9/v3C87X1O0jBjB6zhRYPeWJ83OMJb23sVq2mms2EuxsIDOlKA8Hg/M+lhsSROq1S2YsgsOAPFD3xh0KRwK3g/GeNmYaltdc3G0IhLySJcLgBDXmsrA4+1lUY94wquUabUOQPghMYp/I0dSMjmn6lEnkCWIY61Wr7KF/YCPRHPzaZzNAGZQwNTq3Ur62t1a9wys2nupryq5fv3p1dJ2htf/nmJuyDogQtIBhIjDCgoV60Ifs4V9gMyj4ymda5VMdSgCIlRaWCBtlcfnXvMhC4u2eBRqlbWzy/OV+uU7JM3QcDIwMjfQhBhhQqZpt1W/HeewKHUPC9ySZlUZZDxtAEAc2xi6i4fBchuFy+TVKkm2EMs5ulGoYZHCsGBAMaJcNiOgtUCuZGFeGmyIsFgoaQ/73FhgEDmoOgpAkSo8WEq3EWQbhqJik5TQGEqc1gm5YpMi7U9I8Mj2iZvrGSgB81UVya7L5yXNgx4bjJjyjA+pUYhokJsRKTQ21sAgblCoqGv1GkVlm6OT+pnfZbS0z9Ix/UJYz5OQSQNzUaJQ1ltMD3w7FrFr+VRrsBw2iMIjIg5LldKoCwp6YgESIIzIRxMzBcN+23lKbCuouMywGbws0qNSOJGk1/H8QHobtC7ld+/yCLXAGMAk9Q0m5V+R5AyGQBTHe3mGT+EQiWj9RpKi2pLDNYElw2qUmSni6qrKgwTE4/m8AmlBeEHRVEhY/8lgkUFsDcLhIgkKs//XT57Z6Cwmga65W72cGFYE1d3YhGyyRULAT9Zjnbm1phDEAXVVk8hGVIK2oGrwm6cNbnXrD5KzFgADHQ5SLlSlpc9ertq41Vkjs96wYIRQsLRXVgmqKfZwPWDJZ5VhFATdT6U2lC4o8JfVKT8aGwi8bCiwqT38yycrk8DWn75Rg1tfHqZW0ai5HAASDIS+cXDMBg0jg7a8mkWM1AsSkQ9OukNr8pb3ExLy9homLhKyHHxhPn11MUFpMCkqEcXSHAuqnUDd+LFAqCg0uMZZAuhTEY+FH7ZHV+M7BOkszA4vCT6cpK9dBgTXCzJg8gLA4/swQ+0QsXQtkjayOxXWIVIwgE4QaHINVN1WMUtEhiUkwCmMcLwfIhg3E2aMqkKOXA8PBw3rQUS0hI0OiWg2PDi2DD08a/Czc2HjufaX1MEtYSqRxVCeI0OSRK9e5/MW1/X28v+ALhdo/NB/2lC/Ml29AyKhMTf0j8ZzHW9yQxQaOpKwqWAhREocj4iWAhHH2kXn9Ku1OgcMRIN/zIoWKYWDEoNf1Awe1yA4iK4PzCvH9d5abEyh/AARInxP2Lw1Aj/I9a82lxG0nDOKjqJkhRYOyD01jthVLfBgbcsMrOuAnSSBr3GtzdBqd9Cg0hEJbdQwJ7SJY55HPsYWEJ+JSxQBZI3pO6Suhg8EFqywT/wdD0oSGXvuQS9i1nw34G1cnIvtRPTz3v875lPDMeXJzboI00ct//UFZHeNv7ePaf4yr5fPoIfDAIGA3CUD1gykgJ2ZQwHtea59BEnx4SilAgGSgZDeDVz7AtUqPr2t2irUdRZH74Y0kh/OL2D+7uIBY2Ly7YtBrwGLEYI+Irik/pmCejENUhL95p0zGrhlgyCCsqHIDUcFdmlDqbbs89jUdRtOyVc9p68uTfzu/q2QWrsunV3cG0FigGR1xUUBwgqiaGEKE/PXhwriZkHDAlFRj0UWVYusDtat0RXrGeB0vnsY49b17Sufsbp90Ijo4Q9M/aQZ3UGtgwuJpR1afAAhiITJ2Qz0d0qjGE1Ix7mBGkeBJCt2sWtv3JbTQs51rHIhKv/lxKV/wwbzV8eMNKMO/XiVbzYdtGhgilapwIkSSxj8jnu3bOM3+cZQd1D2skwBFEpC83ptEZdFfL40Z7YI2EiLwXZcxLJ385TVoNxLbbme5+OptozMcYG0solVkMK0kSPqbNxWa5zwLbrxaLQqJiT0Tw4Euadjef3NZx1m4rnhDYe13GpPDje8fGvobSdBS6n+4mGvIVgGBRlXP+fwjFank5S2ew71gVjOKINxRJZTh079fLY7PPw8QTHvZwGfuHX1+c97BPKL51//AMlEBZpiQY9mldWxICYODjabN4Z1zOvHmebjMW00YaIB8OxI0pIXRbunPOeQIKwp5SwqnCyT9en891lRDl4dNHd3UGjYKiwM4pstqWsocQc39aL97ll/rtfUdEY6RSHRhAiBisB8Nh5/7m8jI57XNFQojKCOEpCIE3aoTEzuJRd/WZsABj2Dxl/FEcf4dADwHCLO7eF9aINetaTYUdh+2Nawzz1adcny2LXigheBEv30XUk/edgaVkalPDuYU7myuiyYYgzjTV+ij94JsnTA837/JUmEU/TprNJqkqUTRqmaCO4e19V9G9xW6p470S/NJNVk7ePHP7GMdQ90SKjYfigFI0gkjoE7D7BCdyxWM6vZIQtsLiIqGTPYMIJ+bKvJwV67ylmOteC4u9J6h/LVtw/vmF3XEgFsRNZGzTfLOo13yEMiVWtcyy4AuRcHgwRlcrgGAYSSJiMkEKyH5md246C91eD1ptZ3eqQEjwQAge+3vZMuNzu9OxhWFYewj26rxZC2M29YWv8RjCYpIxBO0Tr0olRDI9GvFkqggvSqNB1zPX/cVu3tvt+voIwmLkgT6qasky48+vHrpLCMmGcciMbWSvXpJqJhJGM0ZjEIGKkA8sEs4khJFUxjYjfrpfrqvjTrHeFbuB0CEnwQmB/DRCjXJlxpPn/YWlw9s1jIO6YWBzdQcxEVwgQxrNfFRhWSIjdMzZQfFuqcvPBkXRNk2NNDI7y5a5Xj+4dg8aSbGnEKUhDV/8XC5HcPvgZ3JrmYRws/kMSkggHsUaoVUQgTQFsAHOoEReh4kwthkdQU400lS3nH5jsL6NZvpiYUQyMXuRUFSqvC5TZvzTm5vdIpbxUBi8KbZ4UBwSxiUEizYtQCMRyBKZsXpn1dY9YxtPA4lA4OS63e/NNx398tLeLdJob4uewirQVZQpKfz6z+vThaXAqwbbb8Ypdhf1KZNR2YrpkZ3vG0gLmGSZWl+s5rM08aeVdIuTOLx2nNN+b7O29Xyw29mzPQOMGaVK5JXoz0s/vrdD63r0DQJuZqnonmsSgsItTjPbljKQREAJ46ZzfzucjSck8EAnidUprhuhe98ZLIrCyaNvQsCcUh+MoTzOePKLaWyNyAsYh6NuID/NOy81SMsKz7IMIBjfGMgGKgvo6X338rIxQbFkhu135vHxfF3Yi51teJEcvHieh9FUHUGdfF2auPTkRb7NDegAKA287RapQ3tzQRA00LFlAQTrOwM4HFmA+g9fh8OqLJzgB8p8c31sFWtTN4u2Ls1jn5gzrVoLZaUsTQ/1xsxTJVCZGlSpqoxQdWjuzghVoV+yci53+x1CHIec/f71y7CBku3+aWh1+q3B/e1sZu/61vwbA4wRrVZCgaPobUky49MPvXnQ8BnVVF2lqIHozN1dEUKhPsZWVhG58b+5UhLzQNXQ19+SSrzljPk8Do77XXPVHQ5zZ7c0B5JBouBAq1RUyIyeePVDSVyx/fjiTP75TA11XdVohYSd4pAiQqFHEhyJ3NpDkGNWRDVSv+0doJjR8Ri0wzPeWW9yw93t5nqvP8L7KTyd0NoIXCZKSzJie/ovtXb3uBEqit46Pm6oUzI52pw3K4FKaQaxASVWzKUQYkjQlDLUPLsiFNEK87PAWjjcuS/cTtF7HLbnlrJfKiHgCGnkidQoxeXDydujnxQjwhZ4IKPyJp5MzlbgiwEWKlUFr0gIPBizep35vj+mkwn1E5GmntIInQc7NHvOoteOl6e9GEgqUFe1CWqE8APIzmkp4tKTv/2kp15u9nq9l3ePjjRSpeRic0ZqgbxzQIhVQAFoOoWK6XlpyKYTeUzEftwc2Q/27Oa31rJtnS8K53G418GIEdpoKGm0h1CKuPS81vLyee/2xjTnsC6uNEI+n18BhAS6KZHRKdUgMwSKvGZKfULGPAiVGI47NE83RT58ZrbaznLZ61v/pe56Xts40zCM5pShmo4RmsNomJEE0hwMgQUJdjbKmDCyRpVrkCzZskXWFOMik64TSLcsJC0G7/4Fe9lTD7mUamFrVsEaGI3IwfqBiGWE0eiHXfmHuopKnNhJDC17KH2/kZPN/gfTD3Txyd8zz/u8z/N9mldjDHCN1DmOy9WLZoz6Ldil63e1SDwVMQxDFHu9ntFM2fnCSpbRObVmhkof6SNalZ0aJOSTmk93Ynl0CavV2m2jnpGPNzKZxpI8KAfhbxhSRTxvA0HgNBzFaVi/Bbs0/UCODeSqaIhGD2AQa2Fpi1xJevRtBAIsGxMOm72hDqywVU7qeTyXw7Th2dnlrBxRZFE05E6nElJ30OlqDs9rugOIgBXHgbpYt75dun6nHZWj6V4P9o/IINawmos5H/EkzZnxGaeYMLp5Qb1S/ze6Y6kCCFqvfykPL49ikYgyGBwp4YBKmMfseB53kFyA44oAFjpdwvPWt0vTyqy4NEyHwz1UC4AEbHvHt7JC6jSx3dqpiVWe6YXBPdcIUlfH38QR5Uiu3Y+AR5a7g7gcH8q4HxwSZobHKkHaNKgGc/+QIfD6XavbpRv/iEXwtiLVgAqwgAvo4UObh+SAokOlUuFtvV5YrNlIW64+/iLOsH88q0TR6YPYjA0iS5kMlD/aMTpdxXSK05As5vGrZXm79LtPDWN2VqqYTEC6ICI1U8mCThA0Vq2hnm+rhKsqpXPmHqElnMSizXR3kPJj6a6MKQMxU4dumDfDYxVU0alyiAhvQcjhVheFm1+cLM5KHNAdnaoDF+oN+L8xvsAThFMFiuMVnhBFgvEFGjl49rm8URdjbTwvDmNRpZvCA+FjpVGsXq26qJIIPprDi/g7EKwuCh/1NoadTqQWru2EDbndbssR3O/P2SA9+ZzEDmr6fEtsJWIxuaaBDejNdjtx2djYqDfSRwMpEAhwqYFholAED3mSp8Bx0rTTyWH5t1SwvCh8tdGei18OYXft2JeHh4d9KPfmjp9GQ4x5Wwu6XotvYYLS7/dj8o6qtvvD7pHSNBZjsVhaARD8gXA35QcNrCIM6gTpuHotkNDwKxTyFncKN+6055I7942d9PFhvzOTTSazM53YTBkMEusBNhAVXKVaFff5ynn8uK+Eg3LUaKeVrhI9O0sHJaWM3orrxgPgDiArndRViqI5BIAGdFCvUChaXBRuPprLtoKq1D3qJFc8PCySZxJzyjlJQGBgQB9pgt9uodnWpFfpX0qBRsZQUvHBUWw2rgWi3bjUiw+aAWwsmZpDpzm0fWQpVTCNYxDylr6HmrqVjQMG8UEn4SEp1mu3ez2FAumemWF8FUFoUYwXCMFTvI9l+IIn1f9SXsoMu810WukYVdxvACkGgxm/H8uBSc75aeQVgQhmgkCSaFZDsW7t24fpUTiIKUczTIFkS1LZVSrZGd7Ns/FzpiW0CM/ixbKL5AWXy+v1MgU+eXi4sSSnUko8osQbDdyoNww5AkIK282pGkchv0zT2hiDqwUg5KycJKceagE8dpSEp2yXpPKWl2UFlmcFz8o5A0RgSmtrQ4F1SZGIi2XtbpJMnfWNoNZup4fNTrNRhwTV8AMPsFxOpbcJyrRJNIfl3rJgDEIx/7l1T1Y+vnVvKTN7lCRJN9Cg5PVK7dPTxZJHYD28RyBaTPtZk/eWYUlhlmHtAsXHz2KtUC86e2nEu7II7rGOTBGmEU7aqet0AL06peLv0QB98rh216J5eur6n7+ml6IIA6EMLCif/n31p83NzfU2T5EFD8vu+KRmRNiCKnFtuZYvmoAC6VEO08GgeP9yA1cGUfNGuprHVTAGFEmiYuAI4q0gjlEwOwSGWfR86cafvrE75MMZnvRKEuxy/eXeweTzyYP9NYb1kjzrq1Ce5b8ts64ykOTZy731Jgu6sHLZbwaXMr+cZCKDNPoue7V4hQHP+IIIA0BBzeH4+xWBYzlrvj099dG9cMgX67hJQSp75dc/PL02af4Y0MGFe/6VRPqgY56++H61LCAQLvYO9v5bAhTIUT8WhsiUyVTjBsoKeQwev1MveEbJkR15RZqAPyCn9B4IQAVLeoU/3F1aCiW6iYLH5RIWV3effDCxiebLPj9YLy9vzqMBYvcXnj5+fMFulV1e6dXe3rULr9fu8Sj9eCOTqTf8UjOsYaCEGudELnuUHY0SzhAkh21AQcUQFd6TRwveP9y4+TC4FHAks3yBLQmnC/vfmvOWzSm7E/OJ9TWGJKXVJ9cmD35aZMtll9Be/WBzvSnYWTJxfCmaTaHWhCcf1PyqTacIjiakhJC0cxjCBS3s/6jQeGAtrzD18e+nP/v0QQX6+sq5h2TZxYX98cDZzU1UEZPrqbXbDOl+9nQXKuRgHXhQdtmH88N2c8sr8Hy0LwegL2pcacSGVI0Gq6z5K5pakdznCdU8aFSROKjvg4BbyisAAg+/UTrdjjITT/AsS/Lyj3to5uzE+APauLmcspNkc+H7N2+QUkJBSJLk2rKXI2VBYAqJY0UNQFMM2bPeIEHpuhOksIJh4dT5SrICIFTrxZy6DSj8zzIBHl9YJ0Zdn/7r17H+XHI0MhNH1wAAFNtJREFUSmbnsoybLXhf700+fzdzdfNfE5MHa26SIpd33yyvH4BGvDhly+CXIlIEFJR1k55O147GhoTsSSGkkzpFUTrl3NbC8bksKgcAARonxpkovAvUeOUrqySIqVt3HsVQUkAj8xiG5D38f14eTI5ZMDnx7YvbPz852FvfoijPxQ/z82iK78T+wlBAIAAG5RILRirbKTkczhC9lXDoFA1K6KR0kEabkJorbQMIxbp5SAdFoWq5dzBg9z6ZtsZB29Qnj2JZBr3y6XA4dPTrVt6f9yfezet9/HL59I/7+28kAOH2evTH/Uk0aG53tWmPQEVIZaCC10cmZhKhEB0MCm49xKlmXHA6bZA0PYkRS1fwqmj6yDy6mtXQ/YPpG4t/uff5XUuo4/XPZiApQDC0QUN3IhgiC0/NOWJocPPEh7uv5FUTBBvfXJx/uXftw+/++d2T3dflEkAAy2VnKfJ8LgkQOKmV0ciuQlsACJxOFfNB3mZ+Ze7qQqPIsjBU1ZMXqy1oqh6qiq4fqO4HYUDIQhLHlqAxSWcDidHVlTGEYDAkaB7CIETnZXbfF3yfh33bcmErNlQKqrvIw3RaCpMhhPYHM250XNFFN3FNGAxC5pxT1e2M7MK6JMveNulOqO54v/rOd75z761bpiEpHK70pJHnejIbQwVEzF1j+ZnR/4NM2TW9YQAEEhKBx2tf57XfL/350AFgwo+XDv7p4N2LT784eHjHzjpSxpxYWH098fLurUMLSzdFsM81sM+ehZN0w7/6HCzixuX+/jMe7hlBo4rlkM8YL4ZFNauEArgooS7QxIWATAAQBIcP3crU/yQkjh458tm/GdnsHJ1mjgQ+CCMZT6AiZ/R/fn/rEBjmR29H3iwtLC1NnNm5MijJDp8pvFlduHn29dLCwqG7z86iZ5qLNFtVrY3+IYlExRy6fLq/6Cus0fADrlwXfMnsXx84I2blhhDTulYafITyAqeifImFbnl8/zd1P943NT4+ef1f3WUIIGiEkM9Z1pAcH4LZBxSyxt+e3T145e2BR7cmzv/m+0M/vu8dKqp4arPm5l/ejlxauvvsIt4P67wOdZRtWroGbiDZdg2QUIf6SwMnFb/RyAV4xjle7V9bLw1ns8ztoDVcaRlF8SDJCqAw+9V+h0T3tG17UPuOd3/8l/quBkEID+g8cxw0+EHOkeVqdGnpH5tnX3+3enFk5O3uH3a3DIPBIYoiiTdvjlxcvfVm8+tHh797eaIgmkAiS4WMUpV4bAjDxtb2lsZCHJ3HHiMKPf2lYZlXuI4OYEOzpC4Lcdnh8QqRcmVqX6upo6Oztq2rphhp2kfB1zUTJM33mQ8NwYDKB/rx/OXq25HNg6sHrgyW/v5++4UBNMlR4otWRr4+/L53B/LG6svnhoGbL5Ke8Dw9wxOg0LNeKuZjOO9lUkPF7H/wcODbgDmNOq53bbVKvCgzkAt4sZ/XQRwfhdpf00TVKnhRbbzrFxOvQQuEBAP4Ajx4qWrc33n0cmBzd3d30x7s3QAD6KPtdRyoj7WJ3U0A4vDCmxPWPG2mgEIiZwkBnkJi3uxd27q3HHckJ71SUfTTf+0VloXAwUtqfw6CwJIhlzge379c2TUTeZ4XaWBptI9Q6L4mSXIQhikIuaDBHB+9LRodcWCi1zy3vXYGMkc1CyDkFB5XZkhSxu4FNoB9KtJ9JSmxUONx4IAhGpn5sa3tUn2ZJh9dV4grn+sPetuW45hjzuLPxhUqcSWUoaIAlYzj6f26rfSvpyJvDh6eB3SIICQ+LLQ/dpW47C9iFCAHgBIO0B5Cg8hggnnUzSR3yoxJlglNpaH2zNjZnZ1zGTIXoCEyHA6FMyBw2ycmAQpDN7YHQBIAAhxyrQj8Rs9K24U4FnwZNMBNS4hyvc4xqrHxOpEvr3e3H9mHPHFsxpvDJkIq0wue6EWTqQK1T+o6qprhNBImQEpr+DyPEZHzFRmIDZ1LKc6D+dNtG0CMbAtvqGmNjRnzVYfkhCFwcKiTRFUOXmczmeG17edt7p10qL3i8kM9g/XlC3FHA12U6zYnILDODtMRaOfazPj1vs69xqFv1hOpzXmabdkioDBFOaLrqohOB8pgw0niAbUh52R4IEYuCBTaNgfPMjbMfKZpWaod1Wo6br4GNMjmwjDn38YYQALIEu8jpSDIUReM/u21U224ZouMYuxKQ+tb9ztAKDiFZ1xr1DUMExAQhaAqh248fn2P7xnY7c2J8A86D7qgqgBGNIcX5bVPFgo25AtNV0WziQL2wDD8ELUSUiVhQC07b9n4KQXL0COtaGcyvIHrLhA3AgEDIWA8z3wKJwVQmDdL2zfuhCkIZbQELx4/Lt3HpSoBkCFlgot/LExTZlkxlBwueRi/vpf3XB8FNSAuQEREtlFASsyOtndP2sBr1fa8mlgsqqyBLCBqy0gFYoXThEBRqoYY4Yd4UUG1tVpRNEAD8D+PxyUgQEyApICAEiByFtLI0Np2b1uea006hdblrZ6Hgy7GAJKhjKZRCOF9XHMo3mUywzVurjs72Xd0D0FImEB9MPUI1EG89uVsQVVtSJv2iacjUAYm6kggMElKcmXAZD7BgPEZ3SMcIb2IqlgrAhfmedANMFh+SgVKLwFTkpegLYpknMOA+DCWVMmZPQODYCBQKHOyvFiP4wSF5kC8K7ghjcLh3E19ao+cw/FuZAKwAAggipEnFjX42VajWmSakafbI188XTF1i18MyTHhJnsSiSTIZIqCAonBw6iCb55WK8Cbi0VzHm/cAIJCibHZ9SCXssJXeFmp6uAc7+Q/gFBhYw9KpRN5l+Ig5wQCTlJQUVlOimtXKHM4a+tyXF6ozHy1N9rQHREInjhHbqFWjCJQAr2g1SKUiYJdxALIQiHAXmAPsgxBoJ94rK6ZbIDFoDSLmbZmwptrc1h8Q9EAIlnlWyDgexx2m+FbsRKjgHDLH1Dgxx6u13KULsAn+YyL4zKZykpzLU+5gnxAJghl0IbuziOdx9rbu/qgdbW3H+v8b6Sia9ZrtghAQFZjTJuARYRKZ5hQVeiWgSqXYMBkJ82YwHNIDAoUV6JGjou+YUCA5dAzlqcVV07ZgAZZhBQFhtSAZ2ARVGKnX62ttCUjinT6uerGD+dybRAOAMKTekPx00V+5XpzQRMKp5uqKSAyfXV6ZnYW96344zfYJkfbP7nWap+NUggi/BJNG4UtUiE0SC91A0JctCwrSIwjdIA5CQYICSRIWYFoALNJ0TCHpsvUARTRMuwiji1Fxvx8yyihGlSh1sJYQiqMPXy1hZeKu0JqDHLGi4fnvs1TGR0/AQPZXOrYAgFXNhEIlFfguCe0QxPKR73j1In7xZnJ0U8rto53zkQtBDASTLMAmT5SCxEppidaOIVgWgZbDFoBwdKEySCyAQY45wkLUjrZKmRXoIJqeitFTBXAhWY0QJOyCEJAqTUz/PjVQD7fAoFzWWaoVDpzcrmC65lwCDpMyupyuemmUSATh0XrX8llVCodqKF5+KiOJ+8ufGIG/WwcmBy1GnaAyFxodkpXIcIh/ztJDYEQgOZTnwADnnqieifhQWDSh6m6DvAZVsEsiJ4WmYauMrTeSaJ0JF9xFkMFZbVq9b5au08ZglCAzgE9BtdLp3DrqbieXA5CS55bY9AuF9JqhnpHBVw3l8+TgAAXKnQwZNj43bsLk58Aw/GphAmkhxqIAp1FT0y0PsJf2JqGG9EnSZ8uXpCIDCwxiwRCGlHRSaSUpmPnkQo6lBd2URM1m6cxCXxf4IMo8AHHkETZzNiN7Rv32tJ5BtqLy8lIxfXHg3eEmKIfeywgHotoF7gQwlGms0ALfE4OD6/gqPY9KEjdPOQMVMx8/rcX4m9+95/fRac7xUBLcVChA5TukOHwixqkykiEUtEnn4ijS1IGQxxpkAyTZMwkNSALNPwgW/XsOc82LLVgGoXzI+dt02JN2+T7juJLjPMRA/Dbw2uvSj+1dz2vaexbvGSyC0wQxCxmBp0ZcGYnCD4wig5iJlGjkB9CXrN4uMlGiy7aQYiVuyjcfyG7QCHc4mrkQiKYzqpjLl0IWUSTID7hgXRR6CZZvN075/udpO297X1Jmjxebz2lbQhkzPcz53zO55zvmflOO3myQfx8/7WLzwxTR+jqdJJpf78z3WF8PskP7of9SfAob6sNAHXiK2t5+3hjKZfqL543FGJHveT4H4PnOzdlSC32lP7uBAVYs8DhHBLrhAh8Q5VYYIaDWT+CcIL/EBA8JBQcEAhqGAu8iVcyRUyvLMcJrCmL/XESmJX5CMIMeQ3VPpZgbjcGxPuUQgOCgnDYdnHNjWG/C/7dwk+C+OvgqypETrDi53CjcbMGSACDod1Z6ABI1noqc5bbyCePk/0UThY+3925eeUdLdHFknDG8PeJMtF+VyCwktxkuYMDhhaTrXbb9do/x7hJKJC/kEavUyy5EFAKsKklSEitHAf+BbWV/8QR0CgV3MALtPoEtZlBWqCs0GiQmJ5ipNXR6VTIO+dmPLgphdMtODy7eJzP55OL84dk1uOQ7lLgZrbinTuJ59dO19bWlnZ39148S8eyNy82tTQkSaQDTHK4Zh8nf+IIvG1KarMpQkkEFcMJ/AEQXPQmUtXsr1ZFy/w0qMAJVJu3eVKKQB0K5SjoLdf+VRVBQEA3ItdgXKtACyCfpxq0t4BlxDTDLZ9aMx58qzO+lAoTIPn/8Oj8OL8Mrj//lnjCFRUeKucry1sFHSVTLBK8rWQKlHnCiTQmbB7y+2cgWJKAJDfLoFIG63gBBA8FwT9TNcqlYtW6AoBQAvywask2wCcguXI42cNxPiK6Sbdyxu92MYQSEMdqNT+4vFgIKU5BSVHwSO+Wl5bW8r1fNzffEgwABFy5EmovAAekVpLAAVO08dBQpvvDf+6l8ZTJR5p2h35DgSf7RMRg2eKsSqOBfsfmIRABhANQeoQVOnN4epO/alTKxVJdB62qV5o89QFq4FMiK/NxG3/S4lVIsqg0/B+lAoDgJqEEJFetlMobg8vcm79dg0AUg8f3YQ3PRDkd9w673W6jQRIh3H4FKqop8If8Sp48TdgAWOK5wWjnW7ZogkUbndcyZVUQRfhtZdMBAbEB0SyzKod9ErefNJwZl98o1tPhSDAYyEY1LRqssbYDIcHARFKQzXhcEBBFlmtCOebDeHIatjOM+7UbHcFvVEqFRCRcSg0GuTfe6235BuaEGUYSVteXM8NhblEJhUKKAljg/GfI6203cJfm/DdFaYdC7fPUaLSrf1uDIVxRBVg+nkggSRxoRsx4AALLEhcRVFVAEDAAZrCvZtT02MdP1JBWbOpFNCYwHIBd43FVcEgF8gW4Uou2q1vgCAQEpgIAZPEKwXoOEuVCiEwtNfCFnti+OvFi1Amry6NRbtzvj8f95GLvLaTAdrsNTLG5uflYUd70kqkLSAXfXFYnygLcOjAVTBZI4QBLkjkeKmtZElX0BDcxcGBD/32zM1J2wuk6HlROluNxFpMEb0mgI8QDAgLAAFmWYXxIjMXw9UGxgXrm8vKip1AnaLfI8E7rDUQFJAiX+m7t7F9nI4iNUaYfP+6v5I/jC0fAk4v9pbPRcJR7cQ99aE3HThpUjegRgugTiZTmkdiwZSbIqBhpQmA8RuEPH5its/Z1NJCAUCVVtePIKHApiWNxtNWFwvvkpNVpYYN6zqhHPtsCenUJOQJHXREEyEEoFElaPGzPuUV2lf2wilMi+fX19XfvVj/Ist1PXYwuMku/7KTvZY8uUW3KGBCShK0QSXCWw8H9ZAUJOEFyYUZjGH+1rH+hq5UwcLWWQ6cWSCSfIPCUbqGeBL0g+HzudgfFVqc9w0FOqSU+v05UBxSG4ylMElMO6UN0HBE2BPpvk7fl73cWUNSrgvphdbv47MkTyIj31ISP6gaeTzILuhRNIDkTIoKTIEg4YHqjUjEMTAc1PfLFQdcSS4IBKYDAwYJi5p2E05Qk0xLJY2IAQcs746/UE39sfmiJvcH7QWax7f182Bt3YDApTNMK+mi+t3h8nLo4Wy5F7vPYZU0vVzmOEwUVm2wmsjkBwRQhErYrlTIweBi7NsFA9GsTPWWII8gINNuCQ0icyV+hwEmszB3MekD147NOTAWIXPtSWf/s1eD9MHfcAoXU+GRyaZo8MEpAwK+7Sqj7U+qFfr/71NGSsc2bRByQMOCI6DVNtmoYRR1WT0/6/jroQO8Fg5OgYBKRWpFlOcmiGgzQBN9SfQQED5bP1UL2q9NRPz8HGDLJ3xRSIF83UQ6d7hoqyi6Oxpb1+96qj+rFbdoxp9pXFNClwSmK6cQNPyurV0Bl4PpRapD9OJZ4hCDzqo9TUWw5/flq7U+6o4E0wjAY5ZLzXVIQUm6goxu/ku5Bd/Pfmw8wuqJlYyVn74HoA1XEaGDNWwyUaroBCVZ2DGtxqKF4uJjIyYIP55tnaaXhqdb+rPelacH0zxAUiEO/N/2YaCQiFg8xDpQQYlB5oCGm8FPcb3A2omRUu/DVLU50jRaqkFgkDqlFxVKcFUUiG0QJdYcs+QgGVQiv/9Yl1wKJZ3uvhuAPw4vc+KfePGhE5fFjUIvdt73kxvhl7aEmmMjmNEGhCUpRbLLgEMVbtCuj9SpHD4gmpyQjy3KmAwKgUiW5pVRI3yyfRSNpwGE0HOADhxeZXC417o//nrt4Phie/qI/3Khv+CmKJeILEA6mZfPF2whRrQCsIqtXjAAgmKLME6khittlqDSg1LjVbx9IFHb2dgEJAgWx4Wj3hf6Qj8No+jZP96dBHgh2fKtwu09Lb1tkG8upPVkJAEHdIBpw/yN3u3laIBZO60929vZ2d51GyQMPfGt6xbLINtQ2iKJC7Nae5OzI0mqS9YmigJ2mYvhbVb2mZYPBSCQS+J9MvMfqW0/ByjqIotvX41tOd4k0qUwHBPvp93dcQyASi8Xuln60GhUZPK0hWB8oSNayv+/TQO8y8uIQAjadWUngVJOvZX8sELIl3rruKfCypIpNvhZ49INZbOu6scJDllXlhx/F/T+0cNGpIHnbgvJ7S48++gEtUn9JnMG2VeO22+N/JWcolIpbL7dKdxiU+CuZFgiiPtYeTWxiE5vYxCY2sYlNbGIT+07tP0vKRyYzsvs5AAAAAElFTkSuQmCC",
          "walk1": "data:image/png;base64,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",
          "walk2": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAJ8AAAD+CAMAAAATbSctAAADAFBMVEVHcEwlJCQECAwoJibQys0JDxfvza7OyMzNx8vNxcoYJTMNExoaJDIdJS/LxMnKw8gaJzbIwcaKiJLvy6uIhY8gKTMSHCYcGxsUHyvvyKghHyAUEhEODQ2VkZqFg4wGER2QjZfuza8WFhetqK8rKikNIC8wLy4JCAizrrSinqUAAAC4s7kIBwYSERHAusAMHCq8tryAfocGBQWLZz0NIjN7eIA1MzDDvcIQJTZOQDQ+Pj1fWlSfdEQhHx9lSCtzVTKVbkFIRD8XFxcODQ4PDg5FPTIKDA7FtZ5zcHaBXTRhX2FVSz5YPyY8ODJDMBxMOCR6X0DsyapoVEErIBZiTTXNlX0zJxwfGBBAPDoQEhVchpkNDA0aGx4XFhdXRjKMbE5IRUOLf24VFBY4NTWfk4AOEBGmmoheXF4QEhaViXdJSktEQ0MLHCsQEhUGBwgiHx2dlplpZ214dnhYV1dcWVkTFBaRjI8THSlWfI9CPDgGCAqZdVp4dXc3NjNjjqNGPTcSDgx8enpFZ3loZmyFg4arqKmUkZVcW186MCdHRkxZWFt1dHqkoqNOTE+YlpaQjo99Xzm3tbegnZqDgIZZTEJtUTBVPyl/fX0PFx8QGSHPx8rx0LLvzrHQyM0YIjDxz7HvzrDLxcoOFR0HCxDSys3TzdDxzq/Ry8/w0LMFDBQDBAfVztIYIS0UJDLX0NQVJjYSGyPx0rUTIi8GGSkLFSIWKTkLDxQOGSUcIyra09admqKNi5QBAQLvz7IYHibGv8UGHzPd1tkHJTjp4eEbKzrl3d4MMkSnoqqYlZ8KLD7g2twFFiT01LX00bEVLT741rb017pANSn42rz0z60PKDruxqXcx6s1ODhWUk7t5uWrekYkKC0oLTIXNkk3LiX538FzbGSxooxrZF3kz7LPwKsoMzn31LDYup3q1bnDqo7DiG/1y6h9dm6le1Cfbzrt28FrX1GwglX45cvbz7qDfn11ZVWCcl+0qZgcM0Drv50dPVbZrY2oi3QrPkU0UGD69O9+wdj/AAAA+HRSTlMA/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v4D/g4W/v7+/gj+/v7+/v7+/v7+Kv7+/v4gPTP+S/78/v7+/v7+/f7+/v79/v7+OGf+WNWf/f1G/pBT/nb+ga3+/mnjg9bp/vqXX53w/sP+jfD+rM/+dr3B/src6uzftq2w5dzp2sLP5PPwxq/Ue//////////////////////////////////////////////////////////////////////////////////////+///////+/////////////////////////////////iKnJlgAACAASURBVHja7JhBa9xIFsfnUFBVlxJqfJVp0EVq2UJtaHTyxTMsYT+B99aMDw3ry8bty0APwSR2JhmPTZKFgEAHgYo6FOgu9aEphFCjb+Bvs69K3Z6FPTnp4CxMdYjVshL99H/v/d8r/fDDX+uv9f+/Duen3zPe6ZU7+37pRvPb2j/7bvGOL4KH9PXJd0p3MruVHfYvR98rHVIFccf/E94t7+gZwU8+3/KuEKm7fgzv0eHxdP7588VmzS4uzo+fh3B0enErGiV5ETiDXwzb8fzi/kOMeVGWpTJLZjevnoXv6PTiWqpCcqnsav37jxpucR2WXdepsiwKzmVZotD99OrgOeimiwjESQnmJWrXw3d/AzgCZzgXggMbz3MrgF+8fhbbOV1ETVNgQimWyF1XL399E3ddkTJGCUmFji8OquHg0/vj5+hls2vVFRwRTAjC7nDtupoOUcoo8JFcFgjoli/++etvr+bz6fT08OjbUx0cbNJ8eo8UR0gghAmm7rCKRKkKbr6TJKGJIEHlrH3X/5cbrbLMCr27q9n8+Jvm4cH88tyIcDDzFGcUI1gYJ0HlUZ6LPM/NdzhDadhWbkhkoReUMRSMUjz8eHX+7QhPFsHvZ/0B6bDFaGIAEYtWKE9IgjYLAGnoBbaQEgTV8YdygbMIr8LIeX92enJ4dHQ0Gh0d7DTkp/cqeqef/vi+VJhCliU47YkEInoB2EZRamX6Z68m1mmAMGWWzXAauzdvrhaLxeVicXU13SHebUeWr/TBHXiaSbMNoDC3x4jQJN0ymQs2vHBs/oITSOhgFzJPklx26m53fNPrTrrjczi4Fb1Ihk8DCggffPCjoni70tSgbYANIAJjzKF+8kLJm/OdxXf6oZGW/+IMOMuQpam+Jehj9EJcl4EVWpQmiTm1+aQp+pNW81GtoECJvjD2BuejHeJxEfovf5xeqyCE3EvgTvAnBRwQUCoZuKG5/zam+L+qRT8J6vmgVqC95DRqq8FsZ3inH5oc8cD/4+frzgssS1twrwnSSvLSav0YvDpJtqe3fMKUjtZN5x9lCeKFzAJ/6OzNduY0J7ddynLoYX//2ATuyrYZ7QE1QUqA3PFJCXaNez6MtjLqNsxFnua50E4DrY/akQvGXX3aXe4d3HepzRLiO2Ed+iGzLcvwbWsTu3s+KnXzMN7cn+trARJTWHEUBFFoU0zJyvXXQ8dZ3yx2ODJ85tK2bWpXrcKtR3Il/wTMkcDteM2k1gmlaZ+Qm5LluR2AWMMh6NV6kYUJfG/9yt9/99MOje9DZ9nwCV0h2taWzUNpMaanFOMWoh0PQhhWhLZB7SFbYXOq5wOncr0ojmPICj02kITaq9i7uZpNd5R+R/eNABrLWlm563iieXgosgxxZjOiI+iNx65s6g71XYL0gNDQomow9AMbSSmFKV2iKxieK0FSKfvj67Od1O+cKOinGpBGzjpSDw+1pKLr6IqWBeb23qSS9UPNKe77iCFBIm7XfmChPOemMmhf8pqPMTBBEFxeL3bwuuHgrpYIWhfcwPaXaxvkaxBRtbLssuEpryZDDnilZYkSxj/jcoywoPUs3SiMmPocNQmhPYYynZyUiiK7+foqmeMO8t6kVeQMfF7Xtcpk05R23nRJEU32KCjaYJt39UOJjItALkSsKHKQPTNd2Oin5zGdokZIPSyA0bz96au9RcuHTAtwh0tP1XVTZF3dcEvVsGtzxtED8BUMUrBu9DyFiAULS5kjM+RQ0stmclhbOwiawFd9ZK//ffYVNjg6HE09JZSEXkYQaff24gZWiqEcCOsUKaJxCwGvO1o0cE6qRoKAvCwlTvXIR8yob6p2FXlua5YXrRg1oNAX+cfF2eEXx/bypxmWqi6BDiG6nuzngNdlqK51CVMknWUOyaeQAPU6UT5AFcsOrimBD5l2QTOtIY0DDxb4dOC5ruuF4FDElEmnvDez6eGXlPLp7dt/LIqya0pGlRLW8oVTAkfJ0k6BNhmV4b5XwglMixqQUKMIKYG3KcHkoijWfdoULIOeo6ML1pKjhEFDWZlq0XYE+xbkvrk8nx4/MdJHC/z257uiazrF0gbGq70XbQdJJjb7Dui71RCCKSGMvBSQZgJqGvA6aXvVGnYfHE6SjOlYwrDY/9QjFxza/YChi4mlYIdyFdw9cRs6jfDL365LHVEMcS2ywcRr6gZGe6zvQjIR73t8U526UOFeUN6NQoEzXkd5qU0b+CzdbbZCah8AZMq2fJCJFOm9cnb1tDwcXajwxR+e5oPZr+s4Hk6iroG0onqOgrxC7p6d9gVgjCQjWEJpxOvJMoBSgWcpNItta+EY7Xuiuboff3pfhK1oIa2gev1E+Y6vVTQYxIXmkwS2HNgZx2Wp/VX/rxkkFExVzBhIf1OiX3Rwd3/fE9qGupLAfkhH09aJqPGyzbWmB+qGDdNjmpPQrYZPxRvNRREPq5WE9GukRkLVOIZGClUJ8zm17CxcRpT1+zbDlzGubGesZ62uUUWyii2udDGbcecxvr0jGjwCs5fXVuvKef/UN6+HV2DBVbXKIZ8g+UED7O7HXDcmHSWd7O7aSjaCmAZmCent70UlTKr61rbFdTlBdsBACy0PKoE96gd4oev7a2e4HK7bm9lTPXB0el0jHLgW7fTjQxoz6u2F0ngu7QF9N32Mlq5TwaqJw1QhhJliMhgbGtCRrlY2CAj/AhK0344Y62PeejBYLodV9Wb+ZPs7mscNPLKN7YLbmo9ZJBxG+jUAYb1eqzZMCd5uzMHIwsHE53rMR2ZXQrgqC8QsmktJrc0ORL/tSsy+BJbtrZcDZ3z59Lfqo4M5h67BKKK6+gwGpm2w2YUZnpUH3MzOev0wD8YTr5CPm99+z0aEzkAFOWHFAQQUVusGMTMGirHtOc7kly9ocEezAhelbfPC1vL1ZhWG5rYGEMYZFzwjXkFNZhnDRTCZBIXAeBPu/u0BRoCn8jiMWp1pzrpfPiDCs8GAC1H+D6dWENo2moXnICLpIiFZlxwkZASLVbdCLhjR+tROISZlD95Tb9vsloS0F7cphrILQ2mn3WmWHTo9LKQ2Y0NUBQQCHy1jhFkGCeNQM6bBe1onKZuaDUwYkvYwe9j3fsltN3txVq2NrJjo0/fe/973vT965f7ZAZ675/LdH1ih5mLmsbEpY2LbAQHGT7rO0kYWUr8BtcYFeKYbx7vxWRGBPIMvZTRZ1UHmQyx4AfQ94DUCbMsM5XlMVl75P/C1uNbfHHhCHJZN8eEyQXzw2eFkzWa1bNxcHYRnMyyS25hWRFJIHMpAYWBaGzZ4KJwSocBHFRaXJugdnrF+Zp168V6L7v4dlL1DB4nZhcM0sUSwUHZp2xKznhkKRNQ5JrJHf6weLKl3qF2AQR7WL+N1QWbE2pVIK4KTNBFcLNaTlbPO9++1qC64CspmQoNOEpDK+LiOG2DFKDcrBbaeoRsIz1AIe0yi9xK5zLCxx6OJ5AJNRsR90uWm+LCTc4zLfP3HtasXZ1y7+Cj3PAfqlweVNtRJwYNHpgzFpHgW8EHeZMSG4QsUyBOHB+WAlYfmsNA14n5C0VbW4MiDud0WHPZHacAmHCeVCXqRUGt1rb88XLkxg+m8sHIHCtKKA+as5wJpWSVbiws/xUqRzfIs4S9Ug1DDUuzQcl4DH0wjsTE7aC+hqWoWh6FkoJdYAWOjzWwQKZO0axIU1Ppo/x1wdMzXazPgu/8MFvyaCdzx+Dt4SeRrLF2DDgxuzfA4Rgg4ytHVTGS4juPael4He25qFgMCAKslZdOm3vZNTDXSSSAFMcY9ikQ3Du/HpCZeCbckNl3n8QyO89y1+9rKFze/8xgHwsUxm2FRh77rgS51sznVs2k+EGgmEiOdAYfU0nKy7Rl6OwNMNUjyC5myJGoCMRmIpgG92Ot2ux52bYIPxUQyAoNz+BrYFc7MPL45W21mnty5tu7yAT4ltyko+YxL2yDmXEbOaT2bCQIOhIoI4fW6WUXmhLCt6AxNkos3tKgtRQZ2HiiNbAOqNxAEpU+wLCFBjAKtEa9eIgEpSsjo0WzwIPcoY/13Tzk2a5JEd7WckiWahGplFIXvOYHFWe2cmKWcbiC2zYwsKr4AadmgaoYuq2pb5zdRl2IyIjwokYEl0LUNPm5GH/PPsW0aOp+phdBV1mcdJ6wIjbC4aNKmH+DIwmNkCZS87fCaBbTJXpe3eBADbWsDfxSGqpTzAwYUWM0KxVzxrphhNniiCNBqkLVFWmDLY3lULvGuAy4PbC0hTrjUKHo087RjzXLNSNEYLgppWAF2KyOromZ7VFjRdFnRu67FW2I+EqiaLkV+pXilYLWcWiMrFwuF0a8W4QPL1qBfgBveSOZZKGyhtQUCmX3FiQg9PBIlSRTVyBfPoGJump5jRlDcMrJGebbjUTo8Y0i3gkpO9HVR68ISaedCdiMUZbVYGF0OAbIOJ0ert/aKdM8WwI3rZaV4bIDPBOsLnlczOT7Q2iJoPtAJeoidm6ECyFxRlaWnZ9mBvfG8aztGaDCBL2uC57ktS7q9mJcNz8hdXqz4iuY5gprLuhlRKY7Gt8ZlRs8v7i3tHrxbGO2VK8eH472jk/dL768UI4wdHDLudrFCNtR1uSKpvpbJChjhDdb0xXZU/NNZBjFX/9xzqIZlCLymyrrhtbq98NfXR7fv+kJ4uzBazOfDlisrAq8s3t77sDMuHO+NVxd2Otv/bC5dGi+t3tqdHBzs7C8fHULoZIINOg5IAhTSNM2bsBo0i8YBDWhz8G6y/OKbM/ij89/27BpjGVZg+aosa1YgGMcnu6tHoz3g5sNqYTRS+FA2i5cLu+9+Xrh+srywPxj0v0/NpwBXutPs91++el06uX4yHhePAQkOfx0K6zAONeHU0mQZ+vomuhSW4rJ6JD07fxZx5fA0AhQsrTja29srjMeXln/aX7h1WLiy8PPO8snlRbl9t7C68+Ogub+z3xz0m1vVdDqVerU9HG6/3NqaS6VSB79Mdv+9dL3cdcnkHKpTr+WyXDzOEgCTng1wmQB8K6ycZdR2xwLT4bgC1CymcjKZTHbhTr9s9wc/vns72em/Hrx7e+vwcHd/eziXTm8BW/V0ugr40ggxlYKLc3AyHKaG/YUjqO2xqmZwsIUuCUUMASXLesbgaAvWj373wdWZBzA3vvMEnvE8eLaWdTR5PfzX/Dz8T1UhcttzqbmX/cFgf6c5nJ8vpQBZ+r8O+DkeqVQJ6Bws5yknabkQXSEQklEHNGl30wrVthxqsGh8PSy/ePbVjdkGWRcettClgXL0sofvD4Zv3ryZB16QFrwxENTp9/uvSqUSXjx9zCGN+L10qv/ufdmlY1GAKmCTIQK3Md0+2eAMXy77uh9FgDCMnsxmRS48MFw0q5TrKYf7BN58zAqiSwGCavX7ahzGT5jSqc8RwpOkO4O3Y8OjuWlNdvBvYRqxNiW7YJucJsng6Xx0TX6Y0VdmifHF3z943CI7aK59vDyYR3SICslKpTGk6Xq1Gifc5/yVpiepGGS1OdgtWp6zEc92SVTpZOTGYu/lNCUP8Hw4EJ8vzgTvi3Mr95499xCgQx/uDgk6iOlcfGNy83q9ejrvEF4pfktI7DQHCyfFCNxREPczQBZ7Z/ACNTrQ1HyuHBJ4AFBVX8y6o3njr/cfezYIppowngxJbE8nWbXa6SQUfjzq9fonqBjeZnPwdnVcFLFEZy0epxugZ8Ekc1YmlJVcrlJOwEGDb+dm3nC9eOeh5dJoLcyjg2FcL06hS1fJ6xOJ1Spw+gkhXulsNQf/+Gn5UlFUFAWbmsk46DZDX1Xy+WNJLpfL5AUCSBHXZ9+uvvaI6eL0hXOUk9IQyaun/5fAz8nrdAidABGv1pMMRYCDP/zmA87ucbSh8U4mX8zniot3iwk6fJfy+fz6s5n/FuHC2rd0C8uB0JALk/6r+ulMq04p/ASVoEOABHbyBbzcbE5+e2hs4NxAIEN7swIAcxLEnBxleFUk5emXM5N3bk3ouWipIKnz4/3tOiHmNMLqNM4JvgRjEmKCLV7fw8Hy2ABlIARkhs/aruUrOamd6Bp8q7TV4lezz2BuPv+BQXjgMjKjSf9lp4P3nGYW4a1D8BGmOumEumoSYpKXeNrBXlIa7i/pqEzhHwAEoep43hShLCM40IRtWXp05+qMFJ5fsXo04rPoLOLb6iBN04oCiPDO00DDR4JvqzqFGXOHYGENl+bndg/B0cXx5Tl6k23gSMHSVBDOkgRepR0D/A/rZhvT1nXGcYmkd42iJcJ21jngKww0gRAojmZorpcPTlTZMkOakSJlaBO18BzZ+ZCQRakRGtFI1KzNsi/rh1X2ZFdtiEM0VHfrKmKuJtRJoOwaW/Z8uahhfrvFb0xm2OA6gL3nnGvIpn0pMUcyOODo/vif5zzn/zz33FbZjW/rYNqvd08dREXhX7URvZeoxH4lsOj/0Q/9G/8afYP1IEyz3E5X+MQZsTnWMYlvQSDEWuFGzdFDD/9Q2wKRKMJ0YKnnntz79veDz19vgnoLFhtlWA6K5fiS8op2aK3+V5qp8NF4uFzCd/Q/XAKglGANK524MXhIAKwVcnRt57W8EiQkSdTkbbh3Yy8O+vTld5tmWz46GFmXB6UokwlS4Td2Wk6/WB307rBjKBeYP4zrAkfoRPs1EzdGmh7iZsYhtMfBBgzpuVWkUJISNBQKhXLovT3eqj71iztzrUdm8pFkUErg9YrmV1gLlRlGvMJEugAJSwdvAMvlwqhuN+3ElsLmTsVaaztroT7v7ujoxBUlUAEdZG2o3obuv8Rd1tPvt9XOvKrb8CM+QuDA80YLbPIdQTFUZWAqt8vhcHjBxILjdwoKptabHh850gZmrwEmNK/Mw+r1iDCeROIh777EQadzv52a+qSVW8k6kJUThLJXwsouaIdeWDkEBVj2cSc4An8gAG6fjoPtp11gwgjxOLt+bWbywYODTWguYTbzkJ0bgA8PkWhOeWvvDfLLH0GWEnGRrM8LY5wQNlRhGneCEW+xFUAsmtcXCIehTImaDRsbBqNG7qaR49cb8g+nJh8/nqxtRTxo4GWL6FB1Ltt7f/fcbx63NJAeXSzrp5NJN+PzecdBHjyHQiDK7ZXJFaIOPsG4k6zGtKLq4VQRM5SYrB6FhFwsDbKRfCdUmI+nHrbJMKCElIh2CNHQ7vGA9JnrbU9EEo9Mp4JKyGw24wISEUDQww7xwmJhYJvbHwgn+aghpu5qpiJRPp6kIewIZLOd8EbKaDgSO/jWJw0YCunmEXkELVEc3hs+vbfom5XNzcnmtFwuyWuiBhWljpj4ZBjKSVqo1Wg5znoum83m9YWz/LUVncpCWVaibDYc8DHjYlQ7EeBikO1mWE7ZgLnQlubBPRdJPi8AIlqP4sae+Nov/+rOuw0SUmnhw4zbJmej670UFzGxgQDjxLI4ccax21wOmz8ejah0QzrdSoEFkX2wIzpg48XFHYHEtvtZ1WwTbrzIPCRYPRGp1GqVpAevEdR+uX1lj7dozrSfvzR4WyaiCgEoKKWZIJ0wRmK6iFnjtxGC9cNewEV76WjPCbVuBYWAbzkDIzhuc9uQgILxBpX98dXZB0+QSR2yqNUUp9UOCXTwE5Hod3umq+ToG0/m1EZIgNJQKLPsCyQ15gi1YHTb4IpyrB+YBgeTUPUYoolQsVhMbKJRDC3DKgahvcHgMlr4duCLtc50yLQLFGdIpYzcwpASbR4kTJD29vuDL3lS7NSwbM4SSS4HYUgTicRmIpEyr26wzK5dQDYZJj9u20z/a2BgY2QLrVoWUh/Pawomo9GkYVFxgPhmp7pbdc0GlllmAuwGBR4aIYqGbp176QM6p4ZFczou7k+kUokEzyZSWyMDI+mE1+HcMaNg8BwOdyC8+cMf9Zk1uWw2xxeMkGB6uw681lhXX1/XbBxH5R7wNc10yyxGP/yxPl84HuM8UIGANdBWcUTs1LBnTqnmC72Nx/+pXjWYNKCKaWAk4YCgx4YAFUQOm5vxpwZMuRxKfdSBxvr6k9MwJurr6iam1Tyhh1rOzcZannZqY8nljCPOJpmwRq1EiYYUKas5AT14+/5dtSlfPz0xMXGyvu54rypf0GylIeh3AHGB4WbivCnW9VqdAFbz6PD3Dk/05m/e7Ko3+sV6GAS72vZ0ltMEfPHoao85Hkiu6lCaIUWKak6wnTl34edXIx1djboYdbKmZgJEaeyNpIhdPruwt/lzkUaE9pffv/HHf8zPzy89X3qkbjvaoT7A+/SYj1d1vqrNZ9fYyNmBkfWUjzFbPMgqSCRXqju/duGqOrfSXKjNH/78m8+//+ErNdP1qriXcFaMAvZUUIRzJ5u5xj8/x2MJjS+6WrpbKFWWEcP2GyI0XJNMl1vjVX1bF9PpzUwwSpGYT3hmqYqD2T9+q9DSdbOb/HBeuPAb012sb9eQYt/n8ml6VguF5tcx3ZtLS/PwsRMHywfVxrAb9l+9dFzDiXTRtdzq+kU0NkPBAqUQ+N6r6pDnqUsjfYZJjvyy9VO46DfzAPn349GAW7AJFbtF0wlYOi0nPkN4h2s+w39G12T5OzHej7yOXuosWMCphc19GC8kBb5ehQclQM/d9qr0O7cxwM0YI4u1X/1gfmn+lUdLz19f0ADfjnzYzRCEN7s4RX2xtFR6/vH0d8dgvElNlY9GXW477lcy0QMqNhxXbWC+BCFmogsKEYn0016o7vzkB1tv8Unz06fUn56XSjUTS6V5Sy7goncK3gqfPFxeVH1aGrNaj31cGu239m9zT8tr8Avs8B1MdJX3BZ2GvjTgpTfHg37zAukR3P2N6s6RD2+dNa3p1xZ1f7P2W48dHhsdo3g/qobluKYU7CAhdpfL+Wf9VuvoWAk+Z7VuaxcX6ZBeaGrS7njcm8ksa3q2kH6s15tUWRpQ1Qsl+p3qzsi+PdC3ks0Eyte+tvaPWsfgZeEZ4kVTSFBQbl8rtz0D+ayjo/0g39ix1rK/GBIah4SddjNQCXujoF86nXJ4fZreIaVKqyBJhfbuYJUTvK7KZYprn1Cl/n508bH/45PTYKL85S+5bYSGXyXLZLhYBP0wIGRLqEOC+pGRdDp9Uc94sysLkqGrP/3ZrSuDl85XeUr7wgf3+UxxfDG/jej6R8e4HObb6WJgQlgF2XLbwpjwkdGxZ6YsalrrYYLFQgvd6XBe/DfCk3qJMMjn0f16eH+eFm4f1mSKxUBOBVeH62+bs44XTTXczLDjVepfM30FGoN+pcazqXGwp3rc4BcACRu9CasjAcnFl+MsNz33f9K+T8+nXCkAnzSw1VyC6CtxLCN0YuhKk0VoJICJZdjVE19vb293nd1I6QkMJ+CJ8TpxgcwOcbG4nItRpEfyy3176nEwCnyhTGJDTUGBkWBwQ1CA2+VDSYZw0HzUaN5KJQgvIUXBp0erA75iGeXgJOShkJdXob1D8c6+PQv+tgn4iiGoszUaNssQmI+W05UqUyjkkNtyQBnnZyCTgLPXS8Wo74+b/nqoRcTg9VG/PBlVU0oP6VG8075ffJcQH4R7BqylD5XquDUuFHG7kYgBnXabA5RDt3MwIbor4USAYgd4cK/Pn+UjJywKUqEQ7TPff3g5+9cm8jSAt1OmP2QcCHaTxibcbEPTQFEGTSxpTZNUrTXbvNSmpivW6nrt0nX1FsE72d2TdbmXPQ/2fljuh4QtbslAcUKHydvMhDU7FCkHR2tMqrbSSNa3ate9jXfXOz2Qg3u+M1XuDzB5aEgKU/Lp83yf5/u8zHduK7JNGYM0bja/N7u8r5wYdaugtlPqIkS3Tbl6Grl3cv3+eP+T5f77UL+8c3Xrzp2w+V54Y/bt+f3i7duHbqMxEuoVIZlWg8pU6+ttDi3EaZTyo8HgplsooRkyHPDshrZuKNxWTh3c+uXZ3RCXt779xRvzjx2fP0PR4raqEUS32R9VW21Ku3lqanMkAtmAck2r+g6h+crSs1+1n9oN9fHZ3Vu/3X1k/88//PjSpUtv8Mj3uQ1IM7e9xlNrWrVTNN36qi+uNu2nkEM0NiqDTuWnqbGw8bf2d7bCmkMzmqvKCdO6Xa8PEr8B6Tjx1fczypDwkGrdxs3+6BW05ja1pyxENVIjn5hWpl2N4COFR3vazyr9SNQ5OHik7s3L9nMbBcU7WhunkSh1B5RF6DYDhfb/+KZgp1WvgV+bmmbWX3SbTv0LVPezswffunr1y31V4Kvr+XzjscKnKkvt5BaQLN5EgOpsZDMfnFb+C+XC64Xl9xpycXNLqfvgzgvnv3jr7QvVOSsPgDd+3NakJvRK1ZG80j9+/4f+ZWRxMCQyqNII/E5dgkh9ycKzF72mXA4jKBbrvjPRc/TSbz7eURW+ur2/7i88vv6N0v1WMK63fvB8fBxerV8rs/LpV63oqSm11wp0/Q+asTjUwxTRHGq7sB91nap2+nzXh3/a+H5pMZlEiEmUzx1qvZJcf9Tf+jXaOJRAoupPGV5eL6z332uwYgQWx4wjAV9gcn+1H3Dx7rnfrf8TCNWmaWvjzZlvkrACk5udDsVl0F0wjTPfLBYevnhQbwXTYqaRcCAQCF+swTMaOk788auNpSWlyavMDVDinlRKYIUP4V1Bo4Xko/E7zYwIqjOHg75guNmMT9TVQnbtO/db5VamxRk1cd8cfnyH9mQ0Wygs3kgu37/XacQwVjSHiz6Xr9iCs/gnB+pqIx09n/15vH+9cOPmzR+bZhoVW4M2Z5BRl5aerT+6f89vZliKIkJBb8XrK7dkFigK/2RfXc1k/8ToHuVuteuPbywW1Ci4uJh8uIwa+H6ziWUX0nLZZat43EU5k05LGYqqJd/eiY9GjC19Dz5AcwSQh8vL/S/ef+/BQF/X0JAR4OhSl7dS8Y61GWg6TUuZTMxcQ77tJwO+MM6yjKm5c2DPg3///c5Ab5+/a3jo+E9P/zFsWpgjWwdRoAAAHftJREFUh22rFVCdRNMcB3TRlnIgdLRWeD3HgsGGqATfi7NMHGOs1vLQ4KdQOR4+/PR42YSl58ZWnUPt0QWapg2cPZ1oCwYDI6bJGj15au+kr5igFgAPBI/jFJbzoaoW5KcuE8YwaXrQ2UW3lGXAoy2GNp8rMGJlqMzo0V014bvoKgMe8IGLMhhFsbmQ0hV4OtTM4ISIpWdtHt2sy10E/enLbq8rZGIp2mK3WyZrsgaPBl0NivIoHMcwHGdy1kGE14dTsRjwLbQ7vSm/11W/kK53VWxBI05JtIUT8va500dq8Ayn7cd8rhakPYhqWFwEPqMN9PepGY9GYzExTvWtDs/pXEUqGrRVXCMYJbUVi52da4ZMJm04UwMbHxh1BQlER+GQm+CsdRic4+VzkY1FYgQTx4dXu+au0Zl2d8UbsGJUwmez2bxBKe0QhHy++oAdB34RcoVZHKcocF+RYU3PXx5+Od6GJwiRIMSc0VtZm5vLDjsrPmOcleiie2DY5i4X5/P5eXgdqXp8uTjCBHxmlspQsMcSOC4OPGn6oZONRHGREOO5EZvt8pzfs+oNWeOxVEqflS35/+jcq4NrwjwAnt5fZfWdCcusyRegqAyOUawY1VNtT57tEWMxXBQBLxeuDJaGVys+M8bqOS6Vomm7g7b/t9djA0CtcGuyuhbeMZrVZ7CQq3khzTKAmDBQzS/eb47oE4kIFmeYeLBig7wgzLKZFM8hcTgsmfxf/rriGXLoSI53VHcn2ffLrCRRJp+PXsDEGI6JBsl8rzeml+UoExcThMlVcXrA/BlaEICP53nHLcmSz+cdvcdXxoqplON8NRXYMWHIRiUaH3GVKAh+BGGNkhEjMTubEK2iLMu40btqC1hZicvnAZAHQMEuAd6KnxwaHCsbDJymmqngu38gS9GMXmJD9TiGiwmDyJAypicjmClB6uQE3myzhXOMlOLBFwQtqI8XaFCfw+/2d3rGZg2GVOpYFYPzZx+lSFAb1IsE2jzkWb2JiIhZwhSZ3aIDPtFYbIG0nhVFIsLNC4iPl4T8PK8pBf1u72WyOMudrl4pcuICRRN4NJFJhExxBo/IclZm4gwRyeq2kCQJa9AYjkBCGsnQlkwMGZgXODAvfLBni30ePxks8dyZqpUfJ7csSOCYBvuKNwR7WwL4SuY4kdXpSCRyBAt4OtOQDDjyeTqmrECBBk+Bd03KwA15de1tvDC6o1qx+bSDyrC0XLJ3OwOgNjmbLZVMYumuoj0ym4jFA6vFNGQu9nxeyiAXEXjJoFiZS83OrTm7utp5QVOtTWTCweE4mw64LL3OUM4am81ms81YpL1Tq/JF8HjAWUyn5bE2R15CbjuP+FAU1NhL7k5u0Lai0wpClULMjlGBwzHWEvTRA56RHHgsMMlYtJ5U8ICPUPnKFZ9FiAIfp+d58FjEl8q63Z1+Z7fQ59dqqpMJHuF4DaTMsA1YhmzGnFWGVaeTGbk+S6oSFYHPD/WRq8wJMeCjMb3AqXycwTdW4gYHNV2uUupkVYLLeUGrwXM4+OLlQbcpHsdJne6uLGbb27bAJx0pw/4bdPbNOSx0ShDwiCAYMJzTGxQ+nuvy3r3W62nv9GVTo9WoRg5otFotniOAT2dzWUUzQWTX1mSCbMgCHpkQGdh+A6td124JvDDPizFem8JZAy4hPI1WWHN7/Wu2sQZXUJOqgod0TMKXaCPxCMdZ7nqCGEQVmZDX5JiulJ2VIX2JJCIxLLA6cEv1W+DTaDJMjCCADv50Pj/f5x122+R69wpfBQ/pOa3RzGsimMSlaL8zwERJ3V0yGiUS/6PNfF4Ux9MwjpFcEgO55AcmUBCMgaYboQ0Sq2xj90zYtSx/UIoy9LRCw8AeZmfZw7JsN8POcY572UYvOZhTiUGxTcxhCEURGooBQRCqKUWagjosjMXUYZY67GHfb6r3Lyg3h6JArPrk/b7v8zxvQvmQAnvDoTnsIb7GOcJzbAvxsbhF4raDKu84y0zDMG4WbNFw/g8x8BvTJGi+j/E2nyrl6idj1HOM5+L9/ngYgwv4yEHz8ngZ+sXE6kPVJn3LcicBODECLOvepKYn9PU8+OPup8M0YzGWtOyRPKkVWriPJpZhXCnkBDwT6Usd+M6DsH7hucIXMBb40OUwbYMybvT8aj7/66495AtqaMaGPRzXNJXpFEV87FGgK54VyayZAPmbORyTg1aupoUHbFs4ajt+SmI4HdA0OuJRzNAbN+lFu7y0d5yyHr82gY/tW3vUWr3e5hXg84DPx+LAF/pvbNglMSGdHi3n9sQhTkI+E1ZRiwc8NFwjdZFvF9NUuUGf7jZlPf7798jDZiS2t9CJ/VsY356HAIFvBXg0AJq+62JiscOcOxmDGOEuUhWanU5PSCKcYNqh9bZs5Aw+Xz79dqcS+Oyf70CLKVg4Zov25OO2OSBReAHVszwmvChq6HddS9G312eT4uXK7p8gviA2gy/x/+NrF9d0WuezeULepQQ+evmPMrOi2ClugZOqv4H7KpBe4FBZlF7QfEArUh5pKfnb/TM12/BGs5MJtFwQpKADu6EABoHDNPJUOx3x88nlLiXwxff7JsXPYPHAHUelOzURUzDXh8nl8cRFCEh5nk9ig8HRbelsKbNmwJ9MAsRnzqaYZcJvCDDZ2LCZGyN1VF5+u8OQ8BJCCMPOUil8GjjqupBXoP9cq0sxQzKxRnxeaG8uaVVuj1XNnhCBfWIGqIA0OmA2CGiWD5x1fjHm0zqlH2na7h7pf/mHCWHGKMTHz0fyRRhOKeQb4x65Wnmo8SwSBAcWuPq2Zqu2GQtGOH8XFpCfTS2XD/jumBip5eLmfSOXyeaT6s429Sc/tgk6RsTYWR+3A1sG9xi4/SHFUMOui5G4BZsIO0Qy7ft7UqdDyWA1QdAfB2EBY7NZHyMnM5IlCHldNN5nLkuakVV3tic9M/ZpGjQEaHDNkVO/poWBCPKCiCTFhUkeIvmDAff8vlh7u5ZNNA0zMvh8wLOZZfX6fZOw7Um5UV4VanI5K/Ovd/Qy7iWN/hEqj4Jro5TZ0RXFHSN1Bj4xkaSGQwoRMtfemFTy27JsA98dH/oGjSRwhln8OBSZkXqhN2q5ZCmZMo52MyFPXo3CQjAUp/RVOYXcQ5R85G7UmhPX194QsaKwijak6mVJtuGO7gjXDL9H89M+5hL3Gk1cZ8vt2qWxirSL1Z143NO/tWN06BBjmEM+lXp+WxmI5BABUWvJDW2Eug8LFCSseu74ni/A0dRCyOJhn3dhN0AWTB/rFLsptKdJPZPayQQ/e9cmCAbKx/bAPeLN2fG2joV8CEhAfBQ6X8j4MNHuQCgUCA3y6Xze7zvBgrFNs7uHW3C6I9SMjWI22qxs2GxbO3u1i+fR31AwunDjw97YwqbNI65TECwIVRTajhjS9VaftyMoMAkOrOiXF8v5MErPx65GV6sT22TJPctfMVRo1Iah64I7TRTL57sIWV9+fQbpLUbH2F4X25Mpf/VWVzDps+dSpLhaI7iwnLBh9l3kIOdnmxtD5TF2lDhKyARYCB5PwH3AfRKMoVeE/IbVs+c7sJDHP5aCJXQ5hCcILzNNO4XwoihiD+kdMEmf+cywHxkfIlbzNj0/3xQX8sTC7cmm6qs0iJ9/fT/Mo2zhCOdudL/MnGmvHyrRj168yx1fa1BBtj/DMVnT5INtXay3MOte90j3cyU93/fHyEcgom7vPjgR1iag6+xEtTl0Rql+NwiHmRgxDX3T3SRp9cwp5R+8hjx+XS10spRqT/szC1e1M7uTFoUN1wOpE8GFRQxS9ZCFzrMwbKBwgiiJxduLDx+WI8LuwQEnF5sF7dg9UPYgjKmqncwfsVpwUerkHs739Ks3zVquVmb39qbYlDJ45m1eaW0kP5TreERQBEmSRBF+9MYul10IcbF621h+mDuEyWN9J2lEDcYZsa4NfMRkIsunp0ZhfXaRuyxWXj3YQZ6+fiMJlWIhz0no3ZXu728rA64p+ujRhvTx8OPz5x8Prp5LFOrCsZQ1BE6obzvE0rF5nietEVMuA58zcVPLpabKMu+VS+AfciJfEb57uEC/+KEFZ9aqVKpHLez9Kjo7LrSUeF2EcMr40cODg8NPv/zyyxXnhQFQyGZbUkusbTOqxsdZnoVgxRhZxglsN2FkjGy7UUsXCuk8h4ui+Oa7h8/vF3/axDlOUJRWpYX9rL6fdIqKGK2TqH4e8H08OLy6+v0h0kPEZ2TjIidWt+2UHC1uUhOSDO72sxna0fBqOp0upIvFfLXZEhWBi9SFHfB9Vc8kIvE41FAZ4Htnp9e5o4HQrJMovPjc4SHgHR5+Org/X4/MlDKioLQKNR/4FjLN7xF3+5lkkh51hTpcrRb8IQW1ayQRj//lwef76FUzEYULaqhgLP7+NJtrDlpNbkzd8326Oji4uvrzoeSHT3il5HFWkERFhwazKSKguykneH4RyzAjHr38AjKh1WpJ3CabiCczD+d7/AMXjUaiyQTw4XLvZFpLCz8JTS5c2mA+rmA8Dq8+HQjd0I79SKnEcXGlsi3Jy+Wc7uLanMhc0Jn1yLbHA5GDD+Nxof72X7875pIZ7sHvkp58HZfiQiSZjErKz2pCkIp55SdFEElkFp4IYqIIkUwmroQFZTwuW0oInCJ0OsT5fDKdySAqPBMkV5rK40o8Gk0kElEp/u///Br5LyvnE9o2lsdxIqOLZYMuVoRtMBhLgtJBhxhjO9k03qkTWtvjbBrSKW3TSemWaUkX9lSWucxt9zKX3T1IFx+sk4WDRZ1IOYQShBEID57xYOrgJPYuHUMXJpMm3WZyWdjfe7KTHNs6z2lSnDR89H2/P9/fk6g/wo/O9+XfH6cDQfR7w4TIL/tzE0sqoTujkPwyuAU1mVAIFZ2UI8DNwFI3oMIVXIMpUxTj6J4qzYp0ZJPjDCLg4nO5XIyHyAMdI5GxwMj7++Vcby4tBFzd8SD5ItEU307dVtFtLVKHUVJVFWi3kiYBLAVvYvcSFLYIYeuLg0QVtEP3kNzsOhfpMlWDEMb9sQgPgLwT0q7uyHxfzfW+f3/b/+g/C3p9L8tunNwIAh8sSYKOBi1YCsosK0Nvg4as64DtvyUopCo0E7VaM5vmK24PS1W901nN0Lu/7LhQNPB8xAVhk3m8MnJ9+eq33o8nzbdvjh+FxUS+2j7IbwkIg2I0CZasaboGfcKQZZmBtyiSCEYCClXa6h5lPMvpXCLCltkiyUHLlfT3hz9nhIAflaux3Pt//+Gn0fmu/+O4N5dZeH18QpYXXVWYLLcI0E2RwA0iPoahZJY5WzKlqOGxQLFI3D544I31N/rNzXKBJUNcJOsnfznurQS66XTm7cpvrw57vdffjXxG9Lvv3gHgwuOfkyVv86V3/gakBEoOTZPR0oBPQlzwV/wObLsSDksyCRmS3m03NtK76FRTCYkwOqVeHa8ETl69en14fNyD139Hn9A/u//nd8fHT9KZsMSxbGYqC9EPgEUMo2nAJwOfA+ssTdaDkCrgUt97Y+1Y0wOWyiOXDNFg5MknSeXtj72fem8Oj989euQaff64Mvvwr3PvThLLt/wiJy7+urSF9CPlAR7waUUsH17SQNKgoJeC80ftF7lst4BPKamQaLBrVFiiTr7/4Ye5lcPjFZdf+3b0+ePK1c//8s97CwtLfm5bvDZxe2sL8rQ4kEpDW6s7WythOsTHMpQOdbF5tLDm5rsRZJrpMimyGh3nOGml1ztcef/qyTgh095LGYCvXp+9e39p09zenUF3jRSdlIZbifTTixe2F2nKshIouBWYmNmLrnm7Pjx2sCHOiPg24qH03JvHrlwqoDBlj+f+JT3wdOXuUtQ0050sQRIKSQ1pKErSGKqIoDSEi/FAQI0kw+NC9mAZTAJMGnjJIbGbZ+PRdT61SeoKKZXLBc+lnQHeeWma0WudJaKOBqOhWBIU6qJclFFp0ZwcdoKSVMJJcFkzu1wsH0HHBh66QIb8011wDdvbZhzqpcSg+xWXJeAzrmXSMxOBUpUgzjdUQ00EGDVmmMOOgEyRCKbGhMWjZW63ubkGKeyBIlMKdbObUduy9m1DNmTER/suR8Cr38J1tzuLQkgkBF3SBsmqaUXIBCg4lMYMKg6DAWVCSKaEW1MPfPGY6wXo5MFFRkzn+ZplWQ0OItdg3W76kgS8vtpoRTOdL9R6VVV16TwdGIlUwL9Ay6WkgXw4bUiV3xmHGp1q+SJjBbcHXqjIbLSz2YZl2y2ohrBAQO+lCHgn3rDj8zMwIdURnySdFxgNvIyCzAwBoXjGJxGuyZjS7MxX4u6Ia805XIMiY/WnY4DXarFQhoCxULiUU977cNH9mWtCqVonVFKSHG8w0AvZmRKhQmOmZG2oq+6fTI0HJg5yZnzThQREHyzVstrZPdNsNTYAD7kKlnl4ffQud8+y7ORUngghPgrBSdLZbpLOUtE3cFWEzwwVnnzKK4mDBS4acWE4+EMzhm31m16zZVsVtsBCfq0z1J8ejtpGPo9DzCxM3SKq1WpJpRzrMszXoo7xwLlQZ40YMiTwdCcZHn8ws7fNn/O5Dc6y95oRt22d4iM7ijJkRXs+4jHHH23LbkzcCJaGfLJ05gbQmR/m01XyAp9BJW8mXcLywWLUu+tG+YuPd9fWW9ZGIp+Pne6fugueskZRDEWyq3dG2eMrX9u2DYOvQAIfSRQvtltYJOIDc68qjtEamATXzSQfhBrNt9DNa3w05HZvMOu2HYvtJdL7+zWWLRTgXzCkUaDvjyDh71ftlpmZ6hKher0agm1EfOdNV8LyoadRZQZnr4TyWhq/+ZQfFxY7i3Ha58GISMBKUbQa/UY/27caFQRYBvddZCv06rNPNquz0ZbZcqpLHRKEvGj3kF4U1k9RUQBqTpMDvsDODu/Sl6Zm9io05kOn9266EIpbDWs/nW7YjTgAogcDDMNDewr37nziadYzaB418C4lEfgMQndaxVmCDPhQH3Hah+Nb9dRkMuIHG5ipuB0B8fl9jVmHDgJlJlZr2XEWTAJ0Z6jUhULF/Xz2U8Lw6nM7vt2eyqt1sVoVRaDAhk87KzBFp74oJQI9hmo4hDLJwwbzVPPgga/gOeej3SEO+E7TuXRuw95YK6DYxI9XeAo0/fUnhOH1uG1GM6i6cMDHEYSMbcrQDWjYxpC6WgpBBiOn4CzKf3OnHRsLTxxl8C56nPsfdO1FCDyC1Y/xibbdaFQK0PxAPViACGH40cXwjmmbG/M3AiUO9NuOgkraAHBAgje4pJbAe13kC09OpmK8nu888LID+XzwomvGADCRQ1/jBYcOE0ISPf9YUw3VxexPTQshkK8ajYbUIjMc3zChoSE+RSWh9sgDPAZaMLVzcycWgybXSXDYwngcp1qrkQjQbrQTpygUIQjRwz3lghf/FO37uH7y2aptminwLiEsn1nHfBqOv4GCRcwXqq4T1DkfQyb/NZlq88Ly0YQ3jko0qONBCtZYom5CyT9NJPpAaHMMwAEd2mAs80f1k1nONO2FXyH8gI/bNkWCxG4UfUh4xsT6EcBXVXQHHX6AYSke+CJ+YfybTiKO7vDgMu3DApZE04Yetzw93QdAUWIdtmEerd79cFv4zDTNU2SdxWq9CuY8WsJ9QnNG8jMHQxB11FyGDpphykx4zE8piiosHE2gJ4gQHiKkfbUXpSpcNGRxO5G2EGCRPafDl/HwQ6v1lefA97/ONaW+7fCZIaIIU/nFFKYcPmguBKU5Yzvzki1rZKmEvuP6ppNCAnqxgmieq8mkiQS0TnPZPvrKrbOI3KHDvebe3asf2NzM6Haqky9VUXXmALCOIIryIASHAqrEer1eR8V7oB/LlqH1o8YSXDiaRw+I0Y6AaIdpPYQF3E9OJ9oNkLBlsCh3hnwed8X3tw/6/zxnYbA0/9/e+YSmkYUBXB3moi548Q8zQmAYDQyKoCGY7tgYnQwEcStBdlfUTbEMyG7Uy0qoS1iPOXrYFHvJQU8tXRLyz1spQQKlsKdCQDZ7yzHL7mEhl8J+35vx33R3a7dVcujXxkBmGn9+/973vffm9Y/el8B39CpA9PcUKgR18qqfYoDDND+H1Y2aHNXZIpcDay8LbVq87t0Jw5vbrWQgQUCXiT46O0fA1aUkfLs8D7gAe2Blq+1kdXmSR+iVs9dnNxvRr6C2IupbeAEMUBS0SA2oRTBm6HlLwBWoQXJU+Z6TVEhGvidsCgr9fbIKSsKEhEh7jgwklytLUCsgoMdh1vjwRnPYvhx6+O7xLo/ud73mxtoqcAb6OzLRJDTUIl8bSwCjVi4Wi+XTA62LgwoHAMnQTJuS1+JFWLXvZ5qFn9GdY3pugQBewCv88Rw/I1EMY6DVbF9Zjoq771SgLwd83/55F60Htj3D8GiqGU6dDiLtEOErSXEpf6rFb7NF2vYD4oEmLtVbD9sG1iNJukUHOha68/ry8s3FJSrw8vyIhoZpDxLgr8l0SIw2Jjh2D8LjxdnnvXvtV4HAwuYmOOMrk1qCHqipmIRDCyDKskEwKBaHNq2FReoBIYfS3716Hb0Kj/LZuub2sSsAQ2Pg5s0VGUcgzzy2PPcuJhO4BtbYnej/dZSAKJwSK+XNLUWWJLm0tVltHgxmr5Cm44B3sbSK+OuyTW0mVaMHRaKBa5WNXiK8bx0RzDEukMe0ZfEuRsj5+Uky/VslnUqFGrsPH0x47F4WipduNFTPSNqniUly3YLhcaBh4LQzSJmsZUTKWuz260DXY3KxmOiF7GFdDqY7hy5XoHPc+mI5fefNzUV67VFGkr6WIrGJC1VfwY6tx9rYQq1Uxz1NFpzpQ5IWulitpN6RqULiI3xqGwINUKtpqcvb0V5iQSujyXzMnrUboF2HDkcgsJnfebS9vb3z8IE6aLzHlEewlHz58k4vPb5TJV4mk9AtRGniI2btdlnqf6AqlC7NfnndtLQAr1byZ9Z7Iduh2oQQ9e3t2X6hO9Clu4rxYNAP8r9auPi97stE75vxhSihVINiHgYv6I1On7RN8273YKrWXypb5jAompAVT3Epp+0uZ4XYdlRc8Yzpz3ZzSDtcVcX3njrT7d9Y+mW9t6SbxclW2fl5bDjcgOZ2syxbHLyBv1DDhvMJhEX7lG6bTCwLyhVKKTFlM1u1TpiosHtjaVU/dJunfHdlXdSfmiFXcMUVVyONFG/kOI4deSIhW2ZNRJ4+xU/AOZ2o3HhCxBxNYsOsVoP27l5V+dD5tWB+ORTd0aUiqcKDeFWh8CTMkf3gkRzj5PBnbtZpxI/BFQT8PRu99X3zUIUAabspfvgWu9hPYki/zyJWZ7xGXCvlKcroxBVxZdQ7qwyl8i8uonJrxIbyek+80lKMxvd682NM4EuNkP6xWH+Rp1g3qkj1Po5VxsKbYygv0nl5hFdj27fzA6QY86DR3N/f3/o4m8ilXf0Rc74ivDWxHXigEV7ZzNhVgObQNXFjhZstqt6R+QtytMdKGt6uLXxytfWxZu/fOhUlmEfHQ+NSFE/p+QwK8TrOCcZ1shxxP7JRTxRXSSdnOzkJXyUeTe95dKGg+R4IhfqrjSXILKM6J9zBcCyn9P9R6PflQ8jR5nDYtpLaneaTwCWebOswkpe3+KQKXkA+I8NxgxT3IB0NeT0/ezzm1dDGj/4p4hmUPhx+B4ix80mEWA7Vil8M8vXZfduhaOKFx766JjbuT/dRfoUaCgQIO76TxVc3GlXTYwwN+AxKKpq6WgqJjekqD10J/N5JqTZGPt1OpTz8kAEnJIBD9ng6Gt0Qo99P/SydSA6PT2YZnkQIxICOT8FNBuQvXB3y+aFI2Ni9P/UzBnx5dH4jxxIvM0Iq0fFlnUhNkrdzdJdVptH4zm+YOl4Bcp+aPjT96flkJ8VAacM5OVAyM4ztYGz6dIDHewkcr5oXY0DHF69i1kEHxDtmczbSoDbIj8UuAWRyET2feonclBdmiCfn+sOGBghfTLUe0/EZB0JRudjM6HylCt/X2kCHDFPVFWBxZsgHVp7V4VIGPwlcTW1YGvBUBSSnP3pGZhhmBLAwKwMr6rBLaerj+VwhK2eycf0ZunEj4dNuZer+GVkXy75+2QJ0lXw8aBD+QTlxTMzDAKpIszJvrkJSH8WDUesF+d+6B1IgjPDN6PSrYCQixeVsJpPNylLsPxpqQRnRHgRwZFYBIgiTubpPyQ38FNzAZ7h1EskUcxV+MZnMFZWI4RaK4IvImZKSkfyC4XaKYDAIt5Xtk3ySieVv5aeot5Ja5ZMAAAAASUVORK5CYII=",
          "walk3": "data:image/png;base64,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",
          "dragged": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMkAAAD7CAMAAAD3qkCRAAADAFBMVEVHcEwRGyMnJibLxcoPFx8LEBfQyMwQGSHOx8vMxsoEBQjNxMgKEhyNipPKxMgHGysMFCCJh5ELCwsjISAPDxAFDRcfHR0ZGBgVFRYGBQWbmKDFvsQKCQkGFiShnaWwq7G1sLYWExIODQ4VFBQdHBwVKz0CAgLswqGmoqmCgIk/NiwQDg4RExa6tLmrp659e4M9PDcSEA9raGoMDhFcV1E+Lh1gRytxb3QMERZ5XkJ5bWCHg4uIYzhOOCAiGREQEBKCeGp4dXyHakcODg97WzMaN0pEREaZjXsQDw9ZQCVehZdsTSrIt55MSkqQg3EODg86NzUPDxFdW14MEhnIwcULFyPLlnwKDhRbWlsLDRKon40PEBNPTk+9hm5qZ2fdvp4QIC49OTcbGx5nkKJaWVyXlJXcp4cICQtcW12zp5UmJCMXFRMuKSRSSUQOIzIEBgdsWktoZWkpIx2RcFo2LCN5d3hQdIVaVVM9OTeog2qwrK1vbXQkISFWQSunpKY3LCNPTE2PjI5fXmSPjZODgIGFhIhHZnZKOCGBeG9PQjScmJlHQjo3UmA4LiR+X0JdU0DDv8FVPSOIaERvY1CimYcYJTLvzrAXJjXxz7HQys4VIzDOyc3uzK/Sy88TGiLvy6zvz7IJDRTxzq4YKDfx0bMlIyMbJjXvz7ETJzcGChATJDTTzNABAgMTIC7VztHKwsgOFBwFCAwQGigTHioTHCaPjJbIwccsKScZISvX0NPuyakYIi8dIysuLS0dJS8bKjmTkJkGHzEEER3Z09YNFyX22Lk1NDLl3d4aHyUOHzLCu8Hy1Lfd1tn11LO+uL7q4uH43L6GhI8jKC0hKjMLJDiXk5wNHS1KPjDh2tv10K41LylqZFxVRjQwJBkUGB6eckAnLjVhUDuoeUNHRD6UbT0eLj7u6OZtVjsbQ1Wsf08FJj9SS0HbybDOvqWql4Dw2bzDrZLp07WbdEsxOz/IiXDzyqfly63548ry38Pj1Ly3oojQw7G7sKH79OyalI/n2sRNwxqEAAAA+HRSTlMA/v7//v7+/v7+/v7+/v7//v7+/v7+KP4xCP7+D//+/v7+Fx7+/gP+/v7+O/7+/v3+Sf5g/v7+/eD+/v7+/v6h/v3+Vv7+/v5u/v7+/jz+ikh9/sH+9P7sYM/+sv7+s/7uZtD+kM798nr+8uyem9v6/cvq/b2l/ruB+vPm4bvo08uf4/PJ4/7t4O/q1v784u/13/Pv2v////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////7//uIvCtQAACAASURBVHja7FnBauNKFg0YiiqEC7IxiRUkkUBwaKTMrLLoxSPM2kwGtPBiCARiyKYXvQjduJnQSSebnk1vC1FfUFBaWaCdoRYCISTewqAv8HfMvSW7G2bmvZ1NXvMKkrYVtXNP3XPuOaXs7f25/lx/xHV4fPhzABncP49/CiBXU/Ny8BPgOL6brZIPv8uuw9M/gkImU1ro4cffueVk8vj6uXc4fvxmcumfX/3WJBhMbqf84bUjOZo8fisMkeHy6fhH7SeD8Xh8cHAwvprcXT9/DU1bXh+9bn1MpnHRaqEy71dLrsOTq7v75+nDw2zmLb988fxYt0XRsujTwSvHwYtKS5XLaAilng5url9mEkovqsrkBr5VuPJgeX7zmvVxhTgkESo34bD/7uTg9iXIW4CgtZJCEFiUSK3d0bL/7hW75vj+W1tprFeZzBte/HL9kFS5IJRSQpJEWCjw0o2Wy+H7k1c8eB/yXNptpzIZLb1hZFojqOMgEkoSIaVSmpSj5WK4fHrzChF0/nZ871bEcToCEX/o06owGvthgcA1IXWu3WjRP396+vyPg9dGrqPJjR21g2lV2e1HKKSM3LzTBrEgCGIRWmf+cD7v//Mv//784cO7u8nVwcmrsfmT+4d36ArjaVFZFVD8oilDDEAnK3LSUY5kvueNoiD0Q5dqY1QcfH25vhm8CjCDZ+XdWCCt6cpGRWyW6DS+BkJL368ZNEooDXrJqxZtxdRf7yfH//PBu0Y3nja9y7/iv5BN5Kbu71AEwSubqyzmMH8BCLzsMUYT0L8C4zEqnE7+O0b/bbcqGj80lX9xsHf1VWl0Cyw5Id9rd9zMtqUbvrAS0b1PkoTAGyERFIvrOni5PfiRXA4HN//6+9FugRRV5j29uZslHKmVJGtKSXgnRRkFvLsgN1g2nEMo69vxukh48PX5dnIFyQxT2Yv3/s3pboFoVS8+v+MiZAqhUMss8A0FYcVfRjHD6hEZXFwXLjZdgWWR4e0gmqoSZejPZkHNTeHf7BLI8bSVUgfzp0D4NbF96EYXlmZkNPcdx2G0qz0R39VvWyQ2wEj3M7RMhV/wkUYFOw3Jp4+VJnkeedxEkUthS6EmaxuQukwyWgSUOh2hAEKnHgvFAkkQiv0pvuzQwlvATp3A+zTYpUgmvCIyV1HdBsPQMU2x2WegfZ5480AQB6FYqa8n2Y/Z3LWQdh1LOrzYLSVLb/5b57MtGclDgfwWrimXo1gVjWEJpC6bFnXi7fvSVJIivdZx5XtP4AXQCLkE8ulI190BATpn/mJ+drfTAXzf5riDIlce8KgqCpnpppAQgoVQ3plH2tUqd9KUsw0SaBiyCvael2HgR5HvB3XMkjUSyM+KB95iuX+7UysZh63dTQGSH5YGvJqn7apNoDm5Cs77LgApSJxRnQP/Gd1MAi3TcLTY3+/PFxDsh14UxPApDPSRumHkwZXF7U6d5PSxVVYBIl72RwIOhMaVwDDoRJHT/rlfNavGuCkeczVjzGEIJlHS9Yf9/tLzw9KN7XI5KisORkO7Rl92C2RvMKsYLiqCfj9om6ZQLjRGymZVGf9ymTdwifUMQmSccVxwM4cEGYVlvBkEFAeZzTGIZAlt+vRxx1n/TuY8jrlDRDSfu6tVU1DeFoaLpslF/yxGIIoiQohjHG+lBIJWCbaHo5bbbXBwK4B0wD6A5sRhNOp/3vH562haFaQk0tHS2+/nK9AE521LUprD+f08KgBaziq4nOetdt1MVUUrsTeIwoH+MLrh3Cbxwyks147//H9y8Tb1PgMkcWt0oRaXywKQVFmsFew8k3qxr5tVoTgwrcl1azKwzQKQxW5ZupZmthvrBepZ52d7mNHGnU52SLBJXBREN8Y0qn8xaoBdIsviOIUqVQ1yryrCuWxbDdVlYDYw2nTpw5zCCN91hK5xAJIk2SQBaBrN22/3O7H44yOcXLppdLUCJGJ+4TeokNiqmlPpvaUweLHaBIJ7wlJQf1ERfzGs87YAHWVoMQTlwrjFAvW7sfUdS7wkZ9MdmPzxNfgWyGTV6HZlpKHDC78wpMehIQy3NPvV05KsdxzckNGqrfJ62Y8kDAAAErspgoQ7HKeHN7Ee7EDmcmql49AU5tj2E+TpePYy2DuZgaShJ7C91LvwjQYtpynsseOQ4KxWZI2ks3eVc28f3BNJ2Eq3zAj4ox1YViVIL5uNN/9HCOZ/utm6Vu7y6OPe+FsLSGjOYLpGlwHpGNJ1wVt2VsFYd4lKHfbnoYTpVVSaxamsoDeVbQojGHjs4II8T6g9Bdg3dPY8GWwXzH2RvD8ex21TkCwFi+bhWdBVzvG7yBY+WfcC/bBHFfPOhtwoCF3II1LZJ8SyZw/ygsY1JrDIt3aJSGwWSCBMxg/3d1cnR6dbM5JWeR/vHANDNUthXDnuIrABmFnJinBeOqm1PIuE6nJ+Fukc2YTgQDRtpSn4JODKan80XCzmcwxhQ28EedLhTrcJKVNVxWZTOBJv56HrIDS0/vSeKcO6YcWcKBAdvSySaBlbB4eSQMhUBW/3Q61FBwSaQhCgBKYVKo4gZkVB3a0wiEaeX3YjDJDEXOBjpKqdTbZjibHgMIcY7Cjv9awQytpm3R7HqcuWI3DxDiNjQkTnixjDMFbXdQk8R4BPgvOHfhgLOBcgqRwwFBaXYRhveAm9wQf+eXi/nTE24ambRcNMJWJTHBgDB6GyjCVUuvsBScu1tyTKu1w4GnGytRP2QB8QiRWDousYTiQKrCft8uX3xtrASROpdS/0tvVE/zHJ3NSNSnxysBY6R29nEADhl6twv9R1bcNvzIR3sXAEzjC+hsF7CBqib1nXZSyNySVBD+kijGMtE9IxYAfH5zXQ7/22/uz1KFOH92KuZc03SPwIZw53eSK0PyckiC0+lmBHaMqd9YAGPiJrmKUifASEMQjMxBq7VVyX/MFOMhcOlTAMltsDAjGFwgQVQksUOlKGM/9tTCwS8MBoqMMwse5CRpeLlMKcBkH11qARVobG3mOmhVVUgq570h1iWJJFngcnlTmOs/n11gLY6WOeFOBq/6HVakLbRtPwwSAkjAS6lKlUJLOBWXkHWeA1mLUu9qW+pKEEHcoSUhZSSGEWWpZhYBeGdrqF0r3sSVjYwsYYfBBIJwnkk8B4Cv4R8UFssz4Gdg9pnORQw2QhM+/3SXHS7swt+kJ+LBnyPXre932e9/3cNC0RFBA9a4YMa5KdRUPfpm0LglbQTBTvRqFGA0LGiQmJ5TIL8hHiCxnKhPgk4kKVxcUOhxhhhIKLmmOX417vp+hZXg6bw+nQzODcNlBIeFmHVTybIBiP8E1OEguECf7REBWWBwPG81dIIIGZHMflUJVGGul40LW8n1qoZ7lGQhkWmYtYdk4r36Z6WP9yalLN4ZBxSDJiedLJEo5DFMrB0DYpjbTJiONkKEekmVNUbWh5YoEnsW0hLZsRg7kwvmIJaGmiQwcL4g87mwQJmrXwEp13t3+fbmNiNSkGnr/DkGKNg8bKJhxCY2u5qZ3lKUtz6Yi3DNMfq/lwClvnxgaJ6xU1LgRqIJOkg00zKsvgX0wiy/Ooq0mQoBRChjorcylme4yEz4D+eo6jZceqIqARImn6opInpyTPGGMWPBZB+Aydz5EixwZjAkmEAboQzFmBB/Hw4ClkEndFeRqUPYCWpdaUICSQcowocM/TbLge5JqerDmO4zEZIa8IFJI2KsMprm+PNSKc5yUma5lcXgiFyA1CUmMIi5Q5WlGinIY3C1YA6yBEEeUQw6mPBT4erBJkEmikYYYpDozu3rl75+2QKuSoLEQEEdK0KlC+z0i5glvjfIdHSAoa1N+8K3FqUQltaFg8kS5v3/+hRhKaBtli+74BPMV+nuF5DbX3YLtAKbMmWPvs1UTJYrgXaZ3Y33my99WubcvRGP0/ihToyOX4qV+gOY4uC6ZHhnMVnFNhzgZq8egH4b3PyFG5VFosjmuMndWg1w9lCXy/E+8+lwvH/FgKaHausm7AgRvm16kPGsmlRcqDfwov/iEPDY7jiaznkeOgVlQCeQr2qqjOy5IFeUKPCXk+z2/vVBa0z3Pl7UV1ebJ8psoiR+drlUqlWrrvilzg0jSoBgeR6skiuGBBkCSpIEli6DlJcWOavrz7RUpIhqIq+n7IBjlww4Qv7xyVSsWAYcr/3tkul8UpSQeEx0IwVZ5uVbnaolLfXLVHZ/86XiwWlerW8mzzZKuiBvM56EUgAANaXK+QyifDVZ73kMuOS4CVebWfxvjrgfzek2XSMqU8K8iexzCXlaf1Z0fbLrf4Y3Xn/o5gCRKl3j+qnJ0+/V2penlyPpkdHh5u1pdPTz6sdF2fHVwcL8rFshKJIYOHQgxq22MzRnoQcZA4gA01DMiE8owd/v1Pt58tG9+9MzyZJwmeU3ZKxWKxUj2u/7Q6qy9KR/WfTuqlI0UQlFLl7Hw2O6tv/ng6mjXag0G7O5nNJpNZo6E3Jo8vllvVSqnITC3s3puovSeABiQx3hiljoctpuehCRoYzaH4Zu+2P3tw78k7E419mOzYPa4vl8uLi+VZbzabrTbrF6PR6Pxsq1isf+jPuu1W73Qy6+mtNlrdBlxIVvew29ZXW9uk30TPnTKm797HSJJhkZyTcX+DYw1oZwjbd57ctnHZ8w2mObQ9zchUlqcHswbaY7t72Jj1Gu3GZDQ6/d/m+eFhu93Sez0dgRi04wUYILhaLaDo48fZ5C+Xvom2nkHjR0qD1EgSI0MalIZKMsBBQKgmCE1TfP7olkl5FFqeQ5Ae05QWy4NRr9HtAhL04OEPvd/pzSa9+PGjbXcxhBhGq42uoReDwWD2YZHzUf8MTADFRBZZ//XJBBoYkTkJkCDFZEKxELzYf3DLSO68tfGTMuTt5WTSa+hxxCRPXW/gx64nSBrdhA50r41uJUjao82F5jfJDDZapP8eXKSTyAjZjA8bBTSokGU0e4nc3Ye/uWUgX37xHBoqz8tY0uLHg16n01kDaaGvq6XHC93BfOmYD/3qzb1Jveaj01TkwMB9mRbux+JGC3l/EXwoKA5ekeDu3X4dvrf37V8pKCkZk6ucjzqd/nq7GMYaClzvx1AwH8mf+B3o9eS8UpRksCkOeBnDAB8JpRflNjaVoRREEQu6CaJDB5zwej+FUeS9/W/+NkYDCCOqnk86nastrhMBE9KC6x10c01RS09+4NWZjDa3FjV47CDoDGEaaKaM/HHGG+fAuQQiH2IDw7IB92o3nan9xp9fOR7IlaVuTRASvLtP6Ej2jpHoN8KttYasd3oTqNd/KLHz/NxFVotiZFEUJUkIkINx0TQvJ0Vsfj5Xnj9Kx3h9+fC1kQE7QfGL5aTXubm/1U0gCEcMJckQ/ZoRzFdj9vi/FbEgcMhsiQwDvq2s5JVyzY1wegTQekauW/46pV5rY+87m0RAvHJlNbkRPqvPfgMOzEinpV9lv/4JXe2Pv916pmTxhyZRA6/l6Fotz0LAxUjcIIiCIGC/T+fs4d5Lewj9BM83tUX9tPfZ7j8LLr0VsxKvDuJmhQjp43vtweGqqsaTOihhDGmamhipbIBWjAR+025U20vDP97daw55VGWaQyhdk1br//NjTUkHwdFjBm4kP4gnfjUYHG5WZQZXLEh20rZN2zfH6LMTaGEgUeSCXX61n8apw8YuiQYhGXN6CaVLb/3aAhw4UVBkdRIoiVzGSNqDj6utSwKfsJIkslYG/niYReLiRasqjcIL0iW/l07XuPEN7zebTT9cbI46vwBhFccagtHC3501krga9/ELCK7u4wVnkUhDKAIrIgHNvZMlTd8n5EtFRfFF55XvUzuj29jNWYY1pI9PfgHJdb73+2jLSQmLoVzXLeS+Bu3+RUWwDPCQYH6wpSfQ2Rz8GEtqno5ThS5+nd753MbuK9Gc5o4vRvqvZHvrKjkSLJ1Or4fcQMxJv5/kTOP0rHJ5Peg3wKRYhAc9fl5RaeiMaXzM9SbFc9OvXnD21F48nbSvcHRuErJaA2klOJLVw2XrynvBeyYHJ1WlAP3vmGfw4IiXC1G+puRZdFiHkAAUQd19mNag6M4be/heLp31BoN43xBLrSvZWyWU6K1PSElSBZjp693Y5UMDMDq4WORCeSyAqEsCKCGNcYDjAiQxFDfgIuXblD7Hsk+9mzbd+2ddaDNWiBC82+uyhZFcxxdaSEJ6vQn0YaPZDFv9GMnjimSTnhMKKsh7TVVrkB/gVmIoiJZYV6J0CvGDt/+xclz+6KIL3TmWuZ+ZufrYJs4zjphAm2kYTkMIFC0UQrxjgni30zxsTbI32a4sY2VWZU2WgzWFoVoCiYrWkEXaEOuidov613o7Ok8X3JNOQDrGJovupKyR1vM2bgfnsTAZt5WQRZTKZ59N4q/YSfa879kB9n+cPXE+lUjvL8/X7/m4d0p3gspTKChu8euuTsfjjCwqiqKV1HwzAhVzWED64cR8pv+fV27e/PL2O/ts2KYAA0KCPmFPaWHZkPbw3je/dGDWZiSyQb5SqZQ0TUT06/lkor9Q5uCQpNOyBBgibnuGymSsPoyEx4Fg2T9399WbX/ndn28c6CJScHqbDeHAUJAg7ezrurAh3OvQT48lUqkuwlwoLfvsvkijXlMkMBihReexo9OIdqGjSqIiapV80JfJJs2UPehtqBUBCc4rdFpyuwhg9gf6gQUTBFQjCVSTGFtIEijZQ2rcGI/f+9rJt35h7Eq53FLYG/FlKMoeyVeYNEDB+Rz7CHJteIFL19Smm6Rci8mcz1vSFFBgvIyAIJ1AmS8v54ZQFQLv2KyQMRmJoXUsXbPG1zdup2hwf+9FS8pll2RZqdW9dnM2Yw82JJnh9fzNt6kWp9Sb9gxpyfgzbm8JObvE8THUbEFFJY9K+viyf19XCq+pJlpoCIdjCPsKisGJ8Ysbun432GdJhTIlGWxHqdbyPioU8rtVBeU/eqqVx6doZipCZUMZizuiaooip8tliFktfi8IelbhvNSBYwiI0UGGXP4hwmFxAFHR3d7489dPbfS+Wh9pJEOqKIG/IwkXrFQy19QknZQAHA6VUsWsGZShxgSTYDKZwqZyGXwf/4GcTqM2GE1Leerula8nSCqUpazWbNKFgOiReOjs8ImDG/1Y0GCvP+HI5mu1qqJIlXDYFA4Xfef0apjG1oXYSTxcVCvh0yNfPBkbKywXi+GKJGl1EBWkhFpF/BTE4Ts3js6FbtvBizTVfcQPpJGwIb8x/nBLB6Tv8pzRHKyuNfINteEtBsaePBlbzmu4Gm4ZF8/H43I68L1vP7KCXupr9UYziMJwLms+kkxmM944G2ckMU++dOVoylXAylWUgtky22WEUJwyJk51AknvuMPi8jUyMy8mQ6QPYmvDWzjvU6V22Q5ggCnGZeGLR+4GYFi1Z3LJgT093QaDYRqJIRSOs7EpScuTO28cIO2aDHaniYpmd+HYa0x1zV3oxCL3/otnfuaijmbhSIbunj23XZbVZtO9jEtEnU/qnDFebK6S2ZkBgIDPf23bLcNMyE/tGWjKZUDCaU1y55V9Ia8ic3m3L68p+awDpxRA0pknaQf3v/Kd5A53T5LKdk/DKbt7BszWyJTexuZbbJgDOkK9bMAIdj14/73ffPzYeb3bf2dHfzJbl1EsZqSIZecd0ldTVHvu+HGrqmgZP7Yuo3HW0aHnzfve+U+kcdvfv7r1k8MffPjHF64ZeqhKmkXVbatAAZ4iRszd5uzV606nc2HBiT46d4ead7+WHKpxYIQsy0UydxMZtdrIfHp+aWkkLGq+kM1G2EArCaJDD5z3vXvOuka5+iO3/7GAxHl9+mGeYxEQlFJwA4XTCjlr3v2HwwjF9fcRFOeu0I6/Hss2FQ4yo8ByBWqfP1KtW4+PLC0FAiZRK7gIjAQY0dnOPHHW++75XL2Q/e32JELihMPuejEooeZWq1aB0pCJFfN1dfXzfwOCw7cMjxGgXdS9lX5rSdK7EryP8rtrNfe5QGBp5DTHyWLQNYSREERXh64z2H9p7EhTPffSfOgBANl21en8xNyQWNyta/Ubgc5z4vzK3YGvOhcmFgzTi9FodOJP/vmV4DKP5w+QUawz9jVFpc4HwLYCLMMgSpkC+yJSQI1Pdubp+bOFT9214o558sHC5OTVaefkx4uvcro+4J3Xa0eGq678fuaDqMcT/fvn0VGPx/MeOT+vmjD1YoV4xWqvK2LdinUyYiqnJbvLiMgK4mKzts7caPCjsXMZTa6urN6HEz7eNjEaXTwqtZoN/Hpjgqut3AstAgJPdAIBiX5km68CfYEMj4ZDQrgkclIt8mgEkCwBkgrln7WhBvGQY/zSmc48ZIocRZW1lZ2LEx7PxETUg5E8XwRDhSutrHTdB514RkcByejk1qPzMZMJlyiIDKfTNEJyfAn5SdmUjiQdc+MXh4eHT/T1dupmpsGz53N5WajOkwseLFFXQ3qmuYoqFR7K4trKdvMkQoHAeB5n/ibpQIBAYoZPM2JlbCwQGAmYTOVSxmWc7fjlEocuvBORBKHaXMQOMDpBrkloYFWJrSd5TI3BABeRRpBMmhsiAMHWhWk9fOamAiOgkoCpbJIKM6TR2PH7PgYPnnFzcKg1H0CBf/dkUGNi+pRXb0rgF5Qi1XuO+xMeQBtd3GONpQVd0JybRkqZEgDG6TCTLotNc4ggNuMKlm/a41B3lIsP/zI5MTFpLzHIttj1UVAMq4QVGMWbm1kEMT8aC8eFNpIYHlDCF7RgiklQswDpMhMEYRnuPJI+hASwFKyPcmSkxLFPp7+4ua13UCEWSxXvcsFdKJqgwjKtq0QHAsKgDoxYzedcKI2Qm3B1Se/bGAmSCkRT9plRCq8rBSFBAUyvE8tloXV23U3QN2VUTwqsrKwFsy5jF0EYNwPJobeZFhCoa2kWD6xpXR8xnX7R7fkJzZbLZXRkgW3jiCEfigO8cjnOlZqZpD8xiyosxyb4ycG3JKENRWDbk/dWc7u9pkLTrRmWrgoBfYUb3OhnTLhQzIfzXjeVdPktaLKYmJvdhLuK9p4sCS0cwrqP0PrUtzWKi7Ump+1NnJiA3lj8azFBVqmt5iwUxDMuMnXpzBuXLo87xscvbsKNXq+p2FFwxm4F4Bhu2rVZy9T60Hd9CYfFGsEDIbFB/Yu0kH4/aRlKOb6/d//BQ70gm3E12YmfiIKOhF1fV3k6iaPbI/nYM31jfSMH/ZakeakkCfQdSBbIhU29W23vm3X2OSD8MyNFGvckny4UYLdB9qXbllgLml2OlI7DMWTZ5CvJen+slU0YiO7cyLA4WeY4hvkfJHTs6W4RfMtpqm/g2mLI77DZLCELkbq82bfEnfi1VBaE1ikRECgVK2gcwdE834rB+mCxvVjECpUYI5WC2Z7pW9t27/7Ib/vVt35waejCwS2bDqUuMjTK5rQ+opaLVisaR+Af6c1uDInGCR+xE0bUvJmB6WnD7heu9vQk/a9sGewd7tv0y6IGv3GyURP1XRysEyZczKvegrvCxHQ14cY3316BFOKilrffNly7Zrh19eXPvvvZwzf+b26IO3Tql2tVES0/6jlwShQ1EfN7bFyYVHE8z2N9xOWS1z7TPW24Zej+LzPnG9JGmsfxGjIEwoBDkjEe6IvRSQvRFxFNMCVRiem1IZ5dEV3q4vbPC4+r0PXWQle4sse9sX0hZbc7lyUc3Z2OZh0xkGQCKaRxSMiGFClIDQZixpgYCSZe7R9pbfeO3m8m6b107+AO/MaQvHDmeT7z/f2e55nneTI9gtFqnextOHVi9JtPPv/Du7WnDx+KC0B/g3vA1dX5+YfSaLe2Pge2QGyJWz73xzZlCM6yGkIwGo0CKe89WQ+2bLl6a2xfXOqZ/+mvPwHJ/I8/VMftYmRVl31XV5/Ov3nRZ9D6cblcK1itViOpwWNY56kTppb+W4MDL9fWfhbr/GNtmCV2+N//JI6E19YO9l/0VdQqJYtshRxOp8NIgjVA0n/qxKmp8+a98wPvjo7WqhvQISe+Fzd3P109ONgfGDu7Q2qUwEFa7bmcfW4LjeE4TuNI58kjOdUydGlSVukbG9h/OQ8I4MTq6ss3ADG4WUmTKjwWiyFqkyWXK+mTKIphGIrT7T0XT95DOlsuXJs1aiB4ZIaus+fHxt6PnR/s26zs6PXp0rSZiEXrk3pnMWfJR7jmZkxE8ZGCUbg01NbQdHIelny6qbWt90srxAyGxXC/X6XRaskQMGRLtld7h4c2wV8fjVhyRadeHQgE4nUKFPepjVaB+OKLT6/c+Ky3s62xsfH4n/Sf/n8vOTa1NLT1X/zsUrfVoUZxKWhQXKmklcvpcdAh6FWaYNn6jVLBHvKhzRteLhDHENLoMBI0648vLi4FHnw62X3lxo3h3qGOxoaWpqamFkmtLa2NbW0d/f0d/Z2dQxc7/wfPYmhpbOsAdXb2d3S0iZdPvI1oaOzoHOodvtZ9ZUROK3ucVnkshkpClAiGKwUJ43AvS/hZmq332nKy2Jw1yXk34tiCw2TV4phPE1h0B7e2gsy56tKFbqS7+9Lw8PCNj5qdvTJy3XR9ZGQk7ZgcHoIagDra/ptBWlNDQ2ut0zrdcfubkZHJWf3GiGn2SlU3ukEjLhfFMDzPQSukFJxGFMcRiYRFMVSpMh+OH46XSL+fhmvf/CxnV0TszlC8Pp50WJwC3sw93uLCQY7Rnaty7PIenud1rkUdiIET63QVcyK1bavoyuWKzUpofg+a7Om5e+8mmPcfdaktDf237nz33e1OyYIL3xS3U9GsmY+mbdspxkW5XC6vNwzFuijK5aEoDkUgooxQO0ABFtyPyCWSw9FpgqVB7HJMX8jHDeZ8MhZMWyxWAk/q83N1blcVQrTDAwpzS14vw4tfPQy/+NpmiC6ZzQyA7FlVGhAh5NNEerOr6/5f/vzVr06An776xzv3p6a6KiHZ3RGRxAAAHu9JREFU9cm79659mauUy9vFnTJvqTxZotxhNxWuCwRcwCTJ7ZZjogdWhxZQcBTxiyR+49744YQZugyEpv3LuKmQrncbZPI5e9HZwyIZ+NBu1DjO7TJi1T2cIhDgKE9VPMPbzE+i2WIISi9YYKymIkJn82o1sfnLhw9HB2/+fv9C0/GjqKE7H94eHYypyUxEnXnxYs70ardczpp15Z3i9hMACYepcFARAGc+osgVCoRmCYeVFl3xL/t9KKqxjY5PvNfTGIAACWIvRurrsYy9YDFqcHR7Z8dAYrpqVFFeqD2EE6WQB8ARRuLg+cWdV4noetEULafye4K4LJsZO+ojQ6Hnb98erR0c/LJ599j9Ur+bGewbeHkEh2QSIXXm/NkeS75c5ov5sq5kXlwK18SFRQ7x7QYSeRA6CLbHKbCQMnDnAdFG5yfOvDCwsQAC8aVcJi0WrvmxqVAwEXisbkmnW2zGvfwur+M9j7gwBKnHQ3ncbsg7hhExIGEYszlVruRk0dSKza5a1mjVY//cr8gSss39/YH3g2en+i5fPu6RP5/MDPSluwaf6xcSmVBITWqE4utyOVGolHX27BI4An+iEQAhviQSBaIIonJUZXUSOM4uQyMsx/CdN++6WFTuo1mwZFkoOrf0xT2LAGOtgAuSeQlXuEEU5ZVO54GEE88mBpmY7ZAl21CwTgywaOKVkRBIdWjsH12yjD6iNuSn0unp55d/GDhubqx1OD1lnrZlNLIMkMhIjdHGp8qG3Osyb08vuaulUzUWigpzXiChFW4FisUIh5EFEtrv9ynwxP7zrTjHBXx+cUneWnTmCwVHeywOB7hcDMPR3mpoUh6JRDRF+uClJoxfXDLYzpVfF7LRaH3WIpRM6tBCJCOLJBJajVI/Om4umW1Tsx3HTTJ8PTNx5syEWUPIMhFA0VjNVCqVzm2neLvB+5GixiK2W5iXCtAcBHk8gAuQ9H4lQitpDHt2ficeXglziF/cGmEq5gp2aHo3xIq7gaVO7q76WgMQQTy1DAExro1sSVf+7V4iGuVKTsGmV0NlQgCyoNK260cnRkdnps1fHzeH3Hp74gz82zRBaEOJSKRGks1tRz12/QaQSJeQqsYCxAaGYmEvQu3uejgOUxnnUKUfQVRKuadO/cDjeeSjkWDwAUvYC0UHgUNcrVNhydaAV3TVxUB6fGytPK5a8yt5wpmyqXJXIbLBPbM45myCOhQBjkRIq1UTofEJUWdmjiOBfvBeNmu2CVpSC0eGCIfdHU0ZCol6qqQPiCQukWPFRVVZghgW8MrF5OXiCoQQUEh3xWMNsi73r6w/oDXJdc+jICtYLIKSxdy86IhEAukFZ2D+7QVTa3vF1pcX8yhjT2wbSqWk3p61WNO2HnUElFkgSJJUzcGlnp4ZHf382M7+dGtvCZCn1SShTkRkWof9meF1xJI1bKftGTclNTJi8a6aN3XxQABBGAbGXDjrb6dZ1Pdo/bFGjiCP2umtlfX1lWSQ7jGSSnH/ig9BuGpcut1LYr5QkieMhCCBiJ4Ay64rbY9EnE6ZTCKZSxMyAElENBqSJFRTE6Pf3v3Tza9+bTLj6vjE+My3apV2IVPpMxgteUu2zmrPPsvY9YtMLaRXPmY9T8HglqUZL+r1biiMPUrWt7WyspJULfvp9iR886wkH9D/Yu58Qhu57jiOhKaCQSAxGq29sHvwH/mgnYM3Roq9WHZwTNZGpc5inGVxCpscurTdsG2yUArpPSH0UMowMAfBMHjQCA/MP/CARjN4GcToVjRiBEaSZVeq8KYhxTmEhS7b3xt5N91TkhZivYvti+zP+73v+32/7w2eTl6KO2AvnRAXY4KBCsMghxCAwNbLX8CgH4CE944adWNPq+UyjaU8QcyiktRqU9BWiOQfYWm998nD77VfMw//9HB38c+Zqdlbz56ddNbbmVDiIKP5vRpawAFJINPgr7AHrOooKd4BkkNrOQ8TXzRN0+vuE13TNAzDQiS541qzxEoSA6VDngra4MXmMdIJ6iHBArMDJrTASg2jeRhu8H/vCUs5HAfBA8lBst3BHz34fOmTX/7qve+/npibvnJz+68//+qIfOvZ7YPZYS1+3QlpEitUL0gufApIFHkkWksoGJuKhTOHvf4mARI3TcsiuZ7pGq9ITuebZc3xywzmpG0+DZ7t1TYY1ADtvTA1qJUII6nYtWqzdHRUajZLw3UCn5idDVfDU7de/Lv1aHfh7YWP/vDRDzlfmlt46+tvv701Vf3yKDmx2YrH1eSeL0kNCxgq9AUJQoJ+ojpqBI9JqVi+oNWO8ziHAYDp4nLjOxIyd1prSsnckcRiKnK6mgQfUalIyC4EFQBxIG+KQPhRQ0n3MoNBNUs/bTa/XF7ZJ6aAhZj/2fPnX2U20JOe135YWvngX3/7+p+3k1OzyeREJ6fF425Y9SXDhcSn6hIraXpIMyoIw3GQfYxqon6UibeOszgpozVVxItuAGKYQEIgEjV7WtAlDkgGfAJz2EoogUZUB7cSeJRg1dn2S7tiV710+aDRbDZry1kcPd2HE7de/OP5iy9+xE3k3JXf3/7si8dbW6u7u9u/zVUP/bplSpKxp6vBQOJNFJ0RR8LBFE3jWKZePzlewXEKyaOruAduwAE1wQISf699oAEJeK00RJqoFoA4YKu1YLAMIoG9QIKhSVLdCtebZtj3D8vDTSKVevTo0YOPf/eLX3+28KOC8DRKWlfRNdPkVqZN18vsAaAkkzs7mq6GoiFIcXdfjp0HHPR6Jt0sLS1PpUhQumV1RRNIAMMyuqSi5I6/afKa47Asp6G5ZyLQ+YNpSEScYD7kCMyMxCI/BPkYDV+CgpTDrg/Gq7DyJI49uHcHkuu7//t/L5jeePwhJMR7H97bXt26swFjlIKDHAzjxo2tB4Ke4NNNr18gZNelMMPrklAZyzSKFEZ1ZW4TkdASywAJEkSZjYgKFuUUmOi7u1ujj91a3Ybfc3dnJxSBkXBUN1w/dA8MKEo7j6UWV///Z4umZ2agRNPT14KXg8y9/sYF+P7mjh11+FK9epxXZLfXK2IhjIKO2MWwrmt5RlfMH8830cqxaSAJogAthSJOAoOMee/Kq88Lbhon0STB5ENiX1hAePcW7/7m43urN3+CI+QNjY+ppbLfOu7gXdPr9UxZkXXo50XT82zBxZT8+XwdyQBIJH6UBRhoqbCMHGdx5rVp+a8vo1lDeJOTMz/JEd8WDVNd9tWT5RUFSDyv55Fc1zUtD3Zq0AyGZ/vz8TKADAQM1QSx8LY02jvujs/rm65tQ9pQJV9bWifELsgcvBbpztc8IVC8ASSdfgtIwITYmM6PbA46lAkhze/cHBuSyUUmwjl+vLGWwwkqIDFJs/cSxChiykq/rZZ5pgQkUR5KAs4RCsSraPOKbYwNyds6y6WSnes11Be70EI8zyVMz7oA0SlOmVoeglNxXdrGYihfjRLVoBK0lN2xOeXekjQFy28m2v3OPtWFbmgCidULUCpQEg4TieUlrcm2l80yxiELPEoituBAFnhN8pcsEzaqJLIdHfriPi4DiddzOa/WsF6iUCKx3jcP2ZNlV4qJ9CgZeDbsBxWInM7YCGXyPhMTff96o58jRAXMCmzDs5xVbcAqA62YLqXs44XTo3rJTOrQEemLE60gHoSAxNkaE5KNCoNhdT+OZILJMgmBt+diQq0HIJZRlEVFUfDNs1a9JPkSrYlS4OBtAUpi0ZUo9PIxEcrcrs1wCSBp91dwKiRYRZKCjVfwTLcIzVGWi64si9mzod8Eb1iROG0wimuoJBXaSCTUxbG4yZ6b+dTWRK0cR91EoVxY/tAKCTGCiSInoyYvCMUut3K+ZtRZCSJvLPQdiQBhxwChjMe96YLFJLhyKd7ob+JikNw9y+RwjurqqLUgbetdeWrtvAFZDZJIVEYB0auirGah7Ksn1LEQytXdgcRF+JLfOgeZAAlEX2jxRKMBSawSbF+CBm745CwTlySW5jUM5Vyv3WBfHtOE1O1xEMqVT21V0fmmNASZyLJrgJn3TIIEEmPEQguVbpdrnbWv+xA+BAYzbKFinbRfHdhV1MVxsF43d+gI51br3jmYLgzToS+ahksQ7ijFG4ASkHTOh46PTlfsCAiFrrSXvODKB/EYoXEQyh2bjj05yhnzp3kxhmEhE4oCJOQFCSqK26VIcWptzfXrqs4ODBAKzc7359O2cHG6oo2BUKYff2Ok/F61PDxeEWMRF0Ag+8LqQqUxoMGj3alIUZiYOz2KH7rrLV6AoFw7aqwN7bSgoyssYNm+/AdxbhSqEYyxm4O1dQIXZXQAASgmSXk9M1haFnRzr0tRSva0fdg0+4V0OqKWarnqcO1EKEUjGk1XBPr+5b8984NcNZYQmMP54zxOkARWdFFNLAi/nhlgBJKWCWV/pb9efpqueumBnqqzmZNhbdgqaTKgCIxQuXPZz0nMPTzZS2lM3Ye4uL+SnUL3sxSkRYyC2gT+Ue9iokIQOK7k+r2n6XTatiXRqWutglor2CUtUtQY2+a3L9sPT37exp4cVA+t5QKBJ7MUOqajIG6BkcQojEP3vhynEJkMSeLZs5OnwU17GcNYqZrLVAt2ekDrusQPBvcXrl52ScKpUG4zPt/P7pOdDmWBD3apd94JT+yFq9UJykSjSLZaEySxcrzGAAhTZqOcxPRq7ZOckEY3SKoEQKuX+wLQd/9STcSsWkNC0WTiYIVCxxET1TfRf1x444033+96kLdMl8xk9kiSKJzVmjwjaZKG/YeY83ltG03jOAoSAiGwUezxDFQHt/EeVB88ndbTQJNlM22oyaFkyrAM08PQ65YeZue69LinHPYgBD4EjKiRhAVyJLBBtkWMEdbVNja4TqPmBx5nbpl/YJ/nlZ107uPkLRQlJ314fnyfV+/3zYEXeuF0xz+HVT4AFPXx7p1bDclG0GE9LfCP8VxgnPrYaPX6a/6DBx++fwgkD1MwuHS79cR4NE6kMb0Cw6xJ9SLV8cLz80+TfC5C6Zgq9eNttq+77/JKJ+5lgk8nR1ziaJymGo1eCCQfAOXDhwevUiQmjcT730fpdCJ9dtYIhtKTlWIRSf6YhtKo752fe2W741A/3Gb7+vKXvHHAm4PW2VN4z6MaCHuj10/53wLKA8wuJOn3GtnU5HQ1nRLyM2kYNKSWVxShyMNPvjSGqQz383ac77y+xfb19cYoGMbbYm4GYrK5d5Todhu9HpI8fPjhwbf/+D7VCHtQ8h/TI2mcWs0eXa7bA01TzfjQqyuZ3GgkuXKr7uKWiz1wb9ET+SLfPIzZFD/a2qwASjqxBiRhI5XzU2vvtx++ymV7YR/C1M2OJqO1tZQwnfkXGa3DwwaY4gNDKoxgB9xoREeW6k+3VvP3/zsKgpVatzl5xHGMjlYIIdvt9UBQQAihWSV6IYlJN1uTavgnGGAPPBjycdnzWnWGPzyQ8qEXmSPw6+qtacqd/xTkgby3ymILhjm4pFc5INAZgWGtksWXKkIXx+CEIOhCIgFCXxF2JnHR7DebDdet08NgLHnn3sIf4ZV//OZ2bjx8nZcHar8X8092uIpOBJ2hLZjsGcqmSzRNM1y09BJTSh8l9IRQSYzDgQHlsdcttlpFxW8E3tWu3jv/4eWtROWrNyMEKWtbx5uVCrHWMZQDi6Iohy1ZgGIxDG/Bg0XzzOomp0PSTbf65qjZ8mvoUVByzc6BS758ke+r8j9ffncrYiJprUY/82qW5yocgvBUtFiWoggJjU+ObTsUnUxspoWSzj06mRqSr7bG0LE8NfQlO87WFy47j7Ze37+NevfdbiNz/m8MCRdFBClYIECS6AlRcLGlxGaWYTjh6UlO9sMmtN9yWQ1aO/4BH6dsWSV2ArN08Prmt/TPC03nozvYhpDAKuklC0EiFJZiLPghCgqFhBRlJRJMVoCRZUtT/cK4CCpSDuowEZsdi6Zccm6tMHH7xlHu/povUmvD8tbZJpckJCyJyIKEd4CEjUjIstmSUEpwifVZ7iLj94hzz6yPalKoORbPIoqq2jxbvGmU53n/sLESO50VuGQbSZg5CL4+C+8Wkexfk9T3BejR3N5s3bgwVhro9nDN2ng88lTXoVn8XKy4cd5Wb7ZWvvifFASNehFCootAous0+9miaAaaGIAAyRwGKh/Uk4OgXPqDQa1GSIqm2yqEmue5FGuXFdm1LUpR395kB3v+yDRcM5Y7KXDtWBIqnrmisHjILjR5RgQLEMcBlUFzZ+0SNvT9ceSrUgyjIGmYWTaFxkiXZmXF+3n3xnTlzq/jQG6ZxvqTzWpMRBJrn51HhQZtpFnesom0UIuooNIQO7cwPZEuMs05iaJMCrJGzESkdGwH9N4r//3ejbXgpiG3YIeFIYljxdP7RD+wwi3YvTMWT9WdSF1IuhHNZPRSslrZmz3RLsIeOW1UympYkCJj1HwCI15C9fUNHXTtFvpGWTbWoXGJYjvJVZmoZ5GXhiIp4YhCU5+T4DMNjQE0ZX12iu0LbbrAYjQ3JEVdeOCUuUyqPz+/iQy7964A00aQO8lzyZjYhopnqEgIo6gQBzpey6LnJJhc+IiZp1f3ZpfnF2F/HgMjHD/qaWpkVpuDYGCUN3dvQhV7ZkvW1o8hJDG+zVc5y2Fp+ioorIVvzBETJ8r8PhtFh6YQZTW1Pvt0oc6nednoS2MJbXh4/ohGuLk/say+/HL5qlgbmm7wx8mO0I7F2u24ztHzOQX+38eiQBYc8ysVwUKWCIVmHZiVaytjCMpAibyUcrHo+xthhqAoZdOeD/mQZ+rbZSvL/X8FpmsG02NoXEMgEeck7CIm+NYw45NWxVnkN3PVhKpnVnPZKX5mkdHiWsbjeX80QhS0pRZBV+SFHdp7u+S63+0CyTC8hJAcxiC7xOSchKz9KJFKZM4vVSpM11nUPbuPopI9XT26vOwHMnZdhVwIOJ/kfXIRSFEoxr0yqJdhH7lUMXnZMl17+OkYr8Rhdok8Ry86V1QnoI/IARkGde9ck7CU7ZQEPyfkTybDoou7d3KzIZObTHyNkJgly12M+djCloly/5eWWR+GZztC8pCQdHhIoQXJPpmHkYTB+0DVZJV2rgMGJcRwq9vZzbOzXjD32ELb0sKJNOpraLRX4gxbvrIelNXM86V9B/vb7h6eq/9+fMSJAAJNONbGYpi/6v7+ldKTlivqpc9JKIfm0ttNIY+VUlZITFRVU2BLHEY/2DBHz93cWPteZmleozvvembR7G89FfRYDEnEocgxi7y6eumIhKtCEeEvKagfNmphupDbzkKlhAN1vhTFKE9GPY3cmDN4Pu5GXm6Cop5/s7TkKhaLwenJBmgJIekcLkjY68meKAfPcDgpM1EXxgkM2wHD+a+aielsamiqghiwjEDaGZVx/sp4bBw/JOEgE0lO5ucldbBd2ygGKo7zsYgkdk2y2GqRaZjh+VJFhwlAv9qkECKae799mq1dHocDTTOiCwOG4UuTSajiUZEd70CpEH99dFHo/O1SJPKrn0y5SAaVdgyD0hah7KvMYr+40EeMCc/rsA2Dscyi/rT01PZpLYGaMsAiJzBaU2pOiapkipbdYRzML3KrAqTl2ctlDC5fPIbcMqYnR1WSXLEkkAz1EsX+eUUkVQ56dJsrkdxy5jsWiklsb+cSR5dnfSSJoqKpkj+RQhQVhWbtOPoPFj4d2Xv2ZgkN7DsHQhJePhWSMYyJiCSHSZ29HiGjgonjzVkuCaOyqFdJrTtzFMcS/O3TFdinfBoMIgxsv31/MuoTgzdr2XbckiPjgYzHrplnS6j6F3XZDCYnG/OQiMlYACQo8tfqiO/L471ZzECR1DwZ7B1S9g4r1LZzvhBVCr66Bv9UzTt96oNUKoptHQAKS4LSInOL+tvbe399mbhygBuT5CEhiYM6Hh7OpTGqkGjwglGR1yttUYyLYlXHClqUCYhjurmWxn3KdADphBRAAyiTqdQyNK1IH5j2AW9f5RcE5bcXf3V+3XsMyeUf7whiRNJGnSfNa0Hy//au5zWNPIonw4ggA5GMcRTsQR09VA8Rd4sBtwOaXVz2YEMQES+pF8G0WNIcelB6LKVsSrOEQG8iU1QImCjMHiohJRS8biTCEjA/Ccnekn9g3/vO+KPJtNuFJB1KnmEMjIfvZ97v9/2+N3pS4aqjFV41MCObus2RsWyV7iGBhF5fNqyWy4a7J2fnLhcwpIRQQGN2d3baS6XS8nB9pVbTM0vr73pgzl9edVzsiaFwdX4sj2CkMrLBMPC9vWnQ0VVa35etYQx6AYkRsG5uG7OFbhUPgdRqeBiPLtshTwEkAEV2j8tb7cYOMqWmxxYXHa0Uv0FZmluT+SveXvHXl5pLE8H7RKiAPhiRJx8MDGQk1QEgdcxEDNk7d0bi2CiRrn6ChAYlonWGNuYpJaQicZLr7b93QHVcy/QKiJde9+cROWK4srLydjc4+eCKFb621MTg8YMMpDlGpAwTFFg5gVInqW69ToOHz8YSUZ/F4gkndN16Rb2G4gUMM1YNXOjkH9yuK7mIdK27PrbvtrHTf7j+tra2ZqwS6Vra2j14EuosXC0St7BSaeIhFbS9G63WBnj4EYi7wGPAyhmi7kpdW88w2cCUfGDAllQczrBSnGAKOsZYLv9zEnSdgoChcBUByXr7J/SORyt60k6jWyvujh/sTYQWF/KPr7hrwzpdqTT3DjEzAYrF4jH42kYv3g1S9HS1SqoqNGPUCY7uAyjIIRncJA6fxukGulXq6f74qQtZUkIsYMY+3ts5cv1cpEEE19bSgUDuTT6ff/bAcuXvZ7QlKi1XKHifmUkIU36fx+NPxrY3xrJ9XadpxUwBEmaqF6xVZa/Yw0l2icqmvf3j0ikYYvxgUF8q7twbB/GihytvY9MRi8XsdNiupVzkTJRa52eTgaiv29piDU/HEMlgYV6pejHVXmoRGa4PBpEKFF1W6nTOT0mvJpGwd5Viu70DpnmNnpm+3l1Hc6J0+svJb8LgY7KFhXhVTw/sMJDlggXoHwQOx3pRl+JVSAKTnp3AkAXcI/JlGTMvyIPPXa3tad81V7ucqa3TH05+vRAF2SJx4vrq/eXqMVpJ9A5nWwL1+sBdsGDob3QB4eX+4VGLMMWF5qtYPBrfGW+1jqauv7Tddj3Zf3HR31qjaYapEizEBoNzKYzp4n3ANkFfr9e6ISTuPWJxLy14hND+ARpiubCCWT1AeT/++vr3UPwvDiYOn1/ivDOZ1ZHCNtkhBYNcKBTS0QG7aUmQwoSyk1IbNuKImYTPFn69P1EicaTcYior/etn118Uts0fnwVV3gYXDmTLhfJquQCekcH6oyGb/CTT801Xq2Q/AoDQVcSRjkedbuf8Wed8EMlypTUefHwTBz88b04mVaod5ml+VDlHUIa/0exo+sJ2jkVIF3BIjhGCS8CazaYDWACKEJ0vooqQPuZi6XTmhobA+v84Vtk9swkNijeNIpm8HCH/JbuXxRB4DEUPm3jTaXwilled4G6LKDuZH1Fyzfhv6KSX++G8Wa0KJjUoShRZFk9AUjzHxS9WRGxJ3q5gNdntXi+X9pOzFqFOu1khSCBuWT+/wV1Gt2rkEJ5lJUqhBsV5TZeO/bujooh38dLgvWkFK+j8JEnmIZBcH9979WDoG5MvzlF2OxErr9cLIpa4lK/6AizOtWg0JAmQmLJxYmrNr4jOV5rN0sfjYP7btz14MsAJux0PQZnsIFx80nFZl7wcS5jCcqOGrHeWrNr66CnqfHPr4Di48FADky4tGflxo7JQoCe8yvhNf4YjUDkTqArHy0iG/E9OQkfne4edhWeaaNgyy0gIFAr0hFcZkOjJgVVgOY7lWRGkUNEkJ4hXqLO/+FgjrczmuUZX4UVKBCRTalGbRKGFY2WuKT1z7kehk/3FvE8rTbMKEtl+IRKVWptVkO+i/LF8F8mQb2Ex/1A7o2AHeALE2+NqBfYIOJz3IoqfRPWRWH0+h2ZwDLktGZkd8pXl4mrRrG8WPCdBAmDZXkemdoZ0EgsEJpgXKekvSUai2g9nTrAECvkJn3AOaZAc0ya0r3xXutSRWAWeZRW+aRSJTcBnzXImJWThuFlVmzrFE7NlhygT9ESDSKxReMai8rBFwpNZj7oMUqwJJ8TChQ+YtQcEAuG+vqORZT+HhAebJUqNhsjz7KxHczoisMTZEaaIMhJ+Vs0KuyOoJZIc0oh8RGMMCadECZbOUpLYdXziZ3jijrLdn4ARY5OamvjsETISEjJD6ooXy3NJh6rtYkUZBbnOaUm8wjlJJoIBrhI1l8rlUlFVbXYkWZlEkl6yUe0AMacwbZKBkI+USYbNHs9nxgiZU2LfNYK1S2nHeoV/lxSzhcuDf+emHF8sYYrENnSD5oxmdN4dzsjZrARAgB85wffFGMqRRCRiN/inKEEzOu/LZeZyuTmgXCoZDVv+a2HhOVJ96SLJaOe9Dk5h3m/GyWpm51e9hdDtz4kKIZRMUjNI3E7n/wzJLY9yFJbEULsyz6e09w6Br4Y+ZLVEhNRzICHylRPONUxWh9OJ0uge+g7ouwBxS7d0S7d0S5/Sv4np/mDZgElnAAAAAElFTkSuQmCC",
          "sit": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQQAAAEdCAMAAADdD+lrAAADAFBMVEVHcEzLxMcXHSYKDRIaICrIwcbGv8PHv8PJwcTKwsbxyqsPExmHhY7vyKoiHRsDBAXwyq0HCQ3vxqfGvsIHCxGEgosLDhUMEBnHwMTDvMCWkpoQDQwpJCEXExLBur4PFR8IBwcUEA4MCgkeGhi+t7yBfocOEBQTHCgaFxWalp19eoOKh5HwxKOfmqB5dn8RDxCkn6WppKoQDw+SjpW6tLkNGCYJEx+3sbazrbIdHBwiJy8WFRUGBgUGDhcbGhkxKyYFBQWuqK4XFRTp4eA+Ny8gISUVExIyLy1oTjBdSjYcGhl1WjtbQSYJCQlqUjt1cnpwbXVPPiwwJBhkRidCMB1HOCh3ZlnVv6ZVQzBUS0MNHS0SIzNvj6F5bWLjyrBqWk5qaG8PDg+OiY8fFg9kYWe/q5UdHB0eNUZPNx+agm1igJIVExMTERI4NDO/ookNDRALDA5NSkrCgmtGQ0IcGx82Mi8KCg1cWVsJCg0oQFJaWFseGxsRERKMaUkRDxBPTlA4ODhGREP58uzpxKQ9Ni/Ft6SYlJZTUFGHhIg+V2VdWVhOTE9jYWVIRkl5dnpCQETSiG1qZ2nSxbOZi3tUb36FgYBwbXJXVVs/NzBpZml3dXpkYF6Ri4hiYGVAMydlTjS0qZ6vrK0yKiKgnaCAeXRcSDG4qZhNOCJ5Xz/yy60YHinyzrHxy67Jw8fwy63xzbAlIB4kHh0PFRobIizyzK/EvcERFhwBAQESGCDOx8vNxskUGiQbIi4EBgonIh/Qys300LLEvsLTzM/LxckaHiUsJyQYHCIeIywcISjX0NIcJTHl29v107b32LsVIC72zq2Ni5Q5MSrh19j407Lc09UXGR4pKy9HPTR0Uy+AXjYlJin1y6iddUv23cKSbkOZbDyJZj0gKTRdVEyMYjTt07hpYlhOQzeKfnE6KhrMspfIkHjtwJ6peUbfw6fqza4oHRKJc2Kvm4SjlYPWuJt+YUKrfFd/dGviupuuoZAXLTyuj3Xj1MDTn4Hx4dApNz7eqYjJRuWuAAAA5HRSTlMA/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/v7+/hD+/hj+/v7+/v41/iEG/ir+Av5C/v7+X/7+/lH+/gv+/v7+/v7+/v7+/v7+/v7+/v7+cf7+/v7P/v7+/rWhdP7B0Vv+/uaK3/7u/qLwk/6D/v5E/v61/ui66f56z8WN1t3+tf3+/r/n6KLW74/U6uLh/u/n8KHL3djt//////////////////////////////////////////////////////////////////////////////7uw+R6AAAgAElEQVR42uyZPWvjzBbHr4qRNKBOGGZUTCUXtpEt2QbJ2BgrgRSBkHyEfcJ297ow3DTh4bkYgtdsXpYUyW72pViyrUsVUjNYqoSbYPSB7pmRvc9e7gdIsslh18pa25zfnP//nDP5xz9e4zVe4zVe4zWeVoxeEYxarVcKB73+K4TeuPc/EA4GL4/BzvXN9FcIw3H7xWlhPE9v+r980To5678wT+xdh7vR5S+FMNg/f9d/WQhOZ0mRzff/RrBzOf9++lIgjEaD9s7pTOVx5p4Ptwiml1fdeD5+Gc1i0OrvjC9mZmyaqls96x0ILP3JjxnjzDnbb70IMxyOT6++p6lmU9NpfPtzMm21J1+++mmeec7diyiE0XB8PaN5npiMEqdSOfvry8nJ1Xde5ClzrKvx8OC3R9Cefrn5nuRprCCCkVutfvzXP8/ndlGkaRY2Glf7v/2odNC7vLpf8niBMM6yWAEGb//9waJpyjm3rUr945/7OxDTaa/X/z0XioP90znL04VJqYmVjGdupV4/rNixAkiI1zAs4+O3z8ezmuM497P5zY/3k2n/99JGa3J9z4s00yIaRRrBPPYqFaNmJygCJihwQ5vSKOMpj2MOn/Agvju7eT/t/59AWv32cyyTg8m1l+agA10zRWiJ4hoPTkB0ymhkqoQocYLRAiF1CSzgT7Sky+Uii6k3vx7v9Prtg8HBQas9HE4nX25mp8+ljbaH7c0ZjnauQ2gHuqrpgkIUmUh1jZoPKgAGEKZJdIx1oppLAMDKsG2bURU4kPD49u7iFOLi7mpeC5KVN34elTDYf3d+Uu6D7ctZXsS6puk61nUCglBtxwoWPEGqCUnLYiBYUXSkqSYwgjoQX4tYqmihJCCQOAErlUJJC/ruGSyao1Fr52TeOd9rjUZiSbLXqaLLEMcNamCeR5NMWSA4eyoIaKYsAHgVLYGAIAGf8AShEJALwkAABKOZmoKCz/vPgEGrd3IXBMBgMBq0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",
          "fall": "data:image/png;base64,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"
};
        return charName === 'vergil' ? vergil : dante;
    }

    getCharacterSitPreview(charName = 'dante') {
        const sprites = this.getCharacterSprites(charName);
        return sprites.sit || sprites.idle1;
    }

    initShimejis() {
        this.destroyShimejis();

        if (!this.shimejiSettings || !this.shimejiSettings.enabled) return;

        let container = document.getElementById('dm-cat-shimeji-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'dm-cat-shimeji-container';
            document.body.appendChild(container);
        }

        const charName = this.shimejiSettings.character || 'dante';
        const pet = new ShimejiPet(this, window.innerWidth * 0.5 - 70, window.innerHeight - 180, charName);
        this.shimejis.push(pet);
        container.appendChild(pet.element);

        let lastTime = performance.now();
        const loop = (now) => {
            const dt = Math.max(1, Math.min(now - lastTime, 100));
            lastTime = now;

            this.shimejis.forEach(p => p.update(dt));
            this.shimejiRafId = requestAnimationFrame(loop);
        };
        this.shimejiRafId = requestAnimationFrame(loop);
    }

    destroyShimejis() {
        if (this.shimejiRafId) {
            cancelAnimationFrame(this.shimejiRafId);
            this.shimejiRafId = null;
        }
        this.shimejis = [];
        const container = document.getElementById('dm-cat-shimeji-container');
        if (container) container.remove();
    }

    openShimejiModal() {
        this.closeModal();
        const cfg = this.shimejiSettings;

        let selectedEnabled = cfg.enabled !== false;
        let selectedCharacter = cfg.character || 'dante';
        let selectedMode = cfg.mode || 'follow';
        let selectedScale = cfg.scale || 0.65;
        let selectedSpeed = cfg.speed || 3.0;
        let selectedGravity = cfg.gravity !== undefined ? cfg.gravity : 0.6;
        let selectedGlowColor = cfg.glowColor || (selectedCharacter === 'vergil' ? '#5865f2' : '#e23636');

        const danteSitImg = this.getCharacterSitPreview('dante');
        const vergilSitImg = this.getCharacterSitPreview('vergil');

        const backdrop = document.createElement('div');
        backdrop.className = 'dm-cat-modal-backdrop';
        backdrop.innerHTML = `
            <div class="dm-cat-modal-box" style="width: 540px; max-height: 88vh; display: flex; flex-direction: column;">
                <div class="dm-cat-modal-header" style="border-bottom: 1px solid rgba(255,255,255,0.08);">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 15px; font-weight: 700; color: #fff;" id="dmShimejiModalTitle">Masaüstü Maskotu Ayarları (Dante & Vergil)</span>
                    </div>
                </div>

                <div class="dm-cat-modal-body" style="padding: 16px 20px; gap: 14px; overflow-y: auto;">
                    <!-- Character Selection (With Sitting Preview on Left) -->
                    <div class="dm-cat-setting-row">
                        <label class="dm-cat-setting-label">Karakter Seçimi</label>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                            <!-- Dante Card -->
                            <div class="dm-shimeji-char-card ${selectedCharacter === 'dante' ? 'active' : ''}" data-char="dante" style="display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: ${selectedCharacter === 'dante' ? 'rgba(226, 54, 54, 0.15)' : 'var(--background-secondary-alt, #1e1f22)'}; border: 2px solid ${selectedCharacter === 'dante' ? '#e23636' : 'rgba(255,255,255,0.08)'}; border-radius: 8px; cursor: pointer; transition: all 0.2s ease;">
                                <div style="width: 52px; height: 52px; flex-shrink: 0; background: rgba(0,0,0,0.35); border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                                    <img src="${danteSitImg}" style="width: 46px; height: 46px; object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.6));" alt="Dante" />
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
                                    <div style="font-size: 14px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 6px;">
                                        <span>Dante</span>
                                        <span style="font-size: 9px; padding: 1px 5px; border-radius: 3px; background: #e23636; color: #fff; font-weight: 700;">DMC</span>
                                    </div>
                                    <div style="font-size: 11px; color: var(--text-muted, #949ba4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Kırmızı Ceketli Avcı</div>
                                </div>
                            </div>

                            <!-- Vergil Card -->
                            <div class="dm-shimeji-char-card ${selectedCharacter === 'vergil' ? 'active' : ''}" data-char="vergil" style="display: flex; align-items: center; gap: 12px; padding: 8px 12px; background: ${selectedCharacter === 'vergil' ? 'rgba(88, 101, 242, 0.15)' : 'var(--background-secondary-alt, #1e1f22)'}; border: 2px solid ${selectedCharacter === 'vergil' ? '#5865f2' : 'rgba(255,255,255,0.08)'}; border-radius: 8px; cursor: pointer; transition: all 0.2s ease;">
                                <div style="width: 52px; height: 52px; flex-shrink: 0; background: rgba(0,0,0,0.35); border-radius: 6px; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 1px solid rgba(255,255,255,0.1);">
                                    <img src="${vergilSitImg}" style="width: 46px; height: 46px; object-fit: contain; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.6));" alt="Vergil" />
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 2px; overflow: hidden;">
                                    <div style="font-size: 14px; font-weight: 700; color: #fff; display: flex; align-items: center; gap: 6px;">
                                        <span>Vergil</span>
                                        <span style="font-size: 9px; padding: 1px 5px; border-radius: 3px; background: #5865f2; color: #fff; font-weight: 700;">DMC</span>
                                    </div>
                                    <div style="font-size: 11px; color: var(--text-muted, #949ba4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Yamato Kılıç Ustası</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Status Toggle -->
                    <div class="dm-cat-setting-row">
                        <label class="dm-cat-setting-label">Maskot Durumu</label>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="dm-cat-btn dm-cat-status-btn ${selectedEnabled ? 'dm-cat-btn-primary' : ''}" data-enabled="true" style="flex: 1; display: flex; align-items: center; justify-content: center; background: ${selectedEnabled ? 'var(--brand-500, #5865f2)' : 'var(--background-secondary-alt, #1e1f22)'}; color: #fff;">
                                <span>Maskot Aktif (Ekranda Gezsin)</span>
                            </button>
                            <button type="button" class="dm-cat-btn dm-cat-status-btn ${!selectedEnabled ? 'dm-cat-btn-primary' : ''}" data-enabled="false" style="flex: 1; display: flex; align-items: center; justify-content: center; background: ${!selectedEnabled ? 'var(--brand-500, #5865f2)' : 'var(--background-secondary-alt, #1e1f22)'}; color: #fff;">
                                <span>Maskot Kapalı (Gizle)</span>
                            </button>
                        </div>
                    </div>

                    <!-- Behavior Mode -->
                    <div class="dm-cat-setting-row">
                        <label class="dm-cat-setting-label">Davranış Modu</label>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="dm-cat-btn dm-cat-mode-btn ${selectedMode === 'follow' ? 'dm-cat-btn-primary' : ''}" data-mode="follow" style="flex: 1; display: flex; align-items: center; justify-content: center; background: ${selectedMode === 'follow' ? 'var(--brand-500, #5865f2)' : 'var(--background-secondary-alt, #1e1f22)'}; color: #fff;">
                                <span>Fareyi Takip Et</span>
                            </button>
                            <button type="button" class="dm-cat-btn dm-cat-mode-btn ${selectedMode === 'roam' ? 'dm-cat-btn-primary' : ''}" data-mode="roam" style="flex: 1; display: flex; align-items: center; justify-content: center; background: ${selectedMode === 'roam' ? 'var(--brand-500, #5865f2)' : 'var(--background-secondary-alt, #1e1f22)'}; color: #fff;">
                                <span>Serbest Gezinti</span>
                            </button>
                            <button type="button" class="dm-cat-btn dm-cat-mode-btn ${selectedMode === 'sit' ? 'dm-cat-btn-primary' : ''}" data-mode="sit" style="flex: 1; display: flex; align-items: center; justify-content: center; background: ${selectedMode === 'sit' ? 'var(--brand-500, #5865f2)' : 'var(--background-secondary-alt, #1e1f22)'}; color: #fff;">
                                <span>Otur / Dinlen</span>
                            </button>
                        </div>
                        <div class="dm-cat-setting-desc">Fareyi Takip Et seçildiğinde karakter fare imlecinizin peşinden koşar ve yanınızda bekler.</div>
                    </div>

                    <!-- Scale Slider -->
                    <div class="dm-cat-setting-row">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <label class="dm-cat-setting-label" style="margin-bottom: 0;">Karakter Boyutu (Büyüklük Ayarı)</label>
                            <span id="dmShimejiScaleText" style="color: var(--text-normal, #fff); font-size: 13px; font-weight: 600;">${Math.round(selectedScale * 100)}%</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-top: 4px;">
                            <input type="range" id="dmShimejiScale" min="0.2" max="1.5" step="0.05" value="${selectedScale}" style="flex: 1; accent-color: var(--brand-500, #5865f2); cursor: pointer;" />
                        </div>
                        <div style="display: flex; gap: 6px; margin-top: 6px;">
                            <button type="button" class="dm-cat-btn dm-scale-preset" data-val="0.30" style="flex: 1; font-size: 11px; padding: 4px 6px;">Mini (%30)</button>
                            <button type="button" class="dm-cat-btn dm-scale-preset" data-val="0.45" style="flex: 1; font-size: 11px; padding: 4px 6px;">Küçük (%45)</button>
                            <button type="button" class="dm-cat-btn dm-scale-preset" data-val="0.60" style="flex: 1; font-size: 11px; padding: 4px 6px;">Normal (%60)</button>
                            <button type="button" class="dm-cat-btn dm-scale-preset" data-val="0.80" style="flex: 1; font-size: 11px; padding: 4px 6px;">Büyük (%80)</button>
                            <button type="button" class="dm-cat-btn dm-scale-preset" data-val="1.00" style="flex: 1; font-size: 11px; padding: 4px 6px;">Dev (%100)</button>
                        </div>
                    </div>

                    <!-- Speed Slider -->
                    <div class="dm-cat-setting-row">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <label class="dm-cat-setting-label" style="margin-bottom: 0;">Yürüme / Koşma Hızı</label>
                            <span id="dmShimejiSpeedText" style="color: var(--text-normal, #fff); font-size: 13px; font-weight: 600;">${selectedSpeed}x</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-top: 4px;">
                            <input type="range" id="dmShimejiSpeed" min="1" max="5" step="0.5" value="${selectedSpeed}" style="flex: 1; accent-color: var(--brand-500, #5865f2); cursor: pointer;" />
                        </div>
                    </div>

                    <!-- Gravity / Fall Speed Slider -->
                    <div class="dm-cat-setting-row">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <label class="dm-cat-setting-label" style="margin-bottom: 0;">Düşme & Yerçekimi Hızı</label>
                            <span id="dmShimejiGravityText" style="color: var(--text-normal, #fff); font-size: 13px; font-weight: 600;">${selectedGravity.toFixed(1)}x</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-top: 4px;">
                            <input type="range" id="dmShimejiGravity" min="0.2" max="1.8" step="0.1" value="${selectedGravity}" style="flex: 1; accent-color: var(--brand-500, #5865f2); cursor: pointer;" />
                        </div>
                        <div style="display: flex; gap: 6px; margin-top: 6px;">
                            <button type="button" class="dm-cat-btn dm-gravity-preset" data-val="0.3" style="flex: 1; font-size: 11px; padding: 4px 6px;">Hafif (0.3x)</button>
                            <button type="button" class="dm-cat-btn dm-gravity-preset" data-val="0.6" style="flex: 1; font-size: 11px; padding: 4px 6px;">Normal (0.6x)</button>
                            <button type="button" class="dm-cat-btn dm-gravity-preset" data-val="1.0" style="flex: 1; font-size: 11px; padding: 4px 6px;">Hızlı (1.0x)</button>
                            <button type="button" class="dm-cat-btn dm-gravity-preset" data-val="1.5" style="flex: 1; font-size: 11px; padding: 4px 6px;">Ağır (1.5x)</button>
                        </div>
                    </div>

                    <!-- Glow / Aura Color Picker -->
                    <div class="dm-cat-setting-row">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                            <label class="dm-cat-setting-label" style="margin-bottom: 0;">Vurgu & Işıma Rengi (Aura - Sadece Fare İle)</label>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <div id="dmShimejiGlowPreview" style="width: 14px; height: 14px; border-radius: 50%; background: ${selectedGlowColor === 'none' ? 'transparent' : selectedGlowColor}; border: 1px solid rgba(255,255,255,0.4); box-shadow: ${selectedGlowColor === 'none' ? 'none' : '0 0 10px ' + selectedGlowColor};"></div>
                                <span id="dmShimejiGlowName" style="font-size: 12px; color: var(--text-muted, #949ba4); font-weight: 600;">${selectedGlowColor === 'none' ? 'Kapalı' : selectedGlowColor}</span>
                            </div>
                        </div>
                        <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                            <button type="button" class="dm-cat-btn dm-glow-btn ${selectedGlowColor === '#e23636' ? 'active' : ''}" data-color="#e23636" style="flex: 1; min-width: 60px; font-size: 11px; padding: 5px 0; border-left: 3px solid #e23636;">Kırmızı</button>
                            <button type="button" class="dm-cat-btn dm-glow-btn ${selectedGlowColor === '#5865f2' ? 'active' : ''}" data-color="#5865f2" style="flex: 1; min-width: 60px; font-size: 11px; padding: 5px 0; border-left: 3px solid #5865f2;">Mavi</button>
                            <button type="button" class="dm-cat-btn dm-glow-btn ${selectedGlowColor === '#9b59b6' ? 'active' : ''}" data-color="#9b59b6" style="flex: 1; min-width: 60px; font-size: 11px; padding: 5px 0; border-left: 3px solid #9b59b6;">Mor</button>
                            <button type="button" class="dm-cat-btn dm-glow-btn ${selectedGlowColor === '#f1c40f' ? 'active' : ''}" data-color="#f1c40f" style="flex: 1; min-width: 60px; font-size: 11px; padding: 5px 0; border-left: 3px solid #f1c40f;">Altın</button>
                            <button type="button" class="dm-cat-btn dm-glow-btn ${selectedGlowColor === '#2ecc71' ? 'active' : ''}" data-color="#2ecc71" style="flex: 1; min-width: 60px; font-size: 11px; padding: 5px 0; border-left: 3px solid #2ecc71;">Yeşil</button>
                            <button type="button" class="dm-cat-btn dm-glow-btn ${selectedGlowColor === '#ffffff' ? 'active' : ''}" data-color="#ffffff" style="flex: 1; min-width: 60px; font-size: 11px; padding: 5px 0; border-left: 3px solid #ffffff;">Beyaz</button>
                            <button type="button" class="dm-cat-btn dm-glow-btn ${selectedGlowColor === 'none' ? 'active' : ''}" data-color="none" style="flex: 1; min-width: 60px; font-size: 11px; padding: 5px 0;">Yok</button>
                            <input type="color" id="dmShimejiGlowCustom" value="${selectedGlowColor.startsWith('#') ? selectedGlowColor : '#e23636'}" title="Özel Renk Seç" style="width: 32px; height: 28px; border: none; border-radius: 4px; background: transparent; cursor: pointer;" />
                        </div>
                    </div>
                </div>

                <div class="dm-cat-modal-footer">
                    <button class="dm-cat-btn dm-cat-btn-cancel" id="dmShimejiCancel">İptal</button>
                    <button class="dm-cat-btn dm-cat-btn-primary" id="dmShimejiSave">Kaydet ve Uygula</button>
                </div>
            </div>
        `;

        // Character Card clicks
        backdrop.querySelectorAll('.dm-shimeji-char-card').forEach(card => {
            card.onclick = () => {
                const char = card.dataset.char;
                selectedCharacter = char;
                backdrop.querySelectorAll('.dm-shimeji-char-card').forEach(c => {
                    const isCur = c.dataset.char === char;
                    c.classList.toggle('active', isCur);
                    if (c.dataset.char === 'dante') {
                        c.style.background = isCur ? 'rgba(226, 54, 54, 0.15)' : 'var(--background-secondary-alt, #1e1f22)';
                        c.style.borderColor = isCur ? '#e23636' : 'rgba(255,255,255,0.08)';
                    } else {
                        c.style.background = isCur ? 'rgba(88, 101, 242, 0.15)' : 'var(--background-secondary-alt, #1e1f22)';
                        c.style.borderColor = isCur ? '#5865f2' : 'rgba(255,255,255,0.08)';
                    }
                });

                // Live character switch on active pets
                this.shimejiSettings.character = selectedCharacter;
                this.initShimejis();
            };
        });

        backdrop.querySelectorAll('.dm-cat-status-btn').forEach(btn => {
            btn.onclick = () => {
                backdrop.querySelectorAll('.dm-cat-status-btn').forEach(b => {
                    b.classList.remove('dm-cat-btn-primary');
                    b.style.background = 'var(--background-secondary-alt, #1e1f22)';
                });
                btn.classList.add('dm-cat-btn-primary');
                btn.style.background = 'var(--brand-500, #5865f2)';
                selectedEnabled = btn.dataset.enabled === 'true';
            };
        });

        backdrop.querySelectorAll('.dm-cat-mode-btn').forEach(btn => {
            btn.onclick = () => {
                backdrop.querySelectorAll('.dm-cat-mode-btn').forEach(b => {
                    b.classList.remove('dm-cat-btn-primary');
                    b.style.background = 'var(--background-secondary-alt, #1e1f22)';
                });
                btn.classList.add('dm-cat-btn-primary');
                btn.style.background = 'var(--brand-500, #5865f2)';
                selectedMode = btn.dataset.mode;
            };
        });

        const scaleInput = backdrop.querySelector('#dmShimejiScale');
        const scaleText = backdrop.querySelector('#dmShimejiScaleText');
        scaleInput.oninput = () => {
            selectedScale = parseFloat(scaleInput.value);
            scaleText.textContent = Math.round(selectedScale * 100) + '%';
            this.shimejis.forEach(p => {
                p.manager.shimejiSettings.scale = selectedScale;
                p.updateStyle();
            });
        };

        backdrop.querySelectorAll('.dm-scale-preset').forEach(pBtn => {
            pBtn.onclick = () => {
                selectedScale = parseFloat(pBtn.dataset.val);
                scaleInput.value = selectedScale;
                scaleText.textContent = Math.round(selectedScale * 100) + '%';
                this.shimejis.forEach(p => {
                    p.manager.shimejiSettings.scale = selectedScale;
                    p.updateStyle();
                });
            };
        });

        const speedInput = backdrop.querySelector('#dmShimejiSpeed');
        const speedText = backdrop.querySelector('#dmShimejiSpeedText');
        speedInput.oninput = () => {
            selectedSpeed = parseFloat(speedInput.value);
            speedText.textContent = selectedSpeed + 'x';
        };

        const gravityInput = backdrop.querySelector('#dmShimejiGravity');
        const gravityText = backdrop.querySelector('#dmShimejiGravityText');
        gravityInput.oninput = () => {
            selectedGravity = parseFloat(gravityInput.value);
            gravityText.textContent = selectedGravity.toFixed(1) + 'x';
            this.shimejis.forEach(p => {
                p.manager.shimejiSettings.gravity = selectedGravity;
            });
        };

        backdrop.querySelectorAll('.dm-gravity-preset').forEach(gBtn => {
            gBtn.onclick = () => {
                selectedGravity = parseFloat(gBtn.dataset.val);
                gravityInput.value = selectedGravity;
                gravityText.textContent = selectedGravity.toFixed(1) + 'x';
                this.shimejis.forEach(p => {
                    p.manager.shimejiSettings.gravity = selectedGravity;
                });
            };
        });

        const glowPreview = backdrop.querySelector('#dmShimejiGlowPreview');
        const glowName = backdrop.querySelector('#dmShimejiGlowName');
        const glowCustom = backdrop.querySelector('#dmShimejiGlowCustom');

        const updateGlowUI = (color) => {
            selectedGlowColor = color;
            glowPreview.style.background = color === 'none' ? 'transparent' : color;
            glowPreview.style.boxShadow = color === 'none' ? 'none' : `0 0 10px ${color}`;
            glowName.textContent = color === 'none' ? 'Kapalı' : color;
            backdrop.querySelectorAll('.dm-glow-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.color === color);
            });
            this.shimejis.forEach(p => {
                p.manager.shimejiSettings.glowColor = color;
                p.updateStyle();
            });
        };

        backdrop.querySelectorAll('.dm-glow-btn').forEach(btn => {
            btn.onclick = () => {
                updateGlowUI(btn.dataset.color);
            };
        });

        glowCustom.oninput = () => {
            updateGlowUI(glowCustom.value);
        };

        backdrop.querySelector('#dmShimejiSave').onclick = () => {
            this.shimejiSettings = {
                enabled: selectedEnabled,
                character: selectedCharacter,
                mode: selectedMode,
                scale: selectedScale,
                speed: selectedSpeed,
                gravity: selectedGravity,
                glowColor: selectedGlowColor,
                physics: true
            };
            this.saveSettings();
            this.initShimejis();
            const btn = document.querySelector('.dm-cat-shimeji-btn');
            if (btn) btn.classList.toggle('active', selectedEnabled);
            this.closeModal();
        };

        backdrop.querySelector('#dmShimejiCancel').onclick = () => {
            this.loadSettings();
            this.initShimejis();
            this.closeModal();
        };
        backdrop.onclick = (e) => {
            if (e.target === backdrop) {
                this.loadSettings();
                this.initShimejis();
                this.closeModal();
            }
        };

        document.body.appendChild(backdrop);
    }

    openShimejiContextMenu(x, y, pet) {
        this.closeContextMenu();
        const menu = document.createElement('div');
        menu.className = 'dm-cat-context-menu';
        
        const posX = Math.max(10, Math.min(x + 15, window.innerWidth - 220));
        const posY = Math.max(10, Math.min(y - 80, window.innerHeight - 340));
        menu.style.left = posX + 'px';
        menu.style.top = posY + 'px';

        const curChar = this.shimejiSettings.character || 'dante';
        const curMode = this.shimejiSettings.mode || 'follow';
        const curScale = this.shimejiSettings.scale || 0.65;
        const charTitle = curChar === 'vergil' ? 'VERGIL' : 'DANTE';

        menu.innerHTML = `
            <div style="padding: 6px 10px; font-size: 11px; font-weight: 700; color: ${curChar === 'vergil' ? '#5865f2' : '#e23636'}; text-transform: uppercase; border-bottom: 1px solid rgba(255,255,255,0.08); margin-bottom: 4px;">
                ${charTitle} SHIMEJI
            </div>
            
            <div class="dm-cat-menu-item" id="dmShimejiMenuFollow">
                <span>${curMode === 'follow' ? '✓ ' : ''}Fareyi Takip Et</span>
            </div>
            <div class="dm-cat-menu-item" id="dmShimejiMenuRoam">
                <span>${curMode === 'roam' ? '✓ ' : ''}Serbest Gezinti</span>
            </div>
            <div class="dm-cat-menu-item" id="dmShimejiMenuSit">
                <span>${curMode === 'sit' ? '✓ ' : ''}Otur / Dinlen</span>
            </div>
            
            <div style="height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0;"></div>
            
            <div style="padding: 4px 10px; font-size: 11px; color: var(--text-muted, #949ba4); font-weight: 600;">
                KARAKTER SEÇİMİ
            </div>
            <div style="display: flex; gap: 6px; padding: 2px 8px;">
                <button type="button" class="dm-cat-btn dm-ctx-char ${curChar === 'dante' ? 'dm-cat-btn-primary' : ''}" data-char="dante" style="flex: 1; font-size: 11px; padding: 4px 0;">Dante</button>
                <button type="button" class="dm-cat-btn dm-ctx-char ${curChar === 'vergil' ? 'dm-cat-btn-primary' : ''}" data-char="vergil" style="flex: 1; font-size: 11px; padding: 4px 0;">Vergil</button>
            </div>

            <div style="height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0;"></div>
            
            <div style="padding: 4px 10px; font-size: 11px; color: var(--text-muted, #949ba4); font-weight: 600;">
                BOYUT (% ${Math.round(curScale * 100)})
            </div>
            <div style="display: flex; gap: 4px; padding: 2px 8px;">
                <button type="button" class="dm-cat-btn dm-ctx-scale" data-scale="0.30" style="flex: 1; font-size: 11px; padding: 3px 0;">%30</button>
                <button type="button" class="dm-cat-btn dm-ctx-scale" data-scale="0.45" style="flex: 1; font-size: 11px; padding: 3px 0;">%45</button>
                <button type="button" class="dm-cat-btn dm-ctx-scale" data-scale="0.60" style="flex: 1; font-size: 11px; padding: 3px 0;">%60</button>
                <button type="button" class="dm-cat-btn dm-ctx-scale" data-scale="0.80" style="flex: 1; font-size: 11px; padding: 3px 0;">%80</button>
                <button type="button" class="dm-cat-btn dm-ctx-scale" data-scale="1.00" style="flex: 1; font-size: 11px; padding: 3px 0;">%100</button>
            </div>

            <div style="height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0;"></div>

            <div class="dm-cat-menu-item" id="dmShimejiMenuSettings">
                <span>Detaylı Ayarlar...</span>
            </div>
            <div class="dm-cat-menu-item danger" id="dmShimejiMenuDismiss">
                <span>Maskotu Kapat</span>
            </div>
        `;

        menu.querySelector('#dmShimejiMenuFollow').onclick = () => {
            this.closeContextMenu();
            this.shimejiSettings.mode = 'follow';
            this.saveSettings();
        };
        menu.querySelector('#dmShimejiMenuRoam').onclick = () => {
            this.closeContextMenu();
            this.shimejiSettings.mode = 'roam';
            this.saveSettings();
        };
        menu.querySelector('#dmShimejiMenuSit').onclick = () => {
            this.closeContextMenu();
            this.shimejiSettings.mode = 'sit';
            this.saveSettings();
        };

        menu.querySelectorAll('.dm-ctx-char').forEach(cBtn => {
            cBtn.onclick = () => {
                this.closeContextMenu();
                this.shimejiSettings.character = cBtn.dataset.char;
                this.saveSettings();
                this.initShimejis();
            };
        });
        
        menu.querySelectorAll('.dm-ctx-scale').forEach(scBtn => {
            scBtn.onclick = () => {
                this.closeContextMenu();
                this.shimejiSettings.scale = parseFloat(scBtn.dataset.scale);
                this.saveSettings();
                this.shimejis.forEach(p => {
                    p.updateStyle();
                    p.draw();
                });
            };
        });

        menu.querySelector('#dmShimejiMenuSettings').onclick = () => {
            this.closeContextMenu();
            this.openShimejiModal();
        };
        menu.querySelector('#dmShimejiMenuDismiss').onclick = () => {
            this.closeContextMenu();
            this.shimejiSettings.enabled = false;
            this.saveSettings();
            this.destroyShimejis();
            const btn = document.querySelector('.dm-cat-shimeji-btn');
            if (btn) btn.classList.remove('active');
        };

        const onDocClick = (e) => {
            if (!menu.contains(e.target)) {
                this.closeContextMenu();
                document.removeEventListener('click', onDocClick, true);
            }
        };
        setTimeout(() => document.addEventListener('click', onDocClick, true), 10);

        document.body.appendChild(menu);
    }

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};

class ShimejiPet {
    constructor(manager, x, y, charName = 'dante') {
        this.manager = manager;
        this.charName = charName;
        this.x = x || (window.innerWidth / 2 - 70);
        this.y = y || (window.innerHeight - 180);
        this.vx = 0;
        this.vy = 0;
        this.facing = -1; // -1 = Sola bakar (orijinal sprite yönü), 1 = Sağa bakar (flip edilmiş)
        this.state = 'IDLE';
        this.stateTimer = 2500;
        this.animTimer = 0;
        this.idleVariant = 'idle1';
        this.isDragged = false;
        this.isHovered = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.lastDragMouseX = undefined;
        this.dragHistory = [];
        this.currentFrameKey = 'idle1';

        this.lastDrawnFrameKey = null;
        this.lastDrawnFacing = null;

        const displayName = charName === 'vergil' ? 'Vergil' : 'Dante';
        this.element = document.createElement('div');
        this.element.className = 'dm-cat-shimeji';
        this.element.title = `${displayName} Shimeji (Tıkla & Sürükle / Sağ Tıkla)`;
        
        this.canvas = document.createElement('canvas');
        this.canvas.width = 256;
        this.canvas.height = 256;
        this.ctx = this.canvas.getContext('2d');
        this.element.appendChild(this.canvas);

        this.images = {};
        const sprites = this.manager.getCharacterSprites(this.charName);
        Object.keys(sprites).forEach(k => {
            const img = new Image();
            img.src = sprites[k];
            img.onload = () => {
                if (this.currentFrameKey === k) {
                    this.lastDrawnFrameKey = null;
                    this.draw();
                }
            };
            this.images[k] = img;
        });

        this.attachEvents();
        this.updateStyle();
        this.draw();
    }

    attachEvents() {
        this.element.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                e.preventDefault();
                e.stopPropagation();
                this.isDragged = true;
                this.state = 'DRAGGED';
                this.dragStartX = e.clientX - this.x;
                this.dragStartY = e.clientY - this.y;
                this.lastDragMouseX = e.clientX;
                this.dragHistory = [{ x: e.clientX, y: e.clientY, t: Date.now() }];
                this.element.classList.add('dragging');
                this.updateStyle();
            }
        });

        this.element.addEventListener('mouseenter', () => {
            this.isHovered = true;
            this.updateStyle();
        });

        this.element.addEventListener('mouseleave', () => {
            this.isHovered = false;
            this.updateStyle();
        });

        this.element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.manager.openShimejiContextMenu(e.clientX, e.clientY, this);
        });
    }

    update(dt) {
        const timeStep = Math.min(dt / 16.666, 3.0);
        const scale = this.manager.shimejiSettings.scale || 0.65;
        const width = 256 * scale;
        const height = 256 * scale;
        const floorY = window.innerHeight - height - 4;
        const speed = (this.manager.shimejiSettings.speed || 3.0) * timeStep;
        const mode = this.manager.shimejiSettings.mode || 'follow';

        // 1. FARE İLE TUTULMA / SÜRÜKLEME (DRAGGED) - Götürülen yöne anında bakar
        if (this.isDragged) {
            const curMouseX = this.manager.mouseX;
            const curMouseY = this.manager.mouseY;

            this.x = curMouseX - this.dragStartX;
            this.y = curMouseY - this.dragStartY;

            if (this.lastDragMouseX !== undefined) {
                const dragDeltaX = curMouseX - this.lastDragMouseX;
                if (dragDeltaX > 1.2) {
                    this.facing = 1; // Sağa doğru sürükleniyor -> Sağa baksın
                } else if (dragDeltaX < -1.2) {
                    this.facing = -1; // Sola doğru sürükleniyor -> Sola baksın
                }
            }
            this.lastDragMouseX = curMouseX;
            this.currentFrameKey = 'dragged';

            this.dragHistory.push({ x: curMouseX, y: curMouseY, t: Date.now() });
            if (this.dragHistory.length > 5) this.dragHistory.shift();

            this.updateStyle();
            this.draw();
            return;
        } else {
            this.lastDragMouseX = undefined;
        }

        // 2. DÜŞME & FIRLATILMA FİZİĞİ (FALLING & GRAVITY) - FPS'ten bağımsız pürüzsüz fizik
        if (this.state === 'FALLING') {
            const gravitySetting = this.manager.shimejiSettings.gravity !== undefined ? this.manager.shimejiSettings.gravity : 0.6;
            const gravity = gravitySetting * timeStep;
            this.vy += gravity;
            this.x += this.vx * timeStep;
            this.y += this.vy * timeStep;
            this.currentFrameKey = 'fall';
            if (Math.abs(this.vx) > 0.5) {
                this.facing = this.vx > 0 ? 1 : -1;
            }

            if (this.x < 0) {
                this.x = 0;
                this.vx = -this.vx * 0.6;
            } else if (this.x > window.innerWidth - width) {
                this.x = window.innerWidth - width;
                this.vx = -this.vx * 0.6;
            }

            this.vx *= Math.pow(0.98, timeStep);

            if (this.y >= floorY) {
                this.y = floorY;
                this.vy = 0;
                this.vx = 0;
                this.state = 'IDLE';
                this.currentFrameKey = 'idle1';
                this.stateTimer = 1000;
            }

            this.updateStyle();
            this.draw();
            return;
        }

        // 3. OTURMA MODU (SIT)
        if (mode === 'sit') {
            this.y = floorY;
            this.facing = this.manager.mouseX > (this.x + width / 2) ? 1 : -1;
            this.currentFrameKey = 'sit';
            this.updateStyle();
            this.draw();
            return;
        }

        // 4. FAREYİ TAKİP ETME MODU (FOLLOW MOUSE)
        if (mode === 'follow') {
            const targetX = this.manager.mouseX - (width / 2);
            const diffX = targetX - this.x;
            const dist = Math.abs(diffX);

            this.y = floorY;

            if (dist > 50) {
                if (diffX > 0) {
                    this.facing = 1;
                    this.state = 'WALK_RIGHT';
                } else {
                    this.facing = -1;
                    this.state = 'WALK_LEFT';
                }

                this.x += this.facing * Math.min(speed * 1.5, dist);

                this.animTimer += dt;
                const walkCycle = ['walk1', 'walk2', 'walk3', 'walk2'];
                const stepIndex = Math.floor((this.animTimer / 140) % walkCycle.length);
                this.currentFrameKey = walkCycle[stepIndex];
            } else {
                this.facing = this.manager.mouseX > (this.x + width / 2) ? 1 : -1;
                this.state = 'IDLE';

                this.stateTimer -= dt;
                if (this.stateTimer <= 0) {
                    this.stateTimer = Math.random() * 3000 + 2000;
                    const r = Math.random();
                    if (r < 0.60) this.idleVariant = 'idle1';
                    else this.idleVariant = 'sit';
                }
                this.currentFrameKey = this.idleVariant;
            }

            this.updateStyle();
            this.draw();
            return;
        }

        // 5. SERBEST GEZİNTİ MODU (FREE ROAM)
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            const rand = Math.random();
            if (rand < 0.40) {
                this.state = 'WALK_RIGHT';
                this.facing = 1;
                this.stateTimer = Math.random() * 3500 + 2000;
            } else if (rand < 0.80) {
                this.state = 'WALK_LEFT';
                this.facing = -1;
                this.stateTimer = Math.random() * 3500 + 2000;
            } else if (rand < 0.92) {
                this.state = 'IDLE';
                this.stateTimer = Math.random() * 3000 + 2000;
                this.idleVariant = 'idle1';
            } else {
                this.state = 'SIT';
                this.currentFrameKey = 'sit';
                this.stateTimer = Math.random() * 5000 + 3000;
            }
        }

        if (this.state === 'WALK_RIGHT' || this.state === 'WALK_LEFT') {
            this.y = floorY;
            this.x += this.facing * speed;

            if (this.x <= 10) {
                this.x = 10;
                this.facing = 1;
                this.state = 'WALK_RIGHT';
            } else if (this.x >= window.innerWidth - width - 10) {
                this.x = window.innerWidth - width - 10;
                this.facing = -1;
                this.state = 'WALK_LEFT';
            }

            this.animTimer += dt;
            const walkCycle = ['walk1', 'walk2', 'walk3', 'walk2'];
            const stepIndex = Math.floor((this.animTimer / 140) % walkCycle.length);
            this.currentFrameKey = walkCycle[stepIndex];
        } else if (this.state === 'IDLE') {
            this.y = floorY;
            this.currentFrameKey = this.idleVariant;
        } else if (this.state === 'SIT') {
            this.y = floorY;
            this.currentFrameKey = 'sit';
        }

        this.updateStyle();
        this.draw();
    }

    draw() {
        const frameKey = this.currentFrameKey || 'idle1';
        const facing = this.facing || -1;
        const img = this.images[frameKey] || this.images.idle1;
        if (!img || !img.complete || !img.naturalWidth) return;

        if (this.lastDrawnFrameKey === frameKey && this.lastDrawnFacing === facing) {
            return;
        }

        this.lastDrawnFrameKey = frameKey;
        this.lastDrawnFacing = facing;

        this.ctx.clearRect(0, 0, 256, 256);
        this.ctx.save();
        
        // Sprite'lar varsayılan olarak SOLA bakar. Sağa bakarken (facing === 1) yatay flip yapılır:
        if (facing === 1) {
            this.ctx.translate(256, 0);
            this.ctx.scale(-1, 1);
        }
        
        this.ctx.imageSmoothingEnabled = true;
        this.ctx.imageSmoothingQuality = 'high';

        const natW = img.naturalWidth;
        const natH = img.naturalHeight;
        const scale = Math.min(256 / natW, 256 / natH);
        const drawW = natW * scale;
        const drawH = natH * scale;
        const drawX = (256 - drawW) / 2;
        const drawY = 256 - drawH;

        this.ctx.drawImage(img, drawX, drawY, drawW, drawH);
        this.ctx.restore();
    }

    updateStyle() {
        const scale = this.manager.shimejiSettings.scale || 0.65;
        const glow = this.manager.shimejiSettings.glowColor || '#e23636';
        const w = 256 * scale;
        const h = 256 * scale;
        this.element.style.width = w + 'px';
        this.element.style.height = h + 'px';
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.element.style.transform = 'translate3d(' + Math.round(this.x) + 'px, ' + Math.round(this.y) + 'px, 0)';

        // YALNIZCA FARE İLE TUTULDUĞUNDA VEYA ÜZERİNE GELİNDİĞİNDE AURA ÇIKAR:
        if (glow === 'none' || !glow) {
            this.canvas.style.filter = 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.45))';
        } else if (this.isDragged) {
            this.canvas.style.filter = `drop-shadow(0 0 12px ${glow}) drop-shadow(0 0 26px ${glow}) drop-shadow(0 4px 10px rgba(0, 0, 0, 0.6))`;
        } else if (this.isHovered) {
            this.canvas.style.filter = `drop-shadow(0 0 10px ${glow}) drop-shadow(0 0 20px ${glow}) drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))`;
        } else {
            // Fare üzerinde değilken aura kapalıdır (sadece doğal temiz gölge)
            this.canvas.style.filter = 'drop-shadow(0 4px 8px rgba(0, 0, 0, 0.45))';
        }
    }

    release(throwVx, throwVy) {
        this.isDragged = false;
        this.element.classList.remove('dragging');
        this.state = 'FALLING';
        this.vx = Math.max(-25, Math.min(25, throwVx || 0));
        this.vy = Math.max(-25, Math.min(25, throwVy || 0));
        this.updateStyle();
    }
}
