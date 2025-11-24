console.log('hello');
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as topojson from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';




// ---------- INITIAL FUNCTIONS ----------



// GET DATA
async function loadFireData() {
    try {
        const response = await fetch('./datasets/fires.json');
        const firedata = await response.json();
        return firedata;
    } catch (error) {
        console.error('Error loading fire data:', error);
    }
}

// ---------- SLIDER ----------

// GET DATE RANGE
function generateDateRange(start, end) {
    const dates = [];
    let current = new Date(start);

    while (current <= new Date(end)) {
        dates.push(current.toISOString().split("T")[0]); // YYYY-MM-DD
        current.setDate(current.getDate() + 1);
    }
    return dates;
}

// DATE SLIDER
// const dates = generateDateRange("2014-01-01", "2024-12-30");
const dates = await fetch("./datasets/dates.json").then(r => r.json());

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

dateSlider.addEventListener('input', () => {
    const idx = +dateSlider.value;
    selectedDate = dates[idx];
    localStorage.setItem('date', selectedDate);
    dateLabel.textContent = selectedDate;
    console.log('date set:', selectedDate);

    loadAndPlot()
});

// const fireData = await loadFireData()
// const dates = [...new Set(fireData.map(d => d.date))].sort();




// ---------- PLOTTING FUNCTIONS ----------

// FILTER DATA (SELECT SUBSET THAT IS BASED ON DAY/NIGHT AND DATE)
function filterData(fireData, selectedDate) {
    return fireData.filter(d => {
        const fireDate = d.acq_date.toISOString().split('T')[0];
        return fireDate === selectedDate;
    });
}



// LOAD AND PLOT
async function loadAndPlot() {
    const fireData = await loadFireData();  // Wait until the data is loaded

    // CONVERT DATE FIELD TO DATE OBJ
    fireData.forEach(d => {
        d.acq_date = new Date(d.acq_date);
    });

    // FILTER BASED ON DAY/NIGHT AND DATE
    const filteredData = filterData(fireData, selectedDate);

    // DYNAMIC MAP TITLE
    const selectedDateString = selectedDate;
    d3.select('#mapTitle')
        .text(`US Map on ${selectedDateString}`);

    drawMap(filteredData);
}



// PLOT COORDS ON MAP
function drawMap(filteredData) {

    // PLOT ALL THE DATA POINTS AS CIRCLES BASED ON COORDINATES
    const circles = mapSvg.selectAll('circle')
        .data(filteredData)
        .join('circle')
        .attr('r', 4)
        .attr('fill', d => colorScale(d.brightness)) // SET THEIR COLOR BASED ON BRIGHTNESS
        .attr('opacity', 0.7)

    // SET INITIAL X,Y POSITIONS (NOT APPLIED ON THE DOT YET) BASED ON PROJECTIONS OF ACTUAL LAT/LONG
    filteredData.forEach(d => {
        const [x, y] = projection([d.longitude, d.latitude]) || [0, 0];
        d.x = x;
        d.y = y;
    });

    // FORCE SIMULATION TO PREVENT OVERLAPPING DOTS
    const simulation = d3.forceSimulation(filteredData)
        .force('x', d3.forceX(d => d.x).strength(1))
        .force('y', d3.forceY(d => d.y).strength(1))
        .force('collide', d3.forceCollide(4.5)) // ADJUST RADIUS DISTANCE BETWEEN DOTS
        .stop();

    // RUN SIMULATION FOR A FINITE NUMBER OF TIMES (NOT RISKING INF LOOP)
    for (let i = 0; i < 120; i++) simulation.tick();

    // ACTUALLY SET THE X,Y POS FOR THE DOTS
    circles
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
}


// ---------- GLOBAL CODE ----------


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

// SET GLOBAL COLOR GRADIENT FOR BRIGHTNESS
const fireDataForColor = await loadFireData();
const brightnessExtent = d3.extent(fireDataForColor, d => +d.brightness);
const colorScale = d3.scaleLinear()
    .domain([brightnessExtent[0], (brightnessExtent[0]+brightnessExtent[1])/2, brightnessExtent[1]])
    .range(['yellow', 'orange', 'red']);



// INITIAL LOAD
loadAndPlot();
