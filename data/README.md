# Wordlist permainan

`indonesian-words.txt` berasal dari berkas `00-indonesian-wordlist.lst` pada repositori `za/id-wordlist` yang berlisensi Public Domain.

Daftar difilter menjadi kata unik huruf kecil ASCII sepanjang 2-15 karakter agar sesuai dengan keping papan. Dataset ini bukan layanan atau dataset resmi KBBI. Data yang sama ditanam oleh migrasi `supabase/migrations/20261117084500_indonesian_dictionary.sql`.

`javanese-words.txt` dibentuk dari kolom terjemahan Jawa pada `nsulistiyawan/sastra-jawa` (MIT), dinormalisasi menjadi token unik huruf kecil ASCII sepanjang 2-15 karakter. Salinan lisensinya tersedia di `JAVANESE_WORDLIST_LICENSE.txt`; data yang sama ditanam oleh migrasi `supabase/migrations/20261118120000_add_javanese_language.sql`.


`jambi-words.txt` berisi 2.524 lema dan sublema cetak tebal yang diekstrak dari *Kamus Melayu Jambi Dialek Suku Anak Dalam-Indonesia* (Kantor Bahasa Provinsi Jambi, 2021). Definisi dan contoh tidak disalin; tanda pemenggal suku kata dinormalisasi menjadi token unik huruf kecil ASCII sepanjang 2-15 karakter. Data yang sama ditanam oleh migrasi `supabase/migrations/20261118153000_add_jambi_language.sql`. Hak cipta publikasi sumber tetap milik penerbit.
