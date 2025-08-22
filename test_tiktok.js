// File: test_tiktok.js
try {
    const tiktokDLModule = require('@tobyg74/tiktok-api-dl');
    console.log("Isi dari require('@tobyg74/tiktok-api-dl'):", tiktokDLModule);

    if (tiktokDLModule && typeof tiktokDLModule.TiktokAPI === 'function') {
        console.log("✅ Fungsi TiktokAPI BERHASIL diimpor dan merupakan sebuah fungsi!");
        console.log("Tipe TiktokAPI:", typeof tiktokDLModule.TiktokAPI);
    } else if (tiktokDLModule) {
        console.log("⚠️ Library @tobyg74/tiktok-api-dl berhasil di-require, TAPI tiktokDLModule.TiktokAPI BUKAN fungsi atau tidak ada.");
        console.log("Tipe dari tiktokDLModule.TiktokAPI:", typeof tiktokDLModule.TiktokAPI);
        console.log("Properti yang tersedia di modul:", Object.keys(tiktokDLModule));
    } else {
        console.log("❌ Library @tobyg74/tiktok-api-dl GAGAL di-require atau mengembalikan undefined/null.");
    }
} catch (e) {
    console.error("❌❌❌ TERJADI ERROR SAAT REQUIRE @tobyg74/tiktok-api-dl:", e);
}