export default function TermsPage() {
  return (
    <div className="min-h-screen bg-linear-to-br from-pink-400 via-fuchsia-400 to-rose-400 px-4 py-10">
      <div className="max-w-2xl mx-auto bg-white/20 backdrop-blur-md rounded-3xl p-8 shadow-2xl text-white">
        <div className="mb-6">
          <a href="/lobby" className="text-white/70 hover:text-white text-sm underline">← Kembali</a>
        </div>

        <h1 className="text-3xl font-extrabold mb-2">📋 Kebijakan Penggunaan</h1>
        <p className="text-white/60 text-sm mb-8">Berlaku sejak: 8 Mei 2026 · Ahhhh BABIIII</p>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">1. Penerimaan Ketentuan</h2>
          <p className="text-white/80 text-sm leading-relaxed">
            Dengan mendaftar dan menggunakan layanan Ahhhh BABIIII ("Permainan"), kamu menyetujui
            seluruh ketentuan yang tercantum di halaman ini. Jika kamu tidak setuju, harap hentikan
            penggunaan layanan.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">2. Akun Pengguna</h2>
          <ul className="text-white/80 text-sm leading-relaxed list-disc list-inside space-y-1">
            <li>Setiap pengguna hanya boleh memiliki <strong>satu akun aktif</strong>.</li>
            <li>Login secara bersamaan dari dua perangkat berbeda tidak diizinkan. Sesi lama akan diputus otomatis saat ada login baru.</li>
            <li>Kamu bertanggung jawab menjaga kerahasiaan password akun.</li>
            <li>Kami berhak menonaktifkan akun yang melanggar ketentuan ini.</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">3. Perilaku yang Dilarang</h2>
          <ul className="text-white/80 text-sm leading-relaxed list-disc list-inside space-y-1">
            <li>Menggunakan nama pengguna yang mengandung konten ofensif, SARA, atau tidak pantas.</li>
            <li>Melakukan cheat, hacking, atau eksploitasi bug untuk keuntungan tidak wajar.</li>
            <li>Mengirim pesan chat yang bersifat spam, pelecehan, atau ancaman.</li>
            <li>Mencoba mengakses data pemain lain secara tidak sah.</li>
          </ul>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">4. Konten dan Fitur Permainan</h2>
          <p className="text-white/80 text-sm leading-relaxed">
            Permainan ini disediakan "sebagaimana adanya". Kami berhak menambah, mengubah, atau
            menghapus fitur kapan saja tanpa pemberitahuan sebelumnya. Skor dan data permainan
            dapat direset dalam kondisi tertentu (seperti maintenance atau perbaikan bug besar).
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">5. Penghapusan Akun</h2>
          <p className="text-white/80 text-sm leading-relaxed">
            Kamu dapat menghapus akunmu kapan saja melalui halaman <a href="/account" className="underline hover:text-white">Kelola Akun</a>.
            Penghapusan bersifat permanen dan tidak dapat dipulihkan.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">6. Batasan Tanggung Jawab</h2>
          <p className="text-white/80 text-sm leading-relaxed">
            Permainan ini dibuat untuk tujuan hiburan. Kami tidak bertanggung jawab atas kerugian
            apapun yang timbul akibat penggunaan atau ketidakmampuan menggunakan layanan ini,
            termasuk kehilangan data atau gangguan koneksi.
          </p>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-bold mb-2">7. Perubahan Kebijakan</h2>
          <p className="text-white/80 text-sm leading-relaxed">
            Kami dapat memperbarui kebijakan ini sewaktu-waktu. Penggunaan berkelanjutan setelah
            perubahan berarti kamu menyetujui ketentuan yang diperbarui.
          </p>
        </section>

        <div className="mt-8 pt-6 border-t border-white/20 flex justify-center gap-4 text-xs">
          <a href="/privacy" className="text-white/60 hover:text-white underline">Kebijakan Privasi</a>
          <a href="/account" className="text-white/60 hover:text-white underline">Kelola Akun</a>
          <a href="/" className="text-white/60 hover:text-white underline">Beranda</a>
        </div>
      </div>
    </div>
  );
}
