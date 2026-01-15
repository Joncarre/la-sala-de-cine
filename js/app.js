import { initializeApp } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-analytics.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/11.1.0/firebase-firestore.js";

// --- FIREBASE CONFIG ---
// NOTA IMPORTANTE: Estas claves identifican tu proyecto en Google Cloud.
// En aplicaciones Web (Client-side), es ESTÁNDAR que sean visibles.
// La seguridad NO depende de ocultar esto, sino de las "Reglas de Seguridad" de Firestore
// que configuraste en el paso anterior (permitir solo tu dominio, usuarios auth, etc).
// Sin esto aquí, la web desplegada en Netlify NO funcionará porque no tiene acceso a archivos locales ocultos.
const firebaseConfig = {
  apiKey: "AIzaSyB0DWYOAAx-WFirBNCzIJOqLPqAhJZkm1o",
  authDomain: "la-sala-cine.firebaseapp.com",
  projectId: "la-sala-cine",
  storageBucket: "la-sala-cine.firebasestorage.app",
  messagingSenderId: "759365773570",
  appId: "1:759365773570:web:c48b99a048542a7c3dfa1b",
  measurementId: "G-6ZMJ3HVL04"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);

// --- DATOS Y ESTADO LOCAL (Sincronizado) ---
let USERS = [];
let movies = [];
let historyLog = [];
let wishlist = [];

let activeFilters = [];

// --- LISTENERS EN TIEMPO REAL ---
// Escuchar cambios en la base de datos y actualizar la web automáticamente

// 1. Usuarios
onSnapshot(collection(db, "users"), (snapshot) => {
    USERS = [];
    snapshot.forEach((doc) => {
        USERS.push(doc.data());
    });
    // Ordenar por nombre si quieres, o dejar como vienen
    USERS.sort((a,b) => a.name.localeCompare(b.name));
    renderApp();
});

// 2. Películas
onSnapshot(collection(db, "movies"), (snapshot) => {
    movies = [];
    snapshot.forEach((doc) => {
        movies.push(doc.data());
    });
    // El orden se aplica en renderGrid
    renderApp();
});

// 3. Historial
onSnapshot(collection(db, "history"), (snapshot) => {
    historyLog = [];
    snapshot.forEach((doc) => {
        historyLog.push(doc.data());
    });
    // Ordenar por fecha reciente (timestamp desc)
    historyLog.sort((a,b) => b.timestamp - a.timestamp);
    renderApp();
});

// 4. Wishlist
onSnapshot(collection(db, "wishlist"), (snapshot) => {
    wishlist = [];
    snapshot.forEach((doc) => {
        wishlist.push(doc.data());
    });
    renderWishlist();
});


// --- ALGORITMO DE COLOR CORREGIDO ---
function getColorForScore(score) {
    if (score < 6) {
        return 'hsl(350, 80%, 50%)'; 
    } else {
        const l = 60 - ((score - 6) * 10);
        return `hsl(140, 75%, ${l}%)`;
    }
}

// --- GESTIÓN DE PELÍCULAS ---

window.openMovieForm = function(isEdit = false, movieId = null) {
    const hiddenId = document.getElementById('edit-id');
    const modalTitle = document.getElementById('modal-title');
    const t = document.getElementById('inp-title');
    const y = document.getElementById('inp-year');
    const s = document.getElementById('inp-score');
    const d = document.getElementById('inp-duration');

    if (isEdit) {
        const m = movies.find(x => x.id === movieId);
        modalTitle.innerText = "Editar Película";
        hiddenId.value = m.id;
        t.value = m.title;
        y.value = m.year;
        s.value = m.score;
        d.value = m.duration;
    } else {
        modalTitle.innerText = "Nueva Película";
        hiddenId.value = "";
        t.value = "";
        y.value = "";
        s.value = "";
        d.value = "";
    }
    
    validateForm(); 
    openModal('modal-movie');
}

window.validateForm = function() {
    const t = document.getElementById('inp-title').value.trim();
    const y = document.getElementById('inp-year').value.trim();
    const s = document.getElementById('inp-score').value.trim();
    const d = document.getElementById('inp-duration').value.trim();
    const btn = document.getElementById('btn-save');

    const isNum = (val) => /^[0-9]+(\.[0-9]+)?$/.test(val);
    const isValid = t.length > 0 && isNum(y) && isNum(s) && isNum(d);
    btn.disabled = !isValid;
}

window.saveMovie = async function() {
    const idParam = document.getElementById('edit-id').value;
    const title = document.getElementById('inp-title').value.trim();
    const year = parseInt(document.getElementById('inp-year').value);
    const score = parseFloat(document.getElementById('inp-score').value);
    const duration = parseInt(document.getElementById('inp-duration').value);

    // Si hay idParam es edición, si no, es nueva.
    // Usamos el idParam existente o generamos uno nuevo basado en timestamp
    const id = idParam ? parseInt(idParam) : Date.now();
    
    // Objeto película
    // NOTA: Si es edición, mantenemos el seenBy original. Si es nuevo, array vacío.
    let currentSeenBy = [];
    if (idParam) {
        const existing = movies.find(x => x.id == id);
        if(existing) currentSeenBy = existing.seenBy;
    }

    const movieData = {
        id: id,
        title, year, score, duration,
        seenBy: currentSeenBy
    };

    try {
        // Guardar en Firestore (colección "movies", documento = id convertido a string)
        await setDoc(doc(db, "movies", id.toString()), movieData);
        closeModal('modal-movie');
    } catch (e) {
        console.error("Error al guardar película: ", e);
        alert("Hubo un error al guardar. Revisa la consola.");
    }
}

window.toggleSeen = async function(movieId, userId) {
    const m = movies.find(x => x.id === movieId);
    if (!m) return;

    let newSeenBy = [...m.seenBy]; // Copia
    let added = false;

    if (newSeenBy.includes(userId)) {
        newSeenBy = newSeenBy.filter(u => u !== userId);
    } else {
        newSeenBy.push(userId);
        added = true;
    }

    try {
        // 1. Actualizar película
        await updateDoc(doc(db, "movies", m.id.toString()), {
            seenBy: newSeenBy
        });

        // 2. Si se ha añadido (visto), añadir al historial
        if (added) {
            const now = new Date();
            const historyItem = {
                movieId: m.id,
                title: m.title,
                dateStr: now.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }),
                timestamp: now.getTime(),
                year: now.getFullYear()
            };
            // Usamos un ID único para el documento de historial
            // Podríamos usar timestamp + random para evitar colisiones
            const histId = Date.now().toString();
            await setDoc(doc(db, "history", histId), historyItem);
        }

    } catch (e) {
        console.error("Error al actualizar visto: ", e);
    }
}

window.toggleFilter = function(uid) {
    if(activeFilters.includes(uid)) activeFilters = activeFilters.filter(x => x !== uid);
    else activeFilters.push(uid);
    renderApp();
}

// --- GESTIÓN DE USUARIOS ---

window.saveUser = async function() {
    const name = document.getElementById('inp-user-name').value.trim();
    const color = document.getElementById('inp-user-color').value;

    if (name) {
        const userId = 'u' + Date.now(); // ID único
        const userData = { id: userId, name, color };

        try {
            await setDoc(doc(db, "users", userId), userData);
            closeModal('modal-user');
            document.getElementById('inp-user-name').value = '';
        } catch (e) {
            console.error("Error al guardar usuario: ", e);
            alert("Error al guardar usuario");
        }
    }
}

// --- WISHLIST ---
window.addWish = async function() {
    const val = document.getElementById('inp-wish').value.trim();
    if(val) {
        const wishId = Date.now();
        const wishData = { id: wishId, text: val };
        
        try {
            await setDoc(doc(db, "wishlist", wishId.toString()), wishData);
            document.getElementById('inp-wish').value = '';
        } catch (e) {
            console.error("Error wishlist:", e);
        }
    }
}

window.removeWish = async function(id) {
    try {
        await deleteDoc(doc(db, "wishlist", id.toString()));
    } catch (e) {
        console.error("Error borrar wishlist:", e);
    }
}

function renderWishlist() {
    const c = document.getElementById('wishlist-container');
    c.innerHTML = wishlist.length ? '' : '<p style="text-align:center; opacity:0.5; padding:20px;">No hay películas pendientes</p>';
    wishlist.forEach(w => {
        c.innerHTML += `
            <div class="list-item wishlist-item">
                <span>${w.text}</span>
                <span class="wishlist-del" onclick="removeWish(${w.id})">✕</span>
            </div>`;
    });
}

// --- RENDER APP ---

window.renderApp = function() {
    renderHeaderStats();
    renderFilters();
    renderGrid();
}

function renderHeaderStats() {
    document.getElementById('stat-total').innerText = movies.length;
    document.getElementById('stat-seen-any').innerText = movies.filter(m => m.seenBy.length > 0).length;
    document.getElementById('stat-virgin').innerText = movies.filter(m => m.seenBy.length === 0).length;
}

function renderFilters() {
    const container = document.getElementById('user-filters');
    container.innerHTML = '';
    USERS.forEach(u => {
        const active = activeFilters.includes(u.id);
        const style = active ? `background-color: ${u.color}; border-color: ${u.color}; color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,0.2);` : '';
        container.innerHTML += `<div class="pill ${active?'active':''}" style="${style}" onclick="toggleFilter('${u.id}')">${u.name}</div>`;
    });
    
    // Botón añadir usuario
    container.innerHTML += `<div class="pill" style="font-weight:bold; opacity:0.6; padding: 6px 12px;" onclick="openModal('modal-user')">+</div>`;

    const maxDur = document.getElementById('filter-dur').value;
    const minScore = document.getElementById('filter-score').value;
    document.getElementById('lbl-dur').innerText = maxDur == 240 ? "Todas" : `< ${maxDur} min`;
    document.getElementById('lbl-score').innerText = minScore == 0 ? "Todas" : `> ${minScore}`;
}

function renderGrid() {
    const grid = document.getElementById('movies-grid');
    grid.innerHTML = '';

    const maxDur = parseInt(document.getElementById('filter-dur').value);
    const minScore = parseFloat(document.getElementById('filter-score').value);
    const sortType = document.getElementById('sort-select').value;

    // FILTRO
    let display = movies.filter(m => {
        if (m.duration > maxDur && maxDur < 240) return false;
        if (m.score < minScore) return false;
        if (activeFilters.length > 0) {
            const groupHasSeen = activeFilters.some(uid => m.seenBy.includes(uid));
            if (groupHasSeen) return false;
        }
        return true;
    });

    // ORDEN
    display.sort((a,b) => {
        if(sortType === 'score') return b.score - a.score;
        if(sortType === 'duration') return a.duration - b.duration;
        if(sortType === 'coeff') return (b.score/b.duration) - (a.score/a.duration);
        return b.id - a.id; 
    });

    // PINTAR
    display.forEach(m => {
        const coeff = (m.duration > 0 ? (m.score / m.duration) : 0).toFixed(3);
        const scoreColor = getColorForScore(m.score);
        
        let avatars = '';
        USERS.forEach(u => {
            const seen = m.seenBy.includes(u.id);
            const shortName = u.name.substring(0,2);
            avatars += `<div class="avatar ${seen?'seen':'not-seen'}" style="${seen?'background:'+u.color:''}" 
                        onclick="event.stopPropagation(); toggleSeen(${m.id}, '${u.id}')">${shortName}</div>`;
        });

        const card = document.createElement('div');
        card.className = 'glass movie-card';
        card.innerHTML = `
            <div class="edit-btn" onclick="openMovieForm(true, ${m.id})">✏️</div>
            <div class="card-header">
                <div class="card-title" title="${m.title}">${m.title}</div>
                <div class="score-box" style="background:${scoreColor}">${m.score}</div>
            </div>
            <div class="card-meta">${m.year} • ${m.duration} min</div>
            
            <div><span class="card-badge">Worth it: ${coeff}</span></div>

            <div class="seen-section">
                <div style="font-size:0.65rem; opacity:0.6; margin-bottom:8px; font-weight:600; text-transform:uppercase;">Visto por:</div>
                <div class="avatars">${avatars}</div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// --- ESTADÍSTICAS ---

window.openStats = function() {
    const tbody = document.getElementById('tbl-stats-users');
    tbody.innerHTML = '';
    const totalMovies = movies.length;
    
    USERS.forEach(u => {
        const seen = movies.filter(m => m.seenBy.includes(u.id));
        const count = seen.length;
        const pct = totalMovies ? Math.round((count/totalMovies)*100) : 0;
        const avg = count ? (seen.reduce((a,b)=>a+b.score,0)/count).toFixed(2) : '-';
        
        tbody.innerHTML += `
            <tr>
                <td><span style="color:${u.color}; font-weight:700;">${u.name}</span></td>
                <td>${count}</td>
                <td>${pct}%</td>
                <td>${avg}</td>
            </tr>
        `;
    });

    // Tiempo
    let totalMinutes = 0;
    historyLog.forEach(h => {
        const m = movies.find(x => x.id === h.movieId) || movies.find(x => x.title === h.title);
        if(m) totalMinutes += m.duration;
    });
    const hours = Math.floor(totalMinutes / 60);
    document.getElementById('st-total-time').innerText = `${hours}h ${totalMinutes % 60}m`;

    // Top 1
    const seenMovies = movies.filter(m => m.seenBy.length > 0).sort((a,b) => b.score - a.score);
    if(seenMovies.length > 0) document.getElementById('st-top1').innerText = `${seenMovies[0].title} (${seenMovies[0].score})`;
    else document.getElementById('st-top1').innerText = "-";
    
    // Top 10
    const top10 = seenMovies.slice(0, 10);
    document.getElementById('list-top10').innerHTML = top10.map((m, i) => 
        `<div style="padding:8px 0; border-bottom:1px solid #f0f0f0;">
            <b>#${i+1}</b> ${m.title} <span style="float:right; opacity:0.6; font-weight:600;">★ ${m.score}</span>
         </div>`
    ).join('');

    // Años
    const yearCounts = {};
    historyLog.forEach(h => {
        let y = h.year;
        if(!y && h.dateStr) { 
            const parts = h.dateStr.split(' ');
            y = parts[parts.length-1];
        }
        if(!y) y = 'Desc.';
        yearCounts[y] = (yearCounts[y] || 0) + 1;
    });

    document.getElementById('list-years').innerHTML = Object.keys(yearCounts).sort().reverse().map(y => 
        `<div style="background:#fff; padding:6px 12px; border-radius:10px; font-size:0.85rem; border:1px solid #eee; box-shadow:0 2px 5px rgba(0,0,0,0.03);">
            ${y}: <b>${yearCounts[y]}</b>
         </div>`
    ).join('');

    openModal('modal-stats');
}

window.openHistory = function() {
    const c = document.getElementById('history-container');
    c.innerHTML = historyLog.length ? '' : '<p style="text-align:center; opacity:0.5; padding:20px;">Aún no hay historial</p>';
    historyLog.forEach(h => {
        c.innerHTML += `
            <div class="list-item">
                <span style="font-weight:600">${h.title}</span>
                <span style="opacity:0.6; font-size:0.85rem;">${h.dateStr}</span>
            </div>`;
    });
    openModal('modal-history');
}

window.openModal = function(id) { 
    document.getElementById(id).classList.add('open'); 
    if(id === 'modal-wishlist') renderWishlist();
}
window.closeModal = function(id) { document.getElementById(id).classList.remove('open'); }

// Init
renderApp();
