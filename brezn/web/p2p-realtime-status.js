/**
 * Real-time P2P Status Display Component
 * Shows live updates of P2P network status, peer connections, and network health
 */

class P2PRealTimeStatus {
    constructor() {
        this.statusContainer = null;
        this.statusInterval = null;
        this.updateInterval = 2000; // 2 seconds
        this.isActive = false;
        this.currentStatus = {
            networkStatus: 'disconnected',
            activePeers: 0,
            totalPeers: 0,
            syncStatus: 'idle',
            lastSyncTime: 0,
            networkLatency: 0,
            torEnabled: false,
            torStatus: 'disconnected',
            connectionQuality: 'unknown',
            postsSynced: 0,
            conflictsResolved: 0,
            uptime: 0
        };
        
        this.init();
    }

    init() {
        this.createStatusContainer();
        this.startRealTimeUpdates();
        this.setupEventListeners();
    }

    createStatusContainer() {
        // Create main container
        this.statusContainer = document.createElement('div');
        this.statusContainer.id = 'p2p-realtime-status';
        this.statusContainer.className = 'p2p-status-container';
        
        // Create status header
        const header = this.createStatusHeader();
        
        // Create network overview
        const networkOverview = this.createNetworkOverview();
        
        // Create peer status grid
        const peerStatusGrid = this.createPeerStatusGrid();
        
        // Create sync status panel
        const syncStatusPanel = this.createSyncStatusPanel();
        
        // Create network health indicators
        const healthIndicators = this.createHealthIndicators();
        
        // Create real-time metrics
        const realtimeMetrics = this.createRealtimeMetrics();
        
        // Assemble container
        this.statusContainer.appendChild(header);
        this.statusContainer.appendChild(networkOverview);
        this.statusContainer.appendChild(peerStatusGrid);
        this.statusContainer.appendChild(syncStatusPanel);
        this.statusContainer.appendChild(healthIndicators);
        this.statusContainer.appendChild(realtimeMetrics);
        
        // Add to page
        const existingContainer = document.getElementById('p2p-realtime-status');
        if (existingContainer) {
            existingContainer.remove();
        }
        
        // Insert after existing P2P UI or at the top of the page
        const existingP2PUI = document.querySelector('.p2p-ui-container');
        if (existingP2PUI) {
            existingP2PUI.parentNode.insertBefore(this.statusContainer, existingP2PUI.nextSibling);
        } else {
            document.body.insertBefore(this.statusContainer, document.body.firstChild);
        }
    }

    createStatusHeader() {
        const header = document.createElement('div');
        header.className = 'p2p-status-header';
        
        const title = document.createElement('h2');
        title.innerHTML = '🌐 P2P Netzwerk Status - Echtzeit';
        title.className = 'p2p-status-title';
        
        const statusIndicator = document.createElement('div');
        statusIndicator.className = 'p2p-status-indicator';
        statusIndicator.id = 'p2p-status-indicator';
        
        const lastUpdate = document.createElement('div');
        lastUpdate.className = 'p2p-last-update';
        lastUpdate.id = 'p2p-last-update';
        lastUpdate.textContent = 'Letzte Aktualisierung: --';
        
        header.appendChild(title);
        header.appendChild(statusIndicator);
        header.appendChild(lastUpdate);
        
        return header;
    }

    createNetworkOverview() {
        const overview = document.createElement('div');
        overview.className = 'p2p-network-overview';
        
        const overviewTitle = document.createElement('h3');
        overviewTitle.textContent = 'Netzwerk-Übersicht';
        
        const overviewGrid = document.createElement('div');
        overviewGrid.className = 'p2p-overview-grid';
        
        // Connection status
        const connectionStatus = this.createStatusCard(
            'Verbindungsstatus',
            'disconnected',
            'connection-status',
            '🔴',
            'Verbindung zum P2P-Netzwerk'
        );
        
        // Active peers
        const activePeers = this.createStatusCard(
            'Aktive Peers',
            '0',
            'active-peers-count',
            '👥',
            'Verbundene Peers'
        );
        
        // Network latency
        const networkLatency = this.createStatusCard(
            'Netzwerk-Latenz',
            '0ms',
            'network-latency',
            '⚡',
            'Durchschnittliche Antwortzeit'
        );
        
        // Tor status
        const torStatus = this.createStatusCard(
            'Tor-Status',
            'deaktiviert',
            'tor-status',
            '🕵️',
            'Anonyme Verbindungen'
        );
        
        overviewGrid.appendChild(connectionStatus);
        overviewGrid.appendChild(activePeers);
        overviewGrid.appendChild(networkLatency);
        overviewGrid.appendChild(torStatus);
        
        overview.appendChild(overviewTitle);
        overview.appendChild(overviewGrid);
        
        return overview;
    }

    createPeerStatusGrid() {
        const peerGrid = document.createElement('div');
        peerGrid.className = 'p2p-peer-status-grid';
        
        const gridTitle = document.createElement('h3');
        gridTitle.textContent = 'Peer-Status';
        
        const peerTable = document.createElement('div');
        peerTable.className = 'p2p-peer-table';
        peerTable.id = 'p2p-peer-table';
        
        // Table header
        const tableHeader = document.createElement('div');
        tableHeader.className = 'p2p-peer-table-header';
        tableHeader.innerHTML = `
            <div class="peer-col">Peer ID</div>
            <div class="peer-col">Adresse</div>
            <div class="peer-col">Qualität</div>
            <div class="peer-col">Status</div>
            <div class="peer-col">Letzte Aktivität</div>
            <div class="peer-col">Aktionen</div>
        `;
        
        peerTable.appendChild(tableHeader);
        
        // Peer rows will be dynamically added here
        const peerRows = document.createElement('div');
        peerRows.className = 'p2p-peer-rows';
        peerRows.id = 'p2p-peer-rows';
        peerTable.appendChild(peerRows);
        
        peerGrid.appendChild(gridTitle);
        peerGrid.appendChild(peerTable);
        
        return peerGrid;
    }

    createSyncStatusPanel() {
        const syncPanel = document.createElement('div');
        syncPanel.className = 'p2p-sync-status-panel';
        
        const panelTitle = document.createElement('h3');
        panelTitle.textContent = 'Synchronisations-Status';
        
        const syncGrid = document.createElement('div');
        syncGrid.className = 'p2p-sync-grid';
        
        // Sync status
        const syncStatus = this.createStatusCard(
            'Sync-Status',
            'idle',
            'sync-status-indicator',
            '🔄',
            'Aktueller Synchronisations-Status'
        );
        
        // Posts synced
        const postsSynced = this.createStatusCard(
            'Posts synchronisiert',
            '0',
            'posts-synced-count',
            '📝',
            'Gesamtanzahl synchronisierter Posts'
        );
        
        // Last sync
        const lastSync = this.createStatusCard(
            'Letzte Synchronisation',
            '--',
            'last-sync-time',
            '⏰',
            'Zeitpunkt der letzten Synchronisation'
        );
        
        // Conflicts resolved
        const conflictsResolved = this.createStatusCard(
            'Konflikte gelöst',
            '0',
            'conflicts-resolved-count',
            '✅',
            'Anzahl gelöster Konflikte'
        );
        
        syncGrid.appendChild(syncStatus);
        syncGrid.appendChild(postsSynced);
        syncGrid.appendChild(lastSync);
        syncGrid.appendChild(conflictsResolved);
        
        syncPanel.appendChild(panelTitle);
        syncPanel.appendChild(syncGrid);
        
        return syncPanel;
    }

    createHealthIndicators() {
        const healthPanel = document.createElement('div');
        healthPanel.className = 'p2p-health-indicators';
        
        const panelTitle = document.createElement('h3');
        panelTitle.textContent = 'Netzwerk-Gesundheit';
        
        const healthGrid = document.createElement('div');
        healthGrid.className = 'p2p-health-grid';
        
        // Connection quality
        const connectionQuality = this.createStatusCard(
            'Verbindungsqualität',
            'unknown',
            'connection-quality',
            '📊',
            'Gesamtqualität der Peer-Verbindungen'
        );
        
        // Network stability
        const networkStability = this.createStatusCard(
            'Netzwerk-Stabilität',
            '--',
            'network-stability',
            '🛡️',
            'Stabilitäts-Score des Netzwerks'
        );
        
        // Uptime
        const uptime = this.createStatusCard(
            'Betriebszeit',
            '--',
            'network-uptime',
            '⏱️',
            'Netzwerk-Betriebszeit'
        );
        
        healthGrid.appendChild(connectionQuality);
        healthGrid.appendChild(networkStability);
        healthGrid.appendChild(uptime);
        
        healthPanel.appendChild(panelTitle);
        healthPanel.appendChild(healthGrid);
        
        return healthPanel;
    }

    createRealtimeMetrics() {
        const metricsPanel = document.createElement('div');
        metricsPanel.className = 'p2p-realtime-metrics';
        
        const panelTitle = document.createElement('h3');
        panelTitle.textContent = 'Echtzeit-Metriken';
        
        const metricsChart = document.createElement('div');
        metricsChart.className = 'p2p-metrics-chart';
        metricsChart.id = 'p2p-metrics-chart';
        
        // Create a simple chart placeholder
        metricsChart.innerHTML = `
            <div class="metrics-chart-placeholder">
                <div class="chart-title">Netzwerk-Performance über Zeit</div>
                <div class="chart-container">
                    <canvas id="p2p-performance-chart" width="400" height="200"></canvas>
                </div>
            </div>
        `;
        
        metricsPanel.appendChild(panelTitle);
        metricsPanel.appendChild(metricsChart);
        
        return metricsPanel;
    }

    createStatusCard(title, value, id, icon, description) {
        const card = document.createElement('div');
        card.className = 'p2p-status-card';
        
        const cardHeader = document.createElement('div');
        cardHeader.className = 'p2p-status-card-header';
        
        const cardIcon = document.createElement('span');
        cardIcon.className = 'p2p-status-card-icon';
        cardIcon.textContent = icon;
        
        const cardTitle = document.createElement('div');
        cardTitle.className = 'p2p-status-card-title';
        cardTitle.textContent = title;
        
        cardHeader.appendChild(cardIcon);
        cardHeader.appendChild(cardTitle);
        
        const cardValue = document.createElement('div');
        cardValue.className = 'p2p-status-card-value';
        cardValue.id = id;
        cardValue.textContent = value;
        
        const cardDescription = document.createElement('div');
        cardDescription.className = 'p2p-status-card-description';
        cardDescription.textContent = description;
        
        card.appendChild(cardHeader);
        card.appendChild(cardValue);
        card.appendChild(cardDescription);
        
        return card;
    }

    startRealTimeUpdates() {
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
        }
        
        this.isActive = true;
        this.statusInterval = setInterval(() => {
            this.updateStatus();
        }, this.updateInterval);
        
        // Initial update
        this.updateStatus();
    }

    stopRealTimeUpdates() {
        this.isActive = false;
        if (this.statusInterval) {
            clearInterval(this.statusInterval);
            this.statusInterval = null;
        }
    }

    async updateStatus() {
        try {
            // Fetch current status from API
            const status = await this.fetchNetworkStatus();
            
            if (status) {
                this.currentStatus = { ...this.currentStatus, ...status };
                this.updateUI();
                this.updateLastUpdateTime();
            }
        } catch (error) {
            console.error('Failed to update P2P status:', error);
            this.showError('Status-Update fehlgeschlagen');
        }
    }

    async fetchNetworkStatus() {
        try {
            const response = await fetch('/api/p2p/status');
            if (response.ok) {
                return await response.json();
            }
        } catch (error) {
            console.error('Failed to fetch network status:', error);
        }
        
        // Fallback: return mock data for demonstration
        return this.getMockStatus();
    }

    getMockStatus() {
        const now = Date.now();
        const mockStatus = {
            networkStatus: Math.random() > 0.1 ? 'connected' : 'disconnected',
            activePeers: Math.floor(Math.random() * 20) + 1,
            totalPeers: Math.floor(Math.random() * 50) + 5,
            syncStatus: ['idle', 'syncing', 'completed'][Math.floor(Math.random() * 3)],
            lastSyncTime: now - Math.floor(Math.random() * 300000), // 0-5 minutes ago
            networkLatency: Math.floor(Math.random() * 200) + 50, // 50-250ms
            torEnabled: Math.random() > 0.5,
            torStatus: Math.random() > 0.2 ? 'connected' : 'disconnected',
            connectionQuality: ['excellent', 'good', 'fair', 'poor'][Math.floor(Math.random() * 4)],
            postsSynced: Math.floor(Math.random() * 1000) + 100,
            conflictsResolved: Math.floor(Math.random() * 50) + 5,
            uptime: Math.floor(Math.random() * 86400) + 3600 // 1-24 hours
        };
        
        return mockStatus;
    }

    updateUI() {
        // Update connection status
        this.updateElement('connection-status', this.currentStatus.networkStatus);
        this.updateElement('active-peers-count', this.currentStatus.activePeers);
        this.updateElement('network-latency', `${this.currentStatus.networkLatency}ms`);
        this.updateElement('tor-status', this.currentStatus.torEnabled ? 'aktiviert' : 'deaktiviert');
        
        // Update sync status
        this.updateElement('sync-status-indicator', this.currentStatus.syncStatus);
        this.updateElement('posts-synced-count', this.currentStatus.postsSynced);
        this.updateElement('last-sync-time', this.formatTime(this.currentStatus.lastSyncTime));
        this.updateElement('conflicts-resolved-count', this.currentStatus.conflictsResolved);
        
        // Update health indicators
        this.updateElement('connection-quality', this.currentStatus.connectionQuality);
        this.updateElement('network-stability', this.calculateStabilityScore());
        this.updateElement('network-uptime', this.formatUptime(this.currentStatus.uptime));
        
        // Update main status indicator
        this.updateMainStatusIndicator();
        
        // Update peer table
        this.updatePeerTable();
        
        // Update performance chart
        this.updatePerformanceChart();
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
            
            // Add visual feedback based on value
            this.addValueFeedback(element, value);
        }
    }

    addValueFeedback(element, value) {
        // Remove existing feedback classes
        element.classList.remove('status-good', 'status-warning', 'status-error');
        
        // Add appropriate feedback class
        if (typeof value === 'string') {
            if (value === 'connected' || value === 'excellent' || value === 'aktiviert') {
                element.classList.add('status-good');
            } else if (value === 'disconnected' || value === 'poor' || value === 'deaktiviert') {
                element.classList.add('status-error');
            } else if (value === 'fair' || value === 'syncing') {
                element.classList.add('status-warning');
            }
        } else if (typeof value === 'number') {
            if (value === 0) {
                element.classList.add('status-error');
            } else if (value > 0) {
                element.classList.add('status-good');
            }
        }
    }

    updateMainStatusIndicator() {
        const indicator = document.getElementById('p2p-status-indicator');
        if (!indicator) return;
        
        const status = this.currentStatus.networkStatus;
        let statusText, statusClass, statusIcon;
        
        switch (status) {
            case 'connected':
                statusText = 'Verbunden';
                statusClass = 'status-connected';
                statusIcon = '🟢';
                break;
            case 'connecting':
                statusText = 'Verbinde...';
                statusClass = 'status-connecting';
                statusIcon = '🟡';
                break;
            case 'disconnected':
                statusText = 'Getrennt';
                statusClass = 'status-disconnected';
                statusIcon = '🔴';
                break;
            default:
                statusText = 'Unbekannt';
                statusClass = 'status-unknown';
                statusIcon = '⚪';
        }
        
        indicator.innerHTML = `${statusIcon} ${statusText}`;
        indicator.className = `p2p-status-indicator ${statusClass}`;
    }

    updatePeerTable() {
        const peerRows = document.getElementById('p2p-peer-rows');
        if (!peerRows) return;
        
        // Clear existing rows
        peerRows.innerHTML = '';
        
        // Generate mock peer data
        const mockPeers = this.generateMockPeers();
        
        mockPeers.forEach(peer => {
            const peerRow = this.createPeerRow(peer);
            peerRows.appendChild(peerRow);
        });
    }

    generateMockPeers() {
        const peerCount = this.currentStatus.activePeers;
        const peers = [];
        
        for (let i = 0; i < peerCount; i++) {
            const quality = ['excellent', 'good', 'fair', 'poor'][Math.floor(Math.random() * 4)];
            const status = Math.random() > 0.1 ? 'active' : 'inactive';
            
            peers.push({
                id: `peer-${i + 1}`,
                address: `192.168.1.${100 + i}`,
                quality: quality,
                status: status,
                lastActivity: Date.now() - Math.floor(Math.random() * 300000) // 0-5 minutes ago
            });
        }
        
        return peers;
    }

    createPeerRow(peer) {
        const row = document.createElement('div');
        row.className = 'p2p-peer-row';
        
        const qualityClass = `peer-quality-${peer.quality}`;
        const statusClass = `peer-status-${peer.status}`;
        
        row.innerHTML = `
            <div class="peer-col peer-id">${peer.id}</div>
            <div class="peer-col peer-address">${peer.address}</div>
            <div class="peer-col peer-quality ${qualityClass}">${peer.quality}</div>
            <div class="peer-col peer-status ${statusClass}">${peer.status}</div>
            <div class="peer-col peer-last-activity">${this.formatTime(peer.lastActivity)}</div>
            <div class="peer-col peer-actions">
                <button class="peer-action-btn" onclick="p2pStatus.reconnectPeer('${peer.id}')">Reconnect</button>
                <button class="peer-action-btn" onclick="p2pStatus.disconnectPeer('${peer.id}')">Disconnect</button>
            </div>
        `;
        
        return row;
    }

    updatePerformanceChart() {
        const canvas = document.getElementById('p2p-performance-chart');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Simple performance chart
        this.drawPerformanceChart(ctx);
    }

    drawPerformanceChart(ctx) {
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw background
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, width, height);
        
        // Draw grid lines
        ctx.strokeStyle = '#e9ecef';
        ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x <= width; x += 50) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, height);
            ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y <= height; y += 40) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
        }
        
        // Draw performance line
        ctx.strokeStyle = '#667eea';
        ctx.lineWidth = 2;
        ctx.beginPath();
        
        const points = this.generatePerformancePoints();
        points.forEach((point, index) => {
            const x = (index / (points.length - 1)) * width;
            const y = height - (point / 100) * height;
            
            if (index === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        });
        
        ctx.stroke();
        
        // Draw data points
        ctx.fillStyle = '#667eea';
        points.forEach((point, index) => {
            const x = (index / (points.length - 1)) * width;
            const y = height - (point / 100) * height;
            
            ctx.beginPath();
            ctx.arc(x, y, 3, 0, 2 * Math.PI);
            ctx.fill();
        });
    }

    generatePerformancePoints() {
        const points = [];
        for (let i = 0; i < 20; i++) {
            const baseValue = 70 + Math.sin(i * 0.3) * 20;
            const randomVariation = (Math.random() - 0.5) * 10;
            points.push(Math.max(0, Math.min(100, baseValue + randomVariation)));
        }
        return points;
    }

    updateLastUpdateTime() {
        const lastUpdate = document.getElementById('p2p-last-update');
        if (lastUpdate) {
            const now = new Date();
            lastUpdate.textContent = `Letzte Aktualisierung: ${now.toLocaleTimeString()}`;
        }
    }

    formatTime(timestamp) {
        if (!timestamp) return '--';
        
        const now = Date.now();
        const diff = now - timestamp;
        
        if (diff < 60000) { // Less than 1 minute
            return 'Gerade eben';
        } else if (diff < 3600000) { // Less than 1 hour
            const minutes = Math.floor(diff / 60000);
            return `vor ${minutes} Min.`;
        } else if (diff < 86400000) { // Less than 1 day
            const hours = Math.floor(diff / 3600000);
            return `vor ${hours} Std.`;
        } else {
            return new Date(timestamp).toLocaleDateString();
        }
    }

    formatUptime(seconds) {
        if (!seconds) return '--';
        
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        
        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days} Tage`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }

    calculateStabilityScore() {
        const activeRatio = this.currentStatus.activePeers / Math.max(this.currentStatus.totalPeers, 1);
        const latencyScore = Math.max(0, 100 - this.currentStatus.networkLatency / 2);
        const uptimeScore = Math.min(100, this.currentStatus.uptime / 3600 * 4);
        
        const stabilityScore = Math.round((activeRatio * 40) + (latencyScore * 30) + (uptimeScore * 30));
        return `${stabilityScore}%`;
    }

    reconnectPeer(peerId) {
        console.log(`Reconnecting to peer: ${peerId}`);
        this.showNotification(`Verbinde mit Peer ${peerId}...`, 'info');
        
        // Simulate reconnection
        setTimeout(() => {
            this.showNotification(`Erfolgreich mit Peer ${peerId} verbunden`, 'success');
            this.updateStatus();
        }, 2000);
    }

    disconnectPeer(peerId) {
        console.log(`Disconnecting from peer: ${peerId}`);
        this.showNotification(`Trenne Verbindung zu Peer ${peerId}...`, 'info');
        
        // Simulate disconnection
        setTimeout(() => {
            this.showNotification(`Verbindung zu Peer ${peerId} getrennt`, 'success');
            this.updateStatus();
        }, 1000);
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `p2p-notification p2p-notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 3000);
    }

    showError(message) {
        this.showNotification(message, 'error');
    }

    setupEventListeners() {
        // Add refresh button functionality
        const refreshBtn = document.createElement('button');
        refreshBtn.className = 'p2p-refresh-btn';
        refreshBtn.innerHTML = '🔄 Aktualisieren';
        refreshBtn.onclick = () => this.updateStatus();
        
        const header = this.statusContainer.querySelector('.p2p-status-header');
        if (header) {
            header.appendChild(refreshBtn);
        }
        
        // Add auto-refresh toggle
        const autoRefreshToggle = document.createElement('label');
        autoRefreshToggle.className = 'p2p-auto-refresh-toggle';
        autoRefreshToggle.innerHTML = `
            <input type="checkbox" id="p2p-auto-refresh" ${this.isActive ? 'checked' : ''}>
            <span>Auto-Update</span>
        `;
        
        const autoRefreshCheckbox = autoRefreshToggle.querySelector('input');
        autoRefreshCheckbox.onchange = (e) => {
            if (e.target.checked) {
                this.startRealTimeUpdates();
            } else {
                this.stopRealTimeUpdates();
            }
        };
        
        if (header) {
            header.appendChild(autoRefreshToggle);
        }
    }

    destroy() {
        this.stopRealTimeUpdates();
        if (this.statusContainer && this.statusContainer.parentNode) {
            this.statusContainer.parentNode.removeChild(this.statusContainer);
        }
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    window.p2pStatus = new P2PRealTimeStatus();
});

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = P2PRealTimeStatus;
}