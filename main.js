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

// PRE_INDEX FIRES FOR INSTANT LOOKUP
const byDate = d3.group(
    fireData,
    d => d.acq_date.toISOString().split("T")[0]
);



// ---------- FILTERING ----------



// FILTE BY DATE
function filterDataByDate(date) {
    return byDate.get(date) || [];
}

// LITTLESMALL RANDOMIZATION SO DOTS CAN BE SEEN BETTER
function addJitter(d) {
    if (d.jitterX === undefined) {
        d.jitterX = (rng() - 0.5) * 10;
        d.jitterY = (rng() - 0.5) * 10;
    }
    return d;
}

// DRAW FUNCTION
function drawMap(filtered) {
    let filtered_jitter = filtered.map(addJitter);
    const circles = mapSvg.selectAll("circle")
        .data(filtered_jitter, d => d.id || `${d.acq_date}-${d.latitude}-${d.longitude}`)
            .join(
                enter => enter.append("circle")
                    .attr("r", 3)
                    .attr("opacity", 0.6)
                    .attr("fill", d => colorScale(d.brightness))
                    .attr("cx", d => d.x + d.jitterX)
                    .attr("cy", d => d.y + d.jitterY),
                update => update
                    .transition()
                    .duration(100)
                    .attr("cx", d => d.x + d.jitterX)
                    .attr("cy", d => d.y + d.jitterY),
                exit => exit.remove()
            );
}

// ZOOM FUNCTION
// const zoom = d3.zoom()
//     .scaleExtent([1, 8])  // min/max zoom
//     .on("zoom", (event) => {
//         mapSvg.selectAll("path")
//             .attr("transform", event.transform);

//         mapSvg.selectAll("circle")
//             .attr("transform", event.transform);
//     });

// mapSvg.call(zoom);



// ---------- SLIDER EVENT LISTENER ----------



// UPDATE SLIDE WHEN THERE IS A CHANGE
dateSlider.addEventListener('input', () => {
    const idx = +dateSlider.value;
    selectedDate = dates[idx];

    // localStorage.setItem('date', selectedDate);
    dateLabel.textContent = selectedDate;

    loadAndPlot()
});



// ---------- LOAD AND PLOT ----------



function loadAndPlot() {
    const filtered = filterDataByDate(selectedDate);

    d3.select("mapTitle")
        .text(`Wildfires on ${selectedDate}`);

    drawMap(filtered);
    updateBarChart(selectedDate)
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
    .text("Total Wildfires");

statsSvg.append("text")
    .attr("id", "yLabel")
    .attr("x", -statsHeight / 2)
    .attr("y", 12.5)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
    .attr("transform", "rotate(-90)")
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
    });

mapSvg.selectAll("path.state").lower();



// ---------- CREATE DROPDOWN AND TRACK PREDICTION ----------



const countySelect = document.getElementById("countySelect");

// DROPDOWN
countyNames.forEach(name => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    countySelect.appendChild(option);
});

// ONCE THE USER SELECTS A PREDICTION, TRACK IT
let predictedCounty = null;
countySelect.addEventListener("change", (e) => {

    // REMOVE WARNING TEXT
    document.getElementById("warning").innerHTML = "";
    predictedCounty = e.target.value;

    // RESET PREVIOUS PREDICTIONS IF ANY
    mapSvg.selectAll("path.county").attr("fill", "#e0e0e0");
    statsSvg.selectAll(".bar").attr("fill", "#74121D");

    // HIGHLIGHT THE SELECTED COUNTY ON MAP AND BAR CHART AS THE CORRECT COLOR
    if (predictedCounty) {
        mapSvg.selectAll("path.county")
        .filter(d => d.properties.name === predictedCounty)
        .attr("fill", "#74121D");

        statsSvg.selectAll(".bar")
        .filter(d => d.name === predictedCounty)
        .attr("fill", "#74121D");
    }
});



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



// ---------- INITIAL RENDER ----------



loadAndPlot();