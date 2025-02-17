// Constants
const svgWidth = 500;
const svgHeight = 300;
const margins = { top: 40, right: 40, bottom: 60, left: 60 };
const TRANSITION_DURATION = 750;
const TRANSITION_EASE = d3.easeCubicInOut;

// Cache object to store data
let dataCache = null;
let lastFetchTime = null;
const CACHE_DURATION = 1000 * 60 * 5; // 5 minutes cache duration

// Function to fetch and cache data
const fetchDataWithCache = async () => {
    const currentTime = new Date().getTime();
    
    // Return cached data if it exists and is still valid
    if (dataCache && lastFetchTime && (currentTime - lastFetchTime < CACHE_DURATION)) {
        return Promise.resolve(dataCache);
    }

    try {
        // Fetch new data if cache is invalid or doesn't exist
        const response = await d3.csv("Coffee_Shop_Sales.csv");
        
        // Pre-process data to optimize repeated operations
        const processedData = response.map(d => ({
            ...d,
            transaction_date: new Date(d.transaction_date),
            transaction_qty: +d.transaction_qty,
            unit_price: +d.unit_price,
            total_amount: +(d.transaction_qty * d.unit_price)
        }));

        // Update cache
        dataCache = processedData;
        lastFetchTime = currentTime;
        
        return processedData;
    } catch (error) {
        console.error("Error loading data:", error);
        return Promise.reject(error);
    }
};


// State
let selectedCategory = null;

// Tooltip setup
const tooltip = d3.select("body").append("div")
    .attr("class", "tooltip")
    .style("opacity", 0);

// Utility functions
const formatCurrency = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
});

const formatDate = d3.timeFormat("%B %d, %Y");

const showTooltip = (event, content) => {
    tooltip.transition()
        .duration(200)
        .style("opacity", 0.9);
    tooltip.html(content)
        .style("left", `${event.pageX + 10}px`)
        .style("top", `${event.pageY - 28}px`);
};

const hideTooltip = () => {
    tooltip.transition()
        .duration(500)
        .style("opacity", 0);
};

function filterDataByCategory(data, category) {
    return category ? data.filter(d => d.product_category === category) : data;
}

function updateCharts(category) {
    selectedCategory = category;
    drawBarChart(category);
    drawLineChart(category);
    drawScatterPlot(category);
    drawDistributionChart(category);
}

const drawBarChart = (filterCategory = null) => {
    fetchDataWithCache().then(data => {
        const filteredData = filterDataByCategory(data, filterCategory);
        const aggregatedData = d3.rollup(
            filteredData, 
            v => d3.sum(v, d => +d.transaction_qty),
            d => d.product_category
        );

        const categories = Array.from(aggregatedData.keys());
        const values = Array.from(aggregatedData.values());

        const xScale = d3.scaleBand()
            .domain(categories)
            .range([margins.left, svgWidth - margins.right])
            .padding(0.1);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(values)])
            .range([svgHeight - margins.bottom, margins.top]);

        const svg = d3.select("#bar-chart")
            .attr("width", svgWidth)
            .attr("height", svgHeight);

        svg.selectAll("*").remove();

        // Add bars with transitions
        const bars = svg.selectAll("rect")
            .data(categories)
            .enter()
            .append("rect")
            .attr("x", d => xScale(d))
            .attr("width", xScale.bandwidth())
            .attr("y", svgHeight - margins.bottom)
            .attr("height", 0)
            .attr("fill", d => selectedCategory === d ? "#ff7f0e" : "#1f77b4")
            .style("cursor", "pointer");

        bars.transition()
            .duration(TRANSITION_DURATION)
            .ease(TRANSITION_EASE)
            .attr("y", d => yScale(aggregatedData.get(d)))
            .attr("height", d => svgHeight - margins.bottom - yScale(aggregatedData.get(d)));

        // Add tooltips
        bars.on("mouseover", (event, d) => {
            showTooltip(event, `
                <strong>${d}</strong><br>
                Sales: ${aggregatedData.get(d)} units
            `);
        })
        .on("mouseout", hideTooltip)
        .on("click", (event, d) => {
            updateCharts(selectedCategory === d ? null : d);
        });

        // Add axes
        svg.append("g")
            .attr("transform", `translate(0,${svgHeight - margins.bottom})`)
            .call(d3.axisBottom(xScale))
            .selectAll("text")
            .attr("transform", "rotate(-45)")
            .style("text-anchor", "end");

        svg.append("g")
            .attr("transform", `translate(${margins.left},0)`)
            .call(d3.axisLeft(yScale));

        // Add axis labels
        svg.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("x", svgWidth / 2)
            .attr("y", svgHeight - 10)
            .text("Product Category");

        svg.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("transform", "rotate(-90)")
            .attr("x", -(svgHeight / 2))
            .attr("y", 15)
            .text("Units Sold");
    });
};

const drawLineChart = (filterCategory = null) => {
    fetchDataWithCache().then(data => {
        const filteredData = filterDataByCategory(data, filterCategory);
        
        filteredData.forEach(d => {
            d.transaction_date = new Date(d.transaction_date);
            d.transaction_qty = +d.transaction_qty;
        });

        const dailySales = d3.rollup(
            filteredData,
            v => d3.sum(v, d => d.transaction_qty),
            d => d3.timeDay(d.transaction_date)
        );

        const timeData = Array.from(dailySales, ([date, value]) => ({date, value}))
            .sort((a, b) => a.date - b.date);

        const xScale = d3.scaleTime()
            .domain(d3.extent(timeData, d => d.date))
            .range([margins.left, svgWidth - margins.right]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(timeData, d => d.value)])
            .range([svgHeight - margins.bottom, margins.top]);

        const svg = d3.select("#line-chart")
            .attr("width", svgWidth)
            .attr("height", svgHeight);

        svg.selectAll("*").remove();

        // Create line generator
        const line = d3.line()
            .x(d => xScale(d.date))
            .y(d => yScale(d.value))
            .curve(d3.curveMonotoneX);

        // Add line with transition
        const path = svg.append("path")
            .datum(timeData)
            .attr("fill", "none")
            .attr("stroke", "#2ecc71")
            .attr("stroke-width", 2);

        const pathLength = path.node().getTotalLength();

        path.attr("stroke-dasharray", pathLength)
            .attr("stroke-dashoffset", pathLength)
            .attr("d", line)
            .transition()
            .duration(TRANSITION_DURATION)
            .ease(TRANSITION_EASE)
            .attr("stroke-dashoffset", 0);

        // Add points
        svg.selectAll(".point")
            .data(timeData)
            .enter()
            .append("circle")
            .attr("class", "point")
            .attr("cx", d => xScale(d.date))
            .attr("cy", d => yScale(d.value))
            .attr("r", 4)
            .attr("fill", "#2ecc71")
            .attr("opacity", 0)
            .on("mouseover", (event, d) => {
                showTooltip(event, `
                    Date: ${formatDate(d.date)}<br>
                    Sales: ${d.value} units
                `);
            })
            .on("mouseout", hideTooltip)
            .transition()
            .delay(TRANSITION_DURATION)
            .duration(200)
            .attr("opacity", 0.7);

        // Add axes
        svg.append("g")
            .attr("transform", `translate(0,${svgHeight - margins.bottom})`)
            .call(d3.axisBottom(xScale));

        svg.append("g")
            .attr("transform", `translate(${margins.left},0)`)
            .call(d3.axisLeft(yScale));

        // Add axis labels
        svg.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("x", svgWidth / 2)
            .attr("y", svgHeight - 10)
            .text("Date");

        svg.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("transform", "rotate(-90)")
            .attr("x", -(svgHeight / 2))
            .attr("y", 15)
            .text("Units Sold");
    });
};

const drawScatterPlot = (filterCategory = null) => {
    fetchDataWithCache().then(data => {
        const filteredData = filterDataByCategory(data, filterCategory);
        
        const xScale = d3.scaleLinear()
            .domain([0, d3.max(filteredData, d => +d.unit_price)])
            .range([margins.left, svgWidth - margins.right]);

        const yScale = d3.scaleLinear()
            .domain([0, d3.max(filteredData, d => +d.transaction_qty)])
            .range([svgHeight - margins.bottom, margins.top]);

        const svg = d3.select("#scatter-plot")
            .attr("width", svgWidth)
            .attr("height", svgHeight);

        svg.selectAll("*").remove();

        // Add points with transition
        svg.selectAll("circle")
            .data(filteredData)
            .enter()
            .append("circle")
            .attr("cx", d => xScale(+d.unit_price))
            .attr("cy", svgHeight - margins.bottom)
            .attr("r", 4)
            .attr("fill", "#9b59b6")
            .attr("opacity", 0.6)
            .on("mouseover", (event, d) => {
                showTooltip(event, `
                    Price: ${formatCurrency.format(d.unit_price)}<br>
                    Quantity: ${d.transaction_qty} units
                `);
            })
            .on("mouseout", hideTooltip)
            .transition()
            .duration(TRANSITION_DURATION)
            .ease(TRANSITION_EASE)
            .attr("cy", d => yScale(+d.transaction_qty));

        // Add axes
        svg.append("g")
            .attr("transform", `translate(0,${svgHeight - margins.bottom})`)
            .call(d3.axisBottom(xScale)
                .tickFormat(d => formatCurrency.format(d)));

        svg.append("g")
            .attr("transform", `translate(${margins.left},0)`)
            .call(d3.axisLeft(yScale));

        // Add axis labels
        svg.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("x", svgWidth / 2)
            .attr("y", svgHeight - 10)
            .text("Unit Price ($)");

        svg.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("transform", "rotate(-90)")
            .attr("x", -(svgHeight / 2))
            .attr("y", 15)
            .text("Quantity Sold");
    });
};

const drawDistributionChart = (filterCategory = null) => {
    fetchDataWithCache().then(data => {
        const filteredData = filterDataByCategory(data, filterCategory);
        
        // Calculate total transaction amount (quantity * unit price)
        const values = filteredData
            .map(d => +(d.transaction_qty * d.unit_price))
            .filter(d => !isNaN(d) && d !== null && d !== undefined);
        
        if (values.length === 0) return;
        
        // Create histogram with valid bin size
        const binWidth = (d3.max(values) - d3.min(values)) / 20;
        const histogram = d3.histogram()
            .domain([d3.min(values), d3.max(values)])
            .thresholds(d3.range(
                d3.min(values), 
                d3.max(values), 
                binWidth
            ));
            
        const bins = histogram(values);
        
        const xScale = d3.scaleLinear()
            .domain([d3.min(values), d3.max(values)])
            .range([margins.left, svgWidth - margins.right]);
            
        const yScale = d3.scaleLinear()
            .domain([0, d3.max(bins, d => d.length)])
            .range([svgHeight - margins.bottom, margins.top]);
            
        const svg = d3.select("#distribution-chart")
            .attr("width", svgWidth)
            .attr("height", svgHeight);
            
        svg.selectAll("*").remove();
        
        // Add bars with tooltips
        const bars = svg.selectAll("rect")
            .data(bins)
            .enter()
            .append("rect")
            .attr("x", d => xScale(d.x0))
            .attr("width", d => Math.max(1, xScale(d.x1) - xScale(d.x0)))
            .attr("y", d => yScale(d.length))
            .attr("height", d => Math.max(0, svgHeight - margins.bottom - yScale(d.length)))
            .attr("fill", "#2ecc71")
            .attr("opacity", 0.7)
            .on("mouseover", (event, d) => {
                showTooltip(event, `
                    Range: ${formatCurrency.format(d.x0)} - ${formatCurrency.format(d.x1)}<br>
                    Count: ${d.length} transactions
                `);
            })
            .on("mouseout", hideTooltip);

        // Add axes
        svg.append("g")
            .attr("transform", `translate(0,${svgHeight - margins.bottom})`)
            .call(d3.axisBottom(xScale)
                .tickFormat(d => formatCurrency.format(d)));
            
        svg.append("g")
            .attr("transform", `translate(${margins.left},0)`)
            .call(d3.axisLeft(yScale));

        // Add axis labels
        svg.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("x", svgWidth / 2)
            .attr("y", svgHeight - 10)
            .text("Total Sales Amount");

        svg.append("text")
            .attr("class", "axis-label")
            .attr("text-anchor", "middle")
            .attr("transform", "rotate(-90)")
            .attr("x", -(svgHeight / 2))
            .attr("y", 15)
            .text("Number of Transactions");
    });
};


// Initialize charts
updateCharts(null);

// Add reset functionality
d3.select("#resetFilters").on("click", () => {
    d3.select("#resetFilters")
        .style("transform", "scale(0.95)")
        .transition()
        .duration(100)
        .style("transform", "scale(1)");
    updateCharts(null);
});

// Add window resize handler
window.addEventListener('resize', () => {
    clearTimeout(window.resizeTimer);
    window.resizeTimer = setTimeout(() => {
        updateCharts(selectedCategory);
    }, 250);
});

