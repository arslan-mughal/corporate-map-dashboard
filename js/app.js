/**
 * Germany Company Locations Map - Controller & Visualizer Engine
 * Layout: Company, Website, Street Address (Germany), Zip Code, City, Phone, Email, Workers, Longitude, Latitude
 */

const state = {
    companies: [],         // Complete JSON raw data
    filteredCompanies: [], // Active filter matching dataset
    map: null,
    activeMarker: null,    // Selected circle marker
    locateMarker: null,    // User GPS locator indicator instance
    
    // Dynamic Mode Sub-layers
    layers: {
        bubble: null,      // Leaflet LayerGroup for normal proportional circles
        cluster: null,     // Leaflet MarkerClusterGroup for clustered viewing
        heatmap: null      // Leaflet Heatmap Layer for density display
    },
    
    charts: {
        topEmployersBar: null
    },

    // Interface storage config parameters
    prefs: {
        theme: 'light',
        mode: 'bubble',
        sidebarCollapsed: false,
        activeTab: 'directory-pane',
        center: [51.1657, 10.4515],
        zoom: 6,
        filters: {
            search: '',
            city: '',
            zipCode: '',
            minWorkers: 0,
            maxWorkers: 5000
        }
    },
    
    limits: {
        maxWorkers: 5000
    }
};

/**
 * Calculates circle marker radii dynamically extracting minimum numbers out of ranges
 */
function getRadius(workerString) {
    const cleanMatch = String(workerString).match(/^(\d+)/);
    const count = cleanMatch ? parseInt(cleanMatch[1], 10) : 0;

    if (count < 50) return 6;
    if (count < 150) return 10;
    if (count < 500) return 15;
    if (count < 1000) return 21;
    return 28;
}

// App Initialization Hooks
document.addEventListener('DOMContentLoaded', () => {
    loadPreferences();
    initMap();
    applyThemeClass();
    setupPanelTogglers();
    loadData();
});

/**
 * Loads preferences from LocalStorage
 */
function loadPreferences() {
    const saved = localStorage.getItem('germany_map_prefs');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.prefs = { ...state.prefs, ...parsed };
        } catch (e) {
            console.warn("Preference restoration aborted", e);
        }
    }
}

/**
 * Saves preferences to LocalStorage
 */
function savePreferences() {
    if (state.map) {
        const center = state.map.getCenter();
        state.prefs.center = [center.lat, center.lng];
        state.prefs.zoom = state.map.getZoom();
    }
    localStorage.setItem('germany_map_prefs', JSON.stringify(state.prefs));
}

/**
 * Applies active theme
 */
function applyThemeClass() {
    const body = document.body;
    if (state.prefs.theme === 'dark') {
        body.classList.add('dark-theme');
    } else {
        body.classList.remove('dark-theme');
    }
}

/**
 * Configures the Leaflet instance and active layers
 */
function initMap() {
    state.map = L.map('map', {
        center: state.prefs.center,
        zoom: state.prefs.zoom,
        zoomControl: false
    });

    // Base Tile Layer using modern crisp map tiles (CartoDB Voyager)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(state.map);

    L.control.zoom({ position: 'bottomleft' }).addTo(state.map);

    // Instantiate dynamic sub-layer controllers
    state.layers.bubble = L.layerGroup();
    state.layers.cluster = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50
    });
    state.layers.heatmap = L.heatLayer([], {
        radius: 25,
        blur: 15,
        maxZoom: 10
    });

    // Event hooks for storing viewport changes on pan/zoom
    state.map.on('moveend', () => {
        savePreferences();
        updateVisibleCompaniesList();
    });
}

/**
 * Binds DOM triggers for menus, tabs, fullscreen, GPS tracking, and exports
 */
function setupPanelTogglers() {
    const sidebar = document.getElementById('sidebar');
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const themeBtn = document.getElementById('theme-toggle-btn');
    const printBtn = document.getElementById('print-map-btn');
    const locateBtn = document.getElementById('locate-me-btn');
    const fullscreenBtn = document.getElementById('fullscreen-toggle-btn');
    const downloadCsvBtn = document.getElementById('download-csv-btn');

    if (state.prefs.sidebarCollapsed || window.innerWidth <= 768) {
        sidebar.classList.add('collapsed');
    } else {
        sidebar.classList.remove('collapsed');
    }

    sidebarToggle.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        state.prefs.sidebarCollapsed = collapsed;
        savePreferences();
        
        if (window.innerWidth <= 768) {
            if (collapsed) {
                sidebarBackdrop.classList.remove('active');
            } else {
                sidebarBackdrop.classList.add('active');
            }
        }
    });

    sidebarBackdrop.addEventListener('click', () => {
        sidebar.classList.add('collapsed');
        sidebarBackdrop.classList.remove('active');
        state.prefs.sidebarCollapsed = true;
        savePreferences();
    });

    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        const tabId = btn.getAttribute('data-tab');
        if (tabId === state.prefs.activeTab) {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById(tabId).classList.add('active');
        }

        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPaneId = btn.getAttribute('data-tab');
            document.getElementById(targetPaneId).classList.add('active');
            
            state.prefs.activeTab = targetPaneId;
            savePreferences();

            if (targetPaneId === 'stats-pane') {
                setTimeout(() => {
                    if (state.charts.topEmployersBar) state.charts.topEmployersBar.resize();
                }, 50);
            }
        });
    });

    themeBtn.addEventListener('click', () => {
        state.prefs.theme = (state.prefs.theme === 'light') ? 'dark' : 'light';
        applyThemeClass();
        savePreferences();
    });

    locateBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
            alert("Geolocation tracking features are unsupported by this browser.");
            return;
        }

        locateBtn.style.color = '#2563eb';
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;

                if (state.locateMarker) {
                    state.locateMarker.setLatLng([lat, lng]);
                } else {
                    const pulseIcon = L.divIcon({
                        className: 'locate-marker',
                        iconSize: [16, 16]
                    });
                    state.locateMarker = L.marker([lat, lng], { icon: pulseIcon }).addTo(state.map);
                }

                state.map.setView([lat, lng], 13);
                locateBtn.style.color = '';
            },
            (err) => {
                console.warn(`GPS locating error: ${err.message}`);
                alert("Unable to track position. Please verify GPS permissions.");
                locateBtn.style.color = '';
            },
            { enableHighAccuracy: true, timeout: 6000 }
        );
    });

    fullscreenBtn.addEventListener('click', () => {
        const container = document.getElementById('app-container');
        if (!document.fullscreenElement) {
            container.requestFullscreen().catch((err) => {
                alert(`Error entering fullscreen mode: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    });

    printBtn.addEventListener('click', () => {
        window.print();
    });

    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
        const modeValue = btn.getAttribute('data-mode');
        if (modeValue === state.prefs.mode) {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }

        btn.addEventListener('click', () => {
            modeBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            state.prefs.mode = modeValue;
            savePreferences();
            applyLayerMode();
        });
    });

    downloadCsvBtn.addEventListener('click', downloadVisibleCSV);

    const filters = document.getElementById('filter-panel');
    const filterToggle = document.getElementById('filter-toggle');
    if (filterToggle && filters) {
        filterToggle.addEventListener('click', () => {
            filters.classList.toggle('collapsed');
        });
    }
}

/**
 * Loads dataset records from the local workspace with runtime cache busting
 */
async function loadData() {
    const listContainer = document.getElementById('companies-list');
    try {
        const cacheBuster = `?t=${new Date().getTime()}`;
        const response = await fetch(`companies.json${cacheBuster}`);
        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
        
        state.companies = await response.json();
        
        initializeFilterBounds();
        populateGeographicDropdowns();
        restoreSavedFilterStates();
        bindFilterControls();

        applyFilters();
        
    } catch (error) {
        console.error("Critical error building system variables:", error);
        if (listContainer) {
            listContainer.innerHTML = `
                <div class="loading-spinner" style="color: #dc2626;">
                    Failed to load directory. Check network paths.
                </div>
            `;
        }
    }
}

/**
 * Sets slider thresholds based on maximum worker sizes inside array objects
 */
function initializeFilterBounds() {
    let maxWorkersVal = 1000;
    state.companies.forEach(company => {
        const cleanMatch = String(company.workers).match(/^(\d+)/);
        const count = cleanMatch ? parseInt(cleanMatch[1], 10) : 0;
        if (count > maxWorkersVal) maxWorkersVal = count;
    });

    state.limits.maxWorkers = maxWorkersVal;
    
    const minSlider = document.getElementById('min-workers') || document.getElementById('min-employees');
    const maxSlider = document.getElementById('max-workers') || document.getElementById('max-employees');
    
    if (minSlider) minSlider.max = maxWorkersVal;
    if (maxSlider) maxSlider.max = maxWorkersVal;
    
    state.prefs.filters.maxWorkers = Math.min(state.prefs.filters.maxWorkers || 5000, maxWorkersVal);
}

/**
 * Populates Selection Parameter Dropdowns for City and Zip Code
 */
function populateGeographicDropdowns() {
    const citySelect = document.getElementById('city-select');
    const zipSelect = document.getElementById('zip-select');

    if (!citySelect || !zipSelect) return;

    const uniqueCities = new Set();
    const uniqueZips = new Set();

    state.companies.forEach(c => {
        if (c.city) uniqueCities.add(c.city.trim());
        if (c.zipCode) uniqueZips.add(String(c.zipCode).trim());
    });

    // Populate City Options
    Array.from(uniqueCities).sort().forEach(city => {
        const option = document.createElement('option');
        option.value = city;
        option.textContent = city;
        citySelect.appendChild(option);
    });

    // Populate Zip Code Options
    Array.from(uniqueZips).sort().forEach(zip => {
        const option = document.createElement('option');
        option.value = zip;
        option.textContent = zip;
        zipSelect.appendChild(option);
    });
}

/**
 * Restores user filters from local preference state
 */
function restoreSavedFilterStates() {
    const f = state.prefs.filters;
    
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = f.search || '';

    const citySelect = document.getElementById('city-select');
    if (citySelect) citySelect.value = f.city || '';

    const zipSelect = document.getElementById('zip-select');
    if (zipSelect) zipSelect.value = f.zipCode || '';
    
    const minSlider = document.getElementById('min-workers') || document.getElementById('min-employees');
    const maxSlider = document.getElementById('max-workers') || document.getElementById('max-employees');
    
    const minDisplay = document.getElementById('min-work-display') || document.getElementById('min-emp-display');
    const maxDisplay = document.getElementById('max-work-display') || document.getElementById('max-emp-display');

    if (minSlider) minSlider.value = f.minWorkers || 0;
    if (maxSlider) maxSlider.value = f.maxWorkers || state.limits.maxWorkers;
    
    if (minDisplay) minDisplay.textContent = (f.minWorkers || 0).toLocaleString();
    
    if (maxDisplay) {
        const currentMax = f.maxWorkers || state.limits.maxWorkers;
        if (currentMax === state.limits.maxWorkers) {
            maxDisplay.textContent = currentMax.toLocaleString() + "+";
        } else {
            maxDisplay.textContent = currentMax.toLocaleString();
        }
    }
}

/**
 * Listens for filter inputs and updates saved preferences on change
 */
function bindFilterControls() {
    const searchInput = document.getElementById('search-input');
    const citySelect = document.getElementById('city-select');
    const zipSelect = document.getElementById('zip-select');
    const minSlider = document.getElementById('min-workers') || document.getElementById('min-employees');
    const maxSlider = document.getElementById('max-workers') || document.getElementById('max-employees');
    const resetBtn = document.getElementById('reset-filters-btn');

    const minDisplay = document.getElementById('min-work-display') || document.getElementById('min-emp-display');
    const maxDisplay = document.getElementById('max-work-display') || document.getElementById('max-emp-display');

    const triggerFilterUpdate = () => {
        savePreferences();
        applyFilters();
    };

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            state.prefs.filters.search = e.target.value;
            triggerFilterUpdate();
        });
    }

    if (citySelect) {
        citySelect.addEventListener('change', (e) => {
            state.prefs.filters.city = e.target.value;
            triggerFilterUpdate();
        });
    }

    if (zipSelect) {
        zipSelect.addEventListener('change', (e) => {
            state.prefs.filters.zipCode = e.target.value;
            triggerFilterUpdate();
        });
    }

    if (minSlider) {
        minSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value, 10);
            state.prefs.filters.minWorkers = value;
            if (minDisplay) minDisplay.textContent = value.toLocaleString();
            
            if (maxSlider && value > parseInt(maxSlider.value, 10)) {
                maxSlider.value = value;
                state.prefs.filters.maxWorkers = value;
                if (maxDisplay) maxDisplay.textContent = value.toLocaleString();
            }
            triggerFilterUpdate();
        });
    }

    if (maxSlider) {
        maxSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value, 10);
            state.prefs.filters.maxWorkers = value;
            
            if (maxDisplay) {
                if (value === state.limits.maxWorkers) {
                    maxDisplay.textContent = value.toLocaleString() + "+";
                } else {
                    maxDisplay.textContent = value.toLocaleString();
                }
            }

            if (minSlider && value < parseInt(minSlider.value, 10)) {
                minSlider.value = value;
                state.prefs.filters.minWorkers = value;
                if (minDisplay) minDisplay.textContent = value.toLocaleString();
            }
            triggerFilterUpdate();
        });
    }

    if (resetBtn) {
        resetBtn.addEventListener('click', () => {
            localStorage.clear(); // Clear cached bounds to resolve slider lockups
            state.prefs.filters = {
                search: '',
                city: '',
                zipCode: '',
                minWorkers: 0,
                maxWorkers: state.limits.maxWorkers
            };
            restoreSavedFilterStates();
            triggerFilterUpdate();
        });
    }
}

/**
 * Filters the active company dataset based on selection parameters
 */
function applyFilters() {
    const f = state.prefs.filters;
    const query = (f.search || '').toLowerCase().trim();

    state.filteredCompanies = state.companies.filter(company => {
        // Text Match Fields
        const matchesSearch = !query || 
            (company.company && company.company.toLowerCase().includes(query)) ||
            (company.address && company.address.toLowerCase().includes(query));

        // Geographic Dropdown Filtering Match
        const matchesCity = !f.city || company.city === f.city;
        const matchesZip = !f.zipCode || String(company.zipCode) === f.zipCode;

        // Worker Extraction Calculation Ranges Match
        const cleanMatch = String(company.workers).match(/^(\d+)/);
        const count = cleanMatch ? parseInt(cleanMatch[1], 10) : 0;
        
        const targetMin = f.minWorkers !== undefined ? f.minWorkers : 0;
        const targetMax = f.maxWorkers !== undefined ? f.maxWorkers : state.limits.maxWorkers;
        const matchesWorkers = count >= targetMin && count <= targetMax;

        return matchesSearch && matchesCity && matchesZip && matchesWorkers;
    });

    state.layers.bubble.clearLayers();
    state.layers.cluster.clearLayers();
    
    const heatData = [];

    state.filteredCompanies.forEach(company => {
        if (!company.latitude || !company.longitude) return;

        const markerColor = '#2563eb'; 
        const markerRadius = getRadius(company.workers);

        // 1. Proportional Circle Markers
        const bubbleMarker = L.circleMarker([company.latitude, company.longitude], {
            radius: markerRadius,
            fillColor: markerColor,
            color: '#ffffff',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.8
        });
        bindPopupToMarker(bubbleMarker, company);
        state.layers.bubble.addLayer(bubbleMarker);

        // 2. Cluster Marker Group
        const clusterMarker = L.circleMarker([company.latitude, company.longitude], {
            radius: 8,
            fillColor: markerColor,
            color: '#ffffff',
            weight: 1.5,
            opacity: 1,
            fillOpacity: 0.95
        });
        bindPopupToMarker(clusterMarker, company);
        state.layers.cluster.addLayer(clusterMarker);

        // 3. Heatmap Data Array
        const cleanMatch = String(company.workers).match(/^(\d+)/);
        const count = cleanMatch ? parseInt(cleanMatch[1], 10) : 1;
        const workerWeight = Math.min(1.0, count / 1000);
        heatData.push([company.latitude, company.longitude, workerWeight]);
    });

    state.layers.heatmap.setLatLngs(heatData);
    applyLayerMode();
}

/**
 * Toggles the map layers between bubble, cluster, and heatmap views
 */
function applyLayerMode() {
    const activeMode = state.prefs.mode;
    
    state.map.removeLayer(state.layers.bubble);
    state.map.removeLayer(state.layers.cluster);
    state.map.removeLayer(state.layers.heatmap);

    if (activeMode === 'cluster') {
        state.map.addLayer(state.layers.cluster);
    } else if (activeMode === 'heatmap') {
        state.map.addLayer(state.layers.heatmap);
    } else {
        state.map.addLayer(state.layers.bubble);
    }

    updateVisibleCompaniesList();
}

/**
 * Dynamic viewport boundary listener: filters the sidebar listing on pan/zoom
 */
function updateVisibleCompaniesList() {
    if (!state.map) return;
    
    const bounds = state.map.getBounds();
    
    const visibleCompanies = state.filteredCompanies.filter(company => {
        if (!company.latitude || !company.longitude) return false;
        return bounds.contains([company.latitude, company.longitude]);
    });

    renderDirectoryList(visibleCompanies);
    updateDashboardUI(visibleCompanies);
    
    const totalCountEl = document.getElementById('total-count') || document.getElementById('total-count-display');
    if (totalCountEl) totalCountEl.textContent = visibleCompanies.length;
}

/**
 * Builds standard list markup structure inside the directory sidebar
 */
function renderDirectoryList(companies) {
    const listContainer = document.getElementById('companies-list');
    if (!listContainer) return;
    
    listContainer.innerHTML = '';

    if (companies.length === 0) {
        listContainer.innerHTML = '<div class="loading-spinner">No visible locations found inside map viewport.</div>';
        return;
    }

    companies.forEach(company => {
        const card = document.createElement('div');
        card.className = 'company-card';
        card.setAttribute('data-id', company.company);
        
        const cleanMatch = String(company.workers).match(/^(\d+)/);
        const count = cleanMatch ? parseInt(cleanMatch[1], 10) : 0;
        
        card.innerHTML = `
            <h4>${company.company || 'Unknown Corporation'}</h4>
            <div class="meta-line">
                <span>${company.city || 'No Location Data'}</span>
                <span>${count > 0 ? count.toLocaleString() : company.workers || '0'} Workers</span>
            </div>
        `;
        
        card.addEventListener('click', () => {
            selectCompany(company);
        });
        
        listContainer.appendChild(card);
    });
}

/**
 * Computes, transforms, and renders visualization metrics inside dashboard panels
 */
function updateDashboardUI(visibleCompanies) {
    const totalFiltered = state.filteredCompanies.length;
    const totalVisibleCount = visibleCompanies.length;
    
    let totalWorkers = 0;
    let largestEmployer = null;
    let maxWorkers = -1;

    visibleCompanies.forEach(c => {
        const cleanMatch = String(c.workers).match(/^(\d+)/);
        const count = cleanMatch ? parseInt(cleanMatch[1], 10) : 0;
        totalWorkers += count;
        
        if (count > maxWorkers) {
            maxWorkers = count;
            largestEmployer = c;
        }
    });

    const avgWorkers = totalVisibleCount > 0 ? (totalWorkers / totalVisibleCount) : 0;

    const totalCompEl = document.getElementById('stat-total-companies');
    const visCompEl = document.getElementById('stat-visible-companies');
    const totalEmpEl = document.getElementById('stat-total-employees') || document.getElementById('stat-total-workers');
    const avgEmpEl = document.getElementById('stat-avg-employees') || document.getElementById('stat-avg-workers');

    if (totalCompEl) totalCompEl.textContent = totalFiltered.toLocaleString();
    if (visCompEl) visCompEl.textContent = totalVisibleCount.toLocaleString();
    if (totalEmpEl) totalEmpEl.textContent = totalWorkers.toLocaleString();
    if (avgEmpEl) avgEmpEl.textContent = Math.round(avgWorkers).toLocaleString();

    const spotlightTitle = document.getElementById('stat-largest-employer');
    const spotlightCount = document.getElementById('stat-largest-count');

    if (largestEmployer) {
        if (spotlightTitle) spotlightTitle.textContent = largestEmployer.company;
        if (spotlightCount) spotlightCount.textContent = `${maxWorkers.toLocaleString()} workers (${largestEmployer.city || 'Unknown City'})`;
    } else {
        if (spotlightTitle) spotlightTitle.textContent = "None Visible";
        if (spotlightCount) spotlightCount.textContent = "0 workers";
    }

    const topEmployers = [...visibleCompanies]
        .sort((a, b) => {
            const aMatch = String(a.workers).match(/^(\d+)/);
            const bMatch = String(b.workers).match(/^(\d+)/);
            return (bMatch ? parseInt(bMatch[1], 10) : 0) - (aMatch ? parseInt(aMatch[1], 10) : 0);
        })
        .slice(0, 10);

    const barLabels = topEmployers.map(c => c.company || 'Unknown');
    const barData = topEmployers.map(c => {
        const m = String(c.workers).match(/^(\d+)/);
        return m ? parseInt(m[1], 10) : 0;
    });
    const barColors = topEmployers.map(() => '#2563eb');

    renderTopEmployersBarChart(barLabels, barData, barColors);
}

/**
 * Handles rendering / updating the Top 10 Horizontal Bar Chart safely
 */
function renderTopEmployersBarChart(labels, data, colors) {
    const chartEl = document.getElementById('top-employers-bar-chart');
    if (!chartEl) return;
    
    const ctx = chartEl.getContext('2d');

    if (labels.length === 0) {
        labels = ["No visible data"];
        data = [0];
        colors = ["#e2e8f0"];
    }

    if (state.charts.topEmployersBar) {
        state.charts.topEmployersBar.data.labels = labels;
        state.charts.topEmployersBar.data.datasets[0].data = data;
        state.charts.topEmployersBar.data.datasets[0].backgroundColor = colors;
        state.charts.topEmployersBar.update();
    } else if (typeof Chart !== 'undefined') {
        state.charts.topEmployersBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Workers',
                    data: data,
                    backgroundColor: colors,
                    borderRadius: 3
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { font: { size: 8 } } },
                    y: { grid: { display: false }, ticks: { font: { size: 8 } } }
                }
            }
        });
    }
}

/**
 * Dynamically binds popups with inline metadata cards to Leaflet markers
 */
function bindPopupToMarker(marker, company) {
    const name = company.company || 'Unknown Corporation';
    const address = company.address ? `${company.address}, ${company.zipCode || ''} ${company.city || ''}`.trim() : 'No address details';
    const workers = company.workers || '0';

    const phoneRow = company.phone ? `<div class="popup-row"><span class="popup-label">Phone:</span><span class="popup-value"><a href="tel:${company.phone}" class="popup-link">${company.phone}</a></span></div>` : '';
    const emailRow = company.email ? `<div class="popup-row"><span class="popup-label">Email:</span><span class="popup-value"><a href="mailto:${company.email}" class="popup-link">${company.email}</a></span></div>` : '';

    let websiteBtn = '';
    if (company.website) {
        const url = company.website.startsWith('http') ? company.website : `https://${company.website}`;
        websiteBtn = `<a href="${url}" target="_blank" class="popup-cta-btn">Visit Website</a>`;
    }

    const popupContent = `
        <div class="modern-popup">
            <header class="popup-header"><h3 class="popup-title">${name}</h3></header>
            <section class="popup-body">
                <div class="metrics-grid">
                    <div class="metric-box">
                        <span class="metric-val">${workers}</span>
                        <span class="metric-lbl">Workers</span>
                    </div>
                </div>
                <div class="popup-details-list">
                    <div class="popup-row"><span class="popup-label">Address:</span><span class="popup-value">${address}</span></div>
                    ${phoneRow}
                    ${emailRow}
                </div>
            </section>
            ${websiteBtn}
        </div>
    `;
    marker.bindPopup(popupContent, { maxWidth: 300, minWidth: 260 });
}

/**
 * Handles map navigation and selections
 */
function selectCompany(company) {
    if (!company.latitude || !company.longitude) return;
    state.map.setView([company.latitude, company.longitude], 13);
    
    setTimeout(() => {
        let activeMarkerTarget = null;
        const currentMode = state.prefs.mode;

        if (currentMode === 'bubble') {
            state.layers.bubble.eachLayer(layer => {
                const latlng = layer.getLatLng();
                if (latlng.lat === company.latitude && latlng.lng === company.longitude) {
                    activeMarkerTarget = layer;
                }
            });
        } else if (currentMode === 'cluster') {
            state.layers.cluster.eachLayer(layer => {
                const latlng = layer.getLatLng();
                if (latlng.lat === company.latitude && latlng.lng === company.longitude) {
                    activeMarkerTarget = layer;
                }
            });
        }

        if (activeMarkerTarget) {
            if (state.activeMarker) {
                state.activeMarker.setStyle({ color: '#ffffff', weight: 1.5 });
            }
            activeMarkerTarget.setStyle({ color: '#0f172a', weight: 3.5 });
            state.activeMarker = activeMarkerTarget;
            activeMarkerTarget.openPopup();
        }
    }, 200);

    highlightSidebarCard(company.company);

    if (window.innerWidth <= 768) {
        const sidebar = document.getElementById('sidebar');
        const sidebarBackdrop = document.getElementById('sidebar-backdrop');
        if (sidebar) sidebar.classList.add('collapsed');
        if (sidebarBackdrop) sidebarBackdrop.classList.remove('active');
        state.prefs.sidebarCollapsed = true;
        savePreferences();
    }
}

function highlightSidebarCard(companyId) {
    document.querySelectorAll('.company-card').forEach(card => {
        card.classList.remove('active');
    });

    const activeCard = document.querySelector(`.company-card[data-id="${companyId}"]`);
    if (activeCard) {
        activeCard.classList.add('active');
        activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

/**
 * Computes, structures, and triggers a dynamic visible dataset CSV download back to Excel format
 */
function downloadVisibleCSV() {
    const bounds = state.map.getBounds();
    const visibleCompanies = state.filteredCompanies.filter(company => {
        if (!company.latitude || !company.longitude) return false;
        return bounds.contains([company.latitude, company.longitude]);
    });

    if (visibleCompanies.length === 0) {
        alert("No active visible records found inside your viewport to export.");
        return;
    }

    const headers = ['Company', 'Website', 'Street Address (Germany)', 'Zip Code', 'City', 'Phone', 'Email', 'Workers', 'Longitude', 'Latitude'];
    const rows = visibleCompanies.map(c => [
        `"${(c.company || '').replace(/"/g, '""')}"`,
        `"${(c.website || '').replace(/"/g, '""')}"`,
        `"${(c.address || '').replace(/"/g, '""')}"`,
        `"${(c.zipCode || '').replace(/"/g, '""')}"`,
        `"${(c.city || '').replace(/"/g, '""')}"`,
        `"${(c.phone || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.workers || '0')}"`,
        c.longitude || '',
        c.latitude || ''
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `germany_visible_companies_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Handles cleaning out legacy segment indicators
 */
function updateLegendUI() {
    const segmentsContainer = document.getElementById('legend-segments');
    if (segmentsContainer) segmentsContainer.innerHTML = '';
}
