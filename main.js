console.log('hello');
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as topojson from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';
const rng = d3.randomLcg(42);





// ---------- LOAD FUNC ----------



async function loadFireData() {
    try {
        const response = await fetch('./datasets/fires.json');
        const firedata = await response.json();
        return firedata;
    } catch (error) {
        console.error('Error loading fire data:', error);
    }
}

const dates = await fetch("./datasets/dates.json").then(r => r.json());
const countyCounts = await fetch("./datasets/cumulative.json").then(r => r.json());
const countyNames = await fetch("./datasets/county_names.json").then(r => r.json());



// ---------- SLIDER ----------



const dateSlider = document.getElementById('dateSlider');
const dateLabel = document.getElementById('dateLabel');

dateSlider.min = 0;
dateSlider.max = dates.length - 1;
dateSlider.step = 1;

let selectedDate = localStorage.getItem('date') || dates[0];
let currentIndex = dates.indexOf(selectedDate);
if (currentIndex === -1) currentIndex = 0;

dateSlider.value = currentIndex;
dateLabel.textContent = dates[currentIndex];



// ---------- AUTOPLAY BUTTONS ----------



let isPlaying = false;
let playInterval = null;

// SPEED SETTINGS
const speedSettings = {
    fast: 10,
    normal: 250,
    slow: 750
};

// CURRENT SPEED
let speedMode = "fast"; 
let speed = speedSettings[speedMode];

const playButton = document.getElementById("playButton");
const speedButton = document.getElementById("speedButton");

// RESET ZOOM
function resetZoom() {
    mapSvg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
}

// PLAY / PAUSE
playButton.addEventListener("click", () => {

    if (!isPlaying) {
        // START AUTOPLAY
        isPlaying = true;
        playButton.textContent = "⏸ Pause";

        // RESET ZOOM AND DISABLE INTERACTION WHEN PLAYING
        resetZoom();
        mapSvg.on(".zoom", null);

        playInterval = setInterval(tickForward, speed);
    } else {
        // PAUSE AUTOPLAY
        isPlaying = false;
        playButton.textContent = "▶ Play";
        clearInterval(playInterval);

        // RE-ENABLE ZOOM
        mapSvg.call(zoom);
    }
});

// SPEED MODE CYCLER
speedButton.addEventListener("click", () => {

    if (speedMode === "fast") {
        speedMode = "normal";
    } else if (speedMode === "normal") {
        speedMode = "slow";
    } else {
        speedMode = "fast";
    }

    // UPDATE SPEED
    speed = speedSettings[speedMode];

    // UPDATE BUTTON TEXT
    const labels = {
        fast: "▶▶▶ Fast",
        normal: "▶▶ Normal",
        slow: "▶ Slow"
    };
    speedButton.textContent = labels[speedMode];

    // IF ANNIMATION IS ALREADY RUNNING, UPDATE SPEED MIDWAY
    if (isPlaying) {
        clearInterval(playInterval);
        playInterval = setInterval(tickForward, speed);
    }
});

// SLIDER STEP FUNCTION
function tickForward() {
    let idx = +dateSlider.value;
    idx++;
    if (idx > dates.length - 1) {
        idx = 0;
    }
    dateSlider.value = idx;
    selectedDate = dates[idx];
    dateLabel.textContent = selectedDate;
    localStorage.setItem("date", selectedDate);

    loadAndPlot();
}



// ---------- MAP INITIALIZE ----------



// DEFINE MAP STRUCTURE
const mapWidth = 540;
const mapHeight = 288;

const mapSvg = d3.select("#mapContainer")
    .append("svg")
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

// LOAD US STATES (TopoJSON → GeoJSON)
const us = await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json");
const states = topojson.feature(us, us.objects.states);

// FILTER CALIFORNIA ONLY (FIPS CODE 06)
const california = {
    type: "FeatureCollection",
    features: states.features.filter(f => f.id === "06")
};

// DEFINE PROJECTION FIT TO CALIFORNIA
const projection = d3.geoMercator()
    .fitSize([mapWidth, mapHeight], california);

const geoPath = d3.geoPath().projection(projection);

// DRAW CALIFORNIA ONLY
mapSvg.selectAll("path")
    .data(california.features)
    .join("path")
    .attr("d", geoPath)
    .attr("fill", "#e0e0e0")
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5);

// LOAD US COUNTIES
const countiesTopo = await d3.json("https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json");
const counties = topojson.feature(countiesTopo, countiesTopo.objects.counties);

// FILTER COUNTIES IN CALIFORNIA (FIPS prefix "06")
const caCounties = {
    type: "FeatureCollection",
    features: counties.features.filter(c => c.id.startsWith("06"))
};

// DRAW COUNTY BORDERS
mapSvg.selectAll(".county")
    .data(caCounties.features)
    .join("path")
    .attr("class", "county")
    .attr("d", geoPath)
    .attr("fill", "none")
    .attr("stroke", "#999")
    .attr("stroke-width", 0.3)
    .attr("opacity", 0.8);



// ---------- LOAD FIRE DATA + PREPROCESS (ONE TIME) ----------



// PROJECT COORDS ONCE
const fireData = await loadFireData();

fireData.forEach(d => {
    d.acq_date = new Date(d.acq_date);

    const [x, y] = projection([d.longitude, d.latitude] || [0, 0])
    d.x = x;
    d.y = y;
});

// BRIGHTNESS SCALE
const brightnessExtent = d3.extent(fireData, d => +d.brightness);
const colorScale = d3.scaleLinear()
    .domain([brightnessExtent[0], (brightnessExtent[0]+brightnessExtent[1])/2, brightnessExtent[1]])
    .range(['yellow', 'orange', 'red']);

// PRE_INDEX FIRES FOR INSTANT LOOKUP
const byDate = d3.group(
    fireData,
    d => d.acq_date.toISOString().split("T")[0]
);



// ---------- FILTERING ----------



function filterDataByDate(date) {
    return byDate.get(date) || [];
}

// DRAW FUNCTION
function drawMap(filtered) {
    const jitter = 10
    const circles = mapSvg.selectAll("circle")
        .data(filtered, d => d.id || `${d.acq_date}-${d.latitude}-${d.longitude}`)
            .join(
                enter => enter.append("circle")
                    .attr("r", 3)
                    .attr("opacity", 0.6)
                    .attr("fill", d => colorScale(d.brightness))
                    .attr("cx", d => d.x + (rng() - 0.5) * jitter)
                    .attr("cy", d => d.y + (rng() - 0.5) * jitter),
                update => update
                    .transition()
                    .duration(100)
                    .attr("cx", d => d.x + (rng() - 0.5) * jitter)
                    .attr("cy", d => d.y + (rng() - 0.5) * jitter),
                exit => exit.remove()
            );
}

// ZOOM FUNCTION
const zoom = d3.zoom()
    .scaleExtent([1, 8])  // min/max zoom
    .on("zoom", (event) => {
        mapSvg.selectAll("path")
            .attr("transform", event.transform);

        mapSvg.selectAll("circle")
            .attr("transform", event.transform);
    });

mapSvg.call(zoom);



// ---------- SLIDER EVENT LISTENER ----------



dateSlider.addEventListener('input', () => {
    const idx = +dateSlider.value;
    selectedDate = dates[idx];

    localStorage.setItem('date', selectedDate);
    dateLabel.textContent = selectedDate;

    loadAndPlot()
});



// ---------- LOAD AND PLOT ----------



function loadAndPlot() {
    const filtered = filterDataByDate(selectedDate);

    d3.select("mapTitle")
        .text(`Wildfires on ${selectedDate}`);

    drawMap(filtered);
    updateStatsPanel(selectedDate)
}

// INITIAL RENDER
loadAndPlot();



// ---------- UPDATE STATS PANEL ----------



function updateStatsPanel(date) {
    const container = document.getElementById("stats");

    const counts = countyCounts[date];

    if (!counts) {
        container.innerHTML = "<p>No data available.</p>";
        return;
    }

    let html = `<h3>County Fire Totals as of ${date}</h3>`;
    html += `<div class="county-stats">`;

    for (let i = 0; i < countyNames.length; i++) {
        html += `
            <div class="county-row">
                <span class="county-name">${countyNames[i]}</span>
                <span class="county-count">${counts[i]}</span>
            </div>
        `;
    }

    html += `</div>`;
    container.innerHTML = html;
}
