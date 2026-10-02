// Configuración de Supabase (Reemplaza con tus credenciales de Supabase)
const SUPABASE_URL = 'https://zlxaiahojqkqdprtmfwt.supabase.co';
const SUPABASE_KEY = 'sb_publishable_dgF4imCaL52CFmdOZ17kKQ_0lhrCSq7';
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Inicializar al cargar la página
document.addEventListener('DOMContentLoaded', () => {
  cargarIncidencias();
});

// Control visual para adjuntar fotografías
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

// Cargar listado de incidencias desde Supabase
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

// Guardar nueva incidencia
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

  // Subir foto a Supabase Storage si existe
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

  // Insertar en la base de datos
  const { error: insertError } = await _supabase.from('incidencias').insert([{
    titulo: titulo,
    tipo: tipo,
    ubicacion: ubicacion,
    descripcion: descripcion,
    imagen_url: imagenPublicaUrl,
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