# KataKita Indonesia

Permainan susun kata daring untuk dua pemain guest. Pemain dapat membuat ruang privat, memilih batas waktu, membagikan invitation link, bermain realtime, dan mendapatkan hasil pertandingan.

## Fitur

- Guest tanpa email atau password
- Invitation link dan kode ruang enam karakter
- Dua pemain realtime dengan status online
- Pilihan waktu 5, 10, 15, atau 30 menit per pemain
- Papan 15 x 15, rak privat, skor server-side, menyerah, dan timeout
- Penentuan pemenang serta pembagian hasil
- Backsound prosedural Web Audio tanpa aset berhak cipta
- Responsif untuk desktop dan ponsel

## Menyiapkan Supabase

1. Buat proyek Supabase.
2. Aktifkan Anonymous Sign-Ins pada Authentication.
3. Jalankan seluruh isi `supabase/schema.sql` melalui SQL Editor.
4. Isi `SUPABASE_URL` dan `SUPABASE_PUBLISHABLE_KEY` pada `js/config.js`.
5. Push perubahan ke GitHub Pages.

Publishable key memang berada di frontend. Keamanan data tetap dijaga oleh RLS dan fungsi database; jangan pernah memasukkan secret/service-role key.

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

## Demo

https://hafizhvergiansyah.github.io/katakita-indonesia/