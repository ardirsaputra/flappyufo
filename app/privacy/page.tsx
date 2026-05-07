export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-pink-400 via-fuchsia-400 to-rose-400 px-4 py-10">
      <div className="max-w-2xl mx-auto bg-white/20 backdrop-blur-md rounded-3xl p-8 shadow-2xl text-white">
        <div className="mb-6">
          <a href="/lobby" className="text-white/70 hover:text-white text-sm underline">← Kembali</a>
        </div>

        <h1 className="text-3xl font-extrabold mb-2">🔒 Kebijakan Privasi</h1>
        <p className="text-white/60 text-sm mb-8">Berlaku sejak: 8 Mei 2026 · Ahhhh BABIIII</p>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">1. Data yang Kami Kumpulkan</h2>
          <p className="text-white/80 text-sm leading-relaxed mb-2">
            Kami hanya mengumpulkan data minimal yang diperlukan untuk menjalankan permainan:
          </p>
          <ul className="text-white/80 text-sm leading-relaxed list-disc list-inside space-y-1">
            <li><strong>Username</strong> — nama tampilan kamu di dalam permainan.</li>
            <li><strong>Password terenkripsi</strong> — disimpan dalam bentuk hash (scrypt), tidak pernah dalam bentuk teks biasa.</li>
            <li><strong>Skor permainan</strong> — rekam jejak skor terbaik untuk leaderboard.</li>
            <li><strong>Preferensi tampilan</strong> — warna karakter dan jenis karakter pilihan.</li>
            <li><strong>Tanggal pendaftaran</strong> — waktu akun dibuat.</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">2. Cara Kami Menggunakan Data</h2>
          <ul className="text-white/80 text-sm leading-relaxed list-disc list-inside space-y-1">
            <li>Mengautentikasi login dan menjaga keamanan akun.</li>
            <li>Menampilkan username dan karakter dalam sesi multiplayer.</li>
            <li>Menyimpan dan menampilkan skor di leaderboard.</li>
            <li>Memastikan hanya satu sesi aktif per akun (keamanan perangkat tunggal).</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">3. Penyimpanan dan Keamanan Data</h2>
          <ul className="text-white/80 text-sm leading-relaxed list-disc list-inside space-y-1">
            <li>Data disimpan dalam database PostgreSQL yang dikelola secara privat.</li>
            <li>Password dienkripsi menggunakan algoritma <strong>scrypt</strong> dengan salt acak.</li>
            <li>Preferensi tampilan juga disimpan secara lokal di perangkat kamu (localStorage).</li>
            <li>Kami tidak menggunakan cookies pelacak atau layanan analytics pihak ketiga.</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">4. Berbagi Data dengan Pihak Ketiga</h2>
          <p className="text-white/80 text-sm leading-relaxed">
            Kami <strong>tidak menjual, menyewakan, atau membagikan</strong> data pribadimu kepada
            pihak ketiga manapun. Username dan skor yang muncul di leaderboard bersifat publik
            dalam konteks permainan ini saja.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">5. Hak Pengguna</h2>
          <ul className="text-white/80 text-sm leading-relaxed list-disc list-inside space-y-1">
            <li><strong>Mengubah password</strong> kapan saja melalui halaman <a href="/account" className="underline hover:text-white">Kelola Akun</a>.</li>
            <li><strong>Menghapus akun</strong> beserta seluruh data secara permanen kapan saja.</li>
            <li>Meminta klarifikasi mengenai data yang kami simpan.</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">6. Sesi dan Koneksi Real-time</h2>
          <p className="text-white/80 text-sm leading-relaxed">
            Koneksi multiplayer menggunakan WebSocket (Socket.IO). Selama sesi berlangsung, data
            posisi dan skor dikirim secara real-time ke server dan pemain lain dalam room yang sama.
            Data ini bersifat sementara dan tidak disimpan setelah sesi berakhir.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">7. Perubahan Kebijakan</h2>
          <p className="text-white/80 text-sm leading-relaxed">
            Jika kami melakukan perubahan signifikan pada kebijakan ini, kami akan memperbarui
            tanggal berlaku di bagian atas halaman. Penggunaan layanan secara berkelanjutan
            merupakan persetujuanmu terhadap kebijakan yang berlaku.
          </p>
        </section>

        <div className="mt-8 pt-6 border-t border-white/20 flex justify-center gap-4 text-xs">
          <a href="/terms" className="text-white/60 hover:text-white underline">Kebijakan Penggunaan</a>
          <a href="/account" className="text-white/60 hover:text-white underline">Kelola Akun</a>
          <a href="/" className="text-white/60 hover:text-white underline">Beranda</a>
        </div>
      </div>
    </div>
  );
}
