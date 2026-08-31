const fs = require('fs');
const path = require('path');

let content = fs.readFileSync('KeyWare.plugin.js', 'utf8');

// 1. Version bump to 6.6.0
content = content.replace(/@version\s+[0-9.]+/g, '@version 6.6.0');
content = content.replace(/const currentVersion = "[0-9.]+";/g, 'const currentVersion = "6.6.0";');
content = content.replace(/Sürüm v[0-9.]+/g, 'Sürüm v6.6.0');

// 2. Replace checkForUpdates with cache-busting direct GitHub Commit API
const oldUpdateStart = 'async checkForUpdates(manual = false) {';
const uIdx = content.indexOf(oldUpdateStart);
const checkChangelogIdx = content.indexOf('checkChangelog() {');

if (uIdx !== -1 && checkChangelogIdx !== -1) {
    const newCheckForUpdates = `showToast(msg, type = "info") {
        if (BdApi.UI && typeof BdApi.UI.showToast === 'function') {
            BdApi.UI.showToast(msg, { type });
        } else if (typeof BdApi.showToast === 'function') {
            BdApi.showToast(msg, { type });
        }
    }

    async checkForUpdates(manual = false) {
        try {
            const currentVersion = "6.6.0";
            let remoteVersion = null;
            let remoteContent = null;

            // 1. GitHub API ile son commit SHA'sını al (Fastly/Raw CDN önbelleğini 0 saniyede deler)
            try {
                const apiRes = await fetch("https://api.github.com/repos/keyrexdevelopment/keyware-dms/commits/main", {
                    headers: { 'User-Agent': 'KeyWare-BetterDiscord' }
                });
                if (apiRes.ok) {
                    const apiData = await apiRes.json();
                    if (apiData && apiData.sha) {
                        const directUrl = \`https://raw.githubusercontent.com/keyrexdevelopment/keyware-dms/\${apiData.sha}/KeyWare.plugin.js\`;
                        const rawRes = await fetch(directUrl);
                        if (rawRes.ok) {
                            remoteContent = await rawRes.text();
                            const match = remoteContent.match(/@version\\s+([0-9.]+)/i);
                            if (match && match[1]) remoteVersion = match[1];
                        }
                    }
                }
            } catch (e) {
                console.warn("[KeyWare] GitHub API check fallback:", e);
            }

            // 2. Eğer API ulaşılamazsa standart URL'e dön
            if (!remoteVersion || !remoteContent) {
                const updateUrl = "https://raw.githubusercontent.com/keyrexdevelopment/keyware-dms/main/KeyWare.plugin.js";
                const response = await fetch(\`\${updateUrl}?_t=\${Date.now()}\`);
                if (response.ok) {
                    remoteContent = await response.text();
                    const match = remoteContent.match(/@version\\s+([0-9.]+)/i);
                    if (match && match[1]) remoteVersion = match[1];
                }
            }

            if (!remoteVersion || !remoteContent) {
                if (manual) {
                    this.showToast("Güncelleme sunucusuna ulaşılamadı.", "error");
                }
                return;
            }

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
                console.log(\`[KeyWare] New update available: v\${remoteVersion} (current: v\${currentVersion})\`);

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

                        this.showToast(\`KeyWare v\${remoteVersion} başarıyla güncellendi!\`, "success");
                    } catch (err) {
                        console.error("[KeyWare] Update write error:", err);
                        this.showToast("KeyWare güncellenirken bir hata oluştu.", "error");
                    }
                };

                if (BdApi.UI && typeof BdApi.UI.showNotice === 'function') {
                    BdApi.UI.showNotice(
                        \`KeyWare için yeni bir güncelleme mevcut (v\${remoteVersion})!\`,
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
                } else if (typeof BdApi.showNotice === 'function') {
                    BdApi.showNotice(
                        \`KeyWare için yeni bir güncelleme mevcut (v\${remoteVersion})!\`,
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
                } else if (BdApi.UI && typeof BdApi.UI.showConfirmationModal === 'function') {
                    BdApi.UI.showConfirmationModal(
                        "KeyWare Güncellemesi Mevcut",
                        \`KeyWare için yeni bir sürüm yayınlandı (v\${remoteVersion}). Şimdi otomatik olarak güncellemek ister misiniz?\`,
                        {
                            confirmText: "Şimdi Güncelle",
                            cancelText: "Daha Sonra",
                            onConfirm: updatePlugin
                        }
                    );
                }
            } else if (manual) {
                this.showToast(\`KeyWare zaten güncel (v\${currentVersion})\`, "info");
            }
        } catch (e) {
            console.warn("[KeyWare] Update check failed:", e);
        }
    }

    `;
    content = content.substring(0, uIdx) + newCheckForUpdates + content.substring(checkChangelogIdx);
}

fs.writeFileSync('KeyWare.plugin.js', content, 'utf8');

// Update README
let readme = fs.readFileSync('README.md', 'utf8');
readme = readme.replace(/VERSION-[0-9.]+/g, 'VERSION-6.6.0');
fs.writeFileSync('README.md', readme, 'utf8');

console.log('Successfully applied instant cache-busting updater! (v6.6.0)');
