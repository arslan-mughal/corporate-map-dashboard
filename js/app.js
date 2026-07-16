// write or paste code here

/**
 * Germany Company Locations Map - Controller & Visualizer Engine
 */

const state = {
    companies: [],         // Complete JSON raw data
    filteredCompanies: [], // Active filter matching dataset
    map: null,
    activeMarker: null,    // Selected circle marker
    locateMarker: null,    // User GPS locator indicator instance
    segmentColors: {},     // Unique Segment color tracking map
    
    // Dynamic Mode Sub-layers
    layers: {
        bubble: null,      // Leaflet LayerGroup for normal proportional circles
        cluster: null,     // Leaflet MarkerClusterGroup for clustered viewing
        heatmap: null      // Leaflet Heatmap Layer for density display
    },
    
    charts: {
        segmentPie: null,
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
            segment: '',
            siteType: '',
            minEmployees: 0,
            maxEmployees: 5000
        }
    },
    
    limits: {
        maxEmployees: 5000
    }
};

const COLOR_PALETTE = [
    '#2563eb', '#16a34a', '#ea580c', '#9333ea', 
    '#db2777', '#ca8a04', '#0891b2', '#dc2626'
];
let paletteColorIndex = 0;

/**
 * Assigns segment colors dynamically.
 */
function getSegmentColor(segment) {
    const rawSegment = (segment || 'Other').trim();
    const formattedSegment = rawSegment.charAt(0).toUpperCase() + rawSegment.slice(1).toLowerCase();
    
    if (!state.segmentColors[formattedSegment]) {
        state.segmentColors[formattedSegment] = COLOR_PALETTE[paletteColorIndex % COLOR_PALETTE.length];
        paletteColorIndex++;
    }
    return state.segmentColors[formattedSegment];
}

function getRadius(employees) {
    // This handles both numbers and strings like "80-150" by parsing the first integer
    const count = parseInt(employees) || 0;
    if (count < 100) return 6;
    if (count >= 100 && count < 300) return 10;
    if (count >= 300 && count < 700) return 15;
    if (count >= 700 && count < 1500) return 21;
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

    // Restore sidebar layout state
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

    // Active preferences tab layout restores
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
                    if (state.charts.segmentPie) state.charts.segmentPie.resize();
                    if (state.charts.topEmployersBar) state.charts.topEmployersBar.resize();
                }, 50);
            }
        });
    });

    // Theme Engine trigger toggle hooks
    themeBtn.addEventListener('click', () => {
        state.prefs.theme = (state.prefs.theme === 'light') ? 'dark' : 'light';
        applyThemeClass();
        savePreferences();
    });

    // Locate Me GPS Tracking Tool
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
                const accuracy = pos.coords.accuracy;

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

    // Fullscreen Layout Controls
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

    // Handle print layouts
    printBtn.addEventListener('click', () => {
        window.print();
    });

    // Map visualization Modes Selector
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

    // Export Dynamic Visible CSV Click
    downloadCsvBtn.addEventListener('click', downloadVisibleCSV);

    // Collapsible Filters Panel
    const filters = document.getElementById('filter-panel');
    const filterToggle = document.getElementById('filter-toggle');
    filterToggle.addEventListener('click', () => {
        filters.classList.toggle('collapsed');
    });

    // Collapsible Legend Panel
    const legend = document.getElementById('map-legend');
    const legendToggle = document.getElementById('legend-toggle');
    legendToggle.addEventListener('click', () => {
        legend.classList.toggle('collapsed');
    });
}

/**
 * Loads directory data and initializes view states
 */
async function loadData() {
    const listContainer = document.getElementById('companies-list');
    try {
        const response = await fetch('companies.json');
        if (!response.ok) throw new Error(`HTTP Error Status: ${response.status}`);
        
        state.companies = await response.json();
        
        // Dynamic analysis of dataset properties boundaries
        initializeFilterBounds();
        populateFilterDropdowns();
        restoreSavedFilterStates();
        bindFilterControls();

        // Perform layout paint
        applyFilters();
        updateLegendUI();
        
    } catch (error) {
        console.error("Critical error building system variables:", error);
        listContainer.innerHTML = `
            <div class="loading-spinner" style="color: #dc2626;">
                Failed to load directory. Check network paths.
            </div>
        `;
    }
}

/**
 * Sets slider thresholds based on maximum employee size
 */
function initializeFilterBounds() {
    let maxEmployeesVal = 1000;
    state.companies.forEach(company => {
        const count = parseInt(company.employees) || 0;
        if (count > maxEmployeesVal) maxEmployeesVal = count;
    });

    state.limits.maxEmployees = maxEmployeesVal;
    
    const minSlider = document.getElementById('min-employees');
    const maxSlider = document.getElementById('max-employees');
    
    minSlider.max = maxEmployeesVal;
    maxSlider.max = maxEmployeesVal;
    
    state.prefs.filters.maxEmployees = Math.min(state.prefs.filters.maxEmployees, maxEmployeesVal);
}

/**
 * Builds selection parameters for Segment and Site Type filters
 */
function populateFilterDropdowns() {
    const segmentSelect = document.getElementById('segment-select');
    const siteTypeSelect = document.getElementById('sitetype-select');

    const uniqueSegments = new Set();
    const uniqueSiteTypes = new Set();

    state.companies.forEach(c => {
        if (c.segment) uniqueSegments.add(c.segment.trim());
        if (c.siteType) uniqueSiteTypes.add(c.siteType.trim());
    });

    Array.from(uniqueSegments).sort().forEach(seg => {
        const option = document.createElement('option');
        option.value = seg;
        option.textContent = seg;
        segmentSelect.appendChild(option);
    });

    Array.from(uniqueSiteTypes).sort().forEach(type => {
        const option = document.createElement('option');
        option.value = type;
        option.textContent = type;
        siteTypeSelect.appendChild(option);
    });
}

/**
 * Restores user filters from local preference state
 */
function restoreSavedFilterStates() {
    const f = state.prefs.filters;
    
    document.getElementById('search-input').value = f.search;
    document.getElementById('segment-select').value = f.segment;
    document.getElementById('sitetype-select').value = f.siteType;
    
    const minSlider = document.getElementById('min-employees');
    const maxSlider = document.getElementById('max-employees');
    
    minSlider.value = f.minEmployees;
    maxSlider.value = f.maxEmployees;
    
    document.getElementById('min-emp-display').textContent = f.minEmployees.toLocaleString();
    
    if (f.maxEmployees === state.limits.maxEmployees) {
        document.getElementById('max-emp-display').textContent = f.maxEmployees.toLocaleString() + "+";
    } else {
        document.getElementById('max-emp-display').textContent = f.maxEmployees.toLocaleString();
    }
}

/**
 * Listens for filter inputs and updates saved preferences on change
 */
function bindFilterControls() {
    const searchInput = document.getElementById('search-input');
    const segmentSelect = document.getElementById('segment-select');
    const siteTypeSelect = document.getElementById('sitetype-select');
    const minSlider = document.getElementById('min-employees');
    const maxSlider = document.getElementById('max-employees');
    const resetBtn = document.getElementById('reset-filters-btn');

    const triggerFilterUpdate = () => {
        savePreferences();
        applyFilters();
    };

    searchInput.addEventListener('input', (e) => {
        state.prefs.filters.search = e.target.value;
        triggerFilterUpdate();
    });

    segmentSelect.addEventListener('change', (e) => {
        state.prefs.filters.segment = e.target.value;
        triggerFilterUpdate();
    });

    siteTypeSelect.addEventListener('change', (e) => {
        state.prefs.filters.siteType = e.target.value;
        triggerFilterUpdate();
    });

    minSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        state.prefs.filters.minEmployees = value;
        document.getElementById('min-emp-display').textContent = value.toLocaleString();
        
        if (value > parseInt(maxSlider.value)) {
            maxSlider.value = value;
            state.prefs.filters.maxEmployees = value;
            document.getElementById('max-emp-display').textContent = value.toLocaleString();
        }
        triggerFilterUpdate();
    });

    maxSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        state.prefs.filters.maxEmployees = value;
        
        if (value === state.limits.maxEmployees) {
            document.getElementById('max-emp-display').textContent = value.toLocaleString() + "+";
        } else {
            document.getElementById('max-emp-display').textContent = value.toLocaleString();
        }

        if (value < parseInt(minSlider.value)) {
            minSlider.value = value;
            state.prefs.filters.minEmployees = value;
            document.getElementById('min-emp-display').textContent = value.toLocaleString();
        }
        triggerFilterUpdate();
    });

    resetBtn.addEventListener('click', () => {
        state.prefs.filters = {
            search: '',
            segment: '',
            siteType: '',
            minEmployees: 0,
            maxEmployees: state.limits.maxEmployees
        };
        restoreSavedFilterStates();
        triggerFilterUpdate();
    });
}

/**
 * Filters the active company dataset based on selection parameters
 */
function applyFilters() {
    const f = state.prefs.filters;
    const query = f.search.toLowerCase().trim();

    state.filteredCompanies = state.companies.filter(company => {
        const matchesSearch = !query || 
            (company.company && company.company.toLowerCase().includes(query)) ||
            (company.address && company.address.toLowerCase().includes(query)) ||
            (company.notes && company.notes.toLowerCase().includes(query));

        const matchesSegment = !f.segment || company.segment === f.segment;
        const matchesSiteType = !f.siteType || company.siteType === f.siteType;

        const empCount = parseInt(company.employees) || 0;
        const matchesEmployees = empCount >= f.minEmployees && empCount <= f.maxEmployees;

        return matchesSearch && matchesSegment && matchesSiteType && matchesEmployees;
    });

    // Clear background coordinate arrays
    state.layers.bubble.clearLayers();
    state.layers.cluster.clearLayers();
    
    const heatData = [];

    state.filteredCompanies.forEach(company => {
        if (!company.latitude || !company.longitude) return;

        const markerColor = getSegmentColor(company.segment);
        const markerRadius = getRadius(company.employees);

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
        const empWeight = Math.min(1.0, (parseInt(company.employees) || 1) / 1000);
        heatData.push([company.latitude, company.longitude, empWeight]);
    });

    state.layers.heatmap.setLatLngs(heatData);

    // Apply active visualization layers
    applyLayerMode();
}

/**
 * Toggles the map layers between bubble, cluster, and heatmap views
 */
function applyLayerMode() {
    const activeMode = state.prefs.mode;
    
    // Remove layers safely
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
    
    document.getElementById('total-count').textContent = visibleCompanies.length;
}

/**
 * Builds standard list markup structure inside the directory sidebar
 */
function renderDirectoryList(companies) {
    const listContainer = document.getElementById('companies-list');
    listContainer.innerHTML = '';

    if (companies.length === 0) {
        listContainer.innerHTML = '<div class="loading-spinner">No visible locations found inside map viewport.</div>';
        return;
    }

    companies.forEach(company => {
        const card = document.createElement('div');
        card.className = 'company-card';
        card.setAttribute('data-id', company.company);
        
        card.innerHTML = `
            <h4>${company.company}</h4>
            <div class="meta-line">
                <span>${company.segment || 'Other'}</span>
                <span>${company.employees ? parseInt(company.employees).toLocaleString() : '0'} Employees</span>
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
    
    let totalEmployees = 0;
    let largestEmployer = null;
    let maxEmployees = -1;

    visibleCompanies.forEach(c => {
        const count = parseInt(c.employees) || 0;
        totalEmployees += count;
        
        if (count > maxEmployees) {
            maxEmployees = count;
            largestEmployer = c;
        }
    });

    const avgEmployees = totalVisibleCount > 0 ? (totalEmployees / totalVisibleCount) : 0;

    // Display numbers inside DOM placeholders
    document.getElementById('stat-total-companies').textContent = totalFiltered.toLocaleString();
    document.getElementById('stat-visible-companies').textContent = totalVisibleCount.toLocaleString();
    document.getElementById('stat-total-employees').textContent = totalEmployees.toLocaleString();
    document.getElementById('stat-avg-employees').textContent = Math.round(avgEmployees).toLocaleString();

    // Configure largest employer spotlight
    const spotlightTitle = document.getElementById('stat-largest-employer');
    const spotlightCount = document.getElementById('stat-largest-count');

    if (largestEmployer) {
        spotlightTitle.textContent = largestEmployer.company;
        spotlightCount.textContent = `${maxEmployees.toLocaleString()} employees (${largestEmployer.segment || 'Other'})`;
    } else {
        spotlightTitle.textContent = "None Visible";
        spotlightCount.textContent = "0 employees";
    }

    // Pie visualization data compilation
    const segmentsMap = {};
    visibleCompanies.forEach(c => {
        const segmentName = (c.segment || 'Other').trim();
        segmentsMap[segmentName] = (segmentsMap[segmentName] || 0) + 1;
    });

    const pieLabels = Object.keys(segmentsMap);
    const pieData = Object.values(segmentsMap);
    const pieColors = pieLabels.map(seg => getSegmentColor(seg));

    renderSegmentPieChart(pieLabels, pieData, pieColors);

    // Dynamic horizontal bar data compilation (Top 10 Largest Employers)
    const topEmployers = [...visibleCompanies]
        .filter(c => parseInt(c.employees) > 0)
        .sort((a, b) => (parseInt(b.employees) || 0) - (parseInt(a.employees) || 0))
        .slice(0, 10);

    const barLabels = topEmployers.map(c => c.company);
    const barData = topEmployers.map(c => parseInt(c.employees) || 0);
    const barColors = topEmployers.map(c => getSegmentColor(c.segment));

    renderTopEmployersBarChart(barLabels, barData, barColors);
}

/**
 * Handles rendering / updating the Doughnut Segment Chart safely
 */
function renderSegmentPieChart(labels, data, colors) {
    const ctx = document.getElementById('segment-pie-chart').getContext('2d');

    if (labels.length === 0) {
        labels = ["No data in viewport"];
        data = [1];
        colors = ["#e2e8f0"];
    }

    if (state.charts.segmentPie) {
        state.charts.segmentPie.data.labels = labels;
        state.charts.segmentPie.data.datasets[0].data = data;
        state.charts.segmentPie.data.datasets[0].backgroundColor = colors;
        state.charts.segmentPie.update();
    } else {
        state.charts.segmentPie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors,
                    borderColor: 'rgba(0,0,0,0)',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom',
                        labels: {
                            boxWidth: 8,
                            padding: 8,
                            font: { size: 9, family: 'inherit' }
                        }
                    }
                }
            }
        });
    }
}

/**
 * Handles rendering / updating the Top 10 Horizontal Bar Chart safely
 */
function renderTopEmployersBarChart(labels, data, colors) {
    const ctx = document.getElementById('top-employers-bar-chart').getContext('2d');

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
    } else {
        state.charts.topEmployersBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Employees',
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
    const address = company.address || 'No register details';
    const segment = company.segment ? `<span class="tag-badge segment-tag">${company.segment}</span>` : '';
    const siteType = company.siteType ? `<span class="tag-badge sitetype-tag">${company.siteType}</span>` : '';
    
    const employees = company.employees ? parseInt(company.employees).toLocaleString() : '0';

    const phoneRow = company.phone ? `<div class="popup-row"><span class="popup-label">Phone:</span><span class="popup-value"><a href="tel:${company.phone}" class="popup-link">${company.phone}</a></span></div>` : '';
    const emailRow = company.email ? `<div class="popup-row"><span class="popup-label">Email:</span><span class="popup-value"><a href="mailto:${company.email}" class="popup-link">${company.email}</a></span></div>` : '';
    const notesBlock = company.notes ? `<div class="popup-notes"><strong>Internal Notes:</strong> "${company.notes}"</div>` : '';

    let websiteBtn = '';
    if (company.website) {
        const url = company.website.startsWith('http') ? company.website : `https://${company.website}`;
        websiteBtn = `
            <a href="${url}" target="_blank" class="popup-cta-btn">
                Visit Location Website
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="7" y1="17" x2="17" y2="7"></line>
                    <polyline points="7 7 17 7 17 17"></polyline>
                </svg>
            </a>`;
    }

    const popupContent = `
        <div class="modern-popup">
            <header class="popup-header">
                <h3 class="popup-title">${name}</h3>
                <div class="popup-tags">
                    ${segment}
                    ${siteType}
                </div>
            </header>
            <section class="popup-body">
                <div class="metrics-grid">
                    <div class="metric-box">
                        <span class="metric-val">${employees}</span>
                        <span class="metric-lbl">Employees</span>
                    </div>
                </div>
                <div class="popup-details-list">
                    <div class="popup-row"><span class="popup-label">Address:</span><span class="popup-value">${address}</span></div>
                    ${phoneRow}
                    ${emailRow}
                </div>
                ${notesBlock}
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
    state.map.setView([company.latitude, company.longitude], 13);
    
    // Auto-open dynamic popups for bubble/cluster modes
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
        document.getElementById('sidebar').classList.add('collapsed');
        document.getElementById('sidebar-backdrop').classList.remove('active');
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
 * Computes, structures, and triggers a dynamic visible dataset CSV download
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

    const headers = ['Company', 'Segment', 'Site Type', 'Employees', 'Address', 'Phone', 'Email', 'Website', 'Notes'];
    const rows = visibleCompanies.map(c => [
        `"${(c.company || '').replace(/"/g, '""')}"`,
        `"${(c.segment || '').replace(/"/g, '""')}"`,
        `"${(c.siteType || '').replace(/"/g, '""')}"`,
        `"${(c.employees || '0')}"`,
        `"${(c.address || '').replace(/"/g, '""')}"`,
        `"${(c.phone || '').replace(/"/g, '""')}"`,
        `"${(c.email || '').replace(/"/g, '""')}"`,
        `"${(c.website || '').replace(/"/g, '""')}"`,
        `"${(c.notes || '').replace(/"/g, '""')}"`
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
 * Updates color legends in floating overlays
 */
function updateLegendUI() {
    const segmentsContainer = document.getElementById('legend-segments');
    if (!segmentsContainer) return;
    
    segmentsContainer.innerHTML = '';
    
    Object.keys(state.segmentColors).sort().forEach(segment => {
        const item = document.createElement('div');
        item.className = 'legend-color-item';
        item.innerHTML = `
            <span class="legend-color-dot" style="background-color: ${state.segmentColors[segment]};"></span>
            <span class="legend-color-label">${segment}</span>
        `;
        segmentsContainer.appendChild(item);
    });
}