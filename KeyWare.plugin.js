/**
 * @name KeyWare
 * @author keyrex
 * @version 6.0.0
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
            scale: 0.9,
            speed: 3.0,
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
        this.checkForUpdates();
        this.checkChangelog();
    }

    onSwitch() {
        this.scheduleRender(true);
        [0, 20, 50, 100, 200].forEach(d => setTimeout(() => this.renderAll(), d));
    }

    stop() {
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
                position: fixed;
                background: var(--background-floating, #111214);
                border-radius: 6px;
                padding: 6px 8px;
                min-width: 190px;
                box-shadow: var(--elevation-high, 0 8px 16px rgba(0, 0, 0, 0.3));
                z-index: 99999;
                display: flex;
                flex-direction: column;
                gap: 2px;
                animation: dmCatFadeIn 0.1s ease;
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
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: rgba(0, 0, 0, 0.75);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 99999;
                animation: dmCatFadeIn 0.15s ease;
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
                filter: drop-shadow(0 4px 10px rgba(0, 0, 0, 0.45));
                transition: filter 0.2s ease;
                z-index: 999999 !important;
            }
            .dm-cat-shimeji:hover {
                filter: drop-shadow(0 6px 14px rgba(88, 101, 242, 0.7)) drop-shadow(0 0 10px rgba(255, 255, 255, 0.5));
            }
            .dm-cat-shimeji.dragging {
                cursor: grabbing !important;
                filter: drop-shadow(0 14px 28px rgba(0, 0, 0, 0.7)) scale(1.06);
            }
            .dm-cat-shimeji canvas {
                display: block !important;
                pointer-events: none !important;
                image-rendering: pixelated !important;
                image-rendering: -moz-crisp-edges !important;
                image-rendering: crisp-edges !important;
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

    async checkForUpdates() {
        try {
            const currentVersion = "6.0.0";
            const updateUrl = "https://raw.githubusercontent.com/keyrexdevelopment/keyware-dms/main/KeyWare.plugin.js";

            const response = await fetch(`${updateUrl}?_t=${Date.now()}`);
            if (!response.ok) return;

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
            }
        } catch (e) {
            console.warn("[KeyWare] Update check failed:", e);
        }
    }

    checkChangelog() {
        const currentVersion = "6.0.0";
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
                            <div style="font-size: 12px; color: var(--brand-500, #5865f2); font-weight: 600;">Sürüm v6.0.0</div>
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
                                <div style="font-size: 13px; font-weight: 600; color: #fff;">Dante & Vergil Shimeji Masaüstü Evcil Hayvanları</div>
                                <div style="font-size: 12px; color: var(--text-muted, #949ba4);">Discord içinde canlı yürüyen, fare imlecinizi takip eden, tutup fırlatabileceğiniz gerçek zamanlı fizik motorlu Shimeji maskotları eklendi!</div>
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
        return {
          "idle": "data:image/png;base64,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",
          "walk1": "data:image/png;base64,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",
          "walk2": "data:image/png;base64,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",
          "walk3": "data:image/png;base64,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",
          "walk4": "data:image/png;base64,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",
          "dragged": "data:image/png;base64,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",
          "fall": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAABhJSURBVHhe7Z0HeFvluccVL0mekrct2bK2LO8VT0m2ZHnbsbwdrzg7cSAJ2cuQPSgJCcshkEEGcYaTEEKZt5AFAUILty1QCuXS0D73AuXSC9nt/76SnBjHTmJn4Tjf73nOc6Sjc75z/L3je99vHHMYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwbgGzc3NKC4uRudXxr1GU1MTUwAGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPRT2Iis9iso3sZg76UKcC9THFRPVOAe5nSsubLClBhGdlDGaIi9b0qSGK8gSnOYKC8Yuw1BanLKGGCvldIjM/tk7Bj4uxeITomu8f5hbmVTGEGG1mmGptQTcZS1NaMvyzghLh8JuyBTEmJXXC3g8LSsdBqjUwBBjoVVWO6LDY+s5vAUlMKbliATaPnXr42I82MXDNLJwckVfWTehWMMbv8pgSWV9SlWIwBTGFJM0aNe4AJ616hoWFcN2E3jZgORbjutitAYlL3gDBTX9jne9YUF6I4I9F2/sgRXf0SjBugfnhP15yT13BbKzVD3705MZuLEa60p4rNI67dz2Al2oWDg0um2M4L9/PEyMbb+7yDmsryET0qLztnYOfmH7YtRSiHg9eXz0BraRbyYrQYpktlSnAjWCy1d03FpWlUWDdt6uXnDR3CsX3eO2MsOuZMQElB3zqmGD+jpPiXt/ZhRU3XfYbCLAOi+UPw5MSe5771yIN4pKEcFiMbb+gzVVV2119UXPaLVVpp2QRkGix9vv+nmx/B9nmTez0/JdgbHYu7+hoYDEZfSR6ad1ss59FJk7Bj0bJey166Ztctv2dt7d0Tz/ziZGXau2IbG1pgzLq5Xr4r+a83X8H3b+7BxeN70DF/KnYtXIBVE3t33VYSYs19vr8h04yaajYp5aZJHGq6XIm3cpbPNycP4/Q7HTh/Yjd+Orwdp/a34dTe9VhdX4lWSwkm5vQcTzDo2JDwXUvtCHu38Yzh5fj9/s348Z3dJPx2nHtnF23P48LxHbh4dCv+dXgbcHQXzh87BIupAsbMqstCT0thk0juOENT+u52r8Xw6vHYM3cq/rFtJc698Di5/W04e3w7zr29w6YA1s82JXj7eZx7dw/O/PEICo3lCFd2H2m8HgZjIQymElQ2jkNtQ9ccA8YAYXWtBS9Te//vt8n6jz7XqQTbbIrwr3d24iwd/+HEfvzp+GvI0ZUiJbYr8MzIqELD8JZrCnX1pFGY1VSO5iZ7+lpZNRyVVbdv/sI9QVOjvT/9VrJ5ykj8+MZGnDuyyWb5F07sxIV32vH92x14/9WXYSkdgZw4IxIUyaiqsQeGFst9KC68egS/cdpEnFo/F399agaOPb3Sdl6qrn8ehNELmYZhN1WJlSYLqsz2Mpor7T10/zj0NP756hM4/eYzdvd/ogMXyPX/3/F9+OL4USRKYrGiqBC/bXvMdr4u7fqvt311VSu+3rQM32x8CCfXzMTjpGTZmbdugUo8z/uWlXVXkZ6ac1N/+MYp07BvxkT8cfuT+Hj3Rny+bxO+eW0b/v7Gdvz9rV344Xdv4MG6Ybh48gAunDyIyoQ4lMZkYn15IU4sn4XdK1chKy69T8/w6ZZH8eX6xfhk3WwcWtj7pJUbIc3HH2NCIganAjQ29hzpu1mWrNp2ucwHhlXiN0um48znH+Avn3+Jz774Gvvf+AAfff4DPvrTdzj199MYV2LBv98/gHPH23H6+H6YAvzp+0FbQHiRAsLKzN4VIM3ZA7M9ZZgmkKFaKEYgh4MmfTLeXjUbL62Yg6rKm++7KA0KxUJtAmp9QgenAlwNi6V7/3t52eg+V0Drko29njuyaQpyzJVISMqGObsKZmM1kpVx+PWyB6lJ2GRrDs5aMwFKD8+e3IsfKVU8fbQd86p6ThW3ksPzQa1LIKbwJLiPG4J6bynUHBdo3d3xSMuEmxJYQZYRQzmOWBGdglSOG5Xpf1PlDWhS064/QpY49MZSwuf2vnf5Ol1sNtTB0dCGRiJeFY8wbwlMqgh81d6G029YFWArKcAO/PPoVlz88ADOv78b549txbevbehx7wSvIDR5iNEskKLSKQD3c2UYS0pQ4yaBlsOHytnzpgQmdXHDImkkCZ+HGEffmyrrrqGO0qbOj73ywKzHe/196szHMHX2uh6/PXL/tG7Hhsfq8ckz6/Dpxl/h9xtW4K871uLTZx7C2TeexdkjW3DmMKWGx3bgm8MdmFdhxrevPI2zhzfjH6+s71F2YYgGI7gizHAVo44XDItDACbxlRjlJEa1lxwKF8E1/5ZrEclxwiJ1NAzkAcxucmTylDdc1j3BzPlP4rH1B3utpD0zpmD/4lZ8d+QQChXh+HrvRnzR0YbzHxzE+ff24l9k5RdO7MCZY8/h/NHn8O8Tu8jyX8TF3/0ap9/aQtsm/O3QU5fLNvqJUSkLRxi5+kZ+KJa6SzCZlMDMEWC4lwr1vDAY3YNvSmCzZRGwkNs3kkexuEYin6cZ3ApQ9rOVOf1h8qzV173uwJIH8Z/rWvHZpsX4nqL+3z+/Cud/uw9n39uFcyeprX+/HWfe24Gz7+7EQ/VFWFBfjdm1FXj5sYdxfMPDOPPWdnz/+hZIHR1t95rsryE3L4KK0rJaXgAW0ueVviqMd5cjieKBVB/ZDQsrVRKGWqEfcp2F0LmIUMBXYxg/AkPJ03SeMvjQZ/V9mDcrq++zci8xzFiIkxvW2VIzvEvWbR0DsAr/Peu+HRc/2EPeYDd+en8P8O0XuPCXz/D9x39AUXIGhioj8NneJ/DV/icQQhF+jVcYHvCQoNRfBjHHGTXOQZhJbf4UVwma+TLEOtsDtZK8/g9d10XFoi5EhvQhHsh0lSLXTYkCrgolPC00PL/BqwA5OV2VNa26EM/M6Ir2s7JMEHE5+K//IOuc2IT0lP53rDTWTcKCxlH43eqZFNBtpwh/p63//9yJ7eTqSSFOdpBHoKbgT0dh8BCgKjQCZX4K1EUORYzQB/97eDdOHdpACuCMyZTyzSCBm7zEFO27UhMQhgk8MUa5hqLMKRRyR3vgN6qpsV/PmSkOQy5PAL0gGHFuwch2lSOHtny+AoW8cIon7oFOoJFpsXhj9VykintGvH/5zQ5c+LIrmr/EtNbugV9SvD1TqEruWjMwPN+CvKh4vLtyFnBkmy2o++frbfjbvrW4cHwbzlEMcOaD/QjnOuMJfS42p+XiUWUylqWk4IdXt+PLFzbgve3rECEMxnRPOWZ6kZUKJUgj119A3mC4uwwVLmEw02+dt+wzIvIqLSIVKt39oKRoP4FiCQNfCiMJP4s8Sh5fZdtklG52XjI4WT9tLMZnJqJt0fR+/aFT5/eM/PMiYvHhusW243VZRfi4/Wl8tXMd3lnYglNbluHPm5fh1K+3QUqVf+qVHfiJmoWfPjgAkSMHW4bXYH9NNb5+ajH+u321LSP4cHcbJlbYF4iM95JimkABlZM3kt3ESKc230zWb6Zj1t/7Qxrd/+FAJWpcfGFwF8HgqaBoXw4jT2rbm0gBcrgKmLj9U6y5Yyr6/Sy/OLtWzkR2dM8/VJ9hgE7XcwVQccm1F21+vGkdppLlW3sBRybH4qnR5Xh76QwcWzUbW6eOh4IqP9c72Lb/nxMv4+u3nsdPH72OhshQzDMk4euONfjmlTb89cU2rGjpWpSi43ihxVsFOUXoOh+pzfq1nP7n+9X+YqwIUVKax4eKyszwUtjcvlX4Vss38OU2T2BVgizyAJ2X9YlFUwbRTCRDRteMoL6wYOkzaG6aDlNMHD7ZtxvH2x7GvoXTsXXeVEzMz0aRUoUEEvpqXwnWB8uxOioFPvT9u/dfw8V3DwB/eAn46CDOntiLP+5dj/lN1T3un8YVoMA5EGmuwTAJxf2u7OkUY5Q4eCGGXL6GPEmajxI6Uiq9UEV7JTUvSqQIKaMQyBAvkCLaW9q/Ohjf85kHJcWFPb3AguWb8cD8J5Br7r0P3iQIwJggOZaGaLCettWBGmS6+SCIlGCqLhaHV83Bi8tm4XDbKjzbOueqFZnjEYoidzFyyBNIHXh9qnANj48IjgNKyOWnuvlD5iRAom//44ZrMb7cCIsh7paWeUd4dvYYfPvm8/1+cENc7FWvKSvvvqDUiooEpiK3m+IaADPfB2aON4ooqjdSMNdXQV5CTa5/JOXqjZSiVXoIUcJ3R4wDt1sZYaRYStqa3X0wl7xOGVl8nFtgr/cpKCpEaVnX+EfGz4aSc9KTUJiR1O266vzucw1yEjUoTouAPlbda/l3JTp997V0I0bYO4y+PHIIf3vhWXxCAZr1+2SJFtO9JUjmOCKMhGw9FsnxQBoJKY3jDh3l1kPpeIM1bXMOwdghQkwPUWG8LJJydy/UicKxRhGNX8WnI96jZ85dVpyP/LQklGTEIyu6q4JFpEyLwxLxVGA41pGrXhmsxRJ1POZJIzDdR4zNQWFYE5FAzY6jLcqP4gUhya27S9cZ9NDr9cjPz0fVz2YP6fVdAjan34VWfSOMuGL4NCOt9yXgX7213zZKd/rITjQYkrFIGYWnRHKskWlQTUJJHuKF6f4arBAqsMIzBHNc/DBJEIIKitwbuYHYJtdgg38QtsjVeEAsQbEDHx10bIdUgbEurtB6dVmpITYKpngtmnPT6F6JKKN0tfMnG1EcV2pWlJhE6eFoBxHmeUrRygvEUp4/nvCXwkBlW8cF1C4BiOaKESvs2abrdD0Hw0zZ9nkQBbpkmBJ6DwRNQ6MRK/ODIc7+uy6y/9nIgCJTlw29rvd39DTUdXWufPfOIZw5vhM/vrUNT86djAVyJTYrNXhBo8LeEDFKSQm2KqKwUSDGNto6SDmWCsj6OM6I5nCxbWgS2uUytPv44tGQMEyRqrEqTIENQUHYqdJgGMep2zOUJMdgeEYcLKkx16zgogA1Rvkp0eKrwERfKcaJlJA7uEHrFox4CvY6T+PkZdk9myn3+q+zqclORdHQ3scCKnP1MMdT+hgdhsxYUrZoBXSJ137Gu5qX1i3Cn3c9ZuufP3fkeXyxZy02LH4Q08QKtCfqsE+txn5piE2A+7QReFkmxRInIdZ4hmFjIEX95OazSAny3H2RS23zkz6BeCwwGE2BYqT4iSgtdIGGjq8ki77P0x9xdK71vgVJsRhu6u6NIuMzEZN09SHqMGd7h5aCPIHtQCcGfYbte2l+3xaJlugSoIsK69O5g56oYB982rEBJ9fOwbG18/HtsRehFfpiHD8IS7wkaJfKsUcsRhFZ+Xa1Fq+TR1juLMQcbhjudwjCVBd/tPrIUeUehMghPOgoKm/y80cGz50ic0/407EEri+a+L6wOHlivFiFEM6QbpWfnpGF3PwqaGKMiIy/ep+/yjUIUULJVX/XZST3SahZCVom/EsU5ttd5u7F8/DI/RMQGRgEsyAM053EWO+nxa5gBZbzfJBJgd9UtyCsFIZgNbW5c13luI8vx2RShPucQ1HlFIwGv3BYQrRQevsiSShEa2wkBZCOsDj6YI2vBqOpjHoXL8xTJEFMx633Tc0wIcuYC4O+BKHyTETE5CHdUICMTPsgVXkFmwJ+x5A7eCCdLLqeBDuDp8ZsZxlmeilQ5hyAeqESE0jYLVwJ7nOR4n7apvDkmMJXoYWnwDAnEUYIIlASoEUqxQyjouRYlKhGOrn/hV4qPMoLw05hMNoDJZhCilDN7zkdS66mJiAxD9m5v8yr5EpK7vGVShquAMUUcY/y0GASV41pruEY46EiIXpjtECDiTwpJvFDbVO1JvOUGO+qwGg6No4UpooXilo3OfIpWDOr5BgTI8diXRxaKVB8hEdegxRgk7sYb6oj8XSABGvJU3Te9jLRcZlk/YXIzuv7uwPuBPmF/R+KvmsZWV2HaErzDDwRcinHz3aVUdvuS8GbF+7zUmOGh8K2r3EJQY2XFnncEOTzxBjmFoYSPxVMlB1kK+XIVcigHsLBfk08OoIkeNwrDL+ifH2DVzAOypTYSp6gyVXYrWIjE3RI19/a173InfyRSsqqc1GSd1MgkbxWrKc9jrgds6cHLQqeL+oCtainlKzcX4VsoQwp3lLEU7wQzg1EjrcGSmcBwgX+iPUPgNrVEw0iNVa7ibCTlGItT4ClbjIs4ouxJ0RqU4L2K9YGxCTd2v9Kku6hRg5fg2xuOAxcBfTWzUVOyiBHAilw52mMG2FkYxNKS7qvMNJ4iBHKF8CfUr16VSIWuKrRSrHCIrdQHNTE4ClKG2e5StHqqcBKAWUYpEhj+V1eIDHZ3lOnCw9Dmvz6AiouLkRBfi4K8nq+jDrFXYkcFw1yuCqYndUwOqtoUyCLvECmsxwZFN90nsq4FVRb7Gv9I91FqBPHYRxZ31QnOZZ5h2MWNRP3OwbgIUEoWkVRKOOHoNzBDwudfHEwNgVaChRthXRiiLz+cG1leQUsxUUoKszHpUzmSvTuarJ+DUz0HNa9kRQhl5Qimx+OTLdB1L8/0KgWRpBlqzDakbIIiiHmkjWOdJGgjhuKAgd/GDiuKKeYYizHEy9HpKO4MyXsC1mZepRbymyCLynOR3FRQa8ewEoIlZ/BlcNMGY3V+q2eIIc2kxs1VxTYmm9gOhyjD6j5PhhGgeJwqvRxJIAW2iZS+1tCqaKOw8f2QCn2isNRx/HFc3wRDoVevavVbO7eM5hj7t98BivWNQDZ9CzZtuaAPIBHJBP8nSDCwRvVbkrUk/BHkRWmkeXPCQzHK/Jo7JVGoooUYCcFla+r4iG5onfQSna20WbdhYVdM5cNhr519+aYC5D+s9VRac4SW9tvpPQ2hlLdzsOM202hMBwWssBSCgazOUKsVyVhJkdgG+GrHBKINS7+5AHUWBmT0qsC6HR9W0V8JQUFRd2ui3MNoTRQhkQXNgZwx8nwUSJPQIrgGIR1oUkY6aFAIScAiwIj0eokxItSShcVt26lTlVF7y+diBfe5UO7dzN6Dznq+Wo0O0lQy1cgn+ODh4UazHP0wgtyNdYob01Unm26h3rt7jaKBFqUuGts4wbzBRos95BhmqPQNnFkkyIcCVfMGegvKam3//8dMG6SJGr7c4eI0EJ5uIW8wAP8YOxVROBAsATPKG/dGzvWPzgFefruc/4YvzCXlqqncQIxitLEZi8VhnO8sCVUhQP+wdih6V96FsHrPaBLC5eg0RTf47eCzL7NF2DcZmK5AaihQHC0pxrllBms9ZHglcBQHFRoURVw9QkfVhI95chwVyCTb+3aVSOJ33uXbk5ClzIVGu1NQ14mayIGDPk+coz1iEAlxw/LBQocEKnwkkiKx2S9ZwNppDB6vtLWo2dyUSLLSU55vdQ2uBPvdu3UzpTEOn4GFA3VtQjhcNHoGYERjqGY5aZEm6e1R1CJLZQOXlpPoHUOQHrnsi5rT57ZiayecnkTT4WsTuEbnGRIJ2XQOgX1ELIhTgND1NU7fYykGMZ4OfRMQe48prR0xA0JQD1Pi9FcBdoCwrHRMxAd5AWsE1DFHHdkOEntgieLNzookE0KYHCyjuipoHMmxSDhW7/raMt0VtqGfNMCrh1IVhgTkTdUg0SlNx6ec+23lDLuAFmuUpQ7hmEGT4IlnqHY4R+G9dQMDCUlSHAU2QZvrJtVEazu3ypo+0aW60jNgKOMjqsuK4p1CDjN++qTPksz4pCTSJ6ELL/zEOOXJMJLBKOTyDbfcLqHDG1+cuwIkmGmTyDiuYHk5qW2UTy7AqhI6NLLY/pWT2ATvqPS1jxYFcU63GtdLNJZfA/yU6KRnRAOQ3w4U4CBgojigQZXFZp5CkzjSrDNX4U9YhWmisnCPcTQcHyh56rsbp7cvnVGj3VvG+cn4efQcavw85w1MPOYYO9K8kjwDWTR9/PVmO8gws7QaGwKVKGE44JQzhDIrGv+uXbBX2oGrDGBdcaP1eptSkD7ZI/+jfQZstjLpwcEahcheQENWlyj0MJTYzK5+cVeCmy1Ti3zCyMP4GHLHFKpqbAK3ja5w4FcvhOlhHRuKqWJURRDdBbHuBtJHOKLFrdYUoIITHSLwAQ3FcY6iLFQqMby0EhUCUS2eQNSDh8ZXpQReGhI8P172wdjABPM8cBo8gATqB0fzw/HWK4SY3hKjKVAcAY/DI9L4jAvWI4EUgIRx4EJfjAyLDAKTe5aErwa41ytCiDHWL4CC7wj8ZBAhTX+4XhcGo2VyhiM8JbAfK+98fteINpdjAqfCJSR67f4aFHqrUY5fc8TUtDnJUNDkAbNASqMsAaJ4kH+ylcGg8FgMBgMBoPBYAxsOJz/B/V1z9waTS/YAAAAAElFTkSuQmCC",
          "land": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAABPhSURBVHhe7Z13dFNnmsaFe5Hci3pvrhj3JtuyjSw35N5tucRgY5oDmNDsgA2G0AMBG4xpoYReAhhIOZM5O2frTGZ2swnJzpnZ3WRmd5jM7v6z/z77SnZwHBtsikNYvt8590iW7r3Suc/zveW7utccBoPBYDAYDAaDwWAwGAwGg8FgMBiMp8FsNmPsKYPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWA8ZxKSTA/vgBoRlY6YhCykpBUixZAHQ1oRkpILkJK6AIkpBUhIzmV3S2UwXnrKKlqfy0iuaVzBIsLLhNlcNiuCxSUamRFeBiLnZc6KUIb0Ajg4eDATPG+qKq3soL6KJCXNZ8K/qqQmM/EZhLW1BxVVnahvePkq7eqqBmbiZyUlZT6KShfClFvHDuarSGpKBuISslFQaIUx8+nbt7Yl/cxALzuNDavsIhZbSpiYDMYrSVVeEwrSLC9NBLBYqlm0ep4YDRUoT6uCKT5rRgc2NmZm680WmdlFzADPm6oUC1qTXo4Da8orZwaYDaqyHz09bJpfimWdfcgvXvTCD35BUS0zwGwRn1SAfEstKismzxEkJY2emdu4ZQiNbT2zIsKCkqXT7jc2MZsZYLYwFzbBkF3x8ACb8x89T9C/6+yk95as2vFM4lSYK1HTvOaR+2hq736m/TNmwIKSBphyatHUuAKZWTPPt3kli7C+9/BTC9RgyMaGSjbV+5OgiMS0PYbPy0F27qNrA2vL+Ig0m54+N599cxM+7F6Kz04cQG7Boz+vsXX9U38G4wlZ1LYOSWllSEmvQVPT2ikP/OmLv0BGaiH2VFcjlK9FWc3rE9ZbtHzrjAS7sn4Z/ulgDz47uQ/NVS3INFdNuZ2lbLH99SLL7PwCifE9du85gWRqDzMyRyde6hvHO4CcvFqUVi3B2p53oJGE4oAlD1pvAaqtqx8rjGH+ZGGvbe/B/RNv4csTW/H50X5srKxAceHUJ6qKK5Y8dv+MZ6TOOjqCs0yViEvMhyG9AglxeVMe9AWF9di+7xy0ynnYW1yArc3NMOdZcfH2P9jXb6ldOGG7hHgTTAWvPXwtMT4be1YsJdG34MuT/WSAPvz26GYMtlQjJW7yZFOG2YqCEmaAWSE1Jf/hgY2Nnw9DhgW6kAykppVTFChETHTGw/cTPJVI5CmQbShERe0yRIcmoVKkwtb2pUimaGHt6LWve6ij8eE25jQTDi1dBpO53v5aRk4l9rYtxM31S/H7c3vw27O78OW7b+GLEzvRVjD5GoF1m44gKaMOkXHmSe8xnhFzzmilX1Q8ccTaqKxeBktRs/315IRMSDheyHaWI9NFhtzobJSVtkDiLUeVINS+zpadw1hQ3Iy/GtyN4bWdaKge7etXLZiPJXnjJsulCPN2Sz2urlmIb668g3+9MoD++kIcWj31CF/VPYhkI+sQXihSjhsWemlRO0eIRq4KZicR1F4ieHM80RocgTh6HFuV88eRc2jISsXPhvbjLx+cwrc3D2Pv4iYky0OwsbEZg8sW4fQKMsquDfjmxgC+uXkMGdJAlCckPNxHVdN4QWl97Q3MjUljBpgtTNmPP8OWMYeLTi85ul1FuBkVh2NKPRZxfFHtp0YIh4uFweHo9pJicaAYR7s6cf/8AH62byP+484xPPjgOP585zDudjfjXs8ifD7ci7/cOoL/vjuMb28fwR9HDlP434YbXU34221vYE3xAvt3Ka4arfjzi5vsj3tXdDIDvAhiBXpYfRVY4qtEO1eKk1FReE8XgjPKCLRyfFBHwldQNNgdqMexsHjM5XBwdsNK3OpdgT/fPYEHd4fw4M4Avr11CP91ewjf3j2KP905YjfFn24P4D9HBvD7U/34pLsdn/S+jrU1o52CyTJeQ+T5yqHkuDADvAiEHD/oKbyHcTyg5bgilOOMZEoHW4RyHA0Q460gFRrdxVjtqcAuHyVWeQkgIhP01BTjyoZFeEDCP7h10C623Qy2iPDhqdHnI4NUA+zHtZUN9oJwWXGhXeTYxCxkF1TDEJGIeMcgFLgLofcIYAZ4ESRwvNFPoX6HWxC2ewajjydHZ5AOKY4+OCBR4H2tGnuFWtQ7i7CcK8eAKAzlIt1Dsa50teAB5fkHI0fwN4O9GO6owdH2WhxpqcCRhnz8z41hbCwfFf77JFHkqfbSoNZdTqbj4et7t/HxgV3MBE+ClEZtlEsAop18EengjUgnP+ic/Z/oIDZ7q7DPg48DDlyc8BXiTZdAvEFtoIFEWaHQUSqQ43igEG3OweigCLCGp0K9KvrhZwy212PkzXb870en8NXZPfj5zjUY6enASPcKHGsuwtmuRciZO9e+vmiskFQ7eqHeLwQ1HirkektRG5uAXw7vxafHdsNqSmcmmA5raSkqxHos9dbhDT891vgosM5fjeVBoSjl6ZBNIyszOOyxBzLGT0Wh3B0tlAIuixS4K1fihlCM65oIDAZJsZ2igJlCczPHCef4wdjmG4xN0ijkcRWQOftM2Pc8Px52VObh0qomnHm9DtfeXI5d9cWojQlDnFBB+d0DxVRk5nLF9u0S3fh4jatBNNUYC025+PT0Afzb9SH87uowfnFumBlgOqKoMt9AobrPU4w+LzF6vcXYTC1bj7cMq/20qHZRo8yVjEAjTMcTTnlA0/x1dgO8Nscfd7ThOOvrjyFvPva6BeAgV4Cd7gI0OEmQ6eCDZQoB8NFlRJEZ4igyjO3CzlDPGuxum3yCR0aix7sEIYunRqK7BCnecoTxgh+uZ/JXokAdjlt7+/H5mXeoVTyLL+9cZeLPBKOLGBto5G/hSrCNQmiflxCbyACbeRJ082To4CpR7SxDmbMG891VVOBNTAsijhdSvdUIJgPUcQJxSReN8wI5Drj5YwelkbccfbHFQ4YmVwXSyVTr09PRlT8f0a4+6KDP032vYr/Q8zq2VkyewTPR/gtcpNRGTowWP+Rk32Zc2roJf3/hDBN/JsQ6CWFxo1HupMISGqEbPGV4kyfFZhphm7wkoxGBwu1aLhnBTYNGDx1qPfVI4PCRTKMxxEuGZMr7aV5qBJEBSml/a92EGPSX4kO1Dp9IZbgnU2EP7aOVIomB9mORRSDeT4z4Ob5Y7iaC3NH1oViHOhfCakyaIF6GjxhFrkokOwueSNTmpsmzlTaqy8d/xPLKY/UMR4MrFVAuJKyrHnUuKtSQEVZxVej2VqKXosA2MsI2TxH63KXopCq7zU2FZjc1LLSuzokPo48WZl895NQBxM7xwxpXCY75SvChTI6PlBrckSoxEKBAs4ME853E9tnAHD8lyijyJFP6Gfsqdgwx4wXhdxSTaYz0Hcb+nBGlpVY0ty6btM2nlyb/MumVJYzjiyYS3rbUu5EJ3EPtiy3fVzrJUecgxhquFptIgH4e9fCeUqwiAZdSGmh316COG4IoMoWRq0cZRYWioLlQk7jr3ZUY8lfhnFiHbid/dHsE4w1qC1e6ytBMxRqP8nmFtwKvuUmoZXOfVpBCngZxPvxnFm5/Vxt+dYS1hg9JIxGqPUh4TxLeM4yeh6LCPQxlHrS461HpRhHBVYsWGumtlH/bXCRY7KrCYg8t2nznkdgeUJDgMQ4ytHiFocYnjP6mdo9M0x0Qhm5/DXo8+RggI5yS6LHTT4F2D6ndAOX0WOYhgmzOqAFykuehMS8VjdnxsGYloCQjDULK9/EeCmRQgWn/wk+AIWX8jOR3lJuMKEyMYwawEU6VuYjjah+xGlp0VMjFcMTUSkkQyxGSOBEo5YajiBeJHG4ocrzDYeaFweSpsy9hVANoaJsuQSRtFwwrRYFa7xCIaV8VXlpYHILQ4RKA48FSXBbLcJ5aw7cF4VhCRgqisF9CbaUxSP5YMZKoxkinaDP25xNjTIhnYv+QGlE46qhga/bRYVGAHsuCwtERoMMS/xAUemqpLRMixVEOAxlBSylCSCPaj0asHwnrT8+l1OfL7NO9Qlp80CWMQSInCI1kjnqenozhi3h6v81XiaNyPW7KlbgpU2A4UEbFoRgr3KgTIFHFP8j9U5HsLkOim/SpRSxIS2EG+I4Eat3avEKxwSsE66if76Lcvd5ViI0uQnS7i+xn7tZRf73Ogyp+ZyG6XGRYReG3k/JvmQMfZicB9fBi5LpoUEB1gpkKRyNFBT0JvkU6D5Y5AhRTiljAU1Fe90IdT4l9klCc14TiskKH4wESbPdRYbW7AqVUb4x9rUeip/YxldpP29xCb9rTXV7WXLQAtw/umbDtZ1fP2f++f/4w/vDxKzRP0O4dhrU0wvf5KLHfW4h9Hr44I5Dh3NhyQajAJaESl+n5ZZEKu50DsZWMsYly9WZqDXu9FOjyUFJhKEWtkxol1DHEeWgoGgRgewBFFGc+qmjE5vmqKTVwUUrdQisVg81kqk4qCHeoIrEhMBRL/cPtKWXsaz2SeNfpW770jKnvNmak+mHsKefdrRN/GXz/9F7saCqnYnArvvzg2rSf8f+CSBqRy6mP3ujIx2WpHu/xJSQ45WW+gBYRLgjEJLwI1wVSXLVN39Lf10RqvO1la/0k9qXfTYBeEnSTp8a+LLX90ofaPSXtu5evxxoeFZRcOZL8ldQOclFIo9dKOdxW9Zd4ShDJcab6whVz6T31NJM5U5ERG2vfJiN99Eqf9PSJc/zfF/1x3L8whI/3b8XfvUrdwEoajQPUR18XUT4WSXCNL8QlgcAu/HcGsD1eDBbhEp/MECwmI4hwhcxwUSSlRymukWG2O/thP1dE0UOAQaro9wvD0C4KQ4YHn7oIBSweMmgdfCBy9IfU0Q8CEjyc44QFnDm4IlDiBt9mMA02U/un/cEU8OMwRj/+PERenhm5ZhPyzLnIzZv+5la/uXQaI29veXUMsNvPJjoZgEb5+yS0TdALUi3OSGztmRYn7W2aFqclIThKeXtPoBLH+Uq7MWzR4AZtd1MgxEiwBLdo2/dF8tEIoozEHkEICRyEKCr8TG4ylMvmUgTwQ7KzDE1uavRRKL/Al+NXOi1+rtPjkIcftnjKYfXVIZqvmZEI+abH1wAFBQXIyZmPvNwcWtjdzSaQxaVRywvC1WChXcwrYiWG+Fqsp9y9mgrDjQ4BWDcnAOsd/OnRD6ucg7CUWrg3aISepTRwjda3L1Qj2CLINTLOFZkeO6i/X0LrVZLYDVTZt1I3ke0iovzvA92cIBicpVjsqsZOqh+uC7X4tV6Dj1Vq7HIPQjd1IU1cWyfggZKS6S/aMCQlTruOmSJAfn6ufRl7iWFjSaAGwwEKDATIMBCowipXKTa6ytBHYu1xC7KHdluffkE4Whe8Z4sO9GgL2fvcg7GNRvBGSiGvu8jtM3nLncXooI6g3SHQPuf/umswltumiL216ODpYHFUIMRh9CxdA3UcXW4qbKAC8UpUAvaqtGj1l6GOr0Oet2LWhbI2jf9M7JWlLTgUW6j9Wkb99BrK0bupFjgbIMUdEvke1QO3RRTmxRJcokdbvj9PUeIimcH291V63xY1TgbYaggpDlL+P0HtnK2nH/ST47A4FIOKCOwIDkcndQS1XkpEU+cw9tEcBY3wRV7hsAaEQO/oieZ0AyriorCroxkbKmf/NjMNjewWtxyLjwYrPdX2Pv8d39F276ZQjntiOe6S8O9LJTinVGAoNBSHQyIwqA/HkC4CQ5owDGv1OKXR46wilAyhx3U+pYRAOS4GKXCIDLGWp0Ej7bfVSYV6/1DE88bF/44wKhwVVAgOdXbg6JIGfLyvD58c6sfV9UsRLXn2+X3GNJRSdd5D+fg8FVwXgyi0k/gXqde/RKP9uESFXWo9WvTT9+WtZIC1/gp0+Umx0l+KSp4YBWMXeEzHkZXt+M2Bjfj63nv4/O5FfDFyAV+dHcSelSuYAWYTEccR/dIInPChQoyq+uvBMpwhExRRT55IS4L/+C9qZptfD+/C7269i/sfXMY/j1zCV5dHZ+QYs4jNANulkWQABa4GKXFZpMHCAD6E9PrYKj8a1vRYfH3zFP5l5By+uP18p2ANaZnIymLt3ySEHAdsk1AECFBTby+HhUa9xfji/qvGxoZanOrvm/D5MQmTT9synhNCzhxsk0VhW6Dtkqw5P+qBrq0onfLzUjMe3acXlVahuKSSGeJ5slUdg0LfJ/st3fOgssSCmvISGAwT5+wTkp8sAlmbH32rucLUaCxIjZz0flXV1HcMeSWJcHR+IQejoaYSdVXT3zTKkJSMnMwnv44/JzMdlvmpZIAoWNjFH4+mquKnG1L/+sTb+MfTByd8v/S0bBQVV2BB+ejNIRgvOSnJU4/O9zavxC/f2YwrW9airmTq285OVyDOFQYyk/zUsJ2Xb2qsQ0lpISrKpy4EH8e/f3gVJ37wI46pyInSoywpErkJEfZ1S8zj/3qW8QLJIAMYDanINKYjK3PmLV6CVIg/XByA0pkD4xTXBkyHMTGGGeCnQJohhcQ32MU3kgnGXp5Ac3Ymehe3oDhr1CB/uH0FRrUcDy4dQIJ4ZmE9MyYc+SmTOwDGC8ZoNMIWBdKNacicIgIY5cHoKczER29tQI+1DKc3rcbX10av4LVmTX/e/zsyo1UoTA5BSfbEy8gYs4wh6el/a19RNFrsJVO4N4UoUGOIw7Li8buBPQ2mWC3qzAZmgh8LQ8zMzgDOlOykODxrq5oVo0ZfSwktZYhVjU96ZWSwaebnjikuAgXJUajJ/+nehz9tnp4Jz2C88qSlsZtFMhgMBoPBYDAYjB8HDuf/AL9hbLLYljymAAAAAElFTkSuQmCC",
          "land2": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAABmbSURBVHhe7Z0HVFR3vsdHpM3Q+1SmMUMVRBCUPvRehjJ0EBXB2BJRUUFFRY29BIwNazQ27NiiJrZkUzz7dt/Lvt1szts9eWf7291kE6NJdr/vN3cIhKCChejG/+ec/7l3Zu7cmXO/v/+v/O//3stjMBgMBoPBYDAYDAaDwWAwGAwGg8F4miQlJKOmejy6XzL+HdHpdI8soNEAqiurmAH8u5CWltZPrLKysocWUK/XD/idhASTYSUmJjIDYTAYDAaDwWAwGAwGg8FgMBgMBoPBYDAYDAaDwWAwGAwGg8FgMBiPgcEwjs1KZtyb9o4zzDieJSrrm1Fe08hEeR5Jy6uFLnsaxsaPQ55h+iMbQX7hhCExoOjo/hfVMJ4gaRnFqJm2DHUvreEOdG5OxTN5wHOzy5khDAXVVRMRHpUDXUIpd4AjI9J/0APdse8ydh64zMR9FsjLe/jrFZ8Ei5ftZgbwLJCWljdoISLDs5loPzbSMgs5UcNCYp5pcfNyi5nxDQXpWeUIDUtgB/d5JSm5GLHxgw8DjB8ZySkl0BeYbj0TF5vCDOF5JDmpEDk5T6caYDxlxo5JRmZGCRmA4b4GkJNXzYzjx06B/v6jgeVVM4bMACoSU5lxPQtk5ZYgOjK5nxgJSQPfpOpRMXqW1XV1WFlXy4zgaZOeXgBjM66nDKHo3yUzJRvX21bheOMLaNCzSuSpYjwDl5Ke30+ErPyhvTnlF5cP4h/HN+HddQtRwE7+PF1iqQysLKtBgq43FASHDl1p+MnpXbh7dS/+dbUDH7Y3M/GfNmPDE1FX++ITF0J/j3kDlemZ+PrGYdx+czvuXtmKDzc3onPhXGYETwsvbSwdfClcRUE9IuSXTEfjwi1c637rkTAUT+7z/ZrMHHx25RDuvLmNa19e3cp5gdfqipgBPC1Kq2Zi/LSlWLp6L3LzJyAlzSRG05IdmNqwtkeY5ev2w9i6Xz4S5eFBuHvtAPX8LfiCmtEAvr6yDVebpzID+KEJDzOdBSyrno1xdfORntc36Rtft6DP6wWtO7Fq45FBC1VY9EK/bb+40YmvbuzFnbe24su3yAtc3Y6vyBNcmV834H7TskoG/duMQVJV8RIs+FoovGLh7Rfd7wAXl/QVcUx0Hta3H++3Xfv2rj7vpWX2H1z6r11r8dmlDty5uZcT//abW3H3re0AJYNXF/Q3lu9SM3H2Az9nPCTZ2SY3X1E1BQHBKVB6x2JEaDIqKsfDUGQqycZVT7vvQY+IzOnz2catJ7jXgf4mr5KdNwFNi7bh0Jn3uNd5GQbc3LgU/7xxBHjvCCWBu3Hn+g6u/fPt1/D3rj3cdnEPODs5lk0YfTJERZtuMT9uwkzkF5qStPikAkTGZPUc4Mry3uQtIjIL42tnQRedgWmUwXfOndnzWUVNb8/MTy3CWLEcv3v7Rs972/dfgSIgEXn6CajOysPCijIszs9CZ2M17r69H5/eeB3/9/6lnu3vR/m4hgG3YQyCnFzTLCAjEkUofHziuNehYUkIDjdNDomKSOrZprTYlJy1Ln8F/r5hmJSUjAuNU3o/r+j1EpkhY/HG+uVoHV+K//uPaz3vB4ZmIzomF8H+Y7Fm/nKUjQ3H5zcO4u57h1AW5YfiZNPYQ1Eem/kz5IyJuPfgThT1/m+TrOCR8Siv7JuVb9i0Ey+/3IaIkWPw2/0dmJJsMhJdQi637GrbjjfWtOLzd47hsw9O4YufnsKn753GnNwMLKuqRkdDHe6+fxafXe3E3ZuH8eXbe/HFOwcwPtoPa2dMRG50OD44/jq3r5GjdKge3+tZSsse/foFxvcIHW0ygPCIDG4ZFWnq9UGBMTCUTOw50IVFdais7j3wK1a8goUt67Fq5VbMydZjWrJpkmh0VCa3vNm2Fr89sAnffHAMdz44itu3DuP2Tw7h9tuH8Y+39lO5t4cy/g5K/nbg9lXK/t/ZhzvvHsTHh9bhk1PbcefWOfzy8DZuXxmZ1ahkLn9oMBRPQUFhPYICTa7/u1RP6D31O3VK3xIwNT4bkybPx+LWdox2kmFGVBqayychNDie2+7WVhLywBr88/0juEOu/fa7r+HLnxwgkfdT1r+bkr6duHtjFzUygpsduH1zF/f5R/uW4Q/H2/Dl9YO4tnIOiuOTkJBYAkNpXw9UUFDZ7/8yHpLICJNYRlJTehO+b4mOzYa+qAbxiaZMPIhng3J7TxgcPaHlWcCRmhXPDKXaEMwQ+WKaMrhnH2+tWIg/HdyEf71/GF+R6F+8s5vc/E5TI8GNwn9xnXr69Z1c5v+l0RgoCbzV3ow/nWjHnTcP4PryBuRHxEBfUI/ycbNQWcEGh35wyip6s/9IS3foHZQYyeMjy80T07yDMMKMDzVvOOYoRqJFMhLew+y57fdMnYj/3buuxwC4Wp+E53r7DVO5Z2y3yQBMBrELP9u+CMfnTMBfTu/Av64fx776EsT6jERZ9UzyNs34NlwxngJFJHylgxdK+VKMs5OiwsoVs8gT7IlJh4rHQ4KjHJNdtHjBTo5kc3t0LliAg9Nqqc7vxFeU3H1DHsDY4znBr9HyqlF8o1cwJn+7cefabnx6bis+v9iBv3Vto23OwJO8S2FqCaJ0hYiMNuUWjKdA1DAXVPIVmOTih1pXP0yV+mOaKgj5Zi6od1ZjxRgdgnmW0A13xGqhP/aNSUWsuQDnli3H5aWz8dXVA/jq+i5umNfY/nxuG/7YtRu/O7sXvz+3D3+8uA9/u3KQE/6PR1fh90fW4sVMUyloKJiEUaNTER7GHoP3VJDybFFtr0GVrQ+yhkuho9eJPGvEU+98SRGIpGGOWCjxxlKlFjUuIixwVWCJtRjTZb6cYJc2rsYn+19B19wKfH2tg4xhBxoTgjFLF4aZCeGYlxqNuSlRmJc4Bj9vb8HHO1rwKwod3I8TFWUzEBAUB3aZ+FOkUqBCCU+IGp49DiiCcEjshcMSDRY7imEQiJE/3B7tXgEYbyXAErkvWm3EmOwo6hFMTiHizcVz8M6K6fjrqQ347MIWfH6J8oEb+/DPd48Ct07hg9WzcWvlLPzmGLtQ9JmjUqBEi60ce0U+OOqhwjGxAseEchxXkNhSNXLNHbFK5YsqSwFmegej0V6M2R4yTkh9aBiqQkKRLpKis+lFfHOTysKbr+Hrdw/hm/dI/A9OUuvCr1/fhP/e1w5vRwEzgGeNMmspFlHyt1/ohWMiFTpFJL7IE10SNY57+mAieYZ6MoYMe3e4UmkYTuFhjlDKCbkkNwubcrKR5OyBMU6uyNJo0NHcgJ0ts7Fn0WwcaG1C55plmJmXCwl5ihC+C7QWjswIniXKBDLMtRBir8QXe0RqHPDU4pBMgxPk7o+S8C0eGgSR6CHDBBDyzOFP6zNV/j0ibqmvx6k5s3GqsQFFvtp7iptl64wZYm+Mo/whUyBkBvC4ePMEyDQXImO4BOnDpMgerkQOtWCeC5VXNj0HuCLfNP37+8hom2hHL+6zAhs5pvBlaBjuhmZLEVbaemC1tQs2Um9dNdwJizx84E09fwT13FFm9ojmu/XbZ2tJMc7On4n2yZN6Pou0cEaarQQpVFbWCL2pwlDD4CBDprv6nv+JMUgKqCafLvRFo5s36mw8MV5AJRxfjcm23qgUeKGclnkU0w20jYay+u6v9WGUhQjJjt7cZ1HD3ZHHc8aLFm7Y6CjFeZU3LsrVuKLW4g3fYMywl0FFBqAhQcuoLCy08ui3zxcTY7F5Ut8ZRgZ7OYqc1BDTd7vfYjwusRYumOWowjwnOeY5emK+owLzab3FWYUWdx9MsJaj1FwGAxlErqUSqQI1Eh3UyKDenuGuhZLKOq05xWo7DTJtTe5aQzE+38wNM8hYTij9cF6mwAWFChfJEI7IfVBr7wkpiaigZLDKUoyJAlP8/5b0QH+8v74VBxbP6/N+qZMXIqmkNK4rrZwR7qRghvA4JAxzQIOrCk3OniS+lFvOd5JRk2CBs5xrTS5KNLt4cyN2RWYirrYvt5RjqoMfqjz8oTVzhC/PCUXkJYrtTbW8hMfHJAspNor8sNNDiU65Bke9/DGZRK8n4xjHF9F3rKHgWeJloR9qqUw0fi9srGk2UGqAPz5+fVcfcX2sHJHOs8KRrHxoKfnLdtGg0JYZwCNRXW66nLvGSoiF1OMXOcuw0MkTzdTmu0ipeZqMgdaNy2bqafOdlZjr4kPlWhBecNCizFYFLxJaRG0MJXzl9j4w2Pn0CJJHlUDBMDeUD3PBRPIyUyydsMRBiCZLZzTYeSKEvicjA5hOvT/Zvn8I+D7ZtmJMd1MixcaFEkgBqpy1KLZTMQN4VEqod7ZQD26lGLzUSYVF1BaQi51Hy0YXNebS+7OcvfAi9bQZrr6opWW2jQwjea6UGLpSL3RGPG1XQQIax/xzhokwjoxAxTOVZPkuXqihfOJlRRD2+oXgqH8ITnn54TWZN+qtRQik3sz9kUFQIvJFHf2vBCsXMjpLxNBvvCgaxXmQ7k0YD4OGDmS2hQLjzOWoNfPEVFqfQuv1lipMsFSg2lqBGoEK5QIlxVxnEssZaornXjw7jDBzR5KVAuGWEkSbe2C6tQQTbT2RwXNAkywESbamAZ1iBxUa7NVotHbHSjs3rBY4o83BHW1kACW0vZ+FXR/xCqJGojAyEAURI5AXO7rnM8UwCidkaJPJkIw9f6qMQg95lToHDSWD5swAHgWFuQt0FkrkWWpQbu3LtTIrXxTzfZEnCKD47Ei9ywFKWnrSwRYakzq3AOjJ5RZSNTCRErcCcskZDhLMpXh+KEwHA4mzgLxEvo1pSLeADKCetntVNQodCn/sUAdig3okptqIEWXmROL1lpZGquICUR3nj8oY+j+6kT2f6YValLtpEMQXItFdiVoKRUavZPQu3ZswHgU1T0hCe8CH3Llvd9NSU1OLoZ6fxFchkS9HHF8BnZUME2y9MItc/QKqDlZSHd+gGIF4vjMW2UiwTU7GQwleK7lqvbWppk+npLHCQsKNB0w0d6NSzxUjKPHzH2ZDsb+v+PcjgLyHggxLSt/zGGZPhmjMGyy4+QWF9B/F3RUBYxD4UKIVZS+BjnplooUYqVZypFvKkEHuPIev5FqmtZJ7XUS1fzGJX2RNPd7Gi5I7LcZRmdckCsRiMoBFtiJMk2gQR/tsoB65XaZFFYnS7KpBno07J8pYNzVibIWIsnZFtL0QoZaOFLvtkGJGBmZhNDT+gOJlCH05T+FpZo9wCi3R1mJEWLmTEdkhgt+3dGQMgNF119mqMdXeC9PtVZhJgs6x80Ij9exmEtnYFpLQi2w0WE89fAUJvcbDG01UJUwhd1tko0AB3xOVTrQP2tdsyuSryD1HURm4VeqDtaogJFPYiCcjM/5eIi0NIi0qqAycqdRglrsU6x1laHNWYJWzhvMMJe6mgaN7EWspIo9hi7F2UmRS6MkmwafYK7DAjRJTkQahFg7MAAZDpFiJAjsZ6knselslJtso8QLVzzPooDZZy7CUkrnlllKspnVjW2clwVGRNw5R+XfIVY4tDlKscVVjkkCGYoEC0cNFyKS6v9FOiUoqI33JJS+hxGxzeAJCqGf6UKxWUE8vpARxPInYSL33ktILF8VynBd74orCC4fIYCbTPjIs7z2G70dhJUIgRJiNFDpaT6X/lGrhgTkkfhPfHc125IHI63RvzngQZSTmdBs1J/gsgScW88VYRAd3GV+C3dQjT1APPeHuiZMecq6dcjcuZdQk3PK4SIE9zhJsdZaizUWO9bIATKDeX2omRL65GHFkBFKK0x5kCN48F4ylMGD8XQP18gpzIWZYuGGdsxi7aD/bXCkpdPLABtpPnZUYKQLxgCJqKYQozGypCcgjWKGMEs+X7KhJNZCasSHhB6K1dEI91fANlDA10AFvHu6MA+Q+94tU3CSNTqESp0RKnKGeeVaqwjmJFy7IvGhdgXPUuiRynJYocFKiQie9f0zqhSNKHzRRBTDFiup+aymyKER4kAGEkJhxZhLEU/Zv/O1kGxkqKQmsp22qKebPJS8xW67BfO0ITFX4oNzTHzqRaQRwIPLDRiEn0DTKqLG0hT8Zgo4MlfuQcX8iqPfNolp8OcXugyI1Drt5otPDE0eFnjhCwh8WqnBUTOJKtdhkJ6Q6XYyNjmKsoeSu3VGETY5CbHAQYb29mDujt8LWHYsF7njBygGTbN1QQSVfNeUKxrNyk+l36hx9EU/Zv/G3/WjbUHL/MebOGEnxWmXBx7yyIswr18MQFYLYwPvH/+9ybdsm3Fi1EO+va8axJbPRNrOeCT9YUqmOX0eJVjvV6p0eCk78I9RzDpE7NnqBDorF2yiR2yX1Q5O5I+ZbuGAeCTbP0gXN5i5osnTlXjeR52gc7oLZtJxB72XxLJFK2XkaZfIzXSm5c1djnps3ajz8EePaf3g2WiHFrvkv4U+XXscfLuzCz/dvwNLa/ncXzczsf0v5D9pW4MONzfhoSws+fHUJ3t64GBXfGShi3IcJJOoyZ2+cUwSgi2L8Ker1RiM4JFTjdXpvC31ex7PHFDKSDU6eOEwe4oRYjZPkFU6KtTjNNS8KERp0ib0pDNA6JV4nPH1wWO6DvTIf7AkKwzafILSSUVXQd8W84f2EWTmhDG3V2fiwoxX/uLwTf7+4HX87vxtzC3svIH0QP9u1Gf+5qQUfbV6Ej7cvwy93rUOVLpwZwEBMctViraMG56XeuEjCG5O9/W4qbKaksJFi8vxhjuQJtJxBdBqnblE+YEz4TlNoOE2eoos8xGkKD8ZlF4WIHdoAtGmDsNE7CGvUI7Cc1n15wwYU4sCCRvzP7tX47Myr+PuZzfhrVxv+eqoNvz/2Kkojeu8p9CAuvLIJH+1uw893bsCVrRsf+B2dznTp+nPPRMrGjQZw0dMX56hXH6QkbAH1+FYLSgRp/TAlYMYk8FvhjRM3jQmhyQBUOCb3xX61Lw76jMBrI8KQOowPH545NStuMkf3zwyK3xzbhT+f3YM/nzIaQRs+PbcNXQsnY0b24Obuj6/sveg0PrL38jTGA6hx9SLX7oMOR0+02XqihcTvsBXhDAl/Umjq6cbsnhOfjOCwhxp7FH7cmP32wLGc2IYRkdycPSHFfBkJn2SnRQpfBUn35VyDpazY9FTQX71xGn+5cgS/u3wS9VnpiAkc2AMkpxdCX1T1wO3idckoLSxBUYEB+u/cv+C5ZoKbDzY6+2IF1f0tlkIuFzhPPfss1fpdJPoZIdX8YuNsXRUnfruLEhmUrRsnW8i7Y3kwGU6CvQrJDlqkOWiQbq1GBt8LkgeM5cdEhCM+JrLP52VV/e/fo89+so+bKyksQn6eHqUFxYiLYU8x4ZU4e6HBWoFmM1ec9QrFGxTrjbnABZEcZ4UyLrYflWi5hDCdBA8x753rN9JeTqJ7Ic1GxZ0fSOfLkSFQUFNxTczreyp3IKpq+htARoYBUZFPNl4XFxTCoGf3C+SocNdilrUcu6hOP0+Z/CUS/BK5f+PyAiV3x2XeqOY7I4B6fPdX+pBoKSPx5Vwzip7GJ0MgD5Bi03fwJj8/H1WV5SgvL0dN9XiUFj/Zh0eMHhOL1IwCJKfeezbyd8nOzEFGGrsolKOSksAlfOrx1PMvuSu6DYAa1f3GzL/OyvmBByrURoIkGyXSBHJO/FRrFRIFasRJRjzWAY6LS4XxvsIJCRkYE268w+jApKXmIimp//0Ivo/Ro8THpiI6sv/NK547Kp2UWG5LwlP5d5ni/hVK/C6LNdihCUY0JXbdmz2Q0Q6UA1hLkSpQIp7CgT+/9/q9bykuLkVRUTEJmgADxeHut+/LzNJ8vNI8B5NKSvCg5wzpE3srBENG31vKMQaB3kaEFoEMF9xlZACeXA5gPA8QyjMb9MEc4SRDAsX/BCsFohzuffFFdnY2CgqKUJhfwGXhqSlJSNDdu1T76e41+GT/Svz24HrMK89DSqLpPkNGfn3tDexfs4x7HcAf/HxBxgMopNLvvEhN4iuxjIwg2Wng2bffR2HpgKDuaV73Ijc3l7LvAuj1ejKAQuh0D3brs4pND5TIio+DjsIB9yZjaChyVWE/xfyTykCM9w8ckoNtdPuFhQbyAgXkBYoQHR2N2Oj7P0k0dqypRIyJ0iE66v4DQfpY03a/ODn4ewszvke4vRQtbgGotRna6VMpSanIzdVTjzaN7z9sHZ6gkSDTv/9JJJn1cPxibxszgMdhmjwUqTYDT7wYKqIi+t9A+vsEulgj3ksK/T3OBv6sYz0zgEclNTEJ6uH2iJD3XrHzsBQUPbmh1Q/PHeeu6b/VvhzGu4BcXrsI6SN84e9qj6RRASjI7X+j51OrW5kB/Ni41d4KBRnAgfkvIVqjvK/AZSX3fhBUmPr+Ia288skOMTOGkPiQ3gtAHpbkUB+khgVAFz40yS3jByIhjt3M8d+C7Sue/qPZokc+ei7DeALU6llvfe6ID+6dvTtOn4HEsSGPZQTjJ83EyraDyK+a1bOfyvLe+wAxnjHG5fZ/KPSToKRuITbvMT0oqqTENGOI8Yyyd3UTJ1B2gg5JY0YhNmxwkzkHYu2Wo9x+8nIffhJHnJ8MFcm9Q875+ewB0kNCQtjQllmjI3vPCA6W7JhgFMaHoCA+jIk+1ET6iPHh+YNP/EAbiku5fX77cInHZVpROpq6LzYpK3uys5KeeyJ9+o/W5eQMPEPnh2JubTEm5yeBVSkMxpMkI2Y0ml8wYMXMaixrqGW963nEkByGukLmWhkMBoPBYDAYDAaDwWAweDwe7/8BWwDiwZLvQf8AAAAASUVORK5CYII=",
          "sit": "data:image/png;base64,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",
          "battle": "data:image/png;base64,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"
};
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

        const dante = new ShimejiPet(this, window.innerWidth * 0.5 - 64, window.innerHeight - 160);
        this.shimejis.push(dante);
        container.appendChild(dante.element);

        let lastTime = performance.now();
        const loop = (now) => {
            const dt = Math.min(100, now - lastTime);
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
        let selectedMode = cfg.mode || 'follow';
        let selectedScale = cfg.scale || 0.9;
        let selectedSpeed = cfg.speed || 3.0;

        const backdrop = document.createElement('div');
        backdrop.className = 'dm-cat-modal-backdrop';
        backdrop.innerHTML = `
            <div class="dm-cat-modal-box" style="width: 500px;">
                <div class="dm-cat-modal-header">
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="font-size: 22px;">🔴</span>
                        <span>Dante Masaüstü Maskotu (Shimeji)</span>
                    </div>
                </div>

                <div class="dm-cat-modal-body" style="padding: 16px 20px; gap: 14px;">
                    <!-- Status Toggle -->
                    <div class="dm-cat-setting-row">
                        <label class="dm-cat-setting-label">Dante Durumu</label>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="dm-cat-btn dm-cat-status-btn ${selectedEnabled ? 'dm-cat-btn-primary' : ''}" data-enabled="true" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: ${selectedEnabled ? 'var(--brand-500, #5865f2)' : 'var(--background-secondary-alt, #1e1f22)'}; color: #fff;">
                                <span>🔴 Dante Aktif (Ekranda Gezsin)</span>
                            </button>
                            <button type="button" class="dm-cat-btn dm-cat-status-btn ${!selectedEnabled ? 'dm-cat-btn-primary' : ''}" data-enabled="false" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: ${!selectedEnabled ? 'var(--brand-500, #5865f2)' : 'var(--background-secondary-alt, #1e1f22)'}; color: #fff;">
                                <span>🚫 Dante Kapalı (Gizle)</span>
                            </button>
                        </div>
                    </div>

                    <!-- Behavior Mode -->
                    <div class="dm-cat-setting-row">
                        <label class="dm-cat-setting-label">Davranış Modu</label>
                        <div style="display: flex; gap: 8px;">
                            <button type="button" class="dm-cat-btn dm-cat-mode-btn ${selectedMode === 'follow' ? 'dm-cat-btn-primary' : ''}" data-mode="follow" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: ${selectedMode === 'follow' ? 'var(--brand-500, #5865f2)' : 'var(--background-secondary-alt, #1e1f22)'}; color: #fff;">
                                <span>🖱️ Fareyi Takip Et</span>
                            </button>
                            <button type="button" class="dm-cat-btn dm-cat-mode-btn ${selectedMode === 'roam' ? 'dm-cat-btn-primary' : ''}" data-mode="roam" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: ${selectedMode === 'roam' ? 'var(--brand-500, #5865f2)' : 'var(--background-secondary-alt, #1e1f22)'}; color: #fff;">
                                <span>🚶 Serbest Gezinti</span>
                            </button>
                            <button type="button" class="dm-cat-btn dm-cat-mode-btn ${selectedMode === 'sit' ? 'dm-cat-btn-primary' : ''}" data-mode="sit" style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background: ${selectedMode === 'sit' ? 'var(--brand-500, #5865f2)' : 'var(--background-secondary-alt, #1e1f22)'}; color: #fff;">
                                <span>🪑 Sakin / Otur</span>
                            </button>
                        </div>
                        <div class="dm-cat-setting-desc">Fareyi Takip Et seçildiğinde Dante fare imlecinizin peşinden koşar ve yanınızda bekler.</div>
                    </div>

                    <!-- Scale Slider -->
                    <div class="dm-cat-setting-row">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <label class="dm-cat-setting-label" style="margin-bottom: 0;">Boyut (Ölçek)</label>
                            <span id="dmShimejiScaleText" style="color: var(--text-normal, #fff); font-size: 13px; font-weight: 600;">${Math.round(selectedScale * 100)}%</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <input type="range" id="dmShimejiScale" min="0.6" max="1.4" step="0.05" value="${selectedScale}" style="flex: 1; accent-color: var(--brand-500, #5865f2); cursor: pointer;" />
                        </div>
                    </div>

                    <!-- Speed Slider -->
                    <div class="dm-cat-setting-row">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <label class="dm-cat-setting-label" style="margin-bottom: 0;">Yürüme Hızı</label>
                            <span id="dmShimejiSpeedText" style="color: var(--text-normal, #fff); font-size: 13px; font-weight: 600;">${selectedSpeed}x</span>
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <input type="range" id="dmShimejiSpeed" min="1" max="5" step="0.5" value="${selectedSpeed}" style="flex: 1; accent-color: var(--brand-500, #5865f2); cursor: pointer;" />
                        </div>
                    </div>
                </div>

                <div class="dm-cat-modal-footer">
                    <button class="dm-cat-btn dm-cat-btn-cancel" id="dmShimejiCancel">İptal</button>
                    <button class="dm-cat-btn dm-cat-btn-primary" id="dmShimejiSave">Kaydet ve Uygula</button>
                </div>
            </div>
        `;

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
        };

        const speedInput = backdrop.querySelector('#dmShimejiSpeed');
        const speedText = backdrop.querySelector('#dmShimejiSpeedText');
        speedInput.oninput = () => {
            selectedSpeed = parseFloat(speedInput.value);
            speedText.textContent = selectedSpeed + 'x';
        };

        backdrop.querySelector('#dmShimejiSave').onclick = () => {
            this.shimejiSettings = {
                enabled: selectedEnabled,
                character: 'dante',
                mode: selectedMode,
                scale: selectedScale,
                speed: selectedSpeed,
                physics: true
            };
            this.saveSettings();
            this.initShimejis();
            const btn = document.querySelector('.dm-cat-shimeji-btn');
            if (btn) btn.classList.toggle('active', selectedEnabled);
            this.closeModal();
        };

        backdrop.querySelector('#dmShimejiCancel').onclick = () => this.closeModal();
        backdrop.onclick = (e) => { if (e.target === backdrop) this.closeModal(); };

        document.body.appendChild(backdrop);
    }

    openShimejiContextMenu(x, y, pet) {
        this.closeContextMenu();
        const menu = document.createElement('div');
        menu.className = 'dm-cat-context-menu';
        menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
        menu.style.top = Math.min(y, window.innerHeight - 220) + 'px';

        const curMode = this.shimejiSettings.mode;

        menu.innerHTML = `
            <div style="padding: 6px 10px; font-size: 11px; font-weight: 700; color: var(--brand-500, #5865f2); text-transform: uppercase;">
                🔴 DANTE (SHIMEJI)
            </div>
            <div class="dm-cat-menu-item" id="dmShimejiMenuFollow">
                <span>${curMode === 'follow' ? '✓ ' : ''}Fareyi Takip Et</span>
            </div>
            <div class="dm-cat-menu-item" id="dmShimejiMenuRoam">
                <span>${curMode === 'roam' ? '✓ ' : ''}Serbest Gezinti</span>
            </div>
            <div class="dm-cat-menu-item" id="dmShimejiMenuSit">
                <span>${curMode === 'sit' ? '✓ ' : ''}Otur / Sabit Dur</span>
            </div>
            <div style="height: 1px; background: rgba(255,255,255,0.08); margin: 4px 0;"></div>
            <div class="dm-cat-menu-item" id="dmShimejiMenuSettings">
                <span>Dante Ayarları</span>
            </div>
            <div class="dm-cat-menu-item danger" id="dmShimejiMenuDismiss">
                <span>Dante'yi Kapat</span>
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
    constructor(manager, x, y) {
        this.manager = manager;
        this.charName = 'dante';
        this.x = x || (window.innerWidth / 2 - 64);
        this.y = y || (window.innerHeight - 160);
        this.vx = 0;
        this.vy = 0;
        this.facing = 1; // 1 = Sağa, -1 = Sola
        this.state = 'IDLE';
        this.stateTimer = 2000;
        this.animTimer = 0;
        this.animIndex = 0;
        this.isDragged = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.dragHistory = [];
        this.currentFrameKey = 'idle';

        this.element = document.createElement('div');
        this.element.className = 'dm-cat-shimeji';
        this.element.title = 'Dante (Tıkla & Sürükle / Sağ Tıkla)';
        
        this.canvas = document.createElement('canvas');
        this.canvas.width = 128;
        this.canvas.height = 128;
        this.ctx = this.canvas.getContext('2d');
        this.element.appendChild(this.canvas);

        this.images = {};
        const danteSprites = this.manager.getDanteSprites();
        Object.keys(danteSprites).forEach(k => {
            const img = new Image();
            img.src = danteSprites[k];
            img.onload = () => {
                if (this.currentFrameKey === k) this.draw();
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
                this.dragHistory = [{ x: e.clientX, y: e.clientY, t: Date.now() }];
                this.element.classList.add('dragging');
            }
        });

        this.element.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            this.manager.openShimejiContextMenu(e.clientX, e.clientY, this);
        });
    }

    update(dt) {
        const scale = this.manager.shimejiSettings.scale || 0.9;
        const width = 128 * scale;
        const height = 128 * scale;
        const floorY = window.innerHeight - height - 8;
        const speed = (this.manager.shimejiSettings.speed || 3.0) * (dt / 16);
        const mode = this.manager.shimejiSettings.mode || 'follow';

        // 1. FARE İLE TUTULMA / SÜRÜKLEME (DRAGGED)
        if (this.isDragged) {
            this.x = this.manager.mouseX - this.dragStartX;
            this.y = this.manager.mouseY - this.dragStartY;
            this.facing = this.manager.mouseX > (this.x + width / 2) ? 1 : -1;
            this.currentFrameKey = 'dragged';

            this.dragHistory.push({ x: this.manager.mouseX, y: this.manager.mouseY, t: Date.now() });
            if (this.dragHistory.length > 5) this.dragHistory.shift();

            this.updateStyle();
            this.draw();
            return;
        }

        // 2. DÜŞME & FIRLATILMA FİZİĞİ (FALLING & GRAVITY)
        if (this.state === 'FALLING') {
            const gravity = 0.55;
            this.vy += gravity;
            this.x += this.vx;
            this.y += this.vy;
            this.currentFrameKey = 'fall';

            if (this.x < 0) {
                this.x = 0;
                this.vx = -this.vx * 0.6;
            } else if (this.x > window.innerWidth - width) {
                this.x = window.innerWidth - width;
                this.vx = -this.vx * 0.6;
            }

            this.vx *= 0.98;

            if (this.y >= floorY) {
                this.y = floorY;
                this.vy = 0;
                this.vx = 0;
                this.state = 'LANDING';
                this.currentFrameKey = 'land';
                this.stateTimer = 250;
            }

            this.updateStyle();
            this.draw();
            return;
        }

        // 3. YERE İNİŞ ANİMASYONU (LANDING)
        if (this.state === 'LANDING') {
            this.stateTimer -= dt;
            this.currentFrameKey = 'land2';
            if (this.stateTimer <= 0) {
                this.state = 'IDLE';
                this.stateTimer = 1000;
            }
            this.updateStyle();
            this.draw();
            return;
        }

        // 4. OTURMA MODU (SIT)
        if (mode === 'sit') {
            this.y = floorY;
            this.facing = this.manager.mouseX > (this.x + width / 2) ? 1 : -1;
            this.currentFrameKey = 'sit';
            this.updateStyle();
            this.draw();
            return;
        }

        // 5. FAREYİ TAKİP ETME MODU (FOLLOW MOUSE)
        if (mode === 'follow') {
            const targetX = this.manager.mouseX - (width / 2);
            const diffX = targetX - this.x;
            const dist = Math.abs(diffX);

            this.y = floorY;

            if (dist > 50) {
                if (diffX > 0) {
                    this.facing = 1; // Sağa dön
                    this.state = 'WALK_RIGHT';
                } else {
                    this.facing = -1; // Sola dön
                    this.state = 'WALK_LEFT';
                }

                this.x += this.facing * Math.min(speed * 1.5, dist);

                this.animTimer += dt;
                if (this.animTimer > 100) {
                    this.animTimer = 0;
                    this.animIndex = (this.animIndex + 1) % 4;
                    const walkFrames = ['walk1', 'walk2', 'walk3', 'walk4'];
                    this.currentFrameKey = walkFrames[this.animIndex];
                }
            } else {
                // Fareye yakın: Dur, fareye bak
                this.facing = this.manager.mouseX > (this.x + width / 2) ? 1 : -1;
                this.state = 'IDLE';
                this.currentFrameKey = 'idle';
            }

            this.updateStyle();
            this.draw();
            return;
        }

        // 6. SERBEST GEZİNTİ MODU (FREE ROAM)
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
            const rand = Math.random();
            if (rand < 0.35) {
                this.state = 'WALK_RIGHT';
                this.facing = 1;
                this.stateTimer = Math.random() * 3500 + 2000;
            } else if (rand < 0.70) {
                this.state = 'WALK_LEFT';
                this.facing = -1;
                this.stateTimer = Math.random() * 3500 + 2000;
            } else if (rand < 0.85) {
                this.state = 'IDLE';
                this.currentFrameKey = 'idle';
                this.stateTimer = Math.random() * 3000 + 1500;
            } else if (rand < 0.95) {
                this.state = 'BATTLE';
                this.currentFrameKey = 'battle';
                this.stateTimer = 2000;
            } else {
                this.state = 'SIT';
                this.currentFrameKey = 'sit';
                this.stateTimer = Math.random() * 4000 + 2000;
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
            if (this.animTimer > 100) {
                this.animTimer = 0;
                this.animIndex = (this.animIndex + 1) % 4;
                const walkFrames = ['walk1', 'walk2', 'walk3', 'walk4'];
                this.currentFrameKey = walkFrames[this.animIndex];
            }
        } else if (this.state === 'IDLE') {
            this.y = floorY;
            this.currentFrameKey = 'idle';
        } else if (this.state === 'BATTLE') {
            this.y = floorY;
            this.currentFrameKey = 'battle';
        } else if (this.state === 'SIT') {
            this.y = floorY;
            this.currentFrameKey = 'sit';
        }

        this.updateStyle();
        this.draw();
    }

    draw() {
        const img = this.images[this.currentFrameKey] || this.images.idle;
        if (!img || !img.complete || !img.naturalWidth) return;

        this.ctx.clearRect(0, 0, 128, 128);
        this.ctx.save();
        
        if (this.facing === -1) {
            // SOLA DÖNME / YÜRÜME (Flip X)
            this.ctx.translate(128, 0);
            this.ctx.scale(-1, 1);
        }
        
        this.ctx.imageSmoothingEnabled = false;
        this.ctx.drawImage(img, 0, 0, 128, 128);
        this.ctx.restore();
    }

    updateStyle() {
        const scale = this.manager.shimejiSettings.scale || 0.9;
        const w = 128 * scale;
        const h = 128 * scale;
        this.element.style.width = w + 'px';
        this.element.style.height = h + 'px';
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.element.style.transform = 'translate3d(' + Math.round(this.x) + 'px, ' + Math.round(this.y) + 'px, 0)';
    }

    release(throwVx, throwVy) {
        this.isDragged = false;
        this.element.classList.remove('dragging');
        this.state = 'FALLING';
        this.vx = Math.max(-25, Math.min(25, throwVx || 0));
        this.vy = Math.max(-25, Math.min(25, throwVy || 0));
    }
}
