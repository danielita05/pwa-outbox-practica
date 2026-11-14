const ENDPOINT = 'https://jsonplaceholder.typicode.com/posts';

const formulario = document.getElementById('form-incidencia');
const inputTitulo = document.getElementById('titulo');
const inputDescripcion = document.getElementById('descripcion');
const listaOutbox = document.getElementById('lista-outbox');
const btnPurgar = document.getElementById('btn-purgar');
const badgeRed = document.getElementById('badge-red');

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
        .then((registro) => {
            console.log('SW registrado con scope', registro.scope);
        })
        .catch((error) => {
            console.error('No se pudo registrar el SW', error);
        });
}

function actualizarIndicadorRed() {
    if (navigator.onLine) {
        badgeRed.textContent = 'En Linea';
        badgeRed.className = 'badge online';
    } else {
        badgeRed.textContent = 'Sin Conexion';
        badgeRed.className = 'badge offline';
    }
}

function formatearHora(fecha) {
    return new Date(fecha).toLocaleString('es-MX', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function renderizarColaOutbox() {
    return obtenerTodosLosRegistros()
        .then((registros) => {
            listaOutbox.innerHTML = '';

            if (registros.length === 0) {
                const vacio = document.createElement('li');
                vacio.className = 'vacio';
                vacio.textContent = 'No hay reportes en la bandeja';
                listaOutbox.appendChild(vacio);
                return;
            }

            registros.forEach((registro) => {
                const li = document.createElement('li');

                const titulo = document.createElement('span');
                titulo.textContent = registro.titulo;

                const estado = document.createElement('span');
                estado.className = 'estado ' + registro.estado;
                estado.textContent = registro.estado;

                const hora = document.createElement('span');
                hora.className = 'hora';
                hora.textContent = formatearHora(registro.fechaSincronizacion || registro.fechaCreacion);

                li.appendChild(titulo);
                li.appendChild(estado);
                li.appendChild(hora);
                listaOutbox.appendChild(li);
            });
        })
        .catch((error) => {
            console.error('Error al leer la bandeja', error);
        });
}

function procesarEnvioReporte(datosFormulario) {
    return fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datosFormulario)
    })
        .then((respuesta) => {
            if (!respuesta.ok) throw new Error('Error HTTP del servidor');
            return respuesta.json();
        })
        .then(() => {
            return guardarRegistro({
                ...datosFormulario,
                estado: 'sincronizado',
                fechaCreacion: Date.now()
            });
        })
        .catch(() => {
            console.warn('[Outbox] Sin conexion, se guarda como pendiente');

            return guardarRegistro({
                ...datosFormulario,
                estado: 'pendiente',
                fechaCreacion: Date.now()
            });
        })
        .then(() => {
            return renderizarColaOutbox();
        });
}

function sincronizarPendientes() {
    console.log('[Outbox] Buscando registros pendientes...');

    return obtenerTodosLosRegistros()
        .then((registros) => {
            const pendientes = registros.filter((item) => item.estado === 'pendiente');

            if (pendientes.length === 0) {
                console.log('[Outbox] No hay pendientes');
                return;
            }

            const promesasDeEnvio = pendientes.map((item) => {
                return fetch(ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ title: item.titulo, body: item.descripcion })
                })
                    .then((res) => {
                        if (!res.ok) throw new Error('Falla al reintentar envio');
                        return actualizarEstadoRegistro(item.id, 'sincronizado');
                    });
            });

            return Promise.all(promesasDeEnvio);
        })
        .then(() => {
            return renderizarColaOutbox();
        })
        .catch((error) => {
            console.error('[Outbox] Error al sincronizar', error);
        });
}

formulario.addEventListener('submit', (e) => {
    e.preventDefault();

    const datos = {
        titulo: inputTitulo.value.trim(),
        descripcion: inputDescripcion.value.trim()
    };

    procesarEnvioReporte(datos)
        .then(() => {
            formulario.reset();
        })
        .catch((error) => {
            console.error('No se pudo procesar el reporte', error);
        });
});

btnPurgar.addEventListener('click', () => {
    obtenerTodosLosRegistros()
        .then((registros) => {
            const enviados = registros.filter((item) => item.estado === 'sincronizado');
            return Promise.all(enviados.map((item) => eliminarRegistro(item.id)));
        })
        .then(() => {
            return renderizarColaOutbox();
        })
        .catch((error) => {
            console.error('Error al purgar', error);
        });
});

window.addEventListener('online', () => {
    actualizarIndicadorRed();
    sincronizarPendientes();
});

window.addEventListener('offline', actualizarIndicadorRed);

actualizarIndicadorRed();
renderizarColaOutbox();
