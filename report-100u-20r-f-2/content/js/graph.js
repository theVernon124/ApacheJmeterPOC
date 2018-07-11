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
        data: {"result": {"minY": 39.0, "minX": 0.0, "maxY": 66264.0, "series": [{"data": [[0.0, 39.0], [0.1, 39.0], [0.2, 39.0], [0.3, 39.0], [0.4, 39.0], [0.5, 39.0], [0.6, 40.0], [0.7, 40.0], [0.8, 40.0], [0.9, 40.0], [1.0, 40.0], [1.1, 40.0], [1.2, 40.0], [1.3, 40.0], [1.4, 40.0], [1.5, 40.0], [1.6, 40.0], [1.7, 40.0], [1.8, 41.0], [1.9, 41.0], [2.0, 41.0], [2.1, 41.0], [2.2, 41.0], [2.3, 41.0], [2.4, 41.0], [2.5, 41.0], [2.6, 41.0], [2.7, 41.0], [2.8, 41.0], [2.9, 41.0], [3.0, 41.0], [3.1, 42.0], [3.2, 42.0], [3.3, 42.0], [3.4, 42.0], [3.5, 42.0], [3.6, 42.0], [3.7, 42.0], [3.8, 42.0], [3.9, 42.0], [4.0, 43.0], [4.1, 43.0], [4.2, 43.0], [4.3, 43.0], [4.4, 43.0], [4.5, 43.0], [4.6, 43.0], [4.7, 43.0], [4.8, 43.0], [4.9, 43.0], [5.0, 43.0], [5.1, 43.0], [5.2, 43.0], [5.3, 44.0], [5.4, 44.0], [5.5, 44.0], [5.6, 44.0], [5.7, 44.0], [5.8, 44.0], [5.9, 44.0], [6.0, 44.0], [6.1, 45.0], [6.2, 45.0], [6.3, 45.0], [6.4, 45.0], [6.5, 45.0], [6.6, 45.0], [6.7, 45.0], [6.8, 45.0], [6.9, 46.0], [7.0, 46.0], [7.1, 46.0], [7.2, 46.0], [7.3, 46.0], [7.4, 46.0], [7.5, 46.0], [7.6, 46.0], [7.7, 46.0], [7.8, 47.0], [7.9, 47.0], [8.0, 47.0], [8.1, 47.0], [8.2, 48.0], [8.3, 48.0], [8.4, 48.0], [8.5, 48.0], [8.6, 48.0], [8.7, 48.0], [8.8, 48.0], [8.9, 49.0], [9.0, 49.0], [9.1, 50.0], [9.2, 50.0], [9.3, 50.0], [9.4, 50.0], [9.5, 51.0], [9.6, 53.0], [9.7, 53.0], [9.8, 54.0], [9.9, 55.0], [10.0, 56.0], [10.1, 57.0], [10.2, 58.0], [10.3, 60.0], [10.4, 61.0], [10.5, 62.0], [10.6, 63.0], [10.7, 65.0], [10.8, 65.0], [10.9, 69.0], [11.0, 73.0], [11.1, 73.0], [11.2, 74.0], [11.3, 74.0], [11.4, 75.0], [11.5, 76.0], [11.6, 77.0], [11.7, 78.0], [11.8, 80.0], [11.9, 81.0], [12.0, 84.0], [12.1, 84.0], [12.2, 85.0], [12.3, 86.0], [12.4, 86.0], [12.5, 87.0], [12.6, 89.0], [12.7, 90.0], [12.8, 91.0], [12.9, 95.0], [13.0, 96.0], [13.1, 97.0], [13.2, 97.0], [13.3, 98.0], [13.4, 104.0], [13.5, 106.0], [13.6, 108.0], [13.7, 109.0], [13.8, 112.0], [13.9, 115.0], [14.0, 116.0], [14.1, 116.0], [14.2, 116.0], [14.3, 117.0], [14.4, 118.0], [14.5, 119.0], [14.6, 120.0], [14.7, 121.0], [14.8, 121.0], [14.9, 121.0], [15.0, 123.0], [15.1, 123.0], [15.2, 125.0], [15.3, 126.0], [15.4, 127.0], [15.5, 129.0], [15.6, 129.0], [15.7, 130.0], [15.8, 131.0], [15.9, 132.0], [16.0, 133.0], [16.1, 133.0], [16.2, 134.0], [16.3, 135.0], [16.4, 138.0], [16.5, 139.0], [16.6, 140.0], [16.7, 140.0], [16.8, 141.0], [16.9, 142.0], [17.0, 144.0], [17.1, 144.0], [17.2, 152.0], [17.3, 155.0], [17.4, 156.0], [17.5, 157.0], [17.6, 159.0], [17.7, 161.0], [17.8, 162.0], [17.9, 165.0], [18.0, 166.0], [18.1, 166.0], [18.2, 167.0], [18.3, 168.0], [18.4, 168.0], [18.5, 169.0], [18.6, 170.0], [18.7, 171.0], [18.8, 173.0], [18.9, 174.0], [19.0, 180.0], [19.1, 181.0], [19.2, 183.0], [19.3, 186.0], [19.4, 187.0], [19.5, 187.0], [19.6, 190.0], [19.7, 191.0], [19.8, 194.0], [19.9, 195.0], [20.0, 196.0], [20.1, 198.0], [20.2, 199.0], [20.3, 202.0], [20.4, 206.0], [20.5, 209.0], [20.6, 209.0], [20.7, 210.0], [20.8, 213.0], [20.9, 215.0], [21.0, 218.0], [21.1, 219.0], [21.2, 220.0], [21.3, 221.0], [21.4, 225.0], [21.5, 226.0], [21.6, 227.0], [21.7, 228.0], [21.8, 228.0], [21.9, 230.0], [22.0, 232.0], [22.1, 233.0], [22.2, 235.0], [22.3, 237.0], [22.4, 237.0], [22.5, 240.0], [22.6, 240.0], [22.7, 243.0], [22.8, 243.0], [22.9, 243.0], [23.0, 245.0], [23.1, 246.0], [23.2, 246.0], [23.3, 246.0], [23.4, 246.0], [23.5, 247.0], [23.6, 248.0], [23.7, 249.0], [23.8, 252.0], [23.9, 252.0], [24.0, 252.0], [24.1, 253.0], [24.2, 253.0], [24.3, 254.0], [24.4, 254.0], [24.5, 255.0], [24.6, 255.0], [24.7, 257.0], [24.8, 258.0], [24.9, 259.0], [25.0, 259.0], [25.1, 260.0], [25.2, 261.0], [25.3, 264.0], [25.4, 265.0], [25.5, 267.0], [25.6, 269.0], [25.7, 271.0], [25.8, 274.0], [25.9, 277.0], [26.0, 278.0], [26.1, 278.0], [26.2, 279.0], [26.3, 281.0], [26.4, 282.0], [26.5, 283.0], [26.6, 284.0], [26.7, 285.0], [26.8, 286.0], [26.9, 286.0], [27.0, 287.0], [27.1, 289.0], [27.2, 290.0], [27.3, 292.0], [27.4, 294.0], [27.5, 294.0], [27.6, 294.0], [27.7, 295.0], [27.8, 296.0], [27.9, 298.0], [28.0, 299.0], [28.1, 301.0], [28.2, 301.0], [28.3, 302.0], [28.4, 305.0], [28.5, 308.0], [28.6, 310.0], [28.7, 311.0], [28.8, 312.0], [28.9, 313.0], [29.0, 314.0], [29.1, 315.0], [29.2, 316.0], [29.3, 317.0], [29.4, 317.0], [29.5, 318.0], [29.6, 319.0], [29.7, 320.0], [29.8, 322.0], [29.9, 322.0], [30.0, 325.0], [30.1, 327.0], [30.2, 328.0], [30.3, 330.0], [30.4, 331.0], [30.5, 333.0], [30.6, 336.0], [30.7, 339.0], [30.8, 345.0], [30.9, 348.0], [31.0, 349.0], [31.1, 352.0], [31.2, 353.0], [31.3, 354.0], [31.4, 356.0], [31.5, 357.0], [31.6, 360.0], [31.7, 363.0], [31.8, 364.0], [31.9, 365.0], [32.0, 367.0], [32.1, 369.0], [32.2, 374.0], [32.3, 375.0], [32.4, 379.0], [32.5, 381.0], [32.6, 383.0], [32.7, 392.0], [32.8, 394.0], [32.9, 398.0], [33.0, 402.0], [33.1, 404.0], [33.2, 409.0], [33.3, 417.0], [33.4, 418.0], [33.5, 423.0], [33.6, 431.0], [33.7, 435.0], [33.8, 438.0], [33.9, 452.0], [34.0, 457.0], [34.1, 466.0], [34.2, 468.0], [34.3, 471.0], [34.4, 482.0], [34.5, 486.0], [34.6, 488.0], [34.7, 491.0], [34.8, 492.0], [34.9, 499.0], [35.0, 503.0], [35.1, 507.0], [35.2, 509.0], [35.3, 514.0], [35.4, 519.0], [35.5, 530.0], [35.6, 550.0], [35.7, 561.0], [35.8, 567.0], [35.9, 582.0], [36.0, 591.0], [36.1, 599.0], [36.2, 608.0], [36.3, 611.0], [36.4, 625.0], [36.5, 631.0], [36.6, 635.0], [36.7, 647.0], [36.8, 657.0], [36.9, 661.0], [37.0, 674.0], [37.1, 680.0], [37.2, 690.0], [37.3, 699.0], [37.4, 707.0], [37.5, 725.0], [37.6, 755.0], [37.7, 759.0], [37.8, 785.0], [37.9, 797.0], [38.0, 801.0], [38.1, 811.0], [38.2, 824.0], [38.3, 833.0], [38.4, 845.0], [38.5, 851.0], [38.6, 856.0], [38.7, 874.0], [38.8, 877.0], [38.9, 887.0], [39.0, 890.0], [39.1, 895.0], [39.2, 928.0], [39.3, 931.0], [39.4, 954.0], [39.5, 959.0], [39.6, 964.0], [39.7, 967.0], [39.8, 973.0], [39.9, 978.0], [40.0, 980.0], [40.1, 983.0], [40.2, 993.0], [40.3, 1000.0], [40.4, 1008.0], [40.5, 1020.0], [40.6, 1027.0], [40.7, 1032.0], [40.8, 1037.0], [40.9, 1038.0], [41.0, 1048.0], [41.1, 1055.0], [41.2, 1056.0], [41.3, 1058.0], [41.4, 1059.0], [41.5, 1064.0], [41.6, 1072.0], [41.7, 1075.0], [41.8, 1083.0], [41.9, 1090.0], [42.0, 1097.0], [42.1, 1107.0], [42.2, 1120.0], [42.3, 1121.0], [42.4, 1126.0], [42.5, 1131.0], [42.6, 1143.0], [42.7, 1149.0], [42.8, 1155.0], [42.9, 1161.0], [43.0, 1166.0], [43.1, 1168.0], [43.2, 1172.0], [43.3, 1173.0], [43.4, 1186.0], [43.5, 1190.0], [43.6, 1198.0], [43.7, 1204.0], [43.8, 1212.0], [43.9, 1213.0], [44.0, 1218.0], [44.1, 1226.0], [44.2, 1232.0], [44.3, 1240.0], [44.4, 1251.0], [44.5, 1259.0], [44.6, 1268.0], [44.7, 1271.0], [44.8, 1292.0], [44.9, 1296.0], [45.0, 1302.0], [45.1, 1311.0], [45.2, 1313.0], [45.3, 1321.0], [45.4, 1330.0], [45.5, 1334.0], [45.6, 1336.0], [45.7, 1337.0], [45.8, 1350.0], [45.9, 1353.0], [46.0, 1358.0], [46.1, 1374.0], [46.2, 1377.0], [46.3, 1380.0], [46.4, 1393.0], [46.5, 1394.0], [46.6, 1397.0], [46.7, 1406.0], [46.8, 1411.0], [46.9, 1422.0], [47.0, 1429.0], [47.1, 1439.0], [47.2, 1452.0], [47.3, 1464.0], [47.4, 1465.0], [47.5, 1482.0], [47.6, 1484.0], [47.7, 1510.0], [47.8, 1520.0], [47.9, 1520.0], [48.0, 1533.0], [48.1, 1541.0], [48.2, 1544.0], [48.3, 1552.0], [48.4, 1554.0], [48.5, 1561.0], [48.6, 1564.0], [48.7, 1567.0], [48.8, 1570.0], [48.9, 1577.0], [49.0, 1577.0], [49.1, 1578.0], [49.2, 1580.0], [49.3, 1604.0], [49.4, 1624.0], [49.5, 1625.0], [49.6, 1634.0], [49.7, 1649.0], [49.8, 1650.0], [49.9, 1652.0], [50.0, 1655.0], [50.1, 1657.0], [50.2, 1663.0], [50.3, 1664.0], [50.4, 1669.0], [50.5, 1671.0], [50.6, 1672.0], [50.7, 1675.0], [50.8, 1681.0], [50.9, 1684.0], [51.0, 1689.0], [51.1, 1694.0], [51.2, 1700.0], [51.3, 1702.0], [51.4, 1705.0], [51.5, 1714.0], [51.6, 1717.0], [51.7, 1718.0], [51.8, 1722.0], [51.9, 1731.0], [52.0, 1747.0], [52.1, 1751.0], [52.2, 1758.0], [52.3, 1767.0], [52.4, 1775.0], [52.5, 1778.0], [52.6, 1781.0], [52.7, 1785.0], [52.8, 1786.0], [52.9, 1790.0], [53.0, 1790.0], [53.1, 1794.0], [53.2, 1795.0], [53.3, 1807.0], [53.4, 1813.0], [53.5, 1819.0], [53.6, 1826.0], [53.7, 1830.0], [53.8, 1836.0], [53.9, 1841.0], [54.0, 1842.0], [54.1, 1843.0], [54.2, 1847.0], [54.3, 1856.0], [54.4, 1859.0], [54.5, 1862.0], [54.6, 1866.0], [54.7, 1872.0], [54.8, 1881.0], [54.9, 1882.0], [55.0, 1883.0], [55.1, 1885.0], [55.2, 1893.0], [55.3, 1901.0], [55.4, 1904.0], [55.5, 1909.0], [55.6, 1915.0], [55.7, 1917.0], [55.8, 1921.0], [55.9, 1933.0], [56.0, 1937.0], [56.1, 1943.0], [56.2, 1947.0], [56.3, 1951.0], [56.4, 1958.0], [56.5, 1961.0], [56.6, 1967.0], [56.7, 1977.0], [56.8, 1984.0], [56.9, 1987.0], [57.0, 1990.0], [57.1, 2001.0], [57.2, 2008.0], [57.3, 2011.0], [57.4, 2014.0], [57.5, 2022.0], [57.6, 2024.0], [57.7, 2027.0], [57.8, 2029.0], [57.9, 2031.0], [58.0, 2040.0], [58.1, 2048.0], [58.2, 2054.0], [58.3, 2065.0], [58.4, 2067.0], [58.5, 2079.0], [58.6, 2084.0], [58.7, 2088.0], [58.8, 2092.0], [58.9, 2103.0], [59.0, 2111.0], [59.1, 2115.0], [59.2, 2125.0], [59.3, 2138.0], [59.4, 2141.0], [59.5, 2149.0], [59.6, 2155.0], [59.7, 2158.0], [59.8, 2169.0], [59.9, 2178.0], [60.0, 2185.0], [60.1, 2200.0], [60.2, 2207.0], [60.3, 2212.0], [60.4, 2228.0], [60.5, 2237.0], [60.6, 2242.0], [60.7, 2250.0], [60.8, 2253.0], [60.9, 2262.0], [61.0, 2274.0], [61.1, 2279.0], [61.2, 2286.0], [61.3, 2296.0], [61.4, 2299.0], [61.5, 2307.0], [61.6, 2326.0], [61.7, 2335.0], [61.8, 2361.0], [61.9, 2367.0], [62.0, 2369.0], [62.1, 2374.0], [62.2, 2397.0], [62.3, 2405.0], [62.4, 2407.0], [62.5, 2410.0], [62.6, 2412.0], [62.7, 2414.0], [62.8, 2416.0], [62.9, 2423.0], [63.0, 2428.0], [63.1, 2438.0], [63.2, 2442.0], [63.3, 2448.0], [63.4, 2454.0], [63.5, 2460.0], [63.6, 2471.0], [63.7, 2476.0], [63.8, 2485.0], [63.9, 2515.0], [64.0, 2519.0], [64.1, 2544.0], [64.2, 2554.0], [64.3, 2558.0], [64.4, 2565.0], [64.5, 2586.0], [64.6, 2593.0], [64.7, 2597.0], [64.8, 2609.0], [64.9, 2618.0], [65.0, 2634.0], [65.1, 2663.0], [65.2, 2672.0], [65.3, 2740.0], [65.4, 2747.0], [65.5, 2780.0], [65.6, 2784.0], [65.7, 2793.0], [65.8, 2799.0], [65.9, 2823.0], [66.0, 2828.0], [66.1, 2850.0], [66.2, 2863.0], [66.3, 2868.0], [66.4, 2869.0], [66.5, 2878.0], [66.6, 2894.0], [66.7, 2895.0], [66.8, 2903.0], [66.9, 2952.0], [67.0, 2957.0], [67.1, 2968.0], [67.2, 2982.0], [67.3, 2984.0], [67.4, 2995.0], [67.5, 2997.0], [67.6, 3008.0], [67.7, 3021.0], [67.8, 3027.0], [67.9, 3039.0], [68.0, 3050.0], [68.1, 3055.0], [68.2, 3071.0], [68.3, 3080.0], [68.4, 3088.0], [68.5, 3100.0], [68.6, 3107.0], [68.7, 3122.0], [68.8, 3132.0], [68.9, 3140.0], [69.0, 3162.0], [69.1, 3178.0], [69.2, 3204.0], [69.3, 3214.0], [69.4, 3219.0], [69.5, 3244.0], [69.6, 3249.0], [69.7, 3258.0], [69.8, 3261.0], [69.9, 3262.0], [70.0, 3281.0], [70.1, 3331.0], [70.2, 3334.0], [70.3, 3377.0], [70.4, 3389.0], [70.5, 3406.0], [70.6, 3443.0], [70.7, 3456.0], [70.8, 3470.0], [70.9, 3485.0], [71.0, 3494.0], [71.1, 3506.0], [71.2, 3530.0], [71.3, 3538.0], [71.4, 3557.0], [71.5, 3580.0], [71.6, 3584.0], [71.7, 3625.0], [71.8, 3648.0], [71.9, 3681.0], [72.0, 3702.0], [72.1, 3708.0], [72.2, 3738.0], [72.3, 3751.0], [72.4, 3776.0], [72.5, 3810.0], [72.6, 3865.0], [72.7, 3878.0], [72.8, 3920.0], [72.9, 3957.0], [73.0, 3981.0], [73.1, 3987.0], [73.2, 3992.0], [73.3, 4006.0], [73.4, 4052.0], [73.5, 4067.0], [73.6, 4089.0], [73.7, 4091.0], [73.8, 4116.0], [73.9, 4128.0], [74.0, 4137.0], [74.1, 4156.0], [74.2, 4160.0], [74.3, 4173.0], [74.4, 4180.0], [74.5, 4198.0], [74.6, 4202.0], [74.7, 4223.0], [74.8, 4250.0], [74.9, 4301.0], [75.0, 4318.0], [75.1, 4370.0], [75.2, 4404.0], [75.3, 4488.0], [75.4, 4521.0], [75.5, 4563.0], [75.6, 4574.0], [75.7, 4626.0], [75.8, 4662.0], [75.9, 4665.0], [76.0, 4754.0], [76.1, 4793.0], [76.2, 4839.0], [76.3, 4870.0], [76.4, 4878.0], [76.5, 5039.0], [76.6, 5189.0], [76.7, 5228.0], [76.8, 5244.0], [76.9, 5285.0], [77.0, 5290.0], [77.1, 5350.0], [77.2, 5366.0], [77.3, 5434.0], [77.4, 5455.0], [77.5, 5495.0], [77.6, 5501.0], [77.7, 5519.0], [77.8, 5547.0], [77.9, 5581.0], [78.0, 5603.0], [78.1, 5615.0], [78.2, 5670.0], [78.3, 5690.0], [78.4, 5701.0], [78.5, 5721.0], [78.6, 5768.0], [78.7, 5812.0], [78.8, 5824.0], [78.9, 5894.0], [79.0, 5926.0], [79.1, 5951.0], [79.2, 6046.0], [79.3, 6090.0], [79.4, 6157.0], [79.5, 6175.0], [79.6, 6217.0], [79.7, 6269.0], [79.8, 6296.0], [79.9, 6378.0], [80.0, 6429.0], [80.1, 6569.0], [80.2, 6616.0], [80.3, 6793.0], [80.4, 6803.0], [80.5, 6853.0], [80.6, 6885.0], [80.7, 6900.0], [80.8, 6903.0], [80.9, 6929.0], [81.0, 6959.0], [81.1, 6998.0], [81.2, 7004.0], [81.3, 7036.0], [81.4, 7124.0], [81.5, 7131.0], [81.6, 7146.0], [81.7, 7162.0], [81.8, 7166.0], [81.9, 7216.0], [82.0, 7242.0], [82.1, 7263.0], [82.2, 7309.0], [82.3, 7313.0], [82.4, 7346.0], [82.5, 7414.0], [82.6, 7531.0], [82.7, 7580.0], [82.8, 7750.0], [82.9, 7817.0], [83.0, 7914.0], [83.1, 7959.0], [83.2, 8102.0], [83.3, 8155.0], [83.4, 8169.0], [83.5, 8212.0], [83.6, 8359.0], [83.7, 8380.0], [83.8, 8461.0], [83.9, 8516.0], [84.0, 8647.0], [84.1, 8706.0], [84.2, 8734.0], [84.3, 8774.0], [84.4, 8788.0], [84.5, 8823.0], [84.6, 8866.0], [84.7, 8939.0], [84.8, 8998.0], [84.9, 9047.0], [85.0, 9087.0], [85.1, 9097.0], [85.2, 9178.0], [85.3, 9206.0], [85.4, 9287.0], [85.5, 9334.0], [85.6, 9371.0], [85.7, 9435.0], [85.8, 9481.0], [85.9, 9596.0], [86.0, 9659.0], [86.1, 9689.0], [86.2, 9808.0], [86.3, 9915.0], [86.4, 9953.0], [86.5, 10019.0], [86.6, 10026.0], [86.7, 10074.0], [86.8, 10120.0], [86.9, 10174.0], [87.0, 10198.0], [87.1, 10221.0], [87.2, 10265.0], [87.3, 10306.0], [87.4, 10319.0], [87.5, 10350.0], [87.6, 10409.0], [87.7, 10483.0], [87.8, 10503.0], [87.9, 10523.0], [88.0, 10569.0], [88.1, 10595.0], [88.2, 10659.0], [88.3, 10730.0], [88.4, 10765.0], [88.5, 10777.0], [88.6, 10797.0], [88.7, 10857.0], [88.8, 10871.0], [88.9, 10969.0], [89.0, 11024.0], [89.1, 11211.0], [89.2, 11234.0], [89.3, 11292.0], [89.4, 11339.0], [89.5, 11420.0], [89.6, 11445.0], [89.7, 11685.0], [89.8, 11691.0], [89.9, 11738.0], [90.0, 11774.0], [90.1, 11839.0], [90.2, 12013.0], [90.3, 12137.0], [90.4, 12232.0], [90.5, 12251.0], [90.6, 12300.0], [90.7, 12388.0], [90.8, 12440.0], [90.9, 12449.0], [91.0, 12511.0], [91.1, 12594.0], [91.2, 12617.0], [91.3, 12730.0], [91.4, 12815.0], [91.5, 12901.0], [91.6, 12951.0], [91.7, 12973.0], [91.8, 13026.0], [91.9, 13126.0], [92.0, 13176.0], [92.1, 13245.0], [92.2, 13496.0], [92.3, 13522.0], [92.4, 13670.0], [92.5, 13675.0], [92.6, 13753.0], [92.7, 13837.0], [92.8, 13842.0], [92.9, 13916.0], [93.0, 14095.0], [93.1, 14168.0], [93.2, 14400.0], [93.3, 14490.0], [93.4, 14648.0], [93.5, 14747.0], [93.6, 14869.0], [93.7, 14947.0], [93.8, 15098.0], [93.9, 15136.0], [94.0, 15274.0], [94.1, 15298.0], [94.2, 15343.0], [94.3, 15543.0], [94.4, 15592.0], [94.5, 15627.0], [94.6, 15683.0], [94.7, 15745.0], [94.8, 15776.0], [94.9, 15992.0], [95.0, 16074.0], [95.1, 16140.0], [95.2, 16156.0], [95.3, 16186.0], [95.4, 16210.0], [95.5, 16240.0], [95.6, 16268.0], [95.7, 16338.0], [95.8, 16405.0], [95.9, 16524.0], [96.0, 16537.0], [96.1, 16607.0], [96.2, 16643.0], [96.3, 16682.0], [96.4, 16742.0], [96.5, 16848.0], [96.6, 16916.0], [96.7, 16951.0], [96.8, 16984.0], [96.9, 17008.0], [97.0, 17153.0], [97.1, 17177.0], [97.2, 17243.0], [97.3, 17274.0], [97.4, 17357.0], [97.5, 17447.0], [97.6, 17497.0], [97.7, 17538.0], [97.8, 17577.0], [97.9, 17593.0], [98.0, 17609.0], [98.1, 17710.0], [98.2, 17872.0], [98.3, 18530.0], [98.4, 18761.0], [98.5, 18918.0], [98.6, 19124.0], [98.7, 19239.0], [98.8, 19543.0], [98.9, 21628.0], [99.0, 21970.0], [99.1, 22421.0], [99.2, 23157.0], [99.3, 24356.0], [99.4, 31428.0], [99.5, 60183.0], [99.6, 60186.0], [99.7, 60191.0], [99.8, 60202.0], [99.9, 60934.0], [100.0, 66264.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Response Time Percentiles"}},
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
        data: {"result": {"minY": 1.0, "minX": 0.0, "maxY": 351.0, "series": [{"data": [[0.0, 351.0], [100.0, 180.0], [200.0, 205.0], [60900.0, 2.0], [60500.0, 1.0], [60100.0, 8.0], [300.0, 129.0], [400.0, 54.0], [500.0, 31.0], [600.0, 31.0], [700.0, 17.0], [800.0, 30.0], [900.0, 31.0], [1000.0, 47.0], [1100.0, 40.0], [1200.0, 35.0], [1300.0, 45.0], [1400.0, 26.0], [1500.0, 43.0], [1600.0, 50.0], [1700.0, 55.0], [1800.0, 53.0], [1900.0, 46.0], [2000.0, 47.0], [2100.0, 33.0], [2200.0, 35.0], [2300.0, 22.0], [2400.0, 41.0], [2500.0, 24.0], [2600.0, 15.0], [2800.0, 25.0], [2700.0, 14.0], [2900.0, 19.0], [3000.0, 26.0], [3100.0, 18.0], [3300.0, 11.0], [3200.0, 23.0], [3400.0, 14.0], [3500.0, 16.0], [3600.0, 10.0], [3700.0, 13.0], [3800.0, 8.0], [3900.0, 13.0], [4000.0, 11.0], [4300.0, 8.0], [4100.0, 22.0], [4200.0, 9.0], [4600.0, 7.0], [4500.0, 10.0], [4400.0, 3.0], [4800.0, 9.0], [4700.0, 4.0], [5000.0, 2.0], [5100.0, 2.0], [4900.0, 1.0], [5200.0, 10.0], [5300.0, 7.0], [5600.0, 11.0], [5400.0, 8.0], [5500.0, 10.0], [5800.0, 6.0], [5700.0, 8.0], [6100.0, 5.0], [6000.0, 5.0], [5900.0, 6.0], [6300.0, 4.0], [6200.0, 8.0], [6500.0, 3.0], [6400.0, 2.0], [6600.0, 3.0], [6900.0, 12.0], [6800.0, 8.0], [6700.0, 2.0], [7000.0, 7.0], [7100.0, 13.0], [7200.0, 7.0], [7400.0, 3.0], [7300.0, 8.0], [7500.0, 4.0], [7800.0, 4.0], [7900.0, 3.0], [7700.0, 3.0], [8100.0, 7.0], [8000.0, 2.0], [8400.0, 3.0], [8200.0, 3.0], [8300.0, 5.0], [8600.0, 4.0], [8700.0, 9.0], [8500.0, 2.0], [8800.0, 5.0], [9000.0, 8.0], [9200.0, 4.0], [9100.0, 4.0], [8900.0, 5.0], [9300.0, 6.0], [9600.0, 5.0], [9500.0, 3.0], [9400.0, 4.0], [9700.0, 2.0], [9900.0, 5.0], [10200.0, 7.0], [10100.0, 7.0], [10000.0, 8.0], [9800.0, 2.0], [10400.0, 5.0], [10300.0, 8.0], [10700.0, 10.0], [10500.0, 9.0], [10600.0, 3.0], [10900.0, 2.0], [11000.0, 2.0], [11200.0, 7.0], [10800.0, 7.0], [11700.0, 5.0], [11300.0, 5.0], [11400.0, 3.0], [11600.0, 6.0], [11900.0, 2.0], [11800.0, 2.0], [12100.0, 3.0], [12000.0, 2.0], [12200.0, 5.0], [12300.0, 4.0], [12700.0, 2.0], [12400.0, 7.0], [12600.0, 4.0], [12500.0, 4.0], [13000.0, 2.0], [12900.0, 7.0], [13100.0, 5.0], [12800.0, 3.0], [13200.0, 4.0], [13400.0, 2.0], [13800.0, 5.0], [13600.0, 6.0], [13700.0, 3.0], [13500.0, 2.0], [14100.0, 2.0], [14000.0, 3.0], [13900.0, 2.0], [14200.0, 2.0], [14800.0, 2.0], [14600.0, 2.0], [14500.0, 2.0], [14400.0, 3.0], [14700.0, 2.0], [15100.0, 3.0], [15000.0, 2.0], [14900.0, 4.0], [15200.0, 4.0], [15300.0, 4.0], [15600.0, 6.0], [15700.0, 5.0], [15400.0, 1.0], [15800.0, 1.0], [15500.0, 3.0], [16000.0, 3.0], [16200.0, 8.0], [15900.0, 2.0], [16100.0, 8.0], [16300.0, 3.0], [16600.0, 8.0], [16400.0, 3.0], [17400.0, 4.0], [17000.0, 3.0], [16800.0, 3.0], [17200.0, 5.0], [18000.0, 1.0], [17800.0, 2.0], [17600.0, 5.0], [18400.0, 1.0], [19000.0, 2.0], [18600.0, 1.0], [18800.0, 2.0], [19200.0, 2.0], [19600.0, 1.0], [22400.0, 1.0], [21800.0, 1.0], [21600.0, 1.0], [23000.0, 1.0], [24400.0, 1.0], [24200.0, 1.0], [23600.0, 1.0], [31400.0, 1.0], [40000.0, 1.0], [66200.0, 1.0], [17100.0, 5.0], [16500.0, 4.0], [16900.0, 7.0], [16700.0, 3.0], [17300.0, 3.0], [17700.0, 1.0], [17500.0, 8.0], [18500.0, 1.0], [18900.0, 1.0], [18700.0, 1.0], [19100.0, 1.0], [19300.0, 2.0], [19900.0, 1.0], [19500.0, 1.0], [21900.0, 2.0], [22100.0, 1.0], [23100.0, 1.0], [24300.0, 1.0], [31300.0, 1.0], [60200.0, 1.0], [60600.0, 1.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 100, "maxX": 66200.0, "title": "Response Time Distribution"}},
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
        data: {"result": {"minY": 2.0, "minX": 1.0, "ticks": [[0, "Requests having \nresponse time <= 500ms"], [1, "Requests having \nresponse time > 500ms and <= 1,500ms"], [2, "Requests having \nresponse time > 1,500ms"], [3, "Requests in error"]], "maxY": 2449.0, "series": [{"data": [[1.0, 2.0]], "isOverall": false, "label": "Requests having \nresponse time > 500ms and <= 1,500ms", "isController": false}, {"data": [[3.0, 2449.0]], "isOverall": false, "label": "Requests in error", "isController": false}, {"data": [[2.0, 177.0]], "isOverall": false, "label": "Requests having \nresponse time > 1,500ms", "isController": false}], "supportsControllersDiscrimination": false, "maxX": 3.0, "title": "Synthetic Response Times Distribution"}},
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
        data: {"result": {"minY": 16.0, "minX": 1.52509962E12, "maxY": 98.1335012594458, "series": [{"data": [[1.52509974E12, 96.55112044817922], [1.52509968E12, 98.1335012594458], [1.52509962E12, 16.0]], "isOverall": false, "label": "Digisoria Customer 1", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52509974E12, "title": "Active Threads Over Time"}},
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
        data: {"result": {"minY": 1165.25, "minX": 1.0, "maxY": 40050.0, "series": [{"data": [[2.0, 17227.0], [3.0, 7162.0], [4.0, 12460.0], [5.0, 17274.0], [6.0, 6387.0], [7.0, 15618.0], [8.0, 12447.0], [9.0, 17604.0], [10.0, 12930.0], [11.0, 12901.0], [12.0, 2140.0], [14.0, 12983.333333333334], [15.0, 3289.0], [16.0, 7343.0], [17.0, 4348.5], [18.0, 6878.333333333333], [19.0, 31354.0], [20.0, 4451.5], [21.0, 16928.0], [22.0, 17558.0], [23.0, 17538.0], [24.0, 2397.0], [25.0, 2022.0], [26.0, 14013.0], [27.0, 12402.0], [28.0, 15314.0], [29.0, 5285.0], [31.0, 10995.5], [33.0, 16252.0], [32.0, 17593.0], [35.0, 9253.0], [37.0, 9580.2], [38.0, 10923.5], [39.0, 17538.0], [40.0, 9290.0], [41.0, 17153.0], [43.0, 15298.0], [42.0, 16101.0], [45.0, 5789.0], [44.0, 12232.0], [47.0, 15683.0], [46.0, 17600.0], [49.0, 17609.0], [48.0, 17243.0], [50.0, 11905.5], [51.0, 16662.0], [53.0, 16916.0], [52.0, 40050.0], [54.0, 15581.0], [56.0, 10080.25], [57.0, 6210.666666666666], [59.0, 10524.5], [58.0, 17191.0], [60.0, 10538.25], [61.0, 8502.0], [62.0, 17249.0], [67.0, 16927.5], [65.0, 16423.0], [70.0, 13807.0], [71.0, 11861.333333333334], [72.0, 8611.0], [75.0, 14386.5], [73.0, 16757.0], [78.0, 10839.0], [79.0, 6799.333333333333], [77.0, 12635.0], [80.0, 9668.25], [81.0, 13067.5], [82.0, 10913.333333333332], [83.0, 11019.42857142857], [86.0, 2013.0], [85.0, 12137.0], [88.0, 9347.0], [89.0, 8962.0], [90.0, 2900.9642857142853], [91.0, 5350.846153846154], [92.0, 10368.0], [93.0, 3771.235294117647], [94.0, 1165.25], [95.0, 4574.0], [96.0, 6473.0], [97.0, 3824.0], [98.0, 2206.0952380952376], [99.0, 1866.6190476190475], [100.0, 3471.853606487413], [1.0, 17155.0]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}, {"data": [[96.99238964992388, 3885.8306697108037]], "isOverall": false, "label": "Digisoria Shopfront 132-Aggregated", "isController": false}], "supportsControllersDiscrimination": true, "maxX": 100.0, "title": "Time VS Threads"}},
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
        data : {"result": {"minY": 149.75, "minX": 1.52509962E12, "maxY": 62568.8, "series": [{"data": [[1.52509974E12, 44129.11666666667], [1.52509968E12, 62568.8], [1.52509962E12, 1993.4666666666667]], "isOverall": false, "label": "Bytes received per second", "isController": false}, {"data": [[1.52509974E12, 12410.033333333333], [1.52509968E12, 14635.033333333333], [1.52509962E12, 149.75]], "isOverall": false, "label": "Bytes sent per second", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52509974E12, "title": "Bytes Throughput Over Time"}},
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
        data: {"result": {"minY": 2206.1111111111113, "minX": 1.52509962E12, "maxY": 3948.9817927170916, "series": [{"data": [[1.52509974E12, 3948.9817927170916], [1.52509968E12, 3822.806045340051], [1.52509962E12, 2206.1111111111113]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52509974E12, "title": "Response Time Over Time"}},
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
        data: {"result": {"minY": 391.5555555555556, "minX": 1.52509962E12, "maxY": 624.6120448179281, "series": [{"data": [[1.52509974E12, 624.6120448179281], [1.52509968E12, 393.00251889168777], [1.52509962E12, 391.5555555555556]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52509974E12, "title": "Latencies Over Time"}},
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
        data: {"result": {"minY": 37.028011204481786, "minX": 1.52509962E12, "maxY": 342.1111111111111, "series": [{"data": [[1.52509974E12, 37.028011204481786], [1.52509968E12, 58.267842149454324], [1.52509962E12, 342.1111111111111]], "isOverall": false, "label": "Digisoria Shopfront 132", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52509974E12, "title": "Connect Time Over Time"}},
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
        data: {"result": {"minY": 1226.0, "minX": 1.52509962E12, "maxY": 24418.0, "series": [{"data": [[1.52509974E12, 24418.0], [1.52509968E12, 21970.0], [1.52509962E12, 3027.0]], "isOverall": false, "label": "Max", "isController": false}, {"data": [[1.52509974E12, 5365.0], [1.52509968E12, 2669.0], [1.52509962E12, 1226.0]], "isOverall": false, "label": "Min", "isController": false}, {"data": [[1.52509974E12, 19096.0], [1.52509968E12, 16697.0], [1.52509962E12, 3027.0]], "isOverall": false, "label": "90th percentile", "isController": false}, {"data": [[1.52509974E12, 24368.399999999998], [1.52509968E12, 21155.19999999999], [1.52509962E12, 3027.0]], "isOverall": false, "label": "99th percentile", "isController": false}, {"data": [[1.52509974E12, 21628.0], [1.52509968E12, 17710.0], [1.52509962E12, 3027.0]], "isOverall": false, "label": "95th percentile", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52509974E12, "title": "Response Time Percentiles Over Time (successful requests only)"}},
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
    data: {"result": {"minY": 992.0, "minX": 0.0, "maxY": 18719.0, "series": [{"data": [[0.0, 2410.0], [19.0, 12128.5], [23.0, 18719.0]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[19.0, 1794.0], [23.0, 992.0]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 23.0, "title": "Response Time Vs Request"}},
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
    data: {"result": {"minY": 204.0, "minX": 0.0, "maxY": 1562.5, "series": [{"data": [[0.0, 238.0], [19.0, 362.5], [23.0, 1562.5]], "isOverall": false, "label": "Successes", "isController": false}, {"data": [[19.0, 204.0], [23.0, 266.5]], "isOverall": false, "label": "Failures", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 23.0, "title": "Latencies Vs Request"}},
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
        data: {"result": {"minY": 0.4666666666666667, "minX": 1.52509962E12, "maxY": 22.133333333333333, "series": [{"data": [[1.52509974E12, 22.133333333333333], [1.52509968E12, 21.2], [1.52509962E12, 0.4666666666666667]], "isOverall": false, "label": "hitsPerSecond", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52509974E12, "title": "Hits Per Second"}},
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
        data: {"result": {"minY": 0.06666666666666667, "minX": 1.52509962E12, "maxY": 13.55, "series": [{"data": [[1.52509974E12, 0.6666666666666666], [1.52509968E12, 2.1666666666666665], [1.52509962E12, 0.15]], "isOverall": false, "label": "200", "isController": false}, {"data": [[1.52509974E12, 7.7], [1.52509968E12, 10.366666666666667]], "isOverall": false, "label": "500", "isController": false}, {"data": [[1.52509974E12, 13.55], [1.52509968E12, 7.25]], "isOverall": false, "label": "403", "isController": false}, {"data": [[1.52509968E12, 0.06666666666666667]], "isOverall": false, "label": "502", "isController": false}, {"data": [[1.52509974E12, 0.21666666666666667]], "isOverall": false, "label": "504", "isController": false}, {"data": [[1.52509974E12, 1.6666666666666667]], "isOverall": false, "label": "Non HTTP response code: java.net.SocketException", "isController": false}], "supportsControllersDiscrimination": false, "granularity": 60000, "maxX": 1.52509974E12, "title": "Codes Per Second"}},
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
        data: {"result": {"minY": 0.15, "minX": 1.52509962E12, "maxY": 23.133333333333333, "series": [{"data": [[1.52509974E12, 0.6666666666666666], [1.52509968E12, 2.1666666666666665], [1.52509962E12, 0.15]], "isOverall": false, "label": "Digisoria Shopfront 132-success", "isController": false}, {"data": [[1.52509974E12, 23.133333333333333], [1.52509968E12, 17.683333333333334]], "isOverall": false, "label": "Digisoria Shopfront 132-failure", "isController": false}], "supportsControllersDiscrimination": true, "granularity": 60000, "maxX": 1.52509974E12, "title": "Transactions Per Second"}},
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
