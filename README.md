# KataKita Indonesia

Permainan susun kata daring untuk dua pemain guest. Pemain dapat membuat ruang privat, memilih batas waktu, membagikan invitation link, bermain realtime, dan mendapatkan hasil pertandingan.

## Fitur

- Guest tanpa email atau password
- Invitation link dan kode ruang enam karakter
- Dua pemain realtime dengan status online
- Pilihan waktu 5, 10, 15, atau 30 menit per pemain
- Papan 15 x 15, rak privat, skor server-side, menyerah, dan timeout
- Pemeriksaan kata utama dan silang memakai 78.064 kata Indonesia di server
- Penentuan pemenang serta pembagian hasil
- Backsound prosedural Web Audio tanpa aset berhak cipta
- Responsif untuk desktop dan ponsel

## Menyiapkan Supabase

1. Buat dan tautkan proyek Supabase.
2. Aktifkan Anonymous Sign-Ins pada Authentication.
3. Jalankan `npx --yes supabase@3.2.0 db push --remote` agar schema dan kamus termigrasi.
4. Isi `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` pada `js/config.js`.
5. Push perubahan ke GitHub Pages.

Publishable key memang berada di frontend. Keamanan data tetap dijaga oleh RLS dan fungsi database; jangan pernah memasukkan secret/service-role key.

Checker menggunakan wordlist Public Domain dari `za/id-wordlist`, difilter ke huruf A-Z sepanjang 2-15 karakter. Wordlist ini bukan layanan atau dataset resmi KBBI; validasi dilakukan di transaksi Supabase agar kedua pemain selalu menerima hasil yang sama.

## Menjalankan lokal

Gunakan server HTTP lokal agar JavaScript module dapat dimuat:

```powershell
node local-server.mjs
```

Buka `http://localhost:4173`.

## Pemeriksaan

```powershell
npm test
```

Untuk pengujian dua guest melalui Chrome Headless, jalankan server lokal pada terminal pertama lalu:

```powershell
npm run test:e2e
```

## Demo

https://hafizhvergiansyah.github.io/katakita-indonesia/
