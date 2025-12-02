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

// let selectedDate = localStorage.getItem('date') || dates[0];
let selectedDate = dates[0];
let currentIndex = dates.indexOf(selectedDate);
if (currentIndex === -1) currentIndex = 0;

dateSlider.value = currentIndex;
dateLabel.textContent = dates[currentIndex];

// DATE SLIDE CHANGE COLOR
function updateSliderFill(slider) {
    const value = (slider.value - slider.min) / (slider.max - slider.min) * 100;
    slider.style.background = `linear-gradient(to right, #A51C30 0%, #A51C30 ${value}%, #ddd ${value}%, #ddd 100%)`;
}

updateSliderFill(dateSlider);

dateSlider.addEventListener("input", () => {
    updateSliderFill(dateSlider);
});



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
// function resetZoom() {
//     mapSvg.transition().duration(500).call(zoom.transform, d3.zoomIdentity);
// }

// PLAY / PAUSE
playButton.addEventListener("click", () => {

    if (!isPlaying) {
        // START AUTOPLAY
        isPlaying = true;
        playButton.textContent = "⏸ Pause";

        // RESET ZOOM AND DISABLE INTERACTION WHEN PLAYING
        // resetZoom();
        // mapSvg.on(".zoom", null);

        playInterval = setInterval(tickForward, speed);
    } else {
        // PAUSE AUTOPLAY
        isPlaying = false;
        playButton.textContent = "▶ Play";
        clearInterval(playInterval);

        // RE-ENABLE ZOOM
        // mapSvg.call(zoom);
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

    // IF REACH THE END, DO NOT CONTINUE
    if (idx === dates.length - 1) {
        return
    }
    // OTHERWISE NEXT DATE
    idx++;
    
    // IF REACH THE END (FIRST TIME THIS SHOULD HAPPEN BEFORE THE PREMATURE STOP ABOVE)
    if (idx >= dates.length - 1) {

        // WRITE TEXT TO LET USE RKNOW IF PREDICTION CORRECT OR NOT
        if (predictedCounty) {
            const lastDate = dates[idx];
            const values = countyCounts[lastDate];
            const maxIndex = values.indexOf(Math.max(...values));
            const correctCounty = countyNames[maxIndex];

            const answerDiv = d3.select("#answer");
            if (predictedCounty === correctCounty) {
                answerDiv.text(`✅ Wow your prediction was CORRECT! ${predictedCounty} had the most fires.`);
            } else {
                answerDiv.text(`❌ Sorry your prediction was INCORRECT! ${correctCounty} had the most fires.`);
            }
        }
    }

    dateSlider.value = idx;
    selectedDate = dates[idx];
    dateLabel.textContent = selectedDate;

    loadAndPlot();
    updateSliderFill(dateSlider);
}



// ---------- MAP INITIALIZE ----------



// DEFINE MAP STRUCTURE
const mapWidth = 720;
const mapHeight = 480;

const mapSvg = d3.select("#mapSvg")
    .attr("width", mapWidth)
    .attr("height", mapHeight);

// SETUP CANVAS
const fireCanvas = document.getElementById("fireCanvas");
fireCanvas.width = mapWidth;
fireCanvas.height = mapHeight;

const ctx = fireCanvas.getContext("2d");

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

const allCounties = topojson.feature(countiesTopo, countiesTopo.objects.counties).features;

const caCounties = allCounties.filter(f => f.id.startsWith("06"));

// DRAW COUNTY BORDERS
mapSvg.selectAll("path.county")
    .data(caCounties)
    .join("path")
    .attr("class", "county")
    .attr("d", geoPath)
    .attr("fill", "#e0e0e0")
    .attr("stroke", "#333")
    .attr("stroke-width", 0.5);




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



// ---------- FILTERING ----------



// KEEP TRACK OF THE LAST INDEX DRAWN
// LATER, WHEN SLIDER MOVES FORWARD, IT ONLY NEEDS TO DRAW THE NEW FIRES AFTER THAT DATE
// THIS PREVENTS DRAWING 50K FIRES AT ONCE
let lastDrawnIndex = -1;

// PREPROCESS EACH FIRE (IT KNOWS WHICH DATE IT BELONGS TO)
const dateToIndex = new Map(dates.map((d, i) => [d, i]));

fireData.forEach(d => {
    const iso = d.acq_date.toISOString().split("T")[0];
    d.dateIndex = dateToIndex.get(iso) ?? -1;
});

function drawMap(date) {
    const cutoffIndex = dateToIndex.get(date);

    // IF THE SLIDER MOVED BACKWARDS, THEN, YOU CAN REDRAW EVERYTHING
    if (cutoffIndex < lastDrawnIndex) {
        ctx.clearRect(0, 0, mapWidth, mapHeight);
        lastDrawnIndex = -1;
    }

    // DRAW ONLY NEW FIRES
    for (const d of fireData) {
        if (d.dateIndex > lastDrawnIndex && d.dateIndex <= cutoffIndex) {
            ctx.beginPath();
            ctx.arc(d.x, d.y, 1, 0, Math.PI * 2);
            ctx.fillStyle = colorScale(d.brightness);
            ctx.globalAlpha = 0.6;
            ctx.fill();
        }
    }

    lastDrawnIndex = cutoffIndex;
}



// ---------- SLIDER EVENT LISTENER ----------



// UPDATE SLIDE WHEN THERE IS A CHANGE
dateSlider.addEventListener('input', () => {
    const idx = +dateSlider.value;
    selectedDate = dates[idx];

    dateLabel.textContent = selectedDate;

    loadAndPlot();
});



// ---------- LOAD AND PLOT ----------



// HELPER FUNCTION
function loadAndPlot() {
    drawMap(selectedDate);
    updateBarChart(selectedDate);
}



// ---------- BAR CHART ----------



// INITIAL SETUP
const statsWidth = 1000;
const statsHeight = 600;
const margin = { top: 40, right: 105, bottom: 50, left: 105 };

const statsSvg = d3.select("#stats")
    .append("svg")
    .attr("viewBox", `0 0 ${statsWidth} ${statsHeight}`) 
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("width", "100%")
    .style("height", "auto");

statsSvg.append("text")
    .attr("id", "chartTitle")
    .attr("x", statsWidth / 2)
    .attr("y", margin.top - 20)
    .attr("text-anchor", "middle")
    .attr("font-size", "22px")
    .attr("font-weight", "bold")
    .text("Which County Had the Most Total Wildfires from 2014-2024?");

statsSvg.append("text")
    .attr("id", "xLabel")
    .attr("x", statsWidth / 2)
    .attr("y", statsHeight - 5)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
    .attr("font-weight", "bold")
    .text("Total Wildfires");

statsSvg.append("text")
    .attr("id", "yLabel")
    .attr("x", -statsHeight / 2)
    .attr("y", 12.5)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
    .attr("transform", "rotate(-90)")
    .attr("font-weight", "bold")
    .text("County");

const xScale = d3.scaleLinear()
    .range([margin.left, statsWidth - margin.right]);

const yScale = d3.scaleBand()
    .range([margin.top, statsHeight - margin.bottom])
    .padding(0.15);

const xAxisGroup = statsSvg.append("g")
    .attr("transform", `translate(0, ${statsHeight - margin.bottom})`);

const yAxisGroup = statsSvg.append("g")
    .attr("transform", `translate(${margin.left}, 0)`);



// THE ACTUAL FUNCTION TO UPDATE THE BAR CHART WHEN PLAYING
function updateBarChart(date) {

    const values = countyCounts[date];
    if (!values) return;

    // SORT DATA
    const sortedData = countyNames
        .map((name, i) => ({ name, value: values[i] }))
        .sort((a, b) => d3.descending(a.value, b.value));

    // UPDATE SCALES USING SORTED COUNTY NAMES
    yScale.domain(sortedData.map(d => d.name));
    xScale.domain([0, d3.max(values)]);


    // DRAW
    statsSvg.selectAll(".bar")
        .data(sortedData, d => d.name)
        .join(
            enter => enter.append("rect")
                .attr("class", "bar")
                .attr("x", margin.left)
                .attr("y", d => yScale(d.name))
                .attr("height", yScale.bandwidth())
                .attr("width", 0)
                .attr("fill", d => d.name === predictedCounty ? "#74121D" : "#d8a6a6")
                .transition()
                .duration(100)
                .attr("width", d => xScale(d.value) - margin.left),

            update => update.transition()
                .duration(100)
                .attr("y", d => yScale(d.name))
                .attr("width", d => xScale(d.value) - margin.left)
                .attr("fill", d => d.name === predictedCounty ? "#74121D" : "#d8a6a6"),

            exit => exit.remove()
        );


    // ADD CUMULATIVE TOTAL
    statsSvg.selectAll(".bar-label")
        .data(sortedData, d => d.name)
        .join(
            enter => enter.append("text")
                .attr("class", "bar-label")
                .attr("y", d => yScale(d.name) + yScale.bandwidth()/2 + 4)
                .attr("x", margin.left)
                .attr("fill", "#222")
                .attr("font-size", "11px")
                .attr("text-anchor", "start")
                .text(d => d.value)
                .transition()
                .duration(100)
                .attr("x", d => xScale(d.value) + 6),

            update => update.transition()
                .duration(100)
                .attr("y", d => yScale(d.name) + yScale.bandwidth()/2 + 4)
                .attr("x", d => xScale(d.value) + 6)
                .tween("text", function(d) {
                    const node = d3.select(this);
                    const current = +node.text();
                    const interp = d3.interpolateNumber(current, d.value);
                    return t => node.text(Math.round(interp(t)));
                }),

            exit => exit.remove()
        );


    // UPDATE AXES
    xAxisGroup
        .transition()
        .duration(100)
        .call(d3.axisBottom(xScale));

    yAxisGroup
        .transition()
        .duration(100)
        .call(d3.axisLeft(yScale));

}



// ---------- TOOLTIP ----------



const tooltip = d3.select("body")
    .append("div")
    .style("position", "absolute")
    .style("background", "white")
    .style("padding", "4px 8px")
    .style("border", "1px solid #ccc")
    .style("border-radius", "4px")
    .style("pointer-events", "none")
    .style("display", "none");

mapSvg.selectAll("path.county")
    .on("mouseover", function(event, d) {
        tooltip.style("display", "block")
                .text(d.properties.name);
        d3.select(this).attr("fill", "#A7333F");
    })
    .on("mousemove", function(event) {
        tooltip.style("left", (event.pageX + 10) + "px")
                .style("top", (event.pageY + 10) + "px");
    })
    .on("mouseout", function(event, d) {
    tooltip.style("display", "none");

    // IF THIS IS THE PREDICTED COUNTY, KEEP IT AS THE CORRECT COLOR EVEN WHEN HOVERED OVER
    const isPredicted = predictedCounty && d.properties.name === predictedCounty;
        d3.select(this).attr("fill", isPredicted ? "#74121D" : "#e0e0e0");
    })
    .on("click", function(event, d) {
        // REMOVE WARNING (same behavior as dropdown)
        document.getElementById("warning").innerHTML = "";

        // SET PREDICTION TO THE CLICKED COUNTY
        setPrediction(d.properties.name);

        // ALSO UPDATE THE DROPDOWN SO THEY MATCH
        countySelect.value = d.properties.name;
    });

mapSvg.selectAll("path.state").lower();



// ---------- TRACK PREDICTION ----------



let predictedCounty = null;
function setPrediction(countyName) {
    predictedCounty = countyName;

    // RESET
    mapSvg.selectAll("path.county").attr("fill", "#e0e0e0");
    statsSvg.selectAll(".bar").attr("fill", "#d8a6a6");

    // HIGHLIGHT SELECTED COUNTY
    mapSvg.selectAll("path.county")
        .filter(d => d.properties.name === countyName)
        .attr("fill", "#74121D");

    statsSvg.selectAll(".bar")
        .filter(d => d.name === countyName)
        .attr("fill", "#74121D");
}



// ---------- Q1 MCQ ----------



const buttons = document.querySelectorAll('.option-btn');
    const answerDiv = document.getElementById('humanAnswer');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            const userAnswer = btn.dataset.answer;

            buttons.forEach(b => b.classList.remove('correct', 'wrong'));

            if(userAnswer === "90"){
                btn.classList.add('correct');
                answerDiv.textContent = "Correct! Around 90% of wildfires are caused by humans.";
                answerDiv.style.color = "green";
            } else {
                btn.classList.add('wrong');
                answerDiv.textContent = "Incorrect. Try again!";
                answerDiv.style.color = "red";
            }
        });
    });



// ---------- EVERYTHING FADE IN ----------



const observerOptions = {
    threshold: 0.1 
};

const fadeObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add("visible");
        }
    });
}, observerOptions);

document.querySelectorAll(".fade-in").forEach(el => fadeObserver.observe(el));




// ---------- INITIAL RENDER ----------



loadAndPlot();