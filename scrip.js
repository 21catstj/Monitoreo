const SUPABASE_URL = 'https://kbxsszmpritrafmqyqbr.supabase.co';
const SUPABASE_KEY = 'sb_publishable_b-iHd631PbjPe11mR_uU4g_ETn-0yzs';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let mapa;
let marcador;
// Coordenadas por defecto: Sánchez Taboada, Tijuana
let latSeleccionada = 32.4825;
let lngSeleccionada = -116.9855;

document.addEventListener('DOMContentLoaded', () => {
  inicializarMapa();
  cargarIncidencias();
});

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

// Función GPS mejorada
function obtenerUbicacionGPS() {
  if (!navigator.geolocation) {
    alert('Tu dispositivo o navegador no soporta geolocalización GPS.');
    return;
  }

  const btnGps = document.getElementById('btn-gps');
  if (btnGps) btnGps.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Obteniendo señal GPS...';

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;

      if (mapa) {
        mapa.invalidateSize(); // Refresca el lienzo del mapa por si acaso
        mapa.setView([lat, lng], 17);
      }
      
      await actualizarPosicion(lat, lng);

      if (btnGps) btnGps.innerHTML = '<i class="bi bi-crosshair"></i> Usar mi ubicación actual (GPS)';
    },
    (error) => {
      if (btnGps) btnGps.innerHTML = '<i class="bi bi-crosshair"></i> Usar mi ubicación actual (GPS)';
      alert('Error de GPS: Asegúrate de aceptar el permiso de ubicación que solicita el navegador.');
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
    console.log('Error al obtener nombre de calle:', err);
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

  if (!incidencias || incidencias.length === 0) {
    container.innerHTML = `<div class="text-center py-4 text-muted">No hay reportes registrados aún. ¡Sé el primero en reportar una incidencia!</div>`;
    return;
  }

  container.innerHTML = incidencias.map(item => {
    let badgeClass = 'bg-warning text-dark';
    if (item.estado === 'En revisión') badgeClass = 'bg-info text-dark';
    if (item.estado === 'Atendido') badgeClass = 'bg-success';

    const urlGoogleMaps = (item.lat && item.lng) 
      ? `https://www.google.com/maps?q=${item.lat},${item.lng}` 
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.ubicacion + ' Sanchez Taboada Tijuana')}`;

    return `
      <div class="card card-incidencia shadow-sm mb-3">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-start mb-2">
            <div>
              <span class="badge bg-secondary mb-1">${item.tipo}</span>
              <h5 class="fw-bold mb-1">${item.titulo}</h5>
            </div>
            <span class="badge ${badgeClass} badge-estado">${item.estado || 'Pendiente'}</span>
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