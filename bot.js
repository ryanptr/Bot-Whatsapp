/*
 * Aeronix Bot
 * Made by Ryan (Original Base)
 * Modified by Cryanox/Aeronix User
 * WhatsApp: wa.me/6281215201077
 * Telegram: t.me/rxyne
 */
require('dotenv').config(); // Muat variabel dari .env ke process.env

const {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const pino = require("pino");
const { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } = require("@google/generative-ai");

// --- KONFIGURASI ---
const GEMINI_API_KEY = "AIzaSyCzsYHBw_E1kDGvLDhf2-uZQ6okUwdP--k"; // Ganti dengan API Key Gemini Anda
const OWNER_JIDS = [
  "6285878143481@s.whatsapp.net",
  "62888029575500@s.whatsapp.net" // Ganti dengan JID owner
  // Tambahkan JID owner lain jika perlu
];
const SUBSCRIBED_USERS_FILE = path.join(__dirname, './subscribed_users.json');
const USER_LIMITS_FILE = path.join(__dirname, './user_limits.json');
const MAX_HISTORY_PER_USER = 6;
const TEMP_FOLDER = path.join(__dirname, "./temp");
const AUTH_FILE_DIR = path.join(__dirname, 'auth_info_baileys');

// --- PENGATURAN KEAMANAN GEMINI ---
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
];

// --- FUNGSI LOGGING ---
function getTime() { return new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }

function saveLog(type, message) {
  let icon = "ℹ️"; 
  switch(type.toUpperCase()) {
      case "SYSTEM": case "SYSTEM_START": case "SYSTEM_EXIT": icon = "🚀"; break;
      case "CONNECTION": case "CONNECTION_CLOSE": case "CONNECTION_RETRY": case "CONNECTION_INFO": icon = "🔗"; break;
      case "CONNECTION_SUCCESS": icon = "🎉"; break;
      case "CONNECTION_FATAL": icon = "🚪"; break;
      case "QR_EVENT": icon = "📱"; break;
      case "MESSAGE_IN": icon = "👤💬"; break;
      case "MESSAGE_OUT": case "AI_RESPONSE_SENT": icon = "🤖💬"; break;
      case "AI_CHAT_REQUEST": case "GEMINI_CONFIG_INFO": case "AI_CHAT_PREPARED": icon = "🧠"; break;
      case "AI_SUMMARY": case "AI_SUMMARY_REQUEST": case "AI_SUMMARY_SUCCESS": case "AI_SUMMARY_FAIL": icon = "📝"; break;
      case "STICKER": case "STICKER_REQUEST": case "STICKER_SUCCESS": icon = "🖼️✨"; break;
      case "FFMPEG_SUCCESS": case "FFMPEG_ERROR": icon = "🎞️"; break;
      case "OWNER_CMD": case "OWNER_ACTION": icon = "👑"; break;
      case "PREMIUM_ACCESS": icon = "💎"; break;
      case "LIMIT_SYSTEM": case "LIMIT_USE": icon = "🛡️"; break;
      case "LIMIT_REACHED": icon = "🚫"; break;
      case "LIMIT_PURCHASE_INFO": icon = "🪙"; break;
      case "ERROR": case "GEMINI_ERROR": case "STICKER_ERROR": case "FILESYSTEM_ERROR": case "SESSION_ERROR": case "FATAL_ERROR": case "AI_CHAT_FATAL_ERROR": icon = "❌🚨"; break;
      case "WARN": case "GEMINI_WARN": case "CONFIG_WARN": case "AI_CHAT_WARN": case "AI_CHAT_INFO": icon = "⚠️"; break;
      case "COMMAND_USED": icon = "▶️"; break;
      default: icon = "ℹ️"; break;
  }
  const logMessage = `[${new Date().toISOString()}] [${getTime()}] ${icon} ${type}: ${message}\n`;
  try { fs.appendFileSync(path.join(__dirname, "bot.log"), logMessage, "utf-8"); } 
  catch (err) { console.error(`${getTime()} Gagal menulis ke bot.log: ${err.message}`); }
  console.log(`${icon} [${getTime()}] ${type}: ${message}`);
}

// --- INISIALISASI KLIEN GEMINI ---
let genAI = null; 
if (GEMINI_API_KEY === "MASUKKAN_API_KEY_GEMINI_ANDA_DI_SINI" || !GEMINI_API_KEY || GEMINI_API_KEY.trim() === "") {
    saveLog("GEMINI_CONFIG_ERROR", "API Key Gemini adalah placeholder/kosong. AI dinonaktifkan.");
} else {
    try {
        genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        if (genAI && typeof genAI.getGenerativeModel === 'function') {
            saveLog("GEMINI_CONFIG_SUCCESS", "Klien Gemini AI BERHASIL diinisialisasi.");
        } else {
            saveLog("GEMINI_CONFIG_ERROR", "Objek genAI tampaknya tidak valid setelah inisialisasi.");
            genAI = null;
        }
    } catch (initializationError) {
        saveLog("GEMINI_CONFIG_FATAL_ERROR", `GAGAL TOTAL saat menginisialisasi GoogleGenerativeAI: ${initializationError.message}`);
        genAI = null;
    }
}
if (OWNER_JIDS.some(jid => jid.startsWith("NOMOR_OWNER_"))) {
    saveLog("CONFIG_WARN", "OWNER_JIDS belum diatur dengan benar! Ganti placeholder.");
}

// --- FUNGSI HELPER (Gemini, JSON, Limit) ---
async function callGeminiAPI(promptText, chatHistory = []) {
    if (!genAI) { 
        saveLog("GEMINI_CALL_ERROR", "callGeminiAPI: genAI tidak terinisialisasi.");
        return "Maaf, layanan AI sedang tidak aktif karena masalah konfigurasi API Key atau kesalahan internal.";
    }
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest", safetySettings });
        const chat = model.startChat({ history: chatHistory, generationConfig: { maxOutputTokens: 1500 } });
        const result = await chat.sendMessage(promptText);
        const response = result.response;
        
        if (response.promptFeedback && response.promptFeedback.blockReason) {
            saveLog("GEMINI_WARN", `Respons Gemini diblokir: ${response.promptFeedback.blockReason}`);
            return `Maaf, respons diblokir karena alasan keamanan konten (${response.promptFeedback.blockReason}). Coba ajukan pertanyaan lain.`;
        }
        const responseText = response.text();
        return responseText;
    } catch (error) {
        saveLog("GEMINI_ERROR", `Error saat memanggil Gemini API: ${error.message}`);
        if (error.message.includes('API key not valid')) return "Maaf, API Key Gemini tidak valid atau salah konfigurasi.";
        if (error.message.includes('429') || /quota|resource.*exhausted/i.test(error.message)) return "Maaf, batas penggunaan API Gemini telah tercapai.";
        if (error.response && error.response.data && error.response.data.error && error.response.data.error.message) {
             saveLog("GEMINI_ERROR_DETAIL", `Detail Error Gemini: ${error.response.data.error.message}`);
             return `Maaf, terjadi kesalahan dari sisi AI Gemini: ${error.response.data.error.message.substring(0,100)}`;
        }
        return "Maaf, terjadi gangguan tak terduga dengan AI Gemini.";
    }
}

const chatHistories = new Map();

function loadJSON(f,d=null){try{if(fs.existsSync(f))return JSON.parse(fs.readFileSync(f,'utf-8'));}catch(e){saveLog("FILESYSTEM_ERROR",`Load ${f}: ${e.message}`);}return d===null?(f.includes('users')?[]:{}):d;}
function saveJSON(f,d){try{fs.writeFileSync(f,JSON.stringify(d,null,2),'utf-8');}catch(e){saveLog("FILESYSTEM_ERROR",`Save ${f}: ${e.message}`);}}
function isUserSubscribed(uid){return loadJSON(SUBSCRIBED_USERS_FILE,[]).includes(uid);}
function checkAndDecrementLimit(uid,cmd,limit){if(OWNER_JIDS.includes(uid)||isUserSubscribed(uid)){saveLog("LIMIT_SYSTEM",`👑 Akses tanpa limit untuk ${uid.split('@')[0]} pada ${cmd}.`);return {canUse:true,remaining:Infinity,used:0};}let lData=loadJSON(USER_LIMITS_FILE,{});const today=new Date().setHours(0,0,0,0);if(!lData[uid])lData[uid]={};if(!lData[uid][cmd]||lData[uid][cmd].lastReset<today){lData[uid][cmd]={count:0,lastReset:today};saveLog("LIMIT_SYSTEM", `♻️ Limit ${cmd} direset untuk ${uid.split('@')[0]}`);}if(lData[uid][cmd].count<limit){lData[uid][cmd].count++;saveJSON(USER_LIMITS_FILE,lData);saveLog("LIMIT_USE",`🛡️ Limit ${cmd} (${lData[uid][cmd].count}/${limit}) untuk ${uid.split('@')[0]}`);return{canUse:true,remaining:limit-lData[uid][cmd].count,used:lData[uid][cmd].count};}else{saveLog("LIMIT_REACHED",`🚫 Limit ${cmd} habis untuk ${uid.split('@')[0]}`);return{canUse:false,remaining:0,used:lData[uid][cmd].count};}}

// --- FUNGSI UTAMA BOT ---
async function startBot() {
  if (fs.existsSync(AUTH_FILE_DIR)) {
    try { 
        const files = fs.readdirSync(AUTH_FILE_DIR); 
        if (files.length === 0) {
            saveLog("SESSION_WARN", `Folder sesi '${AUTH_FILE_DIR}' kosong, menghapus...`);
            fs.rmSync(AUTH_FILE_DIR, { recursive: true, force: true }); 
        }
    } catch (error) { 
        saveLog("SESSION_ERROR", `Gagal memvalidasi folder sesi '${AUTH_FILE_DIR}': ${error.message}`);
        fs.rmSync(AUTH_FILE_DIR, { recursive: true, force: true });
    }
  }
  if (!fs.existsSync(SUBSCRIBED_USERS_FILE)) saveJSON(SUBSCRIBED_USERS_FILE, []);
  if (!fs.existsSync(USER_LIMITS_FILE)) saveJSON(USER_LIMITS_FILE, {});
  if (!fs.existsSync(TEMP_FOLDER)) { 
      try { fs.mkdirSync(TEMP_FOLDER, { recursive: true }); saveLog("SYSTEM", `✅ Folder '${TEMP_FOLDER}' berhasil dibuat.`); } 
      catch (e) { saveLog("FILESYSTEM_ERROR", `❌ Gagal membuat folder '${TEMP_FOLDER}': ${e.message}`)}
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FILE_DIR);
  const sock = makeWASocket({ 
    auth: state, 
    logger: pino({ level: "silent" }),
    browser: ['AeronixBot', 'Chrome', '3.0.0'] 
  });
  
  sock.ev.on("creds.update", saveCreds);
  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) { 
        saveLog("QR_EVENT", "📱 QR Code diterima, silakan scan!");
        console.log("\n================== SCAN QR DI SINI ==================");
        qrcode.generate(qr, { small: true }); 
        console.log("==================================================\n");
    }
    if (connection === "close") { 
        const statusCode = lastDisconnect.error instanceof Boom ? lastDisconnect.error.output.statusCode : 500;
        let shouldReconnect = false;
        if (lastDisconnect.error instanceof Boom) {
            shouldReconnect = statusCode !== DisconnectReason.loggedOut && 
                              statusCode !== DisconnectReason.connectionReplaced &&
                              statusCode !== DisconnectReason.multideviceMismatch && 
                              statusCode !== DisconnectReason.timedOut;
        } else { 
            shouldReconnect = true; 
        }

        if (statusCode === DisconnectReason.loggedOut || statusCode === DisconnectReason.connectionReplaced || statusCode === DisconnectReason.multideviceMismatch) {
            saveLog("CONNECTION_FATAL", `🚪 Koneksi ditutup permanen (${DisconnectReason[statusCode] || statusCode}). Hapus folder sesi '${AUTH_FILE_DIR}' dan scan ulang QR.`);
        } else if (shouldReconnect) {
            saveLog("CONNECTION_RETRY", `🔌❌ Koneksi ditutup: ${lastDisconnect.error ? lastDisconnect.error.message : 'Alasan tidak diketahui'}. Mencoba menghubungkan ulang...`);
            startBot(); 
        } else {
             saveLog("CONNECTION_ERROR", `🔌❌ Koneksi ditutup: ${lastDisconnect.error ? lastDisconnect.error.message : 'Alasan tidak diketahui'}. Tidak mencoba reconnect otomatis.`);
        }
    }
    else if (connection === "open") { saveLog("CONNECTION_SUCCESS", "🎉 BOT AERONIX (v1.8 Notif Limit+) TERHUBUNG!"); }
    else if (connection === "connecting") { saveLog("CONNECTION_INFO", "🔄 Menyambungkan ke WhatsApp..."); }
  });
  
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const from = msg.key.remoteJid; // JID chat (bisa JID user atau JID grup)
    const isGroup = from.includes("@g.us"); // 1. Definisikan isGroup terlebih dahulu
    
    // 2. Baru definisikan senderJid menggunakan isGroup yang sudah ada
    const senderJid = isGroup ? (msg.key.participant || msg.author || from) : from; 
    // msg.author adalah fallback jika participant tidak ada di beberapa versi/event Baileys

    let text = msg.message.conversation || 
               msg.message.extendedTextMessage?.text || 
               msg.message.imageMessage?.caption || 
               msg.message.videoMessage?.caption || 
               "";
    const senderName = msg.pushName || "Pengguna Tidak Dikenal";
    
    let logText = text;
    if (!logText && (msg.message.imageMessage || msg.message.videoMessage || msg.message.stickerMessage)) {
        logText = msg.message.imageMessage ? "[Pesan Gambar]" : (msg.message.videoMessage ? "[Pesan Video/GIF]" : "[Pesan Stiker]");
    } else if (!logText) {
        logText = "[Pesan Kosong/Tidak Didukung]";
    }
    
    // 3. Sekarang aman menggunakan isGroup dan senderJid untuk logging dan logika lainnya
    saveLog("MESSAGE_IN", `${isGroup ? "Grup" : "👤Personal"} - ${senderName} (${senderJid.split('@')[0]}): ${logText}`);

    const commandText = text.toLowerCase().trim().split(" ")[0];
    const args = text.trim().split(" ").slice(1);
    const fullArgs = args.join(" ");

    // Pengecekan isOwner sekarang menggunakan senderJid yang benar
    const isOwner = OWNER_JIDS.includes(senderJid); 
    const isSubscribed = isUserSubscribed(senderJid); // Juga pakai senderJid

    // --- AWAL PENGECEKAN BOT AKTIF DI GRUP ---
    // (Logika ini sudah benar menggunakan 'isGroup' dan 'isOwner' yang terdefinisi dengan benar)
    if (isGroup && commandText !== '/bot') { 
        const botIsActiveInGroup = getGroupSetting(from, 'bot_active', true); 
        if (!botIsActiveInGroup && !isOwner) {
            saveLog("BOT_INACTIVE", `🤖 Bot tidak aktif di grup ${from.split('@')[0]}, pesan dari ${senderName} diabaikan.`);
            return; 
        }
    }
    // --- AKHIR PENGECEKAN BOT AKTIF DI GRUP ---

    // --- AWAL PERINTAH KHUSUS GRUP (ADMIN/OWNER ONLY) ---
    if (isGroup && (commandText === '/setwelcome' || commandText === '/on' || commandText === '/off' || commandText === '/bot')) {
        let isAdmin = false;
        try {
            const groupMetadata = await sock.groupMetadata(from);
            const participantData = groupMetadata.participants.find(p => p.id === senderJid);
            isAdmin = participantData?.admin === 'admin' || participantData?.admin === 'superadmin';
        } catch (e) { saveLog("ERROR", `❌ Tidak bisa mendapatkan metadata grup ${from}: ${e.message}`); }

        if (!isAdmin && !isOwner) {
            await sock.sendMessage(from, { text: "🚫 Perintah ini hanya bisa digunakan oleh Admin Grup atau Owner Bot." }, { quoted: msg });
            return;
        }

        if (commandText === '/setwelcome') {
            const newWelcomeMessage = fullArgs;
            if (!newWelcomeMessage) { await sock.sendMessage(from, { text: "✍️ Contoh: /setwelcome Selamat datang @user di grup {groupName}!" }, { quoted: msg }); return; }
            setGroupSetting(from, 'welcome_message', newWelcomeMessage);
            await sock.sendMessage(from, { text: `✅ Pesan sambutan diubah menjadi:\n${newWelcomeMessage}` }, { quoted: msg });
            return;
        }
        if (commandText === '/on' || commandText === '/off') {
            const option = args[0]?.toLowerCase();
            if (option === 'welcome') {
                const enable = commandText === '/on';
                setGroupSetting(from, 'welcome_enabled', enable);
                await sock.sendMessage(from, { text: `✅ Fitur pesan sambutan ${enable ? 'AKTIF' : 'NONAKTIF'} untuk grup ini.` }, { quoted: msg });
            } else { await sock.sendMessage(from, { text: "⚠️ Opsi: /on welcome atau /off welcome" }, { quoted: msg }); }
            return;
        }
        if (commandText === '/bot') {
            const subCommand = args[0]?.toLowerCase();
            if (subCommand === 'on') { setGroupSetting(from, 'bot_active', true); await sock.sendMessage(from, { text: "🤖✅ Bot Aeronix AKTIF di grup ini." }, { quoted: msg }); }
            else if (subCommand === 'off') { setGroupSetting(from, 'bot_active', false); await sock.sendMessage(from, { text: "🤖💤 Bot Aeronix NONAKTIF di grup ini." }, { quoted: msg }); }
            else { await sock.sendMessage(from, { text: "Gunakan: /bot on atau /bot off" }, { quoted: msg }); }
            return;
        }
    }
    // --- AKHIR PERINTAH KHUSUS GRUP ---

    // --- AWAL PERINTAH OWNER ---
    if (isOwner) {
        if (commandText === "/addsub") {
            saveLog("OWNER_CMD", `👑 ${senderName} menggunakan /addsub`);
            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            let targetJidInput = args[0]; let targetJid = "";
            if (mentionedJids.length > 0) { targetJid = mentionedJids[0]; }
            else if (targetJidInput) { targetJid = targetJidInput.replace(/[^0-9]/g, '') + "@s.whatsapp.net"; if(!targetJid.startsWith("62") && targetJid.length > 15) targetJid = "62"+targetJid.substring(targetJid.indexOf("s.whatsapp.net")-10); /* Basic JID normalization */ }
            
            if (targetJid && targetJid.includes('@s.whatsapp.net') && targetJid.split('@')[0].length >= 10) {
                let subs = loadJSON(SUBSCRIBED_USERS_FILE, []);
                if (!subs.includes(targetJid)) { subs.push(targetJid); saveJSON(SUBSCRIBED_USERS_FILE, subs); await sock.sendMessage(from, { text: `✅ Pengguna ${targetJid.split('@')[0]} berhasil ditambahkan ke daftar langganan.`}, { quoted: msg }); saveLog("OWNER_CMD_SUCCESS",`➕👤 ${targetJid} ditambahkan ke subscriber oleh ${senderName}`);}
                else { await sock.sendMessage(from, { text: `ℹ️ Pengguna ${targetJid.split('@')[0]} sudah ada dalam daftar langganan.`}, { quoted: msg }); }
            } else { await sock.sendMessage(from, { text: "Format JID tidak valid atau tidak ada target. Contoh: /addsub 628xxxx atau tag pengguna."}, { quoted: msg }); }
            return;
        }
        if (commandText === "/delsub") {
            saveLog("OWNER_CMD", `👑 ${senderName} menggunakan /delsub`);
            const mentionedJids = msg.message?.extendedTextMessage?.contextInfo?.mentionedJid || [];
            let targetJidInput = args[0]; let targetJid = "";
            if (mentionedJids.length > 0) { targetJid = mentionedJids[0]; }
            else if (targetJidInput) { targetJid = targetJidInput.replace(/[^0-9]/g, '') + "@s.whatsapp.net"; if(!targetJid.startsWith("62") && targetJid.length > 15) targetJid = "62"+targetJid.substring(targetJid.indexOf("s.whatsapp.net")-10); }

            if (targetJid && targetJid.includes('@s.whatsapp.net') && targetJid.split('@')[0].length >= 10) {
                let subs = loadJSON(SUBSCRIBED_USERS_FILE, []); const idx = subs.indexOf(targetJid);
                if (idx > -1) { subs.splice(idx, 1); saveJSON(SUBSCRIBED_USERS_FILE, subs); await sock.sendMessage(from, { text: `🗑️ Pengguna ${targetJid.split('@')[0]} berhasil dihapus dari langganan.`}, { quoted: msg }); saveLog("OWNER_CMD_SUCCESS",`➖👤 ${targetJid} dihapus dari subscriber oleh ${senderName}`);}
                else { await sock.sendMessage(from, { text: `ℹ️ Pengguna ${targetJid.split('@')[0]} tidak ditemukan dalam daftar langganan.`}, { quoted: msg }); }
            } else { await sock.sendMessage(from, { text: "Format JID tidak valid atau tidak ada target. Contoh: /delsub 628xxxx atau tag pengguna."}, { quoted: msg }); }
            return;
        }
    }
    // --- AKHIR PERINTAH OWNER ---

    // --- AWAL PERINTAH PUBLIK & INFO ---
    if (commandText === '/menu' || commandText === '/help' || commandText === 'menu' || commandText === 'help') {
      const isPremiumAccess = isOwner || isSubscribed;
      const limitInfo = isPremiumAccess ? "Tak Terbatas" : "7/hari";
      const dailyLimitForDisplay = 7;
      const menuString = `
✨ *Aeronix Bot* ✨

Halo, ${senderName}! 👋
AI Aeronix siap membantu Anda dengan berbagai fitur canggih!
➖➖➖➖➖➖➖➖➖➖➖
👤  *PROFIL ANDA*
> Status: ${isPremiumAccess ? "👑 Premium / Owner" : "👤 Reguler"}
> Jatah Fitur Harian (Reguler): ${dailyLimitForDisplay}x per fitur*
> Ingin jatah lebih? Ketik: */belilimit* 🪙
> _(*Jatah direset setiap pk 00:00 WIB)_ 
> _(Premium/Owner akses tanpa batas)_
➖➖➖➖➖➖➖➖➖➖➖
🤖  *INFO BOT*
> Nama: Asisten Cerdas Aeronix
> Versi: 1.9 (Fitur Grup Dasar) 
> Pembuat: Cryanox (Modifikasi)
> Langganan: /subscribeinfo
➖➖➖➖➖➖➖➖➖➖➖
👑  *ADMIN GRUP & OWNER*
> */setwelcome* [teks] - Atur pesan sambutan
>  _(Gunakan @user & {groupName})_
> */on welcome* - Aktifkan sambutan
> */off welcome* - Nonaktifkan sambutan
> */bot on* - Aktifkan bot di grup
> */bot off* - Nonaktifkan bot di grup
➖➖➖➖➖➖➖➖➖➖➖
🧠  *FITUR AI*
> */resetai* - Reset konteks AI
> */ringkas* - Ringkas teks (Limit ${limitInfo}) 📝
> _(Chat langsung untuk interaksi AI umum)_ 
> _(Limit chat AI: ${limitInfo})_
➖➖➖➖➖➖➖➖➖➖➖
🖼️  *FITUR MEDIA*
> */sticker* - Buat stiker (Limit ${limitInfo}) ✨
➖➖➖➖➖➖➖➖➖➖➖
🛍️  *AERONIX SHOP*
> */belilimit* - Info cara tambah jatah 🪙
> */sewabot* - Sewa bot untuk grup Anda 🤖➕
➖➖➖➖➖➖➖➖➖➖➖
ℹ️  *BANTUAN & INFO*
> */menu* - Menu ini
> */about* - Info bot & teknologi
> */ping* - Tes koneksi bot
> */owner* - Kontak developer
➖➖➖➖➖➖➖➖➖➖➖
👑  *PREMIUM & LANGGANAN*
> */subscribeinfo* - Info cara langganan
> */fiturpremium* - Contoh fitur khusus
➖➖➖➖➖➖➖➖➖➖➖
🌟  *LEGENDA SIMBOL*
> ✨ Stiker Animasi / Judul Utama
> 🤖 Info Bot / Grup
> 🧠 Fitur AI
> 📝 Fitur Teks
> 🖼️ Fitur Media
> 👑 Khusus Langganan/Owner/Admin
> ℹ️ Bantuan & Info
> 🪙 Toko / Layanan Tambahan
> 👋 Sapaan
➖➖➖➖➖➖➖➖➖➖➖
Terima kasih telah menggunakan Aeronix! 😊
      `.trim();
      await sock.sendMessage(from, { text: menuString }, { quoted: msg });
      saveLog("COMMAND_USED", `📋 Menu ditampilkan untuk ${senderName}`);
      return;
    }

    if (commandText === '/belilimit') {
        saveLog("COMMAND_USED", `🪙 ${senderName} (${from.split('@')[0]}) meminta info /belilimit.`);
        const belilimitMsg = `
🪙 *AERONIX LIMIT+ STORE* 🪙

Kehabisan jatah fitur harian? Anda bisa menambahnya!
Berikut adalah opsi pembelian paket limit tambahan:

🔢 *PAKET KELIPATAN 10 LIMIT*
> •  10 Limit = Rp 5.000
> •  20 Limit = Rp 10.000
> •  30 Limit = Rp 15.000
> •  40 Limit = Rp 20.000
> •  50 Limit = Rp 25.000
> _Dan seterusnya... (harga Rp 500 per 1 limit, pembelian kelipatan 10)_

📝 *Catatan Penting:*
> • Limit tambahan ini berlaku untuk semua fitur berlimit (AI Chat, /ringkas, /sticker).
> • Penambahan limit ini bersifat sementara dan akan hangus pada saat reset harian (pukul 00:00 WIB). Limit tidak diakumulasikan ke hari berikutnya.
> • Untuk akses tanpa batas dan keuntungan lebih, pertimbangkan untuk berlangganan. Ketik */subscribeinfo* untuk detailnya.
➖➖➖➖➖➖➖➖➖➖➖
📞 *CARA PEMBELIAN LIMIT TAMBAHAN*
Jika Anda berminat untuk membeli paket limit tambahan, silakan hubungi Owner:
Ketik: */owner*

Sebutkan jumlah paket limit yang ingin Anda beli.
Pembayaran akan diinformasikan lebih lanjut oleh Owner.

Terima kasih atas dukungannya terhadap Aeronix Bot! 🙏
        `.trim();
        await sock.sendMessage(from, { text: belilimitMsg }, { quoted: msg });
        return; // Pastikan ada return di akhir blok perintah
    }

    if (commandText === '/sewabot') { // <-- FITUR BARU DITAMBAHKAN DI SINI
        saveLog("COMMAND_USED", `🤖➕ ${senderName} (${from.split('@')[0]}) meminta info /sewabot.`);
        const sewabotMsg = `
🪙 *AERONIX - SEWA BOT (30 HARI)* 🪙

Ingin Aeronix bergabung dan meramaikan grup WhatsApp Anda?
Berikut adalah detail penawaran sewa bot kami:
➖➖➖➖➖➖➖➖➖➖➖
💰 *HARGA SEWA (untuk 30 Hari)*
> • Via Pulsa (Telkomsel/XL): *Rp 15.000*
> • Via E-Wallet (OVO/Gopay/Dana) / QRIS: *Rp 5.000*
➖➖➖➖➖➖➖➖➖➖➖
🎁 *KEUNTUNGAN YANG ANDA DAPATKAN*
> ✔️ Bot ditambahkan ke 1 (satu) Grup WhatsApp Anda.
> ✔️ Akses perintah untuk mengaktifkan/menonaktifkan bot di grup tersebut .
> ✔️ Fitur sambutan otomatis untuk member baru (welcome message).
> ✔️ Semua fitur bot yang tersedia untuk anggota grup (sesuai batas penggunaan reguler jika mereka tidak berlangganan premium personal).
➖➖➖➖➖➖➖➖➖➖➖
⚠️ *PERHATIAN PENTING (DIBACA!)* ⚠️
> • Harap hubungi Owner *sebelum* melakukan pembayaran untuk konfirmasi dan detail lebih lanjut.
> • Sewa bot untuk grup berbeda dengan langganan premium personal untuk mendapatkan limit tanpa batas bagi akun pribadi Anda.
> • Ketik */owner* untuk menghubungi Owner.
➖➖➖➖➖➖➖➖➖➖➖
Terima kasih atas minat Anda!
        `.trim();
        await sock.sendMessage(from, { text: sewabotMsg }, { quoted: msg });
        return;
    }
    
    if (commandText === '/subscribeinfo') { 
        const subscribeMsg = `👑 *INFO LANGGANAN BOT AERONIX* 👑\n\nDengan berlangganan Aeronix Premium, Anda mendapatkan keuntungan:\n> ✅ Akses TANPA BATAS ke semua fitur berlimit (AI Chat, /ringkas, /sticker).\n> ✅ Akses ke fitur-fitur premium eksklusif yang mungkin ditambahkan di masa depan.\n> ✅ Dukungan prioritas (jika ada).\n\nTertarik untuk meningkatkan pengalaman Anda?\nHubungi Owner untuk info biaya dan cara berlangganan: */owner*\n\nTerima kasih atas dukungan Anda! 🙏`;
        await sock.sendMessage(from, {text: subscribeMsg.trim()}, {quoted: msg});
        saveLog("COMMAND_USED", `💰 ${senderName} meminta info langganan.`);
        return; 
    }
    if (commandText === '/about' || commandText === 'about') { 
        const aboutMsg = `🤖  *TENTANG BOT AERONIX (GEMINI)*\n\nBot ini adalah asisten virtual cerdas Anda, ditenagai oleh AERONIX & dimodifikasi oleh Cryanox dari base Ryan.\nSiap membantu Anda dengan berbagai informasi, pembuatan stiker, ringkasan teks, dan lainnya!\n➖➖➖➖➖➖➖➖➖➖➖\n💻  *TEKNOLOGI YANG DIGUNAKAN*\n> Baileys (Interaksi WhatsApp)\n> AERONIX GEMINI API (Mesin AI)\n> Node.js (Runtime)\n> @google/generative-ai (SDK Gemini)\n> sharp (Pemrosesan Gambar Stiker)\n> fluent-ffmpeg & FFmpeg (Stiker Animasi)\n➖➖➖➖➖➖➖➖➖➖➖\n✨  *FITUR UNGGULAN*\n> ✅ AI Chat Cerdas dengan Konteks\n> ✅ Pembuat Stiker (Statis & Animasi) ✨\n> ✅ Ringkasan Teks Otomatis 📝\n> ✅ Sistem Limit Harian & Langganan 👑\n> ✅ Perintah Informatif & Utilitas\n➖➖➖➖➖➖➖➖➖➖➖\n👨‍💻  *PENGEMBANG & MODIFIKASI*\n> Owner/Modifikator: Cryanox\n> Base Script: Ryan\n> Kontak Owner: /owner\n\n_Terima kasih telah menggunakan Aeronix!_ 😊`;
        await sock.sendMessage(from, {text: aboutMsg.trim()}, {quoted:msg}); 
        saveLog("COMMAND_USED", `ℹ️ ${senderName} melihat /about.`);
        return;
    }
    if (commandText === '/ping' || commandText === 'ping') { 
        const startTime = Date.now(); 
        const pingMsgObj = await sock.sendMessage(from, { text: '🏓 Menghitung kecepatan respons...' }, { quoted: msg }); 
        const endTime = Date.now(); const ping = endTime - startTime;
        const pingResp = `🚀  *STATUS & PING BOT AERONIX* 🚀\n\n> Status Bot: Online & Siap Menerima Perintah ✅\n> Koneksi AI: Google Gemini API Terhubung ✅\n> Kecepatan Respons Jaringan: *${ping} ms* ⚡\n\n_Bot Anda selalu siap melayani dengan gesit!_`;
        await sock.sendMessage(from, { text: pingResp.trim(), edit: pingMsgObj.key });
        saveLog("COMMAND_USED", `🏓 ${senderName} melakukan /ping (${ping}ms).`);
        return; 
    }
    if (commandText === '/owner' || commandText === 'owner') { 
        const ownerContactDefault = "Developer";
        let ownerDisplayNumber = ownerContactDefault;
        if (OWNER_JIDS.length > 0 && !OWNER_JIDS[0].startsWith("NOMOR_OWNER_")) { 
             ownerDisplayNumber = OWNER_JIDS[0].split('@')[0];
        }
        const ownerMsg = `👨‍💻 *INFO KONTAK DEVELOPER (CRYANOX)*\n\nIni adalah kontak dari Cryanox, pengembang dan yang memodifikasi bot Aeronix ini:\n\n> *Nama:* Cryanox\n> *WhatsApp:* wa.me/+${ownerDisplayNumber}\n> (Anda bisa juga DM langsung nomor ini jika merupakan Owner)\n➖➖➖➖➖➖➖➖➖➖➖\n💡 *PERLU DIPERHATIKAN*\nGunakan kontak ini untuk:\n  • Apresiasi atau feedback membangun.\n  • Laporan bug kritis pada bot.\n  • Diskusi terkait pengembangan atau langganan.\n\n_Harap hargai waktu developer._ 😊`;
        await sock.sendMessage(from, {text: ownerMsg.trim()}, {quoted:msg}); 
        saveLog("COMMAND_USED", `👑 ${senderName} melihat info /owner.`);
        return; 
    }
    if (commandText === '/resetai') { 
        chatHistories.delete(from); 
        await sock.sendMessage(from, {text:"🤖 Konteks percakapan AI Gemini telah direset untuk chat ini. Anda bisa memulai topik baru."}, {quoted:msg}); 
        saveLog("COMMAND_USED", `🔄🗑️ ${senderName} mereset konteks AI.`);
        return; 
    }
    // --- AKHIR PERINTAH PUBLIK & INFO ---

    // --- AWAL PERINTAH DENGAN LIMIT/SUBS ---
    if (commandText === "/ringkas") {
        const limit = checkAndDecrementLimit(from, 'ringkas', 7); 
        if (!limit.canUse) {
            await sock.sendMessage(from, { text: `🔔 Maaf, jatah /ringkas Anda hari ini habis. (Sisa: ${limit.remaining}/7)` }, { quoted: msg });
            return;
        }
        
        let textToSummarize = ""; const argsRingkas = fullArgs; 
        const qMR = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
        if (qMR) { textToSummarize = qMR.conversation || qMR.extendedTextMessage?.text || ""; if(argsRingkas) textToSummarize = argsRingkas; } 
        else { textToSummarize = argsRingkas; }

        if (!textToSummarize || textToSummarize.length < 100) { await sock.sendMessage(from, { text: "✍️ Teks terlalu pendek (min 100 karakter) atau tidak ada teks untuk diringkas." }, { quoted: msg }); return; }
        
        await sock.sendMessage(from, { text: "🤖 Aeronix sedang memproses ringkasan..." }, { quoted: msg });
        await sock.sendPresenceUpdate("composing", from);
        try {
            const summarizationPrompt = `Anda adalah asisten AI yang ahli dalam meringkas teks. Tolong buatkan ringkasan yang jelas, padat, dan informatif dari teks berikut. Fokus pada poin-poin utama dan sampaikan dalam beberapa kalimat atau poin jika memungkinkan. Jangan menambahkan opini atau informasi di luar teks asli.\n\nTeks yang akan diringkas:\n"""\n${textToSummarize}\n"""\n\nRingkasan:`;
            saveLog("AI_SUMMARY_REQUEST", `📝 Meminta ringkasan dari ${senderName} (Teks: ${textToSummarize.length} char).`);
            const summary = await callGeminiAPI(summarizationPrompt, []);
            
            if (summary && !summary.toLowerCase().includes("maaf") && !summary.toLowerCase().includes("kesalahan") && !summary.toLowerCase().includes("diblokir")) { 
                await sock.sendMessage(from, { text: `📝 *Ringkasan dari Aeronix:*\n\n${summary}` }, { quoted: msg });
                saveLog("AI_SUMMARY_SUCCESS", `✅ Ringkasan berhasil dibuat untuk ${senderName}.`);
                if (limit.remaining !== Infinity) {
                    const limitUsedNotification = `🛡️ *LIMIT FITUR TERPAKAI* 🛡️\n\nAnda telah menggunakan 1 jatah untuk fitur *Ringkas Teks (/ringkas)*.\nSisa jatah Anda hari ini: ${limit.remaining}/7.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
                    await sock.sendMessage(from, { text: limitUsedNotification }); 
                }
            } else { 
                await sock.sendMessage(from, { text: (summary && summary.includes("diblokir") ? summary : "🤖 Maaf, gagal membuat ringkasan saat ini.") }, { quoted: msg }); 
                saveLog("AI_SUMMARY_FAIL", `⚠️ Gagal meringkas atau respons diblokir untuk ${senderName}: ${summary}`);
            }
        } catch (e) { 
            await sock.sendMessage(from, { text: "🤖 Error internal saat meringkas." }, { quoted: msg });
            saveLog("ERROR", `❌ Summarization error for ${senderName}: ${e.message}`);
        }
        await sock.sendPresenceUpdate("available", from); 
        return; 
    }

    if (commandText === '/sticker' || commandText === '/stiker') {
        const limit = checkAndDecrementLimit(from, 'sticker', 7); 
        if (!limit.canUse) {
            await sock.sendMessage(from, { text: `🔔 Maaf, jatah /sticker Anda hari ini habis. (Sisa: ${limit.remaining}/7)` }, { quoted: msg });
            return;
        }

        let messageToDownload = null; let isImage = false; let isVideo = false;
        if (msg.message?.imageMessage && (commandText === '/sticker' || commandText === '/stiker' || text.toLowerCase().startsWith('/sticker ') || text.toLowerCase().startsWith('/stiker '))) { messageToDownload = msg; isImage = true; }
        else if (msg.message?.videoMessage && (commandText === '/sticker' || commandText === '/stiker' || text.toLowerCase().startsWith('/sticker ') || text.toLowerCase().startsWith('/stiker '))) { messageToDownload = msg; isVideo = true; } 
        else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) { 
            const quoted = msg.message.extendedTextMessage.contextInfo.quotedMessage; 
            messageToDownload = { key: msg.key, message: quoted }; 
            if (quoted.imageMessage) { isImage = true; } 
            else if (quoted.videoMessage) { isVideo = true; }
        }
        
        if (isImage && messageToDownload) { 
            await sock.sendMessage(from, { text: "🖼️ Sedang membuat stiker gambar..." }, { quoted: msg });
            await sock.sendPresenceUpdate("composing", from);
            try {
                const stream = await downloadMediaMessage(messageToDownload, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
                const stickerBuffer = await sharp(stream).resize(512, 512, { fit: 'contain', background: { r:0,g:0,b:0,alpha:0 } }).webp({ quality: 90 }).toBuffer();
                await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
                saveLog("STICKER_SUCCESS", `🖼️✨ Stiker statis berhasil dibuat untuk ${senderName}.`);
                if (limit.remaining !== Infinity) {
                    const limitUsedNotification = `🛡️ *LIMIT FITUR TERPAKAI* 🛡️\n\nAnda telah menggunakan 1 jatah untuk fitur *Pembuat Stiker (/sticker)*.\nSisa jatah Anda hari ini: ${limit.remaining}/7.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
                    await sock.sendMessage(from, { text: limitUsedNotification });
                }
            } catch (e) { await sock.sendMessage(from, { text: "🚫 Gagal buat stiker statis. Pastikan gambar valid." }, { quoted: msg }); saveLog("STICKER_ERROR", `❌ Static Sticker: ${e.message}`);}
            await sock.sendPresenceUpdate("available", from); return;
        } else if (isVideo && messageToDownload) {
            const videoDetails = (messageToDownload.key.id === msg.key.id && msg.message?.videoMessage) ? msg.message.videoMessage : messageToDownload.message?.videoMessage;
            if (!videoDetails) { await sock.sendMessage(from, { text: "🚫 Tidak dapat menemukan detail video." }, { quoted: msg }); return;}
            if (videoDetails.seconds > 10 && !videoDetails.gifPlayback) { 
                 await sock.sendMessage(from, { text: `🚫 Video >10 detik (${videoDetails.seconds}d). Maks 10d.` }, { quoted: msg }); return;
            }
            await sock.sendMessage(from, { text: "✨ Sedang membuat stiker animasi (mungkin perlu waktu)..." }, { quoted: msg });
            await sock.sendPresenceUpdate("composing", from);
            const tempInputPath = path.join(TEMP_FOLDER, `anim_in_${Date.now()}_${msg.key.id.substring(0,5)}.mp4`); 
            const tempOutputPath = path.join(TEMP_FOLDER, `anim_out_${Date.now()}_${msg.key.id.substring(0,5)}.webp`);
            try {
                const stream = await downloadMediaMessage(messageToDownload, 'buffer', {}, { reuploadRequest: sock.updateMediaMessage });
                await fs.promises.writeFile(tempInputPath, stream);
                await new Promise((resolve, reject) => {
                    ffmpeg(tempInputPath)
                        .outputOptions(['-vf', `fps=15,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=full[p];[s1][p]paletteuse=dither=sierra2_4a`, '-loop', '0', '-an', '-vsync', 'cfr', '-ss', '00:00:00', '-t', '00:00:07'])
                        .toFormat('webp').save(tempOutputPath)
                        .on('end', () => { saveLog("FFMPEG_SUCCESS", `✅ FFmpeg processed: ${tempOutputPath}`); resolve(tempOutputPath); })
                        .on('error', (err) => { saveLog("FFMPEG_ERROR", `❌ FFmpeg error: ${err.message}`); reject(err); });
                });
                const stickerBuffer = await fs.promises.readFile(tempOutputPath);
                await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
                saveLog("STICKER_SUCCESS", `✅✨ Stiker animasi berhasil dibuat untuk ${senderName}.`);
                 if (limit.remaining !== Infinity) {
                    const limitUsedNotification = `🛡️ *LIMIT FITUR TERPAKAI* 🛡️\n\nAnda telah menggunakan 1 jatah untuk fitur *Pembuat Stiker (/sticker)*.\nSisa jatah Anda hari ini: ${limit.remaining}/7.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
                    await sock.sendMessage(from, { text: limitUsedNotification });
                }
            } catch (e) { await sock.sendMessage(from, { text: "🚫 Gagal buat stiker animasi. Pastikan FFmpeg benar & media valid." }, { quoted: msg }); saveLog("STICKER_ERROR", `❌ Anim Sticker: ${e.message}`);}
            finally { try { if (fs.existsSync(tempInputPath)) fs.unlinkSync(tempInputPath); if (fs.existsSync(tempOutputPath)) fs.unlinkSync(tempOutputPath); } catch (e) {saveLog("FILESYSTEM_ERROR", `❌ Cleanup temp files: ${e.message}`)} }
            await sock.sendPresenceUpdate("available", from); return;
        } else if (commandText === '/sticker' || commandText === '/stiker') {
            await sock.sendMessage(from, { text: "⚠️ Reply gambar/GIF/video (<10d) atau kirim dengan caption /sticker." }, { quoted: msg }); return;
        }
    }
    
    if (commandText === "/fiturpremium") {
        if (!isUserSubscribed(from) && !isOwner) {
            await sock.sendMessage(from, { text: "👑 Maaf, ini fitur khusus Premium/Owner! Ketik /subscribeinfo." }, { quoted: msg });
            return;
        }
        saveLog("COMMAND_USED", `💎 ${senderName} mengakses /fiturpremium.`);
        await sock.sendMessage(from, { text: `🎉 Selamat datang di Fitur Premium,! 
        _Menu Fitur Premium Akan Segera Hadir_ ` }, { quoted: msg });
        return;
    }
    // --- AKHIR PERINTAH DENGAN LIMIT/SUBS ---

    // Pengecekan terakhir sebelum masuk ke AI Chat Umum
    const knownCommands = ['/menu', '/help', 'menu', 'help', '/subscribeinfo', '/about', 'about', '/ping', 'ping', '/owner', 'owner', '/resetai', '/ringkas', '/sticker', '/stiker', '/fiturpremium', '/belilimit', '/addsub', '/delsub'];
    if (knownCommands.includes(commandText) && text.toLowerCase().trim() === commandText) {
        saveLog("INFO", `⏩ Skipping AI for handled command-only text: ${commandText}`);
        return;
    }
    if (!text.trim()) {
        if (logText.startsWith("[Pesan Gambar]") || logText.startsWith("[Pesan Video/GIF]")) { 
            saveLog("INFO", `⏩ Skipping AI for unhandled media message: ${logText}`); return; 
        }
        saveLog("INFO", `⏩ Skipping AI for empty message.`); return; 
    }


    // --- AWAL LOGIKA AI CHAT BIASA DENGAN KONTEKS (GEMINI) DAN LIMIT ---
    const limitAIChat = checkAndDecrementLimit(from, 'aiChat', 7); 
    if (!limitAIChat.canUse) {
        await sock.sendMessage(from, { text: `🔔 Maaf, jatah chat AI Anda hari ini habis. (Sisa: ${limitAIChat.remaining}/7)` }, { quoted: msg });
        return;
    }
    
    const aiRequesterIdentifier = isOwner ? `👑 Owner ${senderName}` : senderName;
    saveLog("AI_CHAT_REQUEST", `🧠🔄 ${aiRequesterIdentifier} memulai chat AI untuk: "${text.substring(0,70)}..."`);
    await sock.sendPresenceUpdate("composing", from);
    try {
      let userHistory = chatHistories.get(from) || [];
      const geminiHistory = userHistory.map(item => ({ role: item.role === 'user' ? 'user' : 'model', parts: [{ text: item.content }] }));
      
      const aiResponse = await callGeminiAPI(text, geminiHistory); 
      let responseText = aiResponse; 

      let finalMessageToSend = "";
      const aiSpeakerLabel = "🤖 *Aeronix Menjawab:*\n"; 

      const isGeneratedErrorMessage = !responseText || typeof responseText !== 'string' || !responseText.trim() ||
                                      responseText.includes("Maaf, layanan AI sedang tidak aktif") ||
                                      responseText.includes("Maaf, API Key Gemini tidak valid") ||
                                      responseText.includes("Maaf, batas API Gemini tercapai") ||
                                      responseText.includes("Maaf, ada gangguan dengan AI Gemini") ||
                                      responseText.includes("Maaf, respons diblokir karena alasan keamanan konten");

      if (isGeneratedErrorMessage) {
           saveLog("AI_CHAT_INFO", `💬 Respons AI adalah error atau kosong: "${responseText}"`);
           finalMessageToSend = responseText && typeof responseText === 'string' && responseText.trim() ? responseText : "🤖 Maaf, Aeronix tidak bisa merespons saat ini.";
      } else {
           if (typeof responseText === 'string' && responseText.toLowerCase().startsWith("aeronix:")) responseText = responseText.substring("aeronix:".length).trim();
           finalMessageToSend = aiSpeakerLabel + responseText;
      }
      
      userHistory.push({ role: 'user', content: text });
      userHistory.push({ role: 'assistant', content: (isGeneratedErrorMessage && responseText && responseText.trim()) ? responseText : (isGeneratedErrorMessage ? "Tidak ada respons dari AI." : responseText) });
      while (userHistory.length > MAX_HISTORY_PER_USER) userHistory.shift();
      chatHistories.set(from, userHistory);
      
      let watermark = "";
      if (!isGeneratedErrorMessage && responseText.length > 100 && !(/cryanox|ryan|aeronix|gemini/i.test(responseText))) { 
        watermark = `\n\n_🤖 AI by Ryan (Bot by Cryanox)_`;
      }
      
      if (finalMessageToSend.trim()) {
          let messagePayload = finalMessageToSend;
          if (!isGeneratedErrorMessage) messagePayload += watermark;
          // Notifikasi limit dipindahkan ke bawah agar dikirim sebagai pesan terpisah
          await sock.sendMessage(from, { text: messagePayload.trim() }, { quoted: msg });
          
          if (limitAIChat.remaining !== Infinity) { // Kirim notifikasi limit sebagai pesan terpisah
            const featureName = "Chat AI Aeronix";
            const limitUsedNotification = `🛡️ *LIMIT FITUR TERPAKAI* 🛡️\n\nAnda telah menggunakan 1 jatah untuk fitur *${featureName}*.\nSisa jatah Anda hari ini: ${limitAIChat.remaining}/7.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
            await sock.sendMessage(from, { text: limitUsedNotification }); // Tidak di-quote ke msg asli user agar tidak terlalu ramai
          }
          
          const previewResponse = (isGeneratedErrorMessage ? finalMessageToSend : responseText).substring(0, 70).replace(/\n/g, "↵");
          saveLog("AI_RESPONSE_SENT", `🤖💬 AI Aeronix -> ${senderName} (${from.split('@')[0]}): "${previewResponse}..."`);
      } else {
          saveLog("AI_CHAT_WARN", `⚠️ Respons AI kosong setelah semua proses untuk ${senderName}. Tidak ada pesan dikirim.`);
      }

    } catch (error) { 
      saveLog("AI_CHAT_FATAL_ERROR", `❌🚨 Error di blok AI Chat: ${error.message} \nStack: ${error.stack}`);
      await sock.sendMessage(from, {text: `❌ Aduh, AI Aeronix sedang mengalami gangguan teknis parah. Coba lagi nanti ya.\n\nDetail: ${error.message.substring(0,50)}...`}, {quoted:msg});
    }
    await sock.sendPresenceUpdate("available", from);
    // --- AKHIR LOGIKA AI CHAT BIASA DENGAN KONTEKS ---
  });
  // ================================================================================================
  // ============================= AKHIR EVENT HANDLER PESAN MASUK ==================================
  // ================================================================================================

  return sock;
}

// Bagian bawah file (process.on, banner, startBot().catch)
// --- ERROR HANDLING --- (Ini sudah ada di kode Anda)
process.on("SIGINT", () => {
  saveLog("SYSTEM_EXIT", "🛑 Bot dihentikan (SIGINT).");
  process.exit(0);
});
process.on("SIGTERM", () => {
  saveLog("SYSTEM_EXIT", "🛑 Bot dihentikan (SIGTERM).");
  process.exit(0);
});
process.on("uncaughtException", (error) => {
  saveLog("FATAL_ERROR", `❌🚨 Uncaught Exception: ${error.stack || error.message}`);
});
process.on("unhandledRejection", (reason, promise) => { 
    const reasonMessage = reason instanceof Error ? reason.stack || reason.message : String(reason);
    saveLog("FATAL_ERROR", `❌🚨 Unhandled Rejection: ${reasonMessage}`); 
});

// --- BAGIAN BANNER DAN START BOT YANG DIRAPIKAN ---
console.log(`\n
╔══════════════════════════════════════╗
║         🚀 BOT AERONIX AI 🚀         ║
║                                      ║
║         Made By: Cryanox             ║
║           Base By: Ryan              ║
║    WhatsApp: wa.me/6281215201077     ║
║                                      ║
╚══════════════════════════════════════╝
`);

// Versi di log disesuaikan dengan versi di banner dan menu terakhir
saveLog("SYSTEM_START", "🚀 Memulai Bot Aeronix"); 
startBot().catch((error) => { 
    saveLog("FATAL_START_ERROR", `❌🚨 Gagal memulai bot: ${error.stack || error.message}`); 
});