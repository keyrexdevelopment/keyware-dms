<p align="center">
  <img src="assets/banner.png" alt="KeyWare Banner" width="100%" />
</p>

<p align="center">
  <a href="https://betterdiscord.app/"><img src="https://img.shields.io/badge/Platform-BetterDiscord-5865F2?style=flat-square&logo=discord&logoColor=white" alt="BetterDiscord" /></a>
  <img src="https://img.shields.io/badge/Version-10.2.0-00d2d3?style=flat-square" alt="Version" />
  <img src="https://img.shields.io/badge/License-MIT-4cd137?style=flat-square" alt="License" />
  <img src="https://img.shields.io/badge/Made%20in-T%C3%BCrkiye-e84118?style=flat-square" alt="Türkiye" />
</p>

<h1 align="center">KeyWare DMs</h1>

<p align="center">
  <b>KeyWare</b>, Discord Direkt Mesajlarınızı (DM) kategorilere ayıran, kişiye özel bildirim sesleri sunan, 15 farklı evrenden <b>30 interaktif Shimeji maskotu</b> ve <b>LinkShield</b> anti-phishing kalkanı içeren modern bir BetterDiscord eklentisidir.
</p>

<p align="center">
  <a href="#-özellikler">Özellikler</a> •
  <a href="#-kurulum">Kurulum</a> •
  <a href="#-sıkça-sorulan-sorular">SSS</a> •
  <a href="#-lisans">Lisans</a>
</p>

---

### ✨ Özellikler

- 📁 **DM Kategorileri & Organizasyon:** Direkt mesajlarınızı klasörlere ayırın, daraltın ve React yapısını bozmadan sürükleyip bırakarak düzenleyin.
- 🐾 **30+ Shimeji Maskotu:** DMC, Hazbin Hotel, Undertale, Marvel, LoL ve Genshin gibi 15 evrenden masaüstü maskotları. Gerçekçi momentum fırlatma fiziği ve özel imza animasyonları.
- 🎵 **Kişiye Özel Bildirim Sesleri:** Belirli kişilere veya gruplara sunucu Soundboard'larından ya da yerel `.mp3` dosyalarından özel zil sesleri atayın.
- 🎨 **Shader & Temalar:** Frosted Glass, Cyberpunk Neon gibi 5 donanım hızlandırmalı görsel efekt ve özel Google yazı tipleri.
- 🛡️ **LinkShield Güvenlik Kalkanı:** Sahte Nitro, sahte Steam ve IP toplayıcı tuzak bağlantıları tıklandığı an engelleyen güvenlik sistemi.
- 🤖 **Akıllı Otomatik Yanıtlayıcı:** O an oynadığınız oyunu `{game}` değişkeni ile algılayan ve spam korumalı yanıt veren akıllı durum motoru.

---

### 🚀 Kurulum

#### ⚡ Hızlı Kurulum (PowerShell)
PowerShell terminalini açıp aşağıdaki komutu çalıştırın:
```powershell
iwr "https://raw.githubusercontent.com/keyrexdevelopment/keyware-dms/main/KeyWare.plugin.js" -OutFile "$env:APPDATA\BetterDiscord\plugins\KeyWare.plugin.js"
```

#### 🛠️ Manuel Kurulum
1. [**KeyWare.plugin.js**](https://raw.githubusercontent.com/keyrexdevelopment/keyware-dms/main/KeyWare.plugin.js) dosyasını indirin.
2. Dosyayı BetterDiscord eklenti dizinine taşıyın:
   ```text
   %appdata%\BetterDiscord\plugins
   ```
3. Discord'u açıp **Kullanıcı Ayarları > Eklentiler (Plugins)** sekmesinden **KeyWare**'i aktif edin.

---

### ❓ Sıkça Sorulan Sorular

<details>
<summary><b>Ban riski var mı?</b></summary>
<br>
Hayır. KeyWare tamamen istemci tarafında (client-side) çalışır. Discord API limitlerini aşmaz, token bilgilerinize erişmez ve sunuculara harici istek göndermez.
</details>

<details>
<summary><b>Performansı veya oyun içi FPS'i etkiler mi?</b></summary>
<br>
Hayır. Maskot ve efekt animasyonları doğrudan GPU donanım hızlandırmasıyla (<code>translate3d</code>) izole çalışır. Boştayken CPU tüketimi %0'dır.
</details>

<details>
<summary><b>Maskotları nasıl kontrol ederim?</b></summary>
<br>
Maskotları farenizle tutup savurarak fırlatabilir, üzerlerine sağ tıklayarak hız, boyut, ışıma rengi ve karakter seçim menüsüne ulaşabilirsiniz.
</details>

---

### 📜 Lisans & Geliştirici

Bu proje **MIT** lisansı ile korunmaktadır.

- **Geliştirici:** [keyrex](https://github.com/keyrexdevelopment)
- **Depo:** [keyware-dms](https://github.com/keyrexdevelopment/keyware-dms)

<p align="center">
  <sub>KeyWare DMS • Made with ❤️ in Türkiye</sub>
</p>
