# Germany Locations - Interactive Corporate Directory

A high-performance, single-page interactive directory mapping over 12,000 corporate locations across Germany. Built with modular, vanilla web standards, this dashboard visualizes geographic distribution and capacity metrics in real time.

---

## 🛠️ Installation Guide

Follow these steps to run the application locally in a development environment:

### Method A: Local Direct Launch (Zero-Setup)
1. Download or clone the project directory onto your machine.
2. Open the `index.html` file in any modern web browser (Chrome, Firefox, Safari, Edge).

### Method B: Local Server Launch (Recommended)
To enable full offline support and cross-origin resource requests, run the project with a lightweight static server:
* If you use **VS Code**, install the **Live Server** extension, then click **Go Live**.
* If you have **Python** installed on your system, run this terminal command in the project's root folder:
  ```bash
  python -m http.server 8080



🚀 Deployment Guide
This app is entirely client-side and self-contained, meaning it can be hosted for free on any static web hosting provider.

Deploying to GitHub Pages
1. Initialize a Git repository inside your root directory:

git init
git add .
git commit -m "Initialize production corporate map dashboard"

2. Create a new, blank repository on your GitHub Account. Do not check the boxes to add a README, .gitignore, or license.

3. Link your local project directory to your new remote GitHub repository:

git remote add origin [https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git](https://github.com/YOUR_USERNAME/YOUR_REPOSITORY_NAME.git)
git branch -M main
git push -u origin main

4. Navigate to your repository page on GitHub:

	1. Go to Settings > Pages (under the "Code and automation" menu).
	2. Set the deployment Source option to Deploy from a branch.
	3. Under Branch, select main and set the folder directory destination to / (root).
	4. Click Save.

5. Wait 1–2 minutes. GitHub will generate your live production URL (e.g., https://your-username.github.io/your-repository-name/).


📊 Technical Architecture & System Documentation
The map is built on a high-performance rendering architecture engineered to process large client-side datasets smoothly:

Performance & Optimization Architecture

	1. Leaflet Canvas Batch Renderer: Rather than loading thousands of individual SVG elements into the DOM (which causes lag on mobile devices), this application renders coordinates directly to a single, hardware-accelerated HTML <canvas> element.
	2. Canvas Boundary Auto-Recalibration: Runs auto-adjustments (invalidateSize()) on initial load and window resizing. This stretches the interactive canvas container to 100% width and height, completely preventing visual edge clipping.
	3. Exponential Scale Zooming: Node sizes scale dynamically based on the current map zoom level. Markers appear as sleek, delicate pinpoints when zoomed out to the national view, and scale up naturally as you zoom in closer to individual streets.
	4. Gaussian Spatial Data Distribution: Replaces uniform bounding box distribution with realistic Box-Muller normal equations centered around 15 key metropolitan nodes (Berlin, Munich, Hamburg, etc.). This mimics actual urban densities.
	5. Smart UI Thread Yielding: The Marker Clustering engine processes data in sequential 40ms bursts, yielding thread execution back to the browser for 10ms. This prevents the browser window from freezing during heavy processing.
	6. Asynchronous Dependencies Loading: Heavy external visual processing components (like Chart.js) are excluded from the initial page download. Instead, they are lazy-loaded on the fly only when the user switches to the Dashboard tab.

External Dependency Architecture
All core libraries are loaded securely from high-speed, globally distributed CDNs:

	1. Leaflet JS (v1.9.4): Open-source interactive map wrapper.
	2. Leaflet MarkerCluster (v1.4.1): High-performance grid marker clustering engine.
	3. Leaflet Heat (v0.2.0): Canvas-based density calculations.
	4. Chart.js (v4.x): HTML5 Canvas charting (lazy-loaded as needed).

🔄 Maintenance & Update Guide