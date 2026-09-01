<p align="center">
  <img src="assets/banner.png" alt="KeyWare DMs Banner" width="100%" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/MOTOR-BETTERDISCORD-5865F2?style=for-the-badge&logo=discord&logoColor=white" alt="Motor" />
  <img src="https://img.shields.io/badge/S%C3%9CR%C3%9CM-v7.7.0-00d2d3?style=for-the-badge" alt="Sürüm" />
  <img src="https://img.shields.io/badge/MEN%C5%9EE%C4%B0-T%C3%9CRK%C4%B0YE%20%F0%9F%87%B9%F0%9F%87%B7-e84118?style=for-the-badge" alt="Türkiye" />
  <img src="https://img.shields.io/badge/MASKOTLAR-20%20KARAKTER%20%E2%80%A2%2010%20EVREN-fbc531?style=for-the-badge" alt="Karakterler" />
  <img src="https://img.shields.io/badge/L%C4%B0SANS-MIT-4cd137?style=for-the-badge" alt="Lisans" />
</p>

<h2 align="center">
  🇹🇷 A Wonderful Plugin Made in Türkiye 🇹🇷<br>
  <sub>Türkiye'de Geliştirilen Gelişmiş BetterDiscord Direkt Mesaj & Masaüstü Maskot Ekosistemi</sub>
</h2>

<p align="center">
  <b>KeyWare</b>, Discord Direkt Mesajlarınızı (DM) kurumsal seviyede organize eden, kişilere özel bildirim sesleri ve Soundboard atayan, 10 farklı popüler evrenden <b>20 etkileşimli Shimeji masaüstü maskotu</b> barındıran, LinkShield anti-oltalama kalkanı ve akıllı otomatik yanıtlayıcı sunan kapsamlı bir BetterDiscord eklentisidir.
</p>

<p align="center">
  <a href="#-genel-bakış">Genel Bakış</a> •
  <a href="#-temel-modüller">Temel Modüller</a> •
  <a href="#-shimeji-maskot-kadrosu-20-karakter--10-evren">Maskot Kadrosu (20 Karakter)</a> •
  <a href="#-kurulum-rehberi">Kurulum</a> •
  <a href="#-sıkça-sorulan-sorular-sss">Sıkça Sorulan Sorular (SSS)</a> •
  <a href="#-teknik-özellikler">Teknik Özellikler</a> •
  <a href="#-lisans">Lisans</a>
</p>

---

### 🌟 Genel Bakış

Standart Discord arayüzü yüzlerce özel mesaj arasında aradığınızı bulmayı zorlaştırır. **KeyWare**, React bileşen yapısını bozmadan ve Discord'un sanal liste motoruna zarar vermeden DM listenizi kategorilere ayırır.

Bununla da kalmayıp masaüstünüzde dolaşan, farenizi takip eden, fırlatılabilen ve orijinal imza animasyonlarını sergileyen **20 adet Shimeji masaüstü maskotunu** Discord içine entegre eder.

> [!TIP]
> **Sıfır Performans Kaybı:** KeyWare'in animasyon ve render motoru GPU donanım hızlandırmalıdır. Mesajlaşırken veya oyun oynarken CPU kullanımını %0 düzeyinde tutar, FPS düşüşü veya takılma yaşatmaz.

---

### 🚀 Temel Modüller

```
  +-------------------------------------------------------------------------------+
  |                             KEYWARE MODÜLER MİMARİ                            |
  +-------------------------------------------------------------------------------+
  | [01] DM Kategorilendirme  -> Non-destructive CSS Flexbox Order Sıralama       |
  | [02] Özel Bildirim Sesi   -> Dispatcher Düzeyinde Müdahale & Soundboard Entegre|
  | [03] Shimeji Maskotları   -> 20 Karakter, 10 Evren, Momentum Fırlatma Fiziği  |
  | [04] Görsel Shader & Yağmur-> 5 Donanım Hızlandırmalı Shader + Emoji Yağmuru  |
  | [05] Tipografi & Fontlar  -> Sistem Fontları + 7 Google Web Font Paketi       |
  | [06] LinkShield Güvenlik  -> Sahte Nitro, Steam ve IP Grabber URL Engelleyici |
  | [07] Otomatik Yanıtlayıcı -> {game} Değişkenli Akıllı Durum Yanıt Motoru       |
  +-------------------------------------------------------------------------------+
```

#### `[01]` 📁 Direkt Mesaj Kategorilendirme & Düzenleme Motoru
- **React-Safe Sıralama:** Kanalları silip yeniden oluşturmak yerine saf CSS Flexbox `order` indeksiyle sıralar. Discord'un sürükle-bırak, arama ve bileşen durumlarını %100 korur.
- **Ağaç Yapısı & Daraltma:** Kategorileri tek tıkla açıp kapatın; okunmamış mesaj sayıları, etiketler ve ses durumu rozetleri görünmeye devam eder.
- **Hızlı Sağ Tık Yönetimi:** Kategori başlıklarına sağ tıklayarak anında yeniden adlandırın, renk/shader paletini değiştirin veya silin.

#### `[02]` 🎵 Kişiye & Gruba Özel Bildirim Sesleri ve Soundboard Entegrasyonu
- **Önleyici Ses Engelleme:** Discord'un standart `message1.mp3` bildirim sesi `Dispatcher.dispatch` aşamasında yakalanarak susturulur; yalnızca belirlediğiniz özel ses çalar (çift ses çalma bug'ı yaşanmaz).
- **Sunucu Soundboard Entegrasyonu:** Bulunduğunuz tüm sunuculardaki Soundboard seslerini arayın, canlı dinleyin ve doğrudan kişilere özel bildirim sesi olarak atayın.
- **Yerel Dosya ve Link Desteği:** Bilgisayarınızdaki `.mp3` dosyalarını Base64 kodlamasıyla güvenle bağlayın veya doğrudan ses URL'si girin.

#### `[03]` 🐾 Shimeji Masaüstü Maskotları Motoru (20 Karakter • 10 Evren)
- **Akıllı Ölçekleme & Canlı Render:** 512px yüksek çözünürlüklü HD ve piksel çizimli sprite'lar kafaları/kuyrukları kesilmeden orantılı olarak ekrana çizilir.
- **Momentum & Yerçekimi Fırlatma Fiziği:** Karakteri fareyle tutup havaya fırlattığınızda sürükleme hızınızı algılar; yerçekimiyle parabolik kavis çizer, ekran kenarlarından seker ve zemine iner.
- **Doğrudan Fareye Göre Yönlenme:** Fareyi sağa çekince sağa, sola çekince sola bakar. Havadayken ve taşınırken yönünü bozmaz.
- **Özelleştirilebilir RGB Aura Işığı:** Karakterin etrafındaki ışıma (glow) efektini menüdeki hazır renklerden seçebilir veya özel RGB renk paletinden dilediğiniz tonda ayarlayabilirsiniz.
- **Karaktere Özel İmza Hareketleri:** Her karakterin orijinal serisine ait animasyonları (Alastor radyosu, Vox elektriği, Husk şemsiyesi ve içkisi, Lucifer lastik ördeği, Adam altın gitarı vb.) ayaktayken otomatik sergilenir.

#### `[04]` 🎨 Görsel Shader'lar, Atmosfer & Partikül Yağmuru
- **5 Özel Donanım Hızlandırmalı Shader:**
  - `Frosted Glass` (Buzlu Cam - Arkadaki içeriği kıran modern cam morfizim)
  - `Cyberpunk Neon` (Canlı mor & eflatun yüksek kontrastlı neon geçiş)
  - `Thermal Fire` (Ateşli akkor kızıl & turuncu alev gradyanı)
  - `Emerald Breeze` (Zümrüt yeşili ferah nane tonu)
  - `Gilded Gold` (Altın metalik pirinç ışıltısı)
- **Partikül Yağmuru:** DM listenizin arkasında dilediğiniz Discord emojisi veya görseliyle partikül yağdırma efekti.

#### `[05]` 🔤 Tipografi & Özel Yazı Tipleri
- **Sistem Fontları Desteği:** Bilgisayarınızda yüklü olan herhangi bir fontun adını yazarak kategorilerde kullanın.
- **Hazır Google Web Fontları:** *Orbitron, Poppins, Montserrat, Cinzel, Righteous, Permanent Marker ve Press Start 2P*.

#### `[06]` 🛡️ LinkShield Anti-Phishing Güvenlik Kalkanı
- **Anlık Zararlı URL Tespiti:** Yazım hatasıyla taklit edilen sahte Discord/Nitro linklerini (`dlscord.com`, `discorcl.gift`), sahte Steam sitelerini (`steamcommunlty.com`) ve IP grabber tuzaklarını (`grabify.link`, `iplogger.org`) tıklandığı anda yakalar.
- **Güvenlik Uyarı Paneli:** Tarayıcının açılmasını engelleyerek token çalınmasını ve hesap güvenliği ihlallerini önler.

#### `[07]` 🤖 Akıllı Otomatik Yanıtlayıcı (Smart Auto-Responder)
- **Oyun/Etkinlik Tespiti:** Discord `ActivityStore` üzerinden o an oynadığınız oyunu otomatik yakalar ve `{game}` değişkeniyle mesaj atan kişiye bildirir.
- **Spam Koruması & Cooldown:** Aynı kişiye sürekli mesaj gitmesini önleyen ayarlanabilir bekleme süresi (1–120 dakika) ve DND/Idle durum filtreleri.

---

### 🎭 Shimeji Maskot Kadrosu (20 Karakter • 10 Evren)

KeyWare, masaüstünüzü canlandıran 10 farklı popüler evrenden 20 adet özel karaktere sahiptir:

| Evren | Maskot | Etiket | Rol / Ünvan | Özel İmza Hareketi & Animasyon |
| :--- | :--- | :--- | :--- | :--- |
| **Devil May Cry** `[Capcom]` | **Dante** | `DMC` | İblis Avcısı | Çift Tabanca Duruşu, Kılıç Çevikliği, Orijinal Havada Düşüş |
| **Hazbin Hotel** `[A24 / SpindleHorse]` | **Alastor** | `RADIO` | Radyo İblisi | Radyo Mikrofon Yayını, Gölge Dokunaçları, Baston Döndürme |
| | **Vox** | `TV` | Medya Derebeyi | Reklam Kartı Gösterimi, TV Elektrik Glitch'i, CRT Statik Titreme |
| | **Husk** | `CASINO` | Kumarbaz Kedi | Şemsiye Açma (`shime42-46`), Alkol İçme & Yanak Kızarması (`shime26->28->29->blush`), Kart Dağıtma |
| | **Angel Dust** | `STAR` | Örümcek Yıldız | Cilveli Poz, Tommy Gun Taraması, İkonik Gülümseme |
| | **Lucifer Morningstar** | `KING` | Cehennem Kralı | Sarı Lastik Ördek Çıkarma, Altın Elma Gösterisi, Şapka Selamı |
| | **Adam** | `GENERAL` | Baş Melek Lideri | Altın Elektro Gitar Solosu, İlahi Altın Işık, Ukala Kahkaha |
| | **Vaggie** | `SPEAR` | Muhafız Melek | Mızrak Saldırısı Duruşu, Savaş Pozisyonu, Devriye Yürüyüşü |
| | **Valentino** | `LUST` | Şehvet Derebeyi | Puro Dumanı Bulutu, Kalpli Güneş Gözlükleri, Derebeyi Gülüşü |
| | **Velvette** | `FASHION` | Moda Derebeyi | Telefonla Selfie Pozu, Podyum Yürüyüşü, Saç Savurma |
| **The Amazing Digital Circus** `[GLITCH]` | **Kinger** | `CHESS` | Paranoyak Şah | Aşılmaz Kale Paranoyası, Kelebek Odaklanması, Çığlık Atarak Donma |
| **Freaky Circus** `[Freaky Circus]` | **Pierrot** | `JESTER` | Kaotik Palyaço | Panik İçinde Labut Çevirme, 360 Derece Hızlı Dönüş, Şaşkın Bakış |
| **My Little Pony & Pibby** `[Hasbro]` | **Fluttershy** | `MLP` | Nezaket Pegasusu | 6 Kare Akıcı Tırıs Yürüyüşü, Sakin Çayır Bakışı, Sevimli Oturuş |
| | **Rainbow Dash** | `SONIC` | Süpersonik Pegasus | Sonic Rainboom Uçuş Hızı, Kanat Çırpma, Havalı Pegasus Selamı |
| | **Twilight Sparkle** | `PIBBY` | Pibby Virüsü | Glitch Bozulma Yürüyüşü, Hiçlik Paraziti, Boyutsal Titreme |
| **Marvel Universe** `[Marvel]` | **Spider-Man** | `SPIDER` | Mahallenin Dostu | Ağ Atma & Sallanma, Duvar Tutunması, Alçak Örümcek Çömelmesi |
| **Five Nights at Freddy's** `[ScottGames]` | **Foxy** | `FNAF` | Korsan Tilki | Korsan Kancası Sallama, Koridor Pusu Pozu, Göz Bandı Düzeltme |
| **League of Legends** `[Riot Games]` | **Sett** | `THE BOSS` | Yeraltı Patronu | Showstopper Parmak Çıtlatma, Pazu Sıkma & Güç Gösterisi, Patron Dinlenmesi |
| **Cookie Run Kingdom** `[Devsisters]` | **Shadow Milk** | `BEAST` | Hilebaz Bisküvi | Kukla İpleri Tiyatrosu, Mavi Alev Çevirme, Hilebazlık Dansı |
| **Deltarune & Undertale** `[Toby Fox]` | **Tenna** | `TV SHOW` | CRT Yarışma Sunucusu | CRT Televizyon Paraziti, Anten Yayını Titremesi, Yarışma Sunucu Pozu |

---

### ❓ Sıkça Sorulan Sorular (SSS)

<details>
<summary><b>1. Bu eklentiyi kullanmak Discord'da ban riski taşır mı?</b></summary>
<br>
Hayır. KeyWare tamamen istemci tarafında (client-side) çalışır. Discord sunucularına herhangi bir yetkisiz istek göndermez, kullanıcı token'ınıza erişmez ve Discord API limitlerini aşmaz. Yalnızca yerel arayüzünüzü güzelleştirir.
</details>

<details>
<summary><b>2. Shimeji maskotları oyun oynarken veya sohbet ederken kasma yapar mı?</b></summary>
<br>
Kesinlikle yapmaz. KeyWare'in Shimeji motoru doğrudan GPU katmanında <code>translate3d</code> ve katı CSS containment (<code>contain: strict</code>) ile çalışır. Ayrıca mesaj yazışmaları ve chat akışı Shimeji motorundan tamamen izole edilmiştir. Bilgisayarınız boştayken CPU kullanımı %0.0'dır.
</details>

<details>
<summary><b>3. Maskotları fareyle nasıl kontrol ederim?</b></summary>
<br>
Karakterin üzerine farenin sol tuşuyla tıklayıp tutarak ekranın istediğiniz yerine taşıyabilir, farenizi hızlıca savurup bıraktığınızda ise gerçekçi momentum fiziğiyle karakteri havada fırlatabilirsiniz. Karakterler yerçekimiyle ekran kenarlarından sekip zemine güvenle iner.
</details>

<details>
<summary><b>4. Karakter ve ses ayarlarını nereden değiştirebilirim?</b></summary>
<br>
Discord DM listenizin en üstündeki başlık çubuğunda <b>Shimeji Maskot Butonu</b> ve <b>Kategori Ekle Butonu</b> yer alır. Buradan veya karakterin üzerine sağ tıklayarak açılan menüden maskotunuzu, hızını, boyutunu, takip modunu ve ışıma rengini tek tıkla değiştirebilirsiniz.
</details>

<details>
<summary><b>5. Güncellemeleri nasıl alırım?</b></summary>
<br>
KeyWare, BetterDiscord'un otomatik güncelleme sistemine entegredir. GitHub'a yeni bir sürüm yüklendiğinde Discord içerisinde üstte otomatik olarak güncelleme bildirimi çıkar ve tek tıkla güncellenir.
</details>

---

### 📥 Kurulum Rehberi

#### ⚡ Otomatik Kurulum (Windows PowerShell - Tek Komut)
PowerShell'i açıp aşağıdaki komutu yapıştırmanız yeterlidir:
```powershell
iwr "https://raw.githubusercontent.com/keyrexdevelopment/keyware-dms/main/KeyWare.plugin.js" -OutFile "$env:APPDATA\BetterDiscord\plugins\KeyWare.plugin.js"
```

#### 🛠️ Manuel Kurulum
1. Bilgisayarınızda **[BetterDiscord](https://betterdiscord.app/)** kurulu olduğundan emin olun.
2. [`KeyWare.plugin.js`](https://raw.githubusercontent.com/keyrexdevelopment/keyware-dms/main/KeyWare.plugin.js) dosyasını indirin.
3. İndirdiğiniz dosyayı BetterDiscord eklentiler klasörüne taşıyın:
   ```
   %appdata%\BetterDiscord\plugins
   ```
4. Discord'u açın, **Kullanıcı Ayarları > Eklentiler (Plugins)** sekmesine gidin ve **KeyWare**'i aktif edin.

---

### ⚙️ Teknik Özellikler

```
  +-------------------------------------------------------------------+
  |                       KEYWARE TEKNİK MİMARİ                       |
  +-------------------------------------------------------------------+
  |  [DOM Entegrasyonu]      -> nav[aria-label="Direkt Mesajlar"]     |
  |  [Ses Müdahalesi]        -> Dispatcher.dispatch (Pre-Dispatch)   |
  |  [Fizik Motoru]          -> requestAnimationFrame (Delta-Timed)   |
  |  [Fizik Modu]            -> Momentum Fırlatma + Kenar Sekmesi     |
  |  [Veri Depolama]         -> BdApi.Data (İzole JSON Yapılandırma)  |
  |  [Bellek Ayak İzi]       -> < 2.5 MB (Sıfır Bellek Sızıntısı)     |
  |  [Boşta CPU Tüketimi]    -> %0.0 (Önbellekli Dirty-Checking)      |
  |  [GPU Hızlandırma]       -> Hardware Translate3D + Strict Contain |
  +-------------------------------------------------------------------+
```

---

### 📜 Lisans & Geliştirici

Bu proje **MIT Lisansı** altında korunmaktadır.

- **Geliştirici:** `keyrex` (Keyrex Development)
- **Menşei:** Türkiye 🇹🇷
- **Kaynak Kodu:** [GitHub - keyrexdevelopment/keyware-dms](https://github.com/keyrexdevelopment/keyware-dms)

<p align="center">
  <sub>KeyWare DMS © 2026 • Made with ❤️ in Türkiye</sub>
</p>
