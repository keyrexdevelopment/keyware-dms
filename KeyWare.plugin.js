/**
 * @name KeyWare
 * @author keyrex
 * @version 5.9.0
 * @description Direkt mesajları kategorilere ayırın, sürükle-bırak ile organize edin. Kişilere özel MP3 ve Soundboard bildirim sesi, okunmamış mesaj sayacı, özel yazı tipi ve partikül yağmuru içerir.
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

        this.handleClick = this.handleClick.bind(this);
        this.handleContextMenu = this.handleContextMenu.bind(this);
        this.handleDragStart = this.handleDragStart.bind(this);
        this.handleDragOver = this.handleDragOver.bind(this);
        this.handleDragLeave = this.handleDragLeave.bind(this);
        this.handleDrop = this.handleDrop.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);
        this.onMessageCreate = this.onMessageCreate.bind(this);
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
    }

    saveSettings() {
        BdApi.Data.save(this.pluginName, "categories", this.categories);
        BdApi.Data.save(this.pluginName, "customSounds", this.customSounds);
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

    attachGlobalEvents() {
        document.addEventListener('click', this.handleClick, true);
        document.addEventListener('contextmenu', this.handleContextMenu, true);
        document.addEventListener('dragstart', this.handleDragStart);
        document.addEventListener('dragover', this.handleDragOver);
        document.addEventListener('dragleave', this.handleDragLeave);
        document.addEventListener('drop', this.handleDrop);
        document.addEventListener('dragend', this.handleDragEnd);
    }

    detachGlobalEvents() {
        document.removeEventListener('click', this.handleClick, true);
        document.removeEventListener('contextmenu', this.handleContextMenu, true);
        document.removeEventListener('dragstart', this.handleDragStart);
        document.removeEventListener('dragover', this.handleDragOver);
        document.removeEventListener('dragleave', this.handleDragLeave);
        document.removeEventListener('drop', this.handleDrop);
        document.removeEventListener('dragend', this.handleDragEnd);
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
        if (document.querySelector('.dm-cat-add-btn')) return;

        const header = document.querySelector('[class*="privateChannelsHeaderContainer"], h2[class*="privateChannelsHeader"], [class*="privateChannels"] header, [class*="privateChannels"] [role="heading"]');
        if (!header) return;

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

        const existingActions = header.querySelector('[class*="buttons"], [class*="actions"]') || header.querySelector('div[class*="clickable"]')?.parentElement;
        if (existingActions) {
            existingActions.appendChild(btn);
        } else {
            header.style.display = 'flex';
            header.style.alignItems = 'center';
            header.appendChild(btn);
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

    checkChangelog() {
        const currentVersion = "5.9.0";
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
                            <div style="font-size: 12px; color: var(--brand-500, #5865f2); font-weight: 600;">Sürüm v5.9.0</div>
                        </div>
                    </div>
                </div>
                <div class="dm-cat-modal-body" style="padding: 20px; gap: 16px;">
                    <div style="font-size: 13px; color: var(--text-normal, #dbdee1); line-height: 1.5;">
                        KeyWare Direkt Mesajlar eklentisi yeni özelliklerle güncellendi. İşte bu sürümdeki yenilikler:
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 10px; background: var(--background-secondary, #2b2d31); padding: 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.06);">
                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <span style="font-size: 18px; line-height: 1;">🔊</span>
                            <div>
                                <div style="font-size: 13px; font-weight: 600; color: #fff;">Discord Sunucu Soundboard Desteği</div>
                                <div style="font-size: 12px; color: var(--text-muted, #949ba4);">Artık üye olduğunuz tüm sunuculardaki ses tahtası (Soundboard) seslerini kişiye özel bildirim sesi olarak atayabilirsiniz.</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <span style="font-size: 18px; line-height: 1;">🔍</span>
                            <div>
                                <div style="font-size: 13px; font-weight: 600; color: #fff;">Canlı Arama & Anında Önizleme</div>
                                <div style="font-size: 12px; color: var(--text-muted, #949ba4);">Yüzlerce ses arasından ses adı veya sunucu adı ile arama yapabilir, kaydetmeden önce tek tıkla dinleyebilirsiniz.</div>
                            </div>
                        </div>
                        <div style="display: flex; gap: 10px; align-items: flex-start;">
                            <span style="font-size: 18px; line-height: 1;">📁</span>
                            <div>
                                <div style="font-size: 13px; font-weight: 600; color: #fff;">Yenilenmiş Sekmeli Arayüz</div>
                                <div style="font-size: 12px; color: var(--text-muted, #949ba4);">Hem Soundboard hem de özel MP3 / yerel ses dosyası desteği tek ve şık bir pencerede toplandı.</div>
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

    escapeHtml(str) {
        return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
};
