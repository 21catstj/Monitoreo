const SUPABASE_URL = 'https://kbxsszmpritrafmqyqbr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_b-iHd631PbjPe11mR_uU4g_ETn-0yzs';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let mapa;
let marcador;
let latSeleccionada = 32.4825;
let lngSeleccionada = -116.9855;

let listaIncidencias = [];
let paginaActual = 1;
const reportesPorPagina = 10;
let usuarioAutenticado = null;

document.addEventListener('DOMContentLoaded', async () => {
  inicializarMapa();
  await verificarSesion();
  cargarIncidencias();
});

// Verificar si hay usuario con sesión activa
async function verificarSesion() {
  const { data: { session } } = await _supabase.auth.getSession();
  usuarioAutenticado = session ? session.user : null;
  actualizarBotonHeader();
}

function actualizarBotonHeader() {
  const btnAuth = document.getElementById('btn-auth-header');
  if (!btnAuth) return;

  if (usuarioAutenticado) {
    btnAuth.innerHTML = `<i class="bi bi-box-arrow-right"></i> Cerrar Sesión (${usuarioAutenticado.email.split('@')[0]})`;
    btnAuth.removeAttribute('data-bs-toggle');
    btnAuth.removeAttribute('data-bs-target');
    btnAuth.onclick = cerrarSesion;
  } else {
    btnAuth.innerHTML = `<i class="bi bi-person-lock"></i> Acceso Admin`;
    btnAuth.setAttribute('data-bs-toggle', 'modal');
    btnAuth.setAttribute('data-bs-target', '#modalLogin');
    btnAuth.onclick = null;
  }
}

async function iniciarSesion() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();
  const btn = document.getElementById('btn-login-submit');

  btn.disabled = true;
  btn.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Verificando...`;

  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });

  btn.disabled = false;
  btn.innerText = 'Ingresar';

  if (error) {
    alert('Error al iniciar sesión: ' + error.message);
  } else {
    usuarioAutenticado = data.user;
    
    // Cerrar modal
    const modalEl = document.getElementById('modalLogin');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    actualizarBotonHeader();
    renderizarPagina(); // Volver a renderizar para activar la edición de estados
    alert('¡Bienvenido! Ahora tienes permisos de administrador.');
  }
}

async function cerrarSesion() {
  await _supabase.auth.signOut();
  usuarioAutenticado = null;
  actualizarBotonHeader();
  renderizarPagina(); // Desactivar la edición de estados
  alert('Sesión cerrada correctamente.');
}

function inicializarMapa() {
  const container = document.getElementById('mapa-formulario');
  if (!container) return;

  mapa = L.map('mapa-formulario').setView([latSeleccionada, lngSeleccionada], 15);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '© OpenStreetMap'
  }).addTo(mapa);

  marcador = L.marker([latSeleccionada, lngSeleccionada], { draggable: true }).addTo(mapa);

  mapa.on('click', (e) => {
    actualizarPosicion(e.latlng.lat, e.latlng.lng);
  });

  marcador.on('dragend', (e) => {
    const pos = marcador.getLatLng();
    actualizarPosicion(pos.lat, pos.lng);
  });
}

async function actualizarPosicion(lat, lng) {
  latSeleccionada = lat;
  lngSeleccionada = lng;
  marcador.setLatLng([lat, lng]);
  await autocompletarNombreCalle(lat, lng);
}

function obtenerUbicacionGPS() {
  if (!navigator.geolocation) {
    alert('Tu dispositivo no soporta geolocalización GPS.');
    return;
  }

  const btnGps = document.getElementById('btn-gps');
  if (btnGps) btnGps.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Obteniendo GPS...';

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      if (mapa) {
        mapa.invalidateSize();
        mapa.setView([lat, lng], 17);
      }
      
      await actualizarPosicion(lat, lng);

      if (btnGps) btnGps.innerHTML = '<i class="bi bi-crosshair"></i> Usar mi ubicación actual (GPS)';
    },
    (error) => {
      if (btnGps) btnGps.innerHTML = '<i class="bi bi-crosshair"></i> Usar mi ubicación actual (GPS)';
      alert('Error de GPS: Permite el acceso a la ubicación en tu navegador.');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
}

async function autocompletarNombreCalle(lat, lng) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
    const data = await res.json();
    
    if (data && data.address) {
      const calle = data.address.road || data.address.pedestrian || data.address.suburb || '';
      const colonia = data.address.neighbourhood || data.address.suburb || '';
      
      let direccion = calle;
      if (colonia && !calle.includes(colonia)) {
        direccion += (direccion ? ', ' : '') + colonia;
      }

      if (direccion) {
        document.getElementById('inc-ubicacion').value = direccion;
      }
    }
  } catch (err) {
    console.log('Error al obtener calle:', err);
  }
}

function mostrarVistaPrevia(event) {
  const file = event.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = function(e) {
      document.getElementById('image-preview').src = e.target.result;
      document.getElementById('image-preview-wrapper').classList.remove('d-none');
    };
    reader.readAsDataURL(file);
  }
}

function cancelarFoto() {
  document.getElementById('inc-file').value = '';
  document.getElementById('image-preview-wrapper').classList.add('d-none');
  document.getElementById('image-preview').src = '';
}

async function cargarIncidencias() {
  const container = document.getElementById('incidencias-container');
  if (!container) return;

  const { data: incidencias, error } = await _supabase
    .from('incidencias')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    container.innerHTML = `<div class="alert alert-danger">Error al cargar reportes: ${error.message}</div>`;
    return;
  }

  listaIncidencias = incidencias || [];
  paginaActual = 1;

  actualizarContadores();
  renderizarPagina();
}

function actualizarContadores() {
  let pendientes = 0;
  let revision = 0;
  let atendidos = 0;

  listaIncidencias.forEach(item => {
    const estado = item.estado || 'Pendiente';
    if (estado === 'Pendiente') pendientes++;
    else if (estado === 'En revisión') revision++;
    else if (estado === 'Atendido' || estado === 'Cerrado') atendidos++;
  });

  document.getElementById('cant-pendientes').innerText = pendientes;
  document.getElementById('cant-revision').innerText = revision;
  document.getElementById('cant-atendidos').innerText = atendidos;
}

function renderizarPagina() {
  const container = document.getElementById('incidencias-container');
  if (!container) return;

  if (listaIncidencias.length === 0) {
    container.innerHTML = `<div class="text-center py-4 text-muted">No hay reportes registrados aún. ¡Sé el primero en reportar una incidencia!</div>`;
    document.getElementById('paginacion-controls').classList.add('d-none');
    return;
  }

  document.getElementById('paginacion-controls').classList.remove('d-none');

  const totalPaginas = Math.ceil(listaIncidencias.length / reportesPorPagina);
  if (paginaActual > totalPaginas) paginaActual = totalPaginas;
  if (paginaActual < 1) paginaActual = 1;

  const inicio = (paginaActual - 1) * reportesPorPagina;
  const fin = inicio + reportesPorPagina;
  const paginaItems = listaIncidencias.slice(inicio, fin);

  container.innerHTML = paginaItems.map(item => {
    let badgeClass = 'bg-warning text-dark';
    if (item.estado === 'En revisión') badgeClass = 'bg-info text-dark';
    if (item.estado === 'Atendido' || item.estado === 'Cerrado') badgeClass = 'bg-success text-white';

    const urlGoogleMaps = (item.lat && item.lng) 
      ? `https://www.google.com/maps?q=${item.lat},${item.lng}` 
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.ubicacion + ' Sanchez Taboada Tijuana')}`;

    // Control del botón de estado según autenticación
    let htmlEstado = `<span class="badge ${badgeClass} badge-estado shadow-sm">${item.estado || 'Pendiente'}</span>`;

    if (usuarioAutenticado) {
      htmlEstado = `
        <div class="dropdown">
          <button class="btn btn-sm ${badgeClass} dropdown-toggle badge-estado shadow-sm" type="button" data-bs-toggle="dropdown">
            ${item.estado || 'Pendiente'}
          </button>
          <ul class="dropdown-menu dropdown-menu-end shadow-sm">
            <li><h6 class="dropdown-header">Cambiar Estado</h6></li>
            <li><a class="dropdown-item small" href="javascript:void(0)" onclick="cambiarEstado('${item.id}', 'Pendiente')">⏳ Pendiente</a></li>
            <li><a class="dropdown-item small" href="javascript:void(0)" onclick="cambiarEstado('${item.id}', 'En revisión')">🔍 En revisión</a></li>
            <li><a class="dropdown-item small" href="javascript:void(0)" onclick="cambiarEstado('${item.id}', 'Atendido')">✅ Atendido / Cerrado</a></li>
          </ul>
        </div>
      `;
    }

    return `
      <div class="card card-incidencia shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <span class="badge bg-secondary mb-1">${item.tipo}</span>
              <h5 class="fw-bold mb-1">${item.titulo}</h5>
            </div>
            ${htmlEstado}
          </div>

          <p class="small text-muted mb-2">
            <i class="bi bi-geo-alt-fill text-danger"></i> <strong>Ubicación:</strong> ${item.ubicacion}
            <a href="${urlGoogleMaps}" target="_blank" class="ms-2 btn btn-outline-danger btn-sm py-0 px-2 rounded-pill" style="font-size: 0.72rem;">
              <i class="bi bi-map"></i> Ver en Google Maps
            </a>
          </p>

          <p class="card-text mb-3">${item.descripcion}</p>

          ${item.imagen_url ? `
            <div class="mb-3">
              <img src="${item.imagen_url}" class="img-fluid rounded border" style="max-height: 280px; width: 100%; object-fit: cover;" alt="Foto de evidencia">
            </div>
          ` : ''}

          <div class="d-flex justify-content-between align-items-center pt-2 border-top text-muted" style="font-size: 0.78rem;">
            <span><i class="bi bi-clock"></i> Reportado el: ${new Date(item.created_at).toLocaleDateString()} a las ${new Date(item.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  document.getElementById('info-pagina').innerText = `Página ${paginaActual} de ${totalPaginas}`;
  document.getElementById('btn-prev').disabled = (paginaActual === 1);
  document.getElementById('btn-next').disabled = (paginaActual === totalPaginas);
}

function cambiarPagina(direccion) {
  paginaActual += direccion;
  renderizarPagina();
}

async function cambiarEstado(id, nuevoEstado) {
  if (!usuarioAutenticado) {
    alert('Debes iniciar sesión para realizar esta acción.');
    return;
  }

  const { error } = await _supabase
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

async function crearIncidencia() {
  const titulo = document.getElementById('inc-titulo').value.trim();
  const tipo = document.getElementById('inc-tipo').value;
  const ubicacion = document.getElementById('inc-ubicacion').value.trim();
  const descripcion = document.getElementById('inc-descripcion').value.trim();
  const inputArchivo = document.getElementById('inc-file');
  const btnGuardar = document.getElementById('btn-guardar');

  const file = inputArchivo.files[0];

  if (!titulo || !tipo || !ubicacion || !descripcion) {
    return alert('Por favor llena todos los campos obligatorios.');
  }

  btnGuardar.disabled = true;
  btnGuardar.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Guardando...`;

  let imagenPublicaUrl = null;

  if (file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `incidencia_${Date.now()}.${fileExt}`;

    const { data: uploadData, error: uploadError } = await _supabase.storage
      .from('incidencias-fotos')
      .upload(fileName, file);

    if (uploadError) {
      btnGuardar.disabled = false;
      btnGuardar.innerText = 'Enviar Reporte';
      return alert('Error al subir la imagen: ' + uploadError.message);
    }

    const { data: urlData } = _supabase.storage
      .from('incidencias-fotos')
      .getPublicUrl(fileName);

    imagenPublicaUrl = urlData.publicUrl;
  }

  const { error: insertError } = await _supabase.from('incidencias').insert([{
    titulo: titulo,
    tipo: tipo,
    ubicacion: ubicacion,
    descripcion: descripcion,
    imagen_url: imagenPublicaUrl,
    lat: latSeleccionada,
    lng: lngSeleccionada,
    estado: 'Pendiente'
  }]);

  btnGuardar.disabled = false;
  btnGuardar.innerText = 'Enviar Reporte';

  if (insertError) {
    alert('Error al registrar la incidencia: ' + insertError.message);
  } else {
    alert('¡Incidencia registrada con éxito!');
    document.getElementById('form-incidencia').reset();
    cancelarFoto();
    cargarIncidencias();
  }
}