importScripts('./db-helper.js');

const CACHE_STATIC_NAME = 'static-outbox-v2';
const STATIC_FILES = [
    './',
    './index.html',
    './styles.css',
    './db-helper.js',
    './app.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

const ENDPOINT = 'https://jsonplaceholder.typicode.com/posts';

self.addEventListener('install', (event) => {
    console.log('[SW] Instalando', CACHE_STATIC_NAME);
    event.waitUntil(
        caches.open(CACHE_STATIC_NAME)
            .then((cache) => cache.addAll(STATIC_FILES))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    console.log('[SW] Activado');
    event.waitUntil(
        caches.keys()
            .then((keys) => {
                return Promise.all(
                    keys.map((key) => {
                        if (key !== CACHE_STATIC_NAME) {
                            return caches.delete(key);
                        }
                    })
                );
            })
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    // los POST y las peticiones a la api no pasan por la cache
    if (event.request.method !== 'GET' || !event.request.url.startsWith(self.location.origin)) {
        return;
    }

    event.respondWith(
        caches.match(event.request, { ignoreSearch: true })
            .then((respuestaCache) => {
                return respuestaCache || fetch(event.request);
            })
    );
});

function notificarClientesActualizacion() {
    return self.clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientes) => {
            clientes.forEach((cliente) => {
                cliente.postMessage({
                    tipo: 'OUTBOX_SINCRONIZADO',
                    timestamp: Date.now()
                });
            });
        });
}

function sincronizarPendientesSW() {
    console.log('[SW-Sync] Revisando transacciones pendientes...');

    return obtenerTodosLosRegistros()
        .then((registros) => {
            const pendientes = registros.filter((item) => item.estado === 'pendiente');

            if (pendientes.length === 0) {
                console.log('[SW-Sync] Cola limpia');
                return;
            }

            const promesasDeEnvio = pendientes.map((item) => {
                return fetch(ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        title: item.titulo,
                        body: item.descripcion
                    })
                })
                    .then((respuesta) => {
                        if (!respuesta.ok) {
                            throw new Error('Error HTTP ' + respuesta.status + ' al sincronizar ID ' + item.id);
                        }
                        return actualizarEstadoRegistro(item.id, 'sincronizado');
                    });
            });

            return Promise.all(promesasDeEnvio)
                .then(() => notificarClientesActualizacion());
        });
}

self.addEventListener('sync', (event) => {
    console.log('[SW-Sync] Evento sync con etiqueta', event.tag);

    if (event.tag === 'sync-reportes') {
        event.waitUntil(
            sincronizarPendientesSW()
                .catch((error) => {
                    console.error('[SW-Sync] Fallo la sincronizacion, el navegador va a reintentar', error);
                    // si se relanza el navegador programa otro intento
                    throw error;
                })
        );
    }
});
