# Wordlist Indonesia

`indonesian-words.txt` berasal dari berkas `00-indonesian-wordlist.lst` pada repositori `za/id-wordlist` yang berlisensi Public Domain.

Daftar difilter menjadi kata unik huruf kecil ASCII sepanjang 2-15 karakter agar sesuai dengan keping papan. Dataset ini bukan layanan atau dataset resmi KBBI. Data yang sama ditanam oleh migrasi `supabase/migrations/20261117084500_indonesian_dictionary.sql`.

`javanese-words.txt` dibentuk dari kolom terjemahan Jawa pada `nsulistiyawan/sastra-jawa` (MIT), dinormalisasi menjadi token unik huruf kecil ASCII sepanjang 2-15 karakter. Salinan lisensinya tersedia di `JAVANESE_WORDLIST_LICENSE.txt`; data yang sama ditanam oleh migrasi `supabase/migrations/20261118120000_add_javanese_language.sql`.
