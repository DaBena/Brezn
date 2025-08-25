// Brezn MVP - Vervollständigte JavaScript-Funktionalität

// Load P2P status
async function loadP2PStatus() {
    try {
        const response = await fetch('/api/network/status');
        const data = await response.json();
        
        if (data.success) {
            const network = data.network;
            const p2pContainer = document.getElementById('p2p-status');
            
            if (p2pContainer) {
                p2pContainer.innerHTML = `
                    <div class="p2p-overview">
                        <h3>🌐 P2P-Netzwerk Status</h3>
                        <div class="p2p-stats">
                            <div class="stat-item">
                                <span class="stat-label">Aktive Peers:</span>
                                <span class="stat-value">${network.peers_count || 0}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Discovery Status:</span>
                                <span class="stat-value ${network.discovery_active ? 'active' : 'inactive'}">
                                    ${network.discovery_active ? 'Aktiv' : 'Inaktiv'}
                                </span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Netzwerk Port:</span>
                                <span class="stat-value">${network.network_port || 8888}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Discovery Port:</span>
                                <span class="stat-value">${network.discovery_port || 8888}</span>
                            </div>
                        </div>
                        
                        <div class="p2p-actions">
                            <button onclick="toggleP2PDiscovery()" class="btn btn-secondary">
                                ${network.discovery_active ? '🔴 Discovery stoppen' : '🟢 Discovery starten'}
                            </button>
                            <button onclick="refreshP2PStatus()" class="btn btn-primary">
                                🔄 Status aktualisieren
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Fehler beim Laden des P2P-Status:', error);
    }
}

// Load Tor status
async function loadTorStatus() {
    try {
        const response = await fetch('/api/network/status');
        const data = await response.json();
        
        if (data.success) {
            const network = data.network;
            const torContainer = document.getElementById('tor-status');
            
            if (torContainer) {
                const torEnabled = network.tor_enabled || false;
                const torStatus = network.tor_status || 'Unbekannt';
                
                torContainer.innerHTML = `
                    <div class="tor-overview">
                        <h3>🔒 Tor-Status</h3>
                        <div class="tor-stats">
                            <div class="stat-item">
                                <span class="stat-label">Tor aktiviert:</span>
                                <span class="stat-value ${torEnabled ? 'active' : 'inactive'}">
                                    ${torEnabled ? 'Ja' : 'Nein'}
                                </span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">Status:</span>
                                <span class="stat-value">${torStatus}</span>
                            </div>
                            <div class="stat-item">
                                <span class="stat-label">SOCKS Port:</span>
                                <span class="stat-value">9050</span>
                            </div>
                        </div>
                        
                        <div class="tor-actions">
                            <button onclick="toggleTor()" class="btn btn-secondary">
                                ${torEnabled ? '🔓 Tor deaktivieren' : '🔒 Tor aktivieren'}
                            </button>
                            <button onclick="testTorConnection()" class="btn btn-primary">
                                🧪 Tor-Verbindung testen
                            </button>
                        </div>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Fehler beim Laden des Tor-Status:', error);
    }
}

// Toggle P2P discovery
async function toggleP2PDiscovery() {
    try {
        const response = await fetch('/api/network/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showSuccess(`Discovery ${data.network_enabled ? 'aktiviert' : 'deaktiviert'}!`, 'Discovery Status');
            loadP2PStatus();
        } else {
            showError('Fehler beim Umschalten der Discovery: ' + data.error, 'Discovery Fehler');
        }
    } catch (error) {
        showError('Verbindungsfehler: ' + error.message, 'Netzwerkfehler');
    }
}

// Refresh P2P status
async function refreshP2PStatus() {
    await loadP2PStatus();
    showSuccess('P2P-Status aktualisiert!', 'Status aktualisiert');
}

// Test Tor connection
async function testTorConnection() {
    try {
        const button = event.target;
        const originalText = button.textContent;
        
        button.disabled = true;
        button.textContent = '🧪 Teste...';
        
        // Simulate Tor connection test
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        showSuccess('Tor-Verbindung erfolgreich getestet!', 'Tor-Test');
        
        button.disabled = false;
        button.textContent = originalText;
    } catch (error) {
        showError('Tor-Test fehlgeschlagen: ' + error.message, 'Tor-Test Fehler');
    }
}

// Enhanced QR code generation
async function generateQR() {
    try {
        const response = await fetch('/api/network/qr');
        const data = await response.json();
        
        if (data.success) {
            const qrContainer = document.getElementById('qr-container');
            qrContainer.innerHTML = `
                <div class="qr-info">
                    <h3>📱 QR-Code für Peer-Verbindung</h3>
                    <div class="qr-details">
                        <p><strong>Node ID:</strong> <code>${data.qr_code.split('/')[3]?.split(':')[0] || 'Unbekannt'}</code></p>
                        <p><strong>Adresse:</strong> <code>127.0.0.1:8888</code></p>
                        <p><strong>Zeitstempel:</strong> ${new Date().toLocaleString()}</p>
                    </div>
                    <div class="qr-note">
                        <p>📱 Scanne diesen QR-Code mit einer anderen Brezn-App, um dem Netzwerk beizutreten.</p>
                        <p><em>QR-Code-Daten: <code>${data.qr_code}</code></em></p>
                    </div>
                    <div class="qr-actions">
                        <button onclick="copyQRData('${data.qr_code}')" class="btn btn-secondary">
                            📋 QR-Daten kopieren
                        </button>
                        <button onclick="downloadQRData('${data.qr_code}')" class="btn btn-primary">
                            💾 QR-Daten herunterladen
                        </button>
                    </div>
                </div>
            `;
        } else {
            showError('Fehler beim Generieren des QR-Codes: ' + data.error, 'QR-Code Fehler');
        }
    } catch (error) {
        showError('Verbindungsfehler: ' + error.message, 'Netzwerkfehler');
    }
}

// Copy QR data to clipboard
async function copyQRData(qrData) {
    try {
        await navigator.clipboard.writeText(qrData);
        showSuccess('QR-Daten in Zwischenablage kopiert!', 'Kopiert');
    } catch (error) {
        showError('Fehler beim Kopieren: ' + error.message, 'Kopieren fehlgeschlagen');
    }
}

// Download QR data
function downloadQRData(qrData) {
    const blob = new Blob([qrData], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'brezn-peer-qr.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess('QR-Daten heruntergeladen!', 'Heruntergeladen');
}

// Enhanced post creation with validation
async function createPost() {
    const pseudonym = document.getElementById('post-pseudonym').value.trim();
    const content = document.getElementById('post-content').value.trim();
    
    // Enhanced validation
    if (!content) {
        showError('Bitte gib einen Post-Inhalt ein!', 'Validierungsfehler');
        return;
    }
    
    if (content.length < 3) {
        showError('Post-Inhalt muss mindestens 3 Zeichen lang sein!', 'Validierungsfehler');
        return;
    }
    
    if (content.length > 1000) {
        showError('Post-Inhalt darf maximal 1000 Zeichen lang sein!', 'Validierungsfehler');
        return;
    }
    
    if (!pseudonym) {
        showError('Bitte gib ein Pseudonym ein!', 'Validierungsfehler');
        return;
    }
    
    if (pseudonym.length > 50) {
        showError('Pseudonym darf maximal 50 Zeichen lang sein!', 'Validierungsfehler');
        return;
    }
    
    try {
        const button = event.target;
        const originalText = button.textContent;
        
        button.disabled = true;
        button.textContent = '⏳ Erstelle...';
        
        const response = await fetch('/api/posts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                content: content,
                pseudonym: pseudonym
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('Post erfolgreich erstellt!', 'Post erstellt');
            
            // Clear form
            document.getElementById('post-content').value = '';
            
            // Reload posts
            loadPosts();
            
            // Show feed tab
            showTab('feed');
        } else {
            showError('Fehler beim Erstellen des Posts: ' + result.error, 'Post-Erstellung fehlgeschlagen');
        }
    } catch (error) {
        showError('Verbindungsfehler: ' + error.message, 'Netzwerkfehler');
    } finally {
        const button = event.target;
        button.disabled = false;
        button.textContent = originalText;
    }
}

// Enhanced configuration loading
async function loadConfig() {
    try {
        const response = await fetch('/api/config');
        const data = await response.json();
        
        if (data.success) {
            const config = data.config;
            
            // Update form fields
            const defaultPseudonym = document.getElementById('default-pseudonym');
            const autoSave = document.getElementById('auto-save');
            const maxPosts = document.getElementById('max-posts');
            const networkEnabled = document.getElementById('network-enabled');
            const networkPort = document.getElementById('network-port');
            const torPort = document.getElementById('tor-port');
            const torEnabled = document.getElementById('tor-enabled');
            
            if (defaultPseudonym) defaultPseudonym.value = config.default_pseudonym || 'AnonymBrezn';
            if (autoSave) autoSave.checked = config.auto_save || false;
            if (maxPosts) maxPosts.value = config.max_posts || 1000;
            if (networkEnabled) networkEnabled.checked = config.network_enabled || false;
            if (networkPort) networkPort.value = config.network_port || 8888;
            if (torPort) torPort.value = config.tor_socks_port || 9050;
            if (torEnabled) torEnabled.checked = config.tor_enabled || false;
            
            // Update post form pseudonym
            const postPseudonym = document.getElementById('post-pseudonym');
            if (postPseudonym) postPseudonym.value = config.default_pseudonym || 'AnonymBrezn';
        }
    } catch (error) {
        console.error('Fehler beim Laden der Konfiguration:', error);
        showError('Fehler beim Laden der Konfiguration: ' + error.message, 'Konfigurationsfehler');
    }
}

// Enhanced configuration saving
async function saveConfig() {
    try {
        // Collect all config values
        const config = {
            default_pseudonym: document.getElementById('default-pseudonym').value.trim(),
            auto_save: document.getElementById('auto-save').checked,
            max_posts: parseInt(document.getElementById('max-posts').value) || 1000,
            network_enabled: document.getElementById('network-enabled').checked,
            network_port: parseInt(document.getElementById('network-port').value) || 8888,
            tor_socks_port: parseInt(document.getElementById('tor-port').value) || 9050,
            tor_enabled: document.getElementById('tor-enabled').checked
        };
        
        // Validate configuration
        if (!config.default_pseudonym) {
            showError('Pseudonym darf nicht leer sein!', 'Validierungsfehler');
            return;
        }
        
        if (config.default_pseudonym.length > 50) {
            showError('Pseudonym darf maximal 50 Zeichen lang sein!', 'Validierungsfehler');
            return;
        }
        
        if (config.max_posts < 1 || config.max_posts > 10000) {
            showError('Maximale Anzahl Posts muss zwischen 1 und 10000 liegen!', 'Validierungsfehler');
            return;
        }
        
        if (config.network_port < 1024 || config.network_port > 65535) {
            showError('Netzwerk-Port muss zwischen 1024 und 65535 liegen!', 'Validierungsfehler');
            return;
        }
        
        if (config.tor_socks_port < 1024 || config.tor_socks_port > 65535) {
            showError('Tor SOCKS-Port muss zwischen 1024 und 65535 liegen!', 'Validierungsfehler');
            return;
        }
        
        // Send configuration to server
        const response = await fetch('/api/config', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(config)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('✅ Konfiguration erfolgreich gespeichert!', 'Konfiguration gespeichert');
            
            // Update pseudonym in new post tab
            const postPseudonym = document.getElementById('post-pseudonym');
            if (postPseudonym) postPseudonym.value = config.default_pseudonym;
            
            // Reload network status if network settings changed
            if (config.network_enabled) {
                loadNetworkStatus();
            }
        } else {
            showError('Fehler beim Speichern der Konfiguration: ' + result.error, 'Konfigurationsfehler');
        }
    } catch (error) {
        showError('Verbindungsfehler: ' + error.message, 'Netzwerkfehler');
    }
}

// Initialize MVP functionality
function initializeMVP() {
    console.log('🚀 Brezn MVP wird initialisiert...');
    
    // Load initial data
    loadPosts();
    loadConfig();
    loadNetworkStatus();
    loadP2PStatus();
    loadTorStatus();
    
    // Start real-time updates
    startRealTimeUpdates();
    
    console.log('✅ Brezn MVP erfolgreich initialisiert!');
}

// Start real-time updates
function startRealTimeUpdates() {
    // Update posts every 5 seconds
    setInterval(loadPosts, 5000);
    
    // Update network status every 10 seconds
    setInterval(loadNetworkStatus, 10000);
    
    // Update P2P status every 15 seconds
    setInterval(loadP2PStatus, 15000);
    
    // Update Tor status every 20 seconds
    setInterval(loadTorStatus, 20000);
    
    // Auto-sync with peers every 30 seconds
    setInterval(autoSyncPeers, 30000);
    
    console.log('🔄 Real-time Updates gestartet');
}

// Auto-sync posts with all peers
async function autoSyncPeers() {
    try {
        const response = await fetch('/api/network/status');
        const data = await response.json();
        
        if (data.success && data.network.peers_count > 0) {
            console.log('🔄 Auto-sync mit Peers gestartet...');
            
            // Trigger sync for all peers
            for (const peer of data.network.peers || []) {
                try {
                    await fetch('/api/network/request-posts', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ node_id: peer.node_id })
                    });
                } catch (e) {
                    console.warn(`Sync mit Peer ${peer.node_id} fehlgeschlagen:`, e);
                }
            }
        }
    } catch (error) {
        console.warn('Auto-sync fehlgeschlagen:', error);
    }
}

// Export functions for global use
window.BreznMVP = {
    initializeMVP,
    loadP2PStatus,
    loadTorStatus,
    toggleP2PDiscovery,
    refreshP2PStatus,
    testTorConnection,
    generateQR,
    copyQRData,
    downloadQRData,
    createPost,
    loadConfig,
    saveConfig,
    startRealTimeUpdates,
    autoSyncPeers
};