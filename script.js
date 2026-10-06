// ==========================================
// 1. CONFIGURACIÓN Y CONEXIÓN SUPABASE
// ==========================================

const SUPABASE_URL = 'https://kbxsszmpritrafmqyqbr.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_b-iHd631PbjPe11mR_uU4g_ETn-0yzs';

// Inicialización global blindada
let _supabase = null;

function obtenerClienteSupabase() {
  if (!_supabase) {
    if (typeof supabase !== 'undefined' && supabase.createClient) {
      _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } else {
      console.error("La librería de Supabase no se ha cargado en el HTML.");
    }
  }
  return _supabase;
}

// Variables globales de estado
let map = null;
let marker = null;
let latSeleccionada = null;
let lngSeleccionada = null;

let listaIncidencias = [];
let paginaActual = 1;
const reportesPorPagina = 10;
let usuarioAutenticado = false;

const LAT_INICIAL = 32.468;
const LNG_INICIAL = -116.980;

// ==========================================
// 2. INICIALIZACIÓN DE LA PÁGINA
// ==========================================

document.addEventListener('DOMContentLoaded', () => {
  obtenerClienteSupabase();
  initMap();
  initAuth();
  cargarIncidencias();
});

// --- LÓGICA DEL MAPA (LEAFLET) ---
function initMap() {
  const mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  map = L.map('map').setView([LAT_INICIAL, LNG_INICIAL], 14);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(map);

  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 500);

  map.on('click', (e) => {
    colocarMarcador(e.latlng.lat, e.latlng.lng);
  });
}

function colocarMarcador(lat, lng) {
  latSeleccionada = lat;
  lngSeleccionada = lng;

  if (marker) {
    marker.setLatLng([lat, lng]);
  } else {
    marker = L.marker([lat, lng]).addTo(map);
  }

  const inputUbicacion = document.getElementById('inc-ubicacion');
  if (inputUbicacion && !inputUbicacion.value) {
    inputUbicacion.value = `Coords: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

function usarUbicacionActual() {
  if (!navigator.geolocation) return alert('Geolocalización no soportada por el navegador');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      map.setView([pos.coords.latitude, pos.coords.longitude], 16);
      colocarMarcador(pos.coords.latitude, pos.coords.longitude);
    },
    (err) => alert('Error al obtener ubicación: ' + err.message)
  );
}

// --- AUTENTICACIÓN ADMIN ---
function initAuth() {
  const client = obtenerClienteSupabase();
  if (!client) return;

  client.auth.onAuthStateChange((event, session) => {
    usuarioAutenticado = !!session;
    actualizarUIAuth(session);
    renderizarPagina();
  });
}

function actualizarUIAuth(session) {
  const btnAuth = document.getElementById('btn-auth-header');
  if (!btnAuth) return;

  if (session) {
    btnAuth.innerHTML = `<i class="bi bi-box-arrow-right"></i> Cerrar Sesión`;
    btnAuth.onclick = cerrarSesion;
    btnAuth.removeAttribute('data-bs-toggle');
    btnAuth.removeAttribute('data-bs-target');
  } else {
    btnAuth.innerHTML = `<i class="bi bi-person-lock"></i> Acceso Admin`;
    btnAuth.onclick = null;
    btnAuth.setAttribute('data-bs-toggle', 'modal');
    btnAuth.setAttribute('data-bs-target', '#modalLogin');
  }
}

async function iniciarSesion() {
  const client = obtenerClienteSupabase();
  if (!client) return alert('Error de conexión con Supabase. Revisa las credenciales en script.js');

  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const btn = document.getElementById('btn-login');

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span>...`;

  const { error } = await client.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.innerText = 'Iniciar Sesión';

  if (error) {
    alert('Error de acceso: ' + error.message);
  } else {
    const modalEl = document.getElementById('modalLogin');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }
}

async function cerrarSesion() {
  const client = obtenerClienteSupabase();
  if (client) await client.auth.signOut();
  cargarIncidencias();
}

// --- IMAGEN DE EVIDENCIA ---
function previsualizarImagen(e) {
  const file = e.target.files[0];
  const preview = document.getElementById('img-preview');
  const container = document.getElementById('preview-container');

  if (file && preview && container) {
    preview.src = URL.createObjectURL(file);
    container.classList.remove('d-none');
  }
}

function cancelarFoto() {
  const input = document.getElementById('inc-file');
  const container = document.getElementById('preview-container');
  if (input) input.value = '';
  if (container) container.classList.add('d-none');
}

// ==========================================
// 3. CONSULTA Y RENDEREADO (MODO REVISIÓN)
// ==========================================

async function cargarIncidencias() {
  const container = document.getElementById('incidencias-container');
  if (!container) return;

  const client = obtenerClienteSupabase();

  if (!client) {
    console.error("Supabase no está inicializado. Revisa index.html y tus credenciales.");
    container.innerHTML = `
      <div class="alert alert-danger text-center shadow-sm">
        <i class="bi bi-exclamation-triangle-fill me-2"></i>
        <strong>Error de conexión:</strong> No se pudo conectar con Supabase. Revisa que el script CDN esté en <code>index.html</code> y las claves en <code>script.js</code>.
      </div>`;
    return;
  }

  try {
    const { data: incidencias, error } = await client
      .from('incidencias')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error Supabase:", error);
      container.innerHTML = `<div class="alert alert-warning text-center">Error al consultar la base de datos: ${error.message}</div>`;
      return;
    }

    listaIncidencias = incidencias || [];
    paginaActual = 1;

    actualizarContadores();
    renderizarPagina();
  } catch (err) {
    console.error("Error inesperado:", err);
    container.innerHTML = `<div class="alert alert-danger text-center">Ocurrió un error inesperado al cargar los datos.</div>`;
  }
}

function actualizarContadores() {
  let pendientes = 0;
  let revision = 0;
  let atendidos = 0;

  listaIncidencias.forEach(item => {
    const estado = item.estado || 'En revisión';
    if (estado === 'Pendiente') pendientes++;
    else if (estado === 'En revisión') revision++;
    else if (estado === 'Atendido' || estado === 'Cerrado') atendidos++;
  });

  const elP = document.getElementById('cant-pendientes');
  const elR = document.getElementById('cant-revision');
  const elA = document.getElementById('cant-atendidos');

  if (elP) elP.innerText = pendientes;
  if (elR) elR.innerText = revision;
  if (elA) elA.innerText = atendidos;
}

function renderizarPagina() {
  const container = document.getElementById('incidencias-container');
  if (!container) return;

  // REGLA MODO REVISIÓN: Si NO es Admin, oculta las incidencias 'En revisión'
  const reportesVisibles = usuarioAutenticado 
    ? listaIncidencias 
    : listaIncidencias.filter(item => item.estado !== 'En revisión');

  if (reportesVisibles.length === 0) {
    container.innerHTML = `<div class="text-center py-4 text-muted">No hay reportes públicos disponibles en este momento.</div>`;
    const pagControls = document.getElementById('paginacion-controls');
    if (pagControls) pagControls.classList.add('d-none');
    return;
  }

  const pagControls = document.getElementById('paginacion-controls');
  if (pagControls) pagControls.classList.remove('d-none');

  const totalPaginas = Math.ceil(reportesVisibles.length / reportesPorPagina);
  if (paginaActual > totalPaginas) paginaActual = totalPaginas;
  if (paginaActual < 1) paginaActual = 1;

  const inicio = (paginaActual - 1) * reportesPorPagina;
  const paginaItems = reportesVisibles.slice(inicio, inicio + reportesPorPagina);

  container.innerHTML = paginaItems.map(item => {
    let badgeClass = 'bg-warning text-dark';
    if (item.estado === 'En revisión') badgeClass = 'bg-info text-dark';
    if (item.estado === 'Atendido' || item.estado === 'Cerrado') badgeClass = 'bg-success text-white';

    const urlMaps = (item.lat && item.lng) 
      ? `https://www.google.com/maps?q=${item.lat},${item.lng}` 
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.ubicacion + ' Tijuana')}`;

    let htmlOpciones = `<span class="badge ${badgeClass} badge-estado shadow-sm">${item.estado || 'En revisión'}</span>`;

    if (usuarioAutenticado) {
      htmlOpciones = `
        <div class="d-flex align-items-center gap-1">
          <span class="badge ${badgeClass} badge-estado shadow-sm">${item.estado || 'En revisión'}</span>
          <div class="dropdown">
            <button class="btn btn-sm btn-light border-0 py-0 px-1" type="button" data-bs-toggle="dropdown">
              <i class="bi bi-three-dots-vertical fs-6 text-muted"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-sm">
              <li><h6 class="dropdown-header">Aprobar / Estado</h6></li>
              <li><a class="dropdown-item small" href="javascript:void(0)" onclick="cambiarEstado('${item.id}', 'Pendiente')">📌 Publicar / Pendiente</a></li>
              <li><a class="dropdown-item small" href="javascript:void(0)" onclick="cambiarEstado('${item.id}', 'En revisión')">🔍 En revisión</a></li>
              <li><a class="dropdown-item small" href="javascript:void(0)" onclick="cambiarEstado('${item.id}', 'Atendido')">✅ Atendido / Cerrado</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item small text-danger" href="javascript:void(0)" onclick="eliminarIncidencia('${item.id}')"><i class="bi bi-trash-fill me-1"></i> Eliminar</a></li>
            </ul>
          </div>
        </div>
      `;
    }

    return `
      <div class="card card-incidencia shadow-sm mb-3 ${item.estado === 'En revisión' ? 'border-info border-2' : ''}">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <span class="badge bg-secondary mb-1">${item.tipo}</span>
              <h5 class="fw-bold mb-1">${item.titulo}</h5>
            </div>
            ${htmlOpciones}
          </div>

          <p class="small text-muted mb-2">
            <i class="bi bi-geo-alt-fill text-danger"></i> <strong>Ubicación:</strong> ${item.ubicacion}
            <a href="${urlMaps}" target="_blank" class="ms-2 btn btn-outline-danger btn-sm py-0 px-2 rounded-pill" style="font-size: 0.72rem;">
              <i class="bi bi-map"></i> Ver en Maps
            </a>
          </p>

          <p class="card-text mb-3">${item.descripcion}</p>

          ${item.imagen_url ? `
            <div class="mb-3">
              <img src="${item.imagen_url}" class="img-fluid rounded border" style="max-height: 280px; width: 100%; object-fit: cover;" alt="Evidencia">
            </div>
          ` : ''}

          <div class="d-flex justify-content-between align-items-center pt-2 border-top text-muted" style="font-size: 0.78rem;">
            <span><i class="bi bi-clock"></i> ${new Date(item.created_at).toLocaleDateString()} ${new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const elInfo = document.getElementById('info-pagina');
  const btnP = document.getElementById('btn-prev');
  const btnN = document.getElementById('btn-next');

  if (elInfo) elInfo.innerText = `Página ${paginaActual} de ${totalPaginas}`;
  if (btnP) btnP.disabled = (paginaActual === 1);
  if (btnN) btnN.disabled = (paginaActual === totalPaginas);
}

function cambiarPagina(delta) {
  paginaActual += delta;
  renderizarPagina();
}

// ==========================================
// 4. CREAR NUEVO REPORTE
// ==========================================

async function crearIncidencia(event) {
  if (event) event.preventDefault();

  const client = obtenerClienteSupabase();
  if (!client) {
    alert('Error: Supabase no está configurado. Revisa las variables SUPABASE_URL y SUPABASE_ANON_KEY en script.js.');
    return;
  }

  const titulo = document.getElementById('inc-titulo').value.trim();
  const tipo = document.getElementById('inc-tipo').value;
  const ubicacion = document.getElementById('inc-ubicacion').value.trim();
  const descripcion = document.getElementById('inc-descripcion').value.trim();
  const inputArchivo = document.getElementById('inc-file');
  const btnGuardar = document.getElementById('btn-guardar');

  const file = inputArchivo ? inputArchivo.files[0] : null;

  if (!titulo || !tipo || !ubicacion || !descripcion) {
    return alert('Por favor llena todos los campos obligatorios.');
  }

  btnGuardar.disabled = true;
  btnGuardar.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Guardando...`;

  let imagenPublicaUrl = null;

  try {
    // 1. Subir imagen si fue proporcionada
    if (file) {
      const fileExt = file.name.split('.').pop();
      const fileName = `incidencia_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await client.storage
        .from('incidencias-fotos')
        .upload(fileName, file);

      if (uploadError) {
        btnGuardar.disabled = false;
        btnGuardar.innerText = 'Enviar Reporte';
        return alert('Error al subir la imagen: ' + uploadError.message);
      }

      const { data: urlData } = client.storage
        .from('incidencias-fotos')
        .getPublicUrl(fileName);

      imagenPublicaUrl = urlData.publicUrl;
    }

    // 2. Insertar reporte con estado 'En revisión'
    const { error: insertError } = await client.from('incidencias').insert([{
      titulo: titulo,
      tipo: tipo,
      ubicacion: ubicacion,
      descripcion: descripcion,
      imagen_url: imagenPublicaUrl,
      lat: latSeleccionada,
      lng: lngSeleccionada,
      estado: 'En revisión'
    }]);

    btnGuardar.disabled = false;
    btnGuardar.innerText = 'Enviar Reporte';

    if (insertError) {
      alert('Error al registrar la incidencia: ' + insertError.message);
    } else {
      alert('¡Gracias por tu reporte! Tu publicación ha sido enviada con éxito y estará en revisión antes de ser publicada.');
      
      const form = document.getElementById('form-incidencia');
      if (form) form.reset();

      cancelarFoto();

      if (marker && map) {
        map.removeLayer(marker);
        marker = null;
      }
      latSeleccionada = null;
      lngSeleccionada = null;

      cargarIncidencias();
    }
  } catch (err) {
    btnGuardar.disabled = false;
    btnGuardar.innerText = 'Enviar Reporte';
    alert('Ocurrió un error inesperado: ' + err.message);
  }
}

// ==========================================
// 5. CAMBIO DE ESTADO Y ELIMINACIÓN (ADMIN)
// ==========================================

async function cambiarEstado(id, nuevoEstado) {
  const client = obtenerClienteSupabase();
  if (!client) return;

  const { error } = await client
    .from('incidencias')
    .update({ estado: nuevoEstado })
    .eq('id', id);

  if (error) {
    alert('Error al cambiar el estado: ' + error.message);
  } else {
    const item = listaIncidencias.find(i => i.id == id);
    if (item) item.estado = nuevoEstado;

    actualizarContadores();
    renderizarPagina();
  }
}

async function eliminarIncidencia(id) {
  const client = obtenerClienteSupabase();
  if (!client) return;

  if (!confirm('¿Estás seguro de eliminar este reporte de forma permanente?')) return;

  const { error } = await client
    .from('incidencias')
    .delete()
    .eq('id', id);

  if (error) {
    alert('Error al eliminar: ' + error.message);
  } else {
    listaIncidencias = listaIncidencias.filter(i => i.id != id);
    actualizarContadores();
    renderizarPagina();
  }
}