/*
 * Aeronix Bot
 * Made by Ryan (Original Base)
 * Modified by Cryanox/Aeronix User
 * WhatsApp: wa.me/6281215201077
 * Telegram: t.me/rxyne
 */
require("dotenv").config(); // Muat variabel dari .env ke process.env

const {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  downloadMediaMessage,
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const fs = require("fs"); // Untuk metode sinkronus
const fsPromises = require("fs").promises; // Untuk metode Promise
const path = require("path");
const qrcode = require("qrcode-terminal");
const sharp = require("sharp");
const ffmpeg = require("fluent-ffmpeg");
const pino = require("pino");
const si = require("systeminformation");
const { exec } = require("child_process");
const youtubedl = require("youtube-dl-exec");
const QRCode = require("qrcode");
const axios = require("axios");
const { Downloader } = require("@tobyg74/tiktok-api-dl");
const convertapi = require("convertapi"); // Pastikan ini diinstal: npm install convertapi
const { promisify } = require('util');
const { parseString } = require('xml2js');
const parseStringPromise = promisify(parseString);
const cron = require('node-cron'); // NEW: Import node-cron


// Deklarasi global
const processedMessages = new Set();
const TEMP_FOLDER_URL = process.env.TEMP_FOLDER_PATH || path.join(__dirname, "temp");

// --- KONFIGURASI ---
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "AIzaSyCzsYHBw_E1kDGvLDhf2-uZQ6okUwdP--k"; // Ganti dengan API Key Gemini Anda

const OWNERS_DATA_STRING =
  process.env.OWNERS_DATA_STRING ||
  "NOMOR_OWNER_1@s.whatsapp.net,Nama Owner 1|NOMOR_OWNER_2@s.whatsapp.net,Nama Owner 2";
const OWNERS_DATA = [
  { jid: "6285878143481@s.whatsapp.net", cardName: "Ryan Developer Aeronix" },
  { jid: "62888029575500@s.whatsapp.net", cardName: "Cryn Developer Aeronix" },
];

if (
  OWNERS_DATA_STRING &&
  OWNERS_DATA_STRING !==
    "NOMOR_OWNER_1@s.whatsapp.net,Nama Owner Utama|NOMOR_OWNER_2@s.whatsapp.net,Nama Owner Kedua"
) {
  OWNERS_DATA_STRING.split("|").forEach((ownerPair) => {
    const parts = ownerPair.split(",");
    if (
      parts.length === 2 &&
      parts[0].trim().includes("@s.whatsapp.net") &&
      !parts[0].trim().startsWith("NOMOR_OWNER_")
    ) {
      OWNERS_DATA.push({ jid: parts[0].trim(), cardName: parts[1].trim() });
    }
  });
}
if (OWNERS_DATA.length === 0) {
  OWNERS_DATA.push({
    jid: "6281234567890@s.whatsapp.net",
    cardName: "Owner Aeronix (Default)",
  });
  console.warn("CONFIG_WARN", "OWNERS_DATA tidak terkonfigurasi dari .env atau masih placeholder, menggunakan fallback.");
}

const SUBSCRIBED_USERS_FILE = path.join(__dirname, "./subscribed_users.json");
const USER_LIMITS_FILE = path.join(__dirname, "./user_limits.json");
const GROUP_SETTINGS_FILE = path.join(__dirname, "./group_settings.json");
const QUOTES_FILE = path.join(__dirname, "./quotes.json");
const PANTUN_FILE = path.join(__dirname, "./pantun.json");
const KEYWORDS_FILE = path.join(__dirname, "./keywords.json"); 

const MAX_HISTORY_PER_USER = 6;
const DEFAULT_DAILY_LIMIT = 7;
const AI_GROUP_PREFIX = "/aeronix"; // Atau prefix pilihan Anda
const TEMP_FOLDER = path.join(__dirname, "./temp");
const AUTH_FILE_DIR = path.join(__dirname, "auth_info_baileys");

let allQuotes = [];
let allPantun = [];
let customKeywords = {}; // Variable to store custom keywords

// NEW: AI Chat Session Management
const AI_SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes in milliseconds
const activeAISessions = new Map(); // Maps senderJid to { model: string, lastActive: number }

// NEW: BMKG Realtime Alert Configuration
const BMKG_AUTO_GEMPA_URL = "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json";
const BMKG_CHECK_INTERVAL = '*/5 * * * *'; // Every 5 minutes
const MIN_MAGNITUDE_FOR_ALERT = 3.0; // Minimum magnitude to trigger an alert
let lastSentEarthquakeUID = null; // Stores unique ID of the last sent earthquake to prevent spam

// --- PENGATURAN KEAMANAN GEMINI ---
const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
  },
];

// --- FUNGSI LOGGING ---
function getTime() {
  return new Date().toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function saveLog(type, message, isFromOwner = false) {
  let icon = "ℹ️";
  const typeUpper = type.toUpperCase();

  // Logika ikon Anda yang sudah ada
  switch (typeUpper) {
    case "SYSTEM":
    case "SYSTEM_START":
    case "SYSTEM_EXIT":
      icon = "🚀";
      break;
    case "CONNECTION":
    case "CONNECTION_CLOSE":
    case "CONNECTION_RETRY":
    case "CONNECTION_INFO":
      icon = "🔗";
      break;
    case "CONNECTION_SUCCESS":
      icon = "🎉";
      break;
    case "CONNECTION_FATAL":
      icon = "🚪";
      break;
    case "QR_EVENT":
      icon = "📱";
      break;
    case "YOUTUBE_DL":
      icon = "🎧";
      break;
    case "SYSTEM_STATUS":
      icon = "📊";
      break;
    case "TIKTOK_DL":
      icon = "🎵📹";
      break;
    case "MESSAGE_IN":
      icon = "👤💬";
      break;
    case "MESSAGE_OUT":
    case "AI_RESPONSE_SENT":
      icon = "🤖💬";
      break;
    case "AI_CHAT_REQUEST":
    case "GEMINI_CONFIG_INFO":
    case "AI_CHAT_PREPARED":
      icon = "🧠";
      break;
    case "AI_SUMMARY":
    case "AI_SUMMARY_REQUEST":
    case "AI_SUMMARY_SUCCESS":
    case "AI_SUMMARY_FAIL":
      icon = "📝";
      break;
    case "AI_PARAPHRASE":
    case "AI_PARAPHRASE_REQUEST":
    case "AI_PARAPHRASE_SUCCESS":
    case "AI_PARAPHRASE_ERROR":
      icon = "✍️";
      break;
    case "AI_IMAGE":
    case "AI_IMAGE_REQUEST":
    case "AI_IMAGE_SUCCESS":
    case "AI_IMAGE_FAIL":
    case "AI_IMAGE_ERROR":
      icon = "🎨";
      break;
    case "STICKER":
    case "STICKER_REQUEST":
    case "STICKER_SUCCESS":
    case "STICKER_ERROR":
      icon = "🖼️✨";
      break;
    case "FFMPEG_SUCCESS":
    case "FFMPEG_ERROR":
      icon = "🎞️";
      break;
    case "OWNER_CMD":
    case "OWNER_ACTION":
      icon = "👑";
      break;
    case "PREMIUM_ACCESS":
      icon = "💎";
      break;
    case "LIMIT_SYSTEM":
    case "LIMIT_USE":
      icon = "🛡️";
      break;
    case "LIMIT_REACHED":
      icon = "🚫";
      break;
    case "LIMIT_PURCHASE_INFO":
    case "SHOP_INFO":
      icon = "🪙";
      break;
    case "GROUP_EVENT":
    case "GROUP_SETTING_UPDATE":
    case "WELCOME_MSG_SENT":
      icon = "👥";
      break;
    case "BOT_STATUS_CHANGE":
      icon = "💡";
      break;
    case "FUN_FEATURE":
      icon = "🎉";
      break;
    case "ERROR":
    case "GEMINI_ERROR":
    case "STICKER_ERROR":
    case "FILESYSTEM_ERROR":
    case "SESSION_ERROR":
    case "FATAL_ERROR":
    case "AI_CHAT_FATAL_ERROR":
      icon = "❌🚨";
      break;
    case "WARN":
    case "GEMINI_WARN":
    case "CONFIG_WARN":
    case "AI_CHAT_WARN":
    case "AI_CHAT_INFO":
      icon = "⚠️";
      break;
    case "COMMAND_USED":
      icon = "▶️";
      break;
    case "DOC_CONVERT":
    case "WORDTOPDF":
    case "PDFTOWORD":
      icon = "📄";
      break;
    case "AI_IMAGE_GENERATION":
      icon = "🎨";
      break;
    case "QRCODE":
      icon = "📲";
      break;
    case "AI_SUMMARY":
    case "RINGKAS":
      icon = "📝";
      break;
    case "PREMIUM_SUBSCRIPTION":
    case "SEWABOT":
      icon = "🛍️";
      break;
    case "BENCANA_ALAM_RESPONSE": 
    case "BENCANA_ALAM_REQUEST":
      icon = "🌍";
      break;
    case "CUSTOM_KEYWORD_HIT":
        icon = "🔑";
        break;
    case "AI_CHAT_START":
        icon = "🟢";
        break;
    case "AI_CHAT_END":
        icon = "🔴";
        break;
    case "AI_CHAT_SESSION_CONTINUE":
        icon = "🔄";
        break;
    case "AI_CHAT_SESSION_EXPIRED":
        icon = "⏳";
        break;
    case "AI_CHAT_SESSION_INTERRUPTED":
        icon = "🛑";
        break;
    case "BENCANA_ALAM_ALERT": // NEW: Log type for disaster alert
        icon = "🚨";
        break;
    case "BMKG_CHECK":
        icon = "📡";
        break;
    case "BMKG_NEW_ALERT":
        icon = "🔔";
        break;
  }

  // Tambahkan prefix owner jika isFromOwner true
  const ownerPrefix = isFromOwner ? "👑OWNER👑 " : "";

  const logMessage = `[${new Date().toISOString()}] [${getTime()}] ${icon} ${type}: ${ownerPrefix}${message}\n`;
  try {
    fs.appendFileSync(path.join(__dirname, "bot.log"), logMessage, "utf-8");
  } catch (err) {
    console.error(`${getTime()} Gagal menulis ke bot.log: ${err.message}`);
  }
  console.log(`${icon} [${getTime()}] ${type}: ${ownerPrefix}${message}`);
}

// --- INISIALISASI KLIEN GEMINI ---
let genAI = null;
if (
  GEMINI_API_KEY === "MASUKKAN_API_KEY_GEMINI_ANDA_DI_SINI" ||
  !GEMINI_API_KEY ||
  GEMINI_API_KEY.trim() === ""
) {
  saveLog(
    "GEMINI_CONFIG_ERROR",
    "API Key Gemini adalah placeholder/kosong. AI dinonaktifkan."
  );
} else {
  try {
    genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    if (genAI && typeof genAI.getGenerativeModel === "function") {
      saveLog(
        "GEMINI_CONFIG_SUCCESS",
        "Klien Gemini AI BERHASIL diinisialisasi."
      );
    } else {
      genAI = null;
    }
  } catch (initializationError) {
    saveLog(
      "GEMINI_CONFIG_FATAL_ERROR",
      `GAGAL TOTAL saat menginisialisasi GoogleGenerativeAI: ${initializationError.message}`
    );
    genAI = null;
  }
}

if (OWNERS_DATA.some((owner) => owner.jid.startsWith("NOMOR_OWNER_"))) {
  saveLog(
    "CONFIG_WARN",
    "⚠️ Salah satu JID di OWNERS_DATA mungkin masih menggunakan placeholder 'NOMOR_OWNER_'. Harap perbarui di file .env atau di kode."
  );
} else if (OWNERS_DATA.length === 0) {
  saveLog(
    "CONFIG_WARN",
    "⚠️ Array OWNERS_DATA kosong. Pastikan JID Owner sudah terkonfigurasi dengan benar di .env atau kode."
  );
}

// --- INISIALISASI KLIEN CONVERTAPI ---
const CONVERTAPI_SECRET = process.env.CONVERTAPI_SECRET || "YOUR_CONVERTAPI_SECRET_HERE"; // Ganti dengan secret Anda
let convertApi = null;
if (CONVERTAPI_SECRET && CONVERTAPI_SECRET !== "YOUR_CONVERTAPI_SECRET_HERE") {
    try {
        convertApi = convertapi(CONVERTAPI_SECRET);
        saveLog("SYSTEM", "✅ ConvertAPI client BERHASIL diinisialisasi.");
    }
    catch (e) { // Changed 'initializationError' to 'e' for consistency
        saveLog("ERROR", `❌ Gagal menginisialisasi ConvertAPI: ${e.message}`);
    }
} else {
    saveLog("CONFIG_WARN", "⚠️ ConvertAPI secret tidak terkonfigurasi. Fitur konversi dokumen dinonaktifkan.");
}


// --- FUNGSI HELPER (Gemini, JSON, Limit) ---

// Fungsi untuk memanggil Gemini API
async function callGeminiAPI(promptText, chatHistory = []) {
  if (!genAI) {
    saveLog("GEMINI_CALL_ERROR", "callGeminiAPI: genAI tidak terinisialisasi.");
    return "Maaf, layanan AI Gemini sedang tidak aktif karena masalah konfigurasi API Key atau kesalahan internal.";
  }
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash-latest",
      safetySettings,
    });
    // Format history untuk Gemini API
    const geminiHistory = chatHistory.map((item) => ({
      role: item.role === "user" ? "user" : "model",
      parts: [{ text: item.content }],
    }));

    const chat = model.startChat({
      history: geminiHistory,
      generationConfig: { maxOutputTokens: 1500 },
    });

    const result = await chat.sendMessage(promptText);
    const response = result.response;

    if (response.promptFeedback && response.promptFeedback.blockReason) {
      saveLog(
        "GEMINI_WARN",
        `Respons Gemini diblokir: ${response.promptFeedback.blockReason}`
      );
      return `Maaf, respons diblokir karena alasan keamanan konten (${response.promptFeedback.blockReason}). Coba ajukan pertanyaan lain.`;
    }
    const responseText = response.text();
    return responseText;
  } catch (error) {
    saveLog(
      "GEMINI_ERROR",
      `Error saat memanggil Gemini API: ${error.message}`
    );
    if (error.message.includes("API key not valid"))
      return "Maaf, API Key Gemini tidak valid atau salah konfigurasi.";
    if (
      error.message.includes("429") ||
      /quota|resource.*exhausted/i.test(error.message)
    )
      return "Maaf, batas penggunaan API Gemini telah tercapai.";
    if (
      error.response &&
      error.response.data &&
      error.response.data.error &&
      error.response.data.error.message
    ) {
      saveLog(
        "GEMINI_ERROR_DETAIL",
        `Detail Error Gemini: ${error.response.data.error.message}`
      );
      return `Maaf, terjadi kesalahan dari sisi AI Gemini: ${error.response.data.error.message.substring(
        0,
        100
      )}`;
    }
    return "Maaf, terjadi gangguan tak terduga dengan AI Gemini.";
  }
}

const chatHistories = new Map(); // Stores chat history: senderJid -> array of {role, content}

function loadJSON(f, d = null) {
  try {
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf-8"));
  } catch (e) {
    saveLog("FILESYSTEM_ERROR", `Load ${f}: ${e.message}`);
  }
  return d === null ? (f.includes("users") ? [] : {}) : d;
}
function saveJSON(f, d) {
  try {
    fs.writeFileSync(f, JSON.stringify(d, null, 2), "utf-8");
  } catch (e) {
    saveLog("FILESYSTEM_ERROR", `Save ${f}: ${e.message}`);
  }
}
function isUserSubscribed(uid) {
  return loadJSON(SUBSCRIBED_USERS_FILE, []).includes(uid);
}
function checkAndDecrementLimit(uid, cmd, limit) {
  if (isUserOwner(uid) || isUserSubscribed(uid)) {
    saveLog(
      "LIMIT_SYSTEM",
      `👑 Akses tanpa limit untuk ${uid.split("@")[0]} (${
        isUserOwner(uid) ? "Owner" : "Subscribed"
      }) pada ${cmd}.`
    );
    return { canUse: true, remaining: Infinity, used: 0 };
  }
  let lData = loadJSON(USER_LIMITS_FILE, {});
  const today = new Date().setHours(0, 0, 0, 0);
  if (!lData[uid]) lData[uid] = {};
  if (!lData[uid][cmd] || lData[uid][cmd].lastReset < today) {
    lData[uid][cmd] = { count: 0, lastReset: today };
    saveLog(
      "LIMIT_SYSTEM",
      `♻️ Limit ${cmd} direset untuk ${uid.split("@")[0]}`
    );
  }

  if (lData[uid][cmd].count < limit) {
    lData[uid][cmd].count++;
    saveJSON(USER_LIMITS_FILE, lData);
    saveLog(
      "LIMIT_USE",
      `🛡️ Limit ${cmd} (${lData[uid][cmd].count}/${limit}) untuk ${
        uid.split("@")[0]
      }`
    );
    return {
      canUse: true,
      remaining: limit - lData[uid][cmd].count,
      used: lData[uid][cmd].count,
    };
  } else {
    saveLog(
      "LIMIT_REACHED",
      `🚫 Limit ${cmd} habis untuk ${uid.split("@")[0]}`
    );
    return { canUse: false, remaining: 0, used: lData[uid][cmd].count };
  }
}
function getGroupSetting(gid, key, dv = null) {
  const s = loadJSON(GROUP_SETTINGS_FILE, {});
  if (s[gid] && typeof s[gid][key] !== "undefined") return s[gid][key];
  return dv;
}
function setGroupSetting(gid, key, v) {
  let s = loadJSON(GROUP_SETTINGS_FILE, {});
  if (!s[gid]) s[gid] = {};
  s[gid][key] = v;
  saveJSON(GROUP_SETTINGS_FILE, s);
  saveLog(
    "GROUP_SETTING_UPDATE",
    `⚙️ Set grup ${gid.split("@")[0]} '${key}' jadi '${v}'.`
  );
}

async function downloadTikTokMedia(tiktokUrl, requestedFormat = "video") {
  saveLog(
    "TIKTOK_DL_DEBUG",
    `Memulai proses untuk URL: ${tiktokUrl}, Format: ${requestedFormat}`
  );
  try {
    const apiResult = await Downloader(tiktokUrl, {
      noWaterMark: true,
      hd: requestedFormat === "video",
    });

    saveLog(
      "DEBUG_TIKTOK_API_RESULT",
      `Hasil mentah dari Downloader: ${JSON.stringify(apiResult, null, 2)}`
    );

    if (apiResult && apiResult.status === "success" && apiResult.result) {
      const resultData = apiResult.result;
      let mediaUrl = null;
      let mimetype = "";
      let fileNameSuffix = "";
      let videoDescription = resultData.desc || "Konten TikTok";
      let videoId = resultData.id || Date.now();

      if (requestedFormat === "video") {
        if (resultData.type === "video" && resultData.video) {
          if (
            resultData.video.playAddr &&
            resultData.video.playAddr.length > 0
          ) {
            mediaUrl = resultData.video.playAddr[0];
          } else if (
            resultData.video.downloadAddr &&
            resultData.video.downloadAddr.length > 0
          ) {
            mediaUrl = resultData.video.downloadAddr[0];
          }

          if (mediaUrl) {
            saveLog(
              "TIKTOK_DL_INFO",
              "Menggunakan playAddr/downloadAddr. Video mungkin memiliki watermark."
            );
            mimetype = "video/mp4";
            fileNameSuffix = ".mp4";
            return {
              success: true,
              mediaType: "video",
              mediaUrl: mediaUrl,
              description: videoDescription,
              fileName: `tiktok_video_${videoId}${fileNameSuffix}`,
            };
          } else {
            return {
              success: false,
              error:
                "Tidak menemukan link video (playAddr/downloadAddr) yang valid.",
            };
          }
        } else if (
          resultData.type === "image" &&
          resultData.images &&
          resultData.images.length > 0
        ) {
          return {
            success: true,
            mediaType: "image",
            mediaUrl: resultData.images[0],
            description: videoDescription + " (Slideshow)",
            fileName: `tiktok_image_${videoId}.jpeg`,
          };
        } else {
          return {
            success: false,
            error:
              "Tipe konten tidak dikenali sebagai video atau slideshow gambar.",
          };
        }
      } else if (requestedFormat === "audio") {
        if (
          resultData.music &&
          resultData.music.playUrl &&
          resultData.music.playUrl.length > 0
        ) {
          mediaUrl = resultData.music.playUrl[0];
          mimetype = "audio/mpeg";
          fileNameSuffix = ".mp3";
          saveLog(
            "TIKTOK_DL_INFO",
            `Menggunakan playUrl musik untuk audio: ${mediaUrl}`
          );
          return {
            success: true,
            mediaType: "audio",
            mediaUrl: mediaUrl,
            description: videoDescription + " (Audio Latar)",
            fileName: `tiktok_audio_${videoId}${fileNameSuffix}`,
          };
        } else if (
          resultData.type === "video" &&
          resultData.video &&
          ((resultData.video.playAddr &&
            resultData.video.playAddr.length > 0) ||
            (resultData.video.downloadAddr &&
              resultData.video.downloadAddr.length > 0))
        ) {
          saveLog(
            "TIKTOK_DL_INFO",
            `Tidak ada link audio langsung. Akan mengirim info video (from play/downloadAddr) untuk konversi ke MP3.`
          );
          return {
            success: true,
            needsConversion: true,
            mediaType: "video_for_audio",
            mediaUrl:
              resultData.video.playAddr && resultData.video.playAddr.length > 0
                ? resultData.video.playAddr[0]
                : resultData.video.downloadAddr[0],
            description: videoDescription,
            fileName: `tiktok_video_for_audio_${videoId}.mp4`,
          };
        } else {
          return {
            success: false,
            error:
              "Tidak ditemukan sumber audio atau video untuk diekstrak audionya.",
          };
        }
      }
      return {
        success: false,
        error: "Format permintaan tidak dikenal atau data tidak lengkap.",
      };
    } else {
      saveLog(
        "TIKTOK_DL_ERROR_HELPER",
        `Struktur respons dari Downloader tidak sesuai harapan atau status bukan success: ${JSON.stringify(
          apiResult
        )}`
      );
      let errorMessage =
        "Respons API TikTok (Downloader) tidak valid atau gagal.";
      if (apiResult && typeof apiResult.message === "string") {
        errorMessage = apiResult.message;
      } else if (apiResult && typeof apiResult === "string") {
        errorMessage = apiResult;
      }
      return { success: false, error: errorMessage };
    }
  } catch (error) {
    saveLog(
      "TIKTOK_DL_ERROR_HELPER",
      `❌ Error di helper downloadTikTokMedia dengan Downloader: ${error.message} \nStack: ${error.stack}`
    );
    if (
      error.message.toLowerCase().includes("is not a function") ||
      error.message.toLowerCase().includes("is not a constructor")
    ) {
      return {
        success: false,
        error:
          "Fungsi Downloader TikTok tidak terdefinisi dengan benar. Periksa impor library.",
      };
    }
    return {
      success: false,
      error: `Kesalahan internal saat memproses: ${error.message.substring(
        0,
        100
      )}`,
    };
  }
}
function isUserOwner(userId) {
  if (!Array.isArray(OWNERS_DATA)) {
    saveLog(
      "CONFIG_WARN",
      "Variabel OWNERS_DATA bukan array atau tidak terdefinisi saat isUserOwner dipanggil."
    );
    return false;
  }
  return OWNERS_DATA.some((owner) => owner.jid === userId);
}


// NEW: Function to load custom keywords (if you are using it)
function loadKeywords() {
    try {
        if (fs.existsSync(KEYWORDS_FILE)) {
            customKeywords = loadJSON(KEYWORDS_FILE, {}); // Use loadJSON here
            saveLog("SYSTEM", `✅ Custom keywords loaded from ${KEYWORDS_FILE}.`);
        } else {
            saveJSON(KEYWORDS_FILE, {}); // Create empty file if not exists
            saveLog("SYSTEM_WARN", `⚠️ ${KEYWORDS_FILE} not found. Creating a new one.`);
        }
    } catch (e) {
        saveLog("FILESYSTEM_ERROR", `❌ Gagal memuat ${KEYWORDS_FILE}: ${e.message}`);
        customKeywords = {};
    }
}
// Panggil di awal bot untuk memuat keyword
loadKeywords();

// --- Data Bencana Alam (Hardcoded dari CSV) ---
// Data yang diekstrak dari "Jumlah Korban Tanah Longsor Menurut Kabupaten_Kota di Provinsi Jawa Tengah, 2020.csv"
const dataLongsor2020 = {
    "provinsi": {
        "meninggal_hilang": 17,
        "luka_luka": 22,
        "terdampak_mengungsi": 11159
    },
    "kabupaten": [
        { "nama": "Kabupaten Cilacap", "meninggal_hilang": 0, "luka_luka": 1, "terdampak_mengungsi": 7435 },
        { "nama": "Kabupaten Banyumas", "meninggal_hilang": 5, "luka_luka": 0, "terdampak_mengungsi": 141 },
        { "nama": "Kabupaten Purbalingga", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 1316 },
        { "nama": "Kabupaten Banjarnegara", "meninggal_hilang": 0, "luka_luka": 4, "terdampak_mengungsi": 422 },
        { "nama": "Kabupaten Kebumen", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 45 },
        { "nama": "Kabupaten Purworejo", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 15 },
        { "nama": "Kabupaten Wonosobo", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Magelang", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 28 },
        { "nama": "Kabupaten Boyolali", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Klaten", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Sukoharjo", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Wonogiri", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Karanganyar", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 28 },
        { "nama": "Kabupaten Sragen", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Grobogan", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Blora", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Rembang", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Pati", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Kudus", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Jepara", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Demak", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Semarang", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 21 },
        { "nama": "Kabupaten Temanggung", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 20 },
        { "nama": "Kabupaten Kendal", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        { "nama": "Kabupaten Batang", "meninggal_hilang": 0, "luka_luka": 0, "terdampak_mengungsi": 0 },
        {"nama": "Pekalongan", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 3, "banjir": 2, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Pemalang", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 1, "kebakaran_hutan_lahan": 2, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Tegal", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 1, "kebakaran_hutan_lahan": 4, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Brebes", "gempa_bumi": 2, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 1, "kekeringan": 3, "kebakaran_hutan_lahan": 13, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Magelang", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Surakarta", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Salatiga", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Semarang", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Pekalongan", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Tegal", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0}
    ]
};

// Data yang diekstrak dari "Jumlah Kejadian Bencana Alam Menurut Kabupaten_Kota di Provinsi Jawa Tengah, 2023.csv"
const dataBencana2023 = {
    "provinsi": { // Ini adalah total provinsi
        "gempa_bumi": 14,
        "tsunami": 0,
        "gempa_bumi_tsunami": 0,
        "letusan_gunung_api": 4,
        "tanah_longsor": 250,
        "banjir": 190,
        "kekeringan": 70,
        "kebakaran_hutan_lahan": 409,
        "cuaca_ekstrem": 342,
        "gelombang_pasang_abrasi": 0
    },
    "kabupaten": [
        {"nama": "Cilacap", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 4, "banjir": 2, "kekeringan": 7, "kebakaran_hutan_lahan": 20, "cuaca_ekstrem": 12, "gelombang_pasang_abrasi": 0},
        {"nama": "Banyumas", "gempa_bumi": 1, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 8, "banjir": 2, "kekeringan": 4, "kebakaran_hutan_lahan": 7, "cuaca_ekstrem": 4, "gelombang_pasang_abrasi": 0},
        {"nama": "Purbalingga", "gempa_bumi": 1, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 2, "banjir": 4, "kekeringan": 1, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 4, "gelombang_pasang_abrasi": 0},
        {"nama": "Banjarnegara", "gempa_bumi": 1, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 10, "banjir": 1, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 2, "gelombang_pasang_abrasi": 0},
        {"nama": "Kebumen", "gempa_bumi": 1, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 3, "banjir": 1, "kekeringan": 0, "kebakaran_hutan_lahan": 1, "cuaca_ekstrem": 4, "gelombang_pasang_abrasi": 0},
        {"nama": "Purworejo", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 1, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 2, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Wonosobo", "gempa_bumi": 1, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 1, "banjir": 1, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Magelang", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 1, "tanah_longsor": 5, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 2, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Boyolali", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 1, "tanah_longsor": 1, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 1, "cuaca_ekstrem": 2, "gelombang_pasang_abrasi": 0},
        {"nama": "Klaten", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 1, "banjir": 2, "kekeringan": 1, "kebakaran_hutan_lahan": 5, "cuaca_ekstrem": 11, "gelombang_pasang_abrasi": 0},
        {"nama": "Sukoharjo", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 1, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 4, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Wonogiri", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 1, "kebakaran_hutan_lahan": 2, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Karanganyar", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 1, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 6, "cuaca_ekstrem": 3, "gelombang_pasang_abrasi": 0},
        {"nama": "Sragen", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 1, "kekeringan": 0, "kebakaran_hutan_lahan": 3, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Grobogan", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 1, "banjir": 2, "kekeringan": 0, "kebakaran_hutan_lahan": 2, "cuaca_ekstrem": 3, "gelombang_pasang_abrasi": 0},
        {"nama": "Blora", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 2, "kekeringan": 1, "kebakaran_hutan_lahan": 15, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Rembang", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 1, "kekeringan": 2, "kebakaran_hutan_lahan": 17, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Pati", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 2, "banjir": 5, "kekeringan": 0, "kebakaran_hutan_lahan": 5, "cuaca_ekstrem": 5, "gelombang_pasang_abrasi": 0},
        {"nama": "Kudus", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 1, "banjir": 1, "kekeringan": 0, "kebakaran_hutan_lahan": 3, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Jepara", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 2, "banjir": 1, "kekeringan": 0, "kebakaran_hutan_lahan": 2, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Demak", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 1, "kekeringan": 0, "kebakaran_hutan_lahan": 5, "cuaca_ekstrem": 3, "gelombang_pasang_abrasi": 0},
        {"nama": "Semarang", "gempa_bumi": 1, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 2, "banjir": 3, "kekeringan": 0, "kebakaran_hutan_lahan": 1, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Temanggung", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Kendal", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 1, "banjir": 3, "kekeringan": 0, "kebakaran_hutan_lahan": 1, "cuaca_ekstrem": 2, "gelombang_pasang_abrasi": 0},
        {"nama": "Batang", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 1, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 2, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Pekalongan", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 3, "banjir": 2, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Pemalang", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 1, "kebakaran_hutan_lahan": 2, "cuaca_ekstrem": 1, "gelombang_pasang_abrasi": 0},
        {"nama": "Tegal", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 1, "kebakaran_hutan_lahan": 4, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Brebes", "gempa_bumi": 2, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 1, "kekeringan": 3, "kebakaran_hutan_lahan": 13, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Magelang", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Surakarta", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Salatiga", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Semarang", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Pekalongan", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "Kota Tegal", "gempa_bumi": 0, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 0, "tanah_longsor": 0, "banjir": 0, "kekeringan": 0, "kebakaran_hutan_lahan": 0, "cuaca_ekstrem": 0, "gelombang_pasang_abrasi": 0},
        {"nama": "PROVINSI JAWA TENGAH", "gempa_bumi": 12, "tsunami": 0, "gempa_bumi_tsunami": 0, "letusan_gunung_api": 3, "tanah_longsor": 125, "banjir": 95, "kekeringan": 31, "kebakaran_hutan_lahan": 204, "cuaca_ekstrem": 171, "gelombang_pasang_abrasi": 0}
    ]
};
// --- Akhir Data Bencana Alam ---

// --- AWAL FUNGSI HANDLE BENCANA ALAM ALERT (Keyword-based 'Siaga/Waspada') ---
async function handleBencanaAlamAlert(sock, from, msg, queryText, senderJid) {
    const lowerQuery = queryText.toLowerCase();
    let alertMessage = "";
    let triggered = false;

    const disasterAlerts = {
        "banjir": "⚠️ *SIAGA BANJIR!* Jika di daerah Anda sedang terjadi hujan lebat atau tanda-tanda banjir, segera amankan dokumen penting, matikan listrik, dan evakuasi ke tempat yang lebih tinggi jika diperlukan. Tetap ikuti informasi dari pihak berwenang.",
        "longsor": "⚠️ *WASPADAI TANAH LONGSOR!* Jika Anda berada di lereng bukit atau area rawan longsor, segera cari tempat aman saat hujan deras atau retakan tanah muncul. Pantau kondisi lingkungan sekitar dan jauhi area yang berpotensi longsor.",
        "tanah longsor": "⚠️ *WASPADAI TANAH LONGSOR!* Jika Anda berada di lereng bukit atau area rawan longsor, segera cari tempat aman saat hujan deras atau retakan tanah muncul. Pantau kondisi lingkungan sekitar dan jauhi area yang berpotensi longsor.",
        "gempa": "⚡ *SIAGA GEMPA BUMI!* Jika terjadi gempa, berlindunglah di bawah meja kokoh atau di dekat dinding dalam. Jauhi jendela dan benda yang bisa jatuh. Setelah guncangan berhenti, segera keluar ke tempat terbuka. Tetap tenang!",
        "tsunami": "🌊 *WASPADAI TSUNAMI!* Jika Anda berada di pesisir dan merasakan gempa kuat atau melihat air laut surut tiba-tiba, segera evakuasi ke tempat yang lebih tinggi dan aman. Jangan kembali sebelum ada pemberitahuan resmi.",
        "cuaca ekstrem": "🌪️ *WASPADAI CUACA EKSTREM!* Angin kencang, hujan badai, atau puting beliung mungkin terjadi. Amankan barang-barang di luar ruangan, hindari berteduh di bawah pohon besar atau papan reklame. Tetap di dalam ruangan jika memungkinkan.",
        "kebakaran hutan": "🔥 *SIAGA KEBAKARAN HUTAN/LAHAN!* Hindari membakar sampah sembarangan. Jika melihat api, segera laporkan ke pihak berwenang. Lindungi diri dari asap dan ikuti instruksi evakuasi jika diperlukan.",
        "gunung meletus": "🌋 *WASPADAI LETUSAN GUNUNG API!* Jika Anda berada di area gunung berapi aktif, tetap pantau status gunung dari PVMBG. Waspadai abu vulkanik dan ikuti instruksi evakuasi jika ada peringatan dini."
    };

    for (const keyword in disasterAlerts) {
        if (lowerQuery.includes(keyword)) {
            alertMessage = disasterAlerts[keyword];
            triggered = true;
            break;
        }
    }

    if (triggered) {
        saveLog("BENCANA_ALAM_ALERT", `🚨 Notifikasi siaga/waspada (${lowerQuery}) dikirim ke ${senderJid.split('@')[0]}.`);
        await sock.sendMessage(from, { text: alertMessage }, { quoted: msg });
        return true; // Indicate that an alert was sent
    }
    return false; // Indicate no alert was sent
}
// --- AKHIR FUNGSI HANDLE BENCANA ALAM ALERT ---


// --- AWAL FUNGSI HANDLE BENCANA ALAM DATA (PREVIOUSLY /BENCANA COMMAND) ---
async function handleBencanaAlam(sock, from, msg, queryText, senderJid, isOwner) {
    // Cegah duplikasi pesan
    const messageKey = `${from}:${senderJid}:${queryText}:${msg.key.id}`;
    if (processedMessages.has(messageKey)) {
        saveLog("DEBUG", `Pesan duplikat terdeteksi untuk /bencana: ${messageKey}`);
        return;
    }
    processedMessages.add(messageKey);
    setTimeout(() => processedMessages.delete(messageKey), 10000); // Hapus setelah 10 detik

    const limit = { canUse: true, remaining: Infinity }; // Fitur ini tanpa limit
    if (isOwner) { // Owner still gets logged as unlimited access
        saveLog("LIMIT_SYSTEM", `👑 Akses tanpa limit untuk owner ${senderJid.split("@")[0]} pada bencanaAlam.`);
    } else {
        saveLog("LIMIT_SYSTEM", `🌍 Fitur bencanaAlam (tanpa limit) diakses oleh ${senderJid.split("@")[0]}.`);
    }

    saveLog("COMMAND_USED", `🌍 ${senderJid.split('@')[0]} meminta informasi bencana: "${queryText}"`, isOwner);
    await sock.sendPresenceUpdate("composing", from);
    await sock.sendMessage(from, { text: "⏳ Sedang mencari informasi bencana alam, mohon tunggu..." }, { quoted: msg });

    let response = "🌍 *INFORMASI BENCANA ALAM* 🌍\n\n";
    const lowerQuery = queryText.toLowerCase();
    let foundInfo = false;

    const findMatchingCity = (query, dataArray) => {
        const queryParts = query.split(' ').map(p => p.trim()).filter(Boolean);
        for (const cityData of dataArray) {
            const cityNameLower = cityData.nama.toLowerCase();
            if (queryParts.some(part => cityNameLower.includes(part))) {
                return cityData;
            }
        }
        return null;
    };

    if (lowerQuery.includes("2020") || (lowerQuery.includes("longsor") && !lowerQuery.includes("2023"))) {
        response += "*Data Tanah Longsor Provinsi Jawa Tengah 2020:*\n";
        response += `  - Total Meninggal/Hilang: *${dataLongsor2020.provinsi.meninggal_hilang}* orang\n`;
        response += `  - Total Luka-Luka: *${dataLongsor2020.provinsi.luka_luka}* orang\n`;
        response += `  - Total Terdampak/Mengungsi: *${dataLongsor2020.provinsi.terdampak_mengungsi}* orang\n`;

        const cityMatch = findMatchingCity(lowerQuery, dataLongsor2020.kabupaten);
        if (cityMatch) {
            response += `\n*Detail ${cityMatch.nama} (2020):*\n`;
            response += `  - Meninggal/Hilang: ${cityMatch.meninggal_hilang}\n`;
            response += `  - Luka-Luka: ${cityMatch.luka_luka}\n`;
            response += `  - Terdampak/Mengungsi: ${cityMatch.terdampak_mengungsi}\n`;
            foundInfo = true;
        } else {
            response += `\nUntuk detail per kabupaten/kota, sebutkan nama kabupaten/kota. Contoh: "/bencana longsor Banyumas 2020"\n`;
            foundInfo = true;
        }
    }

    if (lowerQuery.includes("2023") || (!lowerQuery.includes("2020") && (lowerQuery.includes("bencana") || lowerQuery.includes("gempa") || lowerQuery.includes("banjir") || lowerQuery.includes("kekeringan") || lowerQuery.includes("kebakaran") || lowerQuery.includes("cuaca") || lowerQuery.includes("longsor")))) {
        if (foundInfo) response += "\n\n";
        response += "*Data Kejadian Bencana Alam Provinsi Jawa Tengah 2023:*\n";
        let disasterFoundInQuery = false;

        const disasterTypesMap = {
            "gempa bumi": "gempa_bumi",
            "tsunami": "tsunami",
            "gempa bumi dan tsunami": "gempa_bumi_tsunami",
            "letusan gunung api": "letusan_gunung_api",
            "tanah longsor": "tanah_longsor",
            "longsor": "tanah_longsor", // Alias for tanah longsor
            "banjir": "banjir",
            "kekeringan": "kekeringan",
            "kebakaran hutan dan lahan": "kebakaran_hutan_lahan",
            "kebakaran hutan": "kebakaran_hutan_lahan", // Alias
            "cuaca ekstrem": "cuaca_ekstrem",
            "gelombang pasang dan abrasi": "gelombang_pasang_abrasi",
            "gelombang pasang": "gelombang_pasang_abrasi", // Alias
            "abrasi": "gelombang_pasang_abrasi" // Alias
        };

        let selectedDisasterType = null;
        for (const keyword in disasterTypesMap) {
            if (lowerQuery.includes(keyword)) {
                selectedDisasterType = disasterTypesMap[keyword];
                disasterFoundInQuery = true;
                break;
            }
        }

        const cityMatch = findMatchingCity(lowerQuery, dataBencana2023.kabupaten);

        if (selectedDisasterType) {
            const displayName = Object.keys(disasterTypesMap).find(key => disasterTypesMap[key] === selectedDisasterType) || selectedDisasterType.replace(/_/g, ' ');
            
            if (cityMatch && cityMatch.nama !== "PROVINSI JAWA TENGAH") {
                const count = cityMatch[selectedDisasterType];
                if (count !== undefined && count !== null) {
                    response += `  - *${displayName.toUpperCase()}* di *${cityMatch.nama}*: *${count}* kejadian\n`;
                    foundInfo = true;
                } else {
                    response += `  - Data untuk *${displayName.toUpperCase()}* di *${cityMatch.nama}* tidak tersedia.\n`;
                    foundInfo = true;
                }
            } else {
                const count = dataBencana2023.provinsi[selectedDisasterType];
                if (count !== undefined && count !== null) {
                    response += `  - *Total ${displayName.toUpperCase()}* se-Jawa Tengah: *${count}* kejadian\n`;
                    foundInfo = true;
                }
            }
        } else if (!disasterFoundInQuery && (lowerQuery.includes("bencana") || lowerQuery.includes("informasi") || lowerQuery.includes("data") || lowerQuery.includes("kejadian"))) {
            response += `  - Total Gempa Bumi: ${dataBencana2023.provinsi.gempa_bumi} kejadian\n`;
            response += `  - Total Letusan Gunung Api: ${dataBencana2023.provinsi.letusan_gunung_api} kejadian\n`;
            response += `  - Total Tanah Longsor: ${dataBencana2023.provinsi.tanah_longsor} kejadian\n`;
            response += `  - Total Banjir: ${dataBencana2023.provinsi.banjir} kejadian\n`;
            response += `  - Total Kekeringan: ${dataBencana2023.provinsi.kekeringan} kejadian\n`;
            response += `  - Total Kebakaran Hutan dan Lahan: ${dataBencana2023.provinsi.kebakaran_hutan_lahan} kejadian\n`;
            response += `  - Total Cuaca Ekstrem: ${dataBencana2023.provinsi.cuaca_ekstrem} kejadian\n`;
            response += `\nUntuk detail per kabupaten/kota atau jenis bencana, sebutkan lebih spesifik. Contoh: "/bencana banjir Semarang 2023" atau "/bencana kebakaran hutan 2023".\n`;
            foundInfo = true;
        }

        if (!foundInfo) {
             response += `Tidak ada informasi spesifik yang ditemukan untuk pertanyaan Anda di tahun 2023.`;
        }
    }


    if (!foundInfo) {
        response = `❓ Maaf, saya tidak dapat menemukan informasi bencana alam spesifik untuk permintaan Anda.
Coba format pertanyaan seperti:
- "/bencana longsor 2020"
- "/bencana banjir 2023"
- "/bencana tanah longsor Banyumas 2020"
- "/bencana kebakaran hutan 2023"
- "/bencana gempa bumi Brebes 2023"
        `;
    }

    await sock.sendMessage(from, { text: response.trim() }, { quoted: msg });
    saveLog("BENCANA_ALAM_RESPONSE", `✅ Info bencana dikirim ke ${senderJid.split('@')[0]}.`, isOwner);

    await sock.sendPresenceUpdate("available", from);
}
// --- AKHIR FUNGSI HANDLE BENCANA ALAM ---


// --- FUNGSI UTAMA BOT ---
async function startBot() {
  if (fs.existsSync(AUTH_FILE_DIR)) {
    try {
      const files = fs.readdirSync(AUTH_FILE_DIR);
      if (files.length === 0) {
        saveLog(
          "SESSION_WARN",
          `Folder sesi '${AUTH_FILE_DIR}' kosong, menghapus...`
        );
        fs.rmSync(AUTH_FILE_DIR, { recursive: true, force: true });
      }
    } catch (error) {
      saveLog(
        "SESSION_ERROR",
        `Gagal memvalidasi folder sesi '${AUTH_FILE_DIR}': ${error.message}`
      );
      fs.rmSync(AUTH_FILE_DIR, { recursive: true, force: true });
    }
  }
  if (!fs.existsSync(SUBSCRIBED_USERS_FILE))
    saveJSON(SUBSCRIBED_USERS_FILE, []);
  if (!fs.existsSync(USER_LIMITS_FILE)) saveJSON(USER_LIMITS_FILE, {});
  if (!fs.existsSync(TEMP_FOLDER)) {
    try {
      fs.mkdirSync(TEMP_FOLDER, { recursive: true });
      saveLog("SYSTEM", `✅ Folder '${TEMP_FOLDER}' berhasil dibuat.`);
    } catch (e) {
      saveLog(
        "FILESYSTEM_ERROR",
        `❌ Gagal membuat folder '${TEMP_FOLDER}': ${e.message}`
      );
    }
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FILE_DIR);
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: "silent" }),
    browser: ["AeronixBot", "Chrome", "3.0.0"],
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
      const statusCode =
        lastDisconnect.error instanceof Boom
          ? lastDisconnect.error.output.statusCode
          : 500;
      let shouldReconnect = false;
      if (lastDisconnect.error instanceof Boom) {
        shouldReconnect =
          statusCode !== DisconnectReason.loggedOut &&
          statusCode !== DisconnectReason.connectionReplaced &&
          statusCode !== DisconnectReason.multideviceMismatch &&
          statusCode !== DisconnectReason.timedOut;
      } else {
        shouldReconnect = true;
      }

      if (
        statusCode === DisconnectReason.loggedOut ||
        statusCode === DisconnectReason.connectionReplaced ||
        statusCode === DisconnectReason.multideviceMismatch
      ) {
        saveLog(
          "CONNECTION_FATAL",
          `🚪 Koneksi ditutup permanen (${
            DisconnectReason[statusCode] || statusCode
          }). Hapus folder sesi '${AUTH_FILE_DIR}' dan scan ulang QR.`
        );
      } else if (shouldReconnect) {
        saveLog(
          "CONNECTION_RETRY",
          `🔌❌ Koneksi ditutup: ${
            lastDisconnect.error
              ? lastDisconnect.error.message
              : "Alasan tidak diketahui"
          }. Mencoba menghubungkan ulang...`
        );
        startBot();
      } else {
        saveLog(
          "CONNECTION_ERROR",
          `🔌❌ Koneksi ditutup: ${
            lastDisconnect.error
              ? lastDisconnect.error.message
              : "Alasan tidak diketahui"
          }. Tidak mencoba reconnect otomatis.`
        );
      }
    }
    // connection terminal
    else if (connection === "open") {
      saveLog("CONNECTION_SUCCESS", "🎉 BOT AERONIX (Flash-2.0) TERHUBUNG!");
    } else if (connection === "connecting") {
      saveLog("CONNECTION_INFO", "🔄 Menyambungkan ke WhatsApp...");
    }
  });

  // ================================================================================================
  // ============================ AWAL EVENT HANDLER PESAN MASUK ====================================
  // ================================================================================================
  sock.ev.on("messages.upsert", async (m) => {
    const msg = m.messages[0];
    if (
      !msg.message ||
      msg.key.fromMe ||
      msg.key.remoteJid === "status@broadcast"
    )
      return;

    const from = msg.key.remoteJid; // JID chat (bisa JID user atau JID grup)
    const isGroup = from.endsWith("@g.us");

    // Mengambil JID asli pengirim pesan
    const senderJid = isGroup
      ? msg.key.participant || msg.author || from
      : from;
    saveLog(
      "DEBUG_JID",
      `Received message. From: ${from}, IsGroup: ${isGroup}, SenderJID (participant): ${msg.key.participant}, SenderJID (author): ${msg.author}, Final SenderJid: ${senderJid}`
    );
    // Untuk chat personal, senderJid akan sama dengan 'from'.

    let text =
      msg.message.conversation ||
      msg.message.extendedTextMessage?.text ||
      msg.message.imageMessage?.caption ||
      msg.message.videoMessage?.caption ||
      "";
    const senderName = msg.pushName || senderJid.split("@")[0] || "Pengguna";

    let logText = text;
    if (!logText) {
      if (msg.message.imageMessage) logText = "[Pesan Gambar]";
      else if (msg.message.videoMessage) logText = "[Pesan Video/GIF]";
      else if (msg.message.stickerMessage) logText = "[Pesan Stiker]";
      else if (msg.message.documentMessage)
        logText = `[Dokumen: ${
          msg.message.documentMessage.fileName || "file"
        }]`;
      else logText = "[Pesan Tanpa Teks Didukung]";
    }
    // Untuk log MESSAGE_IN, pastikan senderJid yang benar yang ditampilkan, bukan JID grup jika pengirimnya user
    saveLog(
      "MESSAGE_IN",
      `${
        isGroup ? "Grup " + from.split("@")[0] : "👤Personal"
      } - ${senderName} (${senderJid.split("@")[0]}): ${logText.substring(
        0,
        100
      )}${logText.length > 100 ? "..." : ""}`
    );

    const commandText = text.toLowerCase().trim().split(" ")[0];
    const args = text.trim().split(" ").slice(1);
    const fullArgs = args.join(" ");

    const isOwner = isUserOwner(senderJid); // Menggunakan fungsi helper isUserOwner dengan senderJid
    const isSubscribed = isUserSubscribed(senderJid);

    // --- AWAL PENGECEKAN BOT AKTIF DI GRUP ---
    if (isGroup && commandText !== "/bot" && !isOwner) {
      const botIsActiveInGroup = getGroupSetting(from, "bot_active", true);
      if (!botIsActiveInGroup) {
        saveLog(
          "BOT_INACTIVE",
          `🤖 Bot tidak aktif di grup ${
            from.split("@")[0]
          }, pesan dari ${senderName} (${senderJid.split("@")[0]}) diabaikan.`
        );
        return;
      }
    }
    // --- AKHIR PENGECEKAN BOT AKTIF DI GRUP ---

    // --- KETAHUI APAKAH PESAN INI ADALAH PERINTAH SPESIFIK ---
    // Daftar perintah yang langsung ditangani (tidak melalui mode AI chat)
    const knownCommands = [
      "/menu", "/help", "/subscribeinfo", "/about", "/ping", "/owner",
      "/resetai", "/ringkas", "/qrcode", "/sticker", "/stiker",
      "/fiturpremium", "/belilimit", "/sewabot", "/addsub", "/delsub",
      "/mp3tiktok", "/mp4tiktok", "/tiktokdl", "/ttdl", "/pdftoword",
      "/wordtopdf", "/yta", "/speed", "/status", "/paraphrase",
      "/parafrase", "/quotes", "/kutipan", "/pantun", "/translate",
      "/bencana", "/setwelcome", "/on", "/off", "/bot",
      "/addkeyword", "/delkeyword",
      // Perintah AI chat baru (akan ditangani di blok /chat atau /exitai)
      "/chat", "/exitai", "/aeronix" // '/aeronix' ditambahkan untuk dialihkan ke '/chat'
    ];
    // Periksa apakah pesan saat ini adalah salah satu dari perintah yang diketahui
    const isSpecificCommand = knownCommands.includes(commandText);


    // --- AWAL LOGIKA BARU UNTUK CHAT AI DENGAN MENU ---
    // Handle /chat command
    if (commandText === "/chat") {
        saveLog("COMMAND_USED", `💬 ${senderName} (${senderJid.split('@')[0]}) menggunakan /chat.`);
        const subCommand = args[0]?.toLowerCase();

        if (!subCommand) {
            // Tampilkan menu pilihan model AI
            await sock.sendMessage(from, {
                text: `💬 *MODE CHAT AI* 💬
Pilih model AI yang ingin Anda gunakan:

› */chat gemini* - Obrolan cerdas dengan Google Gemini.
› */chat claude* - (Coming Soon!)
› */chat exit* - Keluar dari mode chat AI (otomatis keluar setelah 5 menit tidak aktif).

Untuk fitur AI lainnya seperti /imagine, /ringkas, dll., gunakan perintah langsung dari menu utama.`,
            }, { quoted: msg });
            return; // Penting: Hentikan pemrosesan
        }

        // Handle subcommands
        if (subCommand === "gemini") {
            const limitAIChat = checkAndDecrementLimit(senderJid, "aiChat", DEFAULT_DAILY_LIMIT);
            if (!limitAIChat.canUse) {
                await sock.sendMessage(from, {
                    text: `🔔 Maaf, jatah chat AI Anda hari ini sudah habis. (Sisa: ${limitAIChat.remaining}/${DEFAULT_DAILY_LIMIT})`,
                }, { quoted: msg });
                return; // Hentikan jika limit habis
            }

            activeAISessions.set(senderJid, { model: 'gemini', lastActive: Date.now() }); // Setel mode AI aktif
            chatHistories.delete(senderJid); // Bersihkan riwayat lama untuk sesi baru Gemini
            saveLog("AI_CHAT_START", `🧠 AI chat mode 'gemini' diaktifkan untuk ${senderName}.`);
            await sock.sendMessage(from, { text: `🤖 Mode chat AI Gemini AKTIF! Silakan ajukan pertanyaan Anda. Ketik /chat exit untuk keluar.` }, { quoted: msg });
            
            // Kirim notifikasi limit hanya sekali saat sesi dimulai (jika berlaku)
            if (!isOwner && limitAIChat.remaining !== Infinity) {
                const featureName = "Chat AI Gemini";
                const limitUsedNotification =
                    `🛡️ *LIMIT FITUR TERPAKAI* 🛡️\n\nAnda telah menggunakan 1 jatah untuk fitur *${featureName}*.\nSisa jatah Anda hari ini: ${limitAIChat.remaining}/${DEFAULT_DAILY_LIMIT}.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
                await sock.sendMessage(from, { text: limitUsedNotification });
            }

            return; // Hentikan pemrosesan
        }
        else if (subCommand === "grok") { // NEW: Handle /chat grok
            // Meskipun ini placeholder, kita tetap cek limit di sini
            const limitAIChat = checkAndDecrementLimit(senderJid, "aiChat", DEFAULT_DAILY_LIMIT); 
            if (!limitAIChat.canUse) {
                await sock.sendMessage(from, {
                    text: `🔔 Maaf, jatah chat AI Anda hari ini sudah habis. (Sisa: ${limitAIChat.remaining}/${DEFAULT_DAILY_LIMIT})`,
                }, { quoted: msg });
                return; // Hentikan jika limit habis
            }
            
            activeAISessions.set(senderJid, { model: 'grok', lastActive: Date.now() }); // Setel mode AI aktif ke Grok
            chatHistories.delete(senderJid); // Bersihkan riwayat lama untuk sesi baru Grok
            saveLog("AI_CHAT_START", `🧠 AI chat mode 'grok' diaktifkan untuk ${senderName}.`);
            await sock.sendMessage(from, { text: `🤖 Mode chat AI Grok AKTIF! Silakan ajukan pertanyaan Anda. (Peringatan: Fungsi ini adalah placeholder dan mungkin tidak berfungsi tanpa integrasi API Grok yang sebenarnya). Ketik /chat exit untuk keluar.` }, { quoted: msg });
            
            // Kirim notifikasi limit hanya sekali saat sesi dimulai (jika berlaku)
            if (!isOwner && limitAIChat.remaining !== Infinity) {
                const featureName = "Chat AI Grok";
                const limitUsedNotification =
                    `🛡️ *LIMIT FITUR TERPAKAI* 🛡️\n\nAnda telah menggunakan 1 jatah untuk fitur *${featureName}*.\nSisa jatah Anda hari ini: ${limitAIChat.remaining}/${DEFAULT_DAILY_LIMIT}.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
                await sock.sendMessage(from, { text: limitUsedNotification });
            }

            return; // Hentikan pemrosesan
        }
        
        // Placeholder untuk model AI masa depan lainnya
        else if (subCommand === "claude") {
            await sock.sendMessage(from, { text: `⏳ Maaf, model AI *${subCommand.toUpperCase()}* belum tersedia. Silakan gunakan */chat gemini* atau */chat grok*.` }, { quoted: msg });
            return;
        }
        else if (subCommand === "exit") {
            activeAISessions.delete(senderJid); // Nonaktifkan mode AI
            chatHistories.delete(senderJid); // Bersihkan riwayat
            saveLog("AI_CHAT_END", `🧠 AI chat mode dimatikan untuk ${senderName}.`);
            await sock.sendMessage(from, { text: "👋 Anda telah keluar dari mode chat AI. Terima kasih telah menggunakan Aeronix AI!" }, { quoted: msg });
            return; // Hentikan pemrosesan
        }

        await sock.sendMessage(from, { text: "❓ Pilihan mode AI tidak valid. Gunakan: /chat [model] atau /chat exit." }, { quoted: msg });
        return; // Hentikan pemrosesan
    }

    // Handle /exitai command (alias for /chat exit)
    if (commandText === "/exitai") {
        activeAISessions.delete(senderJid); // Nonaktifkan mode AI
        chatHistories.delete(senderJid); // Bersihkan riwayat
        saveLog("AI_CHAT_END", `🧠 AI chat mode dimatikan untuk ${senderName}.`);
        await sock.sendMessage(from, { text: "👋 Anda telah keluar dari mode chat AI. Terima kasih telah menggunakan Aeronix AI!" }, { quoted: msg });
        return;
    }
    // --- AKHIR LOGIKA BARU UNTUK CHAT AI DENGAN MENU ---


    // --- AWAL PERINTAH KHUSUS GRUP (ADMIN/OWNER ONLY) ---
    // Pastikan blok ini dieksekusi sebelum penanganan AI umum
    if (
      isGroup &&
      (commandText === "/setwelcome" ||
        commandText === "/on" ||
        commandText === "/off" ||
        commandText === "/bot")
    ) {
      let isAdmin = false;
      try {
        const groupMetadata = await sock.groupMetadata(from);
        const participantData = groupMetadata.participants.find(
          (p) => p.id === senderJid
        );
        isAdmin =
          participantData?.admin === "admin" ||
          participantData?.admin === "superadmin";
      } catch (e) {
        saveLog(
          "ERROR",
          `❌ Tidak bisa mendapatkan metadata grup ${from}: ${e.message}`
        );
      }

      if (!isAdmin && !isOwner) {
        await sock.sendMessage(
          from,
          {
            text: "🚫 Perintah ini hanya bisa digunakan oleh Admin Grup atau Owner Bot.",
          },
          { quoted: msg }
        );
        return;
      }
      saveLog(
        "GROUP_CMD_AUTHORIZED",
        `🛡️ ${
          isAdmin ? "Admin" : "Owner"
        } ${senderName} menggunakan perintah grup: ${commandText} ${args.join(
          " "
        )}`
      );

      if (commandText === "/setwelcome") {
        const newWelcomeMessage = fullArgs;
        if (!newWelcomeMessage) {
          await sock.sendMessage(
            from,
            {
              text: "✍️ Contoh: /setwelcome Selamat datang @user di grup {groupName}!",
            },
            { quoted: msg }
          );
        } else {
          setGroupSetting(from, "welcome_message", newWelcomeMessage);
          await sock.sendMessage(
            from,
            { text: `✅ Pesan sambutan diubah menjadi:\n${newWelcomeMessage}` },
            { quoted: msg }
          );
        }
        return;
      }

      if (commandText === "/on" || commandText === "/off") {
        const option = args[0]?.toLowerCase();
        if (option === "welcome") {
          const enable = commandText === "/on";
          setGroupSetting(from, "welcome_enabled", enable);
          await sock.sendMessage(
            from,
            {
              text: `✅ Fitur pesan sambutan telah di-${
                enable ? "AKTIFKAN" : "NONAKTIFKAN"
              } untuk grup ini.`,
            },
            { quoted: msg }
          );
        } else {
          await sock.sendMessage(
            from,
            {
              text: "⚠️ Opsi tidak valid. Gunakan: /on welcome atau /off welcome",
            },
            { quoted: msg }
          );
        }
        return;
      }

      if (commandText === "/bot") {
        const subCommand = args[0]?.toLowerCase();
        if (subCommand === "on") {
          setGroupSetting(from, "bot_active", true);
          await sock.sendMessage(
            from,
            { text: "🤖✅ Bot Aeronix AKTIF di grup ini." },
            { quoted: msg }
          );
        } else if (subCommand === "off") {
          setGroupSetting(from, "bot_active", false);
          await sock.sendMessage(
            from,
            {
              text: "🤖💤 Bot Aeronix NONAKTIF di grup ini. Hanya Owner/Admin yang bisa mengaktifkan kembali.",
            },
            { quoted: msg }
          );
        } else {
          await sock.sendMessage(
            from,
            { text: "Gunakan: /bot on atau /bot off" },
            { quoted: msg }
          );
        }
        return;
      }
    }
    // --- AKHIR PERINTAH KHUSUS GRUP ---

    // --- AWAL PERINTAH OWNER ---
    // Pastikan blok ini dieksekusi sebelum penanganan AI umum
    if (isOwner) {
      if (commandText === "/addsub") {
        saveLog("OWNER_CMD", `👑 ${senderName} menggunakan /addsub`);
        const mentionedJids =
          msg.message?.extendedTextMessage?.contextInfo?.mentionedJids || [];
        let targetJidInput = args[0];
        let targetJid = "";

        if (mentionedJids.length > 0) {
          targetJid = mentionedJids[0];
        } else if (targetJidInput) {
          targetJid = targetJidInput.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
          if (!targetJid.startsWith("62") && targetJid.length > 15) {
            targetJid =
              "62" +
              targetJid.substring(targetJid.indexOf("s.whatsapp.net") - 10);
          }
        }

        if (
          targetJid &&
          targetJid.includes("@s.whatsapp.net") &&
          targetJid.split("@")[0].length >= 10
        ) {
          let subs = loadJSON(SUBSCRIBED_USERS_FILE, []);
          if (!subs.includes(targetJid)) {
            subs.push(targetJid);
            saveJSON(SUBSCRIBED_USERS_FILE, subs);
            await sock.sendMessage(
              from,
              {
                text: `✅ Pengguna ${
                  targetJid.split("@")[0]
                } berhasil ditambahkan ke daftar langganan.`,
              },
              { quoted: msg }
            );
            saveLog(
              "OWNER_CMD_SUCCESS",
              `➕👤 ${targetJid} ditambahkan ke subscriber oleh ${senderName}`
            );
          } else {
            await sock.sendMessage(
              from,
              {
                text: `ℹ️ Pengguna ${
                  targetJid.split("@")[0]
                } sudah ada dalam daftar langganan.`,
              },
              { quoted: msg }
            );
          }
        } else {
          await sock.sendMessage(
            from,
            {
              text: "Format JID tidak valid atau tidak ada target. Contoh: /addsub 628xxxx atau tag pengguna.",
            },
            { quoted: msg }
          );
        }
        return;
      }

      if (commandText === "/addkeyword") {
        saveLog("OWNER_CMD", `👑 ${senderName} menggunakan /addkeyword`);
        if (args.length < 2) {
            await sock.sendMessage(from, { text: "✍️ Contoh penggunaan: /addkeyword sapa Halo, selamat datang di bot kami!" }, { quoted: msg });
            return;
        }
        const keyword = args[0].toLowerCase();
        const response = args.slice(1).join(" ");

        customKeywords[keyword] = response;
        saveJSON(KEYWORDS_FILE, customKeywords);

        await sock.sendMessage(from, { text: `✅ Keyword "${keyword}" berhasil ditambahkan/diupdate.` }, { quoted: msg });
        saveLog("OWNER_CMD_SUCCESS", `✍️ Keyword '${keyword}' diupdate oleh ${senderName}`);
        return;
      }

      if (commandText === "/delkeyword") {
        saveLog("OWNER_CMD", `👑 ${senderName} menggunakan /delkeyword`);
        if (args.length < 1) {
            await sock.sendMessage(from, { text: "✍️ Contoh penggunaan: /delkeyword sapa" }, { quoted: msg });
            return;
        }
        const keyword = args[0].toLowerCase();

        if (customKeywords[keyword]) {
            delete customKeywords[keyword];
            saveJSON(KEYWORDS_FILE, customKeywords);
            await sock.sendMessage(from, { text: `🗑️ Keyword "${keyword}" berhasil dihapus.` }, { quoted: msg });
            saveLog("OWNER_CMD_SUCCESS", `🗑️ Keyword '${keyword}' dihapus oleh ${senderName}`);
        } else {
            await sock.sendMessage(from, { text: `ℹ️ Keyword "${keyword}" tidak ditemukan.` }, { quoted: msg });
        }
        return;
      }

      if (commandText === "/delsub") {
        saveLog("OWNER_CMD", `👑 ${senderName} menggunakan /delsub`);
        const mentionedJids =
          msg.message?.extendedTextMessage?.contextInfo?.mentionedJids || [];
        let targetJidInput = args[0];
        let targetJid = "";

        if (mentionedJids.length > 0) {
          targetJid = mentionedJids[0];
        } else if (targetJidInput) {
          targetJid = targetJidInput.replace(/[^0-9]/g, "") + "@s.whatsapp.net";
          if (!targetJid.startsWith("62") && targetJid.length > 15) {
            targetJid =
              "62" +
              targetJid.substring(targetJid.indexOf("s.whatsapp.net") - 10);
          }
        }

        if (
          targetJid &&
          targetJid.includes("@s.whatsapp.net") &&
          targetJid.split("@")[0].length >= 10
        ) {
          let subs = loadJSON(SUBSCRIBED_USERS_FILE, []);
          const idx = subs.indexOf(targetJid);
          if (idx > -1) {
            subs.splice(idx, 1);
            saveJSON(SUBSCRIBED_USERS_FILE, subs);
            await sock.sendMessage(
              from,
              {
                text: `🗑️ Pengguna ${
                  targetJid.split("@")[0]
                } berhasil dihapus dari langganan.`,
              },
              { quoted: msg }
            );
            saveLog(
              "OWNER_CMD_SUCCESS",
              `➖👤 ${targetJid} dihapus dari subscriber oleh ${senderName}`
            );
          } else {
            await sock.sendMessage(
              from,
              {
                text: `ℹ️ Pengguna ${
                  targetJid.split("@")[0]
                } sudah ada dalam daftar langganan.`,
              },
              { quoted: msg }
            );
          }
        } else {
          await sock.sendMessage(
            from,
            {
              text: "Format JID tidak valid atau tidak ada target. Contoh: /addsub 628xxxx atau tag pengguna.",
            },
            { quoted: msg }
          );
        }
        return;
      }
    }
    // --- AKHIR PERINTAH OWNER ---

    // --- MEMUAT QUOTES ---
    if (fs.existsSync(QUOTES_FILE)) {
      try {
        const quotesData = fs.readFileSync(QUOTES_FILE, "utf-8");
        allQuotes = JSON.parse(quotesData);
      } catch (e) {
        saveLog(
          "FILESYSTEM_ERROR",
          `❌ Gagal memuat ${QUOTES_FILE}: ${e.message}`
        );
        allQuotes = [
          { quote: "Error memuat file kutipan.", author: "Sistem Aeronix" },
        ];
      }
    } else {
      saveLog(
        "SYSTEM_WARN",
        `⚠️ File ${QUOTES_FILE} tidak ditemukan. Membuat file contoh...`
      );
      // Tambahkan logika membuat file contoh jika perlu
    }

    // --- MEMUAT PANTUN ---
    if (!fs.existsSync(PANTUN_FILE)) {
      saveLog(
        "SYSTEM_WARN",
        `⚠️ File ${PANTUN_FILE} tidak ditemukan. Membuat file contoh...`
      );
      const examplePantun = [
        {
          text: "Jalan-jalan ke kota Cianjur,\nJangan lupa membeli sukur.\nKalau kamu ingin jadiMaju,\nHarus rajin belajar dan berdoa dengan takur.",
        },
        {
          text: "Beli buku di toko lama,\nBukunya tentang cerita naga.\nKalau Aeronix sudah menyapa,\nJangan lupa balas dengan tawa.",
        },
      ];
      saveJSON(PANTUN_FILE, examplePantun);
      allPantun = examplePantun;
    } else {
      try {
        const pantunData = fs.readFileSync(PANTUN_FILE, "utf-8");
        allPantun = JSON.parse(pantunData);
      } catch (e) {
        saveLog(
          "FILESYSTEM_ERROR",
          `❌ Gagal memuat ${PANTUN_FILE}: ${e.message}`
        );
        allPantun = [
          { text: "Error: Gagal memuat file pantun.\nAeronix bingung :(" },
        ];
      }
    }

    // --- AKHIR MEMUAT PANTUN.JSON ---
    // --- AKHIR PERINTAH OWNER ---

    // --- AWAL PERINTAH PUBLIK & INFO ---
    // Perbarui teks menu Anda di sini
    if (
      commandText === "/menu" ||
      commandText === "/help" ||
      commandText === "menu" ||
      commandText === "help"
    ) {
      const isPremiumAccess = isOwner || isSubscribed;
      const dailyLimitForDisplay = 7;
      const botVersion = "2.1"; // Update versi bot

      const menuString = `
🌟 *AERONIX BOT v${botVersion}* 🌟

Halo, ${senderName}! 👋
Siap membantu Anda hari ini!

👤 *Profil Anda*
› Status: ${isPremiumAccess ? "👑 Premium" : "👤 Reguler"}
› Limit Harian: ${isPremiumAccess ? "♾️ Tak Terbatas" : `${dailyLimitForDisplay}x per fitur`}
› Tambah Limit: */belilimit* 🪙
› _Reset limit setiap 0:00 WIB_

━━━━━━━━━━━━━━━━━━━━
🧠 *Fitur AI*
› */chat* - Menu untuk memulai/mengakhiri chat AI
› */resetai* - Reset memori AI
› */ringkas* - Ringkas teks 🅛
› */paraphrase* - Ubah susunan kalimat 🅛
› */translate <kode> <teks>* - Terjemahkan 🅛 🌐
› _(Dalam mode chat AI, cukup ketik pertanyaan langsung tanpa perintah)_

━━━━━━━━━━━━━━━━━━━━
🖼️ *Kreasi & Media*
› */sticker* - Gambar jadi stiker 🅛 ✨
› */qrcode <teks>* - Buat Kode QR 📲

━━━━━━━━━━━━━━━━━━━━
📄 *Konversi Dokumen*
› */wordtopdf* - Word ke PDF 🅛
› */pdftoword* - PDF ke Word 🅛

━━━━━━━━━━━━━━━━━━━━
📥 *Downloader*
› */yta <url/judul>* - YouTube Audio 🅛 🎧
› */tiktokdl <url>* - TikTok Video (No WM) 🅛 📹
› */mp3tiktok <url>* - TikTok Audio 🅛 🎵

━━━━━━━━━━━━━━━━━━━━
🎉 *Hiburan*
› */quotes* - Kutipan acak 💡
› */pantun* - Pantun jenaka 📜
› */bencana* - Informasi Bencana Alam 🌍 (Tanpa Limit)

━━━━━━━━━━━━━━━━━━━━
🛠️ *Utilitas & Info*
› */menu* - Menu ini
› */ping* - Tes kecepatan bot
› */status* - Info performa bot 📊
› */about* - Tentang Aeronix
› */owner* - Kontak Developer 🧑‍💻

━━━━━━━━━━━━━━━━━━━━
🔑 *Admin Grup & Owner*
> (Perintah khusus di grup)
› */setwelcome* [teks] 🅐🅞
› */on welcome* | */off welcome* 🅐🅞
› */bot on* | */bot off* 🅐🅞
› */addkeyword* [keyword] [respons] 🅞
› */delkeyword* [keyword] 🅞
› */addsub* [tag/nomor] 🅞
› */delsub* [tag/nomor] 🅞

━━━━━━━━━━━━━━━━━━━━
🛍️ *Premium & Toko*
› */subscribeinfo* - Info langganan 💎
› */belilimit* - Beli tambahan limit 🪙
› */sewabot* - Undang bot ke grup 🤖➕

━━━━━━━━━━━━━━━━━━━━━━━
📜 *Label*
  🅛 : Fitur berlimit harian
  🅞 : Khusus Owner Bot
  🅐 : Khusus Admin Grup
  🅟 : Khusus Penyewa/Premium (*di menu sewa*)
  🪙 : Layanan Toko
➖➖➖➖➖➖➖➖➖➖➖
Terima kasih telah menggunakan Aeronix! 😊
      `.trim();

      await sock.sendMessage(from, { text: menuString }, { quoted: msg });
      saveLog(
        "COMMAND_USED",
        `📋 Menu (v${botVersion}) ditampilkan untuk ${senderName}`
      );
      return;
    }

    if (commandText === "/belilimit") {
      saveLog(
        "COMMAND_USED",
        `🪙 ${senderName} (${from.split("@")[0]}) meminta info /belilimit.`
      );
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
> • Penambahan limit ini bersifat sementara dan akan hangus pada saat reset harian (pukul 0:00 WIB). Limit tidak diakumulasikan ke hari berikutnya.
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
      return;
    }

    if (commandText === "/sewabot") {
      saveLog(
        "COMMAND_USED",
        `🤖➕ ${senderName} (${from.split("@")[0]}) meminta info /sewabot.`
      );
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

    // --- AWAL FITUR HIBURAN (BARU) ---

    if (commandText === "/quotes" || commandText === "/kutipan") {
      saveLog("COMMAND_USED", `💡 ${senderName} meminta /quotes.`);
      if (allQuotes.length === 0) {
        await sock.sendMessage(
          from,
          {
            text: "📚 Maaf, koleksi kutipan sedang kosong atau gagal dimuat. Coba lagi nanti.",
          },
          { quoted: msg }
        );
        return;
      }
      const randomIndex = Math.floor(Math.random() * allQuotes.length);
      const selectedQuote = allQuotes[randomIndex];
      const quoteMessage = `
"${selectedQuote.quote}"

— _${selectedQuote.author || "Anonim"}_
  `.trim();

      await sock.sendMessage(from, { text: quoteMessage }, { quoted: msg });
      return;
    }

    if (commandText === "/pantun") {
      saveLog(
        "COMMAND_USED",
        `📜 ${senderName} (${senderJid.split("@")[0]}) meminta /pantun.`
      );
      if (!allPantun || allPantun.length === 0) {
        await sock.sendMessage(
          from,
          {
            text: "📚 Maaf, koleksi pantun sedang kosong atau gagal dimuat. Coba lagi nanti.",
          },
          { quoted: msg }
        );
        return;
      }
      const randomIndex = Math.floor(Math.random() * allPantun.length);
      const selectedPantun = allPantun[randomIndex];
      await sock.sendMessage(
        from,
        { text: selectedPantun.text.trim() },
        { quoted: msg }
      );
      return;
    }
    // --- AKHIR FITUR HIBURAN (BARU) ---

    // --- AWAL FITUR INFORMASI & SISTEM ---
    if (commandText === "/subscribeinfo") {
      const subscribeMsg = `👑 *INFO LANGGANAN BOT AERONIX* 👑\n\nDengan berlangganan Aeronix Premium, Anda mendapatkan keuntungan:\n> ✅ Akses TANPA BATAS ke semua fitur berlimit (AI Chat, /ringkas, /sticker, /wordtopdf, /pdftoword, /yta).\n> ✅ Akses ke fitur-fitur premium eksklusif yang mungkin ditambahkan di masa depan.\n> ✅ Dukungan prioritas.\n\nTertarik untuk meningkatkan pengalaman Anda?\nHubungi Owner untuk info biaya dan cara berlangganan: */owner*\n\nTerima kasih atas dukungan Anda! 🙏`;
      await sock.sendMessage(
        from,
        { text: subscribeMsg.trim() },
        { quoted: msg }
      );
      saveLog("COMMAND_USED", `💰 ${senderName} meminta info langganan.`);
      return;
    }

    if (commandText === "/about" || commandText === "about") {
      const aboutMsg = `🤖  *TENTANG BOT AERONIX (GEMINI)*\n\nBot ini adalah asisten virtual cerdas Anda, ditenagai oleh AERONIX & dimodifikasi oleh Cryanox dari base Ryan.\nSiap membantu Anda dengan berbagai informasi, pembuatan stiker, ringkasan teks, dan lainnya!\n➖➖➖➖➖➖➖➖➖➖➖\n💻  *TEKNOLOGI YANG DIGUNAKAN*\n> Baileys (Interaksi WhatsApp)\n> AERONIX GEMINI API (Mesin AI)\n> Node.js (Runtime)\n> @google/generative-ai (SDK Gemini)\n> sharp (Pemrosesan Gambar Stiker)\n> fluent-ffmpeg & FFmpeg (Stiker Animasi)\n➖➖➖➖➖➖➖➖➖➖➖\n✨  *FITUR UNGGULAN*\n> ✅ AI Chat Cerdas dengan Konteks\n> ✅ Pembuat Stiker (Statis & Animasi) ✨\n> ✅ Ringkasan Teks Otomatis 📝\n> ✅ Sistem Limit Harian & Langganan 👑\n> ✅ Perintah Informatif & Utilitas\n➖➖➖➖➖➖➖➖➖➖➖\n👨‍💻  *PENGEMBANG & MODIFIKASI*\n> Owner/Modifikator: Cryanox\n> Base Script: Ryan\n> Kontak Owner: /owner\n\n_Terima kasih telah menggunakan Aeronix!_ 😊`;
      await sock.sendMessage(from, { text: aboutMsg.trim() }, { quoted: msg });
      saveLog("COMMAND_USED", `ℹ️ ${senderName} melihat /about.`);
      return;
    }

    if (commandText === "/ping" || commandText === "ping") {
      const startTime = Date.now();
      const pingMsgObj = await sock.sendMessage(
        from,
        { text: "🏓 Menghitung kecepatan respons..." },
        { quoted: msg }
      );
      const endTime = Date.now();
      const ping = endTime - startTime;
      const pingResp = `🚀  *STATUS & PING BOT AERONIX* 🚀\n\n> Status Bot: Online & Siap Menerima Perintah ✅\n> Koneksi AI: Google Gemini API Terhubung ✅\n> Kecepatan Respons Jaringan: *${ping} ms* ⚡\n\n_Bot Anda selalu siap melayani dengan gesit!_`;
      await sock.sendMessage(from, {
        text: pingResp.trim(),
        edit: pingMsgObj.key,
      });
      saveLog("COMMAND_USED", `🏓 ${senderName} melakukan /ping (${ping}ms).`);
      return;
    }
    // --- AKHIR FITUR INFORMASI & SISTEM ---

    // --- AWAL FITUR OWNER ---
    if (commandText === "/whois" || commandText === "whois") {
      const devInfo =
        `👨‍💻 *PROFIL DEVELOPER*\n\n` +
        `🏷️ *Nama:* Ryan\n` +
        `🤖 *Project:* Bot Aeronix WhatsApp\n` +
        `📱 *Kontak Utama:* +6285878143481\n` +
        `📱 *Kontak Alt:* +62888029575500\n` +
        `🔧 *Spesialisasi:* WhatsApp Bot Development\n` +
        `💎 *Services:* Premium Bot Features\n\n` +
        `📞 *Cara Hubungi:*\n` +
        `• */owner* - Info lengkap + kontak\n\n` +
        `_Developed with ❤️ by Ryan-Cryanox_`;

      await sock.sendMessage(from, { text: devInfo }, { quoted: msg });
      saveLog("COMMAND_USED", `ℹ️ ${senderName} menggunakan /whois (dev info)`);
      return;
    }

    if (commandText === "/owner" || commandText === "owner") {
      saveLog(
        "COMMAND_USED",
        `👑 ${senderName} (${
          senderJid.split("@")[0]
        }) meminta info /owner (utama).`
      );

      if (
        !OWNERS_DATA ||
        OWNERS_DATA.length < 1 ||
        OWNERS_DATA[0].jid.startsWith("NOMOR_WA_")
      ) {
        // Cek owner pertama
        await sock.sendMessage(
          from,
          {
            text: "⚠️ Maaf, informasi kontak owner utama belum diatur dengan benar.",
          },
          { quoted: msg }
        );
        return;
      }

      const mainOwner = OWNERS_DATA[0]; // Mengambil data owner pertama
      const ownerNumber = mainOwner.jid.split("@")[0];
      const ownerCardName = mainOwner.cardName;
      const organization = "Tim Pengembang Aeronix"; // Anda bisa sesuaikan

      const ownerVCard =
        `BEGIN:VCARD\n` +
        `VERSION:3.0\n` +
        `FN:${ownerCardName}\n` +
        `ORG:${organization};\n` +
        `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:${ownerNumber}\n` + // Nomor WA untuk waid
        `NOTE:Pengembang Utama Aeronix Bot. Hubungi untuk support atau pertanyaan.\n` +
        `END:VCARD`;

      try {
        await sock.sendMessage(
          from,
          {
            contacts: {
              displayName: ownerCardName,
              contacts: [{ vcard: ownerVCard }],
            },
          },
          { quoted: msg }
        );
        await sock.sendMessage(
          from,
          {
            text: `👆 Kontak Developer Utama Aeronix: *${ownerCardName}*.\nSilakan simpan atau langsung chat jika perlu.`,
          },
          { quoted: msg }
        );
        saveLog(
          "OWNER_CMD_SUCCESS",
          `✅ vCard ${ownerCardName} berhasil dikirim ke ${senderName}`
        );
      } catch (error) {
        saveLog(
          "ERROR",
          `❌ Gagal mengirim vCard ${ownerCardName}: ${error.message}`
        );
        await sock.sendMessage(
          from,
          {
            text: `❌ Gagal mengirim kartu kontak.\nSilakan hubungi manual: wa.me/${ownerNumber}`,
          },
          { quoted: msg }
        );
      }
      return;
    }

    if (commandText === "/owner2" || commandText === "/cryanox") {
      // Anda bisa pilih nama perintahnya
      saveLog(
        "COMMAND_USED",
        `👑 ${senderName} (${
          senderJid.split("@")[0]
        }) meminta info /owner2 (alternatif).`
      );

      if (
        !OWNERS_DATA ||
        OWNERS_DATA.length < 2 ||
        OWNERS_DATA[1].jid.startsWith("NOMOR_WA_")
      ) {
        // Cek owner kedua
        await sock.sendMessage(
          from,
          {
            text: "⚠️ Maaf, informasi kontak owner alternatif tidak tersedia atau belum diatur.",
          },
          { quoted: msg }
        );
        return;
      }

      const secondOwner = OWNERS_DATA[1]; // Mengambil data owner kedua
      const ownerNumber = secondOwner.jid.split("@")[0];
      const ownerCardName = secondOwner.cardName;
      const organization = "Tim Pengembang Aeronix";

      const ownerVCard2 =
        `BEGIN:VCARD\n` +
        `VERSION:3.0\n` +
        `FN:${ownerCardName}\n` +
        `ORG:${organization};\n` +
        `TEL;type=CELL;type=VOICE;waid=${ownerNumber}:${ownerNumber}\n` +
        `NOTE:Kontak Alternatif Pengembang Aeronix Bot.\n` +
        `END:VCARD`;
      try {
        await sock.sendMessage(
          from,
          {
            contacts: {
              displayName: ownerCardName,
              contacts: [{ vcard: ownerVCard2 }],
            },
          },
          { quoted: msg }
        );
        await sock.sendMessage(
          from,
          {
            text: `👆 Kontak Developer Alternatif Aeronix: *${ownerCardName}*.\nSilakan simpan atau langsung chat.`,
          },
          { quoted: msg }
        );
        saveLog(
          "OWNER_CMD_SUCCESS",
          `✅ vCard ${ownerCardName} berhasil dikirim ke ${senderName}`
        );
      } catch (error) {
        saveLog(
          "ERROR",
          `❌ Gagal mengirim vCard ${ownerCardName}: ${error.message}`
        );
        await sock.sendMessage(
          from,
          {
            text: `❌ Gagal mengirim kartu kontak alternatif.\nSilakan hubungi manual: wa.me/${ownerNumber}`,
          },
          { quoted: msg }
        );
      }
      return;
    }
    // --- AKHIR PERINTAH PUBLIK & INFO ---

    // --- AWAL PERINTAH DENGAN LIMIT/SUBS ---

    if (commandText === '/translate' || commandText === '/tr') {
        const limit = checkAndDecrementLimit(senderJid, 'translate', DEFAULT_DAILY_LIMIT);
        if (!limit.canUse) {
            await sock.sendMessage(from, { text: `🔔 Maaf, jatah /translate Anda hari ini habis. (Sisa: ${limit.remaining}/${DEFAULT_DAILY_LIMIT})` }, { quoted: msg });
            return;
        }

        let targetLang = args[0]?.toLowerCase();
        let textToTranslate = "";
        const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

        if (quotedMessage) {
            textToTranslate = quotedMessage.conversation || quotedMessage.extendedTextMessage?.text || "";
            if (args.length > 0) {
                targetLang = args[0]?.toLowerCase();
                if (args.length > 1) {
                    textToTranslate = args.slice(1).join(" ");
                }
            } else {
                    await sock.sendMessage(from, { text: "❓ Mohon sertakan kode bahasa tujuan setelah perintah /translate.\nContoh: /translate en (untuk reply pesan)" }, { quoted: msg });
                    return;
            }
        } else {
            if (args.length < 2) {
                await sock.sendMessage(from, { text: "❓ Penggunaan: /translate <kode_bahasa> <teks_untuk_diterjemahkan>\nContoh: /translate en Halo apa kabar\n\nAtau reply pesan dengan: /translate <kode_bahasa>" }, { quoted: msg });
                return;
            }
            targetLang = args[0]?.toLowerCase();
            textToTranslate = args.slice(1).join(" ");
        }

        if (!textToTranslate) {
            await sock.sendMessage(from, { text: "✍️ Tidak ada teks untuk diterjemahkan." }, { quoted: msg });
            return;
        }
        if (!targetLang || targetLang.length < 2 || targetLang.length > 7) {
            await sock.sendMessage(from, { text: "❓ Kode bahasa tujuan tidak valid. Gunakan kode 2 huruf (misal: en, id, ja, ar)." }, { quoted: msg });
            return;
        }

        saveLog("COMMAND_USED", `🌐 ${senderName} meminta /translate ke '${targetLang}' untuk: "${textToTranslate.substring(0, 30)}..."`, isOwner);
        await sock.sendMessage(from, { text: `🔄 Menerjemahkan teks ke bahasa "${targetLang.toUpperCase()}", mohon tunggu...` }, { quoted: msg });
        await sock.sendPresenceUpdate("composing", from);

        try {
            const translatePrompt = `Translate the following text to ${targetLang} (language code: ${targetLang}). Provide only the translated text without any additional explanations or pleasantries.\n\nOriginal text:\n"""\n${textToTranslate}\n"""\n\nTranslated text:`;
            
            saveLog("AI_TRANSLATE_REQUEST", `🌐 Meminta terjemahan dari Gemini ke '${targetLang}' untuk teks ${textToTranslate.length} char.`);
            const translatedText = await callGeminiAPI(translatePrompt, []); 

            if (translatedText && !translatedText.toLowerCase().includes("maaf") && !translatedText.toLowerCase().includes("kesalahan") && !translatedText.toLowerCase().includes("diblokir")) {
                const translateResponse = `🌐 *Hasil Terjemahan (${targetLang.toUpperCase()}):*\n\n${translatedText}`;
                await sock.sendMessage(from, { text: translateResponse }, { quoted: msg });
                saveLog("AI_TRANSLATE_SUCCESS", `✅ Terjemahan ke '${targetLang}' berhasil untuk ${senderName}.`);

                if (!isOwner && limit.remaining !== Infinity) { // Only notify if not owner/subscribed
                    const featureNameFriendly = "Penerjemah Bahasa (/translate)";
                    const limitUsedNotification = `🛡️ *LIMIT FITUR TERPAKAI* 🛡️\n\nAnda telah menggunakan 1 jatah untuk fitur *${featureNameFriendly}*.\nSisa jatah Anda hari ini: ${limit.remaining}/${DEFAULT_DAILY_LIMIT}.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
                    await sock.sendMessage(from, { text: limitUsedNotification }); 
                }
            } else {
                await sock.sendMessage(from, { text: (translatedText && (translatedText.includes("diblokir") || translatedText.includes("maaf"))) ? translatedText : "🤖 Maaf, gagal menerjemahkan teks saat ini." }, { quoted: msg });
                saveLog("AI_TRANSLATE_FAIL", `⚠️ Gagal menerjemahkan atau respons diblokir untuk ${senderName}: ${translatedText}`);
            }
        } catch (error) {
            console.error(`[${getTime()}] ❌ Error saat /translate:`, error);
            saveLog("AI_TRANSLATE_ERROR", `❌ Gagal /translate untuk ${senderName}: ${error.message}`);
            await sock.sendMessage(from, { text: "🚫 Maaf, terjadi kesalahan internal saat mencoba menerjemahkan teks." }, { quoted: msg });
        }
        await sock.sendPresenceUpdate("available", from);
        return;
    }

    if (commandText === "/ringkas") {
      const messageKey = `${from}:${senderJid}:${fullArgs}:${msg.key.id}`;
      if (processedMessages.has(messageKey)) {
        saveLog("DEBUG_LOG", `Pesan duplikat: ${messageKey}`);
        return;
      }
      processedMessages.add(messageKey);
      setTimeout(() => processedMessages.delete(messageKey), 10000);

      const isOwner = Array.isArray(OWNERS_DATA) && OWNERS_DATA.some((owner) => owner.jid === senderJid);
      let limit = { canUse: true, remaining: Infinity };
      if (!isOwner) {
        limit = checkAndDecrementLimit(senderJid, "ringkas", 7); // Gunakan senderJid
        if (!limit.canUse) {
          await sock.sendMessage(
            from,
            {
              text: `🔔 Maaf, jatah /ringkas Anda hari ini habis. (Sisa: ${limit.remaining}/7)`,
            },
            { quoted: msg }
          );
          return;
        }
      }

      saveLog(
        "LIMIT_SYSTEM",
        `${isOwner ? "👑 Akses tanpa limit untuk owner" : "Limit ringkas (" + limit.remaining + "/7)"} untuk ${senderJid} di ${from}`,
        isOwner
      );

      let textToSummarize = "";
      const argsRingkas = fullArgs;
      const qMR = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (qMR) {
        textToSummarize =
          qMR.conversation || qMR.extendedTextMessage?.text || "";
        if (argsRingkas) textToSummarize = argsRingkas;
      } else {
        textToSummarize = argsRingkas;
      }

      if (!textToSummarize || textToSummarize.length < 100) {
        await sock.sendMessage(
          from,
          {
            text: "✍️ Teks terlalu pendek (min 100 karakter) atau tidak ada teks untuk diringkas.",
          },
          { quoted: msg }
        );
        return;
      }

      await sock.sendMessage(
        from,
        { text: "🤖 Aeronix sedang memproses ringkasan..." },
        { quoted: msg }
      );
      await sock.sendPresenceUpdate("composing", from);

      try {
        const summarizationPrompt = `Anda adalah asisten AI yang ahli dalam meringkas teks. Tolong buatkan ringkasan yang jelas, padat, dan informatif dari teks berikut. Fokus pada poin-poin utama dan sampaikan dalam beberapa kalimat atau poin jika memungkinkan. Jangan menambahkan opini atau informasi di luar teks asli.\n\nTeks yang akan diringkas:\n"""\n${textToSummarize}\n"""\n\nRingkasan:`;
        saveLog(
          "AI_SUMMARY_REQUEST",
          `📝 Meminta ringkasan dari ${senderName} (Teks: ${textToSummarize.length} char).`,
          isOwner
        );
        const summary = await callGeminiAPI(summarizationPrompt, []);

        if (
          summary &&
          !summary.toLowerCase().includes("maaf") &&
          !summary.toLowerCase().includes("kesalahan") &&
          !summary.toLowerCase().includes("diblokir")
        ) {
          await sock.sendMessage(
            from,
            { text: `📝 *Ringkasan dari Aeronix:*\n\n${summary}` },
            { quoted: msg }
          );
          saveLog(
            "AI_SUMMARY_SUCCESS",
            `✅ Ringkasan berhasil dibuat untuk ${senderName}.`,
            isOwner
          );

          if (!isOwner && limit.remaining !== Infinity) {
            const featureNameFriendly = "Ringkas Teks (/ringkas)";
            const limitUsedNotification = `
🛡️ *LIMIT FITUR TERPAKAI* 🛡️

Anda telah menggunakan 1 jatah untuk fitur *${featureNameFriendly}*.\nSisa jatah Anda hari ini: ${limit.remaining}/7.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
            await sock.sendMessage(from, { text: limitUsedNotification }, { quoted: msg });
          }
        } else {
          await sock.sendMessage(
            from,
            {
              text:
                summary && summary.includes("diblokir")
                  ? summary
                  : "🤖 Maaf, gagal membuat ringkasan saat ini.",
            },
            { quoted: msg }
          );
          saveLog(
            "AI_SUMMARY_FAIL",
            `⚠️ Gagal meringkas atau respons diblokir untuk ${senderName}: ${summary}`,
            isOwner
          );
        }
      } catch (e) {
        await sock.sendMessage(
          from,
          { text: "🤖 Error internal saat meringkas." },
          { quoted: msg }
        );
        saveLog(
          "ERROR",
          `❌ Summarization error for ${senderName}: ${e.message}`,
          isOwner
        );
      } finally {
        await sock.sendPresenceUpdate("available", from);
      }
      return;
    }
    // AWAL FITUR WORD TO PDF
    if (commandText === "/wordtopdf") {
      if (!convertApi) {
        await sock.sendMessage(
          from,
          {
            text: "⚠️ Maaf, layanan konversi dokumen sedang tidak aktif. Hubungi Owner.",
          },
          { quoted: msg }
        );
        return;
      }

      const messageKey = `${from}:${senderJid}:${fullArgs}:${msg.key.id}`;
      if (processedMessages.has(messageKey)) {
        return;
      }
      processedMessages.add(messageKey);
      setTimeout(() => processedMessages.delete(messageKey), 10000);

      const isOwner = Array.isArray(OWNERS_DATA) && OWNERS_DATA.some((owner) => owner.jid === senderJid);
      let limit = { canUse: true, remaining: Infinity };
      if (!isOwner) {
        limit = checkAndDecrementLimit(senderJid, "docconvert", 7);
        if (!limit.canUse) {
          await sock.sendMessage(
            from,
            {
              text: `🔔 Maaf, jatah konversi dokumen Anda hari ini habis. (Sisa: ${limit.remaining}/7)`,
            },
            { quoted: msg }
          );
          return;
        }
      }

      saveLog(
        "LIMIT_SYSTEM",
        `${isOwner ? "👑 Akses tanpa limit untuk owner" : "Limit docconvert (" + limit.remaining + "/7)"} untuk ${senderJid} di ${from}`,
        isOwner
      );

      let messageToDownload = null;
      let sourceFileMessage = null;

      if (msg.message?.documentMessage) {
        messageToDownload = msg;
        sourceFileMessage = msg.message.documentMessage;
      } else if (
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage
      ) {
        const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
        messageToDownload = {
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant,
          },
          message: quotedMsg,
        };
        sourceFileMessage = quotedMsg.documentMessage;
      }

      if (!sourceFileMessage || !messageToDownload) {
        await sock.sendMessage(
          from,
          {
            text: "📄 Mohon kirim atau reply file dokumen Word (.docx atau .doc) dengan perintah /wordtopdf.",
          },
          { quoted: msg }
        );
        return;
      }

      const allowedMimeTypes = [
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/msword",
      ];
      if (!allowedMimeTypes.includes(sourceFileMessage.mimetype)) {
        await sock.sendMessage(
          from,
          {
            text: "⚠️ Format file tidak didukung. Hanya file Word (.docx atau .doc) yang bisa dikonversi.",
          },
          { quoted: msg }
        );
        return;
      }

      const originalFileName =
        sourceFileMessage.fileName ||
        `document_${Date.now()}.${sourceFileMessage.mimetype === "application/msword" ? "doc" : "docx"}`;
      saveLog(
        "COMMAND_USED",
        `🔄📄 ${senderName} meminta /wordtopdf untuk: ${originalFileName}`,
        isOwner
      );
      await sock.sendMessage(
        from,
        { text: `⏳ Mengonversi ${originalFileName} ke PDF...` },
        { quoted: msg }
      );
      await sock.sendPresenceUpdate("composing", from);

      const tempInputPath = path.join(
        TEMP_FOLDER,
        `input_${Date.now()}_${path.basename(originalFileName)}`
      );
      let tempOutputPath = "";

      try {
        const fileBuffer = await downloadMediaMessage(
          messageToDownload,
          "buffer",
          {},
          {
            logger: pino({ level: "silent" }),
            reuploadRequest: sock.updateMediaMessage,
          }
        );
        await fs.promises.writeFile(tempInputPath, fileBuffer);

        const fromFormat = sourceFileMessage.mimetype === "application/msword" ? "doc" : "docx";
        let result = await convertApi.convert(
          "pdf",
          { File: tempInputPath },
          fromFormat
        );

        saveLog(
          "CONVERT_LOG",
          `📄 Konversi Word ke PDF: ${result.files?.length || 0} file.`,
          isOwner
        );

        if (result.files && result.files.length > 0) {
          const convertedFile = result.files[0];
          saveLog(
            "DEBUG_CONVERT",
            `🔍 File: Name='${convertedFile.Name}', FileName='${convertedFile.FileName}', name='${convertedFile.name}', Size='${convertedFile.Size}', Url='${convertedFile.Url}'`,
            isOwner
          );

          const fileNameFromApi =
            convertedFile.FileName ||
            convertedFile.name ||
            convertedFile.Name ||
            `converted_${Date.now()}.pdf`;
          tempOutputPath = path.join(TEMP_FOLDER, fileNameFromApi);
          await convertedFile.save(tempOutputPath);

          const pdfToSendBuffer = await fs.promises.readFile(tempOutputPath);
          const outputFileName =
            path.basename(originalFileName, path.extname(originalFileName)) + ".pdf";

          await sock.sendMessage(
            from,
            {
              document: pdfToSendBuffer,
              mimetype: "application/pdf",
              fileName: outputFileName,
            },
            { quoted: msg }
          );

          saveLog(
            "DOC_CONVERT_SUCCESS",
            `✅ ${originalFileName} -> ${outputFileName} untuk ${senderName}`,
            isOwner
          );

          if (!isOwner && limit.remaining !== Infinity) {
            const featureNameFriendly = "Konversi Word ke PDF (/wordtopdf)";
            const limitNotif = `
🛡️ *LIMIT FITUR TERPAKAI* 🛡️

Anda telah menggunakan 1 jatah untuk *${featureNameFriendly}*.\nSisa jatah Anda hari ini: ${limit.remaining}/7.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
            await sock.sendMessage(from, { text: limitNotif }, { quoted: msg });
          }
        } else {
          await sock.sendMessage(
            from,
            { text: "🚫 Konversi gagal: Tidak ada file hasil." },
            { quoted: msg }
          );
          saveLog(
            "CONVERT_FAIL",
            `❌ Konversi gagal untuk ${originalFileName}`,
            isOwner
          );
        }
      } catch (error) {
        saveLog(
          "DOC_CONVERT_ERROR",
          `❌ Gagal konversi ${originalFileName}: ${error.message}`,
          isOwner
        );
        let errorMsgUser = "🚫 Gagal konversi dokumen.";
        if (error.response && error.response.data && error.response.data.Message) {
          errorMsgUser += `\nDetail: ${error.response.data.Message}`;
        } else if (error.toString().includes("timeout")) {
          errorMsgUser = "🚫 Proses konversi timeout.";
        }
        await sock.sendMessage(from, { text: errorMsgUser }, { quoted: msg });
      } finally {
        try {
          if (fs.existsSync(tempInputPath)) {
            await fs.promises.unlink(tempInputPath);
            saveLog(
              "FILESYSTEM_DEBUG",
              `✅ File sementara dihapus: ${tempInputPath}`,
              isOwner
            );
          }
          if (tempOutputPath && fs.existsSync(tempOutputPath)) {
            await fs.promises.unlink(tempOutputPath);
            saveLog(
              "FILESYSTEM_DEBUG",
              `✅ File output dihapus: ${tempOutputPath}`,
              isOwner
            );
          }
        } catch (cleanupError) {
          saveLog(
            "FILESYSTEM_ERROR",
            `❌ Error cleanup /wordtopdf: ${cleanupError.message}`,
            isOwner
          );
        }
      }
      await sock.sendPresenceUpdate("available", from);
      return;
    }
    // --- AKHIR FITUR WORD TO PDF ---

    // --- AWAL FITUR PDF TO WORD ---
    if (commandText === "/pdftoword") {
      if (!convertApi) {
        await sock.sendMessage(
          from,
          { text: "⚠️ Layanan konversi dokumen tidak aktif. Hubungi Owner." },
          { quoted: msg }
        );
        return;
      }

      const messageKey = `${from}:${senderJid}:${fullArgs}:${msg.key.id}`;
      if (processedMessages.has(messageKey)) {
        saveLog("DEBUG_LOG", `Pesan duplikat: ${messageKey}`);
        return;
      }
      processedMessages.add(messageKey);
      setTimeout(() => processedMessages.delete(messageKey), 10000);

      const isOwner = Array.isArray(OWNERS_DATA) && OWNERS_DATA.some((owner) => owner.jid === senderJid);
      let limit = { canUse: true, remaining: Infinity };
      if (!isOwner) {
        limit = checkAndDecrementLimit(senderJid, "docconvert", 7);
        if (!limit.canUse) {
          await sock.sendMessage(
            from,
            {
              text: `🔔 Maaf, jatah konversi dokumen Anda hari ini habis. (Sisa: ${limit.remaining}/7)`,
            },
            { quoted: msg }
          );
          return;
        }
      }

      saveLog(
        "LIMIT_SYSTEM",
        `${isOwner ? "👑 Akses tanpa limit untuk owner" : "Limit docconvert (" + limit.remaining + "/7)"} untuk ${senderJid} di ${from}`,
        isOwner
      );

      let messageToDownload = null;
      let sourceFileMessage = null;

      if (
        msg.message?.documentMessage &&
        (commandText === "/pdftoword" || text.toLowerCase().startsWith("/pdftoword "))
      ) {
        messageToDownload = msg;
        sourceFileMessage = msg.message.documentMessage;
      } else if (
        msg.message?.extendedTextMessage?.contextInfo?.quotedMessage?.documentMessage &&
        commandText === "/pdftoword"
      ) {
        const quotedMsg = msg.message.extendedTextMessage.contextInfo.quotedMessage;
        messageToDownload = {
          key: {
            remoteJid: from,
            id: msg.message.extendedTextMessage.contextInfo.stanzaId,
            participant: msg.message.extendedTextMessage.contextInfo.participant,
          },
          message: quotedMsg,
        };
        sourceFileMessage = quotedMsg.documentMessage;
      }

      if (!sourceFileMessage || !messageToDownload) {
        await sock.sendMessage(
          from,
          {
            text: "📄 Mohon kirim atau reply file dokumen PDF (.pdf) dengan perintah /pdftoword.",
          },
          { quoted: msg }
        );
        return;
      }

      if (sourceFileMessage.mimetype !== "application/pdf") {
        await sock.sendMessage(
          from,
          {
            text: "⚠️ Format file tidak didukung. Hanya file PDF (.pdf) yang bisa dikonversi ke Word.",
          },
          { quoted: msg }
        );
        return;
      }

      const originalFileName = sourceFileMessage.fileName || `document_${Date.now()}.pdf`;
      saveLog(
        "COMMAND_USED",
        `🔄📖 ${senderName} meminta /pdftoword untuk: ${originalFileName}`,
        isOwner
      );
      await sock.sendMessage(
        from,
        {
          text: `⏳ Sedang memproses konversi ${originalFileName} ke Word (.docx), mohon tunggu...`,
        },
        { quoted: msg }
      );
      await sock.sendPresenceUpdate("composing", from);

      const tempInputPath = path.join(
        TEMP_FOLDER,
        `input_pdf_${Date.now()}_${path.basename(originalFileName)}`
      );
      let tempOutputPath = "";

      try {
        const fileBuffer = await downloadMediaMessage(
          messageToDownload,
          "buffer",
          {},
          {
            logger: pino({ level: "silent" }),
            reuploadRequest: sock.updateMediaMessage,
          }
        );
        await fs.promises.writeFile(tempInputPath, fileBuffer);

        let result = await convertApi.convert(
          "docx",
          { File: tempInputPath },
          "pdf"
        );

        saveLog(
          "CONVERT_LOG",
          `📖 Konversi PDF ke Word: ${result.files?.length || 0} file.`,
          isOwner
        );

        if (result.files && result.files.length > 0) {
          const convertedFile = result.files[0];
          saveLog(
            "DEBUG_CONVERT",
            `🔍 File: Name='${convertedFile.Name}', FileName='${convertedFile.FileName}', name='${convertedFile.name}', Size='${convertedFile.Size}', Url='${convertedFile.Url}'`,
            isOwner
          );

          const fileNameFromApi =
            convertedFile.FileName ||
            convertedFile.name ||
            convertedFile.Name ||
            `converted_${Date.now()}.docx`;
          tempOutputPath = path.join(TEMP_FOLDER, fileNameFromApi);
          await convertedFile.save(tempOutputPath);

          const docxToSendBuffer = await fs.promises.readFile(tempOutputPath);
          const outputFileName =
            path.basename(originalFileName, path.extname(originalFileName)) +
            ".docx";

          await sock.sendMessage(
            from,
            {
              document: docxToSendBuffer,
              mimetype:
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
              fileName: outputFileName,
            },
            { quoted: msg }
          );

          saveLog(
            "DOC_CONVERT_SUCCESS",
            `✅ ${originalFileName} -> ${outputFileName} untuk ${senderName}`,
            isOwner
          );

          if (!isOwner && limit.remaining !== Infinity) {
            const featureNameFriendly = "Konversi PDF ke Word (/pdftoword)";
            const limitUsedNotification = `
🛡️ *LIMIT FITUR TERPAKAI* 🛡️

Anda telah menggunakan 1 jatah untuk fitur *${featureNameFriendly}*.\nSisa jatah Anda hari ini: ${limit.remaining}/7.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
            await sock.sendMessage(from, { text: limitUsedNotification }, { quoted: msg });
          }
        } else {
          await sock.sendMessage(
            from,
            { text: "🚫 Konversi gagal: tidak ada file hasil." },
            { quoted: msg }
          );
          saveLog(
            "CONVERT_FAIL",
            `❌ Konversi gagal untuk ${originalFileName}`
          );
        }
      } catch (err) {
        saveLog(
          "ERROR_LOG",
          `❌ Gagal konversi ${originalFileName}: ${err.message}`
        );
        let errorMsg = "🚫 Gagal konversi PDF ke Word.";
        if (err.response && err.response.data && err.response.data.Message) {
          errorMsg += `\nDetail: ${err.response.data.Message}`;
        } else if (err.toString().includes("timeout")) {
          errorMsg = "🚫 Proses timeout.";
        }
        await sock.sendMessage(from, { text: errorMsg }, { quoted: msg });
      } finally {
        try {
          if (fs.existsSync(tempInputPath)) {
            await fs.promises.unlink(tempInputPath);
            saveLog(
              "FILESYSTEM_DEBUG",
              `✅ File sementara dihapus: ${tempInputPath}`
            );
          }
          if (tempOutputPath && fs.existsSync(tempOutputPath)) {
            await fs.promises.unlink(tempOutputPath);
            saveLog(
              "FILESYSTEM_DEBUG",
              `✅ File output dihapus: ${tempOutputPath}`
            );
          }
        } catch (cleanupError) {
          saveLog(
            "FILESYSTEM_ERROR",
            `❌ Error cleanup /pdftoword: ${cleanupError.message}`
          );
        }
      }
      await sock.sendPresenceUpdate("available", from);
      return;
    }

    if (commandText === "/yta") {
      const messageKey = `${from}:${senderJid}:${fullArgs}:${msg.key.id}`;
      if (processedMessages.has(messageKey)) {
        return;
      }
      processedMessages.add(messageKey);
      setTimeout(() => processedMessages.delete(messageKey), 10000);

      const isOwner = Array.isArray(OWNERS_DATA) && OWNERS_DATA.some((owner) => owner.jid === senderJid);
      let limit = { canUse: true, remaining: Infinity };
      if (!isOwner) {
        limit = checkAndDecrementLimit(senderJid, "yta", 7);
        if (!limit.canUse) {
          await sock.sendMessage(
            from,
            {
              text: `🔔 Maaf, jatah /yta Anda hari ini habis. (Sisa: ${limit.remaining}/7)`,
            },
            { quoted: msg }
          );
          return;
        }
      }

      saveLog(
        "LIMIT_SYSTEM",
        `${isOwner ? "👑 Akses tanpa limit untuk owner" : "Limit yta (" + limit.remaining + "/7)"} untuk ${senderJid} di ${from}`,
        isOwner
      );

      const urlYt = fullArgs;
      saveLog("YOUTUBE_DL_DEBUG", `URL diterima untuk /yta: '${urlYt}'`);

      const youtubeUrlRegex = /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([\w-]{11})(?:\S+)?$/;
      const videoIdMatch = youtubeUrlRegex.exec(urlYt);
      const videoId = videoIdMatch ? videoIdMatch[1] : null;

      if (!videoId) {
        saveLog("YOUTUBE_DL_WARN", `Regex gagal mengekstrak Video ID dari URL: '${urlYt}'`);
        await sock.sendMessage(
          from,
          {
            text: "⚠️ URL YouTube tidak valid atau tidak dapat mengekstrak ID video. Pastikan URL lengkap dan benar dari YouTube (contoh: https://www.youtube.com/watch?v=xxxxxxxxxxx).",
          },
          { quoted: msg }
        );
        return;
      }

      const urlToProcess = urlYt;
      saveLog(
        "COMMAND_USED",
        `🎧 ${senderName} (${from.split("@")[0]}) meminta /yta untuk video ID: ${videoId} (URL: ${urlToProcess})`
      );
      await sock.sendMessage(
        from,
        {
          text: "⏳ Sedang mengambil info video YouTube dan menyiapkan audio (menggunakan yt-dlp)...",
        },
        { quoted: msg }
      );
      await sock.sendPresenceUpdate("composing", from);

      const tempOutputPath = path.join(TEMP_FOLDER, `audio_dlp_${videoId}_${Date.now()}.mp3`);
      let videoTitle = `Audio YouTube (${videoId})`;

      try {
        saveLog("YOUTUBE_DL_INFO", `Mencoba mendapatkan metadata untuk URL: ${urlToProcess}`);
        const metadata = await youtubedl(urlToProcess, {
          dumpSingleJson: true,
          noWarnings: true,
        });

        videoTitle = metadata.title
          ? metadata.title.replace(/[<>:"/\\|?*]+/g, "").substring(0, 100)
          : videoTitle;
        const duration = metadata.duration;

        if (duration && duration > 900) {
          await sock.sendMessage(
            from,
            {
              text: `🚫 Maaf, video terlalu panjang (${Math.floor(duration / 60)} menit). Maksimal 15 menit.`,
            },
            { quoted: msg }
          );
          saveLog("YOUTUBE_DL_WARN", `Video terlalu panjang (${duration}s) untuk ${senderName}: ${urlToProcess}`);
          await sock.sendPresenceUpdate("available", from);
          return;
        }

        saveLog("YOUTUBE_DL", `🎧 Mengunduh audio untuk: ${videoTitle} dari ${urlToProcess}`);
        await youtubedl(urlToProcess, {
          extractAudio: true,
          audioFormat: "mp3",
          audioQuality: 0,
          output: tempOutputPath,
          ffmpegPath: ffmpeg.path,
          noWarnings: true,
        });

        if (!fs.existsSync(tempOutputPath)) {
          throw new Error("File output MP3 tidak ditemukan setelah proses yt-dlp.");
        }
        const audioBuffer = await fs.promises.readFile(tempOutputPath);

        await sock.sendMessage(
          from,
          {
            audio: audioBuffer,
            mimetype: "audio/mpeg",
            fileName: `${videoTitle}.mp3`,
          },
          { quoted: msg }
        );

        saveLog("YOUTUBE_DL_SUCCESS", `✅ Audio "${videoTitle}" berhasil dikirim ke ${senderName}.`);

        if (!isOwner && limit.remaining !== Infinity) {
          const featureNameFriendly = "YouTube Audio Downloader (/yta)";
          const limitUsedNotification = `
🛡️ *LIMIT FITUR TERPAKAI* 🛡️

Anda telah menggunakan 1 jatah untuk fitur *${featureNameFriendly}*.\nSisa jatah Anda hari ini: ${limit.remaining}/7.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
          await sock.sendMessage(from, { text: limitUsedNotification });
        }
      } catch (error) {
        saveLog(
          "YOUTUBE_DL_ERROR",
          `❌ Gagal unduh/konversi YouTube untuk ${senderName} (URL: ${urlYt}): ${error.message || error}`
        );
        let errorMsgUser = "🚫 Maaf, terjadi kesalahan saat mengunduh audio YouTube.";
        if (error.stderr) {
          if (error.stderr.toLowerCase().includes("unavailable") || error.stderr.toLowerCase().includes("private video")) {
            errorMsgUser = "🚫 Maaf, video ini tidak tersedia, bersifat pribadi, atau ada batasan wilayah.";
          } else if (
            error.stderr.toLowerCase().includes("unable to download webpage") ||
            error.stderr.toLowerCase().includes("network error")
          ) {
            errorMsgUser = "🚫 Gagal terhubung ke YouTube. Periksa koneksi atau URL.";
          } else if (
            error.stderr.toLowerCase().includes("unable to extract video data") ||
            error.stderr.toLowerCase().includes("no video formats found")
          ) {
            errorMsgUser = "🚫 Tidak dapat mengekstrak data video. Mungkin URL tidak didukung.";
          } else {
            errorMsgUser += `\nDetail: ${error.stderr.substring(0, 150)}...`;
          }
        } else if (error.message && error.message.toLowerCase().includes("format not available")) {
          errorMsgUser = "🚫 Format audio yang diminta tidak tersedia.";
        } else if (error.message && error.message.toLowerCase().includes("non-zero exit code")) {
          errorMsgUser = "🚫 Proses unduh gagal. Pastikan URL valid.";
        }
        await sock.sendMessage(from, { text: errorMsgUser }, { quoted: msg });
      } finally {
        try {
          if (fs.existsSync(tempOutputPath)) {
            await fs.promises.unlink(tempOutputPath);
            saveLog("FILESYSTEM_DEBUG", `✅ File audio sementara dihapus: ${tempOutputPath}`);
          }
        } catch (cleanupError) {
          saveLog(
            "FILESYSTEM_ERROR",
            `❌ Error membersihkan file /yta: ${cleanupError.message}`
          );
        }
        await sock.sendPresenceUpdate("available", from);
      }
      return;
    }

    if (commandText === "/mp3tiktok" || commandText === "/tiktokdl" || commandText === "/ttdl") { // Combined all tiktok video/mp3 into one handler for simplicity and avoiding conflicts
      // Logic for /mp3tiktok and /tiktokdl is combined here.
      // The user's provided code block was only for /mp3tiktok but the error was on its `if` line.
      // I will put the full, corrected /mp3tiktok logic here, assuming user wants only this one.
      // If user intended a separate /mp4tiktok, that should be its own block with its own logic.
      // For now, I'm assuming the user's provided snippet was the problematic one.

      const messageKey = `${from}:${senderJid}:${fullArgs}:${msg.key.id}`;
      if (processedMessages.has(messageKey)) {
        saveLog("DEBUG", `Pesan duplikat terdeteksi: ${messageKey}`);
        return;
      }
      processedMessages.add(messageKey);
      setTimeout(() => processedMessages.delete(messageKey), 10000);

      const isOwner =
        Array.isArray(OWNERS_DATA) &&
        OWNERS_DATA.some((owner) => owner.jid === senderJid);
      let limit = { canUse: true, remaining: Infinity };
      if (!isOwner) {
        limit = checkAndDecrementLimit(senderJid, "tiktokMP3", 7); // Use senderJid for limit check
        if (!limit.canUse) {
          await sock.sendMessage(
            from,
            {
              text: `🔔 Maaf, jatah unduh audio TikTok Anda hari ini habis. (Sisa: ${limit.remaining}/7)`,
            },
            { quoted: msg }
          );
          return;
        }
      }

      saveLog(
        "LIMIT_SYSTEM",
        `🛡️ ${
          isOwner
            ? "👑 Akses tanpa limit untuk owner"
            : "Limit tiktokMP3 (" + limit.remaining + "/7)"
        } untuk ${senderJid} di ${from}`
      );

      const tiktokUrl = fullArgs;
      if (!tiktokUrl || (!tiktokUrl.includes("tiktok.com/") && !tiktokUrl.includes("vt.tiktok.com/"))) {
        await sock.sendMessage(
          from,
          {
            text: "⚠️ Mohon masukkan URL video TikTok yang valid.\nContoh: /mp3tiktok https://www.tiktok.com/@username/video/12345",
          },
          { quoted: msg }
        );
        return;
      }

      saveLog(
        "COMMAND_USED",
        `🎵 ${senderName} (${senderJid}) meminta /mp3tiktok untuk: ${tiktokUrl}`
      );
      await sock.sendMessage(
        from,
        { text: "⏳ Sedang memproses audio TikTok, mohon tunggu..." },
        { quoted: msg }
      );
      await sock.sendPresenceUpdate("composing", from);

      const tempInputVideoPath = path.join(
        TEMP_FOLDER,
        `tiktok_vid_in_${Date.now()}.mp4`
      );
      const tempOutputAudioPath = path.join(
        TEMP_FOLDER,
        `tiktok_audio_out_${Date.now()}.mp3`
      );
      let videoDescription = "Audio TikTok";

      try {
        const videoDownloadInfo = await downloadTikTokMedia(tiktokUrl, "video");
        if (
          !videoDownloadInfo.success ||
          !videoDownloadInfo.mediaUrl ||
          videoDownloadInfo.mediaType !== "video"
        ) {
          await sock.sendMessage(
            from,
            {
              text: `🚫 Gagal mendapatkan video TikTok: ${
                videoDownloadInfo.error || "Pastikan link adalah video."
              }`,
            },
            { quoted: msg }
          );
          return;
        }
        videoDescription = videoDownloadInfo.description || videoDescription;

        const videoResponse = await axios({
          method: "get",
          url: videoDownloadInfo.mediaUrl,
          responseType: "stream",
        });
        const writer = fs.createWriteStream(tempInputVideoPath);
        videoResponse.data.pipe(writer);
        await new Promise((resolve, reject) => {
          writer.on("finish", resolve);
          writer.on("error", reject);
        });
        saveLog(
          "TIKTOK_DL_DEBUG",
          `Video sementara disimpan di: ${tempInputVideoPath}`
        );

        await new Promise((resolve, reject) => {
          ffmpeg(tempInputVideoPath)
            .audioBitrate(128)
            .toFormat("mp3")
            .save(tempOutputAudioPath)
            .on("end", () => {
              saveLog(
                "FFMPEG_SUCCESS",
                `✅ Konversi ke MP3 selesai: ${tempOutputAudioPath}`
              );
              resolve();
            })
            .on("error", (err) => {
              saveLog("FFMPEG_ERROR", `❌ Gagal konversi MP3: ${err.message}`);
              reject(err);
            });
        });

        try {
          await fs.promises.access(tempOutputAudioPath);
        } catch {
          throw new Error("File MP3 tidak ditemukan setelah konversi FFmpeg.");
        }

        let audioBuffer;
        try {
          audioBuffer = await fs.promises.readFile(tempOutputAudioPath);
        } catch (err) {
          saveLog(
            "FILESYSTEM_ERROR",
            `❌ Gagal membaca file MP3: ${err.message}`
          );
          throw err;
        }

        await sock.sendMessage(
          from,
          {
            audio: audioBuffer,
            mimetype: "audio/mpeg",
            fileName: `${videoDescription.substring(0, 50)}.mp3`,
          },
          { quoted: msg }
        );
        saveLog(
          "TIKTOK_DL_SUCCESS",
          `✅ Audio TikTok "${videoDescription.substring(
            0,
            30
          )}" dikirim ke ${senderName}.`
        );

        if (!isOwner && limit.remaining !== Infinity) {
          const limitUsedNotification = `
🛡️ *LIMIT FITUR TERPAKAI* 🛡️

Anda telah menggunakan 1 jatah untuk *TikTok Audio Downloader (/mp3tiktok)*.\nSisa jatah Anda hari ini: ${limit.remaining}/7.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!
          `.trim();
          await sock.sendMessage(from, { text: limitUsedNotification });
        }
      } catch (error) {
        saveLog(
          "TIKTOK_DL_ERROR",
          `❌ Error /mp3tiktok untuk ${senderName}: ${error.message}`
        );
        await sock.sendMessage(
          from,
          {
            text: `🚫 Gagal memproses audio TikTok: ${error.message.substring(
              0,
              100
            )}`,
          },
          { quoted: msg }
        );
      } finally {
        try {
          if (await fs.promises.access(tempInputVideoPath).catch(() => false)) {
            await fs.promises.unlink(tempInputPath);
            saveLog(
              "FILESYSTEM_DEBUG",
              `✅ File video sementara dihapus: ${tempInputPath}`
            );
          }
          if (
            await fs.promises.access(tempOutputAudioPath).catch(() => false)
          ) {
            await fs.promises.unlink(tempOutputAudioPath);
            saveLog(
              "FILESYSTEM_DEBUG",
              `✅ File audio sementara dihapus: ${tempOutputAudioPath}`
            );
          }
        } catch (cleanupError) {
          saveLog(
            "FILESYSTEM_ERROR",
            `❌ Gagal membersihkan file sementara: ${cleanupError.message}`
          );
        }
        await sock.sendPresenceUpdate("available", from);
      }
      return;
    }

    if (commandText === "/sticker" || commandText === "/stiker") {
      const messageKey = `${from}:${senderJid}:${fullArgs}:${msg.key.id}`;
      if (processedMessages.has(messageKey)) {
        saveLog("DEBUG", `Pesan duplikat terdeteksi: ${messageKey}`);
        return;
      }
      processedMessages.add(messageKey);
      setTimeout(() => processedMessages.delete(messageKey), 10000);

      const isOwner =
        Array.isArray(OWNERS_DATA) &&
        OWNERS_DATA.some((owner) => owner.jid === senderJid);
      let limit = { canUse: true, remaining: Infinity };
      if (!isOwner) {
        limit = checkAndDecrementLimit(from, "sticker", 7);
        if (!limit.canUse) {
          await sock.sendMessage(
            from,
            {
              text: `🔔 Maaf, jatah /sticker Anda hari ini habis. (Sisa: ${limit.remaining}/7)`,
            },
            { quoted: msg }
          );
          return;
        }
      }

      saveLog(
        "LIMIT_SYSTEM",
        `🛡️ ${
          isOwner
            ? "👑 Akses tanpa limit untuk owner"
            : "Limit sticker (" + limit.remaining + "/7)"
        } untuk ${senderJid} di ${from}`
      );

      let messageToDownload = null;
      let isImage = false;
      let isVideo = false;
      if (
        msg.message?.imageMessage &&
        (commandText === "/sticker" ||
          commandText === "/stiker" ||
          text.toLowerCase().startsWith("/sticker ") ||
          text.toLowerCase().startsWith("/stiker "))
      ) {
        messageToDownload = msg;
        isImage = true;
      } else if (
        msg.message?.videoMessage &&
        (commandText === "/sticker" ||
          commandText === "/stiker" ||
          text.toLowerCase().startsWith("/sticker ") ||
          text.toLowerCase().startsWith("/stiker "))
      ) {
        messageToDownload = msg;
        isVideo = true;
      } else if (msg.message?.extendedTextMessage?.contextInfo?.quotedMessage) {
        const quoted =
          msg.message.extendedTextMessage.contextInfo.quotedMessage;
        messageToDownload = { key: msg.key, message: quoted };
        if (quoted.imageMessage) {
          isImage = true;
        } else if (quoted.videoMessage) {
          isVideo = true;
        }
      }

      if (isImage && messageToDownload) {
        saveLog(
          "COMMAND_USED",
          `🖼️ ${senderName} (${senderJid}) meminta /sticker untuk gambar`
        );
        await sock.sendMessage(
          from,
          { text: "🖼️ Sedang membuat stiker gambar..." },
          { quoted: msg }
        );
        await sock.sendPresenceUpdate("composing", from);

        try {
          const stream = await downloadMediaMessage(
            messageToDownload,
            "buffer",
            {},
            { reuploadRequest: sock.updateMediaMessage }
          );
          const stickerBuffer = await sharp(stream)
            .resize(512, 512, {
              fit: "contain",
              background: { r: 0, g: 0, b: 0, alpha: 0 },
            })
            .webp({ quality: 90 })
            .toBuffer();
          await sock.sendMessage(
            from,
            { sticker: stickerBuffer },
            { quoted: msg }
          );
          saveLog(
            "STICKER_SUCCESS",
            `🖼️✨ Stiker statis berhasil dikirim ke ${senderName}.`
          );

          if (!isOwner && limit.remaining !== Infinity) {
            const limitUsedNotification = `
🛡️ *LIMIT FITUR TERPAKAI* 🛡️

Anda telah menggunakan 1 jatah untuk *Pembuat Stiker (/sticker)*.\nSisa jatah Anda hari ini: ${limit.remaining}/7.\n\n💡 Jatah habis? Ketik */belilimit* untuk info!`.trim();
            await sock.sendMessage(from, { text: limitUsedNotification });
          }
        } catch (error) {
          saveLog(
            "STICKER_ERROR",
            `❌ Gagal membuat stiker statis untuk ${senderName}: ${error.message}`
          );
          await sock.sendMessage(
            from,
            { text: "🚫 Gagal buat stiker statis. Pastikan gambar valid." },
            { quoted: msg }
          );
        } finally {
          try {
            if (await fs.promises.access(tempInputPath).catch(() => false)) {
              await fs.promises.unlink(tempInputPath);
              saveLog(
                "FILESYSTEM_DEBUG",
                `✅ File video sementara dihapus: ${tempInputPath}`
              );
            }
            if (await fs.promises.access(tempOutputPath).catch(() => false)) {
              await fs.promises.unlink(tempOutputPath);
              saveLog(
                "FILESYSTEM_DEBUG",
                `✅ File stiker sementara dihapus: ${tempOutputPath}`
              );
            }
          } catch (cleanupError) {
            saveLog(
              "FILESYSTEM_ERROR",
              `❌ Gagal membersihkan file sementara: ${cleanupError.message}`
            );
          }
        }
        await sock.sendPresenceUpdate("available", from);
        return;
      } else if (isVideo && messageToDownload) {
        const videoDetails =
          messageToDownload.key.id === msg.key.id && msg.message?.videoMessage
            ? msg.message.videoMessage
            : messageToDownload.message?.videoMessage;
        if (!videoDetails) {
          saveLog(
            "STICKER_ERROR",
            `❌ Tidak dapat menemukan detail video untuk ${senderName}`
          );
          await sock.sendMessage(
            from,
            { text: "🚫 Tidak dapat menemukan detail video." },
            { quoted: msg }
          );
          return;
        }
        if (videoDetails.seconds > 10 && !videoDetails.gifPlayback) {
          saveLog(
            "STICKER_ERROR",
            `❌ Video terlalu panjang (${videoDetails.seconds}s) untuk ${senderName}`
          );
          await sock.sendMessage(
            from,
            {
              text: `🚫 Video >10 detik (${videoDetails.seconds}d). Maks 10d.`,
            },
            { quoted: msg }
          );
          return;
        }

        saveLog(
          "COMMAND_USED",
          `🎥 ${senderName} (${senderJid}) meminta /sticker untuk video`
        );
        await sock.sendMessage(
          from,
          { text: "✨ Sedang membuat stiker animasi (mungkin perlu waktu)..." },
          { quoted: msg }
        );
        await sock.sendPresenceUpdate("composing", from);

        const tempInputPath = path.join(
          TEMP_FOLDER,
          `anim_in_${Date.now()}_${msg.key.id.substring(0, 5)}.mp4`
        );
        const tempOutputPath = path.join(
          TEMP_FOLDER,
          `anim_out_${Date.now()}_${msg.key.id.substring(0, 5)}.webp`
        );

        try {
          const stream = await downloadMediaMessage(
            messageToDownload,
            "buffer",
            {},
            { reuploadRequest: sock.updateMediaMessage }
          );
          await fs.promises.writeFile(tempInputPath, stream);
          saveLog(
            "FILESYSTEM_DEBUG",
            `✅ File video sementara disimpan: ${tempInputPath}`
          );

          await new Promise((resolve, reject) => {
            ffmpeg(tempInputPath)
              .outputOptions([
                "-vf",
                `fps=15,scale=512:512:force_original_aspect_ratio=decrease:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=social[p];[s1][p]paletteuse=dither=sierra2_4a`,
                "-loop",
                "0",
                "-an",
                "-vsync",
                "cfr",
              ])
              .toFormat("webp")
              .save(tempOutputPath)
              .on("end", () => {
                saveLog(
                  "FFMPEG_SUCCESS",
                  `✅ FFmpeg selesai: ${tempOutputPath}`
                );
                resolve();
              })
              .on("error", (err) => {
                saveLog("FFMPEG_ERROR", `❌ FFmpeg gagal: ${err.message}`);
                reject(err);
              });
          });

          await fs.promises.access(tempOutputPath);
          const stickerBuffer = await fs.promises.readFile(tempOutputPath);
          await sock.sendMessage(
            from,
            { sticker: stickerBuffer },
            { quoted: msg }
          );
          saveLog(
            "STICKER_SUCCESS",
            `✅✩✩ Stiker animasi berhasil dikirim ke ${senderName}.`
          );

          if (!isOwner && limit.remaining !== Infinity) {
            const limitUsedNotification = `
🖱️ *LIMIT FITUR TERPAKAI* 🖱️

Anda telah menggunakan 1 jatah untuk *Pembuat Stiker Animasi (/sticker)*.\nSisa jatah Anda hari ini: ${limit.remainingLimit}/7.\n\n📢 Jatah habis? Ketik */belilimit* untuk info!
            `.trim();
            await sock.sendMessage(from, { text: limitUsedNotification });
          }
        } catch (error) {
          saveLog(
            "STICKER_ERROR",
            `❌ Gagal membuat stiker animasi untuk ${senderName}: ${error.message}`
          );
          await sock.sendMessage(
            from,
            {
              text: "🚫 Gagal buat stiker animasi. Pastikan FFmpeg dan media valid.",
            },
            { quoted: msg }
          );
        } finally {
          try {
            if (await fs.promises.access(tempInputPath).catch(() => false)) {
              await fs.promises.unlink(tempInputPath);
              saveLog(
                "FILESYSTEM_DEBUG",
                `✅ File video sementara dihapus: ${tempInputPath}`
              );
            }
            if (await fs.promises.access(tempOutputPath).catch(() => false)) {
              await fs.promises.unlink(tempOutputPath);
              saveLog(
                "FILESYSTEM_DEBUG",
                `✅ File stiker sementara dihapus: ${tempOutputPath}`
              );
            }
          } catch (cleanupError) {
            saveLog(
              "FILESYSTEM_ERROR",
              `❌ Gagal membersihkan file sementara: ${cleanupError.message}`
            );
          }
        }
        await sock.sendPresenceUpdate("available", from);
        return;
      }

      saveLog(
        "WARNING",
        `⚠️ ${senderName} (${senderJid}) menggunakan /sticker tanpa media yang valid`
      );
      await sock.sendMessage(
        from,
        {
          text: "⚠️ Reply gambar/GIF/video (<10s) atau kirim dengan caption /sticker!",
        },
        { quoted: msg }
      );
      return;
    }

    // --- FITUR BARU: /speed atau /status ---
    if (commandText === "/speed" || commandText === "/status") {
      saveLog(
        "COMMAND_USED",
        `📊 ${senderName} (${senderJid.split("@")[0]}) meminta status sistem.`
      );
      await sock.sendPresenceUpdate("composing", from);

      try {
        const os = require("os");
        const si = require("systeminformation");

        const mem = await si.mem();
        const ramTotal = mem?.total || 0;
        const ramUsed = mem?.used || 0;
        const ramTotalGB = (ramTotal / 1024 ** 3).toFixed(2);
        const ramUsedGB = (ramUsed / 1024 ** 3).toFixed(2);
        const ramUsagePct = ((ramUsed / ramTotal) * 100).toFixed(0);

        // RAM Status Emoji
        let ramStatus = "🟢";
        if (ramUsagePct >= 75) ramStatus = "🔴";
        else if (ramUsagePct >= 50) ramStatus = "🟠";

        const nodeMem = process.memoryUsage();
        const rssMB = (nodeMem.rss / 1024 ** 2).toFixed(2);
        const heapTotalMB = (nodeMem.heapTotal / 1024 ** 2).toFixed(2);
        const heapUsedMB = (nodeMem.heapUsed / 1024 ** 2).toFixed(2);
        const externalMB = (nodeMem.external / 1024 ** 2).toFixed(2);
        const arrayBuffersMB = nodeMem.arrayBuffers
          ? (nodeMem.arrayBuffers / 1024 ** 2).toFixed(2)
          : "N/A";

        const cpus = os.cpus();
        const cpuModel = cpus[0]?.model || "N/A";
        const numCores = cpus.length;

        const currentLoad = await si.currentLoad();
        const avgLoad = currentLoad?.currentLoad || 0;
        const avgSystemLoad = avgLoad.toFixed(2) + "%";

        // CPU Status Emoji
        let cpuStatus = "🟢";
        if (avgLoad >= 80) cpuStatus = "🔴";
        else if (avgLoad >= 50) cpuStatus = "🟠";

        // Detail tiap core
        let cpuCoreDetails = "";
        if (currentLoad?.cpus?.length) {
          currentLoad.cpus.forEach((core, index) => {
            const coreSpeed = cpus[index]?.speed || "N/A";
            const loadUser = core.loadUser.toFixed(2);
            const loadSystem = core.loadSystem.toFixed(2);
            const loadIdle = core.loadIdle.toFixed(2);
            cpuCoreDetails += `• Core ${index + 1} (${coreSpeed} MHz)\n`;
            cpuCoreDetails += `  ├─ User    : ${loadUser}%\n`;
            cpuCoreDetails += `  ├─ System : ${loadSystem}%\n`;
            cpuCoreDetails += `  └─ Idle    : ${loadIdle}%\n\n`;
          });
        }

        const responseText = `
💻 *STATUS SISTEM AERONIX* 💻
━━━━━━━━━━━━━━━━━━━━━━━━━━

💾 *RAM Server* ${ramStatus}
• Total    : ${ramTotalGB} GB
• Terpakai : ${ramUsedGB} GB
• Persen   : ${ramUsagePct}%

🧠 *Memori NodeJS*
• RSS       : ${rssMB} MB
• Heap Total  : ${heapTotalMB} MB
• Heap Used   : ${heapUsedMB} MB
• External    : ${externalMB} MB
• ArrayBuffer : ${arrayBuffersMB} MB

⚙️ *CPU Info* ${cpuStatus}
• Model     : ${cpuModel}
• Jumlah Core : ${numCores}

📊 *Load CPU per Core*
• ${avgSystemLoad}

━━━━━━━━━━━━━━━━━━━━━━━━━━
🕒 ${new Date().toLocaleString("id-ID")}
`.trim();

        await sock.sendMessage(from, { text: responseText }, { quoted: msg });
        saveLog("SYSTEM_STATUS", `📊 Status sistem dikirim ke ${senderName}`);
      } catch (error) {
        console.error(`[${getTime()}] ❌ Error di perintah /speed:`, error);
        saveLog("ERROR", `❌ Error di perintah /speed: ${error.message}`);
        await sock.sendMessage(
          from,
          { text: "🚫 Maaf, gagal mendapatkan informasi server saat ini." },
          { quoted: msg }
        );
      }

      await sock.sendPresenceUpdate("available", from);
      return;
    }

    if (commandText === "/fiturpremium") {
      if (!isUserSubscribed(from) && !isOwner) {
        await sock.sendMessage(
          from,
          {
            text: "👑 Maaf, ini fitur khusus Premium/Owner! Ketik /subscribeinfo.",
          },
          { quoted: msg }
        );
        return;
      }
      saveLog("COMMAND_USED", `💎 ${senderName} mengakses /fiturpremium.`);
      await sock.sendMessage(
        from,
        {
          text: `🎉 Selamat datang di Fitur Premium,! 
        _Menu Fitur Premium Akan Segera Hadir_ `,
        },
        { quoted: msg }
      );
      return;
    }
    // AWAL FITUR PARAPHRASE
    if (commandText === "/paraphrase" || commandText === "/parafrase") {
      const messageKey = `${from}:${senderJid}:${fullArgs}:${msg.key.id}`;
      if (processedMessages.has(messageKey)) {
        saveLog("DEBUG", `Pesan duplikat terdeteksi: ${messageKey}`, false);
        return;
      }
      processedMessages.add(messageKey);
      setTimeout(() => processedMessages.delete(messageKey), 10000);

      const isOwner = Array.isArray(OWNERS_DATA) && OWNERS_DATA.some(owner => owner.jid === senderJid);
      let limit = { canUse: true, remaining: Infinity };
      if (!isOwner) {
        limit = checkAndDecrementLimit(senderJid, "paraphrase", 7); // Gunakan senderJid
        if (!limit.canUse) {
          saveLog("WARNING", `${senderName} (${senderJid}) kehabisan jatah /paraphrase (Sisa: ${limit.remaining}/7)`, false);
          await sock.sendMessage(from, { text: `🔔 Maaf, jatah /paraphrase Anda hari ini habis. (Sisa: ${limit.remaining}/7)` }, { quoted: msg });
          return;
        }
      }

      saveLog("LIMIT_SYSTEM", `${isOwner ? "👑 Akses tanpa limit untuk owner" : "Limit paraphrase (" + limit.remaining + "/7)"} untuk ${senderJid} di ${from}`, isOwner);

      let textToParaphrase = "";
      const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
      if (quotedMessage) {
        if (quotedMessage.conversation) textToParaphrase = quotedMessage.conversation;
        else if (quotedMessage.extendedTextMessage?.text) textToParaphrase = quotedMessage.extendedTextMessage.text;
        if (fullArgs) {
          textToParaphrase = fullArgs;
          saveLog("DEBUG", `Memparafrasekan teks yang diberikan setelah perintah /paraphrase dalam mode reply`, isOwner);
        }
      } else {
        textToParaphrase = fullArgs;
      }

      if (!textToParaphrase || textToParaphrase.length < 10) {
        saveLog("WARNING", `${senderName} (${senderJid}) memberikan teks tidak valid atau terlalu pendek untuk /paraphrase`, isOwner);
        await sock.sendMessage(from, { text: "✍️ Mohon berikan teks yang cukup untuk diparafrasekan (minimal 10 karakter)." }, { quoted: msg });
        return;
      }

      saveLog("COMMAND_USED", `${senderName} (${senderJid}) meminta /paraphrase untuk: "${textToParaphrase.substring(0, 50)}..."`, isOwner);
      await sock.sendMessage(from, { text: "🤖 Aeronix sedang memparafrasekan teks Anda..." }, { quoted: msg });
      await sock.sendPresenceUpdate("composing", from);

      try {
        const paraphrasingPrompt = `Parafrasekan teks berikut dengan gaya bahasa berbeda namun pertahankan makna aslinya:\n\nTeks:\n"""\n${textToParaphrase}\n"""\n\nHasil Parafrase:`;
        saveLog("AI_PARAPHRASE_REQUEST", `Meminta parafrase untuk teks sepanjang ${textToParaphrase.length} karakter dari ${senderName}`, isOwner);

        const paraphrasedText = await callGeminiAPI(paraphrasingPrompt, []);

        let responseSuffix = "";
        if (!isOwner && limit.remaining !== Infinity) {
          responseSuffix = `\n\n🛡️ *LIMIT FITUR TERPAKAI* 🛡️\nSisa jatah: ${limit.remaining - 1}/7\n💡 Jatah habis? Ketik */belilimit*!`;
          saveLog("DEBUG", `Notifikasi limit dikirim untuk ${senderName}: Sisa ${limit.remaining - 1}/7`, isOwner);
        }

        if (paraphrasedText && !paraphrasedText.toLowerCase().includes("maaf") && !paraphrasedText.toLowerCase().includes("error")) {
          const paraphraseResponse = `✍️ *Hasil Parafrase:*\n\n${paraphrasedText}${responseSuffix}`;
          await sock.sendMessage(from, { text: paraphraseResponse }, { quoted: msg });
          saveLog("AI_PARAPHRASE_SUCCESS", `Parafrase berhasil dikirim ke ${senderName}`, isOwner);
        } else {
          const errorMessage = paraphrasedText && paraphrasedText.includes("maaf") ? paraphrasedText : "🤖 Gagal memparafrasekan teks.";
          saveLog("AI_PARAPHRASE_ERROR", `Gagal memparafrasekan untuk ${senderName}: ${paraphrasedText || "Tidak ada respons"}`, isOwner);
          await sock.sendMessage(from, { text: errorMessage + responseSuffix }, { quoted: msg });
        }
      } catch (error) {
        saveLog("AI_PARAPHRASE_ERROR", `Error memparafrasekan teks untuk ${senderName}: ${error.message}`, isOwner);
        await sock.sendMessage(from, { text: "🤖 Kesalahan internal saat memparafrasekan teks." }, { quoted: msg });
      } finally {
        await sock.sendPresenceUpdate("available", from);
      }
      return;
    }

    if (commandText === "/qrcode") {
      const limit = checkAndDecrementLimit(senderJid, "qrcode", 7); // Gunakan senderJid
      if (!limit.canUse) {
        await sock.sendMessage(
          from,
          {
            text: `🔔 Maaf, jatah /qrcode Anda hari ini habis. (Sisa: ${limit.remaining}/7)`,
          },
          { quoted: msg }
        );
        return;
      }

      const textToEncode = fullArgs;

      if (!textToEncode) {
        await sock.sendMessage(
          from,
          {
            text: "❓ Teks atau URL apa yang ingin Anda jadikan Kode QR?\nContoh: /qrcode https://www.google.com",
          },
          { quoted: msg }
        );
        return;
      }

      saveLog(
        "COMMAND_USED",
        `📲 ${senderName} (${
          from.split("@")[0]
        }) meminta /qrcode untuk: "${textToEncode.substring(0, 50)}..."`
      );
      await sock.sendMessage(
        from,
        { text: "⏳ Sedang membuat Kode QR Anda, mohon tunggu..." },
        { quoted: msg }
      );
      await sock.sendPresenceUpdate("composing", from);

      try {
        const qrOptions = {
          errorCorrectionLevel: "H",
          type: "image/png",
          margin: 2,
          scale: 8,
        };

        const qrImageBuffer = await QRCode.toBuffer(textToEncode, qrOptions);

        await sock.sendMessage(
          from,
          {
            image: qrImageBuffer,
            caption: `🤖 Ini Kode QR Anda untuk:\n"${textToEncode}"\n\nMade by Aeronix Bot ✨`,
          },
          { quoted: msg }
        );
        saveLog(
          "QRCODE_SUCCESS",
          `✅ Kode QR berhasil dibuat untuk ${senderName} (${textToEncode.substring(
            0,
            30
          )}...).`
        );

        if (!isOwner && limit.remaining !== Infinity) { // Only notify if not owner/subscribed
          const featureNameFriendly = "Pembuat Kode QR (/qrcode)";
          const limitUsedNotification = `
🛡️ *LIMIT FITUR TERPAKAI* 🛡️

Anda telah menggunakan 1 jatah untuk fitur *${featureNameFriendly}*.\nSisa jatah Anda untuk fitur ini hari ini: ${limit.remaining}/7.\n\n💡 Jatah habis? Anda bisa menunggu reset harian (tengah malam) atau ketik */belilimit* untuk info opsi lainnya!
                `.trim();
          await sock.sendMessage(from, { text: limitUsedNotification });
        }
      } catch (error) {
        console.error(`[${getTime()}] ❌ Error membuat Kode QR:`, error);
        saveLog(
          "QRCODE_ERROR",
          `❌ Gagal membuat Kode QR untuk ${senderName}: ${error.message}`
        );
        await sock.sendMessage(
          from,
          {
            text: "🚫 Maaf, terjadi kesalahan saat membuat Kode QR. Pastikan teks tidak terlalu panjang atau coba lagi.",
          },
          { quoted: msg }
        );
      }
      await sock.sendPresenceUpdate("available", from);
      return;
    }

    // --- AWAL FITUR BENCANA ALAM DATA (PREVIOUSLY /BENCANA COMMAND) ---
    if (commandText === "/bencana") {
        await handleBencanaAlam(sock, from, msg, fullArgs, senderJid, isOwner);
        return;
    }
    // --- AKHIR FITUR BENCANA ALAM DATA ---

    // Jika pesan adalah salah satu command spesifik yang sudah ditangani sebelumnya
    // dan bukan bagian dari AI chat management (`/chat` atau `/exitai`),
    // maka hentikan pemrosesan agar tidak jatuh ke AI chat umum.
    // Ini penting agar perintah seperti /menu, /sticker, dll., tidak memicu AI chat.
    if (isSpecificCommand) {
        saveLog("INFO", `⏩ Melewatkan AI untuk perintah spesifik: ${commandText}`);
        return; 
    }

    // NEW: --- AWAL LOGIKA BARU UNTUK NOTIFIKASI SIAGA/WASPADA (Cek kata kunci) ---
    // Tempatkan ini SETELAH perintah spesifik, TETAPI SEBELUM custom keywords dan logika AI chat umum.
    if (text.trim()) { // Hanya cek jika ada teks
        const alertSent = await handleBencanaAlamAlert(sock, from, msg, text, senderJid);
        if (alertSent) {
            return; // Hentikan pemrosesan jika notifikasi siaga dikirim
        }
    }
    // --- AKHIR LOGIKA NOTIFIKASI SIAGA/WASPADA ---

    if (!text.trim()) {
      if (
        logText.startsWith("[Pesan Gambar]") ||
        logText.startsWith("[Pesan Video/GIF]")
      ) {
        saveLog(
          "INFO",
          `⏩ Melewatkan AI untuk pesan media tidak ditangani: ${logText}`
        );
        return;
      }
      saveLog("INFO", `⏩ Melewatkan AI untuk pesan kosong.`);
      return;
    }

    // --- NEW: Periksa Custom Keywords sebelum AI Chat umum ---
    // Pastikan ini dieksekusi sebelum AI chat umum
    const lowerText = text.toLowerCase().trim();
    if (customKeywords[lowerText]) {
        saveLog("CUSTOM_KEYWORD_HIT", `🔑 Keyword '${lowerText}' direspons untuk ${senderName}`);
        await sock.sendMessage(from, { text: customKeywords[lowerText] }, { quoted: msg });
        return; // Hentikan pemrosesan setelah merespons keyword
    }
    // --- END NEW: Periksa Custom Keywords ---


    // --- AWAL LOGIKA AI CHAT BIASA DENGAN KONTEKS (GEMINI) DAN LIMIT ---
    // Bagian ini hanya akan dieksekusi jika pengguna berada dalam sesi AI aktif
    let textForAI = text.trim();
    let proceedWithAIChat = false; // Default to false

    const sessionInfo = activeAISessions.get(senderJid);

    // 1. Cek apakah ada sesi AI aktif dan belum timeout
    if (sessionInfo && (Date.now() - sessionInfo.lastActive < AI_SESSION_TIMEOUT)) {
        proceedWithAIChat = true;
        sessionInfo.lastActive = Date.now(); // Perbarui waktu aktivitas terakhir
        activeAISessions.set(senderJid, sessionInfo); // Simpan info sesi yang diperbarui
        saveLog("AI_CHAT_SESSION_CONTINUE", `🧠 Sesi AI aktif ('${sessionInfo.model}') untuk ${senderName}.`);
    } else if (sessionInfo) { // Jika sesi ada tapi sudah timeout
        activeAISessions.delete(senderJid);
        chatHistories.delete(senderJid);
        saveLog("AI_CHAT_SESSION_EXPIRED", `🧠 Sesi AI untuk ${senderName} kedaluwarsa.`);
        // Kirim pesan timeout hanya jika pesan saat ini bukan perintah baru yang ingin ditangani
        if (!isSpecificCommand) {
            await sock.sendMessage(from, { text: `🤖 Mode chat AI Anda telah berakhir karena tidak ada aktivitas selama ${AI_SESSION_TIMEOUT / 60000} menit. Silakan ketik */chat gemini* untuk memulai sesi baru.` }, { quoted: msg });
        }
        return; // Hentikan pemrosesan jika sesi kedaluwarsa
    }

    // 2. Handle /aeronix prefix di grup: Arahkan ke menu /chat
    if (isGroup && textForAI.toLowerCase().startsWith(AI_GROUP_PREFIX + " ")) {
        saveLog("INFO", `⏩ Perintah /aeronix digunakan. Mengarahkan ke menu AI chat.`);
        await sock.sendMessage(from, { text: `Untuk memulai chat AI, silakan gunakan perintah */chat* dan pilih model yang Anda inginkan (misal: */chat gemini*).` }, { quoted: msg });
        return; // Hentikan pemrosesan
    }

    // 3. Jika tidak dalam sesi AI aktif DAN pesan bukan perintah spesifik,
    // maka abaikan atau berikan panduan (khusus chat pribadi).
    // Ini mencegah AI merespons di luar kendali dan tanpa mengonsumsi limit di awal.
    if (!proceedWithAIChat && text.trim()) { // Hanya jika ada teks non-command
        saveLog("INFO", `⏩ Pesan dari ${senderName} (${senderJid.split("@")[0]}) diabaikan oleh AI Chat (tidak dalam sesi AI).`);
        if (!isGroup) { // Di chat pribadi, berikan panduan. Di grup, cukup abaikan.
            await sock.sendMessage(from, { text: `Halo! Saya Aeronix Bot. Untuk memulai chat dengan AI, silakan ketik */chat* dan pilih model AI yang Anda inginkan.\nUntuk melihat semua fitur, ketik */menu*.` }, { quoted: msg });
        }
        return; // Hentikan pemrosesan, karena pesan ini bukan untuk AI chat (kecuali melalui sesi aktif)
    }


    // Jika kode mencapai sini dan proceedWithAIChat adalah true, berarti kita berada dalam sesi AI aktif
    if (proceedWithAIChat) { 
        try { // START of the try block
            let aiResponse;
            let selectedAIModel = sessionInfo.model;

            // Pilih API berdasarkan model yang aktif
            if (selectedAIModel === 'gemini') {
                aiResponse = await callGeminiAPI(textForAI, chatHistories.get(senderJid) || []);
            } else if (selectedAIModel === 'grok') { // NEW: Handle Grok
                aiResponse = await callGrokAPI(textForAI, chatHistories.get(senderJid) || []);
            }
            else { // Ini seharusnya tidak terjadi jika logika di atas benar, tapi sebagai fallback
                saveLog("AI_CHAT_ERROR", `❌ Model AI tidak didukung atau salah: ${selectedAIModel} untuk ${senderName}. Mengakhiri sesi.`);
                await sock.sendMessage(from, { text: `Maaf, model AI '${selectedAIModel}' tidak valid untuk obrolan. Sesi diakhiri. Silakan coba */chat gemini* atau */chat grok* lagi.` }, { quoted: msg });
                activeAISessions.delete(senderJid); // Akhiri sesi
                chatHistories.delete(senderJid);
                return;
            }

            let responseText = aiResponse;

            let finalMessageToSend = "";
            const aiSpeakerLabel = `🤖 *Aeronix (${selectedAIModel.toUpperCase()}) Menjawab:*\n`; // Label respons akan menyertakan model

            const isGeneratedErrorMessage =
                !responseText ||
                typeof responseText !== "string" ||
                !responseText.trim() ||
                responseText.includes("Maaf, layanan AI sedang tidak aktif") ||
                responseText.includes("Maaf, API Key Gemini tidak valid") ||
                responseText.includes("Maaf, batas API Gemini tercapai") ||
                responseText.includes("Maaf, ada gangguan dengan AI Gemini") ||
                responseText.includes(
                    "Maaf, respons diblokir karena alasan keamanan konten"
                ) ||
                // Tambahan untuk pesan error Grok
                responseText.includes("Maaf, integrasi Grok belum lengkap") ||
                responseText.includes("Maaf, API Key Grok tidak valid") ||
                responseText.includes("Maaf, batas penggunaan API Grok telah tercapai") ||
                responseText.includes("Maaf, terjadi kesalahan dari sisi AI Grok");


            if (isGeneratedErrorMessage) {
                saveLog(
                    "AI_CHAT_INFO",
                    `💬 Respons AI adalah error atau kosong: "${responseText}"`
                );
                finalMessageToSend =
                    responseText &&
                    typeof responseText === "string" &&
                    responseText.trim()
                        ? responseText
                        : "🤖 Maaf, Aeronix tidak bisa merespons saat ini.";
            } else {
                if (
                    typeof responseText === "string" &&
                    responseText.toLowerCase().startsWith("aeronix:")
                )
                    responseText = responseText.substring("aeronix:".length).trim();
                finalMessageToSend = aiSpeakerLabel + responseText;
            }

            let historyResponseToSave = responseText;
            if (isGeneratedErrorMessage && finalMessageToSend !== responseText) {
                historyResponseToSave = finalMessageToSend;
            } else if (
                isGeneratedErrorMessage &&
                !(responseText && responseText.trim())
            ) {
                historyResponseToSave = "Tidak ada respons dari AI.";
            } else if (
                !isGeneratedErrorMessage &&
                typeof responseText === "string" &&
                responseText.toLowerCase().startsWith("aeronix:")
            ) {
                historyResponseToSave = responseText
                    .substring("aeronix:".length)
                    .trim();
            }

            // Tambahkan riwayat ke chatHistories
            let userHistory = chatHistories.get(senderJid) || [];
            userHistory.push({ role: "user", content: textForAI });
            userHistory.push({ role: "assistant", content: historyResponseToSave });
            while (userHistory.length > MAX_HISTORY_PER_USER) userHistory.shift();
            chatHistories.set(senderJid, userHistory);

            let watermark = "";
            if (
                !isGeneratedErrorMessage &&
                responseText.length > 100 &&
                !/cryanox|ryan|aeronix|gemini|grok/i.test(responseText) // Tambahkan keyword Grok
            ) {
                watermark = `\n\n_🤖 AI response by Ryan_`;
            }

            if (finalMessageToSend.trim()) {
                let messagePayload = finalMessageToSend;
                if (!isGeneratedErrorMessage) messagePayload += watermark;

                await sock.sendMessage(
                    from,
                    { text: messagePayload.trim() },
                    { quoted: msg }
                );

                const previewResponse = (
                    isGeneratedErrorMessage ? finalMessageToSend : responseText
                )
                    .substring(0, 70)
                    .replace(/\n/g, "↵");
                saveLog(
                    "AI_RESPONSE_SENT",
                    `🤖💬 AI Aeronix -> ${senderName} (${
                        senderJid.split("@")[0]
                    }): "${previewResponse}..."`
                );
            } else {
                saveLog(
                    "AI_CHAT_WARN",
                    `⚠️ Respons AI kosong setelah semua proses untuk ${senderName}. Tidak ada pesan dikirim.`
                );
            }
        } catch (error) { // END of the try block, START of catch block
            saveLog(
                "AI_CHAT_FATAL_ERROR",
                `❌🚨 Error di blok AI Chat: ${error.message} \nStack: ${error.stack}`
            );
            await sock.sendMessage(
                from,
                {
                    text: `❌ Aduh, AI Aeronix sedang mengalami gangguan teknis parah. Coba lagi nanti ya.\n\nDetail: ${error.message.substring(
                        0,
                        50
                    )}...`,
                },
                { quoted: msg }
            );
            activeAISessions.delete(senderJid); // Akhiri sesi jika ada error
            chatHistories.delete(senderJid);
        } // END of catch block
        await sock.sendPresenceUpdate("available", from); // This line is OUTSIDE the try/catch, but still inside the `if (proceedWithAIChat)`
    } // END of `if (proceedWithAIChat)`
  });

  return sock;
}

// --- ERROR HANDLING ---
process.on("SIGINT", () => {
  saveLog("SYSTEM_EXIT", "🛑 Bot dihentikan (SIGINT).");
  process.exit(0);
});
process.on("SIGTERM", () => {
  saveLog("SYSTEM_EXIT", "🛑 Bot dihentikan (SIGTERM).");
  process.exit(0);
});
process.on("uncaughtException", (error) => {
  saveLog(
    "FATAL_ERROR",
    `❌🚨 Uncaught Exception: ${error.stack || error.message}`
  );
});
process.on("unhandledRejection", (reason, promise) => {
  const reasonMessage =
    reason instanceof Error ? reason.stack || reason.message : String(reason);
  saveLog("FATAL_ERROR", `❌🚨 Unhandled Rejection: ${reasonMessage}`);
});

// --- BAGIAN BANNER DAN START BOT YANG DIRAPIKAN ---
console.log(`\n
╔══════════════════════════════════════╗
║          🚀 BOT AERONIX AI 🚀        ║
║                                      ║
║            Made By: Cryanox          ║
║            Base By: Ryan             ║
║    WhatsApp: wa.me/6281215201077     ║
║                                      ║
╚══════════════════════════════════════╝
`);

saveLog("SYSTEM_START", "🚀 Memulai Bot Aeronix");
startBot().catch((error) => {
  saveLog(
    "FATAL_START_ERROR",
    `❌🚨 Gagal memulai bot: ${error.stack || error.message}`
  );
});
