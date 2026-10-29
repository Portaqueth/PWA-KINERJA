const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycby8SFgzN7KiBIL_CjygSG00G6zun8XJJJBDTRacT5bEmPKLJUvPPSihY9ekuOZ2DpL4/exec";

let localMasterData = [];
let currentUser = null;
let userKegiatanData = [];
let currentCalendarDate = new Date();
let USER_TARGET_POIN = parseInt(localStorage.getItem("pwa_target_poin")) || 10000;
let currentActiveFilter = "all";

let LIBUR_NASIONAL = [
  "2026-01-01", "2026-01-16", "2026-02-17", "2026-03-03", "2026-03-19",
  "2026-03-20", "2026-03-21", "2026-04-03", "2026-05-01", "2026-05-14",
  "2026-05-25", "2026-05-27", "2026-06-01", "2026-08-17", "2026-08-25",
  "2026-12-25"
];

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024; // MAKSIMAL 2 MB

document.addEventListener("DOMContentLoaded", () => {
  setupTabSwitcher();
  initApp();
  updateCurrentPeriodTitle();
  fetchMasterAktivitas();
  setupValidationRules();
  setupQuickActionButtons();
  setupCalendarControls();
  setupSettingsEvents();
  setupNotifEvents();
  setupTodoList();
  setupSidebarToggle();
  setupCustomFileUpload();
  setupQuickFilterEvents();
  fetchHolidaysFromPublicAPI();
});

function fetchMasterAktivitas() {
  const selectElem = document.getElementById("pwaAktivitasInput");
  if (selectElem) {
    selectElem.innerHTML = '<option value="">⏳ Memuat data dari Google Sheets...</option>';
  }

  fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "get_master_aktivitas" }) })
    .then(res => res.json())
    .then(res => {
      if (res.status === "success" && Array.isArray(res.data) && res.data.length > 0) {
        localMasterData = res.data;
        renderMasterAktivitasDatalist("");
      } else {
        if (selectElem) selectElem.innerHTML = '<option value="">⚠️ Data Gagal Dimuat</option>';
      }
    })
    .catch(err => {
      console.error("Gagal memuat master aktivitas:", err);
      if (selectElem) selectElem.innerHTML = '<option value="">⚠️ Error Koneksi / URL Script</option>';
    });
}

function setupQuickFilterEvents() {
  const filterBtns = document.querySelectorAll(".chip-filter");
  const inputSearch = document.getElementById("inputSearchKeyword");

  filterBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      filterBtns.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentActiveFilter = btn.getAttribute("data-filter");
      renderMasterAktivitasDatalist(inputSearch ? inputSearch.value.trim() : "");
    });
  });

  if (inputSearch) {
    inputSearch.addEventListener("input", (e) => {
      renderMasterAktivitasDatalist(e.target.value.trim());
    });
  }
}

// OPTIMASI: BATASI MAKSIMAL 50 OPSI DI RENDER AGAR RINGAN & TIDAK LAG
function renderMasterAktivitasDatalist(keyword = "") {
  const selectElem = document.getElementById("pwaAktivitasInput");
  const matchBadge = document.getElementById("aktivitasMatchCount");
  if (!selectElem) return;

  selectElem.innerHTML = '<option value="">-- Pilih Aktivitas Baku --</option>';
  const kw = keyword.toLowerCase();
  let matchCount = 0;
  const MAX_DISPLAY_OPTIONS = 50; // Batas render cepat

  if (!localMasterData || localMasterData.length === 0) {
    if (matchBadge) matchBadge.innerText = "0 Opsi Ditemukan";
    return;
  }

  for (let i = 0; i < localMasterData.length; i++) {
    const item = localMasterData[i];
    const namaAkt = item.aktivitas || item.namaAktivitas || item.Aktivitas_Baku || "";
    if (!namaAkt) continue;

    const namaLower = namaAkt.toLowerCase();

    let passCategory = true;
    if (currentActiveFilter === "layanan") passCategory = namaLower.includes("layan");
    else if (currentActiveFilter === "dokumen") passCategory = namaLower.includes("dokumen") || namaLower.includes("sk") || namaLower.includes("berkas") || namaLower.includes("surat") || namaLower.includes("draft") || namaLower.includes("konsep");
    else if (currentActiveFilter === "rapat") passCategory = namaLower.includes("rapat") || namaLower.includes("koordinasi") || namaLower.includes("sosialisasi") || namaLower.includes("pimpinan");
    else if (currentActiveFilter === "evaluasi") passCategory = namaLower.includes("evaluasi") || namaLower.includes("laporan") || namaLower.includes("telaah") || namaLower.includes("verifikasi") || namaLower.includes("validasi");

    let passKeyword = true;
    if (kw) passKeyword = namaLower.includes(kw);

    if (passCategory && passKeyword) {
      matchCount++;

      if (matchCount <= MAX_DISPLAY_OPTIONS) {
        const opt = document.createElement("option");
        opt.value = namaAkt;
        opt.innerText = namaAkt;
        selectElem.appendChild(opt);
      }
    }
  }

  if (matchBadge) {
    if (matchCount > MAX_DISPLAY_OPTIONS) {
      matchBadge.innerText = `${matchCount} Ditemukan (Menampilkan 50 Teratas - Ketik Kata Kunci untuk Mempersempit)`;
    } else {
      matchBadge.innerText = `${matchCount} Opsi Ditemukan`;
    }
  }
}

function setupFormKegiatan() {
  const selectAktivitas = document.getElementById("pwaAktivitasInput");
  const inputSatuan = document.getElementById("pwaSatuan");
  const inputKuantitas = document.getElementById("pwaKuantitas");
  const displayWaktu = document.getElementById("displayWaktu");
  const displayPoint = document.getElementById("displayPoint");

  let selectedWaktu = 0;
  let selectedPoint = 0;
  let selectedSatuan = "Poin";

  function handleAktivitasChange(typedValue) {
    const match = localMasterData.find(m => {
      const namaAkt = m.aktivitas || m.namaAktivitas || m.Aktivitas_Baku;
      return namaAkt === typedValue;
    });

    if (match) {
      selectedWaktu = parseInt(match.waktu) || 0;                          // Kolom F: Waktu
      selectedPoint = parseInt(match.point) || parseInt(match.beban) || 0; // Kolom G: Beban
      selectedSatuan = match.satuan || "Poin";                             // Kolom C: Satuan
    } else {
      selectedWaktu = 0;
      selectedPoint = 0;
      selectedSatuan = "Poin";
    }

    if (inputSatuan) inputSatuan.value = selectedSatuan;
    updateCalc();
  }

  if (selectAktivitas) {
    selectAktivitas.addEventListener("change", (e) => handleAktivitasChange(e.target.value));
  }

  if (inputKuantitas) inputKuantitas.addEventListener("input", updateCalc);

  function updateCalc() {
    const qty = parseInt(inputKuantitas.value) || 1;
    const totalWaktu = (selectedWaktu * qty) || 0;
    const totalPoint = (selectedPoint * qty) || 0;

    if (displayWaktu) displayWaktu.innerText = `${totalWaktu} Menit`;
    if (displayPoint) displayPoint.innerText = `${totalPoint} Poin`;
  }

  const formKegiatan = document.getElementById("formKegiatanPWA");
  const btnSubmit = document.getElementById("btnSimpanPWA");

  if (formKegiatan) {
    formKegiatan.addEventListener("submit", (e) => {
      e.preventDefault();
      const selectedVal = selectAktivitas.value.trim();
      if (!selectedVal) {
        alert("⚠️ Silakan pilih salah satu Nama Aktivitas Baku dari daftar terlebih dahulu!");
        return;
      }

      const fileInput = document.getElementById("pwaFileInput");

      if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerText = "⏳ Memproses & Mengompres Gambar...";
      }

      if (fileInput && fileInput.files.length > 0) {
        compressAndProcessFile(fileInput.files[0], (fileData, fileName, mimeType) => {
          saveKegiatanProcess(fileData, fileName, mimeType);
        });
      } else {
        saveKegiatanProcess("", "", "");
      }
    });
  }
}

function saveKegiatanProcess(fileData, fileName, mimeType) {
  const btnSubmit = document.getElementById("btnSimpanPWA");
  const qty = parseInt(document.getElementById("pwaKuantitas").value) || 1;
  const selectedAktivitas = document.getElementById("pwaAktivitasInput").value.trim();
  
  const match = localMasterData.find(m => {
    const namaAkt = m.aktivitas || m.namaAktivitas || m.Aktivitas_Baku;
    return namaAkt === selectedAktivitas;
  });

  const currentSatuan = match ? (match.satuan || "Poin") : "Poin";

  const payload = {
    action: "save_kegiatan",
    nip: currentUser.nip,
    namaPegawai: currentUser.nama.toUpperCase(),
    tanggal: document.getElementById("inputTanggal").value,
    aktivitas: selectedAktivitas,
    satuan: currentSatuan,
    kuantitas: qty,
    durasi: match ? (parseInt(match.waktu) || 0) * qty : 0,
    point: match ? (parseInt(match.point || match.beban) || 0) * qty : 0,
    keterangan: document.getElementById("pwaKeterangan").value,
    fileData: fileData,
    fileName: fileName,
    mimeType: mimeType
  };

  fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) })
    .then(res => res.json())
    .then(data => {
      alert(data.message);
      if (data.status === "success") {
        const draftData = { aktivitas: payload.aktivitas, keterangan: payload.keterangan };
        localStorage.setItem("ekinerja_last_draft", JSON.stringify(draftData));
        renderDraftEkinerja(draftData.aktivitas, draftData.keterangan);
        loadUserKegiatan(currentUser.nip);
      }
    })
    .finally(() => {
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerText = "💾 Simpan Ke Jurnal & Dapatkan Copy Teks";
      }
    });
}

function setupCustomFileUpload() {
  const fileInput = document.getElementById("pwaFileInput");
  const fileStatus = document.getElementById("pwaFileName");
  const btnSelectText = document.getElementById("btnSelectFileText");
  const uploadContainer = document.querySelector(".custom-file-upload");

  if (fileInput && uploadContainer) {
    fileInput.addEventListener("change", (e) => {
      if (e.target.files.length > 0) {
        const file = e.target.files[0];

        if (file.size > MAX_FILE_SIZE_BYTES) {
          alert(`⚠️ Ukuran file melebihi batas maksimal 2 MB!\nUkuran file Anda: ${(file.size / (1024 * 1024)).toFixed(2)} MB.\n\nSilakan pilih foto/file yang lebih kecil.`);
          fileInput.value = "";
          if (btnSelectText) btnSelectText.innerText = "Klik untuk Pilih File / Foto (Maks 2 MB)";
          if (fileStatus) fileStatus.innerText = "Format: JPG, PNG, PDF, DOCX (Sistem otomatis membatasi max 2 MB)";
          uploadContainer.classList.remove("has-file");
          return;
        }

        if (btnSelectText) btnSelectText.innerText = "✓ File Terpilih (Sesuai Batas < 2 MB)";
        if (fileStatus) fileStatus.innerText = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        uploadContainer.classList.add("has-file");
      } else {
        if (btnSelectText) btnSelectText.innerText = "Klik untuk Pilih File / Foto (Maks 2 MB)";
        if (fileStatus) fileStatus.innerText = "Format: JPG, PNG, PDF, DOCX (Sistem otomatis membatasi max 2 MB)";
        uploadContainer.classList.remove("has-file");
      }
    });
  }
}

function compressAndProcessFile(file, callback) {
  if (!file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (evt) => callback(evt.target.result, file.name, file.type);
    reader.readAsDataURL(file);
    return;
  }

  const reader = new FileReader();
  reader.onload = (evt) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      const MAX_WIDTH = 1200;
      const MAX_HEIGHT = 1200;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.7);
      callback(compressedDataUrl, file.name.replace(/\.[^/.]+$/, "") + ".jpg", "image/jpeg");
    };
    img.src = evt.target.result;
  };
  reader.readAsDataURL(file);
}

function fetchHolidaysFromPublicAPI() {
  const currentYear = currentCalendarDate.getFullYear();
  const cacheKey = `pwa_holidays_${currentYear}`;
  const cachedHolidays = localStorage.getItem(cacheKey);

  if (cachedHolidays) {
    try {
      LIBUR_NASIONAL = JSON.parse(cachedHolidays);
    } catch (e) {}
  }

  fetch(`https://dayoffapi.vercel.app/api?year=${currentYear}`)
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        const holidays = data.map(item => item.tanggal);
        if (holidays.length > 0) {
          LIBUR_NASIONAL = holidays;
          localStorage.setItem(cacheKey, JSON.stringify(holidays));
          renderCalendarGrid();
          checkMissingReports(userKegiatanData);
        }
      }
    })
    .catch(err => console.log("Menggunakan cache libur nasional dasar."));
}

function setupSidebarToggle() {
  const btnToggle = document.getElementById("btnToggleSidebar");
  const sidebar = document.getElementById("appSidebar");
  const dashboard = document.getElementById("mainScreen");

  if (btnToggle && sidebar && dashboard) {
    btnToggle.addEventListener("click", () => {
      sidebar.classList.toggle("collapsed");
      dashboard.classList.toggle("sidebar-collapsed");
      
      const isCollapsed = sidebar.classList.contains("collapsed");
      localStorage.setItem("pwa_sidebar_collapsed", isCollapsed ? "true" : "false");
    });

    if (localStorage.getItem("pwa_sidebar_collapsed") === "true") {
      sidebar.classList.add("collapsed");
      dashboard.classList.add("sidebar-collapsed");
    }
  }
}

function updateCurrentPeriodTitle() {
  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const now = new Date();
  const titleElem = document.getElementById("currentPeriodTitle");
  if (titleElem) titleElem.innerText = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
}

function setupTabSwitcher() {
  const loginBtn = document.getElementById("tabLoginBtn");
  const signupBtn = document.getElementById("tabSignupBtn");
  const formLogin = document.getElementById("formLogin");
  const formSignup = document.getElementById("formSignup");

  if (loginBtn && signupBtn) {
    loginBtn.addEventListener("click", (e) => {
      e.preventDefault();
      loginBtn.classList.add("active");
      signupBtn.classList.remove("active");
      if (formLogin) formLogin.classList.add("active");
      if (formSignup) formSignup.classList.remove("active");
    });

    signupBtn.addEventListener("click", (e) => {
      e.preventDefault();
      signupBtn.classList.add("active");
      loginBtn.classList.remove("active");
      if (formSignup) formSignup.classList.add("active");
      if (formLogin) formLogin.classList.remove("active");
    });
  }
}

function initApp() {
  const authScreen = document.getElementById("authScreen");
  const savedUser = JSON.parse(localStorage.getItem("user_session"));

  if (savedUser) {
    currentUser = savedUser;
    showMainDashboard(savedUser);
  } else if (authScreen) {
    authScreen.classList.add("active");
  }

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-target");
      switchNav(targetId);
    });
  });

  const inputTgl = document.getElementById("inputTanggal");
  if (inputTgl) inputTgl.valueAsDate = new Date();

  setupAuthEvents();
  setupFormKegiatan();
  checkDraftEkinerja();

  if (localStorage.getItem("pwa_theme") === "light") {
    document.body.classList.add("light-theme");
  }
}

function switchNav(targetId) {
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".content-section").forEach(s => s.classList.remove("active"));

  const activeBtn = document.querySelector(`[data-target="${targetId}"]`);
  if (activeBtn) activeBtn.classList.add("active");

  const targetElem = document.getElementById(targetId);
  if (targetElem) targetElem.classList.add("active");

  if (targetId === "secCalendar") renderCalendarGrid();
}

function setupQuickActionButtons() {
  const btnTambah = document.getElementById("btnTambahLaporan");
  if (btnTambah) btnTambah.addEventListener("click", () => switchNav("secLaporan"));

  const btnSalinKemarin = document.getElementById("btnSalinKegiatanKemarin");
  if (btnSalinKemarin) {
    btnSalinKemarin.addEventListener("click", () => {
      if (userKegiatanData.length === 0) {
        alert("⚠️ Belum ada data kegiatan sebelumnya yang dapat disalin.");
        return;
      }
      const lastItem = userKegiatanData[0];
      const namaAkt = lastItem.aktivitasRinci || lastItem.namaAktivitas || lastItem.aktivitas;
      
      const elSelect = document.getElementById("pwaAktivitasInput");
      const elKuantitas = document.getElementById("pwaKuantitas");
      const elKeterangan = document.getElementById("pwaKeterangan");

      if (elSelect) {
        elSelect.value = namaAkt;
        elSelect.dispatchEvent(new Event("change"));
      }
      if (elKuantitas) elKuantitas.value = lastItem.kuantitas || 1;
      if (elKeterangan) elKeterangan.value = lastItem.keterangan || "";

      switchNav("secLaporan");
      alert("✅ Data kegiatan terakhir berhasil disalin!");
    });
  }

  const btnCetak = document.getElementById("btnCetakRekapPdf");
  if (btnCetak) {
    btnCetak.addEventListener("click", () => {
      switchNav("secRekap");
      setTimeout(() => window.print(), 300);
    });
  }
}

let todoListItems = JSON.parse(localStorage.getItem("pwa_todo_list")) || [];

function setupTodoList() {
  const formAdd = document.getElementById("formAddTodo");
  const inputElem = document.getElementById("inputTodoText");

  if (formAdd && inputElem) {
    inputElem.placeholder = "Catatan tugas baru...";

    formAdd.addEventListener("submit", (e) => {
      e.preventDefault();
      const val = inputElem.value.trim();
      if (!val) return;

      const newItem = {
        id: Date.now(),
        text: val,
        date: formatDateID(new Date()),
        completed: false
      };

      todoListItems.unshift(newItem);
      saveAndRenderTodoList();
      inputElem.value = "";
    });
  }
  renderTodoList();
}

function saveAndRenderTodoList() {
  localStorage.setItem("pwa_todo_list", JSON.stringify(todoListItems));
  renderTodoList();
}

function renderTodoList() {
  const container = document.getElementById("todoListContainer");
  if (!container) return;

  if (todoListItems.length === 0) {
    container.innerHTML = `<p class="text-muted text-center" style="padding:20px;">Belum ada catatan tugas tersimpan.</p>`;
    return;
  }

  let html = "";
  todoListItems.forEach(item => {
    html += `
      <div class="todo-card-item ${item.completed ? 'completed' : ''}">
        <div class="todo-text-content">
          <p>${item.text}</p>
          <div class="todo-meta">
            <span>Dibuat: ${item.date}</span>
            <span class="todo-badge-status ${item.completed ? 'done' : 'pending'}">
              ${item.completed ? '✓ Selesai' : '📌 Belum diproses'}
            </span>
          </div>
        </div>
        <div class="todo-actions-btns">
          <button type="button" class="btn-action primary" style="padding:6px 10px; font-size:0.78rem;" onclick="scheduleTodoAsReport('${encodeURIComponent(item.text)}')">
            📝 Jadwalkan Laporan
          </button>
          <button type="button" class="btn-action outline" style="padding:6px 10px; font-size:0.78rem;" onclick="toggleTodoDone(${item.id})">
            ${item.completed ? '↩ Batal' : '✓ Coret'}
          </button>
          <button type="button" class="btn-action outline" style="padding:6px 10px; font-size:0.78rem; color:#f87171; border-color:#f87171;" onclick="deleteTodoItem(${item.id})">
            🗑️
          </button>
        </div>
      </div>
    `;
  });
  container.innerHTML = html;
}

function scheduleTodoAsReport(encodedText) {
  const text = decodeURIComponent(encodedText);
  const elKet = document.getElementById("pwaKeterangan");
  if (elKet) elKet.value = text;
  switchNav("secLaporan");
  alert("✅ Catatan berhasil dimasukkan ke Keterangan Laporan Harian!");
}

function toggleTodoDone(id) {
  todoListItems = todoListItems.map(item => {
    if (item.id === id) item.completed = !item.completed;
    return item;
  });
  saveAndRenderTodoList();
}

function deleteTodoItem(id) {
  if (confirm("Hapus catatan ini dari daftar?")) {
    todoListItems = todoListItems.filter(item => item.id !== id);
    saveAndRenderTodoList();
  }
}

function setupNotifEvents() {
  const btnBell = document.getElementById("btnNotifBell");
  const dropdown = document.getElementById("notifDropdown");
  const btnClose = document.getElementById("btnCloseNotif");

  if (btnBell && dropdown) {
    btnBell.addEventListener("click", () => dropdown.classList.toggle("active"));
  }
  if (btnClose && dropdown) {
    btnClose.addEventListener("click", () => dropdown.classList.remove("active"));
  }
}

function checkMissingReports(kegiatanData) {
  const notifContainer = document.getElementById("notifListContainer");
  const badgeCount = document.getElementById("notifBadgeCount");
  if (!notifContainer) return;

  const filledDates = new Set();
  kegiatanData.forEach(item => {
    if (item.tanggal) {
      const d = new Date(item.tanggal);
      if (!isNaN(d.getTime())) filledDates.add(formatYYYYMMDD(d));
    }
  });

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const currentDay = today.getDate();

  const missingDates = [];

  for (let day = 1; day < currentDay; day++) {
    const checkDate = new Date(year, month, day);
    const dateStr = formatYYYYMMDD(checkDate);
    const dayOfWeek = checkDate.getDay();

    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isNationalHoliday = LIBUR_NASIONAL.includes(dateStr);

    if (!isWeekend && !isNationalHoliday && !filledDates.has(dateStr)) {
      missingDates.push({ dateStr: dateStr, dateObj: checkDate });
    }
  }

  if (missingDates.length > 0) {
    if (badgeCount) {
      badgeCount.innerText = missingDates.length;
      badgeCount.style.display = "inline-block";
    }

    let html = "";
    missingDates.forEach(m => {
      const formattedDate = `${String(m.dateObj.getDate()).padStart(2, '0')}/${String(m.dateObj.getMonth() + 1).padStart(2, '0')}/${m.dateObj.getFullYear()}`;
      html += `
        <div class="notif-card-item">
          <div>
            <p>⚠️ Tanggal ${formattedDate} Belum Diisi</p>
            <span>Hari kerja belum memiliki catatan aktivitas.</span>
          </div>
          <button type="button" class="btn-notif-fix" onclick="openFormForDate('${m.dateStr}')">Isi ▶</button>
        </div>
      `;
    });
    notifContainer.innerHTML = html;
  } else {
    if (badgeCount) badgeCount.style.display = "none";
    notifContainer.innerHTML = `<p class="text-muted text-center" style="font-size:0.85rem; padding:12px;">🎉 Luar biasa! Semua laporan hari kerja bulan ini sudah terisi lengkap.</p>`;
  }
}

function openFormForDate(dateStr) {
  const inputTgl = document.getElementById("inputTanggal");
  if (inputTgl) inputTgl.value = dateStr;
  const dropdown = document.getElementById("notifDropdown");
  if (dropdown) dropdown.classList.remove("active");
  switchNav("secLaporan");
}

function setupValidationRules() {
  const nipLogin = document.getElementById("loginNip");
  const nipSignup = document.getElementById("signupNip");
  const signupBadge = document.getElementById("signupNipBadge");
  const signupStatus = document.getElementById("signupNipStatus");
  const namaSignup = document.getElementById("signupNama");
  const jabatanSignup = document.getElementById("signupJabatan");
  const opdSignup = document.getElementById("signupOpd");

  if (nipLogin) nipLogin.addEventListener("input", (e) => e.target.value = e.target.value.replace(/\D/g, "").slice(0, 18));

  if (nipSignup) {
    nipSignup.addEventListener("input", (e) => {
      let val = e.target.value.replace(/\D/g, "").slice(0, 18);
      e.target.value = val;
      if (val.length === 18) {
        nipSignup.classList.add("valid-nip");
        nipSignup.classList.remove("invalid-nip");
        if (signupBadge) signupBadge.innerHTML = "✅";
        if (signupStatus) signupStatus.innerHTML = "<span class='text-green'>✓ NIP Sesuai (18 Digit)</span>";
      } else if (val.length > 0) {
        nipSignup.classList.remove("valid-nip");
        nipSignup.classList.add("invalid-nip");
        if (signupBadge) signupBadge.innerHTML = "⏳";
        if (signupStatus) signupStatus.innerHTML = `<span class='text-orange'>Kurang ${18 - val.length} digit lagi</span>`;
      } else {
        nipSignup.classList.remove("valid-nip", "invalid-nip");
        if (signupBadge) signupBadge.innerHTML = "";
        if (signupStatus) signupStatus.innerText = "";
      }
    });
  }

  if (namaSignup) namaSignup.addEventListener("input", (e) => e.target.value = e.target.value.toUpperCase());
  if (jabatanSignup) jabatanSignup.addEventListener("input", (e) => e.target.value = e.target.value.toUpperCase());
  if (opdSignup) opdSignup.addEventListener("input", (e) => e.target.value = e.target.value.toUpperCase());
}

function setupAuthEvents() {
  const formSignup = document.getElementById("formSignup");
  const formLogin = document.getElementById("formLogin");

  if (formSignup) {
    formSignup.addEventListener("submit", (e) => {
      e.preventDefault();
      const nipVal = document.getElementById("signupNip").value.trim();
      const namaVal = document.getElementById("signupNama").value.trim().toUpperCase();

      if (nipVal.length !== 18) {
        alert("⚠️ NIP Pegawai harus berjumlah TEPAT 18 digit angka!");
        return;
      }

      const payload = {
        action: "signup",
        nip: nipVal,
        nama: namaVal,
        jabatan: document.getElementById("signupJabatan").value.trim().toUpperCase(),
        opd: document.getElementById("signupOpd").value.trim().toUpperCase(),
        pin: document.getElementById("signupPin").value
      };

      fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) })
        .then(res => res.json())
        .then(data => {
          alert(data.message);
          if (data.status === "success") document.getElementById("tabLoginBtn").click();
        });
    });
  }

  if (formLogin) {
    formLogin.addEventListener("submit", (e) => {
      e.preventDefault();
      const nipVal = document.getElementById("loginNip").value.trim();
      if (nipVal.length !== 18) {
        alert("⚠️ NIP Pegawai harus 18 digit!");
        return;
      }

      const payload = { action: "login", nip: nipVal, pin: document.getElementById("loginPin").value };

      fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) })
        .then(res => res.json())
        .then(data => {
          if (data.status === "success") {
            localStorage.setItem("user_session", JSON.stringify(data.user));
            currentUser = data.user;
            showMainDashboard(data.user);
          } else alert(data.message);
        });
    });
  }

  const btnLogout = document.getElementById("btnLogout");
  if (btnLogout) {
    btnLogout.addEventListener("click", () => {
      localStorage.removeItem("user_session");
      location.reload();
    });
  }
}

function showMainDashboard(user) {
  document.getElementById("authScreen").classList.remove("active");
  document.getElementById("mainScreen").classList.add("active");

  document.getElementById("userNama").innerText = user.nama.toUpperCase();
  document.getElementById("userNip").innerText = `NIP: ${user.nip}`;
  document.getElementById("userOpdBadge").innerText = user.opd || "OPD / UNIT KERJA";
  document.getElementById("userAvatar").innerText = user.nama.charAt(0).toUpperCase();

  document.getElementById("pdfNamaPegawai").innerText = user.nama.toUpperCase();
  document.getElementById("pdfNipPegawai").innerText = `NIP. ${user.nip}`;
  document.getElementById("pdfOpdPegawai").innerText = user.opd || "BAGIAN ORGANISASI";

  document.getElementById("settingNip").value = user.nip;
  document.getElementById("settingNama").value = user.nama.toUpperCase();
  document.getElementById("settingJabatan").value = user.jabatan;
  document.getElementById("settingOpd").value = user.opd;
  document.getElementById("settingTargetPoin").value = USER_TARGET_POIN;

  loadUserKegiatan(user.nip);
  resetInactivityTimer();
}

function setupSettingsEvents() {
  const formEdit = document.getElementById("formEditProfile");
  if (formEdit) {
    formEdit.addEventListener("submit", (e) => {
      e.preventDefault();
      const payload = {
        action: "update_profile",
        nip: currentUser.nip,
        nama: document.getElementById("settingNama").value.trim().toUpperCase(),
        jabatan: document.getElementById("settingJabatan").value.trim().toUpperCase(),
        opd: document.getElementById("settingOpd").value.trim().toUpperCase(),
        pinBaru: document.getElementById("settingPinBaru").value.trim()
      };

      fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify(payload) })
        .then(res => res.json())
        .then(data => {
          alert(data.message);
          if (data.status === "success") {
            currentUser.nama = payload.nama;
            currentUser.jabatan = payload.jabatan;
            currentUser.opd = payload.opd;
            localStorage.setItem("user_session", JSON.stringify(currentUser));
            showMainDashboard(currentUser);
            document.getElementById("settingPinBaru").value = "";
          }
        });
    });
  }

  const btnSaveTarget = document.getElementById("btnSaveTargetPoin");
  if (btnSaveTarget) {
    btnSaveTarget.addEventListener("click", () => {
      const val = parseInt(document.getElementById("settingTargetPoin").value) || 10000;
      USER_TARGET_POIN = val;
      localStorage.setItem("pwa_target_poin", val);
      alert(`✅ Target Poin Bulanan diperbarui menjadi ${val.toLocaleString('id-ID')} Poin!`);
      renderDashboard(userKegiatanData);
    });
  }

  const btnToggleTheme = document.getElementById("btnToggleTheme");
  if (btnToggleTheme) {
    btnToggleTheme.addEventListener("click", () => {
      document.body.classList.toggle("light-theme");
      const isLight = document.body.classList.contains("light-theme");
      localStorage.setItem("pwa_theme", isLight ? "light" : "dark");
      alert(`Theme diubah ke ${isLight ? "Light Mode" : "Dark Mode"}`);
    });
  }

  const btnResetCache = document.getElementById("btnResetLocalCache");
  if (btnResetCache) {
    btnResetCache.addEventListener("click", () => {
      if (confirm("Bersihkan cache draft lokal di browser ini?")) {
        localStorage.removeItem("ekinerja_last_draft");
        localStorage.removeItem("pwa_todo_list");
        alert("🧹 Cache lokal berhasil dibersihkan!");
        location.reload();
      }
    });
  }

  const btnDeleteAcc = document.getElementById("btnDeleteAccount");
  if (btnDeleteAcc) {
    btnDeleteAcc.addEventListener("click", () => {
      const confirmPrompt = prompt("⚠️ PERINGATAN BAHAYA!\nSeluruh riwayat jurnal & FILE BUKTI DI GOOGLE DRIVE akan dihapus PERMANEN!\n\nKetik NIP Anda untuk mengonfirmasi penghapusan akun:");
      if (confirmPrompt && confirmPrompt.trim() === currentUser.nip.toString().trim()) {
        btnDeleteAcc.disabled = true;
        btnDeleteAcc.innerText = "⏳ Menghapus Akun & Berkas Drive...";

        fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "delete_account", nip: currentUser.nip }) })
          .then(res => res.json())
          .then(data => {
            alert(data.message);
            localStorage.clear();
            location.reload();
          })
          .catch(err => {
            alert("Gagal menghapus akun: " + err);
            btnDeleteAcc.disabled = false;
            btnDeleteAcc.innerText = "🗑️ Hapus Akun & Seluruh File Drive Permanen";
          });
      } else if (confirmPrompt !== null) {
        alert("⚠️ Konfirmasi NIP salah. Penghapusan akun dibatalkan.");
      }
    });
  }
}

function renderDraftEkinerja(aktivitas, keterangan) {
  const elNama = document.getElementById("textNamaAktivitas");
  const elKet = document.getElementById("textKeterangan");
  const cardCopy = document.getElementById("cardCopyEkinerja");
  const btnEkin = document.getElementById("btnOpenEkinerja");

  if (elNama) elNama.innerText = aktivitas || "-";
  if (elKet) elKet.innerText = keterangan || "-";
  if (btnEkin) btnEkin.href = "https://kinerja.badungkab.go.id/admin";
  if (cardCopy) cardCopy.style.display = "block";
}

function checkDraftEkinerja() {
  const savedDraft = localStorage.getItem("ekinerja_last_draft");
  if (savedDraft) {
    try {
      const parsed = JSON.parse(savedDraft);
      if (parsed.aktivitas || parsed.keterangan) renderDraftEkinerja(parsed.aktivitas, parsed.keterangan);
    } catch (e) {}
  }
}

function clearDraftEkinerja() {
  if (confirm("Apakah Anda yakin ingin menghapus/membersihkan teks siap tempel ini?")) {
    localStorage.removeItem("ekinerja_last_draft");
    const cardCopy = document.getElementById("cardCopyEkinerja");
    if (cardCopy) cardCopy.style.display = "none";
    document.getElementById("textNamaAktivitas").innerText = "-";
    document.getElementById("textKeterangan").innerText = "-";
    alert("🗑️ Teks siap tempel telah dibersihkan.");
  }
}

function loadUserKegiatan(nip) {
  fetch(GOOGLE_SCRIPT_URL, { method: "POST", body: JSON.stringify({ action: "get_kegiatan_by_nip", nip: nip }) })
    .then(res => res.json())
    .then(res => {
      if (res.status === "success") {
        userKegiatanData = res.data;
        renderDashboard(res.data);
        renderCalendarGrid();
        checkMissingReports(res.data);
      }
    });
}

function formatDateID(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function formatYYYYMMDD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function setupCalendarControls() {
  const btnPrev = document.getElementById("btnPrevMonth");
  const btnNext = document.getElementById("btnNextMonth");
  if (btnPrev) btnPrev.addEventListener("click", () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1); fetchHolidaysFromPublicAPI(); renderCalendarGrid(); });
  if (btnNext) btnNext.addEventListener("click", () => { currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1); fetchHolidaysFromPublicAPI(); renderCalendarGrid(); });
}

function renderCalendarGrid() {
  const monthTitle = document.getElementById("calendarMonthTitle");
  const daysGrid = document.getElementById("calendarDaysGrid");
  if (!daysGrid) return;

  const monthNames = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  if (monthTitle) monthTitle.innerText = `${monthNames[month]} ${year}`;

  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayStr = formatYYYYMMDD(new Date());

  const activitiesByDate = {};
  userKegiatanData.forEach(item => {
    if (item.tanggal) {
      const dObj = new Date(item.tanggal);
      if (!isNaN(dObj.getTime())) {
        const key = formatYYYYMMDD(dObj);
        if (!activitiesByDate[key]) activitiesByDate[key] = { items: [], totalPoint: 0 };
        activitiesByDate[key].items.push(item);
        activitiesByDate[key].totalPoint += parseInt(item.point) || 0;
      }
    }
  });

  daysGrid.innerHTML = "";

  for (let i = 0; i < firstDayIndex; i++) {
    const emptyCell = document.createElement("div");
    emptyCell.className = "calendar-day-cell empty-cell";
    daysGrid.appendChild(emptyCell);
  }

  for (let day = 1; day <= totalDays; day++) {
    const cellDateObj = new Date(year, month, day);
    const dateKey = formatYYYYMMDD(cellDateObj);
    const dayOfWeek = cellDateObj.getDay();

    const cell = document.createElement("div");
    cell.className = "calendar-day-cell";

    const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);
    const isNationalHoliday = LIBUR_NASIONAL.includes(dateKey);

    if (isWeekend || isNationalHoliday) {
      cell.classList.add("holiday-cell");
      if (isWeekend) cell.classList.add("weekend-cell");
    }

    if (dateKey === todayStr) cell.classList.add("today-cell");

    const headerRow = document.createElement("div");
    headerRow.style.display = "flex";
    headerRow.style.justifyContent = "space-between";
    headerRow.style.alignItems = "center";

    const numSpan = document.createElement("span");
    numSpan.className = "calendar-day-num";
    numSpan.innerText = day;
    headerRow.appendChild(numSpan);

    if (isNationalHoliday) {
      const holLabel = document.createElement("span");
      holLabel.className = "holiday-badge";
      holLabel.innerText = "Libur";
      headerRow.appendChild(holLabel);
    } else if (isWeekend) {
      const holLabel = document.createElement("span");
      holLabel.className = "holiday-badge";
      holLabel.innerText = dayOfWeek === 0 ? "Minggu" : "Sabtu";
      headerRow.appendChild(holLabel);
    }

    cell.appendChild(headerRow);

    if (activitiesByDate[dateKey]) {
      cell.classList.add("has-data-cell");

      const badgeContainer = document.createElement("div");
      badgeContainer.style.display = "flex";
      badgeContainer.style.flexDirection = "column";
      badgeContainer.style.gap = "4px";
      badgeContainer.style.marginTop = "8px";

      const badge = document.createElement("span");
      badge.className = "calendar-day-badge";
      badge.innerText = `✓ ${activitiesByDate[dateKey].totalPoint} Poin`;
      badgeContainer.appendChild(badge);

      const countBadge = document.createElement("span");
      countBadge.className = "calendar-count-badge";
      countBadge.innerText = `${activitiesByDate[dateKey].items.length} Aktivitas`;
      badgeContainer.appendChild(countBadge);

      cell.appendChild(badgeContainer);
    } else if (!isWeekend && !isNationalHoliday && cellDateObj < new Date()) {
      cell.classList.add("empty-workday-cell");
    }

    cell.addEventListener("click", () => showCalendarDateDetails(dateKey, cellDateObj, activitiesByDate[dateKey]));
    daysGrid.appendChild(cell);
  }
}

function showCalendarDateDetails(dateKey, cellDateObj, dayData) {
  const detailCard = document.getElementById("calendarDayDetails");
  const titleElem = document.getElementById("selectedCalendarDateTitle");
  const tbody = document.getElementById("tbodyCalendarSelectedDate");
  const btnAdd = document.getElementById("btnCalendarAddForDate");

  if (!detailCard || !tbody) return;

  const formattedTitleDate = `${String(cellDateObj.getDate()).padStart(2, '0')}/${String(cellDateObj.getMonth() + 1).padStart(2, '0')}/${cellDateObj.getFullYear()}`;
  if (titleElem) titleElem.innerText = `Aktivitas Tanggal ${formattedTitleDate}`;
  detailCard.style.display = "block";

  if (btnAdd) {
    btnAdd.onclick = () => {
      const inputTgl = document.getElementById("inputTanggal");
      if (inputTgl) inputTgl.value = dateKey;
      switchNav("secLaporan");
    };
  }

  if (dayData && dayData.items.length > 0) {
    let html = "";
    dayData.items.forEach(it => {
      html += `<tr>
        <td><strong>${it.aktivitasRinci || it.namaAktivitas || it.aktivitas}</strong></td>
        <td>${it.kuantitas} ${it.satuan || "Poin"}</td>
        <td>${it.point} Poin</td>
        <td>${it.keterangan || "-"}</td>
      </tr>`;
    });
    tbody.innerHTML = html;
  } else {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted">Belum ada aktivitas terisi pada tanggal ${formattedTitleDate}.</td></tr>`;
  }
}

function renderDashboard(data) {
  let totalPoint = 0;
  let totalDurasi = 0;
  let recentHTML = "";
  let fullHTML = "";
  let arsipHTML = "";

  data.forEach((item, index) => {
    const itemPt = parseInt(item.point) || 0;
    totalPoint += itemPt;
    totalDurasi += parseInt(item.durasi) || 0;

    const tglFormat = formatDateID(item.tanggal);
    const namaAktivitasRinci = item.aktivitasRinci || item.namaAktivitas || item.aktivitas;
    const satuanDisplay = item.satuan || "Poin";

    const row = `<tr>
      <td>${tglFormat}</td>
      <td>${namaAktivitasRinci}</td>
      <td>${item.kuantitas} ${satuanDisplay}</td>
      <td>${itemPt} Poin</td>
      <td><button class="btn-action outline" onclick="copyValue('${namaAktivitasRinci}')">Salin</button></td>
    </tr>`;

    if (index < 5) recentHTML += row;
    fullHTML += `<tr>
      <td>${tglFormat}</td>
      <td>${namaAktivitasRinci}</td>
      <td>${item.kuantitas} ${satuanDisplay}</td>
      <td>${item.durasi} Menit</td>
      <td>${itemPt} Poin</td>
      <td>${item.buktiLink ? `<a href="${item.buktiLink}" target="_blank">Lihat Drive</a>` : '-'}</td>
    </tr>`;

    if (item.buktiLink) {
      arsipHTML += `<li>📎 <strong>${tglFormat}</strong>: <a href="${item.buktiLink}" target="_blank">${namaAktivitasRinci}</a></li>`;
    }
  });

  const elAktivitas = document.getElementById("statAktivitasCount");
  const elTotalPoin = document.getElementById("statTotalPoint");
  const elSisaPoin = document.getElementById("statSisaPoint");
  const elTotalDurasi = document.getElementById("statTotalDurasi");
  const elSisaLabel = document.getElementById("statSisaLabel");

  if (elAktivitas) elAktivitas.innerText = data.length;
  if (elTotalPoin) elTotalPoin.innerText = totalPoint;
  
  const sisaPoin = Math.max(0, USER_TARGET_POIN - totalPoint);
  if (elSisaPoin) elSisaPoin.innerText = sisaPoin.toLocaleString('id-ID');
  if (elSisaLabel) elSisaLabel.innerText = `Sisa Poin Menuju ${USER_TARGET_POIN.toLocaleString('id-ID')}`;

  if (elTotalDurasi) elTotalDurasi.innerText = `${Math.round(totalDurasi / 60)} Jam`;

  const pct = Math.min(Math.round((totalPoint / USER_TARGET_POIN) * 100), 100);
  const fillBar = document.getElementById("progressBarFill");
  const pctBadge = document.getElementById("progressPercentage");
  if (fillBar) fillBar.style.width = `${pct}%`;
  if (pctBadge) pctBadge.innerText = `${pct}% Target ${USER_TARGET_POIN.toLocaleString('id-ID')} Poin`;

  const tbRecent = document.getElementById("tbodyRecentAktivitas");
  const tbFull = document.getElementById("tbodyRekapFull");
  const listArsip = document.getElementById("listArsipBukti");

  if (recentHTML && tbRecent) tbRecent.innerHTML = recentHTML;
  if (fullHTML && tbFull) tbFull.innerHTML = fullHTML;
  if (arsipHTML && listArsip) listArsip.innerHTML = arsipHTML;
}

function copyText(elementId) {
  const text = document.getElementById(elementId).innerText;
  navigator.clipboard.writeText(text);
  alert("Teks berhasil disalin!");
}

function copyValue(val) {
  navigator.clipboard.writeText(val);
  alert("Nama aktivitas berhasil disalin!");
}

const INACTIVITY_LIMIT = 30 * 60 * 1000;
let inactivityTimer;

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (currentUser) {
    inactivityTimer = setTimeout(() => {
      alert("🔒 Sesi Anda telah berakhir demi keamanan karena tidak ada aktivitas selama 30 menit.");
      localStorage.removeItem("user_session");
      location.reload();
    }, INACTIVITY_LIMIT);
  }
}

window.onload = resetInactivityTimer;
document.onmousemove = resetInactivityTimer;
document.onkeydown = resetInactivityTimer;
document.ontouchstart = resetInactivityTimer;
document.onclick = resetInactivityTimer;