# KeyWare - BetterDiscord Suite & Shimeji Studio

<div align="center">

![KeyWare Banner](https://img.shields.io/badge/KeyWare-BetterDiscord_Plugin-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![Version](https://img.shields.io/badge/Surum-2.4.0-2ed573?style=for-the-badge)
![Characters](https://img.shields.io/badge/Maskotlar-31_Karakter-ff4757?style=for-the-badge)
![Universes](https://img.shields.io/badge/Evrenler-17_Farkli_Evren-ffa502?style=for-the-badge)

**Discord deneyimini zenginlestiren interaktif masaustu maskotlari (Shimeji), otomatik yanitlayici ve gelismis kategori yoneticisi.**

</div>

---

## Icindekiler
- [Genel Bakis](#genel-bakis)
- [Shimeji Maskot Sistemi ve Fizik Motoru](#shimeji-maskot-sistemi-ve-fizik-motoru)
- [Karakter ve Evren Rehberi (17 Evren & 31 Karakter)](#karakter-ve-evren-rehberi-17-evren--31-karakter)
- [Otomatik Yanitlayici (AutoResponder)](#otomatik-yanitlayici-autoresponder)
- [Kategori ve Sablon Yoneticisi](#kategori-ve-sablon-yoneticisi)
- [Kontroller ve Kisayollar](#kontroller-ve-kisayollar)
- [Kurulum ve Yenileme](#kurulum-ve-yenileme)

---

## Genel Bakis

**KeyWare**, BetterDiscord icin gelistirilmis hepsi bir arada bir yardimci eklentidir. Discord temasiyla (`#313338`, `#2b2d31`, `#1e1f22`) tam uyumlu modern ve sade arayuzu sayesinde Discord'un icerisinden cikmadan hem masaustu maskotlarinizi yonetebilir hem de otomatik yanitlayici ve mesaj sablonlarinizi kontrol edebilirsiniz.

---

## Shimeji Maskot Sistemi ve Fizik Motoru

KeyWare, 60 FPS Canvas render motoru ve fizik sistemiyle calisir:

- **Surukle, Birak ve Firlat (Velocity Physics):** Maskotu farenizle tutup havaya firlatabilirsiniz. Hiz vektorleri ve yercekimi ivmesi sayesinde dogal bir sekilde suzulur ve zemine iner.
- **3 Farkli Davranis Modu:**
  - **Serbest Gezinme (Roam):** Ekranin alt zemininde rastgele yurur, durur, oturur ve ozel hareketlerini sergiler.
  - **Fare Takibi (Follow):** Imlecinizin pesinden kosar ve yaniniza geldiginde durup size bakar.
  - **Oturma ve Dinlenme (Sit):** Oldugu yerde oturup dinlenir ve ara sira etrafi gozler.
- **Hologram On Izleme Studyosu:** Maskot secim menusunde karakterlerin Yurume, Durma (Idle), Oturma ve Dusme animasyonlarini canli olarak test edebilirsiniz.
- **Anlik Arama ve Filtreleme:** Evren butonlari veya arama cubuguyla 31 karakter arasindan aninda arama yapabilirsiniz.
- **Hizli Sag Tik Menusu:** Maskota sag tiklayarak mod, boyut, yercekimi ve hiz ayarlarini aninda degistirebilirsiniz.

---

## Karakter ve Evren Rehberi (17 Evren & 31 Karakter)

KeyWare bunyesinde toplam **17 farkli evrenden 31 ozel karakter** barindirir. Her karakterin kendine ait idle, yurume, oturma, suruklenme, dusme ve ozel animasyonlari bulunur:

### 1. Devil May Cry Evreni
- **Dante (`dante`)** - *DEVIL HUNTER*: Iblis avcisi Dante. Ozel kilic vuruslari, havali duruslar ve klasik taunt hareketleri sergiler.

### 2. Hazbin Hotel Evreni
- **Alastor (`alastor`)** - *RADIO DEMON*: Cehennemin radyo iblisi. Golgelerden dokunaclar cikarir (`SHADOW_TENTACLES`), bastonunu cevirir (`SPIN_CANE`) ve radyo paraziti yayar (`RADIO_BROADCAST`).
- **Vox (`vox`)** - *MEDIA OVERLORD*: Medya lordu televizyon iblisi. Ekranda katot isini parazitlenmesi (`ELECTRIC_GLITCH`), kafa dondurme (`SPIN_HEAD`) ve kart gosterme hareketleri yapar.
- **Husk (`husk`)** - *CASINO CAT*: Kumarbaz kanatli kedi. Barda ickisini yudumlar (`BAR_DRINK`), semsiyesini acar (`OPEN_UMBRELLA`) ve iskambil destesini karistirir (`CARD_SHUFFLE`).
- **Angel Dust (`angeldust`)** - *SPIDER STAR*: Cift Tommy Gun taramasi (`TOMMY_GUN`), flortoz pozlar (`FLIRTY_POSE`) ve goz kirpma (`WINK_BLUSH`).
- **Lucifer (`lucifer`)** - *KING OF HELL*: Lastik ordekleriyle oynar (`RUBBER_DUCK`), altin elmasini parlatir (`GOLDEN_APPLE`) ve silindir sapkasini duzeltir (`TOP_HAT`).
- **Adam (`adam`)** - *EXORCIST LEADER*: Elektro gitar baltasiyla solo atar (`GUITAR_SHRED`), kutsal isik sacar (`HOLY_LIGHT`) ve kucumseyici kahkahalar atar (`SMUG_LAUGH`).
- **Vaggie (`vaggie`)** - *EXORCIST ANGEL*: Melek mizragini savurur (`SPEAR_THRUST`), dovus gardi alir (`COMBAT_STANCE`) ve tetikte devriye gezer (`STERN_PATROL`).
- **Valentino (`valentino`)** - *OVERLORD OF LUST*: Puro dumani ufler (`CIGAR_SMOKE`), kalp gozluklerini duzeltir (`HEART_GLASSES`) ve kahkaha atar (`OVERLORD_LAUGH`).
- **Velvette (`velvette`)** - *OVERLORD FASHION*: Moda podyumu yuruyusu (`RUNWAY_STRUT`), selfie cekilme pozu (`SELFIE_STRETCH`) ve sac savurma (`HAIR_FLIP`).

### 3. The Amazing Digital Circus Evreni
- **Kinger (`kinger`)** - *CHESS KING*: Yastik kalesinde panikler (`FORTRESS_PARANOIA`), kelebege odaklanir (`BUTTERFLY_FOCUS`) ve ciglik atip donakalir (`SCREAM_FREEZE`).
- **Bubble (`bubble`)** - *TADC MAID*: Caine'in sabun kopugu yardimcisi. Havada asili kalir, ziplar ve temizlik hareketleri yapar.

### 4. Freaky Circus Evreni
- **Pierrot (`pierrot`)** - *CHAOTIC JESTER*: Kaotik sirk palyacosu. Sabit ve temiz `0004` idle durusu, panik donusu (`PANIC_SPIN`), soytari dansi (`JEST_DANCE`), sirk cemberi (`CIRCUS_CARTWHEEL`) ve kaotik ziplamalar (`CHAOTIC_JUMP`) yapar.

### 5. My Little Pony & Pibby Evreni
- **Fluttershy (`fluttershy`)** - *KIND PEGASUS*: Sefkatli sari pegasus. Havada hafifce suzulur (`GENTLE_HOVER`) ve cayirlara bakinir (`MEADOW_GLANCE`).
- **Rainbow Dash (`rainbowdash`)** - *SONIC RAINBOOM*: Supersonik gokkusagi patlamasi (`SONIC_RAINBOOM`), kanat cirpisi (`WINGS_FLUTTER`) ve havali selam (`COOL_SALUTE`).
- **Twilight (`twilight`)** - *PIBBY GLITCH*: Pibby virusuyle bozulmus Twilight. Mor karanlik bozulmasi (`CORRUPT_GLITCH`) ve buyu nabzi (`MAGIC_PULSE`) yayar.

### 6. Marvel Evreni
- **Spider-Man (`spiderman`)** - *WEB SLINGER*: Dost canlisi Peter Parker. Ag firlatir (`WEB_SHOOT`), havada agla sallanir (`WEB_SWING`) ve orumcek cokusu pozu verir (`SPIDER_CROUCH`).

### 7. Five Nights at Freddy's Evreni
- **Foxy (`foxy`)** - *PIRATE FOX*: Korsan Cove tilkisi. Kancasiyla sallanir (`HOOK_SWING`), jumpscare suzulmesi yapar (`JUMPSCARE_CREEP`) ve goz bandini ayarlar (`EYEPATCH_ADJUST`).

### 8. League of Legends Evreni
- **Sett (`sett`)** - *THE BOSS*: Yeralti dovuslerinin patronu. Sov kaslarini sikar (`SHOWSTOPPER_FLEX`), parmaklarini kutletir (`KNUCKLE_POP`) ve patron tahtinda dinlenir (`PIT_BOSS_REST`).

### 9. Cookie Run Kingdom Evreni
- **Shadow Milk (`shadowmilk`)** - *BEAST DECEIT*: Golge Sutlu Kurabiye. Kukla tiyatrosu oynatir (`PUPPET_THEATER`), mavi alevlerle jonglorluk yapar (`BLUE_FLAME_JUGGLE`) ve aldatma dansi sergiler (`DECEIT_DANCE`).

### 10. Undertale Evreni
- **Flowey (`flowey`)** - *BEST FRIEND*: Yerin altindan aniden belirir, dostluk tohumlari savurur ve seytani cicek gulusu yapar.

### 11. Undertale Yellow Evreni
- **Clover (`clover`)** - *JUSTICE COWBOY*: Adaletin sari ruhlu kovboyu. Sapkasini duzeltir, silahiyla nisan alir ve adalet atislari yapar.

### 12. Deltarune Evreni
- **Jevil (`jevil`)** - *CHAOS CHAOS*: Kaotik hucre soytarisi. Donen bicaklar, kaos illuzyonlari ve Devilsknife saldirilari sergiler.
- **Tenna (`tenna`)** - *TV HOST*: Katot isinli televizyon sunucusu. Yarisma programi sunuculugu (`GAMESHOW_HOST`) ve anten sinyalleri yayinlar.

### 13. ENA Evreni
- **ENA (`ena`)** - *SURREAL*: Iki yuzlu surreal varlik. Poligon dansi (`POLYGON_DANCE`), peynir glitchi (`CHEESE_GLITCH`) ve kum saati dramasi (`HOURGLASS_DRAMA`) yapar.

### 14. Cuphead Evreni
- **Cuphead (`cuphead`)** - *PEASHOOTER*: Fincan kafali kahraman. Parmak tabancasiyla lazer sikar ve 1930'lar kaucuk boru animasyonuyla ziplar.

### 15. Genshin Impact Evreni
- **Furina (`furina`)** - *HYDRO ARCHON*: Fontaine'in su hanimi. Zarifce cayini yudumlar, pasta ziyafeti ceker (`CAKE_FEAST`) ve sahne reveransi yapar.

### 16. JoJo's Bizarre Adventure Evreni
- **DIO (`dio`)** - *THE WORLD*: Zamani durduran vampir. Zamani dondurur (`ZA_WARUDO`), ikonik `WRYYYYY` durusu sergiler ve menacing aurasi sacar (`STAND_MENACE`).

### 17. Hollow Knight Evreni
- **The Knight (`knight`)** - *VOID VESSEL*: Hicligin tasiyicisi. Kemik kilicini savurur (`NAIL_SLASH`), ruh odaklar (`FOCUS_SOUL`) ve bankta dinlenir (`BENCH_NAP`).
- **Hornet (`hornet`)** - *SILKSONG*: Hallownest'in koruyucusu. Igne firlatir (`NEEDLE_THROW`), ipekle ileri atilir (`SILK_DASH`) ve bankta dinlenir (`BENCH_REST`).
- **Zote the Mighty (`zote`)** - *57 PRECEPTS*: Yenilmez Korkusuz Zote. Life Ender kilicini sallar (`LIFE_ENDER_SWING`), 57 ilke nutku ceker (`PRECEPT_SPEECH`) ve kaslarini kasar (`PROUD_FLEX`).

---

## Otomatik Yanitlayici (AutoResponder)

- Belirlediginiz anahtar kelimeler sohbette veya DM'de gectiginde otomatik olarak onceden ayarladiginiz yaniti gonderir.
- Sunucu ve DM bazli filtreleme destegi.
- Acma / kapama ana salteri ile tek tikla kontrol.

---

## Kategori ve Sablon Yoneticisi

- Sik kullandiginiz mesajlari, komutlari veya duyuru sablonlarini kategoriler altinda toplayin.
- Tek tikla kopyalayip sohbete yapistirma kolayligi.
- Ozel renk etiketleri ile duzenleme.

---

## Kontroller ve Kisayollar

| Eylem | Nasil Yapilir? |
| :--- | :--- |
| **Maskotu Surukle / Tasi** | Sol tikla basili tutup surukleyin |
| **Maskotu Firlat** | Hizlica bir yone dogru surukleyip sol tiki birakin |
| **Hizli Ayar Menusu** | Maskotun uzerine **Sag Tik** yapin |
| **Studio Menusunu Ac** | Maskota sag tiklayip *"Shimeji Studyosu"* secenegine tiklayin |
| **Maskotu Kapat / Gizle** | Maskota sag tiklayip *"Maskotu Kapat"* secenegine basin |
| **Discord'u Yenile** | Herhangi bir guncelleme sonrasi **`Ctrl + R`** tuslarina basin |

---

## Kurulum ve Yenileme

1. `KeyWare.plugin.js` dosyasini BetterDiscord eklentiler klasorunuze yerlestirin:
   ```
   %APPDATA%\BetterDiscord\plugins\KeyWare.plugin.js
   ```
2. Discord icerisinde **Ayarlar -> Eklentiler (Plugins)** sekmesine gidin.
3. **KeyWare** eklentisini aktif hale getirin.
4. Discord arayuzunu tazelemek icin **`Ctrl + R`** yapin.

---

<div align="center">

*KeyWare DMS Studio Tarafindan Gelistirilmistir.*

</div>
