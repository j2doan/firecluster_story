console.log('hello');
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';
import * as topojson from 'https://cdn.jsdelivr.net/npm/topojson-client@3/+esm';
const rng = d3.randomLcg(42);

/*
    JS DISCLAIMER:
    The functions below are organized in the order they were created,
    unless something is required in a specific order.
*/



// ---------- LOAD FUNC AND OTHER JSON FILES----------



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
const modelPredictions = await fetch("./datasets/fire_predictions.json").then(r => r.json());



// ---------- SLIDER ----------



const dateSlider = document.getElementById('dateSlider');
const dateLabel = document.getElementById('dateLabel');

dateSlider.min = 0;
dateSlider.max = dates.length - 1;
dateSlider.step = 1;

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

// PLAY / PAUSE
playButton.addEventListener("click", () => {

    if (!isPlaying) {
        // START AUTOPLAY
        isPlaying = true;
        playButton.textContent = "⏸ Pause";
        playInterval = setInterval(tickForward, speed);
    } else {
        // PAUSE AUTOPLAY
        isPlaying = false;
        playButton.textContent = "▶ Play";
        clearInterval(playInterval);
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
                answerDiv.html(`✅ WOW your prediction was CORRECT! ✅<br> Either your prediction was a impressive insight, ridiculously lucky, or... 🤨`);
            } else {
                answerDiv.html(`❌ Sorry your prediction was INCORRECT! ❌<br> It just goes to show the unfortunate flaws and limits of human intuition... 😔`);
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
const mapWidth = 500;
const mapHeight = 500;

const mapSvg = d3.select("#mapSvg")
    .attr("viewBox", `0 0 ${mapWidth} ${mapHeight}`)
    .attr("preserveAspectRatio", "xMidYMid meet");

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
    .attr("fill", "lightgrey")
    .text("Which County Had the Most Total Wildfires from 2014-2024?");

statsSvg.append("text")
    .attr("id", "xLabel")
    .attr("x", statsWidth / 2)
    .attr("y", statsHeight - 5)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
    .attr("font-weight", "bold")
    .attr("fill", "lightgrey")
    .text("Total Wildfires");

statsSvg.append("text")
    .attr("id", "yLabel")
    .attr("x", -statsHeight / 2)
    .attr("y", 12.5)
    .attr("text-anchor", "middle")
    .attr("font-size", "16px")
    .attr("transform", "rotate(-90)")
    .attr("font-weight", "bold")
    .attr("fill", "lightgrey")
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



// UPDATE CURRENT RANK ON THE PREDICTED COUNTY 
function updateCurrentRank() {
    if (!predictedCounty) {
        document.getElementById("curr").textContent = "N/A";
        return;
    }

    const values = countyCounts[selectedDate];
    if (!values) return;

    const sortedData = countyNames
        .map((name, i) => ({ name, value: values[i] }))
        .sort((a, b) => d3.descending(a.value, b.value));

    const index = sortedData.findIndex(d => d.name === predictedCounty);
    const currRank = index >= 0 ? index + 1 : "N/A";

    document.getElementById("curr").textContent = currRank + " / 58";
}



// THE ACTUAL FUNCTION TO UPDATE THE BAR CHART WHEN PLAYING
function updateBarChart(date) {

    const values = countyCounts[date];
    if (!values) return;

    // SORT DATA
    const sortedData = countyNames
        .map((name, i) => ({ name, value: values[i] }))
        .sort((a, b) => d3.descending(a.value, b.value));

    // GRAB TOP 3 COUNTIES
    const top3Names = sortedData.slice(0, 3);
    const top1 = top3Names[0]?.name || "";
    const top2 = top3Names[1]?.name || "";
    const top3 = top3Names[2]?.name || "";
    updateCurrentRank();

    // UPDATE DASHBOARD
    document.getElementById("first").textContent = top1;
    document.getElementById("second").textContent = top2;
    document.getElementById("third").textContent = top3;


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
                .attr("fill", d => d.name === predictedCounty ? "#74121D" : "#e17e7eff")
                .transition()
                .duration(100)
                .attr("width", d => xScale(d.value) - margin.left),

            update => update.transition()
                .duration(100)
                .attr("y", d => yScale(d.name))
                .attr("width", d => xScale(d.value) - margin.left)
                .attr("fill", d => d.name === predictedCounty ? "#74121D" : "#e17e7eff"),

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
                .attr("fill", "lightgray")
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
        // REMOVE WARNING
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

    // UPDATE RANK
    updateCurrentRank();

}



// ---------- MCQ ----------



const buttons = document.querySelectorAll('.option-btn');
const answerDiv = document.getElementById('humanAnswer');
const optionD = document.getElementById('optionD');
const mcqReveal = document.getElementById('mcqReveal');

// TRACK CLICKED OPTIONS (EXCLUDING D)
let clickedOptions = new Set();

buttons.forEach(btn => {
    btn.addEventListener('click', () => {
        const userAnswer = btn.dataset.answer;

        // TRACK A B C
        if (userAnswer !== "D") clickedOptions.add(userAnswer);

        // SHOW OPTION D IF A B AND C ARE CLICKED
        if (clickedOptions.has("A") && clickedOptions.has("B") && clickedOptions.has("C")) {
            optionD.style.display = "inline-block";
        }

        // RESET BUTTON STYLES
        buttons.forEach(b => b.classList.remove('correct', 'wrong'));

        // CHECK IF USER SELECTED D
        if (userAnswer === "D") {
            btn.classList.add('correct');
            answerDiv.innerHTML = 
                "Correct! Did that suprise you?";
            answerDiv.style.color = "limegreen";
            
            // RENDER THE REMAINING TEXT WITH A DELAY
            mcqReveal.style.display = "block";
            setTimeout(() => {
                mcqReveal.classList.add('visible');
            }, 50);
        } else if (userAnswer === "A") {
            btn.classList.add('wrong');
            answerDiv.innerHTML = "Sorry. Try again!";
            answerDiv.style.color = "red";
        }
        else if (userAnswer === "B") {
            btn.classList.add('wrong');
            answerDiv.innerHTML = "Nope. Try again!";
            answerDiv.style.color = "red";
        }
        else if (userAnswer === "C") {
            btn.classList.add('wrong');
            answerDiv.innerHTML = "Not quite. Try again!";
            answerDiv.style.color = "red";
        }
    });
});




// ---------- EVERYTHING FADE-IN ----------



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



// ---------- ASH CANVAS ----------



const canvas = document.getElementById('ashCanvas');
const ctxash = canvas.getContext('2d');

function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

console.log(canvas.height, canvas.getBoundingClientRect().height);

// GENERATE RANDOM COLOR FOR EACH PARTICLE
function randomColor() {
    const colors = [
        { r: 255, g: 200, b: 120 }, // LIGHT YELLOW-ORANGE
        { r: 255, g: 150, b: 80 },  // BRIGHT ORANGE
        { r: 255, g: 100, b: 40 },  // DEEP ORANGE-RED
        { r: 200, g: 50, b: 30 }    // DARK EMBER RED
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// CREATE A PARTICLE
function createParticle() {
    // VIOLENT PARTICLE = MOVE FASTER + MORE CHAOTIC
    const isViolent = Math.random() < 0.12;

    let spawnY;
    if (Math.random() < 0.8) {
        spawnY = (canvas.height * 0.8) + Math.random() * (canvas.height * 0.2);
    } else {
        spawnY = Math.random() * canvas.height;
    }

    // ASSIGN RANDOM COLOR
    const color = randomColor();

    return {
        x: Math.random() * canvas.width,
        y: spawnY,

        length: isViolent ? Math.random() * 18 + 6 : Math.random() * 8 + 4,
        width: isViolent ? Math.random() * 3 + 1.5 : Math.random() * 2 + 0.5,
        speedX: (Math.random() - 0.5) * (isViolent ? 6 : 4),
        speedY: (Math.random() - 0.5) * (isViolent ? 6 : 4),
        violent: isViolent,
        angle: (Math.random() * 0.5) - 0.25,
        baseOpacity: Math.random() * 0.4 + (isViolent ? 0.7 : 0.3),
        opacity: 0,
        flickerSpeed: Math.random() * 0.004 + 0.001,
        burstTimer: Math.floor(Math.random() * 100) + 50,
        burstActive: false,
        trail: Math.random() < (isViolent ? 0.6 : 0.2),
        history: [],
        color: color,
        delay: Math.random() * 300
        
    };
}

const ashes = Array.from({ length: 150 }).map(() => createParticle());

// DRAW THE PARTICLE MOVING
function draw() {
    ctxash.clearRect(0, 0, canvas.width, canvas.height);


    ashes.forEach(p => {
        // SET DELAY, OTHERWISE SKIP
        if (p.delay > 0) {
            p.delay--;
            return;
        }
        
        // UPWARD DRAFT
        const updraft = p.violent ? -0.25 : -0.12;
        p.speedY += updraft;

        // FLICKER AND FADE
        p.opacity += (p.baseOpacity - p.opacity) * p.flickerSpeed;
        p.baseOpacity *= 0.9985;

        // BURSTS OF MOVEMENT
        p.burstTimer--;
        if (p.burstTimer <= 0) {
        p.burstActive = true;
        p.burstTimer = Math.floor(Math.random() * 120) + 80;

        const burstPower = p.violent ? 9 : 4;
        p.burstTargetX = (Math.random() - 0.5) * burstPower;
        p.burstTargetY = (Math.random() - 0.5) * burstPower;
        p.burstOpacity = Math.random() * 0.4 + (p.violent ? 0.5 : 0.2);
        }

        if (p.burstActive) {
        p.speedX += (p.burstTargetX - p.speedX) * 0.15;
        p.speedY += (p.burstTargetY - p.speedY) * 0.15;
        p.opacity += (p.baseOpacity + p.burstOpacity - p.opacity) * 0.1;
        if (Math.random() < 0.03) p.burstActive = false;
        } else {
        const chaos = p.violent ? 0.35 : 0.12;
        p.speedX += (Math.random() - 0.5) * chaos;
        p.speedY += (Math.random() - 0.5) * chaos;
        }

        // CLAMP SPEED
        const maxSpeed = p.violent ? 8 : 2.5;
        p.speedX = Math.max(Math.min(p.speedX, maxSpeed), -maxSpeed);
        p.speedY = Math.max(Math.min(p.speedY, maxSpeed), -maxSpeed);

        // MOVE
        p.x += p.speedX;
        p.y += p.speedY;

        // DRAW SAME COLORED TRAILS
        if (p.trail && p.history.length > 2) {
        for (let i = 0; i < p.history.length - 1; i++) {
            const pt = p.history[i];
            const next = p.history[i + 1];

            // USE SAME COLOR FOR TRAIL
            ctxash.strokeStyle = `rgba(${p.color.r},${p.color.g},${p.color.b},${pt.opacity * 0.08})`;
            ctxash.lineWidth = p.width * 0.5;
            ctxash.beginPath();
            ctxash.moveTo(pt.x, pt.y);
            ctxash.lineTo(next.x, next.y);
            ctxash.stroke();
        }
        }

        // EMBER STREAK (VELOCITY COLORED TRAIL)
        const angle = Math.atan2(p.speedY, p.speedX);
        const tailLength = p.length;
        const tailX = p.x - Math.cos(angle) * tailLength;
        const tailY = p.y - Math.sin(angle) * tailLength;

        // USE PARTICLE COLOR FOR TRAIL
        const grad = ctxash.createLinearGradient(tailX, tailY, p.x, p.y);
        // STARTING COLOR
        grad.addColorStop(0, `rgba(${p.color.r},${p.color.g},${p.color.b},0)`);
        // ENDING COLOR
        grad.addColorStop(1, `rgba(${p.color.r},${p.color.g},${p.color.b},${p.opacity})`); 

        ctxash.strokeStyle = grad;
        ctxash.lineWidth = p.width;
        ctxash.beginPath();
        ctxash.moveTo(tailX, tailY);
        ctxash.lineTo(p.x, p.y);
        ctxash.stroke();

        // RESET PARTICLE IF GO OFF-SCREEN OR FADED AWAY
        if (
        p.x < -60 || p.x > canvas.width + 60 ||
        p.y < -60 || p.y > canvas.height + 60 ||
        p.baseOpacity < 0.03
        ) {
        Object.assign(p, createParticle());
        }
    });

    requestAnimationFrame(draw);
}
draw();



// ---------- GAME CONCLUSION REVEAL ----------



const points = [
        "🤯 Most guesses were wrong.",
        "😔 Our intuition simply cannot keep up with the true scale and speed of wildfire activity in California.",
        "🤔 But why should we care?",
        "🔥 <b>Every bar represents burned land, destroyed homes, displaced families, and ecosystems wiped off the map.</b>",
        "🙏 <b>Each of these dots you see is a wildfire that can ruin hundreds of thousnds of innocent human lives.</b>",
        "📈 The number of Wildfires will inevitably increase from here on out.",
        "🌋 And California will soon turn into a blazing hell.",
        "🎯 As data scientists, it is our job to be as accurate as possible to minimize the impact of these wildfires.",
        "🤖 And that is where the power of machine learning comes in!"
];

let reveal = 0;

const clickRevealText = document.getElementById("click-to-continue-text");
const summaryText = document.getElementById("summary-text");
const btn = document.getElementById("reveal-btn");

btn.addEventListener("click", () => {
    
    clickRevealText.innerHTML = "";

    if (reveal < points.length) {
        
        // CREATE NEW SPAN FOR NEXT POINT
        const line = document.createElement("span");
        line.className = "fade-in-line";
        line.innerHTML = points[reveal];
        summaryText.appendChild(line);

        // FORCE REFLOW, ENSURE TRANSITION TRIGGERS
        void line.offsetWidth;

        // ADD THE CLASS TO FADE-IN (NOT THE fade-in CLASS)
        line.classList.add("visible");

        reveal++;
    }

    // HIDE BUTTON ONCE ALL IS SHOWN
    if (reveal >= points.length) {
        btn.style.display = "none";
    }
});



// ---------- CLICK ANYWHERE TO START ----------



document.getElementById("home").addEventListener("click", function() {
    window.location.href = "#abstract";
});



// ---------- SLIDE ANIMATION ----------



const slides = document.querySelectorAll('.slide');
const progressFill = document.querySelector('.slide-progress-fill');
let currentSlide = 0;

function showSlide(index) {

    // SHOW THE ACTIVE/CURRENT SLIDE
    slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === index);
    });

    // UPDATE PROGRESS BAR
    const percent = ((index + 1) / slides.length) * 100;
    progressFill.style.width = percent + '%';
}

// NEXT/PREV BUTTONS
document.querySelector('.next-slide').addEventListener('click', () => {
    if (currentSlide < slides.length - 1) currentSlide++;
    showSlide(currentSlide);
});

document.querySelector('.prev-slide').addEventListener('click', () => {
    if (currentSlide > 0) currentSlide--;
    showSlide(currentSlide);
});

// INITIALIZE
showSlide(currentSlide);



// ---------- SLIDE MAP TOOLTIP (REVEAL DESCRIPTION) ----------



const tooltipContainers = document.querySelectorAll('.slides-tooltip-container');

tooltipContainers.forEach(container => {
    container.addEventListener('click', () => {
        const slideTooltip = container.querySelector('.slides-tooltip-text');

        if (slideTooltip.style.visibility === 'visible') {
            slideTooltip.style.visibility = 'hidden';
            slideTooltip.style.opacity = 0;
        } else {
            slideTooltip.style.visibility = 'visible';
            slideTooltip.style.opacity = 1;
        }
    });
});



// ---------- MODEL IMAGE GALLERY ----------



// STARTING IMAGE = FIRST IMAGE
let modelSlideIndex = 0;
const modelslides = document.getElementsByClassName("modelSlide");

function showModelSlide(n) {
    if (n >= modelslides.length) modelSlideIndex = 0;
    if (n < 0) modelSlideIndex = modelslides.length - 1;

    for (let i = 0; i < modelslides.length; i++) {
        modelslides[i].style.display = "none";
    }

    modelslides[modelSlideIndex].style.display = "block";
}

// GO LEFT
document.querySelector(".model-prev-slide").onclick = () => {
    console.log("left");
    modelSlideIndex--;
    showModelSlide(modelSlideIndex);
};

// GO RIGHT
document.querySelector(".model-next-slide").onclick = () => {
    console.log("right");
    modelSlideIndex++;
    showModelSlide(modelSlideIndex);
};

// INITIALIZE
showModelSlide(modelSlideIndex);



// ---------- MODEL INTERACTION ----------



const modelCountySelect = document.getElementById("modelCountySelect");
const modelYearSelect   = document.getElementById("modelYearSelect");
const modelMonthSelect  = document.getElementById("modelMonthSelect");
const modelDaySelect    = document.getElementById("modelDaySelect");
const modelOutputBox    = document.getElementById("modelOutput");

// POPULATE DROPDOWNS

// POPULATE COUNTY DROPDOWN WITH 58 COUNTIES
function populateCounties() {
    const counties = Object.keys(modelPredictions);

    counties.forEach(county => {
        const opt = document.createElement("option");
        opt.value = county;
        opt.textContent = county;
        modelCountySelect.appendChild(opt);
    });
}

// POPULATE YEARS FROM 2025-2034
function populateYears() {
    
    for (let y = 2025; y <= 2034; y++) {
        const opt = document.createElement("option");
        opt.value = y;
        opt.textContent = y;
        modelYearSelect.appendChild(opt);
    }
}

// POPULATE MONTHS 1-12
function populateMonths() {
    for (let m = 1; m <= 12; m++) {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        modelMonthSelect.appendChild(opt);
    }
}

// UPDATE DAYS WHEN YEAR + MONTH IS CHOSEN (BECAUSE SOME HAVE 29-21 DAYS)
function updateDays() {
    const year  = parseInt(modelYearSelect.value);
    const month = parseInt(modelMonthSelect.value);

    if (!year || !month) return;

    // DAYS IN THE CHOSEN YEAR & MONTH (BASED ON REAL CALENDER)
    const days = new Date(year, month, 0).getDate();

    modelDaySelect.innerHTML = `<option disabled selected>Day</option>`;

    for (let d = 1; d <= days; d++) {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = d;
        modelDaySelect.appendChild(opt);
    }
}

// COMPUTE FIRE PREDICTION TRUE/FALSE
function updatePrediction() {
    const county = modelCountySelect.value;
    const year   = modelYearSelect.value;
    const month  = modelMonthSelect.value;
    const day    = modelDaySelect.value;

    if (!county || !year || !month || !day) return;

    const result = modelPredictions[county]?.[year]?.[month]?.[day];

    // IF THERE IS AN INCOMPLETE/INVALID RESULT, BACKGROUND BLACK, TEXT -
    if (result === undefined) {
        modelOutputBox.textContent = "—";
        modelOutputBox.style.color = "white";

        // REMOVE FIRE + WATER BACKGROUNDS
        modelOutputBox.classList.remove("fire", "water");
        modelOutputBox.style.backgroundColor = "rgba(0,0,0,0.35)";
        return;
    }

    modelOutputBox.textContent = result ? "YES" : "NO";
    modelOutputBox.style.color = "white";

    // APPLY THE GRADIENT BACKGROUND COLOR 
    setOutputBackground(result);
}


function setOutputBackground(result) {
    // REMOVE PREVIOUS GRADIENT
    modelOutputBox.classList.remove("fire", "water");

    // PICK THE CORRECT SOLID COLOR
    const color = result ? "#FF4E50" : "#005BEA";

    // TRANSITION FROM BLACK -> THAT COLOR
    modelOutputBox.style.transition = "background-color 0.4s ease";
    modelOutputBox.style.backgroundColor = color;

    // TIME THE TRANSITION TO IMEDIATLEY APPLY THE GRADIENT
    // (YOU CANT TRANSITION FROM BLACK -> GRADIENT)
    // ITS TRICKY, DO BLACK ->(smooth)-> SOLID ->(instant)-> GRADIENT
    setTimeout(() => {
        if (result) modelOutputBox.classList.add("fire");
        else modelOutputBox.classList.add("water");
        modelOutputBox.style.backgroundColor = "";
    }, 250); // TIME THE DELAY CORRECTLY
}

// HOOK UP LISTENERS WHEN DETECT CHANGE
modelCountySelect.onchange = () => {
    modelYearSelect.value = "";
    modelMonthSelect.value = "";
    modelDaySelect.innerHTML = `<option disabled selected>Day</option>`;
    modelOutputBox.textContent = "—";
    modelOutputBox.style.color = "white";
    modelOutputBox.classList.remove("fire", "water");
};

modelYearSelect.onchange  = () => { updateDays(); updatePrediction(); };
modelMonthSelect.onchange = () => { updateDays(); updatePrediction(); };
modelDaySelect.onchange   = updatePrediction;


// INITIALIZE
populateCounties();
populateYears();
populateMonths();



// ---------- INITIAL RENDER ----------



loadAndPlot();