// Variables globales de estado y paginación
let listaIncidencias = [];
let paginaActual = 1;
const reportesPorPagina = 10;
let usuarioAutenticado = false;
let latSeleccionada = null;
let lngSeleccionada = null;

// ==========================================
// 1. CARGA Y FILTRADO DE DATOS DESDE SUPABASE
// ==========================================

// Cargar todas las incidencias desde Supabase
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

// Actualizar contadores del panel superior
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

  const elPendientes = document.getElementById('cant-pendientes');
  const elRevision = document.getElementById('cant-revision');
  const elAtendidos = document.getElementById('cant-atendidos');

  if (elPendientes) elPendientes.innerText = pendientes;
  if (elRevision) elRevision.innerText = revision;
  if (elAtendidos) elAtendidos.innerText = atendidos;
}

// Renderizar tarjetas de reportes y controles de paginación
function renderizarPagina() {
  const container = document.getElementById('incidencias-container');
  if (!container) return;

  // Si NO es admin, solo se muestran los reportes publicados (Pendiente / Atendido)
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
  const fin = inicio + reportesPorPagina;
  const paginaItems = reportesVisibles.slice(inicio, fin);

  container.innerHTML = paginaItems.map(item => {
    let badgeClass = 'bg-warning text-dark';
    if (item.estado === 'En revisión') badgeClass = 'bg-info text-dark';
    if (item.estado === 'Atendido' || item.estado === 'Cerrado') badgeClass = 'bg-success text-white';

    const urlGoogleMaps = (item.lat && item.lng) 
      ? `https://www.google.com/maps?q=${item.lat},${item.lng}` 
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.ubicacion + ' Sanchez Taboada Tijuana')}`;

    // Menú de opciones de administrador o solo badge público
    let htmlOpciones = `<span class="badge ${badgeClass} badge-estado shadow-sm">${item.estado || 'En revisión'}</span>`;

    if (usuarioAutenticado) {
      htmlOpciones = `
        <div class="d-flex align-items-center gap-1">
          <span class="badge ${badgeClass} badge-estado shadow-sm">${item.estado || 'En revisión'}</span>
          <div class="dropdown">
            <button class="btn btn-sm btn-light border-0 py-0 px-1" type="button" data-bs-toggle="dropdown" aria-expanded="false">
              <i class="bi bi-three-dots-vertical fs-6 text-muted"></i>
            </button>
            <ul class="dropdown-menu dropdown-menu-end shadow-sm">
              <li><h6 class="dropdown-header">Cambiar Estado / Publicar</h6></li>
              <li><a class="dropdown-item small" href="javascript:void(0)" onclick="cambiarEstado('${item.id}', 'Pendiente')">📌 Publicar / Pendiente</a></li>
              <li><a class="dropdown-item small" href="javascript:void(0)" onclick="cambiarEstado('${item.id}', 'En revisión')">🔍 En revisión</a></li>
              <li><a class="dropdown-item small" href="javascript:void(0)" onclick="cambiarEstado('${item.id}', 'Atendido')">✅ Atendido / Cerrado</a></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item small text-primary" href="javascript:void(0)" onclick="prepararEdicion('${item.id}')"><i class="bi bi-pencil-fill me-1"></i> Editar reporte</a></li>
              <li><a class="dropdown-item small text-danger" href="javascript:void(0)" onclick="eliminarIncidencia('${item.id}')"><i class="bi bi-trash-fill me-1"></i> Eliminar reporte</a></li>
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

  const elInfoPagina = document.getElementById('info-pagina');
  const btnPrev = document.getElementById('btn-prev');
  const btnNext = document.getElementById('btn-next');

  if (elInfoPagina) elInfoPagina.innerText = `Página ${paginaActual} de ${totalPaginas}`;
  if (btnPrev) btnPrev.disabled = (paginaActual === 1);
  if (btnNext) btnNext.disabled = (paginaActual === totalPaginas);
}

// Navegación de paginación
function cambiarPagina(delta) {
  paginaActual += delta;
  renderizarPagina();
}


// ==========================================
// 2. CREACIÓN DE NUEVO REPORTE (CIUDADANO)
// ==========================================

async function crearIncidencia() {
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

  // Subir imagen a Storage si fue seleccionada
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

  // Insertar en la base de datos con estado inicial 'En revisión'
  const { error: insertError } = await _supabase.from('incidencias').insert([{
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
    
    document.getElementById('form-incidencia').reset();
    if (typeof cancelarFoto === 'function') cancelarFoto();
    
    // Recargar datos
    cargarIncidencias();
  }
}


// ==========================================
// 3. FUNCIONES DE ADMINISTRACIÓN (ADMIN)
// ==========================================

// Cambiar el estado de un reporte
async function cambiarEstado(id, nuevoEstado) {
  const { error } = await _supabase
    .from('incidencias')
    .update({ estado: nuevoEstado })
    .eq('id', id);

  if (error) {
    alert('Error al actualizar el estado: ' + error.message);
  } else {
    const item = listaIncidencias.find(i => i.id == id);
    if (item) item.estado = nuevoEstado;

    actualizarContadores();
    renderizarPagina();
  }
}

// Cargar datos en el modal de edición
function prepararEdicion(id) {
  const item = listaIncidencias.find(i => i.id == id);
  if (!item) return;

  document.getElementById('edit-id').value = item.id;
  document.getElementById('edit-titulo').value = item.titulo;
  document.getElementById('edit-tipo').value = item.tipo;
  document.getElementById('edit-ubicacion').value = item.ubicacion;
  document.getElementById('edit-descripcion').value = item.descripcion;

  const modalEl = document.getElementById('modalEditar');
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
}

// Guardar los datos editados en Supabase
async function guardarEdicion() {
  const id = document.getElementById('edit-id').value;
  const titulo = document.getElementById('edit-titulo').value.trim();
  const tipo = document.getElementById('edit-tipo').value;
  const ubicacion = document.getElementById('edit-ubicacion').value.trim();
  const descripcion = document.getElementById('edit-descripcion').value.trim();
  const btnGuardar = document.getElementById('btn-guardar-edit');

  btnGuardar.disabled = true;
  btnGuardar.innerHTML = `<span class="spinner-border spinner-border-sm"></span> Guardando...`;

  const { error } = await _supabase
    .from('incidencias')
    .update({ titulo, tipo, ubicacion, descripcion })
    .eq('id', id);

  btnGuardar.disabled = false;
  btnGuardar.innerText = 'Guardar Cambios';

  if (error) {
    alert('Error al actualizar el reporte: ' + error.message);
  } else {
    const item = listaIncidencias.find(i => i.id == id);
    if (item) {
      item.titulo = titulo;
      item.tipo = tipo;
      item.ubicacion = ubicacion;
      item.descripcion = descripcion;
    }

    const modalEl = document.getElementById('modalEditar');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();

    renderizarPagina();
  }
}

// Eliminar reporte permanentemente
async function eliminarIncidencia(id) {
  if (!confirm('¿Estás seguro de que deseas eliminar este reporte de forma permanente?')) return;

  const { error } = await _supabase
    .from('incidencias')
    .delete()
    .eq('id', id);

  if (error) {
    alert('Error al eliminar el reporte: ' + error.message);
  } else {
    listaIncidencias = listaIncidencias.filter(i => i.id != id);
    actualizarContadores();
    renderizarPagina();
  }
}