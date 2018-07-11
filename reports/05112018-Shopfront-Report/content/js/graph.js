/*
   Licensed to the Apache Software Foundation (ASF) under one or more
   contributor license agreements.  See the NOTICE file distributed with
   this work for additional information regarding copyright ownership.
   The ASF licenses this file to You under the Apache License, Version 2.0
   (the "License"); you may not use this file except in compliance with
   the License.  You may obtain a copy of the License at

       http://www.apache.org/licenses/LICENSE-2.0

   Unless required by applicable law or agreed to in writing, software
   distributed under the License is distributed on an "AS IS" BASIS,
   WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
   See the License for the specific language governing permissions and
   limitations under the License.
*/
$(document).ready(function() {

    $(".click-title").mouseenter( function(    e){
        e.preventDefault();
        this.style.cursor="pointer";
    });
    $(".click-title").mousedown( function(event){
        event.preventDefault();
    });

    // Ugly code while this script is shared among several pages
    try{
        refreshHitsPerSecond(true);
    } catch(e){}
    try{
        refreshResponseTimeOverTime(true);
    } catch(e){}
    try{
        refreshResponseTimePercentiles();
    } catch(e){}
    $(".portlet-header").css("cursor", "auto");
});

var showControllersOnly = false;
var seriesFilter = "";
var filtersOnlySampleSeries = true;

// Fixes time stamps
function fixTimeStamps(series, offset){
    $.each(series, function(index, item) {
        $.each(item.data, function(index, coord) {
            coord[0] += offset;
        });
    });
}

// Check if the specified jquery object is a graph
function isGraph(object){
    return object.data('plot') !== undefined;
}

/**
 * Export graph to a PNG
 */
function exportToPNG(graphName, target) {
    var plot = $("#"+graphName).data('plot');
    var flotCanvas = plot.getCanvas();
    var image = flotCanvas.toDataURL();
    image = image.replace("image/png", "image/octet-stream");
    
    var downloadAttrSupported = ("download" in document.createElement("a"));
    if(downloadAttrSupported === true) {
        target.download = graphName + ".png";
        target.href = image;
    }
    else {
        document.location.href = image;
    }
    
}

// Override the specified graph options to fit the requirements of an overview
function prepareOverviewOptions(graphOptions){
    var overviewOptions = {
        series: {
            shadowSize: 0,
            lines: {
                lineWidth: 1
            },
            points: {
                // Show points on overview only when linked graph does not show
                // lines
                show: getProperty('series.lines.show', graphOptions) == false,
                radius : 1
            }
        },
        xaxis: {
            ticks: 2,
            axisLabel: null
        },
        yaxis: {
            ticks: 2,
            axisLabel: null
        },
        legend: {
            show: false,
            container: null
        },
        grid: {
            hoverable: false
        },
        tooltip: false
    };
    return $.extend(true, {}, graphOptions, overviewOptions);
}

// Force axes boundaries using graph extra options
function prepareOptions(options, data) {
    options.canvas = true;
    var extraOptions = data.extraOptions;
    if(extraOptions !== undefined){
        var xOffset = options.xaxis.mode === "time" ? 28800000 : 0;
        var yOffset = options.yaxis.mode === "time" ? 28800000 : 0;

        if(!isNaN(extraOptions.minX))
        	options.xaxis.min = parseFloat(extraOptions.minX) + xOffset;
        
        if(!isNaN(extraOptions.maxX))
        	options.xaxis.max = parseFloat(extraOptions.maxX) + xOffset;
        
        if(!isNaN(extraOptions.minY))
        	options.yaxis.min = parseFloat(extraOptions.minY) + yOffset;
        
        if(!isNaN(extraOptions.maxY))
        	options.yaxis.max = parseFloat(extraOptions.maxY) + yOffset;
    }
}

// Filter, mark series and sort data
/**
 * @param data
 * @param noMatchColor if defined and true, series.color are not matched with index
 */
function prepareSeries(data, noMatchColor){
    var result = data.result;

    // Keep only series when needed
    if(seriesFilter && (!filtersOnlySampleSeries || result.supportsControllersDiscrimination)){
        // Insensitive case matching
        var regexp = new RegExp(seriesFilter, 'i');
        result.series = $.grep(result.series, function(series, index){
            return regexp.test(series.label);
        });
    }

    // Keep only controllers series when supported and needed
    if(result.supportsControllersDiscrimination && showControllersOnly){
        result.series = $.grep(result.series, function(series, index){
            return series.isController;
        });
    }

    // Sort data and mark series
    $.each(result.series, function(index, series) {
        series.data.sort(compareByXCoordinate);
        if(!(noMatchColor && noMatchColor===true)) {
	        series.color = index;
	    }
    });
}

// Set the zoom on the specified plot object
function zoomPlot(plot, xmin, xmax, ymin, ymax){
    var axes = plot.getAxes();
    // Override axes min and max options
    $.extend(true, axes, {
        xaxis: {
            options : { min: xmin, max: xmax }
        },
        yaxis: {
            options : { min: ymin, max: ymax }
        }
    });

    // Redraw the plot
    plot.setupGrid();
    plot.draw();
}

// Prepares DOM items to add zoom function on the specified graph
function setGraphZoomable(graphSelector, overviewSelector){
    var graph = $(graphSelector);
    var overview = $(overviewSelector);

    // Ignore mouse down event
    graph.bind("mousedown", function() { return false; });
    overview.bind("mousedown", function() { return false; });

    // Zoom on selection
    graph.bind("plotselected", function (event, ranges) {
        // clamp the zooming to prevent infinite zoom
        if (ranges.xaxis.to - ranges.xaxis.from < 0.00001) {
            ranges.xaxis.to = ranges.xaxis.from + 0.00001;
        }
        if (ranges.yaxis.to - ranges.yaxis.from < 0.00001) {
            ranges.yaxis.to = ranges.yaxis.from + 0.00001;
        }

        // Do the zooming
        var plot = graph.data('plot');
        zoomPlot(plot, ranges.xaxis.from, ranges.xaxis.to, ranges.yaxis.from, ranges.yaxis.to);
        plot.clearSelection();

        // Synchronize overview selection
        overview.data('plot').setSelection(ranges, true);
    });

    // Zoom linked graph on overview selection
    overview.bind("plotselected", function (event, ranges) {
        graph.data('plot').setSelection(ranges);
    });

    // Reset linked graph zoom when reseting overview selection
    overview.bind("plotunselected", function () {
        var overviewAxes = overview.data('plot').getAxes();
        zoomPlot(graph.data('plot'), overviewAxes.xaxis.min, overviewAxes.xaxis.max, overviewAxes.yaxis.min, overviewAxes.yaxis.max);
    });
}

var responseTimePercentilesInfos = {
        data: {"result": {"minY": 4.0, "minX": 0.0, "maxY": 67689.0, "series": [{"data": [[0.0, 4.0], [0.1, 5.0], [0.2, 5.0], [0.3, 5.0], [0.4, 5.0], [0.5, 5.0], [0.6, 5.0], [0.7, 5.0], [0.8, 5.0], [0.9, 5.0], [1.0, 5.0], [1.1, 5.0], [1.2, 6.0], [1.3, 6.0], [1.4, 6.0], [1.5, 6.0], [1.6, 6.0], [1.7, 6.0], [1.8, 6.0], [1.9, 6.0], [2.0, 6.0], [2.1, 6.0], [2.2, 6.0], [2.3, 6.0], [2.4, 7.0], [2.5, 7.0], [2.6, 7.0], [2.7, 7.0], [2.8, 7.0], [2.9, 7.0], [3.0, 7.0], [3.1, 7.0], [3.2, 8.0], [3.3, 8.0], [3.4, 8.0], [3.5, 8.0], [3.6, 8.0], [3.7, 8.0], [3.8, 9.0], [3.9, 9.0], [4.0, 9.0], [4.1, 9.0], [4.2, 10.0], [4.3, 10.0], [4.4, 10.0], [4.5, 11.0], [4.6, 12.0], [4.7, 13.0], [4.8, 15.0], [4.9, 19.0], [5.0, 58.0], [5.1, 68.0], [5.2, 75.0], [5.3, 110.0], [5.4, 162.0], [5.5, 167.0], [5.6, 171.0], [5.7, 176.0], [5.8, 180.0], [5.9, 184.0], [6.0, 189.0], [6.1, 194.0], [6.2, 199.0], [6.3, 204.0], [6.4, 208.0], [6.5, 213.0], [6.6, 218.0], [6.7, 222.0], [6.8, 226.0], [6.9, 230.0], [7.0, 234.0], [7.1, 236.0], [7.2, 238.0], [7.3, 240.0], [7.4, 242.0], [7.5, 244.0], [7.6, 246.0], [7.7, 247.0], [7.8, 249.0], [7.9, 250.0], [8.0, 251.0], [8.1, 253.0], [8.2, 254.0], [8.3, 255.0], [8.4, 256.0], [8.5, 258.0], [8.6, 259.0], [8.7, 260.0], [8.8, 261.0], [8.9, 262.0], [9.0, 264.0], [9.1, 265.0], [9.2, 266.0], [9.3, 268.0], [9.4, 269.0], [9.5, 271.0], [9.6, 272.0], [9.7, 273.0], [9.8, 275.0], [9.9, 276.0], [10.0, 278.0], [10.1, 280.0], [10.2, 281.0], [10.3, 283.0], [10.4, 284.0], [10.5, 286.0], [10.6, 288.0], [10.7, 290.0], [10.8, 291.0], [10.9, 292.0], [11.0, 294.0], [11.1, 296.0], [11.2, 297.0], [11.3, 299.0], [11.4, 300.0], [11.5, 301.0], [11.6, 303.0], [11.7, 305.0], [11.8, 306.0], [11.9, 308.0], [12.0, 309.0], [12.1, 310.0], [12.2, 312.0], [12.3, 313.0], [12.4, 315.0], [12.5, 316.0], [12.6, 317.0], [12.7, 318.0], [12.8, 319.0], [12.9, 321.0], [13.0, 322.0], [13.1, 323.0], [13.2, 324.0], [13.3, 325.0], [13.4, 326.0], [13.5, 328.0], [13.6, 329.0], [13.7, 330.0], [13.8, 332.0], [13.9, 333.0], [14.0, 335.0], [14.1, 336.0], [14.2, 338.0], [14.3, 339.0], [14.4, 341.0], [14.5, 342.0], [14.6, 344.0], [14.7, 345.0], [14.8, 347.0], [14.9, 349.0], [15.0, 351.0], [15.1, 352.0], [15.2, 354.0], [15.3, 356.0], [15.4, 358.0], [15.5, 360.0], [15.6, 362.0], [15.7, 364.0], [15.8, 366.0], [15.9, 368.0], [16.0, 371.0], [16.1, 373.0], [16.2, 375.0], [16.3, 378.0], [16.4, 381.0], [16.5, 383.0], [16.6, 386.0], [16.7, 389.0], [16.8, 391.0], [16.9, 394.0], [17.0, 397.0], [17.1, 399.0], [17.2, 402.0], [17.3, 404.0], [17.4, 407.0], [17.5, 410.0], [17.6, 413.0], [17.7, 415.0], [17.8, 418.0], [17.9, 421.0], [18.0, 424.0], [18.1, 427.0], [18.2, 431.0], [18.3, 433.0], [18.4, 436.0], [18.5, 440.0], [18.6, 442.0], [18.7, 445.0], [18.8, 448.0], [18.9, 452.0], [19.0, 455.0], [19.1, 458.0], [19.2, 461.0], [19.3, 464.0], [19.4, 467.0], [19.5, 469.0], [19.6, 473.0], [19.7, 477.0], [19.8, 480.0], [19.9, 483.0], [20.0, 487.0], [20.1, 491.0], [20.2, 494.0], [20.3, 497.0], [20.4, 502.0], [20.5, 505.0], [20.6, 509.0], [20.7, 513.0], [20.8, 518.0], [20.9, 522.0], [21.0, 528.0], [21.1, 533.0], [21.2, 537.0], [21.3, 544.0], [21.4, 548.0], [21.5, 554.0], [21.6, 560.0], [21.7, 566.0], [21.8, 573.0], [21.9, 578.0], [22.0, 583.0], [22.1, 589.0], [22.2, 595.0], [22.3, 600.0], [22.4, 606.0], [22.5, 613.0], [22.6, 618.0], [22.7, 623.0], [22.8, 631.0], [22.9, 638.0], [23.0, 646.0], [23.1, 653.0], [23.2, 660.0], [23.3, 667.0], [23.4, 673.0], [23.5, 680.0], [23.6, 687.0], [23.7, 693.0], [23.8, 701.0], [23.9, 709.0], [24.0, 716.0], [24.1, 724.0], [24.2, 733.0], [24.3, 741.0], [24.4, 747.0], [24.5, 755.0], [24.6, 763.0], [24.7, 772.0], [24.8, 780.0], [24.9, 788.0], [25.0, 795.0], [25.1, 803.0], [25.2, 810.0], [25.3, 818.0], [25.4, 826.0], [25.5, 835.0], [25.6, 845.0], [25.7, 854.0], [25.8, 861.0], [25.9, 870.0], [26.0, 879.0], [26.1, 890.0], [26.2, 899.0], [26.3, 910.0], [26.4, 920.0], [26.5, 930.0], [26.6, 942.0], [26.7, 951.0], [26.8, 959.0], [26.9, 969.0], [27.0, 979.0], [27.1, 990.0], [27.2, 999.0], [27.3, 1012.0], [27.4, 1026.0], [27.5, 1035.0], [27.6, 1048.0], [27.7, 1062.0], [27.8, 1074.0], [27.9, 1088.0], [28.0, 1100.0], [28.1, 1116.0], [28.2, 1129.0], [28.3, 1140.0], [28.4, 1152.0], [28.5, 1161.0], [28.6, 1172.0], [28.7, 1182.0], [28.8, 1195.0], [28.9, 1205.0], [29.0, 1217.0], [29.1, 1231.0], [29.2, 1244.0], [29.3, 1259.0], [29.4, 1269.0], [29.5, 1281.0], [29.6, 1291.0], [29.7, 1305.0], [29.8, 1318.0], [29.9, 1330.0], [30.0, 1341.0], [30.1, 1357.0], [30.2, 1371.0], [30.3, 1381.0], [30.4, 1390.0], [30.5, 1401.0], [30.6, 1412.0], [30.7, 1425.0], [30.8, 1435.0], [30.9, 1448.0], [31.0, 1460.0], [31.1, 1471.0], [31.2, 1484.0], [31.3, 1494.0], [31.4, 1505.0], [31.5, 1515.0], [31.6, 1529.0], [31.7, 1541.0], [31.8, 1549.0], [31.9, 1560.0], [32.0, 1572.0], [32.1, 1583.0], [32.2, 1593.0], [32.3, 1604.0], [32.4, 1616.0], [32.5, 1626.0], [32.6, 1639.0], [32.7, 1652.0], [32.8, 1661.0], [32.9, 1671.0], [33.0, 1682.0], [33.1, 1693.0], [33.2, 1704.0], [33.3, 1717.0], [33.4, 1726.0], [33.5, 1734.0], [33.6, 1743.0], [33.7, 1753.0], [33.8, 1762.0], [33.9, 1770.0], [34.0, 1780.0], [34.1, 1789.0], [34.2, 1799.0], [34.3, 1808.0], [34.4, 1818.0], [34.5, 1829.0], [34.6, 1838.0], [34.7, 1850.0], [34.8, 1859.0], [34.9, 1866.0], [35.0, 1873.0], [35.1, 1881.0], [35.2, 1890.0], [35.3, 1898.0], [35.4, 1905.0], [35.5, 1916.0], [35.6, 1925.0], [35.7, 1934.0], [35.8, 1943.0], [35.9, 1949.0], [36.0, 1959.0], [36.1, 1968.0], [36.2, 1979.0], [36.3, 1987.0], [36.4, 1996.0], [36.5, 2004.0], [36.6, 2012.0], [36.7, 2021.0], [36.8, 2028.0], [36.9, 2037.0], [37.0, 2045.0], [37.1, 2055.0], [37.2, 2066.0], [37.3, 2074.0], [37.4, 2083.0], [37.5, 2092.0], [37.6, 2099.0], [37.7, 2106.0], [37.8, 2113.0], [37.9, 2122.0], [38.0, 2130.0], [38.1, 2137.0], [38.2, 2144.0], [38.3, 2152.0], [38.4, 2160.0], [38.5, 2167.0], [38.6, 2175.0], [38.7, 2183.0], [38.8, 2190.0], [38.9, 2198.0], [39.0, 2205.0], [39.1, 2213.0], [39.2, 2219.0], [39.3, 2228.0], [39.4, 2235.0], [39.5, 2242.0], [39.6, 2248.0], [39.7, 2256.0], [39.8, 2264.0], [39.9, 2271.0], [40.0, 2278.0], [40.1, 2289.0], [40.2, 2297.0], [40.3, 2304.0], [40.4, 2312.0], [40.5, 2319.0], [40.6, 2327.0], [40.7, 2333.0], [40.8, 2341.0], [40.9, 2346.0], [41.0, 2353.0], [41.1, 2361.0], [41.2, 2369.0], [41.3, 2376.0], [41.4, 2385.0], [41.5, 2391.0], [41.6, 2398.0], [41.7, 2406.0], [41.8, 2415.0], [41.9, 2422.0], [42.0, 2430.0], [42.1, 2438.0], [42.2, 2445.0], [42.3, 2453.0], [42.4, 2460.0], [42.5, 2467.0], [42.6, 2474.0], [42.7, 2481.0], [42.8, 2488.0], [42.9, 2496.0], [43.0, 2504.0], [43.1, 2511.0], [43.2, 2517.0], [43.3, 2524.0], [43.4, 2531.0], [43.5, 2538.0], [43.6, 2544.0], [43.7, 2552.0], [43.8, 2558.0], [43.9, 2564.0], [44.0, 2571.0], [44.1, 2578.0], [44.2, 2586.0], [44.3, 2592.0], [44.4, 2601.0], [44.5, 2608.0], [44.6, 2613.0], [44.7, 2621.0], [44.8, 2627.0], [44.9, 2634.0], [45.0, 2641.0], [45.1, 2649.0], [45.2, 2655.0], [45.3, 2662.0], [45.4, 2669.0], [45.5, 2677.0], [45.6, 2685.0], [45.7, 2692.0], [45.8, 2699.0], [45.9, 2706.0], [46.0, 2713.0], [46.1, 2722.0], [46.2, 2728.0], [46.3, 2735.0], [46.4, 2742.0], [46.5, 2751.0], [46.6, 2759.0], [46.7, 2765.0], [46.8, 2771.0], [46.9, 2778.0], [47.0, 2785.0], [47.1, 2790.0], [47.2, 2796.0], [47.3, 2804.0], [47.4, 2811.0], [47.5, 2817.0], [47.6, 2824.0], [47.7, 2831.0], [47.8, 2838.0], [47.9, 2846.0], [48.0, 2852.0], [48.1, 2859.0], [48.2, 2867.0], [48.3, 2874.0], [48.4, 2882.0], [48.5, 2888.0], [48.6, 2896.0], [48.7, 2902.0], [48.8, 2909.0], [48.9, 2916.0], [49.0, 2924.0], [49.1, 2931.0], [49.2, 2939.0], [49.3, 2946.0], [49.4, 2951.0], [49.5, 2958.0], [49.6, 2965.0], [49.7, 2973.0], [49.8, 2981.0], [49.9, 2988.0], [50.0, 2998.0], [50.1, 3005.0], [50.2, 3012.0], [50.3, 3021.0], [50.4, 3030.0], [50.5, 3036.0], [50.6, 3045.0], [50.7, 3052.0], [50.8, 3058.0], [50.9, 3065.0], [51.0, 3071.0], [51.1, 3077.0], [51.2, 3083.0], [51.3, 3090.0], [51.4, 3098.0], [51.5, 3104.0], [51.6, 3111.0], [51.7, 3120.0], [51.8, 3127.0], [51.9, 3135.0], [52.0, 3140.0], [52.1, 3148.0], [52.2, 3155.0], [52.3, 3165.0], [52.4, 3174.0], [52.5, 3181.0], [52.6, 3188.0], [52.7, 3196.0], [52.8, 3204.0], [52.9, 3210.0], [53.0, 3219.0], [53.1, 3227.0], [53.2, 3233.0], [53.3, 3242.0], [53.4, 3248.0], [53.5, 3258.0], [53.6, 3265.0], [53.7, 3273.0], [53.8, 3281.0], [53.9, 3288.0], [54.0, 3298.0], [54.1, 3305.0], [54.2, 3314.0], [54.3, 3324.0], [54.4, 3333.0], [54.5, 3339.0], [54.6, 3349.0], [54.7, 3355.0], [54.8, 3364.0], [54.9, 3371.0], [55.0, 3378.0], [55.1, 3387.0], [55.2, 3393.0], [55.3, 3402.0], [55.4, 3410.0], [55.5, 3418.0], [55.6, 3426.0], [55.7, 3434.0], [55.8, 3442.0], [55.9, 3453.0], [56.0, 3460.0], [56.1, 3467.0], [56.2, 3477.0], [56.3, 3486.0], [56.4, 3496.0], [56.5, 3505.0], [56.6, 3516.0], [56.7, 3526.0], [56.8, 3534.0], [56.9, 3544.0], [57.0, 3553.0], [57.1, 3561.0], [57.2, 3570.0], [57.3, 3579.0], [57.4, 3588.0], [57.5, 3600.0], [57.6, 3609.0], [57.7, 3623.0], [57.8, 3630.0], [57.9, 3638.0], [58.0, 3646.0], [58.1, 3656.0], [58.2, 3666.0], [58.3, 3675.0], [58.4, 3685.0], [58.5, 3696.0], [58.6, 3705.0], [58.7, 3716.0], [58.8, 3725.0], [58.9, 3734.0], [59.0, 3744.0], [59.1, 3752.0], [59.2, 3763.0], [59.3, 3772.0], [59.4, 3781.0], [59.5, 3795.0], [59.6, 3804.0], [59.7, 3813.0], [59.8, 3825.0], [59.9, 3837.0], [60.0, 3846.0], [60.1, 3858.0], [60.2, 3867.0], [60.3, 3879.0], [60.4, 3890.0], [60.5, 3902.0], [60.6, 3912.0], [60.7, 3923.0], [60.8, 3934.0], [60.9, 3945.0], [61.0, 3958.0], [61.1, 3968.0], [61.2, 3982.0], [61.3, 3993.0], [61.4, 4002.0], [61.5, 4014.0], [61.6, 4024.0], [61.7, 4035.0], [61.8, 4045.0], [61.9, 4055.0], [62.0, 4068.0], [62.1, 4077.0], [62.2, 4091.0], [62.3, 4102.0], [62.4, 4113.0], [62.5, 4127.0], [62.6, 4136.0], [62.7, 4147.0], [62.8, 4158.0], [62.9, 4171.0], [63.0, 4183.0], [63.1, 4193.0], [63.2, 4205.0], [63.3, 4218.0], [63.4, 4232.0], [63.5, 4246.0], [63.6, 4257.0], [63.7, 4271.0], [63.8, 4283.0], [63.9, 4293.0], [64.0, 4305.0], [64.1, 4315.0], [64.2, 4327.0], [64.3, 4336.0], [64.4, 4348.0], [64.5, 4358.0], [64.6, 4368.0], [64.7, 4382.0], [64.8, 4396.0], [64.9, 4407.0], [65.0, 4419.0], [65.1, 4433.0], [65.2, 4445.0], [65.3, 4458.0], [65.4, 4470.0], [65.5, 4482.0], [65.6, 4494.0], [65.7, 4508.0], [65.8, 4522.0], [65.9, 4533.0], [66.0, 4549.0], [66.1, 4561.0], [66.2, 4570.0], [66.3, 4588.0], [66.4, 4603.0], [66.5, 4618.0], [66.6, 4631.0], [66.7, 4644.0], [66.8, 4656.0], [66.9, 4672.0], [67.0, 4682.0], [67.1, 4695.0], [67.2, 4707.0], [67.3, 4722.0], [67.4, 4736.0], [67.5, 4756.0], [67.6, 4771.0], [67.7, 4787.0], [67.8, 4801.0], [67.9, 4815.0], [68.0, 4829.0], [68.1, 4843.0], [68.2, 4856.0], [68.3, 4872.0], [68.4, 4890.0], [68.5, 4906.0], [68.6, 4920.0], [68.7, 4934.0], [68.8, 4953.0], [68.9, 4964.0], [69.0, 4981.0], [69.1, 5001.0], [69.2, 5017.0], [69.3, 5032.0], [69.4, 5051.0], [69.5, 5068.0], [69.6, 5082.0], [69.7, 5098.0], [69.8, 5117.0], [69.9, 5136.0], [70.0, 5150.0], [70.1, 5165.0], [70.2, 5180.0], [70.3, 5196.0], [70.4, 5216.0], [70.5, 5230.0], [70.6, 5247.0], [70.7, 5262.0], [70.8, 5281.0], [70.9, 5297.0], [71.0, 5310.0], [71.1, 5329.0], [71.2, 5347.0], [71.3, 5368.0], [71.4, 5388.0], [71.5, 5403.0], [71.6, 5419.0], [71.7, 5440.0], [71.8, 5457.0], [71.9, 5471.0], [72.0, 5490.0], [72.1, 5505.0], [72.2, 5517.0], [72.3, 5532.0], [72.4, 5549.0], [72.5, 5569.0], [72.6, 5584.0], [72.7, 5601.0], [72.8, 5619.0], [72.9, 5634.0], [73.0, 5651.0], [73.1, 5667.0], [73.2, 5682.0], [73.3, 5699.0], [73.4, 5716.0], [73.5, 5736.0], [73.6, 5751.0], [73.7, 5766.0], [73.8, 5783.0], [73.9, 5800.0], [74.0, 5819.0], [74.1, 5837.0], [74.2, 5857.0], [74.3, 5872.0], [74.4, 5889.0], [74.5, 5905.0], [74.6, 5921.0], [74.7, 5935.0], [74.8, 5953.0], [74.9, 5967.0], [75.0, 5980.0], [75.1, 5998.0], [75.2, 6022.0], [75.3, 6039.0], [75.4, 6057.0], [75.5, 6075.0], [75.6, 6090.0], [75.7, 6111.0], [75.8, 6130.0], [75.9, 6152.0], [76.0, 6171.0], [76.1, 6187.0], [76.2, 6204.0], [76.3, 6221.0], [76.4, 6238.0], [76.5, 6259.0], [76.6, 6274.0], [76.7, 6292.0], [76.8, 6309.0], [76.9, 6327.0], [77.0, 6345.0], [77.1, 6363.0], [77.2, 6381.0], [77.3, 6403.0], [77.4, 6428.0], [77.5, 6448.0], [77.6, 6464.0], [77.7, 6490.0], [77.8, 6510.0], [77.9, 6530.0], [78.0, 6547.0], [78.1, 6569.0], [78.2, 6594.0], [78.3, 6613.0], [78.4, 6629.0], [78.5, 6649.0], [78.6, 6668.0], [78.7, 6688.0], [78.8, 6709.0], [78.9, 6734.0], [79.0, 6761.0], [79.1, 6780.0], [79.2, 6799.0], [79.3, 6827.0], [79.4, 6851.0], [79.5, 6866.0], [79.6, 6886.0], [79.7, 6902.0], [79.8, 6926.0], [79.9, 6945.0], [80.0, 6966.0], [80.1, 6992.0], [80.2, 7015.0], [80.3, 7038.0], [80.4, 7057.0], [80.5, 7075.0], [80.6, 7098.0], [80.7, 7122.0], [80.8, 7144.0], [80.9, 7166.0], [81.0, 7187.0], [81.1, 7208.0], [81.2, 7228.0], [81.3, 7254.0], [81.4, 7271.0], [81.5, 7294.0], [81.6, 7322.0], [81.7, 7354.0], [81.8, 7380.0], [81.9, 7407.0], [82.0, 7429.0], [82.1, 7452.0], [82.2, 7471.0], [82.3, 7492.0], [82.4, 7515.0], [82.5, 7536.0], [82.6, 7568.0], [82.7, 7590.0], [82.8, 7615.0], [82.9, 7634.0], [83.0, 7658.0], [83.1, 7677.0], [83.2, 7699.0], [83.3, 7718.0], [83.4, 7738.0], [83.5, 7760.0], [83.6, 7786.0], [83.7, 7811.0], [83.8, 7835.0], [83.9, 7855.0], [84.0, 7877.0], [84.1, 7896.0], [84.2, 7916.0], [84.3, 7940.0], [84.4, 7964.0], [84.5, 7988.0], [84.6, 8010.0], [84.7, 8035.0], [84.8, 8054.0], [84.9, 8083.0], [85.0, 8103.0], [85.1, 8128.0], [85.2, 8149.0], [85.3, 8173.0], [85.4, 8200.0], [85.5, 8221.0], [85.6, 8244.0], [85.7, 8273.0], [85.8, 8299.0], [85.9, 8324.0], [86.0, 8347.0], [86.1, 8370.0], [86.2, 8393.0], [86.3, 8419.0], [86.4, 8441.0], [86.5, 8466.0], [86.6, 8491.0], [86.7, 8515.0], [86.8, 8540.0], [86.9, 8559.0], [87.0, 8578.0], [87.1, 8603.0], [87.2, 8621.0], [87.3, 8644.0], [87.4, 8663.0], [87.5, 8687.0], [87.6, 8711.0], [87.7, 8737.0], [87.8, 8754.0], [87.9, 8777.0], [88.0, 8802.0], [88.1, 8821.0], [88.2, 8839.0], [88.3, 8860.0], [88.4, 8878.0], [88.5, 8899.0], [88.6, 8917.0], [88.7, 8940.0], [88.8, 8961.0], [88.9, 8989.0], [89.0, 9013.0], [89.1, 9035.0], [89.2, 9057.0], [89.3, 9075.0], [89.4, 9099.0], [89.5, 9119.0], [89.6, 9140.0], [89.7, 9163.0], [89.8, 9182.0], [89.9, 9211.0], [90.0, 9229.0], [90.1, 9247.0], [90.2, 9271.0], [90.3, 9295.0], [90.4, 9317.0], [90.5, 9346.0], [90.6, 9372.0], [90.7, 9394.0], [90.8, 9423.0], [90.9, 9448.0], [91.0, 9470.0], [91.1, 9491.0], [91.2, 9517.0], [91.3, 9545.0], [91.4, 9566.0], [91.5, 9601.0], [91.6, 9628.0], [91.7, 9655.0], [91.8, 9682.0], [91.9, 9711.0], [92.0, 9740.0], [92.1, 9775.0], [92.2, 9809.0], [92.3, 9842.0], [92.4, 9885.0], [92.5, 9910.0], [92.6, 9946.0], [92.7, 9972.0], [92.8, 10003.0], [92.9, 10033.0], [93.0, 10060.0], [93.1, 10098.0], [93.2, 10133.0], [93.3, 10177.0], [93.4, 10213.0], [93.5, 10246.0], [93.6, 10279.0], [93.7, 10320.0], [93.8, 10360.0], [93.9, 10398.0], [94.0, 10421.0], [94.1, 10461.0], [94.2, 10497.0], [94.3, 10541.0], [94.4, 10576.0], [94.5, 10626.0], [94.6, 10672.0], [94.7, 10719.0], [94.8, 10771.0], [94.9, 10834.0], [95.0, 10887.0], [95.1, 10945.0], [95.2, 11013.0], [95.3, 11086.0], [95.4, 11147.0], [95.5, 11205.0], [95.6, 11293.0], [95.7, 11373.0], [95.8, 11461.0], [95.9, 11544.0], [96.0, 11653.0], [96.1, 11759.0], [96.2, 11841.0], [96.3, 11947.0], [96.4, 12075.0], [96.5, 12168.0], [96.6, 12268.0], [96.7, 12377.0], [96.8, 12489.0], [96.9, 12601.0], [97.0, 12708.0], [97.1, 12821.0], [97.2, 12929.0], [97.3, 13032.0], [97.4, 13171.0], [97.5, 13294.0], [97.6, 13448.0], [97.7, 13653.0], [97.8, 13849.0], [97.9, 14097.0], [98.0, 14282.0], [98.1, 14560.0], [98.2, 14820.0], [98.3, 15050.0], [98.4, 15291.0], [98.5, 15546.0], [98.6, 15794.0], [98.7, 16012.0], [98.8, 16231.0], [98.9, 16469.0], [99.0, 16622.0], [99.1, 16851.0], [99.2, 17076.0], [99.3, 17328.0], [99.4, 17582.0], [99.5, 17905.0], [99.6, 18368.0], [99.7, 19252.0], [99.8, 24380.0], [99.9, 30094.0], [100.0, 67689.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
        getOptions: function() {
            return {
                series: {
                    points: { show: false }
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentiles'
                },
                xaxis: {
                    tickDecimals: 1,
                    axisLabel: "Percentiles",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Percentile value in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : %x.2 percentile was %y ms"
                },
                selection: { mode: "xy" },
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentiles"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesPercentiles"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesPercentiles"), dataset, prepareOverviewOptions(options));
        }
};

// Response times percentiles
function refreshResponseTimePercentiles() {
    var infos = responseTimePercentilesInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimesPercentiles"))){
        infos.createGraph();
    } else {
        var choiceContainer = $("#choicesResponseTimePercentiles");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesPercentiles", "#overviewResponseTimesPercentiles");
        $('#bodyResponseTimePercentiles .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimeDistributionInfos = {
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 2922.0, "series": [{"data": [[0.0, 2694.0], [100.0, 470.0], [36100.0, 1.0], [38500.0, 1.0], [37700.0, 1.0], [46900.0, 1.0], [200.0, 2641.0], [300.0, 2922.0], [400.0, 1654.0], [500.0, 986.0], [600.0, 762.0], [700.0, 650.0], [800.0, 589.0], [900.0, 507.0], [1000.0, 403.0], [1100.0, 431.0], [1200.0, 424.0], [1300.0, 418.0], [1400.0, 441.0], [1500.0, 467.0], [1600.0, 458.0], [1700.0, 534.0], [1800.0, 568.0], [1900.0, 564.0], [2000.0, 600.0], [2100.0, 672.0], [2200.0, 672.0], [2300.0, 699.0], [2400.0, 676.0], [2500.0, 736.0], [2600.0, 726.0], [2800.0, 728.0], [2700.0, 735.0], [2900.0, 691.0], [3000.0, 715.0], [3100.0, 672.0], [3200.0, 649.0], [3300.0, 642.0], [3400.0, 594.0], [3500.0, 536.0], [3600.0, 531.0], [3700.0, 515.0], [3800.0, 478.0], [3900.0, 455.0], [4000.0, 461.0], [4100.0, 450.0], [4300.0, 446.0], [4200.0, 410.0], [4600.0, 381.0], [4400.0, 407.0], [4500.0, 386.0], [4800.0, 334.0], [4700.0, 335.0], [5000.0, 323.0], [4900.0, 327.0], [5100.0, 302.0], [5200.0, 305.0], [5300.0, 289.0], [5500.0, 328.0], [5400.0, 291.0], [5600.0, 311.0], [5800.0, 286.0], [5700.0, 303.0], [6000.0, 271.0], [5900.0, 332.0], [6100.0, 273.0], [6200.0, 288.0], [6300.0, 273.0], [6400.0, 239.0], [6500.0, 254.0], [6600.0, 269.0], [6900.0, 234.0], [6800.0, 245.0], [6700.0, 221.0], [7000.0, 238.0], [7100.0, 232.0], [7400.0, 234.0], [7300.0, 181.0], [7200.0, 231.0], [7500.0, 208.0], [7600.0, 237.0], [7700.0, 231.0], [7900.0, 226.0], [7800.0, 237.0], [8000.0, 213.0], [8100.0, 211.0], [8700.0, 228.0], [8500.0, 231.0], [8400.0, 206.0], [8600.0, 230.0], [8300.0, 219.0], [8200.0, 209.0], [8800.0, 263.0], [9200.0, 231.0], [9000.0, 228.0], [8900.0, 232.0], [9100.0, 237.0], [9400.0, 208.0], [9300.0, 207.0], [9500.0, 184.0], [9600.0, 183.0], [9700.0, 162.0], [9900.0, 174.0], [10000.0, 164.0], [9800.0, 137.0], [10100.0, 133.0], [10200.0, 150.0], [10400.0, 152.0], [10300.0, 128.0], [10600.0, 101.0], [10500.0, 123.0], [10700.0, 99.0], [10800.0, 92.0], [10900.0, 76.0], [11000.0, 78.0], [11100.0, 88.0], [11200.0, 58.0], [11700.0, 51.0], [11300.0, 65.0], [11500.0, 60.0], [11600.0, 45.0], [11400.0, 55.0], [12000.0, 46.0], [12100.0, 44.0], [11900.0, 55.0], [11800.0, 50.0], [12200.0, 52.0], [12400.0, 48.0], [12500.0, 46.0], [12300.0, 40.0], [12600.0, 49.0], [12700.0, 46.0], [13100.0, 40.0], [13000.0, 44.0], [12900.0, 41.0], [12800.0, 47.0], [13300.0, 33.0], [13200.0, 42.0], [13600.0, 23.0], [13700.0, 26.0], [13500.0, 29.0], [13400.0, 30.0], [13800.0, 21.0], [14100.0, 31.0], [14000.0, 21.0], [14200.0, 20.0], [14300.0, 19.0], [13900.0, 21.0], [14800.0, 23.0], [14500.0, 20.0], [14400.0, 19.0], [14700.0, 17.0], [14600.0, 19.0], [14900.0, 26.0], [15000.0, 21.0], [15100.0, 25.0], [15300.0, 16.0], [15200.0, 16.0], [15600.0, 20.0], [15500.0, 21.0], [15800.0, 25.0], [15400.0, 22.0], [15700.0, 22.0], [15900.0, 23.0], [16100.0, 25.0], [16200.0, 25.0], [16000.0, 25.0], [16300.0, 16.0], [17200.0, 18.0], [16400.0, 18.0], [16600.0, 25.0], [17400.0, 22.0], [16800.0, 21.0], [17000.0, 29.0], [17600.0, 15.0], [17800.0, 15.0], [18000.0, 12.0], [18200.0, 8.0], [18400.0, 9.0], [18600.0, 7.0], [19400.0, 4.0], [19200.0, 4.0], [18800.0, 3.0], [19000.0, 4.0], [20000.0, 1.0], [20200.0, 2.0], [19800.0, 1.0], [19600.0, 2.0], [20800.0, 2.0], [21400.0, 1.0], [22000.0, 1.0], [21800.0, 1.0], [22600.0, 1.0], [23200.0, 2.0], [23600.0, 1.0], [25000.0, 2.0], [24800.0, 1.0], [24600.0, 1.0], [25600.0, 2.0], [26600.0, 1.0], [26000.0, 1.0], [27000.0, 2.0], [27400.0, 1.0], [27200.0, 2.0], [27800.0, 2.0], [28000.0, 1.0], [29200.0, 2.0], [29400.0, 2.0], [29600.0, 2.0], [28800.0, 1.0], [30200.0, 13.0], [30400.0, 5.0], [30000.0, 3.0], [29800.0, 1.0], [33600.0, 1.0], [36400.0, 1.0], [33500.0, 1.0], [34300.0, 1.0], [38300.0, 1.0], [37500.0, 1.0], [47500.0, 2.0], [16500.0, 39.0], [16900.0, 21.0], [17300.0, 16.0], [16700.0, 21.0], [17100.0, 20.0], [17700.0, 17.0], [18100.0, 11.0], [18300.0, 9.0], [17900.0, 14.0], [17500.0, 21.0], [18900.0, 7.0], [18500.0, 7.0], [19100.0, 5.0], [19300.0, 7.0], [18700.0, 5.0], [19700.0, 3.0], [19500.0, 5.0], [19900.0, 1.0], [20700.0, 1.0], [21300.0, 1.0], [22500.0, 4.0], [22300.0, 1.0], [23300.0, 2.0], [23500.0, 1.0], [23900.0, 1.0], [24300.0, 2.0], [24500.0, 1.0], [24100.0, 1.0], [24700.0, 2.0], [24900.0, 1.0], [25700.0, 2.0], [25900.0, 1.0], [27500.0, 2.0], [27100.0, 2.0], [28100.0, 1.0], [29300.0, 2.0], [29500.0, 2.0], [28700.0, 3.0], [28900.0, 1.0], [29100.0, 1.0], [30100.0, 4.0], [29700.0, 1.0], [30300.0, 11.0], [30500.0, 1.0], [29900.0, 2.0], [39000.0, 1.0], [46200.0, 1.0], [47800.0, 1.0], [47400.0, 1.0], [67600.0, 1.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 67600.0, "title": "Response Time Distribution"}},
        getOptions: function() {
            var granularity = this.data.result.granularity;
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    barWidth: this.data.result.granularity
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " responses for " + label + " were between " + xval + " and " + (xval + granularity) + " ms";
                    }
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimeDistribution"), prepareData(data.result.series, $("#choicesResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshResponseTimeDistribution() {
    var infos = responseTimeDistributionInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var syntheticResponseTimeDistributionInfos = {
        data: {"result": {"minY": 4643.0, "minX": 0.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 29549.0, "series": [{"data": [[1.0, 4643.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 8616.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[0.0, 8201.0]], "isOverall": false, "label": "Requests having \nresponse time <= 500ms", "isController": false}, {"data": [[2.0, 29549.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
        getOptions: function() {
            return {
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendSyntheticResponseTimeDistribution'
                },
                xaxis:{
                    axisLabel: "Response times ranges",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                    tickLength:0,
                    min:-0.5,
                    max:3.5
                },
                yaxis: {
                    axisLabel: "Number of responses",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                bars : {
                    show: true,
                    align: "center",
                    barWidth: 0.25,
                    fill:.75
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: function(label, xval, yval, flotItem){
                        return yval + " " + label;
                    }
                },
                colors: ["#9ACD32", "yellow", "orange", "#FF6347"]                
            };
        },
        createGraph: function() {
            var data = this.data;
            var options = this.getOptions();
            prepareOptions(options, data);
            options.xaxis.ticks = data.result.ticks;
            $.plot($("#flotSyntheticResponseTimeDistribution"), prepareData(data.result.series, $("#choicesSyntheticResponseTimeDistribution")), options);
        }

};

// Response time distribution
function refreshSyntheticResponseTimeDistribution() {
    var infos = syntheticResponseTimeDistributionInfos;
    prepareSeries(infos.data, true);
    if (isGraph($("#flotSyntheticResponseTimeDistribution"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        $('#footerSyntheticResponseTimeDistribution .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var activeThreadsOverTimeInfos = {
        data: {"result": {"minY": 64.52235213204962, "minX": 1.52601342E12, "maxY": 150.0, "series": [{"data": [[1.5260139E12, 150.0], [1.5260142E12, 150.0], [1.5260145E12, 150.0], [1.52601348E12, 140.60589390962656], [1.52601384E12, 150.0], [1.5260148E12, 139.91456834532397], [1.52601414E12, 150.0], [1.52601444E12, 150.0], [1.52601354E12, 150.0], [1.52601378E12, 150.0], [1.52601474E12, 150.0], [1.52601408E12, 150.0], [1.52601438E12, 150.0], [1.5260136E12, 150.0], [1.52601372E12, 150.0], [1.52601468E12, 150.0], [1.52601402E12, 150.0], [1.52601432E12, 150.0], [1.52601366E12, 150.0], [1.52601462E12, 150.0], [1.52601396E12, 150.0], [1.52601426E12, 150.0], [1.52601456E12, 150.0], [1.52601342E12, 64.52235213204962]], "isOverall": false, "label": "Digisoria Customer", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5260148E12, "title": "Active Threads Over Time"}},
        getOptions: function() {
            return {
                series: {
                    stack: true,
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 6,
                    show: true,
                    container: '#legendActiveThreadsOverTime'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                selection: {
                    mode: 'xy'
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : At %x there were %y active threads"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesActiveThreadsOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotActiveThreadsOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewActiveThreadsOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Active Threads Over Time
function refreshActiveThreadsOverTime(fixTimestamps) {
    var infos = activeThreadsOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotActiveThreadsOverTime"))) {
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesActiveThreadsOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotActiveThreadsOverTime", "#overviewActiveThreadsOverTime");
        $('#footerActiveThreadsOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var timeVsThreadsInfos = {
        data: {"result": {"minY": 242.5625, "minX": 2.0, "maxY": 36422.0, "series": [{"data": [[2.0, 36422.0], [3.0, 5662.0], [4.0, 1686.0], [5.0, 1398.5], [6.0, 1242.142857142857], [7.0, 304.4], [8.0, 413.49999999999994], [9.0, 740.4375], [10.0, 242.5625], [11.0, 379.375], [12.0, 273.3157894736842], [13.0, 537.2777777777778], [14.0, 742.2941176470588], [15.0, 315.2631578947368], [16.0, 440.6666666666667], [17.0, 1341.3181818181818], [18.0, 268.75], [19.0, 464.87999999999994], [20.0, 431.6842105263157], [21.0, 551.076923076923], [22.0, 530.421052631579], [23.0, 700.0799999999999], [24.0, 809.2916666666666], [25.0, 377.64], [26.0, 624.2608695652174], [27.0, 643.0769230769231], [28.0, 592.0869565217391], [29.0, 595.8461538461538], [30.0, 486.6538461538462], [31.0, 387.3809523809524], [32.0, 773.125], [33.0, 404.90909090909093], [34.0, 436.76190476190476], [35.0, 741.5526315789474], [36.0, 621.8695652173913], [37.0, 457.3333333333334], [38.0, 781.2068965517242], [39.0, 1338.75], [40.0, 629.4399999999999], [41.0, 304.75], [42.0, 1508.3888888888891], [43.0, 787.0], [44.0, 730.8148148148149], [45.0, 378.04761904761904], [46.0, 773.3870967741935], [47.0, 939.5945945945947], [48.0, 337.1818181818182], [49.0, 757.25], [50.0, 886.7037037037036], [51.0, 925.3428571428574], [52.0, 861.3461538461538], [53.0, 643.1923076923076], [54.0, 907.9032258064516], [55.0, 983.1818181818182], [56.0, 1297.8965517241377], [57.0, 577.625], [58.0, 773.0714285714284], [59.0, 965.9629629629629], [60.0, 992.8378378378379], [61.0, 1069.46875], [62.0, 849.2592592592591], [63.0, 1475.8000000000002], [64.0, 365.0571428571428], [65.0, 790.8000000000001], [66.0, 1020.470588235294], [67.0, 835.310344827586], [68.0, 1209.59375], [69.0, 1023.2941176470587], [70.0, 577.4230769230768], [71.0, 1079.4482758620688], [72.0, 1029.3235294117649], [73.0, 719.0666666666666], [74.0, 1115.9696969696968], [75.0, 1148.7352941176468], [76.0, 983.6896551724137], [77.0, 898.1153846153848], [78.0, 1651.1515151515155], [79.0, 931.3225806451613], [80.0, 1192.4285714285713], [81.0, 1264.8], [82.0, 992.2727272727273], [83.0, 1008.9696969696968], [84.0, 784.896551724138], [85.0, 854.8620689655173], [86.0, 925.2499999999999], [87.0, 912.2258064516128], [88.0, 1282.3870967741937], [89.0, 1377.4250000000002], [90.0, 1190.3999999999996], [91.0, 1018.9032258064512], [92.0, 1213.6470588235293], [93.0, 989.09375], [94.0, 505.7307692307692], [95.0, 1649.7272727272727], [96.0, 1222.0857142857142], [97.0, 1380.891891891892], [98.0, 1218.2058823529412], [99.0, 1491.1891891891894], [100.0, 1654.9090909090905], [101.0, 813.4642857142856], [102.0, 1187.9032258064515], [103.0, 1369.4166666666667], [104.0, 1308.1764705882354], [105.0, 1501.2564102564102], [106.0, 1045.5], [107.0, 1070.4687499999998], [108.0, 1359.1176470588236], [109.0, 1358.4117647058827], [110.0, 760.7777777777777], [111.0, 1446.0294117647056], [112.0, 1488.6111111111113], [113.0, 1319.0555555555557], [114.0, 1375.1891891891894], [115.0, 1499.9428571428573], [116.0, 990.354838709677], [117.0, 1829.5897435897432], [118.0, 1586.5526315789473], [119.0, 1292.970588235294], [120.0, 254.92000000000004], [121.0, 1452.5428571428577], [122.0, 1735.65], [123.0, 928.0333333333336], [124.0, 1962.0500000000002], [125.0, 1534.861111111111], [126.0, 789.0714285714286], [127.0, 1604.7777777777776], [128.0, 2456.6279069767443], [129.0, 1202.4062499999998], [130.0, 1237.5151515151515], [131.0, 1209.3636363636365], [132.0, 1502.3055555555557], [133.0, 2339.2142857142853], [134.0, 2036.4210526315785], [135.0, 898.3333333333333], [136.0, 1772.8947368421052], [137.0, 1361.5263157894735], [138.0, 1318.2352941176468], [139.0, 659.4285714285714], [140.0, 1877.8333333333333], [141.0, 1010.1290322580642], [142.0, 2410.7799999999997], [143.0, 1787.4102564102566], [144.0, 1868.7878787878788], [145.0, 2158.222222222222], [146.0, 1380.617647058823], [147.0, 1824.0526315789473], [148.0, 1689.945945945946], [149.0, 1220.060606060606], [150.0, 4269.290262453139]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}, {"data": [[144.43839322472596, 4003.290478150906]], "isOverall": false, "label": "Digisoria Shopfront 132-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 150.0, "title": "Time VS Threads"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    axisLabel: "Number of active threads",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response times in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: { noColumns: 2,show: true, container: '#legendTimeVsThreads' },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s: At %x.2 active threads, Average response time was %y.2 ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesTimeVsThreads"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotTimesVsThreads"), dataset, options);
            // setup overview
            $.plot($("#overviewTimesVsThreads"), dataset, prepareOverviewOptions(options));
        }
};

// Time vs threads
function refreshTimeVsThreads(){
    var infos = timeVsThreadsInfos;
    prepareSeries(infos.data);
    if(isGraph($("#flotTimesVsThreads"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTimeVsThreads");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTimesVsThreads", "#overviewTimesVsThreads");
        $('#footerTimeVsThreads .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var bytesThroughputOverTimeInfos = {
        data : {"result": {"minY": 12415.433333333332, "minX": 1.52601342E12, "maxY": 550122.9166666666, "series": [{"data": [[1.5260139E12, 291864.51666666666], [1.5260142E12, 325711.93333333335], [1.5260145E12, 461058.0333333333], [1.52601348E12, 460614.31666666665], [1.52601384E12, 287694.36666666664], [1.5260148E12, 99405.78333333334], [1.52601414E12, 392277.1666666667], [1.52601444E12, 469920.01666666666], [1.52601354E12, 295871.45], [1.52601378E12, 242114.31666666668], [1.52601474E12, 302209.25], [1.52601408E12, 365127.05], [1.52601438E12, 374775.7166666667], [1.5260136E12, 294274.8333333333], [1.52601372E12, 270962.76666666666], [1.52601468E12, 334379.2], [1.52601402E12, 298447.2], [1.52601432E12, 402787.7166666667], [1.52601366E12, 301786.63333333336], [1.52601462E12, 316052.18333333335], [1.52601396E12, 316301.23333333334], [1.52601426E12, 273576.9166666667], [1.52601456E12, 420714.51666666666], [1.52601342E12, 550122.9166666666]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.5260139E12, 19968.833333333332], [1.5260142E12, 24903.033333333333], [1.5260145E12, 47390.3], [1.52601348E12, 32468.95], [1.52601384E12, 19676.466666666667], [1.5260148E12, 12415.433333333332], [1.52601414E12, 33928.8], [1.52601444E12, 39479.3], [1.52601354E12, 20887.1], [1.52601378E12, 17173.833333333332], [1.52601474E12, 27425.7], [1.52601408E12, 34922.5], [1.52601438E12, 28323.866666666665], [1.5260136E12, 21015.2], [1.52601372E12, 18613.066666666666], [1.52601468E12, 27475.966666666667], [1.52601402E12, 23788.033333333333], [1.52601432E12, 30097.133333333335], [1.52601366E12, 20874.5], [1.52601462E12, 27480.3], [1.52601396E12, 22906.133333333335], [1.52601426E12, 23870.8], [1.52601456E12, 43195.666666666664], [1.52601342E12, 36398.11666666667]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5260148E12, "title": "Bytes Throughput Over Time"}},
        getOptions : function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity) ,
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Bytes / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendBytesThroughputOverTime'
                },
                selection: {
                    mode: "xy"
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y"
                }
            };
        },
        createGraph : function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesBytesThroughputOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotBytesThroughputOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewBytesThroughputOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Bytes throughput Over Time
function refreshBytesThroughputOverTime(fixTimestamps) {
    var infos = bytesThroughputOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotBytesThroughputOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesBytesThroughputOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotBytesThroughputOverTime", "#overviewBytesThroughputOverTime");
        $('#footerBytesThroughputOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var responseTimesOverTimeInfos = {
        data: {"result": {"minY": 796.0894085281975, "minX": 1.52601342E12, "maxY": 7179.950413223137, "series": [{"data": [[1.5260139E12, 5746.233204134365], [1.5260142E12, 3929.4445595854877], [1.5260145E12, 2483.786550503675], [1.52601348E12, 3327.337131630646], [1.52601384E12, 5870.8131147540935], [1.5260148E12, 4344.587230215825], [1.52601414E12, 3388.0961977186266], [1.52601444E12, 2917.926797385618], [1.52601354E12, 5552.203829524397], [1.52601378E12, 7179.950413223137], [1.52601474E12, 4243.669332079011], [1.52601408E12, 3347.3036571850757], [1.52601438E12, 4154.652391799535], [1.5260136E12, 5419.750767341935], [1.52601372E12, 5823.582813582807], [1.52601468E12, 4188.4079812206655], [1.52601402E12, 4945.096529284173], [1.52601432E12, 3937.631375910847], [1.52601366E12, 5610.629789864038], [1.52601462E12, 4216.545070422526], [1.52601396E12, 5243.667042253507], [1.52601426E12, 5488.161621621621], [1.52601456E12, 2529.3545400238922], [1.52601342E12, 796.0894085281975]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5260148E12, "title": "Response Time Over Time"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average response time was %y ms"
                }
            };
        },
        createGraph: function() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Times Over Time
function refreshResponseTimeOverTime(fixTimestamps) {
    var infos = responseTimesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimesOverTime"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesResponseTimesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimesOverTime", "#overviewResponseTimesOverTime");
        $('#footerResponseTimesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var latenciesOverTimeInfos = {
        data: {"result": {"minY": 795.4683631361772, "minX": 1.52601342E12, "maxY": 7179.311044327568, "series": [{"data": [[1.5260139E12, 5744.686046511631], [1.5260142E12, 3928.3875647668433], [1.5260145E12, 2481.720664307107], [1.52601348E12, 3326.4113948919494], [1.52601384E12, 5869.712131147535], [1.5260148E12, 3590.853417266189], [1.52601414E12, 3386.686311787073], [1.52601444E12, 2917.158496732022], [1.52601354E12, 5551.022235948114], [1.52601378E12, 7179.311044327568], [1.52601474E12, 4242.428033866418], [1.52601408E12, 3346.0701884004384], [1.52601438E12, 4153.630068337128], [1.5260136E12, 5417.948434622458], [1.52601372E12, 5822.1732501732395], [1.52601468E12, 4187.465258215965], [1.52601402E12, 4943.972342733188], [1.52601432E12, 3936.675525075011], [1.52601366E12, 5609.017923362182], [1.52601462E12, 4215.8816901408445], [1.52601396E12, 5242.527887323939], [1.52601426E12, 5487.519459459467], [1.52601456E12, 2528.511947431305], [1.52601342E12, 795.4683631361772]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5260148E12, "title": "Latencies Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average response latencies in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendLatenciesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average latency was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesLatenciesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotLatenciesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewLatenciesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Latencies Over Time
function refreshLatenciesOverTime(fixTimestamps) {
    var infos = latenciesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotLatenciesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesLatenciesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotLatenciesOverTime", "#overviewLatenciesOverTime");
        $('#footerLatenciesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var connectTimeOverTimeInfos = {
        data: {"result": {"minY": 19.612448418156816, "minX": 1.52601342E12, "maxY": 76.92385620915026, "series": [{"data": [[1.5260139E12, 53.49547803617574], [1.5260142E12, 49.5870466321243], [1.5260145E12, 60.62700789545335], [1.52601348E12, 44.0671905697446], [1.52601384E12, 61.100327868852496], [1.5260148E12, 22.293165467625908], [1.52601414E12, 58.17680608365017], [1.52601444E12, 76.92385620915026], [1.52601354E12, 65.76590487955534], [1.52601378E12, 46.2779864763336], [1.52601474E12, 27.444496707431767], [1.52601408E12, 63.105282600665085], [1.52601438E12, 59.82915717539856], [1.5260136E12, 65.4162062615102], [1.52601372E12, 53.616077616077625], [1.52601468E12, 27.606103286384958], [1.52601402E12, 62.49728850325367], [1.52601432E12, 53.281611658808416], [1.52601366E12, 56.54140914709514], [1.52601462E12, 32.39530516431934], [1.52601396E12, 55.745915492957806], [1.52601426E12, 36.68324324324326], [1.52601456E12, 53.33691756272395], [1.52601342E12, 19.612448418156816]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5260148E12, "title": "Connect Time Over Time"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getConnectTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Average Connect Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendConnectTimeOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Average connect time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesConnectTimeOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotConnectTimeOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewConnectTimeOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Connect Time Over Time
function refreshConnectTimeOverTime(fixTimestamps) {
    var infos = connectTimeOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotConnectTimeOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesConnectTimeOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotConnectTimeOverTime", "#overviewConnectTimeOverTime");
        $('#footerConnectTimeOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var responseTimePercentilesOverTimeInfos = {
        data: {"result": {"minY": 4.0, "minX": 1.52601342E12, "maxY": 67689.0, "series": [{"data": [[1.5260139E12, 12160.0], [1.5260142E12, 17965.0], [1.5260145E12, 10831.0], [1.52601348E12, 9498.0], [1.52601384E12, 12739.0], [1.5260148E12, 29916.0], [1.52601414E12, 8106.0], [1.52601444E12, 11664.0], [1.52601354E12, 10628.0], [1.52601378E12, 20221.0], [1.52601474E12, 18017.0], [1.52601408E12, 33520.0], [1.52601438E12, 8868.0], [1.5260136E12, 9429.0], [1.52601372E12, 19436.0], [1.52601468E12, 15149.0], [1.52601402E12, 8684.0], [1.52601432E12, 11395.0], [1.52601366E12, 10899.0], [1.52601462E12, 37506.0], [1.52601396E12, 12213.0], [1.52601426E12, 67689.0], [1.52601456E12, 30327.0], [1.52601342E12, 5094.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.5260139E12, 788.0], [1.5260142E12, 237.0], [1.5260145E12, 306.0], [1.52601348E12, 4.0], [1.52601384E12, 990.0], [1.5260148E12, 236.0], [1.52601414E12, 413.0], [1.52601444E12, 251.0], [1.52601354E12, 1188.0], [1.52601378E12, 241.0], [1.52601474E12, 229.0], [1.52601408E12, 660.0], [1.52601438E12, 245.0], [1.5260136E12, 1371.0], [1.52601372E12, 239.0], [1.52601468E12, 229.0], [1.52601402E12, 325.0], [1.52601432E12, 256.0], [1.52601366E12, 951.0], [1.52601462E12, 229.0], [1.52601396E12, 277.0], [1.52601426E12, 231.0], [1.52601456E12, 232.0], [1.52601342E12, 4.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.5260139E12, 9568.0], [1.5260142E12, 9603.0], [1.5260145E12, 8105.700000000004], [1.52601348E12, 5789.0], [1.52601384E12, 9318.2], [1.5260148E12, 9657.800000000003], [1.52601414E12, 9498.0], [1.52601444E12, 9412.600000000006], [1.52601354E12, 7569.0], [1.52601378E12, 8971.600000000002], [1.52601474E12, 9413.500000000007], [1.52601408E12, 9498.0], [1.52601438E12, 9962.600000000006], [1.5260136E12, 7790.0], [1.52601372E12, 8704.0], [1.52601468E12, 8812.700000000004], [1.52601402E12, 9564.0], [1.52601432E12, 10017.0], [1.52601366E12, 8369.1], [1.52601462E12, 7787.800000000003], [1.52601396E12, 9691.5], [1.52601426E12, 9892.900000000001], [1.52601456E12, 6892.800000000003], [1.52601342E12, 2909.3999999999996]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.5260139E12, 17197.009999999995], [1.5260142E12, 17001.920000000013], [1.5260145E12, 15976.920000000013], [1.52601348E12, 7994.849999999997], [1.52601384E12, 17348.96], [1.5260148E12, 16793.0], [1.52601414E12, 16947.94000000001], [1.52601444E12, 16058.910000000014], [1.52601354E12, 9153.25], [1.52601378E12, 17469.65], [1.52601474E12, 16094.94000000001], [1.52601408E12, 16947.94000000001], [1.52601438E12, 17701.960000000006], [1.5260136E12, 9092.349999999988], [1.52601372E12, 11998.929999999984], [1.52601468E12, 16079.0], [1.52601402E12, 16999.51999999999], [1.52601432E12, 17701.960000000006], [1.52601366E12, 9870.050000000003], [1.52601462E12, 16079.0], [1.52601396E12, 17079.5], [1.52601426E12, 17701.960000000006], [1.52601456E12, 16032.44000000009], [1.52601342E12, 4061.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.5260139E12, 10539.799999999996], [1.5260142E12, 10609.95], [1.5260145E12, 10051.0], [1.52601348E12, 6864.75], [1.52601384E12, 10328.599999999999], [1.5260148E12, 12271.0], [1.52601414E12, 10458.850000000002], [1.52601444E12, 10422.0], [1.52601354E12, 8232.0], [1.52601378E12, 10006.599999999999], [1.52601474E12, 11977.95], [1.52601408E12, 10458.850000000002], [1.52601438E12, 11261.900000000001], [1.5260136E12, 8311.0], [1.52601372E12, 9350.449999999999], [1.52601468E12, 11017.95], [1.52601402E12, 10516.800000000003], [1.52601432E12, 11261.900000000001], [1.52601366E12, 8974.05], [1.52601462E12, 9967.95], [1.52601396E12, 10638.0], [1.52601426E12, 11227.95], [1.52601456E12, 8867.900000000001], [1.52601342E12, 3380.0999999999995]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5260148E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true,
                        fill: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Response Time in ms",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: '#legendResponseTimePercentilesOverTime'
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s : at %x Response time was %y ms"
                }
            };
        },
        createGraph: function () {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesResponseTimePercentilesOverTime"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotResponseTimePercentilesOverTime"), dataset, options);
            // setup overview
            $.plot($("#overviewResponseTimePercentilesOverTime"), dataset, prepareOverviewOptions(options));
        }
};

// Response Time Percentiles Over Time
function refreshResponseTimePercentilesOverTime(fixTimestamps) {
    var infos = responseTimePercentilesOverTimeInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotResponseTimePercentilesOverTime"))) {
        infos.createGraph();
    }else {
        var choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimePercentilesOverTime", "#overviewResponseTimePercentilesOverTime");
        $('#footerResponseTimePercentilesOverTime .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var responseTimeVsRequestInfos = {
    data: {"result": {"minY": 10.0, "minX": 18.0, "maxY": 7898.0, "series": [{"data": [[32.0, 2763.0], [35.0, 441.0], [36.0, 4759.0], [38.0, 2504.0], [42.0, 3746.5], [43.0, 3094.5], [45.0, 3515.0], [48.0, 10.0], [51.0, 3105.0], [55.0, 2603.0], [61.0, 2469.0], [18.0, 726.0], [22.0, 5398.0], [24.0, 4073.5], [25.0, 3595.0], [26.0, 4408.0], [27.0, 4815.5], [29.0, 5141.5], [30.0, 4812.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[32.0, 2008.0], [35.0, 287.0], [36.0, 4011.0], [38.0, 3124.0], [42.0, 4762.0], [43.0, 2893.5], [45.0, 3185.0], [51.0, 2867.0], [55.0, 2384.0], [61.0, 2212.0], [18.0, 346.5], [22.0, 4698.0], [24.0, 7898.0], [25.0, 1649.0], [26.0, 7040.0], [27.0, 4072.0], [29.0, 4156.0], [30.0, 3771.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 61.0, "title": "Response Time Vs Request"}},
    getOptions: function() {
        return {
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Response Time in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: {
                noColumns: 2,
                show: true,
                container: '#legendResponseTimeVsRequest'
            },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesResponseTimeVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotResponseTimeVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewResponseTimeVsRequest"), dataset, prepareOverviewOptions(options));

    }
};

// Response Time vs Request
function refreshResponseTimeVsRequest() {
    var infos = responseTimeVsRequestInfos;
    prepareSeries(infos.data);
    if (isGraph($("#flotResponseTimeVsRequest"))){
        infos.create();
    }else{
        var choiceContainer = $("#choicesResponseTimeVsRequest");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotResponseTimeVsRequest", "#overviewResponseTimeVsRequest");
        $('#footerResponseRimeVsRequest .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};


var latenciesVsRequestInfos = {
    data: {"result": {"minY": 10.0, "minX": 18.0, "maxY": 7897.0, "series": [{"data": [[32.0, 2763.0], [35.0, 440.0], [36.0, 4759.0], [38.0, 2504.0], [42.0, 3746.5], [43.0, 3094.5], [45.0, 3509.0], [48.0, 10.0], [51.0, 3105.0], [55.0, 2602.0], [61.0, 2469.0], [18.0, 726.0], [22.0, 5397.0], [24.0, 4073.5], [25.0, 3595.0], [26.0, 4407.5], [27.0, 4812.0], [29.0, 5141.5], [30.0, 4811.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[32.0, 2008.0], [35.0, 287.0], [36.0, 4011.0], [38.0, 3124.0], [42.0, 4762.0], [43.0, 2893.5], [45.0, 3185.0], [51.0, 2867.0], [55.0, 2384.0], [61.0, 2211.0], [18.0, 246.5], [22.0, 4698.0], [24.0, 7897.0], [25.0, 1648.0], [26.0, 7040.0], [27.0, 4072.0], [29.0, 4156.0], [30.0, 3771.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 61.0, "title": "Latencies Vs Request"}},
    getOptions: function() {
        return{
            series: {
                lines: {
                    show: false
                },
                points: {
                    show: true
                }
            },
            xaxis: {
                axisLabel: "Global number of requests per second",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            yaxis: {
                axisLabel: "Median Latency in ms",
                axisLabelUseCanvas: true,
                axisLabelFontSizePixels: 12,
                axisLabelFontFamily: 'Verdana, Arial',
                axisLabelPadding: 20,
            },
            legend: { noColumns: 2,show: true, container: '#legendLatencyVsRequest' },
            selection: {
                mode: 'xy'
            },
            grid: {
                hoverable: true // IMPORTANT! this is needed for tooltip to work
            },
            tooltip: true,
            tooltipOpts: {
                content: "%s : Median response time at %x req/s was %y ms"
            },
            colors: ["#9ACD32", "#FF6347"]
        };
    },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesLatencyVsRequest"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotLatenciesVsRequest"), dataset, options);
        // setup overview
        $.plot($("#overviewLatenciesVsRequest"), dataset, prepareOverviewOptions(options));
    }
};

// Latencies vs Request
function refreshLatenciesVsRequest() {
        var infos = latenciesVsRequestInfos;
        prepareSeries(infos.data);
        if(isGraph($("#flotLatenciesVsRequest"))){
            infos.createGraph();
        }else{
            var choiceContainer = $("#choicesLatencyVsRequest");
            createLegend(choiceContainer, infos);
            infos.createGraph();
            setGraphZoomable("#flotLatenciesVsRequest", "#overviewLatenciesVsRequest");
            $('#footerLatenciesVsRequest .legendColorBox > div').each(function(i){
                $(this).clone().prependTo(choiceContainer.find("li").eq(i));
            });
        }
};

var hitsPerSecondInfos = {
        data: {"result": {"minY": 16.033333333333335, "minX": 1.52601342E12, "maxY": 61.21666666666667, "series": [{"data": [[1.5260139E12, 25.8], [1.5260142E12, 32.166666666666664], [1.5260145E12, 61.21666666666667], [1.52601348E12, 43.03333333333333], [1.52601384E12, 25.416666666666668], [1.5260148E12, 16.033333333333335], [1.52601414E12, 43.833333333333336], [1.52601444E12, 51.0], [1.52601354E12, 26.983333333333334], [1.52601378E12, 22.183333333333334], [1.52601474E12, 35.43333333333333], [1.52601408E12, 45.11666666666667], [1.52601438E12, 36.583333333333336], [1.5260136E12, 27.15], [1.52601372E12, 24.05], [1.52601468E12, 35.5], [1.52601402E12, 30.733333333333334], [1.52601432E12, 38.88333333333333], [1.52601366E12, 26.966666666666665], [1.52601462E12, 35.5], [1.52601396E12, 29.583333333333332], [1.52601426E12, 30.833333333333332], [1.52601456E12, 55.8], [1.52601342E12, 50.35]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5260148E12, "title": "Hits Per Second"}},
        getOptions: function() {
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of hits / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendHitsPerSecond"
                },
                selection: {
                    mode : 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y.2 hits/sec"
                }
            };
        },
        createGraph: function createGraph() {
            var data = this.data;
            var dataset = prepareData(data.result.series, $("#choicesHitsPerSecond"));
            var options = this.getOptions();
            prepareOptions(options, data);
            $.plot($("#flotHitsPerSecond"), dataset, options);
            // setup overview
            $.plot($("#overviewHitsPerSecond"), dataset, prepareOverviewOptions(options));
        }
};

// Hits per second
function refreshHitsPerSecond(fixTimestamps) {
    var infos = hitsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if (isGraph($("#flotHitsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesHitsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotHitsPerSecond", "#overviewHitsPerSecond");
        $('#footerHitsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
}

var codesPerSecondInfos = {
        data: {"result": {"minY": 0.06666666666666667, "minX": 1.52601342E12, "maxY": 48.46666666666667, "series": [{"data": [[1.5260139E12, 25.716666666666665], [1.5260142E12, 28.416666666666668], [1.5260145E12, 38.916666666666664], [1.52601348E12, 40.43333333333333], [1.52601384E12, 25.35], [1.5260148E12, 7.433333333333334], [1.52601414E12, 33.8], [1.52601444E12, 40.61666666666667], [1.52601354E12, 26.0], [1.52601378E12, 21.266666666666666], [1.52601474E12, 25.9], [1.52601408E12, 31.1], [1.52601438E12, 32.733333333333334], [1.5260136E12, 25.833333333333332], [1.52601372E12, 23.866666666666667], [1.52601468E12, 28.966666666666665], [1.52601402E12, 25.933333333333334], [1.52601432E12, 35.21666666666667], [1.52601366E12, 26.566666666666666], [1.52601462E12, 27.216666666666665], [1.52601396E12, 27.733333333333334], [1.52601426E12, 23.55], [1.52601456E12, 35.516666666666666], [1.52601342E12, 48.46666666666667]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.5260139E12, 0.08333333333333333], [1.5260142E12, 3.75], [1.5260145E12, 22.3], [1.52601348E12, 1.9833333333333334], [1.52601384E12, 0.06666666666666667], [1.5260148E12, 8.6], [1.52601414E12, 10.033333333333333], [1.52601444E12, 10.383333333333333], [1.52601354E12, 0.9833333333333333], [1.52601378E12, 0.9166666666666666], [1.52601474E12, 9.533333333333333], [1.52601408E12, 14.016666666666667], [1.52601438E12, 3.85], [1.5260136E12, 1.3166666666666667], [1.52601372E12, 0.18333333333333332], [1.52601468E12, 6.533333333333333], [1.52601402E12, 4.8], [1.52601432E12, 3.6666666666666665], [1.52601366E12, 0.4], [1.52601462E12, 8.283333333333333], [1.52601396E12, 1.85], [1.52601426E12, 7.283333333333333], [1.52601456E12, 20.283333333333335]], "isOverall": false, "label": "500", "isController": false}, {"data": [[1.5260148E12, 2.5]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.5260148E12, "title": "Codes Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of responses / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendCodesPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "Number of Response Codes %s at %x was %y.2 responses / sec"
                }
            };
        },
    createGraph: function() {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesCodesPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotCodesPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewCodesPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Codes per second
function refreshCodesPerSecond(fixTimestamps) {
    var infos = codesPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotCodesPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesCodesPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotCodesPerSecond", "#overviewCodesPerSecond");
        $('#footerCodesPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

var transactionsPerSecondInfos = {
        data: {"result": {"minY": 0.06666666666666667, "minX": 1.52601342E12, "maxY": 48.46666666666667, "series": [{"data": [[1.5260139E12, 25.716666666666665], [1.5260142E12, 28.416666666666668], [1.5260145E12, 38.916666666666664], [1.52601348E12, 40.43333333333333], [1.52601384E12, 25.35], [1.5260148E12, 7.433333333333334], [1.52601414E12, 33.8], [1.52601444E12, 40.61666666666667], [1.52601354E12, 26.0], [1.52601378E12, 21.266666666666666], [1.52601474E12, 25.9], [1.52601408E12, 31.1], [1.52601438E12, 32.733333333333334], [1.5260136E12, 25.833333333333332], [1.52601372E12, 23.866666666666667], [1.52601468E12, 28.966666666666665], [1.52601402E12, 25.933333333333334], [1.52601432E12, 35.21666666666667], [1.52601366E12, 26.566666666666666], [1.52601462E12, 27.216666666666665], [1.52601396E12, 27.733333333333334], [1.52601426E12, 23.55], [1.52601456E12, 35.516666666666666], [1.52601342E12, 48.46666666666667]], "isOverall": false, "label": "Digisoria Shopfront 132-success", "isController": false}, {"data": [[1.5260139E12, 0.08333333333333333], [1.5260142E12, 3.75], [1.5260145E12, 22.3], [1.52601348E12, 1.9833333333333334], [1.52601384E12, 0.06666666666666667], [1.5260148E12, 11.1], [1.52601414E12, 10.033333333333333], [1.52601444E12, 10.383333333333333], [1.52601354E12, 0.9833333333333333], [1.52601378E12, 0.9166666666666666], [1.52601474E12, 9.533333333333333], [1.52601408E12, 14.016666666666667], [1.52601438E12, 3.85], [1.5260136E12, 1.3166666666666667], [1.52601372E12, 0.18333333333333332], [1.52601468E12, 6.533333333333333], [1.52601402E12, 4.8], [1.52601432E12, 3.6666666666666665], [1.52601366E12, 0.4], [1.52601462E12, 8.283333333333333], [1.52601396E12, 1.85], [1.52601426E12, 7.283333333333333], [1.52601456E12, 20.283333333333335]], "isOverall": false, "label": "Digisoria Shopfront 132-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.5260148E12, "title": "Transactions Per Second"}},
        getOptions: function(){
            return {
                series: {
                    lines: {
                        show: true
                    },
                    points: {
                        show: true
                    }
                },
                xaxis: {
                    mode: "time",
                    timeformat: "%H:%M:%S",
                    axisLabel: getElapsedTimeLabel(this.data.result.granularity),
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20,
                },
                yaxis: {
                    axisLabel: "Number of transactions / sec",
                    axisLabelUseCanvas: true,
                    axisLabelFontSizePixels: 12,
                    axisLabelFontFamily: 'Verdana, Arial',
                    axisLabelPadding: 20
                },
                legend: {
                    noColumns: 2,
                    show: true,
                    container: "#legendTransactionsPerSecond"
                },
                selection: {
                    mode: 'xy'
                },
                grid: {
                    hoverable: true // IMPORTANT! this is needed for tooltip to
                                    // work
                },
                tooltip: true,
                tooltipOpts: {
                    content: "%s at %x was %y transactions / sec"
                }
            };
        },
    createGraph: function () {
        var data = this.data;
        var dataset = prepareData(data.result.series, $("#choicesTransactionsPerSecond"));
        var options = this.getOptions();
        prepareOptions(options, data);
        $.plot($("#flotTransactionsPerSecond"), dataset, options);
        // setup overview
        $.plot($("#overviewTransactionsPerSecond"), dataset, prepareOverviewOptions(options));
    }
};

// Transactions per second
function refreshTransactionsPerSecond(fixTimestamps) {
    var infos = transactionsPerSecondInfos;
    prepareSeries(infos.data);
    if(fixTimestamps) {
        fixTimeStamps(infos.data.result.series, 28800000);
    }
    if(isGraph($("#flotTransactionsPerSecond"))){
        infos.createGraph();
    }else{
        var choiceContainer = $("#choicesTransactionsPerSecond");
        createLegend(choiceContainer, infos);
        infos.createGraph();
        setGraphZoomable("#flotTransactionsPerSecond", "#overviewTransactionsPerSecond");
        $('#footerTransactionsPerSecond .legendColorBox > div').each(function(i){
            $(this).clone().prependTo(choiceContainer.find("li").eq(i));
        });
    }
};

// Collapse the graph matching the specified DOM element depending the collapsed
// status
function collapse(elem, collapsed){
    if(collapsed){
        $(elem).parent().find(".fa-chevron-up").removeClass("fa-chevron-up").addClass("fa-chevron-down");
    } else {
        $(elem).parent().find(".fa-chevron-down").removeClass("fa-chevron-down").addClass("fa-chevron-up");
        if (elem.id == "bodyBytesThroughputOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshBytesThroughputOverTime(true);
            }
            document.location.href="#bytesThroughputOverTime";
        } else if (elem.id == "bodyLatenciesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesOverTime(true);
            }
            document.location.href="#latenciesOverTime";
        } else if (elem.id == "bodyConnectTimeOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshConnectTimeOverTime(true);
            }
            document.location.href="#connectTimeOverTime";
        } else if (elem.id == "bodyResponseTimePercentilesOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimePercentilesOverTime(true);
            }
            document.location.href="#responseTimePercentilesOverTime";
        } else if (elem.id == "bodyResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeDistribution();
            }
            document.location.href="#responseTimeDistribution" ;
        } else if (elem.id == "bodySyntheticResponseTimeDistribution") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshSyntheticResponseTimeDistribution();
            }
            document.location.href="#syntheticResponseTimeDistribution" ;
        } else if (elem.id == "bodyActiveThreadsOverTime") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshActiveThreadsOverTime(true);
            }
            document.location.href="#activeThreadsOverTime";
        } else if (elem.id == "bodyTimeVsThreads") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTimeVsThreads();
            }
            document.location.href="#timeVsThreads" ;
        } else if (elem.id == "bodyCodesPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshCodesPerSecond(true);
            }
            document.location.href="#codesPerSecond";
        } else if (elem.id == "bodyTransactionsPerSecond") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshTransactionsPerSecond(true);
            }
            document.location.href="#transactionsPerSecond";
        } else if (elem.id == "bodyResponseTimeVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshResponseTimeVsRequest();
            }
            document.location.href="#responseTimeVsRequest";
        } else if (elem.id == "bodyLatenciesVsRequest") {
            if (isGraph($(elem).find('.flot-chart-content')) == false) {
                refreshLatenciesVsRequest();
            }
            document.location.href="#latencyVsRequest";
        }
    }
}

// Collapse
$(function() {
        $('.collapse').on('shown.bs.collapse', function(){
            collapse(this, false);
        }).on('hidden.bs.collapse', function(){
            collapse(this, true);
        });
});

$(function() {
    $(".glyphicon").mousedown( function(event){
        var tmp = $('.in:not(ul)');
        tmp.parent().parent().parent().find(".fa-chevron-up").removeClass("fa-chevron-down").addClass("fa-chevron-down");
        tmp.removeClass("in");
        tmp.addClass("out");
    });
});

/*
 * Activates or deactivates all series of the specified graph (represented by id parameter)
 * depending on checked argument.
 */
function toggleAll(id, checked){
    var placeholder = document.getElementById(id);

    var cases = $(placeholder).find(':checkbox');
    cases.prop('checked', checked);
    $(cases).parent().children().children().toggleClass("legend-disabled", !checked);

    var choiceContainer;
    if ( id == "choicesBytesThroughputOverTime"){
        choiceContainer = $("#choicesBytesThroughputOverTime");
        refreshBytesThroughputOverTime(false);
    } else if(id == "choicesResponseTimesOverTime"){
        choiceContainer = $("#choicesResponseTimesOverTime");
        refreshResponseTimeOverTime(false);
    } else if ( id == "choicesLatenciesOverTime"){
        choiceContainer = $("#choicesLatenciesOverTime");
        refreshLatenciesOverTime(false);
    } else if ( id == "choicesConnectTimeOverTime"){
        choiceContainer = $("#choicesConnectTimeOverTime");
        refreshConnectTimeOverTime(false);
    } else if ( id == "responseTimePercentilesOverTime"){
        choiceContainer = $("#choicesResponseTimePercentilesOverTime");
        refreshResponseTimePercentilesOverTime(false);
    } else if ( id == "choicesResponseTimePercentiles"){
        choiceContainer = $("#choicesResponseTimePercentiles");
        refreshResponseTimePercentiles();
    } else if(id == "choicesActiveThreadsOverTime"){
        choiceContainer = $("#choicesActiveThreadsOverTime");
        refreshActiveThreadsOverTime(false);
    } else if ( id == "choicesTimeVsThreads"){
        choiceContainer = $("#choicesTimeVsThreads");
        refreshTimeVsThreads();
    } else if ( id == "choicesSyntheticResponseTimeDistribution"){
        choiceContainer = $("#choicesSyntheticResponseTimeDistribution");
        refreshSyntheticResponseTimeDistribution();
    } else if ( id == "choicesResponseTimeDistribution"){
        choiceContainer = $("#choicesResponseTimeDistribution");
        refreshResponseTimeDistribution();
    } else if ( id == "choicesHitsPerSecond"){
        choiceContainer = $("#choicesHitsPerSecond");
        refreshHitsPerSecond(false);
    } else if(id == "choicesCodesPerSecond"){
        choiceContainer = $("#choicesCodesPerSecond");
        refreshCodesPerSecond(false);
    } else if ( id == "choicesTransactionsPerSecond"){
        choiceContainer = $("#choicesTransactionsPerSecond");
        refreshTransactionsPerSecond(false);
    } else if ( id == "choicesResponseTimeVsRequest"){
        choiceContainer = $("#choicesResponseTimeVsRequest");
        refreshResponseTimeVsRequest();
    } else if ( id == "choicesLatencyVsRequest"){
        choiceContainer = $("#choicesLatencyVsRequest");
        refreshLatenciesVsRequest();
    }
    var color = checked ? "black" : "#818181";
    choiceContainer.find("label").each(function(){
        this.style.color = color;
    });
}

// Unchecks all boxes for "Hide all samples" functionality
function uncheckAll(id){
    toggleAll(id, false);
}

// Checks all boxes for "Show all samples" functionality
function checkAll(id){
    toggleAll(id, true);
}

// Prepares data to be consumed by plot plugins
function prepareData(series, choiceContainer, customizeSeries){
    var datasets = [];

    // Add only selected series to the data set
    choiceContainer.find("input:checked").each(function (index, item) {
        var key = $(item).attr("name");
        var i = 0;
        var size = series.length;
        while(i < size && series[i].label != key)
            i++;
        if(i < size){
            var currentSeries = series[i];
            datasets.push(currentSeries);
            if(customizeSeries)
                customizeSeries(currentSeries);
        }
    });
    return datasets;
}

/*
 * Ignore case comparator
 */
function sortAlphaCaseless(a,b){
    return a.toLowerCase() > b.toLowerCase() ? 1 : -1;
};

/*
 * Creates a legend in the specified element with graph information
 */
function createLegend(choiceContainer, infos) {
    // Sort series by name
    var keys = [];
    $.each(infos.data.result.series, function(index, series){
        keys.push(series.label);
    });
    keys.sort(sortAlphaCaseless);

    // Create list of series with support of activation/deactivation
    $.each(keys, function(index, key) {
        var id = choiceContainer.attr('id') + index;
        $('<li />')
            .append($('<input id="' + id + '" name="' + key + '" type="checkbox" checked="checked" hidden />'))
            .append($('<label />', { 'text': key , 'for': id }))
            .appendTo(choiceContainer);
    });
    choiceContainer.find("label").click( function(){
        if (this.style.color !== "rgb(129, 129, 129)" ){
            this.style.color="#818181";
        }else {
            this.style.color="black";
        }
        $(this).parent().children().children().toggleClass("legend-disabled");
    });
    choiceContainer.find("label").mousedown( function(event){
        event.preventDefault();
    });
    choiceContainer.find("label").mouseenter(function(){
        this.style.cursor="pointer";
    });

    // Recreate graphe on series activation toggle
    choiceContainer.find("input").click(function(){
        infos.createGraph();
    });
}
