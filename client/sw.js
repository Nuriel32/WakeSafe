// Service Worker for WakeSafe Client
const CACHE_NAME = 'wakesafe-v1.0.0';
const STATIC_CACHE_URLS = [
    '/',
    '/index.html',
    '/styles/main.css',
    '/styles/auth.css',
    '/styles/dashboard.css',
    '/styles/upload.css',
    '/js/config.js',
    '/js/auth.js',
    '/js/api.js',
    '/js/websocket.js',
    '/js/upload.js',
    '/js/dashboard.js',
    '/js/app.js',
    'https://cdn.socket.io/4.7.2/socket.io.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css'
];

// Install event
self.addEventListener('install', (event) => {
    console.log('Service Worker installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Caching static assets...');
                return cache.addAll(STATIC_CACHE_URLS);
            })
            .then(() => {
                console.log('Service Worker installed successfully');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('Service Worker installation failed:', error);
            })
    );
});

// Activate event
self.addEventListener('activate', (event) => {
    console.log('Service Worker activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== CACHE_NAME) {
                            console.log('Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker activated successfully');
                return self.clients.claim();
            })
    );
});

// Fetch event
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip API requests (let them go to network)
    if (url.pathname.startsWith('/api/')) {
        return;
    }
    
    // Skip WebSocket requests
    if (url.protocol === 'ws:' || url.protocol === 'wss:') {
        return;
    }
    
    event.respondWith(
        caches.match(request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    console.log('Serving from cache:', request.url);
                    return cachedResponse;
                }
                
                console.log('Fetching from network:', request.url);
                return fetch(request)
                    .then((response) => {
                        // Don't cache non-successful responses
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        
                        // Clone the response
                        const responseToCache = response.clone();
                        
                        // Cache static assets
                        if (isStaticAsset(request.url)) {
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(request, responseToCache);
                                });
                        }
                        
                        return response;
                    })
                    .catch((error) => {
                        console.error('Fetch failed:', error);
                        
                        // Return offline page for navigation requests
                        if (request.mode === 'navigate') {
                            return caches.match('/index.html');
                        }
                        
                        throw error;
                    });
            })
    );
});

// Helper function to check if URL is a static asset
function isStaticAsset(url) {
    const staticExtensions = ['.css', '.js', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2'];
    return staticExtensions.some(ext => url.includes(ext));
}

// Background sync for offline uploads
self.addEventListener('sync', (event) => {
    if (event.tag === 'background-sync-upload') {
        console.log('Background sync: processing offline uploads');
        event.waitUntil(processOfflineUploads());
    }
});

// Process offline uploads when connection is restored
async function processOfflineUploads() {
    try {
        // Get offline uploads from IndexedDB
        const offlineUploads = await getOfflineUploads();
        
        for (const upload of offlineUploads) {
            try {
                // Attempt to upload
                await uploadFile(upload);
                
                // Remove from offline storage on success
                await removeOfflineUpload(upload.id);
                
                console.log('Offline upload completed:', upload.fileName);
            } catch (error) {
                console.error('Offline upload failed:', error);
            }
        }
    } catch (error) {
        console.error('Background sync failed:', error);
    }
}

// Message handling for communication with main thread
self.addEventListener('message', (event) => {
    const { type, data } = event.data;
    
    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;
            
        case 'CACHE_UPLOAD':
            cacheUpload(data);
            break;
            
        case 'GET_CACHE_STATUS':
            getCacheStatus().then(status => {
                event.ports[0].postMessage({ type: 'CACHE_STATUS', data: status });
            });
            break;
            
        default:
            console.log('Unknown message type:', type);
    }
});

// Cache upload data for offline processing
async function cacheUpload(uploadData) {
    try {
        // Store in IndexedDB for offline processing
        const db = await openDB();
        const transaction = db.transaction(['uploads'], 'readwrite');
        const store = transaction.objectStore('uploads');
        
        await store.add({
            ...uploadData,
            timestamp: Date.now(),
            status: 'pending'
        });
        
        console.log('Upload cached for offline processing');
    } catch (error) {
        console.error('Failed to cache upload:', error);
    }
}

// Get cache status
async function getCacheStatus() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        
        return {
            cacheName: CACHE_NAME,
            cachedItems: keys.length,
            cacheSize: await getCacheSize(cache)
        };
    } catch (error) {
        console.error('Failed to get cache status:', error);
        return null;
    }
}

// Get approximate cache size
async function getCacheSize(cache) {
    try {
        const keys = await cache.keys();
        let totalSize = 0;
        
        for (const key of keys) {
            const response = await cache.match(key);
            if (response) {
                const blob = await response.blob();
                totalSize += blob.size;
            }
        }
        
        return totalSize;
    } catch (error) {
        return 0;
    }
}

// Open IndexedDB for offline storage
function openDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('WakeSafeOffline', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            
            if (!db.objectStoreNames.contains('uploads')) {
                const store = db.createObjectStore('uploads', { keyPath: 'id', autoIncrement: true });
                store.createIndex('timestamp', 'timestamp', { unique: false });
                store.createIndex('status', 'status', { unique: false });
            }
        };
    });
}

// Get offline uploads from IndexedDB
async function getOfflineUploads() {
    try {
        const db = await openDB();
        const transaction = db.transaction(['uploads'], 'readonly');
        const store = transaction.objectStore('uploads');
        
        return new Promise((resolve, reject) => {
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error('Failed to get offline uploads:', error);
        return [];
    }
}

// Remove offline upload from IndexedDB
async function removeOfflineUpload(id) {
    try {
        const db = await openDB();
        const transaction = db.transaction(['uploads'], 'readwrite');
        const store = transaction.objectStore('uploads');
        
        await store.delete(id);
    } catch (error) {
        console.error('Failed to remove offline upload:', error);
    }
}

// Upload file (placeholder - implement based on your API)
async function uploadFile(uploadData) {
    // This would contain the actual upload logic
    // For now, just log the attempt
    console.log('Attempting to upload:', uploadData.fileName);
    
    // Simulate upload
    return new Promise((resolve) => {
        setTimeout(() => {
            console.log('Upload completed:', uploadData.fileName);
            resolve();
        }, 1000);
    });
}

console.log('Service Worker loaded successfully');
